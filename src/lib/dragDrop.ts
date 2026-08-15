import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { isMarkdown } from "./constants";
import { openFileByPath } from "./fileops";

type Pane = "editor" | "preview";

function within(el: HTMLElement, x: number, y: number): boolean {
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

// Hit-test a logical (CSS-pixel) point against the editor / preview panes to
// decide which pane a file was dropped on. Returns null when the point is over
// the file browser, toolbar, or another non-editor area.
function paneAt(x: number, y: number): Pane | null {
  const editor = document.querySelector<HTMLElement>(".editor-col");
  const preview = document.querySelector<HTMLElement>(".preview-col");
  // Check preview first: in split mode it sits to the right of the editor and
  // we want the pane the cursor is actually inside, not the broader editor.
  if (preview && within(preview, x, y)) return "preview";
  if (editor && within(editor, x, y)) return "editor";
  return null;
}

// Toggle a highlight class on the targeted pane so the drop target is visible
// while a file is dragged over the window.
function setHighlight(pane: Pane | null) {
  document
    .querySelectorAll(".editor-col, .preview-col")
    .forEach((el) => el.classList.remove("drag-over"));
  if (pane) {
    const sel = pane === "preview" ? ".preview-col" : ".editor-col";
    document.querySelector(sel)?.classList.add("drag-over");
  }
}

// Convert a Tauri physical drag position to logical CSS pixels so it can be
// compared against getBoundingClientRect (which reports in CSS pixels).
function toLogical(pos: { x: number; y: number }) {
  const f = window.devicePixelRatio || 1;
  return { x: pos.x / f, y: pos.y / f };
}

// Registers a window-wide drag-drop listener. Dropping one or more `.md` files
// opens each in a tab and switches the view to the pane it was dropped on.
export async function registerDragDrop(): Promise<UnlistenFn> {
  const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload;
    if (p.type === "enter" || p.type === "over") {
      const pos = toLogical(p.position);
      setHighlight(paneAt(pos.x, pos.y));
      return;
    }
    if (p.type === "leave") {
      setHighlight(null);
      return;
    }
    // drop
    setHighlight(null);
    const mdPaths = p.paths.filter(isMarkdown);
    if (mdPaths.length === 0) return;
    // Open the file without forcing a view-mode change: the dropped file
    // becomes the active tab and is shown in whatever pane(s) are already
    // visible (code / preview / split), preserving the user's current layout.
    void Promise.all(mdPaths.map((path) => openFileByPath(path)));
  });
  return unlisten;
}
