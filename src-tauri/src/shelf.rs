//! Shelf: copia os arquivos soltos na ilha para uma das pastas de destino configuradas
//! (por exemplo, uma pasta do Google Drive ou do OneDrive, que o app de sincronização leva para a nuvem).

use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::Serialize;
use tauri::State;

use crate::config::ConfigState;

/// Caminho livre dentro de `dir`: `nome.ext`, depois `nome (2).ext`, `nome (3).ext`…
pub fn unique_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let name = |n: u32| match (n, ext.is_empty()) {
        (1, true) => stem.to_string(),
        (1, false) => format!("{stem}.{ext}"),
        (n, true) => format!("{stem} ({n})"),
        (n, false) => format!("{stem} ({n}).{ext}"),
    };
    (1u32..)
        .map(|n| dir.join(name(n)))
        .find(|path| !path.exists())
        .expect("sempre existe um nome livre")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendResult {
    sent: usize,
    skipped: usize,
}

/// Só envia para pastas que o usuário cadastrou nas configurações, nunca para um caminho qualquer.
#[tauri::command]
pub async fn shelf_send(state: State<'_, ConfigState>, paths: Vec<String>, folder: String) -> Result<SendResult, String> {
    let config = state.get();
    if !config.shelf_folders.iter().any(|f| f.path == folder) {
        return Err("essa pasta não está nas configurações da Shelf".into());
    }
    let dest = PathBuf::from(&folder);
    if !dest.is_dir() {
        return Err(format!("a pasta {folder} não existe"));
    }

    let mut result = SendResult { sent: 0, skipped: 0 };
    for source in paths.iter().map(PathBuf::from) {
        let (Some(stem), true) = (source.file_stem().and_then(|s| s.to_str()), source.is_file()) else {
            result.skipped += 1; // pastas e itens que sumiram ficam de fora
            continue;
        };
        let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("");
        let target = unique_path(&dest, stem, ext);
        fs::copy(&source, &target).map_err(|e| format!("{}: {e}", source.display()))?;
        // Só apaga o original depois de a cópia ter dado certo, e só se o usuário escolheu "mover".
        if config.shelf_move {
            fs::remove_file(&source).map_err(|e| format!("copiei, mas não consegui apagar {}: {e}", source.display()))?;
        }
        result.sent += 1;
    }
    Ok(result)
}

/// How many dropped paths the island remembers: enough for any drop, small enough to never grow.
const DROPPED_LIMIT: usize = 500;

/// Paths dropped on the island. Only these can go to the Recycle Bin, so the page can never trash an arbitrary path.
static DROPPED: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

/// Called for every drop on the island (Docky's own drop target and wry's).
pub fn remember(paths: &[PathBuf]) {
    let mut dropped = DROPPED.lock().unwrap_or_else(|e| e.into_inner());
    for path in paths {
        if !dropped.contains(path) {
            dropped.push(path.clone());
        }
    }
    let extra = dropped.len().saturating_sub(DROPPED_LIMIT);
    dropped.drain(..extra);
}

fn was_dropped(path: &Path) -> bool {
    DROPPED.lock().unwrap_or_else(|e| e.into_inner()).iter().any(|p| p == path)
}

#[cfg(windows)]
mod recycle {
    use std::{os::windows::ffi::OsStrExt, path::PathBuf};

    use windows::{
        Win32::UI::Shell::{
            FO_DELETE, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FOF_WANTNUKEWARNING, SHFILEOPSTRUCTW,
            SHFileOperationW, SHQUERYRBINFO, SHQueryRecycleBinW,
        },
        core::PCWSTR,
    };

    /// The paths as SHFileOperation wants them: each one ends with a NUL and the list ends with another.
    pub(super) fn double_null_list(paths: &[PathBuf]) -> Vec<u16> {
        let mut list: Vec<u16> = Vec::new();
        for path in paths {
            list.extend(path.as_os_str().encode_wide());
            list.push(0);
        }
        list.push(0);
        list
    }

    /// To the Recycle Bin. Windows asks first when an item cannot be recycled (too big, or on a drive without a
    /// Recycle Bin) instead of deleting it for good.
    pub fn trash(items: &[PathBuf]) -> Result<(), String> {
        let from = double_null_list(items);
        let mut op = SHFILEOPSTRUCTW {
            wFunc: FO_DELETE,
            pFrom: PCWSTR(from.as_ptr()),
            fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI | FOF_WANTNUKEWARNING).0 as u16,
            ..Default::default()
        };
        let code = unsafe { SHFileOperationW(&mut op) };
        if code != 0 {
            return Err(format!("o Windows não conseguiu mandar para a Lixeira (código {code})"));
        }
        if op.fAnyOperationsAborted.as_bool() {
            return Err("cancelado: nada foi para a Lixeira".into());
        }
        Ok(())
    }

    /// How many items the Recycle Bin holds, across every drive.
    pub fn count() -> Option<i64> {
        let mut info = SHQUERYRBINFO { cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32, ..Default::default() };
        unsafe { SHQueryRecycleBinW(PCWSTR::null(), &mut info) }.ok()?;
        Some(info.i64NumItems)
    }
}

#[cfg(not(windows))]
mod recycle {
    use std::path::PathBuf;

    pub fn trash(items: &[PathBuf]) -> Result<(), String> {
        crate::platform::trash(items)
    }

    /// The Finder's Trash cannot be read without Full Disk Access: no count, the tile just shows the Trash.
    pub fn count() -> Option<i64> {
        None
    }
}

/// Sends the dropped files (and folders) to the trash, where they can be restored.
#[tauri::command]
pub async fn shelf_trash(paths: Vec<String>) -> Result<SendResult, String> {
    let (items, skipped): (Vec<PathBuf>, Vec<PathBuf>) =
        paths.iter().map(PathBuf::from).partition(|p| was_dropped(p) && p.exists());
    let mut result = SendResult { sent: 0, skipped: skipped.len() };
    if items.is_empty() {
        return Ok(result);
    }
    tauri::async_runtime::spawn_blocking(move || -> Result<SendResult, String> {
        recycle::trash(&items)?;
        // Anything still there was not recycled (for example, the user said no to deleting it for good).
        result.sent = items.iter().filter(|p| !p.exists()).count();
        result.skipped += items.len() - result.sent;
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// How many items the trash holds (the Recycle Bin, across every drive).
#[tauri::command]
pub fn recycle_bin_count() -> Option<i64> {
    recycle::count()
}

/// Opens the trash (the Recycle Bin in Explorer, the Trash in the Finder).
#[tauri::command]
pub fn open_recycle_bin() -> Result<(), String> {
    crate::platform::open_trash()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn lista_para_o_windows_termina_com_dois_nulos() {
        let list = recycle::double_null_list(&[PathBuf::from("a"), PathBuf::from("bc")]);
        assert_eq!(list, vec![b'a' as u16, 0, b'b' as u16, b'c' as u16, 0, 0]);
    }

    #[test]
    fn so_vai_para_a_lixeira_o_que_foi_solto_na_ilha() {
        let path = PathBuf::from(r"C:\docky-test\nunca-solto.txt");
        assert!(!was_dropped(&path));
        remember(std::slice::from_ref(&path));
        assert!(was_dropped(&path));
    }

    #[test]
    fn nome_livre_e_numerado_quando_existe() {
        let dir = std::env::temp_dir().join(format!("docky-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        assert_eq!(unique_path(&dir, "relatorio", "pdf"), dir.join("relatorio.pdf"));
        fs::write(dir.join("relatorio.pdf"), b"x").unwrap();
        assert_eq!(unique_path(&dir, "relatorio", "pdf"), dir.join("relatorio (2).pdf"));
        fs::write(dir.join("relatorio (2).pdf"), b"x").unwrap();
        assert_eq!(unique_path(&dir, "relatorio", "pdf"), dir.join("relatorio (3).pdf"));
        assert_eq!(unique_path(&dir, "Makefile", ""), dir.join("Makefile"));
        let _ = fs::remove_dir_all(&dir);
    }
}
