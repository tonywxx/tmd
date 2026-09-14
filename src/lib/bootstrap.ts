import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { onOpenUrl, getCurrent } from "@tauri-apps/plugin-deep-link";
import { useStore } from "./store";
import { api } from "./bridge";
import { openFileByPath } from "./document";
import { registerDragDrop } from "./dragDrop";
import { executeCommand } from "./commands";
import { registerAppCommands } from "./appCommands";
import { checkForUpdates, downloadUpdate } from "./updater";

// ---- App bootstrap module (candidate B) ----
//
// Owns everything App.tsx used to do at startup besides rendering:
// register commands, load settings/session, background update check,
// cold-start deep links, first-launch help, home-dir rooting, and the
// backend-event → command wiring. Behavior is unchanged — only relocated,
// so App.tsx is back to being a view module.
//
// Single interface: bootstrap() runs the whole startup sequence and resolves
// to a cleanup function the caller must invoke on unmount.

export async function bootstrap(): Promise<() => void> {
  registerAppCommands();
  try {
    const s = await api.getSettings();
    useStore.getState().setSettings(s);
    useStore.getState().setFavorites(s.favorites);
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
  // Open files/links that launched a cold app (e.g. double-clicking a .md
  // in Finder, or a tmd:// URL). Live opens while running are handled by
  // onOpenUrl below; this catches the launch-time ones before that
  // listener is registered.
  try {
    const launchUrls = (await getCurrent()) as string[] | null;
    if (launchUrls) {
      for (const u of launchUrls) void executeCommand("deep-link", u);
    }
  } catch {
    /* deep link unsupported on this platform */
  }
  // First-launch onboarding: generate + open the markdown help guide once.
  if (!localStorage.getItem("tmd_help_auto_opened")) {
    localStorage.setItem("tmd_help_auto_opened", "1");
    void executeCommand("help");
  }
  // The browser is always rooted at the user's home directory. Only an
  // explicit user action re-roots it (Open Folder, favorites, context
  // menu) — opening a file never moves the tree.
  try {
    useStore.getState().setFolderPath(await api.homeDir());
  } catch {
    /* ignore home-dir failures */
  }
  // The single exception: reveal the restored file once at launch, so its
  // selection highlight is actually visible under a home-rooted tree.
  const restored = useStore.getState().getActiveTab()?.filePath;
  if (restored) void useStore.getState().revealPath(restored);
  const unlisteners = await wireEvents();
  unlisteners.push(await registerDragDrop());
  return () => {
    unlisteners.forEach((u) => u());
  };
}

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
    // Select the restored file; the browser root is always `~` and is set by
    // the bootstrap above, never by the session.
    const st = useStore.getState();
    const target = st.getActiveTab()?.filePath ?? st.tabs.find((x) => x.filePath)?.filePath;
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
  await on("menu-find", () => void executeCommand("find"));
  await on("menu-find-next", () => void executeCommand("find-next"));
  await on("menu-find-previous", () => void executeCommand("find-previous"));
  await on("menu-replace", () => void executeCommand("replace"));
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
        });
      }, 600);
    }),
  );

  return un;
}
