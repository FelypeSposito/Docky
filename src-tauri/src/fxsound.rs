//! FxSound (an audio enhancer many people run) from the Som page: its preset, its power and the device it plays to.
//!
//! FxSound has command-line options that act on the running instance (docs/COMMAND_LINE_OPTIONS.md in
//! fxsound2/fxsound-app): `--status` writes its state to `%APPDATA%\FxSound\status.json`, and `--preset=`, `--power=`
//! and `--output=` change it. Docky only ever talks to an FxSound that is already running (its own program, found by
//! the process): it never starts FxSound, and without it nothing here does anything.

use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime},
};

use serde::Serialize;
use serde_json::Value;

/// What the Som page shows of FxSound.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FxState {
    /// Processing on.
    pub power: bool,
    /// The presets, FxSound's own first and then the person's, by name.
    pub presets: Vec<String>,
    pub preset: String,
    /// The devices FxSound can play to (Windows' names), and the one it plays to now.
    pub outputs: Vec<String>,
    pub output: String,
}

/// Reads `status.json`. `None` if it is not FxSound's status (or a version that names things otherwise).
pub fn parse_status(text: &str) -> Option<FxState> {
    let json: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    let names = |list: Option<&Value>| -> Vec<String> {
        list.and_then(Value::as_array)
            .map(|items| items.iter().filter_map(|p| p.get("name").and_then(Value::as_str).or_else(|| p.as_str())).map(str::to_string).collect())
            .unwrap_or_default()
    };
    let presets = json.get("presets")?;
    let mut all = names(presets.get("built_in"));
    for name in names(presets.get("user")) {
        if !all.contains(&name) {
            all.push(name);
        }
    }
    let outputs: Vec<String> = json.get("output_devices")?.as_array()?.iter().filter_map(Value::as_str).map(str::to_string).collect();
    Some(FxState {
        power: json.get("power").and_then(Value::as_bool).unwrap_or(false),
        presets: all,
        preset: json.get("selected_preset").and_then(Value::as_str).unwrap_or_default().to_string(),
        outputs,
        output: json.get("selected_output").and_then(Value::as_str).unwrap_or_default().to_string(),
    })
}

/// A value for `--preset="…"` / `--output="…"`: FxSound reads it between double quotes, so a quote cannot be in it.
pub fn quoted(option: &str, value: &str) -> String {
    format!("--{option}=\"{}\"", value.replace('"', ""))
}

/// The running FxSound's program, or `None` when FxSound is not running.
fn running_fxsound() -> Option<PathBuf> {
    use sysinfo::{ProcessesToUpdate, System};
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);
    system
        .processes()
        .values()
        .find(|p| p.name().to_string_lossy().eq_ignore_ascii_case("fxsound.exe"))
        .and_then(|p| p.exe().map(Path::to_path_buf))
}

fn status_path() -> Option<PathBuf> {
    Some(PathBuf::from(std::env::var_os("APPDATA")?).join("FxSound").join("status.json"))
}

/// Runs FxSound's program with raw arguments (FxSound wants `--preset="Bass Booster"` exactly so) and waits for it.
#[cfg(windows)]
fn run(exe: &Path, args: &[String]) -> bool {
    use std::os::windows::process::CommandExt;
    const NO_WINDOW: u32 = 0x0800_0000;
    let mut command = std::process::Command::new(exe);
    command.creation_flags(NO_WINDOW);
    for arg in args {
        command.raw_arg(arg);
    }
    command.status().is_ok()
}

#[cfg(not(windows))]
fn run(_exe: &Path, _args: &[String]) -> bool {
    false
}

/// Asks the running FxSound for its state and reads it once FxSound has written it (a second or so).
fn read_state(exe: &Path) -> Option<FxState> {
    let path = status_path()?;
    let before = std::fs::metadata(&path).and_then(|m| m.modified()).unwrap_or(SystemTime::UNIX_EPOCH);
    if !run(exe, &["--status".to_string()]) {
        return None;
    }
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(3) {
        let changed = std::fs::metadata(&path).and_then(|m| m.modified()).is_ok_and(|at| at > before);
        // A file being written may not parse yet: try again a moment later.
        if changed && let Some(state) = std::fs::read_to_string(&path).ok().as_deref().and_then(parse_status) {
            return Some(state);
        }
        std::thread::sleep(Duration::from_millis(80));
    }
    std::fs::read_to_string(&path).ok().as_deref().and_then(parse_status)
}

/// FxSound's state, or `None` when it is not running (nothing to show on the Som page then).
#[tauri::command]
pub async fn fxsound_state() -> Result<Option<FxState>, String> {
    tauri::async_runtime::spawn_blocking(|| running_fxsound().and_then(|exe| read_state(&exe))).await.map_err(|e| e.to_string())
}

/// Changes FxSound's preset, power or output device (what is given), and returns its state after.
#[tauri::command]
pub async fn fxsound_set(power: Option<bool>, preset: Option<String>, output: Option<String>) -> Result<Option<FxState>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(exe) = running_fxsound() else { return None };
        let mut args = Vec::new();
        if let Some(on) = power {
            args.push(format!("--power={}", u8::from(on)));
        }
        if let Some(name) = preset.filter(|n| !n.trim().is_empty()) {
            args.push(quoted("preset", &name));
        }
        if let Some(device) = output.filter(|d| !d.trim().is_empty()) {
            args.push(quoted("output", &device));
        }
        if !args.is_empty() {
            run(&exe, &args);
            // FxSound applies it in its own time.
            std::thread::sleep(Duration::from_millis(250));
        }
        read_state(&exe)
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const STATUS: &str = r#"{
      "version": "1.2.16.0",
      "power": true,
      "presets": {
        "built_in": [{ "name": "General", "modified": true }, { "name": "Music", "modified": false }],
        "user": [{ "name": "fire", "modified": true }]
      },
      "selected_preset": "General",
      "output_devices": ["Realtek Digital Output (Realtek(R) Audio)", "Alto-falantes (PD100X Podcast Microphone)"],
      "selected_output": "Alto-falantes (PD100X Podcast Microphone)",
      "equalizer": { "num_bands": 10 },
      "effects": { "bass": 0.0 }
    }"#;

    #[test]
    fn le_o_status_do_fxsound() {
        let state = parse_status(STATUS).unwrap();
        assert!(state.power);
        assert_eq!(state.presets, ["General", "Music", "fire"]);
        assert_eq!(state.preset, "General");
        assert_eq!(state.outputs.len(), 2);
        assert_eq!(state.output, "Alto-falantes (PD100X Podcast Microphone)");
    }

    #[test]
    fn status_estranho_nao_vira_nada() {
        assert_eq!(parse_status("{}"), None);
        assert_eq!(parse_status("não é json"), None);
    }

    #[test]
    fn valor_entre_aspas_sem_aspas_dentro() {
        assert_eq!(quoted("preset", "Bass Booster"), "--preset=\"Bass Booster\"");
        assert_eq!(quoted("output", "Fones \"UGREEN\""), "--output=\"Fones UGREEN\"");
    }
}
