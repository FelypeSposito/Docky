//! Notas rápidas: cada nota vira um arquivo `.md` na pasta configurada (por padrão, a `Inbox` do cofre do Obsidian).

use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::Serialize;
use tauri::State;

use crate::{config::ConfigState, shelf::unique_path};

const PREVIEW_CHARS: usize = 400;

/// O carimbo vem do frontend (que conhece o fuso do usuário) e vira parte do nome do arquivo.
fn clean_stamp(stamp: &str) -> Option<&str> {
    let valid = !stamp.is_empty() && stamp.len() <= 24 && stamp.chars().all(|c| c.is_ascii_digit() || c == '-');
    valid.then_some(stamp)
}

fn notes_dir(state: &ConfigState) -> Result<PathBuf, String> {
    let folder = state.get().notes_folder;
    if folder.trim().is_empty() {
        return Err("defina a pasta das notas em Configurações".into());
    }
    Ok(PathBuf::from(folder))
}

#[tauri::command]
pub fn notes_save(state: State<ConfigState>, stamp: String, text: String) -> Result<(), String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("a nota está vazia".into());
    }
    let stamp = clean_stamp(&stamp).ok_or("carimbo de data inválido")?;
    let dir = notes_dir(&state)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(unique_path(&dir, stamp, "md"), format!("{text}\n")).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    file: String,
    text: String,
    /// Última modificação, em milissegundos desde 1970.
    modified_ms: u64,
}

fn modified_ms(path: &Path) -> u64 {
    path.metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64)
}

/// As notas mais recentes da pasta, de qualquer origem (a pasta pode ser um cofre do Obsidian com notas de
/// outros lugares), da mais nova para a mais antiga pela data de modificação.
#[tauri::command]
pub fn notes_recent(state: State<ConfigState>, limit: usize) -> Result<Vec<Note>, String> {
    let dir = notes_dir(&state)?;
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut files: Vec<(u64, PathBuf)> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "md") && p.is_file())
        .map(|p| (modified_ms(&p), p))
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.file_name().cmp(&a.1.file_name())));

    Ok(files
        .into_iter()
        .take(limit)
        .filter_map(|(modified_ms, path)| {
            let text = fs::read_to_string(&path).ok()?;
            Some(Note {
                file: path.file_name()?.to_string_lossy().into_owned(),
                text: text.trim().chars().take(PREVIEW_CHARS).collect(),
                modified_ms,
            })
        })
        .collect())
}

/// Só o nome do arquivo, sem pastas: o comando não pode abrir nada fora da pasta das notas.
fn is_plain_file_name(name: &str) -> bool {
    !name.is_empty() && !name.contains(['/', '\\', ':']) && name != ".." && name != "." && name.ends_with(".md")
}

/// Abre a nota no programa padrão dos arquivos .md (por exemplo, o Obsidian).
#[tauri::command]
pub fn notes_open(state: State<ConfigState>, file: String) -> Result<(), String> {
    if !is_plain_file_name(&file) {
        return Err("nome de nota inválido".into());
    }
    let path = notes_dir(&state)?.join(&file);
    if !path.is_file() {
        return Err("essa nota não existe mais".into());
    }
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::{clean_stamp, is_plain_file_name};

    #[test]
    fn carimbo_so_aceita_digitos_e_hifen() {
        assert_eq!(clean_stamp("2026-10-31-1530"), Some("2026-10-31-1530"));
        assert_eq!(clean_stamp("../x"), None);
        assert_eq!(clean_stamp(""), None);
        assert_eq!(clean_stamp("2026-10-31 15:30"), None);
    }

    #[test]
    fn so_abre_arquivos_md_da_propria_pasta() {
        assert!(is_plain_file_name("2026-10-31-153000.md"));
        assert!(is_plain_file_name("ideia (2).md"));
        assert!(!is_plain_file_name("..\\segredo.md"));
        assert!(!is_plain_file_name("a/b.md"));
        assert!(!is_plain_file_name("C:\\Windows\\x.md"));
        assert!(!is_plain_file_name("programa.exe"));
        assert!(!is_plain_file_name(""));
    }
}
