use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition};

/// A janela é um painel transparente fixo no topo da tela; a ilha em si é desenhada pelo frontend.
/// Cabe a ilha na versão maior das páginas (640 x 400 mais as orelhas); fora da ilha a janela não recebe cliques.
const WINDOW_WIDTH: f64 = 720.0;
const WINDOW_HEIGHT: f64 = 440.0;

/// A ilha só aparece quando nem o usuário (bandeja) nem um app em tela cheia pediram para escondê-la.
#[derive(Default)]
pub struct Visibility {
    user_hidden: AtomicBool,
    fullscreen: AtomicBool,
}

/// Centraliza a janela no topo do monitor principal e a mostra, sem capturar cliques.
pub fn place(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("island") else {
        return Ok(());
    };

    if let Some(monitor) = app.primary_monitor()? {
        let scale = monitor.scale_factor();
        let width = (WINDOW_WIDTH * scale).round() as i32;
        let x = monitor.position().x + (monitor.size().width as i32 - width) / 2;
        window.set_size(LogicalSize::new(WINDOW_WIDTH, WINDOW_HEIGHT))?;
        window.set_position(PhysicalPosition::new(x, monitor.position().y))?;
    }

    window.set_always_on_top(true)?;
    window.set_ignore_cursor_events(true)?;
    apply(app);
    Ok(())
}

pub fn toggle_user_hidden(app: &AppHandle) {
    let state = app.state::<Visibility>();
    state.user_hidden.fetch_xor(true, Ordering::SeqCst);
    apply(app);
}

pub fn set_fullscreen(app: &AppHandle, value: bool) {
    let state = app.state::<Visibility>();
    if state.fullscreen.swap(value, Ordering::SeqCst) != value {
        apply(app);
    }
}

fn apply(app: &AppHandle) {
    let state = app.state::<Visibility>();
    let hidden = state.user_hidden.load(Ordering::SeqCst) || state.fullscreen.load(Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("island") {
        let _ = if hidden { window.hide() } else { window.show() };
    }
}
