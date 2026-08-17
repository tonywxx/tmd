import { Fragment, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import {
  Folder,
  FolderOpen,
  File as FileIcon,
  Star,
  Pin,
  TriangleAlert,
  RefreshCw,
  X,
} from "lucide-react";
import { Icon } from "./Icon";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../lib/store";
import { confirmDialog, messageDialog } from "../lib/bridge";
import { getFileSystem } from "../lib/fs";
import { openFileByPath } from "../lib/fileops";
import { basename, dirname, join } from "../lib/pathutil";
import { type Favorite, type FileEntry, type SortMode } from "../lib/types";
import { sortEntries, SORT_LABELS, isFavorite } from "../lib/fileBrowserModel";
import { formatRelativeTime } from "../lib/formatTime";
import UpdateStatus from "./UpdateStatus";

export default function FileBrowser() {
  const folderPath = useStore((s) => s.folderPath);
  const dirChildren = useStore((s) => s.dirChildren);
  const dirErrors = useStore((s) => s.dirErrors);
  const expandedDirs = useStore((s) => s.expandedDirs);
  const loadingDirs = useStore((s) => s.loadingDirs);
  const selectedPath = useStore((s) => s.selectedPath);
  const favorites = useStore((s) => s.favorites);
  const showFileDates = useStore((s) => s.settings.showFileDates);
  const sidebarVisible = useStore((s) => s.sidebarVisible);
  const setFolderPath = useStore((s) => s.setFolderPath);
  const setSelectedPath = useStore((s) => s.setSelectedPath);
  const addFavorite = useStore((s) => s.addFavorite);
  const removeFavorite = useStore((s) => s.removeFavorite);
  const loadDir = useStore((s) => s.loadDir);
  const setExpanded = useStore((s) => s.setExpanded);
  const refreshTree = useStore((s) => s.refreshTree);

  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; isDir: boolean } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; value: string } | null>(null);
  const [width, setWidth] = useState(260);
  // Set while the sidebar is being resized so the width transition is disabled
  // and the pane tracks the cursor immediately.
  const [resizing, setResizing] = useState(false);
  const draggingRef = useRef(false);

  async function chooseFolder() {
    const picked = (await open({ directory: true, multiple: false })) as string | null;
    if (picked) {
      setFolderPath(picked);
      useStore.getState().addRecentDirectory(picked);
    }
  }

  function toggleDir(path: string) {
    if (expandedDirs[path]) {
      setExpanded(path, false);
    } else {
      setExpanded(path, true);
      if (!(path in dirChildren)) void loadDir(path);
    }
  }

  async function onContextAction(action: string, path: string, isDir: boolean) {
    setContextMenu(null);
    const fs = getFileSystem();
    switch (action) {
      case "open":
        if (isDir) setFolderPath(path);
        else await openFileByPath(path);
        break;
      case "reveal":
        try {
          await fs.showInFolder(path);
        } catch (e) {
          await messageDialog(`Could not reveal: ${String(e)}`);
        }
        break;
      case "rename":
        setRenaming({ path, value: basename(path) });
        break;
      case "delete": {
        const ok = await confirmDialog(
          `Move "${basename(path)}" to Trash?`,
          "Move to Trash",
        );
        if (ok) {
          try {
            await fs.trash(path);
            await refreshTree();
          } catch (e) {
            await messageDialog(`Could not delete: ${String(e)}`);
          }
        }
        break;
      }
      case "favorite":
        addFavorite({ path, type: isDir ? "directory" : "file" });
        break;
      case "new-file": {
        const name = `untitled-${Date.now().toString().slice(-4)}.md`;
        const p = join(path, name);
        try {
          await fs.create(p);
          await refreshTree();
          await openFileByPath(p);
        } catch (e) {
          await messageDialog(`Could not create file: ${String(e)}`);
        }
        break;
      }
      case "new-folder": {
        const name = `New Folder ${Date.now().toString().slice(-4)}`;
        const p = join(path, name);
        try {
          await fs.mkdir(p);
          await refreshTree();
        } catch (e) {
          await messageDialog(`Could not create folder: ${String(e)}`);
        }
        break;
      }
    }
  }

  async function commitRename() {
    if (!renaming) return;
    const oldPath = renaming.path;
    const newName = renaming.value.trim();
    if (!newName || basename(oldPath) === newName) {
      setRenaming(null);
      return;
    }
    const newPath = join(dirname(oldPath), newName);
    try {
      await getFileSystem().rename(oldPath, newPath);
      await refreshTree();
    } catch (e) {
      await messageDialog(`Could not rename: ${String(e)}`);
    }
    setRenaming(null);
  }

  // Sidebar resize: window-level listeners so the drag keeps working even when
  // the cursor moves past the sidebar's right edge (over the editor).
  function startResize(e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault();
    draggingRef.current = true;
    setResizing(true);
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev: MouseEvent) => {
      const maxW = Math.round(window.innerWidth * 0.8);
      setWidth(Math.max(120, Math.min(maxW, startWidth + (ev.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      draggingRef.current = false;
      setResizing(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function renderNode(entry: FileEntry, depth: number): ReactNode {
    const isDir = entry.isDirectory;
    const isExpanded = isDir && !!expandedDirs[entry.path];
    const isLoading = isDir && !!loadingDirs[entry.path];
    const children = isDir ? dirChildren[entry.path] : undefined;
    const isRenaming = renaming?.path === entry.path;
    const pad = 8 + depth * 14;

    const row = (
      <div
        className={
          "fb-row" +
          (selectedPath === entry.path ? " selected" : "") +
          (isDir ? " is-dir" : "")
        }
        style={{ paddingLeft: pad }}
        onClick={() => {
          setSelectedPath(entry.path);
          if (isDir) toggleDir(entry.path);
        }}
        onDoubleClick={() => {
          if (isDir) toggleDir(entry.path);
          else void openFileByPath(entry.path);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, path: entry.path, isDir });
        }}
      >
        <span className={"fb-twist" + (isExpanded ? " open" : "")}>
          {isDir ? ">" : ""}
        </span>
        <span className="fb-icon">
          {isDir ? (isExpanded ? <Icon icon={FolderOpen} /> : <Icon icon={Folder} />) : <Icon icon={FileIcon} />}
        </span>
        {isRenaming ? (
          <input
            className="fb-rename"
            autoFocus
            value={renaming.value}
            onChange={(e) => setRenaming({ path: renaming.path, value: e.target.value })}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(null);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="fb-name">{entry.name}</span>
        )}
        {showFileDates && !isDir && (
          <span className="fb-date">{formatRelativeTime(entry.modifiedTime)}</span>
        )}
      </div>
    );

    if (!isDir || !isExpanded) {
      return <Fragment key={entry.path}>{row}</Fragment>;
    }

    const childPad = 8 + (depth + 1) * 14;
    let childContent: ReactNode;
    if (dirErrors[entry.path]) {
      childContent = (
        <div className="fb-empty fb-error" style={{ paddingLeft: childPad }}>
          <Icon icon={TriangleAlert} /> Cannot open: {dirErrors[entry.path]}
        </div>
      );
    } else if (isLoading && !children) {
      childContent = (
        <div className="fb-empty" style={{ paddingLeft: childPad }}>
          Loading…
        </div>
      );
    } else {
      const sortedChildren = sortEntries(children ?? [], sortMode);
      childContent =
        sortedChildren.length === 0 ? (
          <div className="fb-empty" style={{ paddingLeft: childPad }}>
            Empty
          </div>
        ) : (
          sortedChildren.map((c) => renderNode(c, depth + 1))
        );
    }

    return (
      <Fragment key={entry.path}>
        {row}
        <div className="fb-children">{childContent}</div>
      </Fragment>
    );
  }

  const root = folderPath ? dirChildren[folderPath] : undefined;
  const rootError = folderPath ? dirErrors[folderPath] : undefined;

  return (
    <div
      className={"file-browser" + (resizing ? " dragging" : "")}
      style={{ width: sidebarVisible ? width : 0 }}
    >
      <div className="fb-header" data-tauri-drag-region="deep">
        <button className="fb-btn" onClick={chooseFolder} title="Open Folder">
          <Icon icon={FolderOpen} />
        </button>
        <button className="fb-btn" onClick={() => folderPath && refreshTree()} title="Refresh">
          <Icon icon={RefreshCw} />
        </button>
        <select
          className="fb-sort"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          title="Sort"
        >
          {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
            <option key={m} value={m}>
              {SORT_LABELS[m]}
            </option>
          ))}
        </select>
      </div>

      <div className="fb-path" title={folderPath ?? ""}>
        {folderPath ? basename(folderPath) || folderPath : "No folder"}
      </div>

      {favorites.length > 0 && (
        <div className="fb-section">
          <div className="fb-section-title">Favorites</div>
          {favorites.map((f: Favorite) => (
            <div
              key={f.path}
              className="fb-row favorite"
              onClick={() => setSelectedPath(f.path)}
              onDoubleClick={() =>
                f.type === "directory" ? setFolderPath(f.path) : openFileByPath(f.path)
              }
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, path: f.path, isDir: f.type === "directory" });
              }}
            >
              <span className="fb-twist" />
              <span className="fb-icon">{f.type === "directory" ? <Icon icon={Star} /> : <Icon icon={Pin} />}</span>
              <span className="fb-name">{basename(f.path)}</span>
              <span
                className="fb-fav-remove"
                title="Remove favorite"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFavorite(f);
                }}
              >
                <Icon icon={X} />
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="fb-list">
        {folderPath ? (
          rootError ? (
            <div className="fb-empty fb-error"><Icon icon={TriangleAlert} /> Cannot open folder: {rootError}</div>
          ) : !root ? (
            <div className="fb-empty">Loading…</div>
          ) : sortEntries(root, sortMode).length === 0 ? (
            <div className="fb-empty">Folder is empty</div>
          ) : (
            sortEntries(root, sortMode).map((e) => renderNode(e, 0))
          )
        ) : (
          <div className="fb-empty">Open a folder to browse files.</div>
        )}
      </div>

      <UpdateStatus />

      <div
        className="fb-resizer"
        onMouseDown={startResize}
        title="Resize"
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isDir={contextMenu.isDir}
          isFavorite={isFavorite(favorites, contextMenu.path, contextMenu.isDir)}
          onClose={() => setContextMenu(null)}
          onAction={(a) => onContextAction(a, contextMenu.path, contextMenu.isDir)}
        />
      )}
    </div>
  );
}

function ContextMenu(props: {
  x: number;
  y: number;
  isDir: boolean;
  isFavorite: boolean;
  onClose: () => void;
  onAction: (a: string) => void;
}) {
  const items = [
    { id: "open", label: props.isDir ? "Open Folder" : "Open" },
    { id: "reveal", label: "Reveal in Finder" },
    { id: "rename", label: "Rename" },
    { id: "delete", label: "Move to Trash" },
    { id: "favorite", label: props.isFavorite ? "Remove Favorite" : "Add to Favorites" },
    { id: "new-file", label: "New File Here" },
    { id: "new-folder", label: "New Folder Here" },
  ];
  return (
    <>
      <div className="ctx-backdrop" onClick={props.onClose} onContextMenu={(e) => { e.preventDefault(); props.onClose(); }} />
      <div className="ctx-menu" style={{ left: props.x, top: props.y }}>
        {items.map((it) => (
          <div key={it.id} className="ctx-item" onClick={() => props.onAction(it.id)}>
            {it.label}
          </div>
        ))}
      </div>
    </>
  );
}
