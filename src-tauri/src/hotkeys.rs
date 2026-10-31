//! Atalhos globais de teclado. Cada um só avisa o frontend (evento `hotkey`); quem decide o que fazer é a ilha.

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const BINDINGS: [(Code, &str); 4] = [
    (Code::KeyD, "toggle"),
    (Code::ArrowRight, "next"),
    (Code::ArrowLeft, "previous"),
    (Code::KeyN, "notes"),
];

fn modifiers() -> Modifiers {
    Modifiers::CONTROL | Modifiers::ALT
}

/// Registra Ctrl+Alt+D (abrir/fechar), Ctrl+Alt+→/← (trocar de página) e Ctrl+Alt+N (nota rápida).
/// Se outro app já usa uma combinação, ela só fica de fora; a ilha continua funcionando.
pub fn register(app: &AppHandle) -> tauri::Result<()> {
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
                if event.state != ShortcutState::Pressed {
                    return;
                }
                let Some((_, name)) = BINDINGS.iter().find(|(code, _)| *shortcut == Shortcut::new(Some(modifiers()), *code)) else {
                    return;
                };
                // Abrir ou escrever precisa de foco no teclado, e a janela da ilha normalmente não o pega.
                if matches!(*name, "toggle" | "notes") {
                    if let Some(window) = app.get_webview_window("island") {
                        let _ = window.set_focus();
                    }
                }
                let _ = app.emit_to("island", "hotkey", *name);
            })
            .build(),
    )?;

    for (code, name) in BINDINGS {
        if let Err(e) = app.global_shortcut().register(Shortcut::new(Some(modifiers()), code)) {
            eprintln!("docky: não consegui registrar Ctrl+Alt+{code:?} ({name}): {e}");
        }
    }
    Ok(())
}
