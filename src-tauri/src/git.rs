use crate::security::home_dir;
use std::path::Path;
use std::process::Command;

/// Returns the `HEAD` version of `file_path` as a string, or `None` if the file
/// is not inside a git repository or has no committed baseline
/// (rev-parse --show-toplevel + show HEAD:<rel>).
pub fn get_baseline(file_path: &str) -> Option<String> {
    if !crate::security::is_path_allowed(file_path) {
        return None;
    }
    let path = Path::new(file_path);
    let parent = path.parent()?;

    let toplevel_out = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(parent)
        .output()
        .ok()?;
    if !toplevel_out.status.success() {
        return None;
    }
    let toplevel = String::from_utf8_lossy(&toplevel_out.stdout).trim().to_string();
    let toplevel = Path::new(&toplevel);

    let rel = path.strip_prefix(toplevel).ok()?;
    let rel_str = rel.to_string_lossy().replace('\\', "/");

    let show_out = Command::new("git")
        .args(["show", &format!("HEAD:{}", rel_str)])
        .current_dir(toplevel)
        .output()
        .ok()?;
    if !show_out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&show_out.stdout).to_string())
}

/// Unused helper kept for completeness: home dir is inside the allow root.
#[allow(dead_code)]
fn _home() -> std::path::PathBuf {
    home_dir()
}
