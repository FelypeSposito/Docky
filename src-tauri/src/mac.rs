//! macOS: what Docky needs from the system that Windows gives through its own APIs. The island floats over the menu
//! bar (and around the notch) on every Space; media, volume and the microphone go through AppleScript (`osascript`),
//! which asks once for permission to control Spotify or Music; the battery comes from `pmset`; the pasteboard, the
//! mouse buttons, the screen's notch and the idle time from AppKit and CoreGraphics.
//!
//! AppKit objects that belong to the interface (windows, screens) are only touched on the main thread.

use std::{
    process::Command,
    sync::{
        Mutex,
        atomic::{AtomicU32, Ordering},
    },
    time::{Duration, Instant},
};

use objc2::{MainThreadMarker, rc::autoreleasepool, runtime::NSObjectProtocol, sel};
use objc2_app_kit::{NSEvent, NSPasteboard, NSPasteboardTypeString, NSScreen, NSWindow, NSWindowCollectionBehavior};
use objc2_foundation::NSString;

/// Runs an AppleScript and returns what it printed, trimmed (`None` if it failed).
pub fn osascript(script: &str) -> Option<String> {
    let output = Command::new("osascript").arg("-e").arg(script).output().ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// A text as an AppleScript string literal ("…", with `\` and `"` escaped).
pub fn applescript_string(text: &str) -> String {
    format!("\"{}\"", text.replace('\\', "\\\\").replace('"', "\\\""))
}

/// A number AppleScript printed, whatever the decimal mark of the system's language ("12,5" or "12.5"); `None` for
/// "missing value" and anything else.
pub fn number(text: &str) -> Option<f64> {
    text.trim().replace(',', ".").parse().ok()
}

// --- The island's window ---

/// Floats a window above the menu bar (around the notch) and on every Space, as the menu bar's own items do. It is
/// not shown over full-screen apps (Docky cannot tell a full-screen video from a game on macOS, so it stays out of
/// them). Runs on the main thread, where AppKit wants it.
pub fn float_over_menu_bar(window: &tauri::WebviewWindow) {
    let target = window.clone();
    let _ = window.run_on_main_thread(move || {
        let Ok(raw) = target.ns_window() else { return };
        // The level just above the menu bar's (NSMainMenuWindowLevel + 1: the status bar's).
        const STATUS_LEVEL: isize = 25;
        // Can join all Spaces, stays put while switching Spaces, left out of Cmd-` cycling.
        const BEHAVIOR: usize = (1 << 0) | (1 << 4) | (1 << 6);
        // SAFETY: Tauri hands out the live NSWindow of this window; we are on the main thread.
        let Some(ns_window) = (unsafe { (raw as *const NSWindow).as_ref() }) else { return };
        ns_window.setLevel(STATUS_LEVEL);
        ns_window.setCollectionBehavior(NSWindowCollectionBehavior(BEHAVIOR));
        ns_window.setHasShadow(false);
    });
}

/// The width of the screen's notch, in points (0 on a screen without one, or before macOS 12). Main thread only.
pub fn notch_width(mtm: MainThreadMarker) -> f64 {
    let Some(screen) = NSScreen::mainScreen(mtm) else { return 0.0 };
    // `auxiliaryTopLeftArea` (the menu bar beside the notch) came with macOS 12: older systems lack the method.
    if !screen.respondsToSelector(sel!(auxiliaryTopLeftArea)) {
        return 0.0;
    }
    let (left, right) = (screen.auxiliaryTopLeftArea(), screen.auxiliaryTopRightArea());
    if left.size.width <= 0.0 || right.size.width <= 0.0 {
        return 0.0;
    }
    (screen.frame().size.width - left.size.width - right.size.width).max(0.0)
}

/// Whether a mouse button (left or right) is held down now.
pub fn mouse_button_down() -> bool {
    NSEvent::pressedMouseButtons() & 0b11 != 0
}

// --- Idle time ---

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
}

/// Seconds since the last key press or mouse move.
pub fn idle_seconds() -> u64 {
    // kCGEventSourceStateCombinedSessionState, kCGAnyInputEventType.
    let seconds = unsafe { CGEventSourceSecondsSinceLastEventType(0, u32::MAX) };
    if seconds.is_finite() && seconds > 0.0 { seconds as u64 } else { 0 }
}

// --- Pasteboard (each call in its own autorelease pool: these run on Docky's long-lived threads) ---

pub fn pasteboard_change_count() -> u32 {
    autoreleasepool(|_| NSPasteboard::generalPasteboard().changeCount() as u32)
}

pub fn pasteboard_text() -> Option<String> {
    autoreleasepool(|_| {
        let board = NSPasteboard::generalPasteboard();
        let text = unsafe { board.stringForType(NSPasteboardTypeString) }?;
        Some(text.to_string())
    })
}

pub fn set_pasteboard_text(text: &str) -> Result<(), String> {
    autoreleasepool(|_| {
        let board = NSPasteboard::generalPasteboard();
        board.clearContents();
        let ok = unsafe { board.setString_forType(&NSString::from_str(text), NSPasteboardTypeString) };
        if ok { Ok(()) } else { Err("o macOS não aceitou o texto".into()) }
    })
}

// --- Volume and microphone (AppleScript's "volume settings", read once for both and kept for a moment) ---

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VolumeSettings {
    /// Output volume, 0 to 1 (`None` when the output device has no volume of its own, like some HDMI ones).
    pub output: Option<f32>,
    pub muted: bool,
    /// Input volume, 0 to 100 (`None` without a microphone).
    pub input: Option<u32>,
}

pub fn parse_volume_settings(text: &str) -> Option<VolumeSettings> {
    let mut parts = text.split('|');
    let (output, muted, input) = (parts.next()?, parts.next()?, parts.next()?);
    Some(VolumeSettings {
        output: number(output).map(|v| (v / 100.0).clamp(0.0, 1.0) as f32),
        muted: muted.trim() == "true",
        input: number(input).map(|v| v.round().clamp(0.0, 100.0) as u32),
    })
}

/// How long one reading serves: the volume and the microphone watchers both ask, a moment apart.
const SETTINGS_FRESH: Duration = Duration::from_millis(600);
static SETTINGS: Mutex<Option<(Instant, Option<VolumeSettings>)>> = Mutex::new(None);

pub fn volume_settings() -> Option<VolumeSettings> {
    if let Ok(cached) = SETTINGS.lock()
        && let Some((at, settings)) = *cached
        && at.elapsed() < SETTINGS_FRESH
    {
        return settings;
    }
    let read = osascript("set v to get volume settings\nreturn (output volume of v as text) & \"|\" & (output muted of v as text) & \"|\" & (input volume of v as text)")
        .as_deref()
        .and_then(parse_volume_settings);
    if let Ok(mut cached) = SETTINGS.lock() {
        *cached = Some((Instant::now(), read));
    }
    read
}

/// After a change, the next reading goes to the system again.
fn forget_settings() {
    if let Ok(mut cached) = SETTINGS.lock() {
        *cached = None;
    }
}

/// Output volume (0 to 1) and whether it is muted.
pub fn volume() -> Option<(f32, bool)> {
    let settings = volume_settings()?;
    Some((settings.output?, settings.muted))
}

pub fn set_volume(level: f32) {
    let _ = osascript(&format!("set volume output volume {} without output muted", (level.clamp(0.0, 1.0) * 100.0).round() as u32));
    forget_settings();
}

pub fn set_output_muted(muted: bool) {
    let _ = osascript(&format!("set volume output muted {muted}"));
    forget_settings();
}

/// The microphone's input volume (0 to 100), or `None` without one.
pub fn input_volume() -> Option<u32> {
    volume_settings()?.input
}

pub fn set_input_volume(level: u32) -> bool {
    let ok = osascript(&format!("set volume input volume {}", level.min(100))).is_some();
    forget_settings();
    ok
}

// --- Battery ---

/// (percent, charging, plugged in) from `pmset -g batt`, or `None` on a Mac without a battery.
pub fn battery() -> Option<(u8, bool, bool)> {
    let output = Command::new("pmset").args(["-g", "batt"]).output().ok()?;
    parse_pmset(&String::from_utf8_lossy(&output.stdout))
}

/// Reads `pmset -g batt`: "Now drawing from 'AC Power'\n -InternalBattery-0 (id=…)\t87%; charging; 1:02 remaining".
pub fn parse_pmset(text: &str) -> Option<(u8, bool, bool)> {
    let line = text.lines().find(|l| l.contains("InternalBattery"))?;
    let percent: u8 = line.split('\t').nth(1).unwrap_or(line).split('%').next()?.trim().rsplit(' ').next()?.parse().ok()?;
    let plugged = text.contains("'AC Power'");
    let state = line.to_lowercase();
    let charging = plugged && (state.contains("; charging") || state.contains("; charged") || state.contains("finishing charge"));
    Some((percent, charging, plugged))
}

// --- Media: Spotify and Music, through AppleScript ---

/// The fields every player script fills, in order, joined by the unit separator (U+001F). Each is read on its own,
/// so one the player cannot give (no cover, an ad) leaves it empty instead of failing the whole reading.
const FIELDS: usize = 10;

/// The script for one player: app name, state, title, artist, album, position (s), duration, artwork, shuffle,
/// repeat. Compiled only when that player is running (`run script`), so a Mac without Spotify still reads Music.
fn player_script(app: &str, id: &str, duration: &str, artwork: &str, shuffle: &str, repeat: &str) -> String {
    let field = |i: usize, expr: &str| format!("try\nset item {i} of f to ({expr}) as text\nend try\n");
    let inner = format!(
        "tell application id \"{id}\"\nif player state is stopped then return \"\"\nset t to current track\nset f to {{\"{app}\", \"\", \"\", \"\", \"\", \"0\", \"0\", \"\", \"\", \"\"}}\n{}{}{}{}{}{}{}{}{}set AppleScript's text item delimiters to (ASCII character 31)\nreturn f as text\nend tell",
        field(2, "player state"),
        field(3, "name of t"),
        field(4, "artist of t"),
        field(5, "album of t"),
        field(6, "player position"),
        field(7, duration),
        field(8, artwork),
        field(9, shuffle),
        field(10, repeat),
    );
    format!("try\nif application id \"{id}\" is running then\nset r to run script {}\nif r is not \"\" then return r\nend if\nend try\n", applescript_string(&inner))
}

fn media_script() -> &'static str {
    static SCRIPT: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    SCRIPT.get_or_init(|| {
        let spotify = player_script("Spotify", "com.spotify.client", "duration of t", "artwork url of t", "shuffling", "repeating");
        let music = player_script("Music", "com.apple.Music", "duration of t", "\"\"", "shuffle enabled", "song repeat");
        format!("{spotify}{music}return \"\"")
    })
}

/// One reading of the playing app.
#[derive(Debug, Clone, PartialEq)]
pub struct Playing {
    pub app: String,
    pub playing: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub artwork: Option<String>,
    pub shuffle: Option<bool>,
    pub repeat: Option<String>,
}

pub fn parse_playing(line: &str) -> Option<Playing> {
    let parts: Vec<&str> = line.trim().split('\u{1f}').map(|p| if p == "missing value" { "" } else { p }).collect();
    if parts.len() < FIELDS || parts[2].is_empty() {
        return None;
    }
    let spotify = parts[0] == "Spotify";
    let duration = number(parts[6]).unwrap_or(0.0);
    let flag = |v: &str| match v {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    };
    Some(Playing {
        app: parts[0].to_string(),
        playing: parts[1] == "playing",
        title: parts[2].to_string(),
        artist: parts[3].to_string(),
        album: parts[4].to_string(),
        position_ms: (number(parts[5]).unwrap_or(0.0).max(0.0) * 1000.0) as u64,
        // Spotify gives milliseconds, Music seconds.
        duration_ms: if spotify { duration.max(0.0) as u64 } else { (duration.max(0.0) * 1000.0) as u64 },
        artwork: Some(parts[7].to_string()).filter(|a| a.starts_with("https://")),
        shuffle: flag(parts[8]),
        repeat: match parts[9] {
            "true" | "all" => Some("list".to_string()),
            "one" => Some("track".to_string()),
            "false" | "off" => Some("none".to_string()),
            _ => None,
        },
    })
}

pub fn playing() -> Option<Playing> {
    parse_playing(&osascript(media_script())?)
}

/// Sends a command to the app that is playing (`playpause`, `next track`, `previous track`, …).
pub fn media_command(app: &str, command: &str) {
    let id = match app {
        "Spotify" => "com.spotify.client",
        "Music" => "com.apple.Music",
        _ => return,
    };
    let _ = osascript(&format!("tell application id \"{id}\" to {command}"));
}

/// The cover as a data URL (an https image would taint the canvas the accent colour is read from), fetched once per
/// address.
pub fn artwork_data_url(url: &str) -> Option<String> {
    use base64::{Engine, engine::general_purpose::STANDARD};
    static LAST: Mutex<Option<(String, Option<String>)>> = Mutex::new(None);
    if let Ok(last) = LAST.lock()
        && let Some((address, data)) = last.as_ref()
        && address == url
    {
        return data.clone();
    }
    let agent = ureq::Agent::new_with_config(ureq::Agent::config_builder().timeout_global(Some(Duration::from_secs(6))).build());
    let data = agent
        .get(url)
        .call()
        .ok()
        .and_then(|mut response| response.body_mut().with_config().limit(4 * 1024 * 1024).read_to_vec().ok())
        .map(|bytes| format!("data:image/jpeg;base64,{}", STANDARD.encode(bytes)));
    if let Ok(mut last) = LAST.lock() {
        *last = Some((url.to_string(), data.clone()));
    }
    data
}

/// A file name for a temporary file nobody else in this process is using.
pub fn temp_file(stem: &str, ext: &str) -> std::path::PathBuf {
    static NEXT: AtomicU32 = AtomicU32::new(0);
    std::env::temp_dir().join(format!("docky-{stem}-{}-{}.{ext}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_a_bateria_do_pmset() {
        let plugged = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=4653155)\t87%; charging; 1:02 remaining present: true\n";
        assert_eq!(parse_pmset(plugged), Some((87, true, true)));
        let battery = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=4653155)\t42%; discharging; 3:10 remaining present: true\n";
        assert_eq!(parse_pmset(battery), Some((42, false, false)));
        assert_eq!(parse_pmset("Now drawing from 'AC Power'\n"), None);
    }

    #[test]
    fn le_o_que_o_spotify_e_o_music_tocam() {
        let spotify = "Spotify\u{1f}playing\u{1f}Song\u{1f}Band\u{1f}Album\u{1f}12,5\u{1f}215000\u{1f}https://i.scdn.co/image/x\u{1f}false\u{1f}true";
        let p = parse_playing(spotify).unwrap();
        assert!(p.playing);
        assert_eq!((p.position_ms, p.duration_ms), (12_500, 215_000));
        assert_eq!((p.shuffle, p.repeat.as_deref()), (Some(false), Some("list")));
        let music = "Music\u{1f}paused\u{1f}Song\u{1f}Band\u{1f}Album\u{1f}3.0\u{1f}180.5\u{1f}\u{1f}true\u{1f}one";
        let m = parse_playing(music).unwrap();
        assert!(!m.playing);
        assert_eq!((m.duration_ms, m.artwork, m.repeat.as_deref()), (180_500, None, Some("track")));
        assert_eq!(parse_playing(""), None);
    }

    #[test]
    fn campo_que_o_player_nao_da_fica_vazio() {
        let ad = "Spotify\u{1f}playing\u{1f}Advertisement\u{1f}\u{1f}\u{1f}0\u{1f}30000\u{1f}missing value\u{1f}\u{1f}";
        let p = parse_playing(ad).unwrap();
        assert_eq!((p.artwork, p.shuffle, p.repeat), (None, None, None));
    }

    #[test]
    fn le_volume_e_microfone_de_uma_vez() {
        assert_eq!(parse_volume_settings("37|false|75"), Some(VolumeSettings { output: Some(0.37), muted: false, input: Some(75) }));
        assert_eq!(parse_volume_settings("missing value|false|missing value"), Some(VolumeSettings { output: None, muted: false, input: None }));
        assert_eq!(parse_volume_settings("nada"), None);
    }

    #[test]
    fn o_script_de_cada_player_so_compila_com_ele_aberto() {
        let script = media_script();
        assert!(script.contains("application id \"com.spotify.client\" is running"));
        assert!(script.contains("run script \"tell application id \\\"com.apple.Music\\\""));
        assert!(script.ends_with("return \"\""));
    }

    #[test]
    fn texto_para_applescript() {
        assert_eq!(applescript_string(r#"a "b" \c"#), r#""a \"b\" \\c""#);
        assert_eq!(number("12,5"), Some(12.5));
        assert_eq!(number("missing value"), None);
    }
}
