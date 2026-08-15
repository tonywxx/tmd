import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
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
import { openFileByPath } from "./lib/fileops";
import { registerDragDrop } from "./lib/dragDrop";
import { executeCommand } from "./lib/commands";
import { registerAppCommands } from "./lib/appCommands";
import { checkForUpdates, downloadUpdate } from "./lib/updater";
import { dirname } from "./lib/pathutil";
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

// Guard against registering the active-tab → sidebar sync more than once
// (React StrictMode double-mounts effects in dev, and zustand subscriptions
// are global).
let activeTabSyncRegistered = false;

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

  // ---- bootstrap: register commands, load settings/session, wire events ----
  useEffect(() => {
    let unlisteners: UnlistenFn[] = [];
    (async () => {
      registerAppCommands();
      try {
        const s = await api.getSettings();
        useStore.getState().setSettings(s);
        useStore.getState().setFavorites(s.favorites);
        if (s.recentDirectories[0]) useStore.getState().setFolderPath(s.recentDirectories[0]);
      } catch (e) {
        console.error("Failed to load settings", e);
      }
      // Silent background update check (auto-update from GitHub). If a newer
      // release exists, start downloading it in the background; the sidebar
      // status region shows progress and a "Restart to update" button when
      // ready. Failures are ignored (surfaced via the About dialog on demand).
      setTimeout(() => {
        void checkForUpdates()
          .then((u) => {
            if (!u) return;
            const st = useStore.getState();
            st.setUpdateInfo({
              version: u.version,
              notes: u.notes ?? "",
              body: u.body ?? "",
            });
            st.setUpdateStatus("downloading");
            st.setUpdateProgress({ downloaded: 0, total: null });
            void downloadUpdate((d, t) =>
              useStore.getState().setUpdateProgress({ downloaded: d, total: t }),
            )
              .then((path) => {
                const s = useStore.getState();
                s.setUpdateArchivePath(path);
                s.setUpdateStatus("ready");
              })
              .catch(() => {
                const s = useStore.getState();
                s.setUpdateStatus("error");
                s.pushToast("Failed to download update.", "error");
              });
          })
          .catch(() => {});
      }, 4000);
      await restoreSession();
      // First-launch onboarding: generate + open the markdown help guide once.
      if (!localStorage.getItem("tmd_help_auto_opened")) {
        localStorage.setItem("tmd_help_auto_opened", "1");
        void executeCommand("help");
      }
      // Default the file browser to the user's home directory when there is
      // no session folder and no recent directory to restore.
      if (!useStore.getState().folderPath) {
        try {
          useStore.getState().setFolderPath(await api.homeDir());
        } catch {
          /* ignore home-dir failures */
        }
      }
      // When the active tab switches to a file-backed tab, point the browser
      // at that file's directory so the sidebar always shows where the current
      // document lives.
      if (!activeTabSyncRegistered) {
        activeTabSyncRegistered = true;
        let lastActiveTabId = useStore.getState().activeTabId;
        useStore.subscribe((state) => {
          if (state.activeTabId === lastActiveTabId) return;
          lastActiveTabId = state.activeTabId;
          const tab = state.getActiveTab();
          if (!tab?.filePath) return;
          const dir = dirname(tab.filePath);
          if (state.folderPath !== dir) state.setFolderPath(dir);
          state.setSelectedPath(tab.filePath);
        });
      }
      unlisteners = await wireEvents();
      unlisteners.push(await registerDragDrop());
    })();
    return () => {
      unlisteners.forEach((u) => u());
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

  async function restoreSession() {
    try {
      const label = getCurrentWindow().label;
      const session = await api.getSession(label);
      if (!session) return;
      for (const f of session.openFiles) {
        await openFileByPath(f);
      }
      if (session.activeFile) {
        const t = useStore.getState().tabs.find((x) => x.filePath === session.activeFile);
        if (t) useStore.getState().setActiveTab(t.id);
      }
      // Point the browser at the directory of the active (or first) open file
      // so the sidebar shows where the restored documents live.
      const st = useStore.getState();
      const target = st.getActiveTab()?.filePath ?? st.tabs.find((x) => x.filePath)?.filePath;
      const dir = target ? dirname(target) : session.folderPath;
      if (dir) st.setFolderPath(dir);
      if (target) st.setSelectedPath(target);
    } catch {
      /* no session */
    }
  }

  // Every backend event is mapped onto a named command; the handlers live in
  // lib/appCommands.ts so the wiring here stays a pure translation layer.
  async function wireEvents(): Promise<UnlistenFn[]> {
    const un: UnlistenFn[] = [];

    const on = async (event: string, handler: (p: any) => void) => {
      un.push(await listen(event, (e) => handler((e as any).payload)));
    };

    await on("show-about", () => void executeCommand("about"));
    await on("menu-new-file", () => void executeCommand("new-file"));
    await on("menu-open-file", () => void executeCommand("open-file"));
    await on("open-from-path", () => void executeCommand("open-path"));
    await on("open-from-url", () => void executeCommand("open-from-url"));
    await on("menu-open-folder", () => void executeCommand("open-folder"));
    await on("menu-save", () => void executeCommand("save"));
    await on("menu-save-as", () => void executeCommand("save-as"));
    await on("menu-duplicate", () => void executeCommand("duplicate"));
    await on("menu-export-pdf", () => void executeCommand("export-pdf"));
    await on("menu-export-html", () => void executeCommand("export-html"));
    await on("menu-close-tab", () => void executeCommand("close-tab"));
    await on("menu-close-window", () => void executeCommand("close-window"));
    await on("menu-undo", () => void executeCommand("undo"));
    await on("menu-redo", () => void executeCommand("redo"));
    await on("menu-cut", () => void executeCommand("cut"));
    await on("menu-copy", () => void executeCommand("copy"));
    await on("menu-paste", () => void executeCommand("paste"));
    await on("menu-select-all", () => void executeCommand("select-all"));
    await on("menu-copy-file-content", () => void executeCommand("copy-file-content"));
    await on("menu-copy-selection-with-context", () => void executeCommand("copy-selection-with-context"));
    await on("menu-find-in-folder", () => void executeCommand("find-in-folder"));
    await on("menu-reload", () => void executeCommand("reload"));
    await on("menu-force-reload", () => void executeCommand("reload"));
    await on("menu-toggle-devtools", () => void executeCommand("toggle-devtools"));
    await on("menu-reset-zoom", () => void executeCommand("reset-zoom"));
    await on("menu-zoom-in", () => void executeCommand("zoom-in"));
    await on("menu-zoom-out", () => void executeCommand("zoom-out"));
    await on("menu-toggle-fullscreen", () => void executeCommand("toggle-fullscreen"));
    await on("menu-focus-mode", () => void executeCommand("focus-mode"));
    await on("menu-minimize", () => void executeCommand("minimize"));
    await on("menu-zoom", () => void executeCommand("toggle-maximize"));
    await on("open-external", (url) => void executeCommand("open-external", url));
    await on("menu-recent-clear", () => void executeCommand("clear-recents"));
    await on("menu-open-recent", (path) => void executeCommand("open-recent", path));
    await on("menu-text-transform", (t) => void executeCommand("text-transform", t));

    await on("file:changed", (p) => void executeCommand("file-changed", p));
    await on("directory:changed", (p) => void executeCommand("directory-changed", p));
    await on("deep-link://tmd", (arg) => void executeCommand("deep-link", arg));
    // First-launch deep links (app opened via tmd:// while not running yet).
    un.push(
      await onOpenUrl((urls: string[]) => {
        for (const u of urls) void executeCommand("deep-link", u);
      }),
    );

    // persist session on changes (debounced)
    let sessionTimer: ReturnType<typeof setTimeout> | null = null;
    un.push(
      useStore.subscribe((state) => {
        if (sessionTimer) clearTimeout(sessionTimer);
        sessionTimer = setTimeout(() => {
          const openFiles = state.tabs
            .filter((t) => t.filePath)
            .map((t) => t.filePath as string);
          const activeFile = state.getActiveTab()?.filePath ?? null;
          void api.setSession(getCurrentWindow().label, {
            openFiles,
            activeFile,
            folderPath: state.folderPath,
          });
        }, 600);
      }),
    );

    return un;
  }

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
            {viewMode === "preview" ? (
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

      {useStore((s) => s.settingsOpen) && <SettingsDialog />}
      {useStore((s) => s.aboutOpen) && <AboutDialog />}
      {useStore((s) => s.diffData) && <DiffView />}
      {useStore((s) => s.findInFolderOpen) && <FindInFolder />}
      {useStore((s) => s.openPathOpen) && <OpenPathModal />}
      {useStore((s) => s.openUrlOpen) && <OpenUrlModal />}
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
