use crate::types::{Session, Settings};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Serialize, Deserialize, Default)]
struct StoreData {
    settings: Settings,
    sessions: HashMap<String, Session>,
}

pub struct Store {
    path: PathBuf,
    data: Mutex<StoreData>,
}

impl Store {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let path = app_data_dir.join("settings.json");
        let data = fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<StoreData>(&s).ok())
            .unwrap_or_default();
        // Fill any missing settings keys with defaults.
        let mut data = data;
        data.settings = merge_settings(data.settings);
        Store {
            path,
            data: Mutex::new(data),
        }
    }

    pub fn get_settings(&self) -> Settings {
        self.data.lock().unwrap().settings.clone()
    }

    pub fn set_settings(&self, settings: Settings) {
        let mut d = self.data.lock().unwrap();
        d.settings = settings;
        self.flush_locked(&d);
    }

    pub fn get_session(&self, window_id: &str) -> Option<Session> {
        self.data.lock().unwrap().sessions.get(window_id).cloned()
    }

    pub fn set_session(&self, window_id: &str, session: Session) {
        let mut d = self.data.lock().unwrap();
        d.sessions.insert(window_id.to_string(), session);
        self.flush_locked(&d);
    }

    /// Synchronous write. Safe to call on quit / update.
    #[allow(dead_code)]
    pub fn flush(&self) {
        let d = self.data.lock().unwrap();
        self.flush_locked(&d);
    }

    fn flush_locked(&self, d: &StoreData) {
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(d) {
            let _ = fs::write(&self.path, json);
        }
    }
}

/// Merge a (possibly partial) settings object with defaults so older/partial
/// payloads never produce missing keys. Zero/empty values are treated as
/// "unset" and filled from defaults — this also repairs settings written by an
/// earlier build that persisted the all-zeros `Default` derive (fontSize 0
/// rendered the editor with an invisible 0px font).
fn merge_settings(existing: Settings) -> Settings {
    let d = Settings::default();
    Settings {
        theme: if existing.theme.is_empty() { d.theme } else { existing.theme },
        markdown_theme: if existing.markdown_theme.is_empty() { d.markdown_theme } else { existing.markdown_theme },
        accent_color: if existing.accent_color.is_empty() { d.accent_color } else { existing.accent_color },
        font_size: if existing.font_size == 0 { d.font_size } else { existing.font_size },
        font_family: if existing.font_family.is_empty() { d.font_family } else { existing.font_family },
        preview_font_family: if existing.preview_font_family.is_empty() { d.preview_font_family } else { existing.preview_font_family },
        show_line_numbers: existing.show_line_numbers,
        auto_save: existing.auto_save,
        auto_save_delay: if existing.auto_save_delay == 0 { d.auto_save_delay } else { existing.auto_save_delay },
        file_browser_width: if existing.file_browser_width == 0 { d.file_browser_width } else { existing.file_browser_width },
        editor_split: if existing.editor_split == 0.0 { d.editor_split } else { existing.editor_split },
        recent_files: existing.recent_files,
        recent_directories: existing.recent_directories,
        window_bounds: existing.window_bounds,
        favorites: existing.favorites,
        show_file_dates: existing.show_file_dates,
        pending_whats_new_notes: existing.pending_whats_new_notes,
        global_hotkeys_enabled: existing.global_hotkeys_enabled,
        global_hotkey_open_path: if existing.global_hotkey_open_path.is_empty() { d.global_hotkey_open_path } else { existing.global_hotkey_open_path },
        beta_updates: existing.beta_updates,
    }
}
