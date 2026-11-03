use tauri::{
    AppHandle,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

use crate::{island, settings_window};

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Mostrar ou ocultar a ilha", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Configurações…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair do Docky", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &settings, &quit])?;

    let mut tray = TrayIconBuilder::with_id("docky").tooltip("Docky").menu(&menu);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.on_menu_event(|app, event| match event.id().as_ref() {
        "toggle" => island::toggle_user_hidden(app),
        "settings" => {
            // Criar janelas direto do handler da bandeja pode travar no Windows; faz fora dele.
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = settings_window::open(&app, None);
            });
        }
        "quit" => app.exit(0),
        _ => {}
    })
    .build(app)?;

    Ok(())
}
