use std::sync::Mutex;

use tauri::{
    AppHandle, Manager, Wry,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

use crate::{config::ConfigState, island, settings_window};

/// The tray menu's items, kept so a language change can relabel them without rebuilding the tray.
pub struct TrayItems(Mutex<Option<[MenuItem<Wry>; 3]>>);

/// The tray menu in the interface's language ("pt" or "en").
fn labels(language: &str) -> [&'static str; 3] {
    if language == "en" {
        ["Show or hide the island", "Settings…", "Quit Docky"]
    } else {
        ["Mostrar ou ocultar a ilha", "Configurações…", "Sair do Docky"]
    }
}

/// "pt" or "en": the setting, or for "auto" the Windows display language (Portuguese gets Portuguese, the rest English).
pub fn language(setting: &str) -> &'static str {
    match setting {
        "pt" => "pt",
        "en" => "en",
        _ if system_locale().to_ascii_lowercase().starts_with("pt") => "pt",
        _ => "en",
    }
}

#[cfg(windows)]
fn system_locale() -> String {
    use windows::Win32::Globalization::GetUserDefaultLocaleName;
    let mut buffer = [0u16; 85];
    let len = unsafe { GetUserDefaultLocaleName(&mut buffer) };
    if len <= 1 {
        return String::new();
    }
    String::from_utf16_lossy(&buffer[..(len as usize - 1)])
}

/// macOS apps get no LANG: the language comes from the system's settings ("pt_BR").
#[cfg(target_os = "macos")]
fn system_locale() -> String {
    std::process::Command::new("defaults")
        .args(["read", "-g", "AppleLocale"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().replace('_', "-"))
        .filter(|l| !l.is_empty())
        .unwrap_or_else(|| std::env::var("LANG").unwrap_or_default())
}

#[cfg(not(any(windows, target_os = "macos")))]
fn system_locale() -> String {
    std::env::var("LANG").unwrap_or_default()
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let [show, settings_label, quit_label] = labels(language(&app.state::<ConfigState>().get().language));
    let toggle = MenuItem::with_id(app, "toggle", show, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", settings_label, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &settings, &quit])?;
    app.manage(TrayItems(Mutex::new(Some([toggle, settings, quit]))));

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
                let _ = settings_window::open(&app, None, None);
            });
        }
        "quit" => app.exit(0),
        _ => {}
    })
    .build(app)?;

    Ok(())
}

/// The language setting changed: the tray menu follows.
pub fn relabel(app: &AppHandle, setting: &str) {
    let Some(state) = app.try_state::<TrayItems>() else { return };
    let Ok(items) = state.0.lock() else { return };
    if let Some(items) = items.as_ref() {
        for (item, text) in items.iter().zip(labels(language(setting))) {
            let _ = item.set_text(text);
        }
    }
}
