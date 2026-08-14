import { useStore } from "../../lib/store";

export default function UpdateDialog() {
  const updateInfo = useStore((s) => s.updateInfo);
  const setUpdateInfo = useStore((s) => s.setUpdateInfo);

  if (!updateInfo) return null;

  return (
    <div className="modal-backdrop" onClick={() => setUpdateInfo(null)}>
      <div className="modal update-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">Update Available — {updateInfo.version}</div>
        <div className="modal-body">
          <pre className="update-notes">{updateInfo.notes || updateInfo.body}</pre>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={() => setUpdateInfo(null)}>
            Later
          </button>
          <button
            className="btn primary"
            onClick={() => {
              void useStore.getState().pushToast("Downloading update…", "info");
              setUpdateInfo(null);
            }}
          >
            Update
          </button>
        </div>
      </div>
    </div>
  );
}
