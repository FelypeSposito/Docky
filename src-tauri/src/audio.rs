//! PC audio controls: mute the default microphone, list the sound outputs and pick which one is the default.
//!
//! Volume itself stays in `volume.rs`. Switching the default output goes through `policy_config`, which wraps an
//! undocumented Windows interface; read the note there before touching it.

use std::{thread, time::Duration};

use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OutputKind {
    Headphones,
    Speakers,
    Display,
    Other,
}

/// What an output is, from its `EndpointFormFactor` (mmdeviceapi.h).
pub fn kind_from_form_factor(form_factor: u32) -> OutputKind {
    match form_factor {
        3 | 5 | 6 => OutputKind::Headphones, // Headphones, Headset, Handset
        1 => OutputKind::Speakers,
        9 => OutputKind::Display, // DigitalAudioDisplayDevice (HDMI / DisplayPort monitor)
        _ => OutputKind::Other,
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub id: String,
    /// Windows' friendly name, e.g. "Fones de ouvido (UGREEN Studio Pro)".
    pub name: String,
    pub kind: OutputKind,
    pub default: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mic {
    pub muted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioState {
    pub outputs: Vec<Output>,
    /// `None` when there is no microphone.
    pub mic: Option<Mic>,
}

#[cfg(windows)]
mod imp {
    use windows::{
        Win32::{
            Devices::FunctionDiscovery::PKEY_Device_FriendlyName,
            Foundation::PROPERTYKEY,
            Media::Audio::{
                DEVICE_STATE_ACTIVE, ERole, Endpoints::IAudioEndpointVolume, IMMDevice, IMMDeviceEnumerator,
                MMDeviceEnumerator, PKEY_AudioEndpoint_FormFactor, eCapture, eConsole, eMultimedia, eRender,
            },
            System::Com::{
                CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree, STGM_READ,
                StructuredStorage::{PropVariantClear, PropVariantToStringAlloc, PropVariantToUInt32},
            },
            UI::Shell::PropertiesSystem::IPropertyStore,
        },
        core::{HSTRING, PWSTR},
    };

    use super::{AudioState, Mic, Output, kind_from_form_factor};

    pub fn init_thread() {
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    }

    fn enumerator() -> Option<IMMDeviceEnumerator> {
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok() }
    }

    fn take_pwstr(text: PWSTR) -> String {
        let value = unsafe { text.to_string().unwrap_or_default() };
        unsafe { CoTaskMemFree(Some(text.0 as _)) };
        value
    }

    fn device_id(device: &IMMDevice) -> Option<String> {
        unsafe { device.GetId().ok().map(take_pwstr) }
    }

    fn read_string(store: &IPropertyStore, key: &PROPERTYKEY) -> Option<String> {
        unsafe {
            let mut value = store.GetValue(key).ok()?;
            let text = PropVariantToStringAlloc(&value).ok().map(take_pwstr);
            let _ = PropVariantClear(&mut value);
            text
        }
    }

    fn read_u32(store: &IPropertyStore, key: &PROPERTYKEY) -> Option<u32> {
        unsafe {
            let mut value = store.GetValue(key).ok()?;
            let number = PropVariantToUInt32(&value).ok();
            let _ = PropVariantClear(&mut value);
            number
        }
    }

    /// The default microphone's mute, with the device's id (so a device change is not mistaken for a toggle).
    pub fn mic() -> Option<(String, Mic)> {
        unsafe {
            let device = enumerator()?.GetDefaultAudioEndpoint(eCapture, eConsole).ok()?;
            let endpoint = device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None).ok()?;
            Some((device_id(&device)?, Mic { muted: endpoint.GetMute().ok()?.as_bool() }))
        }
    }

    pub fn set_mic_muted(muted: bool) -> bool {
        unsafe {
            let Some(device) = enumerator().and_then(|e| e.GetDefaultAudioEndpoint(eCapture, eConsole).ok()) else {
                return false;
            };
            let Ok(endpoint) = device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) else { return false };
            endpoint.SetMute(muted, std::ptr::null()).is_ok()
        }
    }

    pub fn outputs() -> Vec<Output> {
        let Some(enumerator) = enumerator() else { return Vec::new() };
        unsafe {
            let default_id = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).ok().and_then(|d| device_id(&d));
            let Ok(collection) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) else { return Vec::new() };
            let count = collection.GetCount().unwrap_or(0);
            (0..count)
                .filter_map(|i| {
                    let device = collection.Item(i).ok()?;
                    let id = device_id(&device)?;
                    let store = device.OpenPropertyStore(STGM_READ).ok()?;
                    let name = read_string(&store, &PKEY_Device_FriendlyName).unwrap_or_else(|| "Saída de som".into());
                    let kind = kind_from_form_factor(read_u32(&store, &PKEY_AudioEndpoint_FormFactor).unwrap_or(10));
                    Some(Output { default: default_id.as_deref() == Some(id.as_str()), id, name, kind })
                })
                .collect()
        }
    }

    pub fn state() -> AudioState {
        AudioState { outputs: outputs(), mic: mic().map(|(_, mic)| mic) }
    }

    /// Makes `id` the default output for apps and media. Leaves communications (calls) alone, like Windows' own
    /// sound settings.
    pub fn set_default_output(id: &str) -> Result<(), String> {
        let id = HSTRING::from(id);
        for role in [eConsole, eMultimedia] {
            super::policy_config::set_default_endpoint(&id, ERole(role.0))?;
        }
        Ok(())
    }
}

/// `IPolicyConfig` is how Windows' own sound settings change the default device. Microsoft never documented it, so:
/// - the GUIDs and the method order below were taken from public reverse engineering (Windows 7 to 11 share them);
/// - a future Windows could change it. Creating the object then fails or the call returns an error, and the caller
///   falls back to opening the Windows sound settings. A changed vtable would call the wrong method, which is why only
///   `SetDefaultEndpoint` is ever called and the earlier slots are declared just to keep the layout.
#[cfg(windows)]
#[allow(non_snake_case)] // COM method names keep Windows' spelling
mod policy_config {
    use std::ffi::c_void;

    use windows::{
        Win32::{
            Media::Audio::ERole,
            System::Com::{CLSCTX_ALL, CoCreateInstance},
        },
        core::{GUID, HRESULT, HSTRING, IUnknown, IUnknown_Vtbl, PCWSTR, interface},
    };

    const CLSID_POLICY_CONFIG_CLIENT: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

    #[interface("f8679f50-850a-41cf-9c72-430f290290c8")]
    unsafe trait IPolicyConfig: IUnknown {
        fn GetMixFormat(&self, device: PCWSTR, format: *mut *mut c_void) -> HRESULT;
        fn GetDeviceFormat(&self, device: PCWSTR, default: i32, format: *mut *mut c_void) -> HRESULT;
        fn ResetDeviceFormat(&self, device: PCWSTR) -> HRESULT;
        fn SetDeviceFormat(&self, device: PCWSTR, endpoint: *mut c_void, mix: *mut c_void) -> HRESULT;
        fn GetProcessingPeriod(&self, device: PCWSTR, default: i32, period: *mut i64, minimum: *mut i64) -> HRESULT;
        fn SetProcessingPeriod(&self, device: PCWSTR, period: *mut i64) -> HRESULT;
        fn GetShareMode(&self, device: PCWSTR, mode: *mut c_void) -> HRESULT;
        fn SetShareMode(&self, device: PCWSTR, mode: *mut c_void) -> HRESULT;
        fn GetPropertyValue(&self, device: PCWSTR, store: i32, key: *const c_void, value: *mut c_void) -> HRESULT;
        fn SetPropertyValue(&self, device: PCWSTR, store: i32, key: *const c_void, value: *mut c_void) -> HRESULT;
        fn SetDefaultEndpoint(&self, device: PCWSTR, role: ERole) -> HRESULT;
        fn SetEndpointVisibility(&self, device: PCWSTR, visible: i32) -> HRESULT;
    }

    pub fn set_default_endpoint(id: &HSTRING, role: ERole) -> Result<(), String> {
        unsafe {
            let config: IPolicyConfig =
                CoCreateInstance(&CLSID_POLICY_CONFIG_CLIENT, None, CLSCTX_ALL).map_err(|e| e.message())?;
            config.SetDefaultEndpoint(PCWSTR(id.as_ptr()), role).ok().map_err(|e| e.message())
        }
    }
}

/// macOS: the microphone through AppleScript's input volume (muting sets it to 0 and unmuting puts back the level it
/// had). Choosing the output device needs CoreAudio's private switch, so the Som page leaves that to the system.
#[cfg(target_os = "macos")]
mod imp {
    use std::sync::atomic::{AtomicU32, Ordering};

    use super::{AudioState, Mic, Output};

    /// The input level before muting, to put back.
    static BEFORE_MUTE: AtomicU32 = AtomicU32::new(0);

    pub fn init_thread() {}
    pub fn mic() -> Option<(String, Mic)> {
        let level = crate::mac::input_volume()?;
        Some(("Microfone".to_string(), Mic { muted: level == 0 }))
    }
    pub fn set_mic_muted(muted: bool) -> bool {
        if muted {
            if let Some(level) = crate::mac::input_volume().filter(|l| *l > 0) {
                BEFORE_MUTE.store(level, Ordering::Relaxed);
            }
            crate::mac::set_input_volume(0)
        } else {
            let before = BEFORE_MUTE.load(Ordering::Relaxed);
            crate::mac::set_input_volume(if before > 0 { before } else { 75 })
        }
    }
    pub fn outputs() -> Vec<Output> {
        Vec::new()
    }
    pub fn state() -> AudioState {
        AudioState { outputs: Vec::new(), mic: mic().map(|(_, m)| m) }
    }
    pub fn set_default_output(_: &str) -> Result<(), String> {
        Err("no macOS, a saída de som se escolhe no menu Som".into())
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod imp {
    use super::{AudioState, Mic, Output};
    pub fn init_thread() {}
    pub fn mic() -> Option<(String, Mic)> {
        None
    }
    pub fn set_mic_muted(_: bool) -> bool {
        false
    }
    pub fn outputs() -> Vec<Output> {
        Vec::new()
    }
    pub fn state() -> AudioState {
        AudioState { outputs: Vec::new(), mic: None }
    }
    pub fn set_default_output(_: &str) -> Result<(), String> {
        Err("only on Windows".into())
    }
}

/// How often the microphone's mute is read: on macOS each reading runs AppleScript, so less often.
#[cfg(not(target_os = "macos"))]
const MIC_POLL: Duration = Duration::from_millis(250);
#[cfg(target_os = "macos")]
const MIC_POLL: Duration = Duration::from_millis(1000);

#[tauri::command]
pub async fn audio_state() -> AudioState {
    imp::init_thread();
    imp::state()
}

/// Mutes or unmutes the default microphone (the one the watcher and Ctrl+Alt+M use). False without one.
#[tauri::command]
pub async fn set_default_mic_muted(muted: bool) -> bool {
    imp::init_thread();
    imp::set_mic_muted(muted)
}

/// Why the default output did not change.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum SwitchError {
    /// Windows refused, or the output is gone. The island opens the Windows sound settings instead.
    Refused,
    /// The switch worked, but another app made itself the default again right away. Sound enhancers such as FxSound
    /// do this on purpose: they stay the default and send the sound to the device picked in their own window.
    TakenBack { by: String },
}

/// How long another app gets to take the default back before the switch counts as done.
const TAKE_BACK_WINDOW: Duration = Duration::from_millis(500);

/// Picks the default output and checks that it stayed.
#[tauri::command]
pub async fn set_output(id: String) -> Result<(), SwitchError> {
    imp::init_thread();
    if !imp::outputs().iter().any(|o| o.id == id) {
        return Err(SwitchError::Refused);
    }
    imp::set_default_output(&id).map_err(|_| SwitchError::Refused)?;
    thread::sleep(TAKE_BACK_WINDOW);
    match imp::outputs().into_iter().find(|o| o.default) {
        Some(current) if current.id != id => Err(SwitchError::TakenBack { by: current.name }),
        _ => Ok(()),
    }
}

/// Opens Windows' sound settings, where every output and input can be picked by hand.
#[tauri::command]
pub fn open_sound_settings(window: tauri::WebviewWindow) -> Result<(), String> {
    crate::placement::follow(crate::placement::Screen::of_window(&window), 8);
    tauri_plugin_opener::open_url("ms-settings:sound", None::<&str>).map_err(|e| e.to_string())
}

/// Flips the microphone's mute (the Ctrl+Alt+M hotkey). The watcher in `spawn` shows the notice.
pub fn toggle_mic() {
    thread::spawn(|| {
        imp::init_thread();
        if let Some((_, mic)) = imp::mic() {
            imp::set_mic_muted(!mic.muted);
        }
    });
}

/// Watches the default microphone's mute, whoever changes it (Docky, a headset button, a call app), and tells the
/// islands. Switching to another microphone is not a toggle and stays silent.
pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        imp::init_thread();
        let mut last = imp::mic();
        loop {
            thread::sleep(MIC_POLL);
            let current = imp::mic();
            if let (Some((last_id, last_mic)), Some((id, mic))) = (&last, &current) {
                if last_id == id && last_mic != mic {
                    crate::island::emit(&app, "mic", *mic);
                }
            }
            last = current;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn form_factor_maps_headsets_to_headphones() {
        assert_eq!(kind_from_form_factor(3), OutputKind::Headphones);
        assert_eq!(kind_from_form_factor(5), OutputKind::Headphones);
        assert_eq!(kind_from_form_factor(1), OutputKind::Speakers);
        assert_eq!(kind_from_form_factor(9), OutputKind::Display);
        assert_eq!(kind_from_form_factor(10), OutputKind::Other);
    }

    /// Lists the real outputs and the microphone of this PC without changing anything.
    /// `cargo test real_audio_devices -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_audio_devices() {
        imp::init_thread();
        let state = imp::state();
        println!("{state:#?}");
        assert!(!state.outputs.is_empty());
    }

    /// Really mutes and unmutes the microphone and switches the default output for a moment, then restores both.
    /// It changes where this PC plays sound for about a second.
    /// `cargo test real_switch_round_trip -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_switch_round_trip() {
        imp::init_thread();

        let (_, before) = imp::mic().expect("a microphone");
        assert!(imp::set_mic_muted(!before.muted));
        thread::sleep(Duration::from_millis(150));
        assert_eq!(imp::mic().unwrap().1.muted, !before.muted, "mute did not change");
        assert!(imp::set_mic_muted(before.muted));
        thread::sleep(Duration::from_millis(150));
        assert_eq!(imp::mic().unwrap().1, before, "mute was not restored");
        println!("mic: flipped and restored ({before:?})");

        let outputs = imp::outputs();
        let original = outputs.iter().find(|o| o.default).expect("a default output").clone();
        let Some(other) = outputs.iter().find(|o| !o.default) else {
            println!("only one output, nothing to switch");
            return;
        };
        // Read right away: an enhancer like FxSound takes the default back within ~100 ms.
        imp::set_default_output(&other.id).expect("switch");
        let switched = imp::outputs().into_iter().find(|o| o.default).map(|o| o.id);
        thread::sleep(TAKE_BACK_WINDOW);
        let later = imp::outputs().into_iter().find(|o| o.default).expect("a default output");
        if later.id != other.id {
            println!("note: {} took the default back", later.name);
        }
        imp::set_default_output(&original.id).expect("restore");
        thread::sleep(Duration::from_millis(300));
        let restored = imp::outputs().into_iter().find(|o| o.default).map(|o| o.id);
        println!("output: {} → {} → {}", original.name, other.name, original.name);
        assert_eq!(switched.as_deref(), Some(other.id.as_str()), "default output did not switch");
        assert_eq!(restored.as_deref(), Some(original.id.as_str()), "default output was not restored");
    }
}
