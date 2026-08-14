import { Plus, X, Sidebar } from "lucide-react";
import { Icon } from "./Icon";
import { useStore } from "../lib/store";
import { newUntitledTab } from "../lib/fileops";

export default function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);
  const sidebarVisible = useStore((s) => s.sidebarVisible);
  const setSidebarVisible = useStore((s) => s.setSidebarVisible);

  return (
    <div
      className={"tab-bar" + (sidebarVisible ? "" : " sidebar-closed")}
      data-tauri-drag-region="deep"
    >
      <button
        className={"sidebar-toggle" + (sidebarVisible ? " active" : "")}
        title="Toggle Sidebar"
        onClick={() => setSidebarVisible(!sidebarVisible)}
      >
        <Icon icon={Sidebar} />
      </button>
      <div className="tab-strip">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={"tab" + (t.id === activeTabId ? " active" : "")}
            data-tauri-drag-region="false"
            onClick={() => setActiveTab(t.id)}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                closeTab(t.id);
              }
            }}
            title={t.filePath ?? t.name ?? "Untitled"}
          >
            <span className="tab-name">{t.name ?? "Untitled"}</span>
            {t.dirty ? (
              <span
                className="tab-close dirty"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                title="Close"
              >
                ●
              </span>
            ) : (
              <span
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                title="Close"
              >
                <Icon icon={X} />
              </span>
            )}
          </div>
        ))}
      </div>
      <button
        className="tab-new"
        title="New Tab"
        onClick={() => newUntitledTab()}
      >
        <Icon icon={Plus} />
      </button>
    </div>
  );
}
