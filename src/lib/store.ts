import { create } from "zustand";
import type { AppState } from "./state/types";
import { createShellSlice } from "./state/shellSlice";
import { createTabsSlice } from "./state/tabsSlice";
import { createFileBrowserSlice } from "./state/fileBrowserSlice";

// The single global store is a composition of the three bounded-context
// slices (app shell / editor tabs / file browser — see CONTEXT.md). Components
// keep using `useStore((s) => s.x)`; the slices just give each context its own
// module so state and its transitions live together.
export const useStore = create<AppState>()((...a) => ({
  ...createShellSlice(...a),
  ...createTabsSlice(...a),
  ...createFileBrowserSlice(...a),
}));

export type { AppState, UpdateInfo } from "./state/types";
