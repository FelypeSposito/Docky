//! Mídia do Windows via System Media Transport Controls (SMTC): qualquer app que mostre os controles
//! de mídia do Windows (Spotify, navegadores, players) aparece aqui.

use std::{
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub app: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    /// Capa como data URL. Só vai junto quando a faixa muda; o frontend guarda a última.
    pub thumbnail: Option<String>,
    /// Shuffle on or off, or `None` when the app does not let others change it.
    pub shuffle: Option<bool>,
    /// "none", "track" or "list", or `None` when the app does not let others change it.
    pub repeat: Option<String>,
}

#[cfg(windows)]
mod smtc {
    use base64::{Engine, engine::general_purpose::STANDARD};
    use windows::{
        Media::Control::{
            GlobalSystemMediaTransportControlsSession as Session,
            GlobalSystemMediaTransportControlsSessionManager as Manager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
        },
        Media::MediaPlaybackAutoRepeatMode as Repeat,
        Storage::Streams::DataReader,
    };

    use super::*;

    /// 100 ns entre 1601-01-01 (época do Windows) e 1970-01-01 (época Unix).
    const WINDOWS_TO_UNIX_TICKS: i64 = 116_444_736_000_000_000;

    fn current_session() -> Option<Session> {
        let manager = Manager::RequestAsync().ok()?.get().ok()?;
        manager.GetCurrentSession().ok()
    }

    fn thumbnail(session: &Session) -> Option<String> {
        let props = session.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
        let stream = props.Thumbnail().ok()?.OpenReadAsync().ok()?.get().ok()?;
        let size = stream.Size().ok()? as u32;
        if size == 0 || size > 8 * 1024 * 1024 {
            return None;
        }
        let content_type = stream.ContentType().ok()?.to_string();
        let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0).ok()?).ok()?;
        reader.LoadAsync(size).ok()?.get().ok()?;
        let mut bytes = vec![0u8; size as usize];
        reader.ReadBytes(&mut bytes).ok()?;
        let mime = if content_type.is_empty() { "image/png".into() } else { content_type };
        Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
    }

    pub fn read(with_thumbnail: bool) -> Option<MediaState> {
        let session = current_session()?;
        let props = session.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
        let info = session.GetPlaybackInfo().ok()?;
        let playing = info.PlaybackStatus().ok()? == Status::Playing;
        let controls = info.Controls().ok();
        let shuffle = controls
            .as_ref()
            .is_some_and(|c| c.IsShuffleEnabled().unwrap_or(false))
            .then(|| info.IsShuffleActive().ok().and_then(|r| r.Value().ok()).unwrap_or(false));
        let repeat = controls.as_ref().is_some_and(|c| c.IsRepeatEnabled().unwrap_or(false)).then(|| {
            match info.AutoRepeatMode().ok().and_then(|r| r.Value().ok()) {
                Some(Repeat::Track) => "track",
                Some(Repeat::List) => "list",
                _ => "none",
            }
            .to_string()
        });

        let (mut position, duration) = match session.GetTimelineProperties() {
            Ok(timeline) => {
                let start = timeline.StartTime().map(|t| t.Duration).unwrap_or(0);
                let end = timeline.EndTime().map(|t| t.Duration).unwrap_or(0);
                let mut position = timeline.Position().map(|t| t.Duration).unwrap_or(0) - start;
                // A posição vale no instante da última atualização; avança o que passou desde então.
                if playing {
                    if let Ok(updated) = timeline.LastUpdatedTime() {
                        let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_nanos() as i64 / 100
                            + WINDOWS_TO_UNIX_TICKS;
                        position += (now - updated.UniversalTime).max(0);
                    }
                }
                (position.max(0), (end - start).max(0))
            }
            Err(_) => (0, 0),
        };
        if duration > 0 {
            position = position.min(duration);
        }

        Some(MediaState {
            app: session.SourceAppUserModelId().ok()?.to_string(),
            title: props.Title().ok()?.to_string(),
            artist: props.Artist().map(|s| s.to_string()).unwrap_or_default(),
            album: props.AlbumTitle().map(|s| s.to_string()).unwrap_or_default(),
            playing,
            position_ms: (position / 10_000) as u64,
            duration_ms: (duration / 10_000) as u64,
            thumbnail: if with_thumbnail { thumbnail(&session) } else { None },
            shuffle,
            repeat,
        })
    }

    /// Only the cover of the current track.
    pub fn read_thumbnail() -> Option<String> {
        thumbnail(&current_session()?)
    }

    /// The app that owns the current session (its AppUserModelID, e.g. "Spotify.exe" or "Chrome").
    pub fn source_app() -> Option<String> {
        Some(current_session()?.SourceAppUserModelId().ok()?.to_string())
    }

    pub fn set_shuffle(on: bool) {
        if let Some(s) = current_session() {
            let _ = s.TryChangeShuffleActiveAsync(on).and_then(|op| op.get());
        }
    }

    pub fn set_repeat(mode: &str) {
        let mode = match mode {
            "track" => Repeat::Track,
            "list" => Repeat::List,
            _ => Repeat::None,
        };
        if let Some(s) = current_session() {
            let _ = s.TryChangeAutoRepeatModeAsync(mode).and_then(|op| op.get());
        }
    }

    pub fn toggle() {
        if let Some(s) = current_session() {
            let _ = s.TryTogglePlayPauseAsync().and_then(|op| op.get());
        }
    }

    pub fn next() {
        if let Some(s) = current_session() {
            let _ = s.TrySkipNextAsync().and_then(|op| op.get());
        }
    }

    pub fn previous() {
        if let Some(s) = current_session() {
            let _ = s.TrySkipPreviousAsync().and_then(|op| op.get());
        }
    }

    pub fn seek(position_ms: u64) {
        if let Some(s) = current_session() {
            let _ = s
                .TryChangePlaybackPositionAsync(position_ms as i64 * 10_000)
                .and_then(|op| op.get());
        }
    }
}

/// macOS: Spotify and Music through AppleScript (the system's own "now playing" is closed to other apps since macOS
/// 15.4). The first time, macOS asks whether Docky may control them.
#[cfg(target_os = "macos")]
mod smtc {
    use std::sync::Mutex;

    use super::MediaState;
    use crate::mac;

    /// The app that played last, for the controls.
    static LAST_APP: Mutex<String> = Mutex::new(String::new());

    fn app() -> String {
        LAST_APP.lock().map(|a| a.clone()).unwrap_or_default()
    }

    pub fn read(with_thumbnail: bool) -> Option<MediaState> {
        let p = mac::playing()?;
        if let Ok(mut last) = LAST_APP.lock() {
            last.clone_from(&p.app);
        }
        Some(MediaState {
            app: p.app,
            title: p.title,
            artist: p.artist,
            album: p.album,
            playing: p.playing,
            position_ms: p.position_ms,
            duration_ms: p.duration_ms,
            // Spotify's cover is an https address; the interface shows it as it is.
            thumbnail: if with_thumbnail { p.artwork } else { None },
            shuffle: p.shuffle,
            repeat: p.repeat,
        })
    }
    pub fn toggle() {
        mac::media_command(&app(), "playpause");
    }
    pub fn next() {
        mac::media_command(&app(), "next track");
    }
    pub fn previous() {
        mac::media_command(&app(), "previous track");
    }
    pub fn seek(position_ms: u64) {
        mac::media_command(&app(), &format!("set player position to {}", position_ms as f64 / 1000.0));
    }
    pub fn read_thumbnail() -> Option<String> {
        mac::playing().and_then(|p| p.artwork)
    }
    pub fn source_app() -> Option<String> {
        Some(app()).filter(|a| !a.is_empty())
    }
    pub fn set_shuffle(on: bool) {
        let app = app();
        let property = if app == "Spotify" { "shuffling" } else { "shuffle enabled" };
        mac::media_command(&app, &format!("set {property} to {on}"));
    }
    pub fn set_repeat(mode: &str) {
        let app = app();
        if app == "Spotify" {
            mac::media_command(&app, &format!("set repeating to {}", mode != "none"));
        } else {
            let value = match mode {
                "track" => "one",
                "list" => "all",
                _ => "off",
            };
            mac::media_command(&app, &format!("set song repeat to {value}"));
        }
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod smtc {
    use super::MediaState;
    pub fn read(_: bool) -> Option<MediaState> {
        None
    }
    pub fn toggle() {}
    pub fn next() {}
    pub fn previous() {}
    pub fn seek(_: u64) {}
    pub fn read_thumbnail() -> Option<String> {
        None
    }
    pub fn source_app() -> Option<String> {
        None
    }
    pub fn set_shuffle(_: bool) {}
    pub fn set_repeat(_: &str) {}
}

#[tauri::command]
pub async fn media_control(action: String) -> Result<(), String> {
    match action.as_str() {
        "toggle" => smtc::toggle(),
        "next" => smtc::next(),
        "previous" => smtc::previous(),
        "shuffle-on" => smtc::set_shuffle(true),
        "shuffle-off" => smtc::set_shuffle(false),
        "repeat-none" | "repeat-track" | "repeat-list" => smtc::set_repeat(&action["repeat-".len()..]),
        other => return Err(format!("ação desconhecida: {other}")),
    }
    Ok(())
}

/// Estado atual, com capa. O frontend chama ao carregar, porque o evento inicial pode ter saído antes dele existir.
#[tauri::command]
pub async fn get_media() -> Option<MediaState> {
    smtc::read(true)
}

#[tauri::command]
pub async fn media_seek(position_ms: u64) {
    smtc::seek(position_ms);
}

/// The AppUserModelID of the app that is playing.
pub fn playing_app() -> Option<String> {
    smtc::source_app()
}

/// Brings the app that is playing to the front (or opens it, when it has no window).
#[tauri::command]
pub async fn media_open_app() -> Result<(), String> {
    let app = smtc::source_app().ok_or("nada tocando")?;
    if crate::focus::focus_by_name(&app_id_name(&app)) {
        return Ok(());
    }
    #[cfg(windows)]
    let mut command = {
        let mut c = std::process::Command::new("explorer.exe");
        c.arg(format!("shell:AppsFolder\\{app}"));
        c
    };
    // macOS: Spotify or Music, by name (`open -a` brings it to the front).
    #[cfg(not(windows))]
    let mut command = {
        let mut c = std::process::Command::new("open");
        c.arg("-a").arg(&app);
        c
    };
    command.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// The program name hidden in a media AppUserModelID: "Spotify.exe" → "spotify", a Store id
/// "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify" → "spotify", "Chrome" → "chrome".
pub fn app_id_name(app_id: &str) -> String {
    let last = app_id.rsplit(['!', '\\', '/']).next().unwrap_or(app_id);
    let last = if last.to_ascii_lowercase().ends_with(".exe") { &last[..last.len() - 4] } else { last };
    last.to_ascii_lowercase()
}

/// How many polls (~0.5 s each) the cover keeps being read after a track change. Players often switch the title first
/// and the cover a moment later; reading only once left the island on the default look.
const THUMBNAIL_POLLS: u32 = 8;

fn fingerprint(text: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut hasher);
    hasher.finish()
}

/// Consulta o SMTC e avisa o frontend (evento `media`). Sem sessão, avisa uma vez com `null`.
pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        let mut last_track = String::new();
        let mut last: Option<MediaState> = None;
        let mut had_session = false;
        let mut ticks_since_emit = 0u32;
        let mut thumbnail_polls = 0u32;
        let mut sent_thumbnail: Option<u64> = None;

        loop {
            let track_key = last_track.clone();
            // A capa só é lida quando a faixa muda (é a parte cara).
            let mut state = smtc::read(false);
            if let Some(current) = &mut state {
                let key = format!("{}|{}|{}", current.app, current.title, current.artist);
                if key != track_key {
                    last_track = key;
                    thumbnail_polls = THUMBNAIL_POLLS;
                    sent_thumbnail = None;
                }
                // Right after a change, keep reading the cover and send it whenever it differs from what went out.
                if thumbnail_polls > 0 {
                    thumbnail_polls -= 1;
                    if let Some(cover) = smtc::read_thumbnail() {
                        let print = fingerprint(&cover);
                        if sent_thumbnail != Some(print) {
                            sent_thumbnail = Some(print);
                            current.thumbnail = Some(cover);
                        }
                    }
                }
            }

            ticks_since_emit += 1;
            let changed = match (&state, &last) {
                (Some(a), Some(b)) => {
                    a.title != b.title
                        || a.artist != b.artist
                        || a.playing != b.playing
                        || a.duration_ms != b.duration_ms
                        || a.app != b.app
                        || a.shuffle != b.shuffle
                        || a.repeat != b.repeat
                        || a.position_ms.abs_diff(b.position_ms) > 2500
                        || a.thumbnail.is_some()
                }
                (None, None) => false,
                _ => true,
            };
            // Mesmo sem mudanças, reenvia a posição a cada ~5 s para corrigir a deriva.
            if changed || (state.is_some() && ticks_since_emit >= 10) {
                ticks_since_emit = 0;
                if state.is_some() || had_session {
                    crate::island::emit(&app, "media", &state);
                }
                had_session = state.is_some();
                last = state.map(|mut s| {
                    s.thumbnail = None;
                    s
                });
            }
            thread::sleep(Duration::from_millis(500));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::app_id_name;

    #[test]
    fn nome_do_programa_no_id_do_app() {
        assert_eq!(app_id_name("Spotify.exe"), "spotify");
        assert_eq!(app_id_name("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"), "spotify");
        assert_eq!(app_id_name("Chrome"), "chrome");
        assert_eq!(app_id_name("MSEdge"), "msedge");
        assert_eq!(app_id_name(r"C:\Apps\foobar2000.exe"), "foobar2000");
    }
}
