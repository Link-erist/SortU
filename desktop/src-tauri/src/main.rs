// Portable desktop shell for the AI Organizer PWA in ../../public.
// Everything it writes stays next to the executable: browser storage in data/, and the bundled model is read from model/.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use tauri::http::{Response, StatusCode};
use tauri::{WebviewUrl, WebviewWindowBuilder};

const BOOTSTRAP: &str = include_str!("../../web/desktop-bootstrap.js");
// On Windows, custom protocols are served as http://<scheme>.localhost and the app itself as http://tauri.localhost.
const APP_ORIGIN: &str = "http://tauri.localhost";
// Bundled model folders next to the executable that may be served; nothing else in that directory is reachable.
const MODEL_FOLDERS: [&str; 2] = ["model", "transcribe-model"];

fn portable_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
}

// Only plain relative paths made of safe characters; no "..", drive letters or backslashes.
fn bundled_model_file(root: &Path, request_path: &str) -> Option<PathBuf> {
    let relative = request_path.trim_start_matches('/');
    let safe = !relative.is_empty()
        && relative
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'))
        && relative
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..");
    if !safe {
        return None;
    }
    let file = root.join(relative).canonicalize().ok()?;
    let root = root.canonicalize().ok()?;
    (file.starts_with(&root) && file.is_file()).then_some(file)
}

fn respond(status: StatusCode, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", APP_ORIGIN)
        .header("Content-Type", "application/octet-stream")
        .header("Cache-Control", "no-store")
        .body(body)
        .expect("static response headers are valid")
}

fn main() {
    let dir = portable_dir();
    tauri::Builder::default()
        .register_uri_scheme_protocol("model", {
            let dir = dir.clone();
            move |_ctx, request| {
                if request.method() != "GET" {
                    return respond(StatusCode::METHOD_NOT_ALLOWED, Vec::new());
                }
                // The first path segment picks the bundled folder: /model/... or /transcribe-model/...
                let path = request.uri().path().trim_start_matches('/');
                let (folder, rest) = path.split_once('/').unwrap_or((path, ""));
                let file = MODEL_FOLDERS
                    .contains(&folder)
                    .then(|| bundled_model_file(&dir.join(folder), rest))
                    .flatten();
                match file.map(std::fs::read) {
                    Some(Ok(bytes)) => respond(StatusCode::OK, bytes),
                    _ => respond(StatusCode::NOT_FOUND, Vec::new()),
                }
            }
        })
        .setup(move |app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("AI Organizer")
                .inner_size(1200.0, 860.0)
                .data_directory(dir.join("data"))
                .initialization_script(BOOTSTRAP)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start AI Organizer");
}
