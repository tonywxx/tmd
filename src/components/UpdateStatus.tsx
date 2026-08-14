import { useStore } from "../lib/store";
import { installUpdate, formatBytes } from "../lib/updater";

/**
 * Sidebar status region for the background auto-updater.
 *
 * - While a new version is downloading it shows "Downloading new version…"
 *   with a live progress bar.
 * - Once the download finishes it shows a "Restart to update" button; clicking
 *   it installs the already-downloaded archive and relaunches the app.
 *
 * No modal is shown on launch — the user is never interrupted.
 */
export default function UpdateStatus() {
  const status = useStore((s) => s.updateStatus);
  const info = useStore((s) => s.updateInfo);
  const progress = useStore((s) => s.updateProgress);
  const archivePath = useStore((s) => s.updateArchivePath);

  if (!info || status === "idle" || status === "error") return null;

  const pct =
    progress.total && progress.total > 0
      ? Math.round((progress.downloaded / progress.total) * 100)
      : null;

  if (status === "downloading") {
    return (
      <div className="sidebar-update">
        <div className="sidebar-update-text">
          Downloading new version…{" "}
          {pct !== null ? `${pct}%` : formatBytes(progress.downloaded)}
        </div>
        {pct !== null && <progress value={pct} max={100} />}
      </div>
    );
  }

  // status === "ready"
  return (
    <div className="sidebar-update">
      <div className="sidebar-update-text">
        Version {info.version} is ready to install.
      </div>
      <button
        className="btn primary sidebar-update-btn"
        onClick={() => void installUpdate(undefined, archivePath ?? undefined)}
      >
        Restart to update
      </button>
    </div>
  );
}
