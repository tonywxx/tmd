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
 * Download the pending update in the background, emitting `update://progress`
 * events. Returns the path to the downloaded archive on disk so the caller can
 * later install it via `installUpdate` without re-downloading. Resolves once
 * the download (and signature verification) completes.
 */
export async function downloadUpdate(
  onProgress?: (downloaded: number, total: number | null) => void,
): Promise<string> {
  let unlisten: UnlistenFn | undefined;
  if (onProgress) {
    unlisten = await listen<UpdateProgress>("update://progress", (e) => {
      onProgress(e.payload.downloaded, e.payload.total);
    });
  }
  try {
    return await invoke<string>("download_update_cmd");
  } finally {
    unlisten?.();
  }
}

/**
 * Install (and relaunch into) the pending update. `onProgress` receives
 * cumulative bytes downloaded and the total (when known) — used only when
 * `archivePath` is omitted, in which case the archive is downloaded first. The
 * call does not resolve — the app relaunches once the new bundle is in place.
 *
 * When `archivePath` is provided (a file produced by `downloadUpdate`), the
 * pre-downloaded archive is installed directly with no re-download.
 */
export async function installUpdate(
  onProgress?: (downloaded: number, total: number | null) => void,
  archivePath?: string,
): Promise<void> {
  let unlisten: UnlistenFn | undefined;
  if (onProgress) {
    unlisten = await listen<UpdateProgress>("update://progress", (e) => {
      onProgress(e.payload.downloaded, e.payload.total);
    });
  }
  try {
    await invoke("install_update_cmd", archivePath ? { archivePath } : {});
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
