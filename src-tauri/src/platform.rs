//! The few things every system does its own way: showing a file in the file manager, opening a folder, the trash.
//! Windows goes through Explorer and the shell; macOS through `open` and the Finder.

use std::path::Path;
#[cfg(not(windows))]
use std::path::PathBuf;

/// Shows a file selected in the file manager (Explorer, the Finder).
pub fn reveal(file: &Path) -> Result<(), String> {
    #[cfg(windows)]
    let mut command = {
        let mut c = std::process::Command::new("explorer.exe");
        c.arg(format!("/select,{}", file.display()));
        c
    };
    #[cfg(not(windows))]
    let mut command = {
        let mut c = std::process::Command::new("open");
        c.arg("-R").arg(file);
        c
    };
    command.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Opens a folder in the file manager.
pub fn open_folder(dir: &Path) -> Result<(), String> {
    #[cfg(windows)]
    let program = "explorer.exe";
    #[cfg(not(windows))]
    let program = "open";
    std::process::Command::new(program).arg(dir).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Opens the system's trash (the Recycle Bin, the Finder's Trash).
pub fn open_trash() -> Result<(), String> {
    #[cfg(windows)]
    return std::process::Command::new("explorer.exe").arg("shell:RecycleBinFolder").spawn().map(|_| ()).map_err(|e| e.to_string());
    #[cfg(target_os = "macos")]
    return crate::mac::osascript(r#"tell application "Finder" to open trash"#).map(|_| ()).ok_or_else(|| "o Finder não abriu o Lixo".to_string());
    #[cfg(not(any(windows, target_os = "macos")))]
    Err("sem lixeira neste sistema".into())
}

/// Moves files to the trash, where they can be restored. Windows' version is in `shelf.rs` (SHFileOperation, which
/// also handles folders and asks when an item cannot be recycled); this is the macOS one: straight into the user's
/// Trash (same disk, no permission needed), or through the Finder for files on another disk.
#[cfg(target_os = "macos")]
pub fn trash(paths: &[PathBuf]) -> Result<(), String> {
    let trash_dir = std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".Trash"));
    let mut through_finder = Vec::new();
    for path in paths {
        let moved = trash_dir.as_ref().is_some_and(|dir| {
            let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let (stem, ext) = name.rsplit_once('.').map_or((name.as_str(), ""), |(s, e)| (s, e));
            std::fs::rename(path, crate::shelf::unique_path(dir, stem, ext)).is_ok()
        });
        if !moved {
            through_finder.push(path);
        }
    }
    if through_finder.is_empty() {
        return Ok(());
    }
    let items: Vec<String> = through_finder.iter().map(|p| format!("POSIX file {}", crate::mac::applescript_string(&p.to_string_lossy()))).collect();
    let script = format!("tell application \"Finder\" to delete {{{}}}", items.join(", "));
    crate::mac::osascript(&script).map(|_| ()).ok_or_else(|| "não consegui mandar para o Lixo".to_string())
}

/// Elsewhere there is no trash Docky knows: nothing is deleted for good.
#[cfg(not(any(windows, target_os = "macos")))]
pub fn trash(_paths: &[PathBuf]) -> Result<(), String> {
    Err("sem lixeira neste sistema".into())
}
