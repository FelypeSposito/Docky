//! Atalhos: abre um app, pasta, arquivo ou site da lista que o usuário cadastrou nas configurações.
//! O comando recebe só a posição na lista, nunca um caminho qualquer, então não serve para abrir algo arbitrário.

use std::{fs, path::Path};

use base64::{Engine, engine::general_purpose::STANDARD};
use tauri::{AppHandle, State};

use crate::config::ConfigState;

/// Imagens de ícone maiores que isso não são lidas (o ícone vai embutido na tela).
const MAX_ICON_BYTES: u64 = 1_500_000;

/// O tipo da imagem pela extensão. Só estes formatos são lidos; qualquer outra coisa não é uma imagem de ícone.
fn image_mime(path: &str) -> Option<&'static str> {
    let extension = Path::new(path).extension()?.to_str()?.to_ascii_lowercase();
    Some(match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        _ => return None,
    })
}

/// A imagem do ícone do atalho, pronta para a tela (`data:`), ou `None` se o ícone for um emoji/texto ou estiver vazio.
/// Recebe só a posição na lista, como o `launch`: não lê um caminho qualquer.
#[tauri::command]
pub fn shortcut_icon(state: State<ConfigState>, index: usize) -> Result<Option<String>, String> {
    let Some(icon) = state.get().shortcuts.get(index).map(|s| s.icon.trim().to_string()) else {
        return Ok(None);
    };
    let Some(mime) = image_mime(&icon) else {
        return Ok(None);
    };
    let metadata = fs::metadata(&icon).map_err(|_| "não achei a imagem do ícone".to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_ICON_BYTES {
        return Err("a imagem do ícone precisa ser um arquivo de até 1,5 MB".into());
    }
    let bytes = fs::read(&icon).map_err(|e| e.to_string())?;
    Ok(Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes))))
}

fn is_url(target: &str) -> bool {
    let lower = target.to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

#[tauri::command]
pub fn launch(app: AppHandle, state: State<ConfigState>, index: usize) -> Result<(), String> {
    let target = state
        .get()
        .shortcuts
        .get(index)
        .map(|s| s.target.trim().to_string())
        .filter(|t| !t.is_empty())
        .ok_or("esse atalho não existe")?;

    let result = if is_url(&target) {
        tauri_plugin_opener::open_url(&target, None::<&str>)
    } else {
        tauri_plugin_opener::open_path(&target, None::<&str>)
    };
    let _ = app; // o plugin do opener já foi registrado no app
    result.map_err(|e| format!("não consegui abrir {target}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::{image_mime, is_url};

    #[test]
    fn so_le_imagens_como_icone() {
        assert_eq!(image_mime("C:\\icones\\git.PNG"), Some("image/png"));
        assert_eq!(image_mime("logo.svg"), Some("image/svg+xml"));
        assert_eq!(image_mime("foto.jpeg"), Some("image/jpeg"));
        assert_eq!(image_mime("C:\\Windows\\system.ini"), None);
        assert_eq!(image_mime("segredo.txt"), None);
        assert_eq!(image_mime("🚀"), None);
        assert_eq!(image_mime(""), None);
    }

    #[test]
    fn reconhece_enderecos_web() {
        assert!(is_url("https://github.com"));
        assert!(is_url("HTTP://exemplo.com"));
        assert!(!is_url("C:\\Program Files\\App\\app.exe"));
        assert!(!is_url("ftp://x"));
    }
}
