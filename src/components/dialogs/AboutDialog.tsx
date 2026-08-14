import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { useStore } from "../../lib/store";
import { checkForUpdates, installUpdate, formatBytes } from "../../lib/updater";

type CheckState =
  | "idle"
  | "checking"
  | "uptodate"
  | "available"
  | "downloading"
  | "error";

export default function AboutDialog() {
  const setAboutOpen = useStore((s) => s.setAboutOpen);
  const [version, setVersion] = useState("…");
  const [state, setState] = useState<CheckState>("idle");
  const [info, setInfo] = useState<{ version: string; notes?: string } | null>(
    null,
  );
  const [progress, setProgress] = useState<{
    downloaded: number;
    total: number | null;
  }>({ downloaded: 0, total: null });

  useEffect(() => {
    void api
      .appVersion()
      .then(setVersion)
      .catch(() => setVersion("unknown"));
  }, []);

  async function handleCheck() {
    setState("checking");
    try {
      const update = await checkForUpdates();
      if (update) {
        setInfo({ version: update.version, notes: update.notes || update.body });
        setState("available");
      } else {
        setState("uptodate");
      }
    } catch {
      setState("error");
    }
  }

  async function handleUpdate() {
    setState("downloading");
    setProgress({ downloaded: 0, total: null });
    try {
      await installUpdate((d, t) => setProgress({ downloaded: d, total: t }));
    } catch {
      setState("error");
    }
  }

  const pct =
    progress.total && progress.total > 0
      ? Math.round((progress.downloaded / progress.total) * 100)
      : null;

  return (
    <div className="modal-backdrop" onClick={() => setAboutOpen(false)}>
      <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">About tmd</div>
        <div className="modal-body about-body">
          <div className="about-logo">tmd</div>
          <p className="about-sub">
            TONy Markdown — a fast, native markdown editor.
          </p>
          <p>Version {version}</p>

          <div className="about-update">
            {state === "idle" && (
              <button className="btn" onClick={handleCheck}>
                Check for Updates
              </button>
            )}
            {state === "checking" && <span className="muted">Checking…</span>}
            {state === "uptodate" && (
              <span className="muted">You&rsquo;re up to date.</span>
            )}
            {state === "error" && (
              <span className="muted">
                Couldn&rsquo;t reach the update server.
              </span>
            )}
            {state === "available" && info && (
              <div className="update-available">
                <p>Version {info.version} is available.</p>
                <button className="btn primary" onClick={handleUpdate}>
                  Download &amp; Restart
                </button>
              </div>
            )}
            {state === "downloading" && (
              <div className="update-progress">
                <p>
                  Downloading update…{" "}
                  {pct !== null
                    ? `${pct}%`
                    : formatBytes(progress.downloaded)}
                </p>
                {pct !== null && <progress value={pct} max={100} />}
              </div>
            )}
          </div>

          <div className="about-links">
            <button
              className="btn"
              onClick={() =>
                api.openExternal("https://github.com/tonywxx/tmd")
              }
            >
              GitHub
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn primary" onClick={() => setAboutOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
