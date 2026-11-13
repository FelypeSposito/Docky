use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::placement::Screen;

const LABEL: &str = "settings";

/// Só aceita letras minúsculas, para o nome da seção ir com segurança dentro do endereço da janela.
fn clean_section(section: Option<&str>) -> Option<&str> {
    section.filter(|s| !s.is_empty() && s.len() <= 24 && s.chars().all(|c| c.is_ascii_lowercase()))
}

/// Abre a janela de configurações (já na `section`, se for dada), ou traz a que já existe para a frente.
pub fn open(app: &AppHandle, section: Option<&str>, screen: Option<Screen>) -> tauri::Result<()> {
    let section = clean_section(section);

    if let Some(window) = app.get_webview_window(LABEL) {
        center_on(&window, screen);
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
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(url.into()))
        .title("Docky — Configurações")
        // Sem moldura do Windows: a barra de cima, a borda e os cantos são desenhados pelo frontend, como na ilha.
        .decorations(false)
        .transparent(true)
        .shadow(false)
        // Dá para redimensionar pelas bordas mesmo sem moldura (o Tauri deixa uma borda de redimensionar invisível).
        // O mínimo ainda cabe o trilho de 240px à esquerda e uma coluna de conteúdo usável.
        .resizable(true)
        .inner_size(960.0, 680.0)
        .min_inner_size(720.0, 520.0)
        .theme(Some(Theme::Dark))
        .center()
        .visible(screen.is_none())
        .build()?;
    if screen.is_some() {
        center_on(&window, screen);
        window.show()?;
    }
    Ok(())
}

/// Centraliza a janela na tela dada (a da ilha que pediu); sem tela, deixa onde está.
fn center_on(window: &WebviewWindow, screen: Option<Screen>) {
    let (Some(screen), Ok(size)) = (screen, window.outer_size()) else { return };
    let x = screen.left + (screen.width - size.width as i32) / 2;
    let y = screen.top + (screen.height - size.height as i32) / 2;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

// Assíncrono de propósito: criar janelas em comandos síncronos pode travar no Windows.
#[tauri::command]
pub async fn open_settings(app: AppHandle, window: WebviewWindow, section: Option<String>) -> Result<(), String> {
    // Abre na tela da ilha que foi clicada.
    open(&app, section.as_deref(), Screen::of_window(&window)).map_err(|e| e.to_string())
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
