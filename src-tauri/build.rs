fn main() {
    // Autogenerate permissions for our app-defined commands and allow them all
    // by default, so the frontend can call them. (Tauri v2 denies every command
    // unless an ACL permission explicitly allows it.)
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "read_file",
                "write_file",
                "write_file_base64",
                "read_directory",
                "file_stat",
                "file_exists",
                "file_basename",
                "file_dirname",
                "file_resolve_path",
                "file_rename",
                "file_mkdir",
                "file_create",
                "file_trash",
                "file_show_in_folder",
                "search_in_folder",
                "export_html",
                "watch_file_cmd",
                "unwatch_file_cmd",
                "watch_directory_cmd",
                "unwatch_directory_cmd",
                "git_get_baseline",
                "settings_get",
                "settings_set",
                "recent_get_files",
                "recent_add_file",
                "session_get",
                "session_set",
                "app_version",
                "app_home_dir",
                "app_open_external",
                "is_image_allowed",
                "image_data_uri",
                "focus_open_window",
                "focus_bring_to_front",
                "update_global_hotkey_cmd",
                "print_window",
                "log_frontend_error",
                "check_update_cmd",
                "install_update_cmd",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
