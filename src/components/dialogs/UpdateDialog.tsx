import { useState } from "react";
import { useStore } from "../../lib/store";
import { installUpdate, formatBytes } from "../../lib/updater";

export default function UpdateDialog() {
  const updateInfo = useStore((s) => s.updateInfo);
  const setUpdateInfo = useStore((s) => s.setUpdateInfo);
  const pushToast = useStore((s) => s.pushToast);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<{
    downloaded: number;
    total: number | null;
  }>({ downloaded: 0, total: null });
  const [error, setError] = useState(false);

  if (!updateInfo) return null;

  const pct =
    progress.total && progress.total > 0
      ? Math.round((progress.downloaded / progress.total) * 100)
      : null;

  async function handleUpdate() {
    setDownloading(true);
    setError(false);
    setProgress({ downloaded: 0, total: null });
    try {
      await installUpdate((d, t) => setProgress({ downloaded: d, total: t }));
    } catch {
      setError(true);
      setDownloading(false);
      pushToast("Update failed. Try again later.", "error");
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={() => !downloading && setUpdateInfo(null)}
    >
      <div className="modal update-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">Update Available — {updateInfo.version}</div>
        <div className="modal-body">
          <pre className="update-notes">{updateInfo.notes || updateInfo.body}</pre>
          {downloading && (
            <div className="update-progress">
              <p>
                Downloading…{" "}
                {pct !== null ? `${pct}%` : formatBytes(progress.downloaded)}
              </p>
              {pct !== null && <progress value={pct} max={100} />}
            </div>
          )}
          {error && (
            <p className="muted">Something went wrong. You can try again.</p>
          )}
        </div>
        <div className="modal-footer">
          <button
            className="btn"
            disabled={downloading}
            onClick={() => setUpdateInfo(null)}
          >
            Later
          </button>
          <button
            className="btn primary"
            disabled={downloading}
            onClick={handleUpdate}
          >
            {downloading ? "Updating…" : "Update & Restart"}
          </button>
        </div>
      </div>
    </div>
  );
}
