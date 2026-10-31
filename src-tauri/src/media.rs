//! Mídia do Windows via System Media Transport Controls (SMTC): qualquer app que mostre os controles
//! de mídia do Windows (Spotify, navegadores, players) aparece aqui.

use std::{
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

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
        let playing = session.GetPlaybackInfo().ok()?.PlaybackStatus().ok()? == Status::Playing;

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
        })
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

#[cfg(not(windows))]
mod smtc {
    use super::MediaState;
    pub fn read(_: bool) -> Option<MediaState> {
        None
    }
    pub fn toggle() {}
    pub fn next() {}
    pub fn previous() {}
    pub fn seek(_: u64) {}
}

#[tauri::command]
pub async fn media_control(action: String) -> Result<(), String> {
    match action.as_str() {
        "toggle" => smtc::toggle(),
        "next" => smtc::next(),
        "previous" => smtc::previous(),
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

/// Consulta o SMTC e avisa o frontend (evento `media`). Sem sessão, avisa uma vez com `null`.
pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        let mut last_track = String::new();
        let mut last: Option<MediaState> = None;
        let mut had_session = false;
        let mut ticks_since_emit = 0u32;

        loop {
            let track_key = last_track.clone();
            // A capa só é lida quando a faixa muda (é a parte cara).
            let mut state = smtc::read(false);
            if let Some(current) = &mut state {
                let key = format!("{}|{}|{}", current.app, current.title, current.artist);
                if key != track_key {
                    current.thumbnail = smtc::read(true).and_then(|s| s.thumbnail);
                    last_track = key;
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
                    let _ = app.emit_to("island", "media", &state);
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
