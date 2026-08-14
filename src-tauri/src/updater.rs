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

/// Download and install the pending update, emitting `update://progress`
/// (`{ downloaded, total }`) events as bytes arrive, then relaunch the updated
/// app in place. Uses the same channel-selection rule as `check_update_cmd`.
#[tauri::command]
pub async fn install_update_cmd(app: AppHandle) -> Result<(), String> {
    let beta = app.state::<AppState>().store.get_settings().beta_updates;

    if beta {
        if let Ok(Some(u)) = build_updater(&app, &[BETA_ENDPOINT])?.check().await {
            return download_and_install(app, u).await;
        }
    }

    let update = build_updater(&app, &[STABLE_ENDPOINT])?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no update available".to_string())?;
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

    // The new app bundle is now in place. Relaunch it and exit this process.
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::process::Command::new(&exe).spawn();
    }
    std::process::exit(0);
}
