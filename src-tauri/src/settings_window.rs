use tauri::{AppHandle, Manager, Theme, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "settings";

/// Abre a janela de configurações, ou traz a que já existe para a frente.
pub fn open(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(LABEL) {
        window.show()?;
        window.unminimize()?;
        window.set_focus()?;
        return Ok(());
    }

    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
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
pub async fn open_settings(app: AppHandle) -> Result<(), String> {
    open(&app).map_err(|e| e.to_string())
}
