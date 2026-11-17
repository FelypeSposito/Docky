//! Atalhos globais de teclado. Cada um só avisa o frontend (evento `hotkey`); quem decide o que fazer é a ilha.

use std::{
    sync::Mutex,
    thread,
    time::Duration,
};

use tauri::{AppHandle, Emitter};
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

/// Combinations another app holds right now: tried again every 20 s, so they start working once it lets go.
static TAKEN: Mutex<Vec<Code>> = Mutex::new(Vec::new());

/// "Ctrl+Alt+D", "Ctrl+Alt+→".
pub fn label(code: Code) -> String {
    let key = match code {
        Code::ArrowRight => "→".to_string(),
        Code::ArrowLeft => "←".to_string(),
        other => format!("{other:?}").trim_start_matches("Key").to_string(),
    };
    format!("Ctrl+Alt+{key}")
}

fn try_register(app: &AppHandle, code: Code) -> bool {
    app.global_shortcut().register(Shortcut::new(Some(modifiers()), code)).is_ok()
}

/// The hotkeys that are not working because another app took them first.
#[tauri::command]
pub fn hotkeys_taken() -> Vec<String> {
    TAKEN.lock().unwrap().iter().map(|code| label(*code)).collect()
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
                // Com várias telas, vale a ilha da tela onde o cursor está.
                let Some(window) = crate::island::window_under_cursor(app) else { return };
                if matches!(*name, "toggle" | "notes") {
                    let _ = window.set_focus();
                }
                let _ = app.emit_to(window.label(), "hotkey", *name);
            })
            .build(),
    )?;

    let taken: Vec<Code> = BINDINGS.iter().map(|(code, _)| *code).filter(|code| !try_register(app, *code)).collect();
    if !taken.is_empty() {
        *TAKEN.lock().unwrap() = taken;
        let app = app.clone();
        thread::spawn(move || loop {
            thread::sleep(Duration::from_secs(20));
            let mut taken = TAKEN.lock().unwrap();
            taken.retain(|code| !try_register(&app, *code));
            if taken.is_empty() {
                break;
            }
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nomes_dos_atalhos() {
        assert_eq!(label(Code::KeyD), "Ctrl+Alt+D");
        assert_eq!(label(Code::ArrowRight), "Ctrl+Alt+→");
        assert_eq!(label(Code::KeyN), "Ctrl+Alt+N");
    }
}
