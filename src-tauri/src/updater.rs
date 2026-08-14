use std::cell::Cell;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

use crate::commands::AppState;

const STABLE_ENDPOINT: &str = "https://github.com/tonywxx/tmd/releases/latest/download/latest.json";
const BETA_ENDPOINT: &str = "https://github.com/tonywxx/tmd/releases/beta/download/latest.json";

const UPDATE_PROGRESS_EVENT: &str = "update://progress";

/// Mirrors the frontend `UpdateInfo` shape (`src/lib/state/types.ts`).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub date: Option<String>,
    pub notes: Option<String>,
    pub body: Option<String>,
}

fn endpoint(url: &str) -> Url {
    Url::parse(url).expect("valid updater endpoint")
}

/// Build an `Updater` pointed at the given release endpoints.
fn build_updater(app: &AppHandle, endpoints: &[&str]) -> Result<tauri_plugin_updater::Updater, String> {
    let urls: Vec<Url> = endpoints.iter().map(|e| endpoint(e)).collect();
    app.updater_builder()
        .endpoints(urls)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())
}

fn map_update(u: &Update) -> UpdateInfo {
    UpdateInfo {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        date: u.date.map(|d| d.to_string()),
        notes: u.body.clone(),
        body: u.body.clone(),
    }
}

/// Select the pending update using the same channel rule as `check_update_cmd`:
/// beta channel first when enabled, otherwise stable. Errors when no update is
/// available on either channel.
async fn pick_update(app: &AppHandle, beta: bool) -> Result<Update, String> {
    if beta {
        if let Ok(Some(u)) = build_updater(app, &[BETA_ENDPOINT])?.check().await {
            return Ok(u);
        }
    }
    build_updater(app, &[STABLE_ENDPOINT])?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no update available".to_string())
}

/// Check GitHub for a newer release.
///
/// Beta users first check the `beta` channel; if that endpoint is unreachable
/// (e.g. no beta release has been published yet) we fall back to `stable` so
/// they still receive normal updates. Returns `null` when already up to date.
#[tauri::command]
pub async fn check_update_cmd(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let beta = app.state::<AppState>().store.get_settings().beta_updates;

    if beta {
        match build_updater(&app, &[BETA_ENDPOINT])?.check().await {
            Ok(Some(u)) => return Ok(Some(map_update(&u))),
            // No update on beta, or beta endpoint unavailable: try stable.
            Ok(None) => {}
            Err(_) => {}
        }
    }

    let update = build_updater(&app, &[STABLE_ENDPOINT])?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    Ok(update.map(|u| map_update(&u)))
}

/// Download the pending update to a temp file, emitting `update://progress`
/// (`{ downloaded, total }`) events as bytes arrive. Returns the path to the
/// downloaded archive on disk so the caller can install it later (e.g. when the
/// user clicks "Restart to update" in the sidebar) without re-downloading.
#[tauri::command]
pub async fn download_update_cmd(app: AppHandle) -> Result<String, String> {
    let beta = app.state::<AppState>().store.get_settings().beta_updates;
    let update = pick_update(&app, beta).await?;

    let tmp = std::env::temp_dir().join(format!("tmd_update_{}.tar.gz", update.version));
    let downloaded = Cell::new(0usize);
    let bytes = update
        .download(
            {
                let app = app.clone();
                move |chunk, total| {
                    let d = downloaded.get() + chunk;
                    downloaded.set(d);
                    let _ = app.emit(
                        UPDATE_PROGRESS_EVENT,
                        serde_json::json!({ "downloaded": d, "total": total }),
                    );
                }
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;

    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    Ok(tmp.to_string_lossy().to_string())
}

/// Install the pending update and relaunch.
///
/// `archive_path` optionally points at a pre-downloaded archive produced by
/// `download_update_cmd` (the background auto-download path). When provided and
/// readable, the update is installed directly from that file and no download
/// happens. Otherwise the archive is downloaded and installed in one step
/// (used by the manual "Check for Updates" flow in the About dialog).
#[tauri::command]
pub async fn install_update_cmd(
    app: AppHandle,
    archive_path: Option<String>,
) -> Result<(), String> {
    let beta = app.state::<AppState>().store.get_settings().beta_updates;
    let update = pick_update(&app, beta).await?;

    if let Some(path) = archive_path {
        if let Ok(bytes) = std::fs::read(&path) {
            update.install(&bytes).map_err(|e| e.to_string())?;
            relaunch();
            return Ok(());
        }
    }

    download_and_install(app, update).await
}

async fn download_and_install(app: AppHandle, update: Update) -> Result<(), String> {
    let downloaded = Cell::new(0usize);
    update
        .download_and_install(
            {
                let app = app.clone();
                move |chunk, total| {
                    let d = downloaded.get() + chunk;
                    downloaded.set(d);
                    let _ = app.emit(
                        UPDATE_PROGRESS_EVENT,
                        serde_json::json!({ "downloaded": d, "total": total }),
                    );
                }
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;

    relaunch();
    Ok(())
}

/// The new app bundle is now in place. Relaunch it and exit this process.
fn relaunch() {
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::process::Command::new(&exe).spawn();
    }
    std::process::exit(0);
}
