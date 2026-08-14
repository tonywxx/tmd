import type { EditorState } from "@codemirror/state";

// Non-reactive shared state that must NOT trigger re-renders.

export const editorStatesRef = new Map<number, EditorState>();
export const gitBaselineRef = new Map<number, string>();
export const tabViewStatesRef = new Map<number, number>();
export const isExternalUpdateRef = { current: false };

// Per-tab auto-save timers (id -> timeout handle).
export const autoSaveTimers = new Map<number, ReturnType<typeof setTimeout>>();

export interface SelectionInfo {
  text: string;
  hasSelection: boolean;
  startLine: number;
  endLine: number;
}
