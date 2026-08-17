import { useEffect, useRef, useState } from "react";
import { useStore } from "../../lib/store";
import { openFileFromUrl } from "../../lib/fileops";
import { claimClipboardOp } from "../../lib/editorPort";
import { snapshotEditable, insertIntoEditable } from "../../lib/nativeInput";

export default function OpenUrlModal() {
  const setOpen = useStore((s) => s.setOpenUrlOpen);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Grab focus reliably when the modal opens (autoFocus can be unreliable
  // inside a freshly-mounted Tauri webview modal).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function open() {
    if (!url.trim() || loading) return;
    setLoading(true);
    const id = await openFileFromUrl(url.trim());
    setLoading(false);
    if (id != null) setOpen(false);
  }

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal openpath-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">Open from URL</div>
        <div className="modal-body">
          <input
            ref={inputRef}
            autoFocus
            disabled={loading}
            placeholder="https://example.com/document.md"
            value={url}
            // URLs cannot contain whitespace; strip it so a URL copied across
            // multiple lines (e.g. from chat/terminal) pastes as one valid URL.
            onChange={(e) => setUrl(e.target.value.replace(/\s+/g, ""))}
            // When the ⌘V accelerator fires, appCommands pastes manually and
            // a single gesture can reach this field twice: as a DOM paste AND
            // as the menu-accelerator "paste" command. Always suppress the
            // native insert here and let whichever path first claims the
            // clipboard op do the insertion (mirroring the editor's clipboard
            // handlers) — this keeps the URL from being inserted twice.
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
            onKeyDown={(e) => e.key === "Enter" && void open()}
          />
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </button>
          <button className="btn primary" onClick={open} disabled={loading || !url.trim()}>
            {loading ? "Fetching…" : "Open"}
          </button>
        </div>
      </div>
    </div>
  );
}
