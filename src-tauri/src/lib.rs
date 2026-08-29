mod commands;
mod git;
mod security;
mod store;
mod types;
mod updater;
mod watcher;

use commands::AppState;
use store::Store;
use tauri::{AppHandle, Emitter, Listener, Manager, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use types::Settings;

const WEBSITE_URL: &str = "https://mipyip.com";
const GITHUB_URL: &str = "https://github.com/tonywxx/tmd";

fn focused_or_main(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    let windows = app.webview_windows();
    for (_label, w) in windows.iter() {
        if w.is_focused().unwrap_or(false) {
            return Some(w.clone());
        }
    }
    app.get_webview_window("main")
}

fn emit_menu(app: &AppHandle, event: &str, payload: impl serde::Serialize + Clone) {
    if let Some(w) = focused_or_main(app) {
        let _ = w.emit(event, payload);
    }
}

fn spawn_main_window(app: &AppHandle, label: &str) {
    if app.get_webview_window(label).is_some() {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.set_focus();
        }
        return;
    }
    let _ = tauri::WebviewWindowBuilder::new(
        app,
        label,
        tauri::WebviewUrl::App("/?fresh=true".into()),
    )
    .title("tmd")
    .inner_size(1100.0, 720.0)
    .min_inner_size(640.0, 400.0)
    .decorations(false)
    .transparent(true)
    .build();
}

// Bring the main window back on screen. Closing it hides it rather than
// destroying it (see the CloseRequested handler), so this restores the whole
// editing session — tabs, unsaved buffers and all — instead of reloading.
fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn build_menu(app: &AppHandle, recent: Vec<String>) -> tauri::menu::Menu<tauri::Wry> {
    use tauri::menu::{IsMenuItem, PredefinedMenuItem};

    // Helper: build a plain menu item with id/text/accelerator.
    let item = |id: &str, text: &str, acc: &str| -> tauri::menu::MenuItem<tauri::Wry> {
        let acc: Option<&str> = if acc.is_empty() { None } else { Some(acc) };
        tauri::menu::MenuItem::with_id(app, id, text, true, acc).expect("menu item")
    };

    // App menu
    let app_sub = tauri::menu::Submenu::with_items(
        app,
        "tmd",
        true,
        &[
            &tauri::menu::MenuItem::with_id(app, "about", "About tmd", true, None::<&str>).unwrap(),
            &PredefinedMenuItem::separator(app).unwrap(),
            &PredefinedMenuItem::services(app, Some("Services")).unwrap(),
            &PredefinedMenuItem::separator(app).unwrap(),
            &PredefinedMenuItem::hide(app, Some("Hide tmd")).unwrap(),
            &PredefinedMenuItem::hide_others(app, Some("Hide Others")).unwrap(),
            &PredefinedMenuItem::show_all(app, Some("Show All")).unwrap(),
            &PredefinedMenuItem::separator(app).unwrap(),
            &PredefinedMenuItem::quit(app, Some("Quit tmd")).unwrap(),
        ],
    )
    .unwrap();

    // File -> Open Recent
    let mut recent_owned: Vec<tauri::menu::MenuItem<tauri::Wry>> = Vec::new();
    if recent.is_empty() {
        recent_owned.push(
            tauri::menu::MenuItem::with_id(app, "recent-none", "(None)", false, None::<&str>).unwrap(),
        );
    } else {
        for f in recent.iter().take(15) {
            let name = std::path::Path::new(f)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            recent_owned.push(item(&format!("recent||{}", f), &name, ""));
        }
    }
    let recent_sep = PredefinedMenuItem::separator(app).unwrap();
    let recent_clear = item("recent-clear", "Clear Recent", "");
    let mut recent_items: Vec<&dyn IsMenuItem<tauri::Wry>> = recent_owned
        .iter()
        .map(|i| i as &dyn IsMenuItem<tauri::Wry>)
        .collect();
    if !recent.is_empty() {
        recent_items.push(&recent_sep);
        recent_items.push(&recent_clear);
    }
    let recent_sub =
        tauri::menu::Submenu::with_items(app, "Open Recent", true, &recent_items).unwrap();

    let export_sub = tauri::menu::Submenu::with_items(
        app,
        "Export As",
        true,
        &[&item("export-pdf", "PDF", ""), &item("export-html", "HTML", "")],
    )
    .unwrap();

    let file_sub = tauri::menu::Submenu::with_items(
        app,
        "File",
        true,
        &[
            &item("new-file", "New File", "CmdOrCtrl+N"),
            &item("new-window", "New Window", "CmdOrCtrl+Shift+N"),
            &item("open-file", "Open File…", "CmdOrCtrl+O"),
            &item("open-folder", "Open Folder…", "CmdOrCtrl+Shift+O"),
            &item("open-from-path", "Open from Path…", "CmdOrCtrl+Shift+P"),
            &item("open-from-url", "Open from URL…", "CmdOrCtrl+Shift+U"),
            &recent_sub,
            &item("save", "Save", "CmdOrCtrl+S"),
            &item("save-as", "Save As…", "CmdOrCtrl+Shift+S"),
            &item("duplicate", "Duplicate", ""),
            &export_sub,
            &item("close-tab", "Close Tab", "CmdOrCtrl+W"),
            &item("close-window", "Close Window", "CmdOrCtrl+Shift+W"),
        ],
    )
    .unwrap();

    // Edit -> Text Transforms
    let tforms: [(&str, &str, &str); 9] = [
        ("unicode-italic", "Unicode Italic", "CmdOrCtrl+Alt+I"),
        ("unicode-bold", "Unicode Bold", "CmdOrCtrl+Alt+B"),
        ("unicode-bold-italic", "Unicode Bold Italic", ""),
        ("unicode-monospace", "Unicode Monospace", ""),
        ("small-caps", "Small Caps", ""),
        ("strikethrough", "Strikethrough", ""),
        ("uppercase", "UPPERCASE", ""),
        ("lowercase", "lowercase", ""),
        ("title-case", "Title Case", ""),
    ];
    let transforms_owned: Vec<tauri::menu::MenuItem<tauri::Wry>> = tforms
        .iter()
        .map(|(id, label, acc)| item(id, label, acc))
        .collect();
    let titems: Vec<&dyn IsMenuItem<tauri::Wry>> = transforms_owned
        .iter()
        .map(|i| i as &dyn IsMenuItem<tauri::Wry>)
        .collect();
    let transforms_sub =
        tauri::menu::Submenu::with_items(app, "Text Transforms", true, &titems).unwrap();

    let edit_sub = tauri::menu::Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &item("undo", "Undo", "CmdOrCtrl+Z"),
            &item("redo", "Redo", "CmdOrCtrl+Shift+Z"),
            &PredefinedMenuItem::separator(app).unwrap(),
            &item("cut", "Cut", "CmdOrCtrl+X"),
            &item("copy", "Copy", "CmdOrCtrl+C"),
            &item("paste", "Paste", "CmdOrCtrl+V"),
            &item("select-all", "Select All", "CmdOrCtrl+A"),
            &PredefinedMenuItem::separator(app).unwrap(),
            &item("copy-file-content", "Copy File Contents", ""),
            &item("copy-selection-with-context", "Copy Selection with Path", "CmdOrCtrl+Alt+C"),
            &transforms_sub,
            &item("find-in-folder", "Find in Folder…", "CmdOrCtrl+Shift+G"),
        ],
    )
    .unwrap();

    // View
    let view_sub = tauri::menu::Submenu::with_items(
        app,
        "View",
        true,
        &[
            &item("reload", "Reload", "CmdOrCtrl+R"),
            &item("force-reload", "Force Reload", "CmdOrCtrl+Shift+R"),
            &item("toggle-devtools", "Toggle DevTools", "CmdOrCtrl+Shift+I"),
            &PredefinedMenuItem::separator(app).unwrap(),
            &item("reset-zoom", "Reset Zoom", ""),
            &item("zoom-in", "Zoom In", ""),
            &item("zoom-out", "Zoom Out", ""),
            &item("toggle-fullscreen", "Toggle Fullscreen", ""),
            &item("focus-mode", "Focus Mode", "CmdOrCtrl+Shift+F"),
        ],
    )
    .unwrap();

    // Window
    let window_sub = tauri::menu::Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &item("minimize", "Minimize", "CmdOrCtrl+M"),
            &item("zoom", "Zoom", ""),
            &PredefinedMenuItem::separator(app).unwrap(),
            &item("close-window", "Close Window", "CmdOrCtrl+Shift+W"),
        ],
    )
    .unwrap();

    // Help
    let help_sub = tauri::menu::Submenu::with_items(
        app,
        "Help",
        true,
        &[
            &item("about", "About tmd", ""),
            &item("visit-website", "Visit Website", ""),
            &item("view-github", "View on GitHub", ""),
        ],
    )
    .unwrap();

    tauri::menu::Menu::with_items(
        app,
        &[&app_sub, &file_sub, &edit_sub, &view_sub, &window_sub, &help_sub],
    )
    .unwrap()
}
pub(crate) fn update_global_hotkey(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let _ = app.global_shortcut().unregister_all();
    if !settings.global_hotkeys_enabled {
        return Ok(());
    }
    let sc: Shortcut = settings
        .global_hotkey_open_path
        .parse()
        .map_err(|e| format!("invalid shortcut: {}", e))?;
    let app_clone = app.clone();
    app.global_shortcut()
        .on_shortcut(sc, move |_app, _shortcut, _event| {
            // A closed main window is only hidden, so surface it first —
            // otherwise the "Open from Path" dialog opens out of sight.
            show_main_window(&app_clone);
            if let Some(w) = app_clone.get_webview_window("main") {
                let _ = w.emit("open-from-path", ());
            }
        })
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            for arg in argv {
                if arg.starts_with("tmd://") {
                    // Same reasoning as the global hotkey: the window may only
                    // be hidden, so bring it back before handing over the URL.
                    show_main_window(app);
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.emit("deep-link://tmd", arg);
                    }
                }
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build());

    builder = builder.setup(|app| {
        let app_handle = app.handle().clone();
        let app_data_dir = app.path().app_data_dir().unwrap_or_else(|_| {
            std::path::PathBuf::from(std::env::temp_dir()).join("tmd")
        });
        let store = Store::new(app_data_dir);
        let watcher = watcher::init(&app_handle);
        let settings = store.get_settings();

        app.manage(AppState { store, watcher });

        // native menu
        let menu = build_menu(&app_handle, settings.recent_files.clone());
        app.set_menu(menu).ok();

        // global hotkey
        let _ = update_global_hotkey(&app_handle, &settings);

        // restore window bounds for main window
        if let Some(b) = settings.window_bounds {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_position(tauri::PhysicalPosition::new(b.x as i32, b.y as i32));
                let _ = w.set_size(tauri::PhysicalSize::new(b.width as u32, b.height as u32));
            }
        }

        // rebuild dynamic menu when recent files change
        let rebuild_handle = app.handle().clone();
        app.listen("menu:rebuild", move |_ev| {
            let recent = rebuild_handle
                .state::<AppState>()
                .store
                .get_settings()
                .recent_files;
            let menu = build_menu(&rebuild_handle, recent);
            let _ = rebuild_handle.set_menu(menu);
        });

        Ok(())
    });

    builder = builder.on_menu_event(|app, event| {
        let id = event.id().as_ref();
        match id {
            "about" => emit_menu(app, "show-about", ()),
            "new-file" => emit_menu(app, "menu-new-file", ()),
            "new-window" => {
                // find a free main-N label
                let mut n = 2;
                while app.get_webview_window(&format!("main-{}", n)).is_some() {
                    n += 1;
                }
                spawn_main_window(app, &format!("main-{}", n));
            }
            "open-file" => emit_menu(app, "menu-open-file", ()),
            "open-folder" => emit_menu(app, "menu-open-folder", ()),
            "open-from-path" => emit_menu(app, "open-from-path", ()),
            "open-from-url" => emit_menu(app, "open-from-url", ()),
            "save" => emit_menu(app, "menu-save", ()),
            "save-as" => emit_menu(app, "menu-save-as", ()),
            "duplicate" => emit_menu(app, "menu-duplicate", ()),
            "export-pdf" => emit_menu(app, "menu-export-pdf", ()),
            "export-html" => emit_menu(app, "menu-export-html", ()),
            "close-tab" => emit_menu(app, "menu-close-tab", ()),
            "close-window" => emit_menu(app, "menu-close-window", ()),
            "undo" => emit_menu(app, "menu-undo", ()),
            "redo" => emit_menu(app, "menu-redo", ()),
            "cut" => emit_menu(app, "menu-cut", ()),
            "copy" => emit_menu(app, "menu-copy", ()),
            "paste" => emit_menu(app, "menu-paste", ()),
            "select-all" => emit_menu(app, "menu-select-all", ()),
            "copy-file-content" => emit_menu(app, "menu-copy-file-content", ()),
            "copy-selection-with-context" => emit_menu(app, "menu-copy-selection-with-context", ()),
            "find-in-folder" => emit_menu(app, "menu-find-in-folder", ()),
            "reload" => emit_menu(app, "menu-reload", ()),
            "force-reload" => emit_menu(app, "menu-force-reload", ()),
            "toggle-devtools" => emit_menu(app, "menu-toggle-devtools", ()),
            "reset-zoom" => emit_menu(app, "menu-reset-zoom", ()),
            "zoom-in" => emit_menu(app, "menu-zoom-in", ()),
            "zoom-out" => emit_menu(app, "menu-zoom-out", ()),
            "toggle-fullscreen" => emit_menu(app, "menu-toggle-fullscreen", ()),
            "focus-mode" => emit_menu(app, "menu-focus-mode", ()),
            "minimize" => emit_menu(app, "menu-minimize", ()),
            "zoom" => emit_menu(app, "menu-zoom", ()),
            "visit-website" => emit_menu(app, "open-external", WEBSITE_URL),
            "view-github" => emit_menu(app, "open-external", GITHUB_URL),
            "recent-clear" => emit_menu(app, "menu-recent-clear", ()),
            _ => {
                if id.starts_with("recent||") {
                    let path = id.trim_start_matches("recent||");
                    emit_menu(app, "menu-open-recent", path);
                } else if id.starts_with("text-transform||") {
                    let t = id.trim_start_matches("text-transform||");
                    emit_menu(app, "menu-text-transform", t);
                }
            }
        }
    });

    builder = builder.on_page_load(|window, payload| {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open("/tmp/tmd-page-load.log")
        {
            let _ = writeln!(
                f,
                "[page_load] label={} event={:?} url={}",
                window.label(),
                payload.event(),
                payload.url()
            );
        }
    });

    builder = builder.on_window_event(|window, event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            let app = window.app_handle();
            let pos = window.outer_position().ok();
            let size = window.inner_size().ok();
            if let (Some(pos), Some(size)) = (pos, size) {
                let state = app.state::<AppState>();
                let mut s = state.store.get_settings();
                s.window_bounds = Some(types::WindowBounds {
                    x: pos.x as f64,
                    y: pos.y as f64,
                    width: size.width as f64,
                    height: size.height as f64,
                });
                state.store.set_settings(s);
            }
            // macOS: the main window is hidden instead of destroyed so the
            // process stays alive (the hidden `export` webview already keeps
            // it alive) and a Dock click can bring the session back — see the
            // Reopen handler below. Only the main window behaves this way;
            // secondary windows really do close.
            #[cfg(target_os = "macos")]
            if window.label() == "main" {
                api.prevent_close();
                let _ = window.hide();
            }
        }
    });

    let app = builder
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::write_file_base64,
            commands::read_directory,
            commands::file_stat,
            commands::file_exists,
            commands::file_basename,
            commands::file_dirname,
            commands::file_resolve_path,
            commands::file_rename,
            commands::file_mkdir,
            commands::file_create,
            commands::file_trash,
            commands::file_show_in_folder,
            commands::search_in_folder,
            commands::export_html,
            commands::watch_file_cmd,
            commands::unwatch_file_cmd,
            commands::watch_directory_cmd,
            commands::unwatch_directory_cmd,
            commands::git_get_baseline,
            commands::settings_get,
            commands::settings_set,
            commands::recent_get_files,
            commands::recent_add_file,
            commands::session_get,
            commands::session_set,
            commands::app_version,
            commands::app_home_dir,
            commands::app_open_external,
            commands::is_image_allowed,
            commands::image_data_uri,
            commands::focus_open_window,
            commands::focus_bring_to_front,
            commands::update_global_hotkey_cmd,
            commands::print_window,
            commands::log_frontend_error,
            updater::check_update_cmd,
            updater::download_update_cmd,
            updater::install_update_cmd,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        // Dock icon click (or reopen from Finder) while no window is on
        // screen: bring the hidden main window back.
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen {
            has_visible_windows, ..
        } => {
            if !has_visible_windows {
                show_main_window(&app_handle);
            }
        }
        _ => {}
    });
}
