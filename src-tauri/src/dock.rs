//! The dock's window: Docky's taskbar, on the bottom, left or right edge of the main screen (the island owns the top).
//!
//! Like the island's, the window is a transparent strip along its edge, bigger than the dock so it can grow, and
//! it lets clicks through outside the dock (pointer.rs, from the rect the page reports). It never takes focus, so the
//! app you were in stays in front when you click the dock (taskbar.rs relies on that to know which app is focused).

use tauri::{AppHandle, LogicalSize, Manager, Monitor, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::config::ConfigState;

pub const LABEL: &str = "dock";
/// How deep the strip is (logical px): room for the dock to grow and for a window list above an app.
const SPAN: f64 = 280.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Bottom,
    Left,
    Right,
}

impl Side {
    pub fn parse(text: &str) -> Self {
        match text {
            "left" => Side::Left,
            "right" => Side::Right,
            _ => Side::Bottom,
        }
    }
}

/// Where the strip goes on a screen, in physical px: (x, y) and its logical size.
pub fn strip(side: Side, origin: (i32, i32), size: (u32, u32), scale: f64) -> ((i32, i32), (f64, f64)) {
    let s = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let span_px = (SPAN * s).round() as i32;
    let (w, h) = (size.0 as f64 / s, size.1 as f64 / s);
    match side {
        Side::Bottom => ((origin.0, origin.1 + size.1 as i32 - span_px), (w.floor(), SPAN)),
        Side::Left => (origin, (SPAN, h.floor())),
        Side::Right => ((origin.0 + size.0 as i32 - span_px, origin.1), (SPAN, h.floor())),
    }
}

fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Docky dock")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .visible(false)
        .build()?;
    no_activate(&window);
    Ok(window)
}

fn place(window: &WebviewWindow, monitor: &Monitor, side: Side) -> tauri::Result<()> {
    let ((x, y), (w, h)) = strip(side, (monitor.position().x, monitor.position().y), (monitor.size().width, monitor.size().height), monitor.scale_factor());
    let at = PhysicalPosition::new(x, y);
    // Position, size, position: the logical size depends on the screen the window is on.
    window.set_position(at)?;
    window.set_size(LogicalSize::new(w, h))?;
    window.set_position(at)?;
    window.set_always_on_top(true)?;
    window.set_ignore_cursor_events(true)
}

/// Creates, moves or closes the dock to match Settings. Run off the command thread (creating windows there can hang
/// on Windows).
pub fn sync(app: &AppHandle) {
    let config = app.state::<ConfigState>().get();
    let existing = app.get_webview_window(LABEL);
    if !config.dock_enabled {
        if let Some(window) = existing {
            let _ = window.close();
        }
        return;
    }
    let Ok(Some(monitor)) = app.primary_monitor() else { return };
    let window = match existing {
        Some(window) => window,
        None => match create(app) {
            Ok(window) => window,
            Err(e) => {
                crate::logfile::write("error", &format!("dock: não deu para criar a janela: {e}"));
                return;
            }
        },
    };
    let _ = place(&window, &monitor, Side::parse(&config.dock_side));
    set_visible(app, !crate::island::hidden_now(app));
}

/// The dock follows the island: hidden from the tray or while a game is fullscreen.
pub fn set_visible(app: &AppHandle, visible: bool) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = if visible { window.show() } else { window.hide() };
    }
}

#[cfg(windows)]
fn no_activate(window: &WebviewWindow) {
    use windows::Win32::{
        Foundation::HWND,
        UI::WindowsAndMessaging::{GWL_EXSTYLE, GetWindowLongPtrW, SetWindowLongPtrW, WS_EX_NOACTIVATE},
    };
    let Ok(hwnd) = window.hwnd() else { return };
    let hwnd = HWND(hwnd.0 as *mut std::ffi::c_void);
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style | WS_EX_NOACTIVATE.0 as isize);
    }
}

#[cfg(not(windows))]
fn no_activate(_: &WebviewWindow) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_faixa_fica_na_borda_escolhida() {
        // A 1920 × 1080 screen at 1.25: 280 logical px deep is 350 physical.
        assert_eq!(strip(Side::Bottom, (0, 0), (1920, 1080), 1.25), ((0, 730), (1536.0, 280.0)));
        assert_eq!(strip(Side::Left, (0, 0), (1920, 1080), 1.25), ((0, 0), (280.0, 864.0)));
        assert_eq!(strip(Side::Right, (0, 0), (1920, 1080), 1.25), ((1570, 0), (280.0, 864.0)));
        // A second screen to the left of the main one.
        assert_eq!(strip(Side::Bottom, (-1080, 0), (1080, 1920), 1.0).0, (-1080, 1640));
    }

    #[test]
    fn lado_desconhecido_e_embaixo() {
        assert_eq!(Side::parse("top"), Side::Bottom);
        assert_eq!(Side::parse("left"), Side::Left);
    }
}
