import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
	redo,
	undo,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
	bracketMatching,
	HighlightStyle,
	LanguageDescription,
	syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { languages } from "@codemirror/language-data";
import type { Extension } from "@codemirror/state";
import {
	Compartment,
	EditorSelection,
	EditorState,
	Prec,
	StateEffect,
	StateField,
} from "@codemirror/state";
import {
	drawSelection,
	EditorView,
	GutterMarker,
	gutter,
	highlightActiveLine,
	keymap,
	lineNumbers,
} from "@codemirror/view";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { useEffect, useRef } from "react";
import { computeChangedLines } from "../lib/changedLines";
import {
	claimClipboardOp,
	type EditorPort,
	getActiveEditorPort,
	setActiveEditorPort,
} from "../lib/editorPort";
import { applyFormatting } from "../lib/formatActions";
import { isMarkdown } from "../lib/constants";
import { basename } from "../lib/pathutil";
import { persistTab } from "../lib/persist";
import {
	autoSaveTimers,
	editorStatesRef,
	gitBaselineRef,
	type SelectionInfo,
} from "../lib/refs";
import { scrollSync } from "../lib/scrollSync";
import { useStore } from "../lib/store";
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
			if (s?.has(line.from)) return changedMarker;
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
	// Surfaces read the --md-* palette of the selected markdown theme (the editor
	// host carries the matching .theme-* class), so the editor and preview share
	// one palette. Themes without their own palette (github, academic, minimal,
	// typewriter) fall back to the app chrome variables. The caret and the
	// changed-line marker stay on the app accent: some palettes (Dracula Light,
	// Ayu Light) have an --md-accent too pale to read as a cursor.
	return EditorView.theme(
		{
			"&": {
				fontSize: `${settings.fontSize}px`,
				backgroundColor: "var(--md-bg, var(--bg))",
				color: "var(--md-text, var(--text))",
				height: "100%",
			},
			".cm-content": {
				fontFamily: font,
				caretColor: "var(--accent)",
				padding: "16px 0",
			},
			".cm-gutters": {
				// A touch darker than the surface regardless of palette polarity.
				backgroundColor:
					"color-mix(in srgb, var(--md-bg, var(--bg)) 94%, #000)",
				border: "none",
				borderRight: "1px solid var(--md-border, var(--border))",
				color: "color-mix(in srgb, var(--md-text, var(--text)) 45%, transparent)",
			},
			".cm-activeLine": {
				backgroundColor:
					"color-mix(in srgb, var(--md-text, var(--text)) 6%, transparent)",
			},
			".cm-activeLineGutter": {
				backgroundColor:
					"color-mix(in srgb, var(--md-text, var(--text)) 9%, transparent)",
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

// CodeMirror's defaultHighlightStyle hardcodes light-theme token colors (URLs
// and link labels #219, keywords #708, strings #a11…) which are unreadable on
// the dark surface, so the editor ships its own palette. Every color resolves a
// --sy-* variable (see index.css) so it flips with light/dark for free. Rules
// later in the list win over earlier ones for a token carrying both tags.
const editorHighlightStyle = HighlightStyle.define([
	// URLs and link labels first: the rules below re-dim the punctuation around
	// them ([, ], (, )), which carries processingInstruction as well.
	{
		tag: [tags.url, tags.link, tags.labelName],
		color: "var(--sy-link)",
	},
	{
		tag: [tags.meta, tags.processingInstruction, tags.contentSeparator],
		color: "var(--sy-mark)",
	},
	{
		tag: [
			tags.comment,
			tags.lineComment,
			tags.blockComment,
			tags.docComment,
		],
		color: "var(--sy-comment)",
		fontStyle: "italic",
	},
	{ tag: tags.quote, color: "var(--sy-comment)" },
	{
		tag: [
			tags.keyword,
			tags.modifier,
			tags.controlKeyword,
			tags.operatorKeyword,
			tags.definitionKeyword,
			tags.moduleKeyword,
		],
		color: "var(--sy-keyword)",
	},
	{
		tag: [
			tags.string,
			tags.docString,
			tags.character,
			tags.attributeValue,
			tags.escape,
			tags.regexp,
			tags.special(tags.string),
		],
		color: "var(--sy-string)",
	},
	{
		tag: [
			tags.number,
			tags.integer,
			tags.float,
			tags.bool,
			tags.null,
			tags.atom,
			tags.unit,
			tags.constant(tags.variableName),
		],
		color: "var(--sy-number)",
	},
	{
		tag: [
			tags.function(tags.variableName),
			tags.function(tags.propertyName),
			tags.macroName,
		],
		color: "var(--sy-function)",
	},
	{
		tag: [
			tags.typeName,
			tags.className,
			tags.namespace,
			tags.standard(tags.variableName),
		],
		color: "var(--sy-type)",
	},
	{ tag: tags.heading, fontWeight: "600" },
	{ tag: tags.strong, fontWeight: "600" },
	{ tag: tags.emphasis, fontStyle: "italic" },
	{ tag: tags.strikethrough, textDecoration: "line-through" },
	{ tag: tags.invalid, color: "var(--sy-invalid)" },
]);

const lineNumbersComp = new Compartment();
const themeComp = new Compartment();
// Swapped per tab: markdown ships in the bundle, other openable types resolve
// their parser by filename from @codemirror/language-data and load on demand.
const languageComp = new Compartment();

export default function Editor() {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const activeTabId = useStore((s) => s.activeTabId);
	const tabs = useStore((s) => s.tabs);
	const settings = useStore((s) => s.settings);

	const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
	const filePath = activeTab?.filePath ?? null;

	// (Re)build editor when the active tab changes. Deliberately keyed on the tab
	// id alone: `activeTab` is a fresh object on every keystroke, so depending on
	// it destroyed and recreated the view while typing, which drops the caret out
	// of the document (the old DOM is gone) and leaves the editor unfocusable.
	useEffect(() => {
		const tab = useStore.getState().getActiveTab();
		if (!tab) {
			if (viewRef.current) {
				viewRef.current.destroy();
				viewRef.current = null;
			}
			setActiveEditorPort(null);
			return;
		}
		if (!containerRef.current) return;
		const tabId = tab.id;
		const st = useStore.getState().settings;

		const getBaseline = () => gitBaselineRef.get(tabId) ?? null;
		const startState =
			editorStatesRef.get(tabId) ??
			(() => {
				const created = EditorState.create({
					doc: tab.content,
					extensions: buildExtensions(
						st,
						getBaseline,
						tabId,
						tab.filePath,
					),
				});
				editorStatesRef.set(tabId, created);
				return created;
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
			selectAll: () =>
				view.dispatch({
					selection: EditorSelection.range(0, view.state.doc.length),
				}),
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
	}, [activeTabId]);

	// Language follows the tab's filename: markdown uses the bundled mode, other
	// openable types (JSON, TOML, YAML) resolve a parser from language-data and
	// load it on demand. Reconfigured in place (not rebuilt) so a first save or
	// Save As — which assigns/changes `filePath` — keeps the document and caret.
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		let cancelled = false;
		const apply = (ext: Extension) => {
			if (!cancelled && viewRef.current === view) {
				view.dispatch({ effects: languageComp.reconfigure(ext) });
			}
		};
		if (!filePath || isMarkdown(filePath)) {
			apply(markdown({ base: markdownLanguage, codeLanguages: languages }));
			return;
		}
		const desc = LanguageDescription.matchFilename(languages, basename(filePath));
		if (!desc) {
			apply([]);
			return;
		}
		void desc
			.load()
			.then((support) => apply(support))
			.catch(() => {
				/* no parser for this type — plain text is fine */
			});
		return () => {
			cancelled = true;
		};
	}, [filePath, activeTabId]);

	// Reconfigure theme / line numbers when settings change.
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: [
				themeComp.reconfigure(themeExtension(settings)),
				lineNumbersComp.reconfigure(
					settings.showLineNumbers ? lineNumbers() : [],
				),
			],
		});
	}, [settings]);

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

	// The .theme-* class resolves the markdown palette's --md-* variables here,
	// which the CodeMirror theme above reads.
	return (
		<div
			className={"editor-host theme-" + settings.markdownTheme}
			ref={containerRef}
		/>
	);
}

// Intercepts copy/cut/paste at the highest precedence so CodeMirror's own
// native handler never also fires. This is what prevents a single paste from
// being inserted twice (once by CodeMirror, once by the menu command). Each
// handler claims the operation via claimClipboardOp so that if the menu
// command also runs for the same gesture it bails out instead of duplicating.
const clipboardHandlers = Prec.highest(
	EditorView.domEventHandlers({
		copy: (event) => {
			event.preventDefault();
			if (claimClipboardOp()) getActiveEditorPort()?.copySelection();
			return true;
		},
		cut: (event) => {
			event.preventDefault();
			if (claimClipboardOp()) getActiveEditorPort()?.cutSelection();
			return true;
		},
		paste: (event) => {
			event.preventDefault();
			if (claimClipboardOp()) {
				void (async () => {
					const text = await readText().catch(() => "");
					getActiveEditorPort()?.paste(text);
				})();
			}
			return true;
		},
	}),
);

function buildExtensions(
	settings: Settings,
	getBaseline: () => string | null,
	tabId: number,
	filePath: string | null,
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
		clipboardHandlers,
		lineNumbersComp.of(settings.showLineNumbers ? lineNumbers() : []),
		history(),
		drawSelection(),
		highlightActiveLine(),
		bracketMatching(),
		EditorView.lineWrapping,
		languageComp.of(
			// Untitled tabs and markdown files use the bundled mode; everything
			// else starts unhighlighted until its parser resolves.
			filePath && !isMarkdown(filePath)
				? []
				: markdown({ base: markdownLanguage, codeLanguages: languages }),
		),
		// Not a fallback: an unstyled token inherits the (readable) surface text
		// color, whereas defaultHighlightStyle would repaint it light-theme-only.
		syntaxHighlighting(editorHighlightStyle),
		keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
		themeComp.of(themeExtension(settings)),
		updateListener,
		...buildChangedGutter(getBaseline),
	];
}
