import { useState } from "react";
import { useStore } from "../../lib/store";
import { getFileSystem } from "../../lib/fs";
import { openFileByPath } from "../../lib/fileops";
import { executeCommand } from "../../lib/commands";
import { claimClipboardOp } from "../../lib/editorPort";
import { snapshotEditable, insertIntoEditable } from "../../lib/nativeInput";

export default function OpenPathModal() {
  const setOpen = useStore((s) => s.setOpenPathOpen);
  const pushToast = useStore((s) => s.pushToast);
  const [path, setPath] = useState("");
  const [line, setLine] = useState<number | null>(null);

  function parse(value: string) {
    // accept "path:LINE" or "path?line=N"
    setPath(value);
    const colonMatch = value.match(/^(.*):(\d+)$/);
    if (colonMatch) {
      setPath(colonMatch[1]);
      setLine(Number(colonMatch[2]));
      return;
    }
    const qMatch = value.match(/[?&]line=(\d+)/);
    if (qMatch) {
      const base = value.replace(/[?&]line=\d+/, "");
      setPath(base);
      setLine(Number(qMatch[1]));
    } else {
      setLine(null);
    }
  }

  async function open() {
    const resolved = await getFileSystem().resolvePath(path.trim());
    if (!resolved) {
      pushToast("Invalid path", "error");
      return;
    }
    const id = await openFileByPath(resolved.path);
    if (id != null && line != null) {
      void executeCommand("goto-line", line);
    }
    setOpen(false);
  }

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal openpath-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">Open from Path</div>
        <div className="modal-body">
          <input
            autoFocus
            placeholder="/path/to/file.md  (optionally :LINE or ?line=N)"
            value={path}
            onChange={(e) => parse(e.target.value)}
            // A single ⌘V can reach this field twice: as a DOM paste AND as
            // the menu-accelerator "paste" command. Always suppress the native
            // insert and let whichever path first claims the clipboard op do
            // the insertion (mirroring the editor's clipboard handlers) so the
            // path text is never inserted twice.
            onPaste={(e) => {
              e.preventDefault();
              const snap = snapshotEditable(e.currentTarget as HTMLInputElement);
              if (!snap) return;
              if (!claimClipboardOp()) return;
              void navigator.clipboard
                .readText()
                .catch(() => "")
                .then((text) => insertIntoEditable(snap, text));
            }}
            onKeyDown={(e) => e.key === "Enter" && open()}
          />
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn primary" onClick={open}>
            Open
          </button>
        </div>
      </div>
    </div>
  );
}
