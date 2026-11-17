use std::{
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::{config::ConfigState, island};

#[cfg(windows)]
fn fullscreen_app_running() -> bool {
    use windows::Win32::UI::Shell::{
        QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN, SHQueryUserNotificationState,
    };

    match unsafe { SHQueryUserNotificationState() } {
        Ok(state) => {
            state == QUNS_BUSY || state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE
        }
        Err(_) => false,
    }
}

#[cfg(not(windows))]
fn fullscreen_app_running() -> bool {
    false
}

/// The program in the foreground (the game or player that went fullscreen): its path.
#[cfg(windows)]
fn foreground_program() -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(GetForegroundWindow(), Some(&mut pid));
    }
    (pid != 0).then(|| crate::focus::process_path(pid)).flatten()
}

#[cfg(not(windows))]
fn foreground_program() -> Option<String> {
    None
}

/// Browsers and players: fullscreen there is a video, not a game.
pub fn is_video_app(path: &str) -> bool {
    const VIDEO: [&str; 10] = ["chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "vlc", "mpc-hc64", "mpc-be64", "potplayermini64"];
    VIDEO.iter().any(|name| crate::mixer::program_stem(path).eq_ignore_ascii_case(name))
}

/// Shown on the pill when a long fullscreen session ends.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub app: String,
    pub minutes: u64,
    /// A browser or player (a video), not a game.
    pub video: bool,
}

/// Shorter sessions (a quick video, a loading screen) get no summary.
const SUMMARY_AFTER: Duration = Duration::from_secs(5 * 60);

/// Esconde a ilha enquanto um app (jogo, vídeo, apresentação) está em tela cheia, se a opção estiver ligada. Quando
/// uma sessão longa termina, manda um resumo para a ilha (quanto tempo e em qual app).
pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        let mut started: Option<(Instant, Option<String>)> = None;
        loop {
            let fullscreen = fullscreen_app_running();
            let hide_enabled = app.state::<ConfigState>().hide_in_fullscreen();
            island::set_fullscreen(&app, hide_enabled && fullscreen);

            match (fullscreen, &started) {
                (true, None) => started = Some((Instant::now(), foreground_program())),
                (false, Some((since, program))) => {
                    let played = since.elapsed();
                    if played >= SUMMARY_AFTER {
                        if let Some(path) = program {
                            let summary = Summary { app: crate::mixer::describe(path), minutes: played.as_secs() / 60, video: is_video_app(path) };
                            island::emit(&app, "fullscreen-summary", summary);
                        }
                    }
                    started = None;
                }
                _ => {}
            }
            thread::sleep(Duration::from_secs(1));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::is_video_app;

    #[test]
    fn navegador_e_video_jogo_nao() {
        assert!(is_video_app(r"C:\Program Files\Google\Chrome\Application\chrome.exe"));
        assert!(is_video_app(r"C:\Program Files\VideoLAN\VLC\vlc.exe"));
        assert!(!is_video_app(r"C:\Riot Games\VALORANT\live\VALORANT.exe"));
    }
}
