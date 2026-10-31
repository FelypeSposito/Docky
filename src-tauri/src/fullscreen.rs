use std::{thread, time::Duration};

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

/// Esconde a ilha enquanto um app (jogo, vídeo, apresentação) está em tela cheia, se a opção estiver ligada.
pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        loop {
            let hide_enabled = app.state::<ConfigState>().get().hide_in_fullscreen;
            island::set_fullscreen(&app, hide_enabled && fullscreen_app_running());
            thread::sleep(Duration::from_secs(1));
        }
    });
}
