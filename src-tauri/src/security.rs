use std::path::{Path, PathBuf};

/// Sensitive subdirectories that must never be read/written/traversed, even when
/// they live inside the user's home directory. This denylist is applied
/// uniformly to IPC file ops AND deep-link path validation — fixing the
/// original inconsistency where deep links skipped the denylist.
const DENY_SUBPATHS: &[&str] = &[
    ".ssh",
    ".gnupg",
    ".gpg",
    ".aws",
    ".docker",
    ".kube",
    ".config/gcloud",
    ".config/gh",
];

pub fn home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
}

/// A path is permitted iff it lives inside the user's home directory or
/// `/Volumes`, AND it does not descend into a denylisted sensitive directory.
pub fn is_path_allowed(path: &str) -> bool {
    if path.is_empty() {
        return false;
    }
    let check = Path::new(path);
    let home = home_dir();
    let in_home = check.starts_with(&home);
    let in_volumes = check.starts_with("/Volumes");
    if !in_home && !in_volumes {
        return false;
    }

    let comps: Vec<String> = check
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();

    for deny in DENY_SUBPATHS {
        let segs: Vec<&str> = deny.split('/').collect();
        if segs.len() == 1 {
            if comps.iter().any(|c| c == deny) {
                return false;
            }
        } else if comps.windows(segs.len()).any(|w| w == segs) {
            return false;
        }
    }
    true
}

/// External-link scheme allowlist for `shell.openExternal` / open-url.
pub fn is_external_scheme_allowed(url: &str) -> bool {
    url.starts_with("https://")
        || url.starts_with("http://")
        || url.starts_with("mailto:")
}

/// Image extensions permitted through the `local-resource://` protocol.
pub fn is_allowed_image_ext(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    [
        ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico", ".avif",
    ]
    .iter()
    .any(|e| lower.ends_with(e))
}
