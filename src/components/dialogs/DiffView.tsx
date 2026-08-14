import { useEffect, useState } from "react";
import { useStore } from "../../lib/store";
import { getFileSystem } from "../../lib/fs";
import { buildMergedContent } from "../../lib/diff";
import { applyExternalContent } from "../../lib/persist";
import { basename } from "../../lib/pathutil";
import type { DiffChoice, DiffData } from "../../lib/types";

export default function DiffView() {
  const diffData = useStore((s) => s.diffData) as DiffData | null;
  const setDiffData = useStore((s) => s.setDiffData);
  const pushToast = useStore((s) => s.pushToast);
  const [local, setLocal] = useState<DiffData | null>(diffData);

  useEffect(() => {
    setLocal(diffData);
  }, [diffData]);

  if (!diffData || !local) return null;

  function choose(idx: number, choice: DiffChoice) {
    setLocal((d) => {
      if (!d) return d;
      const segments = d.segments.map((s, i) =>
        i === idx && s.type === "conflict" ? { ...s, choice } : s,
      );
      return { ...d, segments };
    });
  }

  function resolveTab(filePath: string) {
    return useStore
      .getState()
      .tabs.find((t) => t.filePath === filePath);
  }

  // Persist a resolution for the whole file: write it, mark the tab saved
  // (dirty=false), refresh recents, and push it into the live editor document.
  // The last step is the one the old per-call-site code skipped — without it
  // the next keystroke replays from a stale CodeMirror document and clobbers
  // the merged result.
  async function resolveWhole(content: string, success: string) {
    if (!local) return;
    const tab = resolveTab(local.filePath);
    try {
      if (tab) {
        const ok = await applyExternalContent(tab.id, local.filePath, content);
        if (!ok) return;
      } else {
        await getFileSystem().writeFile(local.filePath, content);
      }
      pushToast(success, "success");
      setDiffData(null);
    } catch (e) {
      pushToast(`Save failed: ${String(e)}`, "error");
    }
  }

  async function apply() {
    if (!local) return;
    await resolveWhole(buildMergedContent(local), "Merged and saved");
  }

  async function keepMine() {
    if (!local) return;
    const mine = local.segments
      .map((s) => (s.type === "common" ? s.lines : s.mine))
      .flat()
      .join("\n");
    await resolveWhole(mine, "Kept your version");
  }

  async function keepTheirs() {
    if (!local) return;
    const theirs = local.segments
      .map((s) => (s.type === "common" ? s.lines : s.theirs))
      .flat()
      .join("\n");
    await resolveWhole(theirs, "Kept the disk version");
  }

  return (
    <div className="modal-backdrop" onClick={() => setDiffData(null)}>
      <div className="modal diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          Merge changes — {basename(diffData.filePath)}
        </div>
        <div className="modal-body diff-body">
          <p className="diff-intro">
            The file changed on disk while you had unsaved edits. Choose which
            version to keep for each conflict, then apply the merge.
          </p>
          {local.segments.map((seg, i) =>
            seg.type === "common" ? (
              <pre key={i} className="diff-common">
                {seg.lines.join("\n")}
              </pre>
            ) : (
              <div key={i} className="diff-conflict">
                <div className="diff-side">
                  <div className="diff-side-head">
                    <span>Mine (current)</span>
                    <button
                      className={"diff-pick" + (seg.choice === "mine" ? " active" : "")}
                      onClick={() => choose(i, "mine")}
                    >
                      Use Mine
                    </button>
                  </div>
                  <pre className="diff-mine">{seg.mine.join("\n")}</pre>
                </div>
                <div className="diff-side">
                  <div className="diff-side-head">
                    <span>Theirs (disk)</span>
                    <button
                      className={"diff-pick" + (seg.choice === "theirs" ? " active" : "")}
                      onClick={() => choose(i, "theirs")}
                    >
                      Use Theirs
                    </button>
                  </div>
                  <pre className="diff-theirs">{seg.theirs.join("\n")}</pre>
                </div>
              </div>
            ),
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={keepMine}>
            Keep Mine
          </button>
          <button className="btn" onClick={keepTheirs}>
            Keep Theirs
          </button>
          <button className="btn primary" onClick={apply}>
            Apply Merge
          </button>
        </div>
      </div>
    </div>
  );
}
