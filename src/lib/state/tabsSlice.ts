import type { StateCreator } from "zustand";
import type { AppState, TabsSlice } from "./types";

export const createTabsSlice: StateCreator<AppState, [], [], TabsSlice> = (
  set,
  get,
) => ({
  tabs: [],
  activeTabId: null,
  nextTabId: 1,
  addTab: (tab) => {
    const id = get().nextTabId;
    set((state) => ({
      tabs: [
        ...state.tabs,
        {
          ...tab,
          id,
          content: tab.content ?? "",
          savedContent: tab.savedContent ?? tab.content ?? "",
          sourceUrl: tab.sourceUrl ?? null,
          dirty: tab.dirty ?? false,
        },
      ],
      activeTabId: id,
      nextTabId: id + 1,
    }));
    return id;
  },
  // Both transitions below keep the file browser's selection in lockstep with
  // the active tab, so the sidebar always highlights the file being edited.
  closeTab: (id) =>
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === id);
      if (idx === -1) return {};
      const tabs = state.tabs.filter((t) => t.id !== id);
      let activeTabId = state.activeTabId;
      if (activeTabId === id) {
        if (tabs.length === 0) activeTabId = null;
        else activeTabId = tabs[Math.min(idx, tabs.length - 1)].id;
      }
      const active = tabs.find((t) => t.id === activeTabId);
      return { tabs, activeTabId, selectedPath: active?.filePath ?? null };
    }),
  // Untitled / URL-backed tabs have no path, so they clear the selection.
  setActiveTab: (id) =>
    set((state) => ({
      activeTabId: id,
      selectedPath: state.tabs.find((t) => t.id === id)?.filePath ?? null,
    })),
  updateTabContent: (id, content) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? { ...t, content, dirty: content !== t.savedContent }
          : t,
      ),
    })),
  setTabSaved: (id, savedContent) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, savedContent, dirty: false } : t,
      ),
    })),
  setTabName: (id, name, filePath) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, name, filePath } : t,
      ),
    })),
  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) ?? null;
  },
});
