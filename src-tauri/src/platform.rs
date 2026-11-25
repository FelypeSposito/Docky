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
/// also handles folders and asks when an item cannot be recycled); this is the macOS one, through the Finder.
#[cfg(target_os = "macos")]
pub fn trash(paths: &[PathBuf]) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let items: Vec<String> = paths.iter().map(|p| format!("POSIX file {}", crate::mac::applescript_string(&p.to_string_lossy()))).collect();
    let script = format!("tell application \"Finder\" to delete {{{}}}", items.join(", "));
    crate::mac::osascript(&script).map(|_| ()).ok_or_else(|| "o Finder não mandou para o Lixo".to_string())
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn trash(paths: &[PathBuf]) -> Result<(), String> {
    for path in paths {
        if path.is_dir() { std::fs::remove_dir_all(path) } else { std::fs::remove_file(path) }.map_err(|e| e.to_string())?;
    }
    Ok(())
}
