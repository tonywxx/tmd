import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import WorkspaceToolbar from "./components/WorkspaceToolbar";
import TabBar from "./components/TabBar";
import Editor from "./components/Editor";
import Preview from "./components/Preview";
import FileBrowser from "./components/FileBrowser";
import SettingsDialog from "./components/dialogs/SettingsDialog";
import AboutDialog from "./components/dialogs/AboutDialog";
import DiffView from "./components/dialogs/DiffView";
import FindInFolder from "./components/dialogs/FindInFolder";
import OpenPathModal from "./components/dialogs/OpenPathModal";
import OpenUrlModal from "./components/dialogs/OpenUrlModal";
import Toasts from "./components/dialogs/Toasts";
import { useStore } from "./lib/store";
import { api } from "./lib/bridge";
import { executeCommand } from "./lib/commands";
import { bootstrap } from "./lib/bootstrap";
import type { AccentColor } from "./lib/types";

const ACCENT_COLORS: Record<AccentColor, string> = {
  blue: "#3b82f6",
  purple: "#8b5cf6",
  pink: "#ec4899",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  green: "#22c55e",
};

// Minimum width for the editor and preview panes (px). The splitter clamps so
// neither pane can be dragged away entirely.
const MIN_PANE_PX = 120;

export default function App() {
  const settings = useStore((s) => s.settings);
  const focusMode = useStore((s) => s.focusMode);
  const viewMode = useStore((s) => s.viewMode);
  const activeTabId = useStore((s) => s.activeTabId);

  const tabs = useStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // Editor/preview split. `editorSplit` (settings) is persisted on drag end.
  const [editorPct, setEditorPct] = useState<number>(0.5);
  const editorPctRef = useRef(0.5);
  const splitDraggingRef = useRef(false);
  const workspaceRef = useRef<HTMLDivElement>(null);

  // Right-click menu shown outside the file browser. In debug builds Tauri's
  // webview shows a native "Inspect Element" / "Reload" menu; we suppress that
  // and offer only "Reload" instead.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const pct = settings.editorSplit ?? 0.5;
    editorPctRef.current = pct;
    setEditorPct(pct);
  }, [settings.editorSplit]);

  // ---- bootstrap: commands, settings/session, updates, events (lib/bootstrap.ts) ----
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void bootstrap().then((c) => {
      cleanup = c;
    });
    return () => {
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- replace the native webview context menu (debug builds only) ----
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // The file browser renders its own context menu for its rows.
      if (target && target.closest(".file-browser")) return;
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("contextmenu", handler);
    return () => window.removeEventListener("contextmenu", handler);
  }, []);

  // ---- apply theme + accent to :root ----
  useEffect(() => {
    const root = document.documentElement;
    const isDark =
      settings.theme === "dark" ||
      (settings.theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.setAttribute("data-theme", isDark ? "dark" : "light");
    root.style.setProperty("--accent", ACCENT_COLORS[settings.accentColor]);
  }, [settings.theme, settings.accentColor]);

  // ---- app-text zoom shortcuts: Cmd/Ctrl + "+"/"=" zoom in, "-" zoom out,
  // "0" resets. Handled at the window level (capture) so it works regardless
  // of focus, including inside the editor. The native menu accelerators are
  // intentionally left empty to avoid double-triggering the same command. ----
  useEffect(() => {
    const onZoomKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        void executeCommand("zoom-in");
      } else if (e.key === "-") {
        e.preventDefault();
        void executeCommand("zoom-out");
      } else if (e.key === "0") {
        e.preventDefault();
        void executeCommand("reset-zoom");
      }
    };
    window.addEventListener("keydown", onZoomKey, { capture: true });
    return () => window.removeEventListener("keydown", onZoomKey, { capture: true });
  }, []);

  function startSplitDrag(e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault();
    splitDraggingRef.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!splitDraggingRef.current || !workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = (ev.clientX - rect.left) / rect.width;
      const minPct = MIN_PANE_PX / rect.width;
      const maxPct = 1 - MIN_PANE_PX / rect.width;
      const next = Math.min(maxPct, Math.max(minPct, pct));
      editorPctRef.current = next;
      setEditorPct(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      splitDraggingRef.current = false;
      const s = useStore.getState().settings;
      if (Math.abs(s.editorSplit - editorPctRef.current) > 0.001) {
        void api.setSettings({ ...s, editorSplit: editorPctRef.current });
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const rootClass =
    "app-root" + (focusMode ? " focus-mode" : "") + (viewMode !== "code" ? " preview-on" : "");

  return (
    <div className={rootClass}>
      <div className="app-main">
        {!focusMode && <FileBrowser />}
        <div className="editor-pane">
          {!focusMode && <TabBar />}
          <WorkspaceToolbar />
          <div className="workspace" ref={workspaceRef}>
            {/* Focus Mode is a distraction-free editor+preview split (ADR-0004):
             * always show both panes so the rendered diagram is visible even
             * when the underlying view mode is "code". */}
            {focusMode ? (
              <>
                <div
                  className="editor-col split"
                  style={{ flexBasis: `${editorPct * 100}%` }}
                >
                  <Editor />
                </div>
                <div className="splitter" onMouseDown={startSplitDrag} title="Resize" />
                <div className="preview-col">
                  <Preview />
                </div>
              </>
            ) : viewMode === "preview" ? (
              <div className="preview-col">
                <Preview />
              </div>
            ) : (
              <>
                <div
                  className={"editor-col" + (viewMode === "split" ? " split" : "")}
                  style={viewMode === "split" ? { flexBasis: `${editorPct * 100}%` } : undefined}
                >
                  <Editor />
                </div>
                {viewMode === "split" && (
                  <>
                    <div className="splitter" onMouseDown={startSplitDrag} title="Resize" />
                    <div className="preview-col">
                      <Preview />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {useStore((s) => s.dialogs.settings) && <SettingsDialog />}
      {useStore((s) => s.dialogs.about) && <AboutDialog />}
      {useStore((s) => s.diffData) && <DiffView />}
      {useStore((s) => s.dialogs.findInFolder) && <FindInFolder />}
      {useStore((s) => s.dialogs.openPath) && <OpenPathModal />}
      {useStore((s) => s.dialogs.openUrl) && <OpenUrlModal />}
      <Toasts />

      {ctxMenu && (
        <>
          <div
            className="ctx-backdrop"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu(null);
            }}
          />
          <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            <div
              className="ctx-item"
              onClick={() => {
                setCtxMenu(null);
                void executeCommand("reload");
              }}
            >
              Reload
            </div>
          </div>
        </>
      )}
    </div>
  );
}
