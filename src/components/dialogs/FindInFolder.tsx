import { useState } from "react";
import { useStore } from "../../lib/store";
import { getFileSystem } from "../../lib/fs";
import { openFileByPath } from "../../lib/fileops";
import { executeCommand } from "../../lib/commands";
import { basename } from "../../lib/pathutil";
import type { SearchResult } from "../../lib/types";

export default function FindInFolder() {
  const setOpen = useStore((s) => s.setFindInFolderOpen);
  const folderPath = useStore((s) => s.folderPath);
  const pushToast = useStore((s) => s.pushToast);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!folderPath) {
      pushToast("Open a folder first.", "warning");
      return;
    }
    if (!query.trim()) return;
    setLoading(true);
    try {
      const r = await getFileSystem().searchInFolder(folderPath, query, caseSensitive);
      setResult(r);
    } catch (e) {
      pushToast(`Search failed: ${String(e)}`, "error");
    } finally {
      setLoading(false);
    }
  }

  async function openAt(file: string, line: number) {
    await openFileByPath(file);
    void executeCommand("goto-line", line);
    setOpen(false);
  }

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal find-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">Find in Folder</div>
        <div className="modal-body">
          <div className="find-input-row">
            <input
              autoFocus
              placeholder="Search term…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
            />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
              />
              Case
            </label>
            <button className="btn primary" onClick={run} disabled={loading}>
              {loading ? "…" : "Find"}
            </button>
          </div>
          <div className="find-folder">in {folderPath ?? "(no folder)"}</div>
          {result && (
            <div className="find-results">
              <div className="find-summary">
                {result.matchCount} matches in {result.results.length} files
                {result.capped ? " (capped)" : ""}
              </div>
              {result.results.map((r) => (
                <div key={r.file} className="find-file">
                  <div className="find-file-name">{basename(r.file)}</div>
                  {r.contentMatches.map(([line, snippet], i) => (
                    <div
                      key={i}
                      className="find-match"
                      onClick={() => openAt(r.file, line)}
                    >
                      <span className="find-line">{line}</span>
                      <span className="find-snippet">{snippet}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
