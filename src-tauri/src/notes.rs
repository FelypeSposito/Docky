//! Notas rápidas: cada nota vira um arquivo `.md` na pasta configurada (por padrão, a `Inbox` do cofre do Obsidian).

use std::{fs, path::PathBuf};

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
}

/// As notas mais recentes (os nomes começam pela data, então a ordem do nome é a ordem do tempo).
#[tauri::command]
pub fn notes_recent(state: State<ConfigState>, limit: usize) -> Result<Vec<Note>, String> {
    let dir = notes_dir(&state)?;
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "md") && p.is_file())
        .collect();
    files.sort_by(|a, b| b.file_name().cmp(&a.file_name()));

    Ok(files
        .into_iter()
        .take(limit)
        .filter_map(|path| {
            let text = fs::read_to_string(&path).ok()?;
            Some(Note {
                file: path.file_name()?.to_string_lossy().into_owned(),
                text: text.trim().chars().take(PREVIEW_CHARS).collect(),
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::clean_stamp;

    #[test]
    fn carimbo_so_aceita_digitos_e_hifen() {
        assert_eq!(clean_stamp("2026-10-31-1530"), Some("2026-10-31-1530"));
        assert_eq!(clean_stamp("../x"), None);
        assert_eq!(clean_stamp(""), None);
        assert_eq!(clean_stamp("2026-10-31 15:30"), None);
    }
}
