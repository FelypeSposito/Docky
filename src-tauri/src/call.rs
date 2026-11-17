//! Calls: Windows records in the registry which apps are using the microphone right now (the same data that lights the
//! microphone icon in the taskbar). The pill shows how long the call has been going and a button to mute the mic.

use std::{thread, time::Duration};

use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Call {
    /// The app using the microphone ("Discord", "Google Chrome").
    pub app: String,
    /// When it started, in Unix milliseconds.
    pub since: u64,
}

/// 100 ns ticks between 1601-01-01 (Windows) and 1970-01-01 (Unix).
const WINDOWS_TO_UNIX_TICKS: u64 = 116_444_736_000_000_000;

pub fn filetime_to_unix_ms(filetime: u64) -> Option<u64> {
    filetime.checked_sub(WINDOWS_TO_UNIX_TICKS).map(|ticks| ticks / 10_000)
}

/// A Store app's consent key "Microsoft.Teams_8wekyb3d8bbwe" → "Teams".
pub fn packaged_name(key: &str) -> String {
    let base = key.split('_').next().unwrap_or(key);
    base.rsplit('.').next().unwrap_or(base).to_string()
}

/// A desktop app's consent key "C:#Users#voce#Discord.exe" → its path.
pub fn nonpackaged_path(key: &str) -> String {
    key.replace('#', "\\")
}

#[cfg(windows)]
mod registry {
    use std::ffi::c_void;

    use windows::{
        Win32::{
            Foundation::ERROR_SUCCESS,
            System::Registry::{HKEY, HKEY_CURRENT_USER, KEY_READ, RRF_RT_REG_QWORD, RegCloseKey, RegEnumKeyExW, RegGetValueW, RegOpenKeyExW},
        },
        core::{PCWSTR, PWSTR},
    };

    const ROOT: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn open(path: &str) -> Option<HKEY> {
        let mut key = HKEY::default();
        let path = wide(path);
        (unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, PCWSTR(path.as_ptr()), None, KEY_READ, &mut key) } == ERROR_SUCCESS).then_some(key)
    }

    fn subkeys(key: HKEY) -> Vec<String> {
        let mut out = Vec::new();
        for index in 0u32.. {
            let mut name = [0u16; 512];
            let mut len = name.len() as u32;
            let status = unsafe { RegEnumKeyExW(key, index, Some(PWSTR(name.as_mut_ptr())), &mut len, None, None, None, None) };
            if status != ERROR_SUCCESS {
                break;
            }
            out.push(String::from_utf16_lossy(&name[..len as usize]));
        }
        out
    }

    fn qword(key: HKEY, sub: &str, value: &str) -> Option<u64> {
        let (sub, value) = (wide(sub), wide(value));
        let mut data = 0u64;
        let mut size = std::mem::size_of::<u64>() as u32;
        let status = unsafe {
            RegGetValueW(key, PCWSTR(sub.as_ptr()), PCWSTR(value.as_ptr()), RRF_RT_REG_QWORD, None, Some(&mut data as *mut u64 as *mut c_void), Some(&mut size))
        };
        (status == ERROR_SUCCESS).then_some(data)
    }

    /// Apps using the microphone now: (consent key, is a desktop app, start as FILETIME).
    pub fn in_use() -> Vec<(String, bool, u64)> {
        let mut out = Vec::new();
        let Some(root) = open(ROOT) else { return out };
        let mut check = |key: HKEY, name: &str, desktop: bool| {
            let start = qword(key, name, "LastUsedTimeStart").unwrap_or(0);
            if start > 0 && qword(key, name, "LastUsedTimeStop") == Some(0) {
                out.push((name.to_string(), desktop, start));
            }
        };
        for name in subkeys(root) {
            if name == "NonPackaged" {
                if let Some(desktop) = open(&format!(r"{ROOT}\NonPackaged")) {
                    for app in subkeys(desktop) {
                        check(desktop, &app, true);
                    }
                    unsafe {
                        let _ = RegCloseKey(desktop);
                    }
                }
            } else {
                check(root, &name, false);
            }
        }
        unsafe {
            let _ = RegCloseKey(root);
        }
        out
    }
}

#[cfg(not(windows))]
mod registry {
    pub fn in_use() -> Vec<(String, bool, u64)> {
        Vec::new()
    }
}

/// The call going on now: the app that opened the microphone first.
pub fn current() -> Option<Call> {
    let (key, desktop, start) = registry::in_use().into_iter().min_by_key(|(_, _, start)| *start)?;
    let app = if desktop { crate::mixer::describe(&nonpackaged_path(&key)) } else { packaged_name(&key) };
    Some(Call { app, since: filetime_to_unix_ms(start)? })
}

#[cfg(windows)]
mod microphone {
    use windows::Win32::{
        Media::Audio::{Endpoints::IAudioEndpointVolume, IMMDeviceEnumerator, MMDeviceEnumerator, eCapture, eCommunications},
        System::Com::{CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx},
    };

    fn endpoint() -> Option<IAudioEndpointVolume> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
            let device = enumerator.GetDefaultAudioEndpoint(eCapture, eCommunications).ok()?;
            device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None).ok()
        }
    }

    pub fn muted() -> bool {
        endpoint().and_then(|e| unsafe { e.GetMute() }.ok()).map(|m| m.as_bool()).unwrap_or(false)
    }

    pub fn set_muted(muted: bool) {
        if let Some(endpoint) = endpoint() {
            let _ = unsafe { endpoint.SetMute(muted, std::ptr::null()) };
        }
    }
}

#[cfg(not(windows))]
mod microphone {
    pub fn muted() -> bool {
        false
    }
    pub fn set_muted(_: bool) {}
}

#[tauri::command]
pub async fn current_call() -> Option<Call> {
    current()
}

#[tauri::command]
pub async fn mic_muted() -> bool {
    microphone::muted()
}

#[tauri::command]
pub async fn set_mic_muted(muted: bool) {
    microphone::set_muted(muted);
}

/// Checks every 2 s and tells the island (event `call`) when a call starts, changes app or ends.
pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        let mut last: Option<Call> = None;
        loop {
            let now = current();
            if now != last {
                crate::island::emit(&app, "call", &now);
                last = now;
            }
            thread::sleep(Duration::from_secs(2));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nomes_das_chaves_do_microfone() {
        assert_eq!(packaged_name("Microsoft.Teams_8wekyb3d8bbwe"), "Teams");
        assert_eq!(packaged_name("MSTeams_8wekyb3d8bbwe"), "MSTeams");
        assert_eq!(nonpackaged_path("C:#Users#voce#AppData#Local#Discord#app-1.0#Discord.exe"), r"C:\Users\voce\AppData\Local\Discord\app-1.0\Discord.exe");
        assert_eq!(filetime_to_unix_ms(116_444_736_000_000_000), Some(0));
        assert_eq!(filetime_to_unix_ms(116_444_736_010_000_000), Some(1000));
        assert_eq!(filetime_to_unix_ms(5), None);
    }
}
