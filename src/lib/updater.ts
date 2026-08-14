import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { UpdateInfo } from "./state/types";

export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

/** Check GitHub for a newer release. Returns `null` when already up to date. */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  return await invoke<UpdateInfo | null>("check_update_cmd");
}

/**
 * Download and install the pending update. `onProgress` receives cumulative
 * bytes downloaded and the total (when known). The call does not resolve — the
 * app relaunches once the new bundle is in place.
 */
export async function installUpdate(
  onProgress?: (downloaded: number, total: number | null) => void,
): Promise<void> {
  let unlisten: UnlistenFn | undefined;
  if (onProgress) {
    unlisten = await listen<UpdateProgress>("update://progress", (e) => {
      onProgress(e.payload.downloaded, e.payload.total);
    });
  }
  try {
    await invoke("install_update_cmd");
  } finally {
    unlisten?.();
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
