use std::{collections::HashMap, sync::Mutex, thread, time::Duration};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

use crate::island;

/// Retângulo da ilha dentro da janela, em pixels lógicos. O frontend atualiza a cada mudança de tamanho.
#[derive(Debug, Clone, Copy, Default, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Cada tela tem a sua janela e a sua ilha, então o retângulo é guardado por janela. The first rect is the one the
/// mouse hovers (the island grows over it); the others only take clicks (the dock's show-desktop corner).
#[derive(Default)]
pub struct PointerState {
    rects: Mutex<HashMap<String, Vec<Rect>>>,
}

#[derive(Serialize, Clone)]
struct Cursor {
    x: f64,
    y: f64,
}

/// Folga em volta da ilha para o mouse não "escapar" na borda.
const HIT_MARGIN: f64 = 6.0;
const POLL_INTERVAL: Duration = Duration::from_millis(16);

/// Algum botão do mouse (esquerdo ou direito) está apertado agora, em qualquer janela do Windows?
#[cfg(windows)]
fn mouse_button_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
    // O bit mais alto do resultado diz se a tecla está apertada neste instante.
    [VK_LBUTTON, VK_RBUTTON].iter().any(|vk| unsafe { GetAsyncKeyState(vk.0 as i32) } as u16 & 0x8000 != 0)
}

#[cfg(not(windows))]
fn mouse_button_down() -> bool {
    false
}

#[tauri::command]
pub fn set_island_rect(window: WebviewWindow, state: State<PointerState>, rect: Rect) {
    state.rects.lock().unwrap().insert(window.label().to_string(), vec![rect]);
}

/// Several areas of a window that take clicks: the first is hovered, the rest only clicked.
#[tauri::command]
pub fn set_hit_rects(window: WebviewWindow, state: State<PointerState>, rects: Vec<Rect>) {
    state.rects.lock().unwrap().insert(window.label().to_string(), rects);
}

/// Whether (x, y) is over `rect`. An island hangs from the top edge, so its area reaches up to the screen's edge (the
/// mouse pushed against the top still counts); the dock's does not, or the whole strip above it would eat clicks.
fn hits(rect: &Rect, x: f64, y: f64, reach_top: bool) -> bool {
    let top = if reach_top { rect.y.min(0.0) } else { rect.y };
    rect.w > 0.0 && rect.h > 0.0 && x >= rect.x - HIT_MARGIN && x <= rect.x + rect.w + HIT_MARGIN && y >= top - HIT_MARGIN && y <= rect.y + rect.h + HIT_MARGIN
}

/// How many ticks (~0.5 s) the window list, their position and scale stay cached: every Tauri window getter is a
/// round trip to the main thread, and asking 60 times a second made the island stutter on hover.
const GEOMETRY_EVERY: u32 = 30;

/// Global cursor position in physical pixels, read straight from Windows (no trip to the main thread).
#[cfg(windows)]
fn global_cursor(_app: &AppHandle) -> Option<(f64, f64)> {
    use windows::Win32::{Foundation::POINT, UI::WindowsAndMessaging::GetCursorPos};
    let mut point = POINT::default();
    unsafe { GetCursorPos(&mut point) }.ok()?;
    Some((point.x as f64, point.y as f64))
}

#[cfg(not(windows))]
fn global_cursor(app: &AppHandle) -> Option<(f64, f64)> {
    app.cursor_position().ok().map(|p| (p.x, p.y))
}

/// What the loop remembers about each island window.
struct Seen {
    /// Whether the mouse was over the island last time (None = not known yet, or the window is hidden).
    inside: Option<bool>,
    /// Whether the window took clicks last time (over any of its areas).
    clickable: Option<bool>,
    /// Last cursor position sent to the frontend.
    sent: (f64, f64),
    visible: bool,
    origin: (f64, f64),
    scale: f64,
}

/// Cada janela é transparente e ignora cliques. Esta rotina lê o cursor global, avisa o frontend (olhos e
/// hover) e só deixa a janela receber cliques enquanto o mouse está sobre a ilha dela.
pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        let mut seen: HashMap<String, Seen> = HashMap::new();
        let mut windows: Vec<WebviewWindow> = Vec::new();
        let mut last_down = false;
        let mut follow = true;
        let mut tick: u32 = 0;

        loop {
            thread::sleep(POLL_INTERVAL);
            let refresh = tick % GEOMETRY_EVERY == 0;
            tick = tick.wrapping_add(1);
            if refresh {
                windows = island::windows(&app);
                windows.extend(app.get_webview_window(crate::dock::LABEL));
                follow = app.try_state::<crate::config::ConfigState>().map(|c| c.eyes_follow()).unwrap_or(true);
            }
            let down = mouse_button_down();
            let Some((cursor_x, cursor_y)) = global_cursor(&app) else {
                last_down = down;
                continue;
            };

            for window in &windows {
                let label = window.label().to_string();
                let fresh = !seen.contains_key(&label);
                let entry = seen.entry(label.clone()).or_insert(Seen {
                    inside: None,
                    clickable: None,
                    sent: (f64::NAN, f64::NAN),
                    visible: false,
                    origin: (0.0, 0.0),
                    scale: 1.0,
                });
                if refresh || fresh {
                    entry.visible = window.is_visible().unwrap_or(false);
                    if entry.visible {
                        if let Ok(origin) = window.outer_position() {
                            entry.origin = (origin.x as f64, origin.y as f64);
                        }
                        entry.scale = window.scale_factor().unwrap_or(1.0);
                    }
                }
                if !entry.visible {
                    entry.inside = None;
                    entry.clickable = None;
                    continue;
                }

                let x = (cursor_x - entry.origin.0) / entry.scale;
                let y = (cursor_y - entry.origin.1) / entry.scale;

                // The eyes get the cursor at ~30 per second while they follow it; otherwise only now and then, so the
                // frontend still knows the mouse is moving (they fall asleep when it stops).
                let send_cursor = if follow { tick % 2 == 0 } else { refresh };
                if send_cursor && (x, y) != entry.sent {
                    entry.sent = (x, y);
                    let _ = app.emit_to(label.as_str(), "pointer-cursor", Cursor { x, y });
                }

                let rects = app.state::<PointerState>().rects.lock().unwrap().get(&label).cloned().unwrap_or_default();
                let reach_top = label != crate::dock::LABEL;
                let inside = rects.first().is_some_and(|r| hits(r, x, y, reach_top));
                let clickable = inside || rects.iter().skip(1).any(|r| hits(r, x, y, reach_top));

                // Um clique que começa fora da ilha, em qualquer app, avisa o frontend (ele recolhe a ilha).
                if down && !last_down && !inside {
                    let _ = app.emit_to(label.as_str(), "island-outside-click", ());
                }

                if entry.clickable != Some(clickable) {
                    entry.clickable = Some(clickable);
                    let _ = window.set_ignore_cursor_events(!clickable);
                }
                if entry.inside != Some(inside) {
                    entry.inside = Some(inside);
                    let _ = app.emit_to(label.as_str(), "island-hover", inside);
                }
            }
            last_down = down;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const DOCK: Rect = Rect { x: 500.0, y: 220.0, w: 600.0, h: 60.0 };

    /// 0.4.4: the dock's strip took every click above the dock, as tall as the strip (the island's reach to the top).
    #[test]
    fn o_dock_nao_pega_cliques_acima_dele() {
        assert!(!hits(&DOCK, 700.0, 40.0, false));
        assert!(!hits(&DOCK, 700.0, 200.0, false));
        assert!(hits(&DOCK, 700.0, 250.0, false));
        assert!(hits(&DOCK, 700.0, 216.0, false));
    }

    #[test]
    fn a_ilha_alcanca_a_borda_de_cima() {
        let island = Rect { x: 800.0, y: 4.0, w: 200.0, h: 36.0 };
        assert!(hits(&island, 900.0, -3.0, true));
        assert!(!hits(&island, 700.0, 10.0, true));
    }

    #[test]
    fn area_vazia_nao_pega_nada() {
        assert!(!hits(&Rect::default(), 0.0, 0.0, true));
    }
}
