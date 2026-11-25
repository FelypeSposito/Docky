//! Volume de cada app, como o mixer do Windows: as sessões de áudio do dispositivo de saída padrão, agrupadas pelo
//! programa que toca (o Chrome abre várias sessões; mexer no volume dele mexe em todas).

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioApp {
    /// The program's path, or "system" for Windows sounds. Used to change its volume.
    pub id: String,
    pub name: String,
    /// PNG data URL of the program's icon.
    pub icon: Option<String>,
    /// 0.0 to 1.0
    pub volume: f32,
    pub muted: bool,
    /// Playing something right now.
    pub active: bool,
}

/// The program's file name without ".exe": "C:\…\Spotify.exe" → "Spotify".
pub fn program_stem(path: &str) -> &str {
    let file = path.rsplit(['\\', '/']).next().unwrap_or(path);
    file.strip_suffix(".exe").or_else(|| file.strip_suffix(".EXE")).unwrap_or(file)
}

/// A name for a program from its path when it has no description: "C:\…\discord.exe" → "Discord".
pub fn name_from_path(path: &str) -> String {
    let mut chars = program_stem(path).chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

/// A program's display name: its file description ("Google Chrome"), or else its file name.
pub fn describe(path: &str) -> String {
    #[cfg(windows)]
    if let Some(description) = sessions::file_description(path) {
        return description;
    }
    name_from_path(path)
}

#[cfg(windows)]
mod sessions {
    use std::{
        collections::HashMap,
        sync::{Mutex, OnceLock},
    };

    use base64::{Engine, engine::general_purpose::STANDARD};
    use windows::{
        Win32::{
            Foundation::S_OK,
            Media::Audio::{
                AudioSessionStateActive, AudioSessionStateExpired, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator,
                ISimpleAudioVolume, MMDeviceEnumerator, eConsole, eRender,
            },
            System::Com::{CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx},
        },
        core::{Interface, PCWSTR},
    };

    use super::AudioApp;

    pub struct Session {
        pub id: String,
        pub active: bool,
        pub volume: ISimpleAudioVolume,
    }

    /// Every live session of the default output, with the program it belongs to.
    pub fn list() -> Vec<Session> {
        let mut out = Vec::new();
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let Ok(enumerator) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) else {
                return out;
            };
            let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, eConsole) else { return out };
            let Ok(manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else { return out };
            let Ok(all) = manager.GetSessionEnumerator() else { return out };
            for i in 0..all.GetCount().unwrap_or(0) {
                let Ok(control) = all.GetSession(i) else { continue };
                let state = control.GetState().unwrap_or(AudioSessionStateExpired);
                if state == AudioSessionStateExpired {
                    continue;
                }
                let Ok(control2) = control.cast::<IAudioSessionControl2>() else { continue };
                let Ok(volume) = control.cast::<ISimpleAudioVolume>() else { continue };
                let id = if control2.IsSystemSoundsSession() == S_OK {
                    "system".to_string()
                } else {
                    let pid = control2.GetProcessId().unwrap_or(0);
                    match crate::focus::process_path(pid) {
                        Some(path) => path,
                        None => continue,
                    }
                };
                out.push(Session { id, active: state == AudioSessionStateActive, volume });
            }
        }
        out
    }

    /// Name and icon of each program, read once: the list is polled every second while the page is open.
    fn identity(id: &str) -> (String, Option<String>) {
        static CACHE: OnceLock<Mutex<HashMap<String, (String, Option<String>)>>> = OnceLock::new();
        let cache = CACHE.get_or_init(Default::default);
        if let Some(found) = cache.lock().unwrap().get(id) {
            return found.clone();
        }
        let found = if id == "system" {
            ("Sons do sistema".to_string(), None)
        } else {
            let name = super::describe(id);
            let icon = crate::shell_icon::icon_png(id, 32).map(|png| format!("data:image/png;base64,{}", STANDARD.encode(png)));
            (name, icon)
        };
        cache.lock().unwrap().insert(id.to_string(), found.clone());
        found
    }

    /// The "File description" of a program (what the Task Manager shows: "Google Chrome", "Spotify").
    pub fn file_description(path: &str) -> Option<String> {
        use std::ffi::c_void;
        use windows::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};

        let wide = |text: &str| text.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
        let file = wide(path);
        unsafe {
            let size = GetFileVersionInfoSizeW(PCWSTR(file.as_ptr()), None);
            if size == 0 {
                return None;
            }
            let mut data = vec![0u8; size as usize];
            GetFileVersionInfoW(PCWSTR(file.as_ptr()), None, size, data.as_mut_ptr() as *mut c_void).ok()?;
            let mut pointer: *mut c_void = std::ptr::null_mut();
            let mut len = 0u32;
            let query = wide(r"\VarFileInfo\Translation");
            if !VerQueryValueW(data.as_ptr() as *const c_void, PCWSTR(query.as_ptr()), &mut pointer, &mut len).as_bool() || len < 4 {
                return None;
            }
            let pair = pointer as *const u16;
            let (language, codepage) = (*pair, *pair.add(1));
            let query = wide(&format!(r"\StringFileInfo\{language:04x}{codepage:04x}\FileDescription"));
            if !VerQueryValueW(data.as_ptr() as *const c_void, PCWSTR(query.as_ptr()), &mut pointer, &mut len).as_bool() || len == 0 {
                return None;
            }
            let chars = std::slice::from_raw_parts(pointer as *const u16, len as usize);
            let end = chars.iter().position(|&c| c == 0).unwrap_or(chars.len());
            let text = String::from_utf16_lossy(&chars[..end]).trim().to_string();
            (!text.is_empty()).then_some(text)
        }
    }

    pub fn apps() -> Vec<AudioApp> {
        let mut apps: Vec<AudioApp> = Vec::new();
        for session in list() {
            let (volume, muted) = unsafe {
                (session.volume.GetMasterVolume().unwrap_or(1.0), session.volume.GetMute().map(|m| m.as_bool()).unwrap_or(false))
            };
            match apps.iter_mut().find(|a| a.id == session.id) {
                Some(app) => {
                    app.active |= session.active;
                    app.muted &= muted;
                    app.volume = app.volume.max(volume);
                }
                None => {
                    let (name, icon) = identity(&session.id);
                    apps.push(AudioApp { id: session.id, name, icon, volume, muted, active: session.active });
                }
            }
        }
        // Playing first, then by name; Windows sounds at the end.
        apps.sort_by(|a, b| {
            (a.id == "system", !a.active, a.name.to_lowercase()).cmp(&(b.id == "system", !b.active, b.name.to_lowercase()))
        });
        apps
    }

    pub fn set_volume(id: &str, level: f32) {
        for session in list().into_iter().filter(|s| s.id == id) {
            let _ = unsafe { session.volume.SetMasterVolume(level.clamp(0.0, 1.0), std::ptr::null()) };
        }
    }

    pub fn set_muted(id: &str, muted: bool) {
        for session in list().into_iter().filter(|s| s.id == id) {
            let _ = unsafe { session.volume.SetMute(muted, std::ptr::null()) };
        }
    }

    /// The sessions of the program called `name` ("spotify", "chrome").
    fn named(name: &str) -> Vec<Session> {
        list().into_iter().filter(|s| s.id != "system" && super::program_stem(&s.id).eq_ignore_ascii_case(name)).collect()
    }

    pub fn named_volume(name: &str) -> Option<super::AppVolume> {
        let sessions = named(name);
        if sessions.is_empty() {
            return None;
        }
        let mut volume = 0.0f32;
        let mut muted = true;
        for session in &sessions {
            unsafe {
                volume = volume.max(session.volume.GetMasterVolume().unwrap_or(1.0));
                muted &= session.volume.GetMute().map(|m| m.as_bool()).unwrap_or(false);
            }
        }
        Some(super::AppVolume { volume, muted })
    }

    pub fn set_named_volume(name: &str, level: f32) {
        for session in named(name) {
            unsafe {
                let _ = session.volume.SetMasterVolume(level.clamp(0.0, 1.0), std::ptr::null());
                let _ = session.volume.SetMute(false, std::ptr::null());
            }
        }
    }

    pub fn set_named_muted(name: &str, muted: bool) {
        for session in named(name) {
            let _ = unsafe { session.volume.SetMute(muted, std::ptr::null()) };
        }
    }
}

#[cfg(not(windows))]
mod sessions {
    pub fn apps() -> Vec<super::AudioApp> {
        Vec::new()
    }
    pub fn set_volume(_: &str, _: f32) {}
    pub fn set_muted(_: &str, _: bool) {}
    pub fn named_volume(_: &str) -> Option<super::AppVolume> {
        None
    }
    pub fn set_named_volume(_: &str, _: f32) {}
    pub fn set_named_muted(_: &str, _: bool) {}
}

#[tauri::command]
pub async fn audio_apps() -> Vec<AudioApp> {
    sessions::apps()
}

#[tauri::command]
pub async fn set_app_volume(id: String, level: f32) {
    sessions::set_volume(&id, level);
}

#[tauri::command]
pub async fn set_app_muted(id: String, muted: bool) {
    sessions::set_muted(&id, muted);
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVolume {
    pub volume: f32,
    pub muted: bool,
}

/// The program behind the media that is playing, as a name the sessions can be matched by.
fn playing_program() -> Option<String> {
    crate::media::playing_app().map(|app| crate::media::app_id_name(&app))
}

/// Volume of the app that is playing (the Music page slider), or `None` when it has no audio session.
#[tauri::command]
pub async fn media_app_volume() -> Option<AppVolume> {
    sessions::named_volume(&playing_program()?)
}

#[tauri::command]
pub async fn set_media_app_volume(level: f32) {
    if let Some(name) = playing_program() {
        sessions::set_named_volume(&name, level);
    }
}

#[tauri::command]
pub async fn set_media_app_muted(muted: bool) {
    if let Some(name) = playing_program() {
        sessions::set_named_muted(&name, muted);
    }
}

#[cfg(test)]
mod tests {
    use super::name_from_path;

    // Windows paths (backslashes, drive letters): a Windows behaviour.
    #[cfg(windows)]
    #[test]
    fn nome_pelo_caminho() {
        assert_eq!(name_from_path(r"C:\Users\voce\AppData\Local\Discord\app-1.0\Discord.exe"), "Discord");
        assert_eq!(name_from_path(r"C:\Program Files\foobar2000\foobar2000.exe"), "Foobar2000");
        assert_eq!(name_from_path("vlc.EXE"), "Vlc");
    }
}
