use serde::{Deserialize, Serialize};

/// A row in the file-browser tree.
/// Serialized camelCase to match the frontend `FileEntry` type (types.ts).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub is_markdown: bool,
    pub modified_time: u64,
    pub created_time: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub modified_time: u64,
    pub created_time: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedPath {
    pub path: String,
    pub is_directory: bool,
}

#[derive(Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub files_scanned: u32,
    pub match_count: u32,
    pub capped: bool,
    pub results: Vec<SearchFileResult>,
}

#[derive(Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchFileResult {
    pub file: String,
    pub filename_matches: Vec<(u32, String)>,
    pub content_matches: Vec<(u32, String)>,
}

// ---- Settings (persisted) ----

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Settings {
    pub theme: String,
    pub markdown_theme: String,
    pub accent_color: String,
    pub font_size: u32,
    pub font_family: String,
    pub preview_font_family: String,
    pub show_line_numbers: bool,
    pub auto_save: bool,
    pub auto_save_delay: u32,
    pub file_browser_width: u32,
    pub editor_split: f32,
    pub recent_files: Vec<String>,
    pub recent_directories: Vec<String>,
    pub window_bounds: Option<WindowBounds>,
    pub favorites: Vec<Favorite>,
    pub show_file_dates: bool,
    pub pending_whats_new_notes: Option<String>,
    pub global_hotkeys_enabled: bool,
    pub global_hotkey_open_path: String,
    pub beta_updates: bool,
}

// Keep in sync with the frontend DEFAULT_SETTINGS (src/lib/constants.ts).
impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: "system".into(),
            markdown_theme: "github".into(),
            accent_color: "blue".into(),
            font_size: 14,
            font_family: "default".into(),
            preview_font_family: "default".into(),
            show_line_numbers: true,
            auto_save: false,
            auto_save_delay: 5000,
            file_browser_width: 180,
            editor_split: 0.5,
            recent_files: Vec::new(),
            recent_directories: Vec::new(),
            window_bounds: None,
            favorites: Vec::new(),
            show_file_dates: false,
            pending_whats_new_notes: None,
            global_hotkeys_enabled: false,
            global_hotkey_open_path: "CmdOrCtrl+Shift+Space".into(),
            beta_updates: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WindowBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Favorite {
    pub path: String,
    pub r#type: String,
}

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub open_files: Vec<String>,
    pub active_file: Option<String>,
    pub folder_path: Option<String>,
}
