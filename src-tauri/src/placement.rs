//! Faz as janelas dos apps que a ilha abre aparecerem na tela da ilha que foi clicada.
//!
//! O Windows abre a janela de um app onde ele quiser (em geral, na tela principal). Antes de abrir, guardamos quais
//! janelas já existiam; depois, durante alguns segundos, as janelas novas que aparecerem em outra tela são levadas
//! para a tela da ilha. Janelas de jogos em tela cheia exclusiva e apps que só abrem uma aba numa janela que já
//! existe não mudam de lugar.

use tauri::{Monitor, WebviewWindow};

/// A área de uma tela, em pixels físicos.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Screen {
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
}

impl Screen {
    pub fn of_monitor(monitor: &Monitor) -> Self {
        Self { left: monitor.position().x, top: monitor.position().y, width: monitor.size().width as i32, height: monitor.size().height as i32 }
    }

    /// A tela onde está a janela da ilha que fez o pedido.
    pub fn of_window(window: &WebviewWindow) -> Option<Self> {
        window.current_monitor().ok().flatten().map(|m| Self::of_monitor(&m))
    }
}

/// Onde pôr uma janela de `width` x `height` que estava em (`x`, `y`) dentro da tela `from`, para ela ficar na tela
/// `to` na mesma posição relativa e sem passar da borda.
pub fn relocate(from: Screen, to: Screen, x: i32, y: i32, width: i32, height: i32) -> (i32, i32) {
    let pin = |offset: i32, size: i32, room: i32| offset.clamp(0, (room - size).max(0));
    (to.left + pin(x - from.left, width, to.width), to.top + pin(y - from.top, height, to.height))
}

#[cfg(windows)]
mod imp {
    use std::{
        collections::HashSet,
        thread,
        time::{Duration, Instant},
    };

    use windows::Win32::{
        Foundation::{HWND, LPARAM, RECT},
        Graphics::{
            Dwm::{DWMWA_CLOAKED, DwmGetWindowAttribute},
            Gdi::{GetMonitorInfoW, MONITOR_DEFAULTTONEAREST, MONITORINFO, MonitorFromWindow},
        },
        UI::WindowsAndMessaging::{
            EnumWindows, GW_OWNER, GWL_EXSTYLE, GetWindow, GetWindowLongW, GetWindowRect, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible,
            IsZoomed, SW_MAXIMIZE, SW_RESTORE, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER, SetWindowPos, ShowWindow, WS_EX_TOOLWINDOW,
        },
    };
    use windows::core::BOOL;

    use super::{Screen, relocate};

    /// As janelas de apps que estão à vista agora (sem as de ferramentas, as sem título, as escondidas e as do Docky).
    fn visible_windows() -> HashSet<isize> {
        unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let found = unsafe { &mut *(lparam.0 as *mut HashSet<isize>) };
            unsafe {
                if !IsWindowVisible(hwnd).as_bool() || GetWindow(hwnd, GW_OWNER).is_ok_and(|owner| !owner.is_invalid()) {
                    return true.into();
                }
                if GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW.0 != 0 || GetWindowTextLengthW(hwnd) == 0 {
                    return true.into();
                }
                let mut cloaked = 0u32;
                let _ = DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut _ as *mut _, 4);
                let mut pid = 0u32;
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
                let mut rect = RECT::default();
                let _ = GetWindowRect(hwnd, &mut rect);
                let big_enough = rect.right - rect.left > 120 && rect.bottom - rect.top > 60;
                if cloaked == 0 && pid != std::process::id() && big_enough {
                    found.insert(hwnd.0 as isize);
                }
            }
            true.into()
        }
        let mut found = HashSet::new();
        let _ = unsafe { EnumWindows(Some(collect), LPARAM(&mut found as *mut _ as isize)) };
        found
    }

    fn move_to(hwnd: HWND, target: Screen) {
        unsafe {
            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            if !GetMonitorInfoW(monitor, &mut info).as_bool() {
                return;
            }
            let from = Screen {
                left: info.rcMonitor.left,
                top: info.rcMonitor.top,
                width: info.rcMonitor.right - info.rcMonitor.left,
                height: info.rcMonitor.bottom - info.rcMonitor.top,
            };
            if from == target {
                return; // já está na tela certa
            }
            let zoomed = IsZoomed(hwnd).as_bool();
            if zoomed {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            let mut rect = RECT::default();
            if GetWindowRect(hwnd, &mut rect).is_err() {
                return;
            }
            let (x, y) = relocate(from, target, rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
            let _ = SetWindowPos(hwnd, None, x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
            if zoomed {
                let _ = ShowWindow(hwnd, SW_MAXIMIZE);
            }
        }
    }

    /// Guarda as janelas de agora e, por `seconds`, leva para `target` as que aparecerem em outra tela.
    pub fn follow(target: Screen, seconds: u64) {
        let before = visible_windows();
        thread::spawn(move || {
            let mut handled: HashSet<isize> = HashSet::new();
            let deadline = Instant::now() + Duration::from_secs(seconds);
            while Instant::now() < deadline {
                thread::sleep(Duration::from_millis(200));
                for hwnd in visible_windows() {
                    if before.contains(&hwnd) || !handled.insert(hwnd) {
                        continue;
                    }
                    thread::sleep(Duration::from_millis(350)); // deixa o app terminar de se posicionar
                    move_to(HWND(hwnd as _), target);
                }
            }
        });
    }
}

/// Leva as janelas novas que o app abrir nos próximos segundos para a tela `target`.
pub fn follow(target: Option<Screen>, seconds: u64) {
    #[cfg(windows)]
    if let Some(target) = target {
        imp::follow(target, seconds);
    }
    #[cfg(not(windows))]
    let _ = (target, seconds);
}

#[cfg(test)]
mod tests {
    use super::{Screen, relocate};

    const MAIN: Screen = Screen { left: 0, top: 0, width: 1920, height: 1080 };
    const SIDE: Screen = Screen { left: -1080, top: -300, width: 1080, height: 1920 };

    #[test]
    fn mantem_a_posicao_relativa_na_outra_tela() {
        assert_eq!(relocate(MAIN, SIDE, 100, 200, 800, 600), (-1080 + 100, -300 + 200));
    }

    #[test]
    fn nao_passa_da_borda_da_tela_menor() {
        // Uma janela larga que estava no canto da tela principal cabe na vertical, encostada à esquerda.
        assert_eq!(relocate(MAIN, SIDE, 1000, 0, 1200, 700), (-1080, -300));
        assert_eq!(relocate(MAIN, SIDE, 900, 900, 400, 400), (-1080 + 680, -300 + 900));
    }

    #[test]
    fn volta_para_a_principal() {
        assert_eq!(relocate(SIDE, MAIN, -1000, 100, 500, 500), (80, 400));
    }
}
