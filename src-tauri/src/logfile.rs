//! A small log file for bug reports: startup, panics and errors the island catches. It lives in Docky's log folder
//! (`%LOCALAPPDATA%\com.docky.desktop\logs`), never leaves the machine, and is kept small: past 512 KB the file
//! moves to `docky.old.log` and a new one starts.

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{Mutex, OnceLock},
};

use tauri::{AppHandle, Manager};

const MAX_BYTES: u64 = 512 * 1024;
/// One line never carries more than this (a huge error message stays readable and the file stays small).
const MAX_LINE: usize = 2000;

static PATH: OnceLock<PathBuf> = OnceLock::new();
static WRITE: Mutex<()> = Mutex::new(());

/// Finds the log folder, writes the first line and catches panics into the file. Call once, at startup.
pub fn init(app: &AppHandle) {
    let Ok(dir) = app.path().app_log_dir() else { return };
    let _ = fs::create_dir_all(&dir);
    let _ = PATH.set(dir.join("docky.log"));
    write("info", &format!("Docky {} iniciado ({} {})", env!("CARGO_PKG_VERSION"), std::env::consts::OS, std::env::consts::ARCH));
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        write("panic", &info.to_string());
        previous(info);
    }));
}

/// `[2026-11-17 18:30:02] error: message`, in local time when Windows tells it, else UTC.
fn stamp() -> String {
    let now = time::OffsetDateTime::now_local().unwrap_or_else(|_| time::OffsetDateTime::now_utc());
    let format = time::macros::format_description!("[year]-[month]-[day] [hour]:[minute]:[second]");
    now.format(&format).unwrap_or_default()
}

/// One clean line: no line breaks (they would break the file into fake entries), and a length cap.
pub fn clean(message: &str) -> String {
    let flat: String = message.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= MAX_LINE {
        flat
    } else {
        flat.chars().take(MAX_LINE).collect::<String>() + "…"
    }
}

pub fn write(level: &str, message: &str) {
    let Some(path) = PATH.get() else { return };
    let _guard = WRITE.lock().unwrap_or_else(|p| p.into_inner());
    if fs::metadata(path).map(|m| m.len() > MAX_BYTES).unwrap_or(false) {
        let _ = fs::rename(path, path.with_file_name("docky.old.log"));
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{}] {}: {}", stamp(), level, clean(message));
    }
}

/// The island and Settings report the errors they catch here.
#[tauri::command]
pub fn log_write(level: String, message: String) {
    let level = match level.as_str() {
        "error" | "warn" | "info" => level,
        _ => "info".into(),
    };
    write(&level, &format!("[interface] {message}"));
}

/// Opens the log folder in Explorer, to attach the file to a bug report.
#[tauri::command]
pub fn open_logs(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    crate::platform::open_folder(&dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uma_linha_so_e_curta() {
        assert_eq!(clean("erro\nem   duas\r\nlinhas"), "erro em duas linhas");
        let long = clean(&"x".repeat(5000));
        assert_eq!(long.chars().count(), MAX_LINE + 1);
    }
}
