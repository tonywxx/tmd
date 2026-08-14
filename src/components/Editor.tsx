import { useEffect, useRef } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, gutter, GutterMarker, drawSelection } from "@codemirror/view";
import { EditorState, Compartment, StateField, StateEffect, Extension, EditorSelection } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from "@codemirror/language";
import { useStore } from "../lib/store";
import { applyFormatting } from "../lib/formatActions";
import { computeChangedLines } from "../lib/changedLines";
import { editorStatesRef, gitBaselineRef, autoSaveTimers, type SelectionInfo } from "../lib/refs";
import { setActiveEditorPort, getActiveEditorPort, type EditorPort } from "../lib/editorPort";
import { scrollSync } from "../lib/scrollSync";
import { persistTab } from "../lib/persist";
import type { Settings } from "../lib/types";

class ChangedMarker extends GutterMarker {
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-changed-marker";
    s.textContent = "●";
    return s;
  }
}
const changedMarker = new ChangedMarker();

// Forces the changed-lines gutter to recompute after the git baseline for the
// active file resolves asynchronously (the baseline lives in gitBaselineRef).
const setBaselineEffect = StateEffect.define<string | null>();

function buildChangedGutter(getBaseline: () => string | null) {
  const field = StateField.define<Set<number>>({
    create: (state) => computeChangedLines(state.doc.toString(), getBaseline()),
    update: (set, tr) => {
      if (tr.docChanged) {
        return computeChangedLines(tr.state.doc.toString(), getBaseline());
      }
      for (const e of tr.effects) {
        if (e.is(setBaselineEffect)) {
          return computeChangedLines(tr.state.doc.toString(), getBaseline());
        }
      }
      return set;
    },
  });
  const g = gutter({
    class: "cm-changedGutter",
    lineMarker: (view, line) => {
      const s = view.state.field(field, false);
      if (s && s.has(line.from)) return changedMarker;
      return null;
    },
    initialSpacer: () => changedMarker,
  });
  return [field, g] as Extension[];
}

function themeExtension(settings: Settings): Extension {
  const isDark =
    settings.theme === "dark" ||
    (settings.theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const font =
    settings.fontFamily === "default"
      ? "ui-monospace, SFMono-Regular, Menlo, monospace"
      : settings.fontFamily;
  return EditorView.theme(
    {
      "&": {
        fontSize: `${settings.fontSize}px`,
        backgroundColor: "transparent",
        color: isDark ? "#d4d7de" : "#1d1f24",
        height: "100%",
      },
      ".cm-content": {
        fontFamily: font,
        caretColor: "var(--accent)",
        padding: "16px 0",
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        border: "none",
        color: isDark ? "#5b6270" : "#a0a4ad",
      },
      ".cm-activeLine": {
        backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: "var(--accent)",
      },
      ".cm-changedGutter": {
        width: "12px",
      },
      ".cm-changed-marker": {
        color: "var(--accent)",
        fontSize: "8px",
      },
      ".cm-scroller": {
        fontFamily: font,
        lineHeight: "1.6",
      },
    },
    { dark: isDark },
  );
}

const lineNumbersComp = new Compartment();
const themeComp = new Compartment();

export default function Editor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const activeTabId = useStore((s) => s.activeTabId);
  const tabs = useStore((s) => s.tabs);
  const settings = useStore((s) => s.settings);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // (Re)build editor when the active tab changes.
  useEffect(() => {
    if (!containerRef.current) return;
    if (!activeTab) {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
      setActiveEditorPort(null);
      return;
    }
    const tabId = activeTab.id;

    const getBaseline = () => gitBaselineRef.get(tabId) ?? null;
    const startState = editorStatesRef.get(tabId) ?? (() => {
      const st = EditorState.create({
        doc: activeTab.content,
        extensions: buildExtensions(settings, getBaseline, tabId),
      });
      editorStatesRef.set(tabId, st);
      return st;
    })();

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    });
    viewRef.current = view;
    scrollSync.registerEditor(view.scrollDOM);

    const ro = new ResizeObserver(() => view.requestMeasure());
    ro.observe(containerRef.current);

    // Register the imperative, tab-aware port for menu / toolbar / commands.
    const port: EditorPort = {
      tabId,
      applyFormatting: (action) => applyFormatting(view, action),
      getSelection: (): SelectionInfo => {
        const { from, to } = view.state.selection.main;
        const text = view.state.sliceDoc(from, to);
        const lineFrom = view.state.doc.lineAt(from).number;
        const lineTo = view.state.doc.lineAt(to).number;
        return {
          text,
          hasSelection: from !== to,
          startLine: lineFrom,
          endLine: lineTo,
        };
      },
      focus: () => view.focus(),
      undo: () => undo(view),
      redo: () => redo(view),
      selectAll: () => view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) }),
      copySelection: () => {
        const { text } = port.getSelection();
        if (text) void navigator.clipboard.writeText(text);
      },
      cutSelection: () => {
        const { text } = port.getSelection();
        if (text) {
          void navigator.clipboard.writeText(text);
          view.dispatch(view.state.replaceSelection(""));
        }
      },
      paste: (text) => view.dispatch(view.state.replaceSelection(text)),
      navigateToLine: (line) => {
        const lineNo = Math.max(1, line);
        try {
          const l = view.state.doc.line(Math.min(lineNo, view.state.doc.lines));
          view.dispatch({
            selection: EditorSelection.cursor(l.from),
            scrollIntoView: true,
          });
          view.focus();
        } catch {
          /* out of range */
        }
      },
      updateGitMarkers: () => {
        view.dispatch({ effects: setBaselineEffect.of(null) });
      },
      replaceContent: (content: string) => {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: content },
        });
      },
    };
    setActiveEditorPort(port);

    return () => {
      // Destroy this view on tab switch / unmount; the EditorState persists in
      // editorStatesRef so per-tab history/undo is preserved.
      view.destroy();
      scrollSync.unregisterEditor();
      ro.disconnect();
      if (viewRef.current === view) {
        viewRef.current = null;
      }
      if (getActiveEditorPort() === port) setActiveEditorPort(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  // Reconfigure theme / line numbers when settings change.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        themeComp.reconfigure(themeExtension(settings)),
        lineNumbersComp.reconfigure(settings.showLineNumbers ? lineNumbers() : []),
      ],
    });
  }, [settings.theme, settings.fontSize, settings.fontFamily, settings.showLineNumbers]);

  if (!activeTab) {
    return (
      <div className="editor-empty">
        <div className="editor-empty-inner">
          <h2>tmd</h2>
          <p>Open a file or create a new one to start writing.</p>
        </div>
      </div>
    );
  }

  return <div className="editor-host" ref={containerRef} />;
}

function buildExtensions(
  settings: Settings,
  getBaseline: () => string | null,
  tabId: number,
): Extension[] {
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const content = update.state.doc.toString();
      const store = useStore.getState();
      const id = tabId;
      store.updateTabContent(id, content);
      // Keep the per-tab EditorState ref current so switching tabs restores
      // the latest document (and its undo history), not the first-built one.
      editorStatesRef.set(id, update.state);
      // autosave
      const s = store.settings;
      if (s.autoSave) {
        if (autoSaveTimers.has(id)) clearTimeout(autoSaveTimers.get(id));
        const delay = s.autoSaveDelay;
        autoSaveTimers.set(
          id,
          setTimeout(() => {
            void persistTab(id, content);
          }, delay),
        );
      }
    }
  });

  return [
    lineNumbersComp.of(settings.showLineNumbers ? lineNumbers() : []),
    history(),
    drawSelection(),
    highlightActiveLine(),
    bracketMatching(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    themeComp.of(themeExtension(settings)),
    updateListener,
    ...buildChangedGutter(getBaseline),
  ];
}
