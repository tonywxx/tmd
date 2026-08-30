import { getCurrentWindow } from "@tauri-apps/api/window";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { getBackend } from "./backend";
import { registerCommand } from "./commands";
import { buildDiff } from "./diff";
import {
	exportHtml,
	exportPdf,
	handleDeepLink,
	handleOpenFile,
	handleOpenFolder,
	openHelpFile,
	saveActiveTab,
	saveActiveTabAs,
} from "./documentIO";
import { getActiveEditorPort } from "./editorPort";
import {
	duplicateActiveTab,
	newUntitledTab,
	openFileByPath,
	openFileFromUrl,
} from "./fileops";
import {
	activeNativeEditable,
	claimClipboardOp,
	copyDomSelection,
	insertIntoEditable,
	markPasteGesture,
	pasteGestureActive,
	snapshotEditable,
	syncControlledInput,
} from "./nativeInput";
import { syncFromDisk } from "./persist";
import { useStore } from "./store";
import { applyTextTransform } from "./textTransforms";
import type { TextTransform } from "./types";

// ---- App shell commands ----
//
// Every action the shell can take is registered here under a name and invoked
// via executeCommand(name). Native menu events, deep links, watcher events and
// in-app buttons all converge on these handlers — App.tsx only maps events to
// names. Native-input and clipboard-gesture logic lives in the native input
// port (./nativeInput) and the open↔save lifecycle in the tab I/O module
// (./documentIO), so this module stays pure event→command wiring.

let currentZoom = 1;

// The webview's native setZoom() was a no-op in some builds, so we scale the
// whole app by zooming the document root instead — crisp text, reflows layout.
function applyAppZoom(): void {
	document.documentElement.style.zoom = String(currentZoom);
}

export function registerAppCommands(): void {
	// ---- documents ----
	registerCommand("new-file", () => void newUntitledTab());
	registerCommand("open-file", () => void handleOpenFile());
	registerCommand("open-folder", () => void handleOpenFolder());
	registerCommand("open-recent", (path) => void openFileByPath(String(path)));
	registerCommand("open-path", () => useStore.getState().setOpenPathOpen(true));
	registerCommand("open-from-url", () =>
		useStore.getState().setOpenUrlOpen(true),
	);
	registerCommand("open-url", (url) => void openFileFromUrl(String(url)));
	registerCommand("save", () => void saveActiveTab());
	registerCommand("save-as", () => void saveActiveTabAs());
	registerCommand("duplicate", () => void duplicateActiveTab());
	registerCommand("export-pdf", () => exportPdf());
	registerCommand("export-html", () => void exportHtml());
	registerCommand("close-tab", () => {
		const id = useStore.getState().activeTabId;
		if (id != null) useStore.getState().closeTab(id);
	});
	registerCommand("find-in-folder", () =>
		useStore.getState().setFindInFolderOpen(true),
	);

	// ---- editor ----
	registerCommand("undo", () => getActiveEditorPort()?.undo());
	registerCommand("redo", () => getActiveEditorPort()?.redo());
	registerCommand("cut", () => {
		if (!claimClipboardOp()) return;
		const el = activeNativeEditable();
		if (el) {
			const s = el.selectionStart ?? 0;
			const e = el.selectionEnd ?? 0;
			void navigator.clipboard.writeText(el.value.slice(s, e));
			el.setRangeText("", s, e, "end");
			syncControlledInput(el);
			return;
		}
		// The preview is not editable, so cutting a selection there is a no-op;
		// copy it instead (matches native cut-on-non-editable behavior).
		if (copyDomSelection()) return;
		getActiveEditorPort()?.cutSelection();
	});
	registerCommand("copy", () => {
		if (!claimClipboardOp()) return;
		const el = activeNativeEditable();
		if (el) {
			const s = el.selectionStart ?? 0;
			const e = el.selectionEnd ?? 0;
			void navigator.clipboard.writeText(el.value.slice(s, e));
			return;
		}
		// Selecting text in the preview (or anywhere outside the editor) and
		// pressing ⌘C must copy that selection, not the editor's.
		if (copyDomSelection()) return;
		getActiveEditorPort()?.copySelection();
	});
	registerCommand("paste", async () => {
		// If this gesture was already served by a native paste event (e.g. a
		// right-click paste, or a platform where the accelerator also emits a
		// native paste), skip the manual insert so we don't duplicate it.
		if (pasteGestureActive()) return;
		markPasteGesture();
		if (!claimClipboardOp()) return;
		const snap = snapshotEditable();
		const text = await readText().catch(() => "");
		if (snap) {
			insertIntoEditable(snap, text);
			return;
		}
		getActiveEditorPort()?.paste(text);
	});
	registerCommand("select-all", () => getActiveEditorPort()?.selectAll());
	registerCommand("copy-file-content", () => {
		const t = useStore.getState().getActiveTab();
		if (t) void navigator.clipboard.writeText(t.content);
	});
	registerCommand("copy-selection-with-context", () => {
		const t = useStore.getState().getActiveTab();
		const port = getActiveEditorPort();
		if (t && port) {
			const sel = port.getSelection();
			void navigator.clipboard.writeText(
				`${t.filePath ?? t.name ?? "Untitled"}\n${sel.text}`,
			);
		}
	});
	registerCommand("text-transform", (t) => {
		const port = getActiveEditorPort();
		if (!port) return;
		const sel = port.getSelection();
		if (!sel.hasSelection) return;
		port.paste(applyTextTransform(t as TextTransform, sel.text));
	});
	registerCommand("goto-line", (line) => {
		getActiveEditorPort()?.navigateToLine(Number(line));
	});
	registerCommand("find", () => getActiveEditorPort()?.openSearchPanel());
	registerCommand("find-next", () => getActiveEditorPort()?.findNext());
	registerCommand("find-previous", () => getActiveEditorPort()?.findPrevious());
	registerCommand("replace", () => getActiveEditorPort()?.openReplacePanel());

	// ---- window / view ----
	registerCommand("focus-mode", () => {
		const s = useStore.getState();
		s.setFocusMode(!s.focusMode);
	});
	registerCommand("close-window", () => void getCurrentWindow().close());
	registerCommand("minimize", () => void getCurrentWindow().minimize());
	registerCommand(
		"toggle-maximize",
		() => void getCurrentWindow().toggleMaximize(),
	);
	registerCommand("toggle-fullscreen", async () => {
		const w = getCurrentWindow();
		await w.setFullscreen(!(await w.isFullscreen()));
	});
	registerCommand("reload", () => location.reload());
	registerCommand("toggle-devtools", () => {
		useStore
			.getState()
			.pushToast("DevTools are available in debug builds", "info");
	});
	registerCommand("reset-zoom", () => {
		currentZoom = 1;
		applyAppZoom();
	});
	registerCommand("zoom-in", () => {
		currentZoom = Math.min(3, Math.round((currentZoom + 0.1) * 10) / 10);
		applyAppZoom();
	});
	registerCommand("zoom-out", () => {
		currentZoom = Math.max(0.5, Math.round((currentZoom - 0.1) * 10) / 10);
		applyAppZoom();
	});

	// ---- app shell ----
	registerCommand("about", () => useStore.getState().setAboutOpen(true));
	registerCommand("settings", () => useStore.getState().setSettingsOpen(true));
	registerCommand("help", () => void openHelpFile());
	registerCommand(
		"open-external",
		(url) => void getBackend().openExternal(String(url)),
	);
	registerCommand("clear-recents", () => {
		const s = useStore.getState();
		s.updateSettings({ recentFiles: [], recentDirectories: [] });
		void getBackend().setSettings({
			...s.settings,
			recentFiles: [],
			recentDirectories: [],
		});
	});

	// ---- backend events (watchers, deep links) ----
	registerCommand("file-changed", (payload) => {
		const p = payload as { path: string; content: string };
		const st = useStore.getState();
		const tab = st.tabs.find((t) => t.filePath === p.path);
		if (!tab) return;
		if (tab.dirty) {
			st.setDiffData(buildDiff(p.path, tab.content, p.content));
			st.pushToast("File changed on disk — merge needed", "warning");
		} else if (p.content !== tab.content) {
			// The file already contains `content` on disk; reconcile the tab and
			// the editor document without writing anything back.
			void syncFromDisk(tab.id, p.path, p.content);
		}
		// When p.content === tab.content the event is our own save/autosave echo:
		// the editor already holds this text, so reloading would replace the whole
		// document (Editor.tsx replaceContent) and map the caret to position 0.
	});
	registerCommand("directory-changed", (payload) => {
		const p = payload as { path: string };
		const st = useStore.getState();
		if (
			st.folderPath &&
			(st.folderPath === p.path || st.folderPath.startsWith(`${p.path}/`))
		) {
			void st.refreshTree();
		}
	});
	registerCommand("deep-link", (arg) => handleDeepLink(String(arg)));
}
