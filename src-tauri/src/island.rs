use std::{
    collections::HashSet,
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, Monitor, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::config::ConfigState;

/// A janela é um painel transparente fixo no topo da tela; a ilha em si é desenhada pelo frontend.
/// Cabe a ilha na versão maior das páginas (640 x 400 mais as orelhas); fora da ilha a janela não recebe cliques.
const WINDOW_WIDTH: f64 = 720.0;
const WINDOW_HEIGHT: f64 = 440.0;

/// A janela da primeira tela escolhida; as das outras telas são `island-2`, `island-3`…
const MAIN_LABEL: &str = "island";

/// A ilha só aparece quando nem o usuário (bandeja) nem um app em tela cheia pediram para escondê-la.
#[derive(Default)]
pub struct Visibility {
    user_hidden: AtomicBool,
    fullscreen: AtomicBool,
}

pub fn is_island(label: &str) -> bool {
    label == MAIN_LABEL || label.starts_with("island-")
}

/// Todas as janelas da ilha (uma por tela escolhida).
pub fn windows(app: &AppHandle) -> Vec<WebviewWindow> {
    let mut found: Vec<WebviewWindow> = app.webview_windows().into_values().filter(|w| is_island(w.label())).collect();
    found.sort_by(|a, b| a.label().cmp(b.label()));
    found
}

/// Manda um evento para a ilha de cada tela.
pub fn emit<S: Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    for window in windows(app) {
        let _ = app.emit_to(window.label(), event, payload.clone());
    }
}

/// A janela da ilha da tela onde o cursor está (ou a principal, se não der para saber).
pub fn window_under_cursor(app: &AppHandle) -> Option<WebviewWindow> {
    let all = windows(app);
    if let (Ok(cursor), Ok(monitors)) = (app.cursor_position(), app.available_monitors()) {
        // A tela que tem o cursor e a janela da ilha que está em cima dela.
        let inside = |x: f64, y: f64, origin: &PhysicalPosition<i32>, width: u32, height: u32| {
            x >= origin.x as f64 && x < origin.x as f64 + width as f64 && y >= origin.y as f64 && y < origin.y as f64 + height as f64
        };
        let screen = monitors.iter().find(|m| inside(cursor.x, cursor.y, m.position(), m.size().width, m.size().height));
        if let Some(screen) = screen {
            let hit = all.iter().find(|w| {
                w.outer_position()
                    .map(|p| inside(p.x as f64 + 1.0, p.y as f64 + 1.0, screen.position(), screen.size().width, screen.size().height))
                    .unwrap_or(false)
            });
            if let Some(window) = hit {
                return Some(window.clone());
            }
        }
    }
    all.into_iter().next()
}

fn monitor_id(monitor: &Monitor) -> String {
    monitor
        .name()
        .cloned()
        .unwrap_or_else(|| format!("{}x{}@{},{}", monitor.size().width, monitor.size().height, monitor.position().x, monitor.position().y))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: String,
    pub width: u32,
    pub height: u32,
    pub primary: bool,
}

/// As telas conectadas, para a configuração de em quais delas a ilha aparece.
#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let primary = app.primary_monitor().map_err(|e| e.to_string())?.map(|m| monitor_id(&m));
    Ok(app
        .available_monitors()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|m| MonitorInfo {
            id: monitor_id(m),
            width: m.size().width,
            height: m.size().height,
            primary: primary.as_deref() == Some(monitor_id(m).as_str()),
        })
        .collect())
}

/// Quais telas (posições em `all`) recebem a ilha: as escolhidas que existem; se nenhuma, a principal.
pub fn pick_screens(all: &[String], primary: Option<&str>, wanted: &[String]) -> Vec<usize> {
    let chosen: Vec<usize> = all.iter().enumerate().filter(|(_, id)| wanted.contains(id)).map(|(i, _)| i).collect();
    if !chosen.is_empty() {
        return chosen;
    }
    let fallback = primary.and_then(|p| all.iter().position(|id| id == p)).unwrap_or(0);
    if all.is_empty() { Vec::new() } else { vec![fallback] }
}

fn create(app: &AppHandle, label: &str) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("Docky")
        .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .build()
}

/// Centraliza a janela no topo da tela, sem capturar cliques.
fn place_on(window: &WebviewWindow, monitor: &Monitor) -> tauri::Result<()> {
    let scale = monitor.scale_factor();
    let width = (WINDOW_WIDTH * scale).round() as i32;
    let at = PhysicalPosition::new(monitor.position().x + (monitor.size().width as i32 - width) / 2, monitor.position().y);
    // Posição, tamanho, posição: o tamanho lógico depende da escala da tela onde a janela está.
    window.set_position(at)?;
    window.set_size(LogicalSize::new(WINDOW_WIDTH, WINDOW_HEIGHT))?;
    window.set_position(at)?;
    window.set_always_on_top(true)?;
    window.set_ignore_cursor_events(true)
}

/// Põe uma janela da ilha em cada tela escolhida (cria as que faltam e fecha as que sobram) e a mostra.
pub fn reconcile(app: &AppHandle) -> tauri::Result<()> {
    let monitors = app.available_monitors()?;
    if monitors.is_empty() {
        return Ok(());
    }
    let ids: Vec<String> = monitors.iter().map(monitor_id).collect();
    let primary = app.primary_monitor()?.map(|m| monitor_id(&m));
    let wanted = app.state::<ConfigState>().get().screens;

    let mut keep: HashSet<String> = HashSet::new();
    for (n, index) in pick_screens(&ids, primary.as_deref(), &wanted).into_iter().enumerate() {
        let label = if n == 0 { MAIN_LABEL.to_string() } else { format!("island-{}", n + 1) };
        let window = match app.get_webview_window(&label) {
            Some(window) => window,
            None => create(app, &label)?,
        };
        place_on(&window, &monitors[index])?;
        keep.insert(label);
    }
    for window in windows(app) {
        if !keep.contains(window.label()) {
            let _ = window.close();
        }
    }
    apply(app);
    Ok(())
}

/// Se uma tela for ligada, desligada ou mudar de lugar, refaz as janelas.
pub fn watch(app: AppHandle) {
    thread::spawn(move || {
        let signature = |app: &AppHandle| {
            app.available_monitors()
                .map(|list| {
                    list.iter()
                        .map(|m| format!("{}:{}x{}@{},{}", monitor_id(m), m.size().width, m.size().height, m.position().x, m.position().y))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default()
        };
        let mut last = signature(&app);
        loop {
            thread::sleep(Duration::from_secs(3));
            let now = signature(&app);
            if now != last {
                last = now;
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = reconcile(&handle);
                });
            }
        }
    });
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
    for window in windows(app) {
        let _ = if hidden { window.hide() } else { window.show() };
    }
}

#[cfg(test)]
mod tests {
    use super::{is_island, pick_screens};

    fn ids(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn sem_escolha_fica_so_a_principal() {
        let all = ids(&["A", "B", "C"]);
        assert_eq!(pick_screens(&all, Some("B"), &[]), [1]);
        assert_eq!(pick_screens(&all, None, &[]), [0]);
    }

    #[test]
    fn usa_as_escolhidas_que_existem_na_ordem_das_telas() {
        let all = ids(&["A", "B", "C"]);
        assert_eq!(pick_screens(&all, Some("A"), &ids(&["C", "A"])), [0, 2]);
        // Escolheu só uma tela que foi desligada: volta para a principal.
        assert_eq!(pick_screens(&all, Some("A"), &ids(&["Z"])), [0]);
        assert!(pick_screens(&[], None, &ids(&["A"])).is_empty());
    }

    #[test]
    fn reconhece_as_janelas_da_ilha() {
        assert!(is_island("island"));
        assert!(is_island("island-2"));
        assert!(!is_island("settings"));
    }
}
