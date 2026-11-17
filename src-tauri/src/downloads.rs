//! Downloads: browsers write a partial file in the Downloads folder (".crdownload" in Chrome and Edge, ".part" in
//! Firefox) and rename it when it is done. Watching the folder once a second is enough to show a short notice when a
//! download finishes, for any browser, without extensions. (The total size is not on disk, so there is no progress.)

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    thread,
    time::{Duration, SystemTime},
};

use serde::Serialize;
use tauri::{AppHandle, Manager};

const PARTIAL: [&str; 5] = [".crdownload", ".part", ".partial", ".download", ".opdownload"];

/// The final name hidden in a partial file's name ("filme.mp4.crdownload" → "filme.mp4"), or `None` if it is not one.
pub fn partial_stem(name: &str) -> Option<&str> {
    let lower = name.to_ascii_lowercase();
    PARTIAL.iter().find(|ext| lower.ends_with(*ext)).map(|ext| &name[..name.len() - ext.len()])
}

/// Chrome names a download "Unconfirmed 123456.crdownload" until it knows the real name.
pub fn is_unconfirmed(stem: &str) -> bool {
    stem.starts_with("Unconfirmed ") || stem.starts_with("Não confirmado ")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Finished {
    pub name: String,
    pub path: String,
}

fn downloads_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().download_dir().ok()
}

/// The partial files in the folder now, by file name, with their size.
fn scan(dir: &Path) -> BTreeMap<String, u64> {
    let mut found = BTreeMap::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if partial_stem(&name).is_some() {
                found.insert(name, entry.metadata().map(|m| m.len()).unwrap_or(0));
            }
        }
    }
    found
}

/// Where a partial file ended up: its final name if it exists, or else the newest finished file of the last seconds.
fn finished_file(dir: &Path, partial: &str) -> Option<PathBuf> {
    let stem = partial_stem(partial)?;
    if !is_unconfirmed(stem) {
        let path = dir.join(stem);
        if path.is_file() {
            return Some(path);
        }
    }
    let recent = SystemTime::now() - Duration::from_secs(15);
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .filter(|e| partial_stem(&e.file_name().to_string_lossy()).is_none())
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .filter(|(modified, path)| *modified >= recent && path.is_file())
        .max_by_key(|(modified, _)| *modified)
        .map(|(_, path)| path)
}

/// Shows a finished download in Explorer. Only files inside the Downloads folder.
#[tauri::command]
pub fn reveal_download(app: AppHandle, path: String) -> Result<(), String> {
    let dir = downloads_dir(&app).ok_or("pasta de downloads não encontrada")?;
    let file = PathBuf::from(&path);
    if !file.starts_with(&dir) || !file.exists() {
        return Err("arquivo fora da pasta de downloads".into());
    }
    std::process::Command::new("explorer.exe").arg(format!("/select,{}", file.display())).spawn().map(|_| ()).map_err(|e| e.to_string())
}

pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        let mut last: BTreeMap<String, u64> = BTreeMap::new();
        loop {
            thread::sleep(Duration::from_secs(1));
            let Some(dir) = downloads_dir(&app) else { continue };
            let now = scan(&dir);
            if now == last {
                continue;
            }
            for gone in last.keys().filter(|name| !now.contains_key(*name)) {
                if let Some(path) = finished_file(&dir, gone) {
                    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    crate::island::emit(&app, "download-done", Finished { name, path: path.display().to_string() });
                }
            }
            last = now;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconhece_os_arquivos_parciais() {
        assert_eq!(partial_stem("filme.mp4.crdownload"), Some("filme.mp4"));
        assert_eq!(partial_stem("setup.exe.part"), Some("setup.exe"));
        assert_eq!(partial_stem("Foto.JPG.CRDOWNLOAD"), Some("Foto.JPG"));
        assert_eq!(partial_stem("relatorio.pdf"), None);
        assert!(is_unconfirmed("Unconfirmed 812345"));
        assert!(!is_unconfirmed("filme.mp4"));
    }
}
