use tauri::{AppHandle, Emitter, Manager, Theme, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "settings";

/// Só aceita letras minúsculas, para o nome da seção ir com segurança dentro do endereço da janela.
fn clean_section(section: Option<&str>) -> Option<&str> {
    section.filter(|s| !s.is_empty() && s.len() <= 24 && s.chars().all(|c| c.is_ascii_lowercase()))
}

/// Abre a janela de configurações (já na `section`, se for dada), ou traz a que já existe para a frente.
pub fn open(app: &AppHandle, section: Option<&str>) -> tauri::Result<()> {
    let section = clean_section(section);

    if let Some(window) = app.get_webview_window(LABEL) {
        window.show()?;
        window.unminimize()?;
        window.set_focus()?;
        if let Some(section) = section {
            let _ = app.emit_to(LABEL, "settings-section", section);
        }
        return Ok(());
    }

    let url = match section {
        Some(section) => format!("index.html?section={section}"),
        None => "index.html".to_string(),
    };
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(url.into()))
        .title("Docky — Configurações")
        // Sem moldura do Windows: a barra de cima, a borda e os cantos são desenhados pelo frontend, como na ilha.
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .inner_size(860.0, 620.0)
        .theme(Some(Theme::Dark))
        .center()
        .build()?;
    Ok(())
}

// Assíncrono de propósito: criar janelas em comandos síncronos pode travar no Windows.
#[tauri::command]
pub async fn open_settings(app: AppHandle, section: Option<String>) -> Result<(), String> {
    open(&app, section.as_deref()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::clean_section;

    #[test]
    fn so_aceita_nome_de_secao_simples() {
        assert_eq!(clean_section(Some("atalhos")), Some("atalhos"));
        assert_eq!(clean_section(Some("../x")), None);
        assert_eq!(clean_section(Some("a b")), None);
        assert_eq!(clean_section(Some("")), None);
        assert_eq!(clean_section(None), None);
    }
}
