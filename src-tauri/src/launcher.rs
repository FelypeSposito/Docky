//! Atalhos: abre um app, pasta, arquivo ou site da lista que o usuário cadastrou nas configurações.
//! O comando recebe só a posição na lista, nunca um caminho qualquer, então não serve para abrir algo arbitrário.

use tauri::{AppHandle, State};

use crate::config::ConfigState;

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
    use super::is_url;

    #[test]
    fn reconhece_enderecos_web() {
        assert!(is_url("https://github.com"));
        assert!(is_url("HTTP://exemplo.com"));
        assert!(!is_url("C:\\Program Files\\App\\app.exe"));
        assert!(!is_url("ftp://x"));
    }
}
