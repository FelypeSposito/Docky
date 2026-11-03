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

/// Cada tela tem a sua janela e a sua ilha, então o retângulo é guardado por janela.
#[derive(Default)]
pub struct PointerState {
    rects: Mutex<HashMap<String, Rect>>,
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
    state.rects.lock().unwrap().insert(window.label().to_string(), rect);
}

/// Cada janela é transparente e ignora cliques. Esta rotina lê o cursor global, avisa o frontend (olhos e
/// hover) e só deixa a janela receber cliques enquanto o mouse está sobre a ilha dela.
pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        // Por janela: se o mouse estava dentro da ilha e onde estava o cursor da última vez.
        let mut seen: HashMap<String, (Option<bool>, (f64, f64))> = HashMap::new();
        let mut last_down = false;

        loop {
            thread::sleep(POLL_INTERVAL);
            let down = mouse_button_down();

            for window in island::windows(&app) {
                let label = window.label().to_string();
                let entry = seen.entry(label.clone()).or_insert((None, (f64::NAN, f64::NAN)));
                if !window.is_visible().unwrap_or(false) {
                    entry.0 = None;
                    continue;
                }
                let (Ok(cursor), Ok(origin)) = (window.cursor_position(), window.outer_position()) else {
                    continue;
                };

                let scale = window.scale_factor().unwrap_or(1.0);
                let x = (cursor.x - origin.x as f64) / scale;
                let y = (cursor.y - origin.y as f64) / scale;

                if (x, y) != entry.1 {
                    entry.1 = (x, y);
                    let _ = app.emit_to(label.as_str(), "pointer-cursor", Cursor { x, y });
                }

                let rect = app.state::<PointerState>().rects.lock().unwrap().get(&label).copied().unwrap_or_default();
                let inside = x >= rect.x - HIT_MARGIN && x <= rect.x + rect.w + HIT_MARGIN && y >= 0.0 && y <= rect.y + rect.h + HIT_MARGIN;

                // Um clique que começa fora da ilha, em qualquer app, avisa o frontend (ele recolhe a ilha).
                if down && !last_down && !inside {
                    let _ = app.emit_to(label.as_str(), "island-outside-click", ());
                }

                if entry.0 != Some(inside) {
                    entry.0 = Some(inside);
                    let _ = window.set_ignore_cursor_events(!inside);
                    let _ = app.emit_to(label.as_str(), "island-hover", inside);
                }
            }
            last_down = down;
        }
    });
}
