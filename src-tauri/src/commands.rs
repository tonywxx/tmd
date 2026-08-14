use crate::git;
use crate::security::{home_dir, is_allowed_image_ext, is_external_scheme_allowed, is_path_allowed};
use crate::store::Store;
use crate::types::{
    FileEntry, FileStat, ResolvedPath, SearchFileResult, SearchResult, Session, Settings,
};
use crate::watcher::{self, WatcherState};
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tauri::{
    AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder,
};

pub struct AppState {
    pub store: Store,
    pub watcher: Arc<WatcherState>,
}

type CmdResult<T> = std::result::Result<T, String>;

/// Diagnostic helper: frontend errors are appended here so they can be read
/// from /tmp/tmd-frontend-error.log even when no display/screenshot is available.
#[tauri::command]
pub fn log_frontend_error(msg: String) -> CmdResult<()> {
    use std::io::Write;
    if let Ok(mut f) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("/tmp/tmd-frontend-error.log")
    {
        let _ = writeln!(f, "{}", msg);
    }
    Ok(())
}

const MARKDOWN_EXTS: &[&str] = &[
    ".md", ".markdown", ".mdown", ".mkd", ".mkdn", ".mdwn", ".mdx", ".txt",
];

fn is_markdown(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    MARKDOWN_EXTS.iter().any(|e| lower.ends_with(e))
}

fn fs_meta_time(meta: &fs::Metadata, created: bool) -> u64 {
    use std::time::UNIX_EPOCH;
    let t = if created {
        meta.created().ok()
    } else {
        meta.modified().ok()
    };
    t.and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ---------- file ops ----------

#[tauri::command]
pub fn read_file(path: String) -> CmdResult<String> {
    if !is_path_allowed(&path) {
        return Err("path not allowed".into());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> CmdResult<()> {
    if !is_path_allowed(&path) {
        return Err("path not allowed".into());
    }
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Write a base64-encoded binary payload (e.g. a PNG rendered in the preview)
/// to disk. Used by the "save diagram as PNG" action.
#[tauri::command]
pub fn write_file_base64(path: String, data: String) -> CmdResult<()> {
    if !is_path_allowed(&path) {
        return Err("path not allowed".into());
    }
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("invalid base64: {e}"))?;
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_directory(path: String) -> CmdResult<Vec<FileEntry>> {
    if !is_path_allowed(&path) {
        return Err("path not allowed".into());
    }
    let mut entries: Vec<FileEntry> = Vec::new();
    let read = fs::read_dir(&path).map_err(|e| e.to_string())?;
    for entry in read.flatten() {
        let p = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        // skip dotfiles
        if name.starts_with('.') {
            continue;
        }
        let meta = match fs::metadata(&p) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let is_dir = meta.is_dir();
        entries.push(FileEntry {
            name,
            path: p.to_string_lossy().to_string(),
            is_directory: is_dir,
            is_markdown: !is_dir && is_markdown(&p.to_string_lossy()),
            modified_time: fs_meta_time(&meta, false),
            created_time: fs_meta_time(&meta, true),
        });
    }
    entries.sort_by(|a, b| {
        if a.is_directory != b.is_directory {
            return b.is_directory.cmp(&a.is_directory);
        }
        a.name.to_lowercase().cmp(&b.name.to_lowercase())
    });
    Ok(entries)
}

#[tauri::command]
pub fn file_stat(path: String) -> CmdResult<Option<FileStat>> {
    if !is_path_allowed(&path) {
        return Err("path not allowed".into());
    }
    match fs::metadata(&path) {
        Ok(m) => Ok(Some(FileStat {
            modified_time: fs_meta_time(&m, false),
            created_time: fs_meta_time(&m, true),
        })),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn file_exists(path: String) -> CmdResult<bool> {
    Ok(Path::new(&path).exists())
}

#[tauri::command]
pub fn file_basename(path: String) -> String {
    Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[tauri::command]
pub fn file_dirname(path: String) -> String {
    Path::new(&path)
        .parent()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[tauri::command]
pub fn file_resolve_path(input: String, base: Option<String>) -> CmdResult<Option<ResolvedPath>> {
    let expanded = if input.starts_with('~') {
        let home = home_dir();
        home.join(input.trim_start_matches('~').trim_start_matches('/'))
            .to_string_lossy()
            .to_string()
    } else if Path::new(&input).is_absolute() {
        input
    } else {
        let base_dir = base
            .and_then(|b| if b.is_empty() { None } else { Some(b) })
            .unwrap_or_else(|| home_dir().to_string_lossy().to_string());
        Path::new(&base_dir)
            .join(&input)
            .to_string_lossy()
            .to_string()
    };

    if !is_path_allowed(&expanded) {
        return Ok(None);
    }
    let meta = match fs::metadata(&expanded) {
        Ok(m) => m,
        Err(_) => return Ok(None),
    };
    Ok(Some(ResolvedPath {
        path: expanded,
        is_directory: meta.is_dir(),
    }))
}

#[tauri::command]
pub fn file_rename(old_path: String, new_path: String) -> CmdResult<()> {
    if !is_path_allowed(&old_path) || !is_path_allowed(&new_path) {
        return Err("path not allowed".into());
    }
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn file_mkdir(path: String) -> CmdResult<()> {
    if !is_path_allowed(&path) {
        return Err("path not allowed".into());
    }
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn file_create(path: String) -> CmdResult<()> {
    if !is_path_allowed(&path) {
        return Err("path not allowed".into());
    }
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn file_trash(path: String) -> CmdResult<()> {
    if !is_path_allowed(&path) {
        return Err("path not allowed".into());
    }
    trash::delete(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn file_show_in_folder(path: String) -> CmdResult<()> {
    if !is_path_allowed(&path) {
        return Err("path not allowed".into());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .status()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
    }
    Ok(())
}

#[tauri::command]
pub fn search_in_folder(
    path: String,
    query: String,
    case_sensitive: bool,
) -> CmdResult<SearchResult> {
    if !is_path_allowed(&path) {
        return Err("path not allowed".into());
    }
    let q = if case_sensitive {
        query.clone()
    } else {
        query.to_lowercase()
    };
    let mut max_files = 5000u32;
    let mut max_results = 1000u32;
    let max_depth = 10u32;
    let mut files_scanned: u32 = 0;
    let mut match_count: u32 = 0;
    let mut capped = false;
    let mut results: Vec<SearchFileResult> = Vec::new();

    fn walk(
        dir: &Path,
        depth: u32,
        q: &str,
        query: &str,
        case_sensitive: bool,
        max_files: &mut u32,
        max_results: &mut u32,
        match_count: &mut u32,
        capped: &mut bool,
        results: &mut Vec<SearchFileResult>,
        max_depth: u32,
        files_scanned: &mut u32,
    ) {
        if depth > max_depth || *max_files >= 5000 || *max_results >= 1000 {
            if *max_results >= 1000 {
                *capped = true;
            }
            return;
        }
        let read = match fs::read_dir(dir) {
            Ok(r) => r,
            Err(_) => return,
        };
        for entry in read.flatten() {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.')
                || name == "node_modules"
                || name == "target"
                || name == "dist"
            {
                continue;
            }
            let meta = match fs::metadata(&p) {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_dir() {
                walk(
                    &p,
                    depth + 1,
                    q,
                    query,
                    case_sensitive,
                    max_files,
                    max_results,
                    match_count,
                    capped,
                    results,
                    max_depth,
                    files_scanned,
                );
            } else {
                *files_scanned += 1;
                *max_files += 1;
                if *max_results >= 1000 {
                    *capped = true;
                    return;
                }
                let mut sfr = SearchFileResult {
                    file: p.to_string_lossy().to_string(),
                    filename_matches: Vec::new(),
                    content_matches: Vec::new(),
                };
                let name_lower = name.to_lowercase();
                if name_lower.contains(q) {
                    sfr.filename_matches.push((0, name.clone()));
                    *match_count += 1;
                }
                // content scan (text files only)
                if is_markdown(&name) || name.ends_with(".txt") {
                    if let Ok(content) = fs::read_to_string(&p) {
                        for (i, line) in content.lines().enumerate() {
                            let hay = if case_sensitive {
                                line.to_string()
                            } else {
                                line.to_lowercase()
                            };
                            if hay.contains(q) {
                                sfr.content_matches.push((i as u32 + 1, line.to_string()));
                                *match_count += 1;
                                if sfr.content_matches.len() >= 50 {
                                    break;
                                }
                            }
                        }
                    }
                }
                if !sfr.filename_matches.is_empty() || !sfr.content_matches.is_empty() {
                    results.push(sfr);
                    *max_results += 1;
                }
            }
        }
    }

    walk(
        Path::new(&path),
        0,
        &q,
        &query,
        case_sensitive,
        &mut max_files,
        &mut max_results,
        &mut match_count,
        &mut capped,
        &mut results,
        max_depth,
        &mut files_scanned,
    );

    Ok(SearchResult {
        files_scanned,
        match_count,
        capped,
        results,
    })
}

#[tauri::command]
pub fn export_html(path: String, html: String) -> CmdResult<()> {
    if !is_path_allowed(&path) {
        return Err("path not allowed".into());
    }
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, html).map_err(|e| e.to_string())
}

// ---------- watching ----------

#[tauri::command]
pub fn watch_file_cmd(state: State<AppState>, path: String) -> CmdResult<()> {
    watcher::watch_file(&state.watcher, &path)
}

#[tauri::command]
pub fn unwatch_file_cmd(state: State<AppState>, path: String) {
    watcher::unwatch_file(&state.watcher, &path);
}

#[tauri::command]
pub fn watch_directory_cmd(state: State<AppState>, path: String) -> CmdResult<()> {
    watcher::watch_directory(&state.watcher, &path)
}

#[tauri::command]
pub fn unwatch_directory_cmd(state: State<AppState>, path: String) {
    watcher::unwatch_directory(&state.watcher, &path);
}

// ---------- git ----------

#[tauri::command]
pub fn git_get_baseline(path: String) -> CmdResult<Option<String>> {
    Ok(git::get_baseline(&path))
}

// ---------- settings / recent / session ----------

#[tauri::command]
pub fn settings_get(state: State<AppState>) -> Settings {
    state.store.get_settings()
}

#[tauri::command]
pub fn settings_set(state: State<AppState>, settings: Settings) {
    state.store.set_settings(settings);
}

#[tauri::command]
pub fn recent_get_files(state: State<AppState>) -> Vec<String> {
    state.store.get_settings().recent_files
}

#[tauri::command]
pub fn recent_add_file(state: State<AppState>, path: String) {
    let mut s = state.store.get_settings();
    s.recent_files.retain(|p| p != &path);
    s.recent_files.insert(0, path);
    s.recent_files.truncate(15);
    state.store.set_settings(s);
}

#[tauri::command]
pub fn session_get(state: State<AppState>, window_id: String) -> Option<Session> {
    state.store.get_session(&window_id)
}

#[tauri::command]
pub fn session_set(state: State<AppState>, window_id: String, session: Session) {
    state.store.set_session(&window_id, session);
}

// ---------- app info ----------

#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn app_home_dir() -> String {
    home_dir().to_string_lossy().to_string()
}

#[tauri::command]
pub fn app_open_external(_app: AppHandle, url: String) -> CmdResult<()> {
    if !is_external_scheme_allowed(&url) {
        return Err("scheme not allowed".into());
    }
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_image_allowed(path: String) -> bool {
    is_allowed_image_ext(&path)
}

/// Read an image file and return an inline `data:` URI so the preview can render
/// local images without a custom protocol or filesystem scope exposure.
#[tauri::command]
pub fn image_data_uri(path: String) -> Option<String> {
    if !is_path_allowed(&path) || !is_allowed_image_ext(&path) {
        return None;
    }
    let bytes = fs::read(&path).ok()?;
    let ext = Path::new(&path)
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    };
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    Some(format!("data:{};base64,{}", mime, STANDARD.encode(&bytes)))
}

// ---------- focus mode ----------

#[tauri::command]
pub fn focus_open_window(
    app: AppHandle,
    file_path: String,
    tab_id: u32,
    parent_window_id: String,
) -> CmdResult<String> {
    let label = format!("focus-{}", tab_id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.set_focus();
        return Ok(label);
    }
    let url = format!(
        "/?mode=focus&filePath={}&tabId={}&parentWindowId={}",
        urlencoding(&file_path),
        tab_id,
        urlencoding(&parent_window_id)
    );
    let w = WebviewWindowBuilder::new(&app, label.clone(), WebviewUrl::App(url.into()))
        .title("tmd — Focus")
        .inner_size(1000.0, 720.0)
        .decorations(false)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = w.set_fullscreen(true);
    Ok(label)
}

#[tauri::command]
pub fn focus_bring_to_front(app: AppHandle, tab_id: u32) -> CmdResult<()> {
    let label = format!("focus-{}", tab_id);
    if let Some(w) = app.get_webview_window(&label) {
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn urlencoding(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

// ---------- helpers used by lib glue ----------

#[tauri::command]
pub fn update_global_hotkey_cmd(app: AppHandle, settings: Settings) -> CmdResult<()> {
    super::update_global_hotkey(&app, &settings)
}

/// Print the main window (used for PDF export). Requires the webview print
/// feature; the frontend has no `print()` in this API version.
#[tauri::command]
pub fn print_window(app: AppHandle, label: String) -> CmdResult<()> {
    if let Some(w) = app.get_webview_window(&label) {
        w.print().map_err(|e| e.to_string())?;
    }
    Ok(())
}
