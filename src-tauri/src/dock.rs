//! The dock's window: Docky's taskbar, on the bottom, left or right edge of the main screen (the island owns the top).
//!
//! Like the island's, the window is a transparent strip along its edge, bigger than the dock so it can grow, and
//! it lets clicks through outside the dock (pointer.rs, from the rect the page reports). It never takes focus, so the
//! app you were in stays in front when you click the dock (taskbar.rs relies on that to know which app is focused).
//!
//! Window previews are Windows' own live thumbnails (DWM), drawn by Windows into this window at the places the page
//! asks for (`dock_previews`): the page draws the frame around them, Windows draws the window inside.

use serde::Deserialize;
use tauri::{AppHandle, LogicalSize, Manager, Monitor, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::config::ConfigState;

pub const LABEL: &str = "dock";
/// How deep the strip is (logical px): room for the dock to grow and for a window list above an app.
const SPAN: f64 = 300.0;

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

/// Where a window's preview goes, in the dock's page (logical px).
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Slot {
    pub id: i64,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// A window of `source` size fitted inside a slot (physical px), keeping its shape, centred: (left, top, right, bottom).
pub fn fit(slot: (f64, f64, f64, f64), source: (f64, f64)) -> (i32, i32, i32, i32) {
    let (x, y, w, h) = slot;
    let (sw, sh) = source;
    let k = if sw > 0.0 && sh > 0.0 { (w / sw).min(h / sh) } else { 1.0 };
    let (fw, fh) = if sw > 0.0 && sh > 0.0 { (sw * k, sh * k) } else { (w, h) };
    let left = x + (w - fw) / 2.0;
    let top = y + (h - fh) / 2.0;
    (left.round() as i32, top.round() as i32, (left + fw).round() as i32, (top + fh).round() as i32)
}

/// Shows live previews of these windows at these places in the dock (an empty list takes them all away).
#[tauri::command]
pub fn dock_previews(app: AppHandle, window: WebviewWindow, slots: Vec<Slot>) {
    let scale = window.scale_factor().unwrap_or(1.0);
    #[cfg(windows)]
    {
        let Ok(hwnd) = window.hwnd() else { return };
        let dest = hwnd.0 as isize;
        let _ = app.run_on_main_thread(move || thumbs::show(dest, &slots, scale));
    }
    #[cfg(not(windows))]
    let _ = (app, slots, scale);
}

#[cfg(windows)]
mod thumbs {
    use std::{cell::RefCell, collections::HashMap, ffi::c_void};

    use windows::Win32::{
        Foundation::{HWND, RECT},
        Graphics::Dwm::{
            DWM_THUMBNAIL_PROPERTIES, DWM_TNP_OPACITY, DWM_TNP_RECTDESTINATION, DWM_TNP_SOURCECLIENTAREAONLY, DWM_TNP_VISIBLE, DwmQueryThumbnailSourceSize,
            DwmRegisterThumbnail, DwmUnregisterThumbnail, DwmUpdateThumbnailProperties,
        },
    };

    use super::Slot;

    thread_local! {
        /// The previews shown now: window → thumbnail. Only touched on the main thread.
        static SHOWN: RefCell<HashMap<i64, isize>> = RefCell::new(HashMap::new());
    }

    pub fn show(dest: isize, slots: &[Slot], scale: f64) {
        SHOWN.with(|shown| {
            let mut shown = shown.borrow_mut();
            shown.retain(|id, thumb| {
                let keep = slots.iter().any(|s| s.id == *id);
                if !keep {
                    unsafe {
                        let _ = DwmUnregisterThumbnail(*thumb);
                    }
                }
                keep
            });
            for slot in slots {
                let thumb = match shown.get(&slot.id) {
                    Some(thumb) => *thumb,
                    None => match unsafe { DwmRegisterThumbnail(HWND(dest as *mut c_void), HWND(slot.id as isize as *mut c_void)) } {
                        Ok(thumb) => {
                            shown.insert(slot.id, thumb);
                            thumb
                        }
                        Err(_) => continue,
                    },
                };
                let size = unsafe { DwmQueryThumbnailSourceSize(thumb) }.unwrap_or_default();
                let (left, top, right, bottom) = super::fit((slot.x * scale, slot.y * scale, slot.w * scale, slot.h * scale), (size.cx as f64, size.cy as f64));
                let props = DWM_THUMBNAIL_PROPERTIES {
                    dwFlags: DWM_TNP_RECTDESTINATION | DWM_TNP_VISIBLE | DWM_TNP_OPACITY | DWM_TNP_SOURCECLIENTAREAONLY,
                    rcDestination: RECT { left, top, right, bottom },
                    rcSource: RECT::default(),
                    opacity: 255,
                    fVisible: true.into(),
                    fSourceClientAreaOnly: false.into(),
                };
                unsafe {
                    let _ = DwmUpdateThumbnailProperties(thumb, &props);
                }
            }
        });
    }
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

    /// A window missing from the capability gets no IPC: the dock showed "no apps open" (0.4.0 to 0.4.2).
    #[test]
    fn o_dock_tem_permissao_de_ipc() {
        let caps: serde_json::Value = serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let windows: Vec<&str> = caps["windows"].as_array().unwrap().iter().filter_map(|w| w.as_str()).collect();
        for label in [LABEL, crate::settings_window::LABEL, "island", "island-0"] {
            let covered = windows.iter().any(|w| match w.strip_suffix('*') {
                Some(prefix) => label.starts_with(prefix),
                None => *w == label,
            });
            assert!(covered, "a janela {label} ficou fora das permissões");
        }
    }

    #[test]
    fn a_faixa_fica_na_borda_escolhida() {
        // A 1920 × 1080 screen at 1.25: 300 logical px deep is 375 physical.
        assert_eq!(strip(Side::Bottom, (0, 0), (1920, 1080), 1.25), ((0, 705), (1536.0, 300.0)));
        assert_eq!(strip(Side::Left, (0, 0), (1920, 1080), 1.25), ((0, 0), (300.0, 864.0)));
        assert_eq!(strip(Side::Right, (0, 0), (1920, 1080), 1.25), ((1545, 0), (300.0, 864.0)));
        // A second screen to the left of the main one.
        assert_eq!(strip(Side::Bottom, (-1080, 0), (1080, 1920), 1.0).0, (-1080, 1620));
    }

    #[test]
    fn previa_cabe_no_espaco_sem_distorcer() {
        // A 1920 × 1080 window in a 200 × 120 slot: as wide as the slot, centred up and down.
        assert_eq!(fit((10.0, 20.0, 200.0, 120.0), (1920.0, 1080.0)), (10, 24, 210, 136));
        // A tall window: as high as the slot, centred across.
        assert_eq!(fit((0.0, 0.0, 200.0, 120.0), (600.0, 1200.0)), (70, 0, 130, 120));
        // Size unknown: the whole slot.
        assert_eq!(fit((0.0, 0.0, 200.0, 120.0), (0.0, 0.0)), (0, 0, 200, 120));
    }

    #[test]
    fn lado_desconhecido_e_embaixo() {
        assert_eq!(Side::parse("top"), Side::Bottom);
        assert_eq!(Side::parse("left"), Side::Left);
    }
}
