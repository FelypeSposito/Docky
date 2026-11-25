//! macOS: what Docky needs from the system that Windows gives through its own APIs. The island floats over the menu
//! bar (and the notch) on every Space; media, volume and the microphone go through AppleScript (`osascript`), which
//! asks once for permission to control Spotify or Music; the battery comes from `pmset`; the pasteboard, the mouse
//! buttons and the idle time from AppKit and CoreGraphics.

use std::process::Command;

use objc2_app_kit::{NSEvent, NSPasteboard, NSPasteboardTypeString};
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

/// A number AppleScript printed, whatever the decimal mark of the system's language ("12,5" or "12.5").
pub fn number(text: &str) -> Option<f64> {
    text.trim().replace(',', ".").parse().ok()
}

// --- The island's window ---

/// Floats a window above the menu bar (where the notch is), on every Space and over full-screen apps, as the
/// menu bar's own items do.
pub fn float_over_menu_bar(window: &tauri::WebviewWindow) {
    let Ok(ns_window) = window.ns_window() else { return };
    let ns_window = ns_window as *mut objc2_app_kit::NSWindow;
    // The level just above the menu bar's (NSMainMenuWindowLevel + 1: the status bar's).
    const STATUS_LEVEL: isize = 25;
    // Can join all Spaces, stays put while switching, shows beside full-screen apps.
    const BEHAVIOR: usize = (1 << 0) | (1 << 4) | (1 << 8);
    unsafe {
        let Some(ns_window) = ns_window.as_ref() else { return };
        ns_window.setLevel(STATUS_LEVEL);
        ns_window.setCollectionBehavior(objc2_app_kit::NSWindowCollectionBehavior(BEHAVIOR));
        ns_window.setHasShadow(false);
    }
}

/// Whether the left mouse button is held down now.
pub fn mouse_button_down() -> bool {
    NSEvent::pressedMouseButtons() & 1 != 0
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

// --- Pasteboard ---

pub fn pasteboard_change_count() -> u32 {
    NSPasteboard::generalPasteboard().changeCount() as u32
}

pub fn pasteboard_text() -> Option<String> {
    let board = NSPasteboard::generalPasteboard();
    let text = unsafe { board.stringForType(NSPasteboardTypeString) }?;
    Some(text.to_string())
}

pub fn set_pasteboard_text(text: &str) -> Result<(), String> {
    let board = NSPasteboard::generalPasteboard();
    board.clearContents();
    let ok = unsafe { board.setString_forType(&NSString::from_str(text), NSPasteboardTypeString) };
    if ok { Ok(()) } else { Err("o macOS não aceitou o texto".into()) }
}

// --- Volume and microphone (AppleScript's "volume settings") ---

/// Output volume (0 to 1) and whether it is muted.
pub fn volume() -> Option<(f32, bool)> {
    let text = osascript("set v to get volume settings\nreturn (output volume of v as text) & \"|\" & (output muted of v as text)")?;
    let (level, muted) = text.split_once('|')?;
    Some(((number(level)? / 100.0).clamp(0.0, 1.0) as f32, muted.trim() == "true"))
}

pub fn set_volume(level: f32) {
    let _ = osascript(&format!("set volume output volume {}", (level.clamp(0.0, 1.0) * 100.0).round() as u32));
}

pub fn set_output_muted(muted: bool) {
    let _ = osascript(&format!("set volume output muted {muted}"));
}

/// The microphone's input volume (0 to 100), or `None` without one.
pub fn input_volume() -> Option<u32> {
    let text = osascript("input volume of (get volume settings)")?;
    // "missing value" when there is no input device.
    number(&text).map(|v| v.round() as u32)
}

pub fn set_input_volume(level: u32) -> bool {
    osascript(&format!("set volume input volume {}", level.min(100))).is_some()
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

/// What a player is doing, as one line: app, state, title, artist, album, position (s), duration, artwork, shuffle,
/// repeat. Spotify gives its duration in milliseconds and Music in seconds; Music's repeat is off/one/all.
const MEDIA_SCRIPT: &str = r#"
set sep to (ASCII character 31)
if application "Spotify" is running then
  tell application "Spotify"
    if player state is not stopped then
      set t to current track
      return "Spotify" & sep & (player state as text) & sep & (name of t) & sep & (artist of t) & sep & (album of t) & sep & (player position as text) & sep & ((duration of t) as text) & sep & (artwork url of t) & sep & (shuffling as text) & sep & (repeating as text)
    end if
  end tell
end if
if application "Music" is running then
  tell application "Music"
    if player state is not stopped then
      set t to current track
      return "Music" & sep & (player state as text) & sep & (name of t) & sep & (artist of t) & sep & (album of t) & sep & (player position as text) & sep & ((duration of t) as text) & sep & "" & sep & (shuffle enabled as text) & sep & (song repeat as text)
    end if
  end tell
end if
return ""
"#;

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
    let parts: Vec<&str> = line.trim().split('\u{1f}').collect();
    if parts.len() < 10 || parts[2].is_empty() {
        return None;
    }
    let spotify = parts[0] == "Spotify";
    let duration = number(parts[6]).unwrap_or(0.0);
    Some(Playing {
        app: parts[0].to_string(),
        playing: parts[1] == "playing",
        title: parts[2].to_string(),
        artist: parts[3].to_string(),
        album: parts[4].to_string(),
        position_ms: (number(parts[5]).unwrap_or(0.0) * 1000.0) as u64,
        duration_ms: if spotify { duration as u64 } else { (duration * 1000.0) as u64 },
        artwork: Some(parts[7].to_string()).filter(|a| a.starts_with("https://")),
        shuffle: Some(parts[8] == "true"),
        repeat: Some(match parts[9] {
            "true" | "all" => "list",
            "one" => "track",
            _ => "none",
        })
        .map(str::to_string),
    })
}

pub fn playing() -> Option<Playing> {
    parse_playing(&osascript(MEDIA_SCRIPT)?)
}

/// Sends a command to the app that is playing (`playpause`, `next track`, `previous track`, …).
pub fn media_command(app: &str, command: &str) {
    if app == "Spotify" || app == "Music" {
        let _ = osascript(&format!("tell application \"{app}\" to {command}"));
    }
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
        assert_eq!(p.repeat.as_deref(), Some("list"));
        let music = "Music\u{1f}paused\u{1f}Song\u{1f}Band\u{1f}Album\u{1f}3.0\u{1f}180.5\u{1f}\u{1f}true\u{1f}one";
        let m = parse_playing(music).unwrap();
        assert!(!m.playing);
        assert_eq!((m.duration_ms, m.artwork, m.repeat.as_deref()), (180_500, None, Some("track")));
        assert_eq!(parse_playing(""), None);
    }

    #[test]
    fn texto_para_applescript() {
        assert_eq!(applescript_string(r#"a "b" \c"#), r#""a \"b\" \\c""#);
        assert_eq!(number("12,5"), Some(12.5));
    }
}
