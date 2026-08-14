use crate::security::is_path_allowed;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const FILE_DEBOUNCE_MS: u64 = 500;
const DIR_MAX_DEPTH: usize = 2;

enum WatchMsg {
    /// A watched file changed; read it and forward the new content.
    File(String),
    /// A watched directory subtree changed; forward the root for a refresh.
    Dir(String),
}

/// Shared watcher state. File watchers read+emit on a debounce; directory
/// watchers forward change events (depth-bounded) to the renderer.
pub struct WatcherState {
    pub file_watchers: Mutex<HashMap<String, RecommendedWatcher>>,
    pub dir_watchers: Mutex<HashMap<String, RecommendedWatcher>>,
    tx: Mutex<Sender<WatchMsg>>,
}

pub fn init(app: &AppHandle) -> Arc<WatcherState> {
    let (tx, rx): (Sender<WatchMsg>, Receiver<WatchMsg>) = channel();
    let app_handle = app.clone();

    thread::spawn(move || loop {
        match rx.recv() {
            Ok(WatchMsg::File(path)) => {
                let ah = app_handle.clone();
                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(FILE_DEBOUNCE_MS));
                    if let Ok(content) = fs::read_to_string(&path) {
                        let _ = ah.emit(
                            "file:changed",
                            serde_json::json!({ "path": path, "content": content }),
                        );
                    }
                });
            }
            Ok(WatchMsg::Dir(root)) => {
                let ah = app_handle.clone();
                let _ = ah.emit("directory:changed", serde_json::json!({ "path": root }));
            }
            Err(_) => break,
        }
    });

    Arc::new(WatcherState {
        file_watchers: Mutex::new(HashMap::new()),
        dir_watchers: Mutex::new(HashMap::new()),
        tx: Mutex::new(tx),
    })
}

pub fn watch_file(state: &WatcherState, path: &str) -> Result<(), String> {
    if !is_path_allowed(path) {
        return Err("path not allowed".into());
    }
    let p = path.to_string();
    let tx = state.tx.lock().unwrap().clone();
    let mut w = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(_ev) = res {
            // mark latest event time for debounce coalescing
            let _ = tx.send(WatchMsg::File(p.clone()));
        }
    })
    .map_err(|e| e.to_string())?;
    w.watch(Path::new(path), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    state.file_watchers.lock().unwrap().insert(path.to_string(), w);
    Ok(())
}

pub fn unwatch_file(state: &WatcherState, path: &str) {
    state.file_watchers.lock().unwrap().remove(path);
}

pub fn watch_directory(state: &WatcherState, root: &str) -> Result<(), String> {
    if !is_path_allowed(root) {
        return Err("path not allowed".into());
    }
    let root_path = PathBuf::from(root);
    let root_clone = root_path.clone();
    let tx = state.tx.lock().unwrap().clone();
    let mut w = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(ev) = res {
            for p in ev.paths.iter() {
                if let Ok(rel) = p.strip_prefix(&root_clone) {
                    if rel.components().count() <= DIR_MAX_DEPTH {
                        let _ = tx.send(WatchMsg::Dir(root_clone.to_string_lossy().to_string()));
                        break;
                    }
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;
    w.watch(&root_path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    state.dir_watchers.lock().unwrap().insert(root.to_string(), w);
    Ok(())
}

pub fn unwatch_directory(state: &WatcherState, root: &str) {
    state.dir_watchers.lock().unwrap().remove(root);
}
