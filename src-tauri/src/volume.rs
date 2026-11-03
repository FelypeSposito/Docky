//! Volume principal do Windows (Core Audio). Avisa o frontend quando muda, de qualquer lugar.

use std::{thread, time::Duration};

use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Volume {
    /// 0.0 a 1.0
    pub level: f32,
    pub muted: bool,
}

#[cfg(windows)]
mod endpoint {
    use windows::Win32::{
        Media::Audio::{
            Endpoints::IAudioEndpointVolume, IMMDeviceEnumerator, MMDeviceEnumerator, eConsole, eRender,
        },
        System::Com::{CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx},
    };

    use super::Volume;

    pub fn init_thread() {
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    }

    fn endpoint() -> Option<IAudioEndpointVolume> {
        unsafe {
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
            device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None).ok()
        }
    }

    pub fn read() -> Option<Volume> {
        let endpoint = endpoint()?;
        unsafe {
            Some(Volume {
                level: endpoint.GetMasterVolumeLevelScalar().ok()?,
                muted: endpoint.GetMute().ok()?.as_bool(),
            })
        }
    }

    pub fn set_level(level: f32) {
        if let Some(endpoint) = endpoint() {
            let _ = unsafe { endpoint.SetMasterVolumeLevelScalar(level.clamp(0.0, 1.0), std::ptr::null()) };
        }
    }

    pub fn set_muted(muted: bool) {
        if let Some(endpoint) = endpoint() {
            let _ = unsafe { endpoint.SetMute(muted, std::ptr::null()) };
        }
    }
}

#[cfg(not(windows))]
mod endpoint {
    use super::Volume;
    pub fn init_thread() {}
    pub fn read() -> Option<Volume> {
        None
    }
    pub fn set_level(_: f32) {}
    pub fn set_muted(_: bool) {}
}

#[tauri::command]
pub async fn get_volume() -> Option<Volume> {
    endpoint::init_thread();
    endpoint::read()
}

#[tauri::command]
pub async fn set_volume(level: f32) {
    endpoint::init_thread();
    endpoint::set_level(level);
}

#[tauri::command]
pub async fn set_muted(muted: bool) {
    endpoint::init_thread();
    endpoint::set_muted(muted);
}

pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        endpoint::init_thread();
        let mut last: Option<Volume> = None;
        loop {
            let current = endpoint::read();
            if current != last {
                // O primeiro valor lido não é uma "mudança": só registra, sem avisar.
                if last.is_some() {
                    if let Some(volume) = current {
                        crate::island::emit(&app, "volume", volume);
                    }
                }
                last = current;
            }
            thread::sleep(Duration::from_millis(200));
        }
    });
}
