//! Shelf: copia os arquivos soltos na ilha para uma das pastas de destino configuradas
//! (por exemplo, uma pasta do Google Drive ou do OneDrive, que o app de sincronização leva para a nuvem).

use std::{
    fs,
    path::{Path, PathBuf},
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
    if !state.get().shelf_folders.iter().any(|f| f.path == folder) {
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
        fs::copy(&source, unique_path(&dest, stem, ext)).map_err(|e| format!("{}: {e}", source.display()))?;
        result.sent += 1;
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

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
