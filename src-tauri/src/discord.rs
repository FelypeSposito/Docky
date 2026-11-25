//! Discord: the call you are in (who is talking, mute, deafen, leave) through the Discord app's local RPC, a named pipe
//! that only programs on this computer can open.
//!
//! Discord only lets an app use voice RPC if the person created that app in the Developer Portal. So, like Google
//! Agenda, each person creates their own and pastes its Client ID and secret in Settings; the secret and the tokens stay
//! in the Windows Credential Manager. The only network request is the token exchange with discord.com.
//!
//! One thread owns the pipe: it connects whenever Discord is running (before or after Docky), reconnects when Discord
//! restarts, and reads events by polling, since Windows serializes reads and writes on a synchronous pipe handle.

use std::{
    sync::{
        Mutex,
        mpsc::{Receiver, Sender, channel},
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Manager, State};

use crate::config::ConfigState;

const KEYRING_SERVICE: &str = "Docky";
const SECRET: &str = "discord-client-secret";
const TOKENS: &str = "discord-tokens";
const TOKEN_URL: &str = "https://discord.com/api/oauth2/token";
/// Must be listed in the app's OAuth2 redirects in the Developer Portal (the setup steps say so).
pub const REDIRECT: &str = "http://127.0.0.1";
const SCOPES: [&str; 3] = ["rpc", "rpc.voice.read", "rpc.voice.write"];

const OP_HANDSHAKE: u32 = 0;
const OP_FRAME: u32 = 1;
const OP_CLOSE: u32 = 2;
const OP_PING: u32 = 3;
const OP_PONG: u32 = 4;

// ---------- what the island sees ----------

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Member {
    pub id: String,
    pub name: String,
    pub speaking: bool,
    /// Muted or deafened (by themselves or by the server).
    pub muted: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordState {
    /// "off" (not set up), "closed" (Discord is not running), "authorize" (waiting for your OK in Discord) or "ready".
    pub status: String,
    /// The voice channel you are in, or `None` outside a call.
    pub channel: Option<String>,
    pub muted: bool,
    pub deafened: bool,
    pub members: Vec<Member>,
}

impl DiscordState {
    fn with_status(status: &str) -> Self {
        Self { status: status.into(), channel: None, muted: false, deafened: false, members: Vec::new() }
    }
}

/// Keeps the call in sync with Discord's events. Pure, so it can be tested without Discord.
#[derive(Debug, Default)]
pub struct Tracker {
    pub channel_id: Option<String>,
    pub channel_name: Option<String>,
    pub muted: bool,
    pub deafened: bool,
    pub members: Vec<Member>,
}

fn member_from(state: &Value) -> Option<Member> {
    let user = &state["user"];
    let id = user["id"].as_str()?.to_string();
    let name = state["nick"]
        .as_str()
        .or_else(|| user["global_name"].as_str())
        .or_else(|| user["username"].as_str())
        .unwrap_or("?")
        .to_string();
    let voice = &state["voice_state"];
    let flag = |key: &str| voice[key].as_bool().unwrap_or(false);
    Some(Member { id, name, speaking: false, muted: flag("mute") || flag("self_mute") || flag("deaf") || flag("self_deaf") })
}

impl Tracker {
    /// A full channel (from GET_SELECTED_VOICE_CHANNEL), or `null` when you are not in one.
    pub fn set_channel(&mut self, channel: &Value) {
        if channel.is_null() || channel["id"].as_str().is_none() {
            self.channel_id = None;
            self.channel_name = None;
            self.members.clear();
            return;
        }
        self.channel_id = channel["id"].as_str().map(str::to_string);
        self.channel_name = channel["name"].as_str().map(str::to_string);
        self.members = channel["voice_states"].as_array().map(|list| list.iter().filter_map(member_from).collect()).unwrap_or_default();
    }

    pub fn set_settings(&mut self, settings: &Value) {
        if let Some(mute) = settings["mute"].as_bool() {
            self.muted = mute;
        }
        if let Some(deaf) = settings["deaf"].as_bool() {
            self.deafened = deaf;
        }
    }

    /// A voice event in the current channel. Returns false for events it does not know.
    pub fn apply(&mut self, event: &str, data: &Value) -> bool {
        match event {
            "SPEAKING_START" | "SPEAKING_STOP" => {
                let speaking = event == "SPEAKING_START";
                if let Some(id) = data["user_id"].as_str() {
                    if let Some(member) = self.members.iter_mut().find(|m| m.id == id) {
                        member.speaking = speaking;
                    }
                }
            }
            "VOICE_STATE_CREATE" | "VOICE_STATE_UPDATE" => {
                if let Some(mut member) = member_from(data) {
                    match self.members.iter_mut().find(|m| m.id == member.id) {
                        Some(existing) => {
                            member.speaking = existing.speaking;
                            *existing = member;
                        }
                        None => self.members.push(member),
                    }
                }
            }
            "VOICE_STATE_DELETE" => {
                if let Some(id) = data["user"]["id"].as_str() {
                    self.members.retain(|m| m.id != id);
                }
            }
            "VOICE_SETTINGS_UPDATE" => self.set_settings(data),
            _ => return false,
        }
        true
    }

    pub fn state(&self) -> DiscordState {
        DiscordState {
            status: "ready".into(),
            channel: self.channel_id.as_ref().map(|_| self.channel_name.clone().unwrap_or_else(|| "Chamada".into())),
            muted: self.muted,
            deafened: self.deafened,
            members: self.members.clone(),
        }
    }
}

// ---------- frames (pure) ----------

pub fn encode(op: u32, payload: &Value) -> Vec<u8> {
    let body = serde_json::to_vec(payload).unwrap_or_default();
    let mut frame = Vec::with_capacity(8 + body.len());
    frame.extend_from_slice(&op.to_le_bytes());
    frame.extend_from_slice(&(body.len() as u32).to_le_bytes());
    frame.extend_from_slice(&body);
    frame
}

pub fn header(bytes: [u8; 8]) -> (u32, u32) {
    (u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]), u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]))
}

// ---------- the pipe ----------

#[cfg(windows)]
mod pipe {
    use std::{
        fs::{File, OpenOptions},
        io::{self, Read, Write},
        os::windows::io::AsRawHandle,
    };

    use serde_json::Value;
    use windows::Win32::{Foundation::HANDLE, System::Pipes::PeekNamedPipe};

    pub struct Pipe(File);

    impl Pipe {
        /// Discord listens on the first free of discord-ipc-0..9.
        pub fn connect() -> Option<Pipe> {
            (0..10).find_map(|i| OpenOptions::new().read(true).write(true).open(format!(r"\\.\pipe\discord-ipc-{i}")).ok()).map(Pipe)
        }

        pub fn send(&mut self, op: u32, payload: &Value) -> io::Result<()> {
            self.0.write_all(&super::encode(op, payload))
        }

        fn available(&self) -> io::Result<u32> {
            let mut available = 0u32;
            unsafe { PeekNamedPipe(HANDLE(self.0.as_raw_handle()), None, 0, None, Some(&mut available), None) }.map_err(io::Error::other)?;
            Ok(available)
        }

        /// The next frame if one has arrived, without blocking otherwise.
        pub fn poll(&mut self) -> io::Result<Option<(u32, Value)>> {
            if self.available()? < 8 {
                return Ok(None);
            }
            let mut head = [0u8; 8];
            self.0.read_exact(&mut head)?;
            let (op, len) = super::header(head);
            let mut body = vec![0u8; len as usize];
            self.0.read_exact(&mut body)?;
            Ok(Some((op, serde_json::from_slice(&body).unwrap_or(Value::Null))))
        }
    }
}

/// macOS (and Linux): Discord listens on a Unix socket, `discord-ipc-0..9`, in the user's temporary folder.
#[cfg(unix)]
mod pipe {
    use std::{
        io::{self, Read, Write},
        os::unix::net::UnixStream,
        path::PathBuf,
    };

    use serde_json::Value;

    /// The socket and what has arrived on it but not been read as a frame yet.
    pub struct Pipe(UnixStream, Vec<u8>);

    impl Pipe {
        pub fn connect() -> Option<Pipe> {
            let dirs = ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"]
                .iter()
                .filter_map(|v| std::env::var_os(v))
                .map(PathBuf::from)
                .chain([PathBuf::from("/tmp")]);
            for dir in dirs {
                for i in 0..10 {
                    if let Ok(stream) = UnixStream::connect(dir.join(format!("discord-ipc-{i}"))) {
                        return Some(Pipe(stream, Vec::new()));
                    }
                }
            }
            None
        }

        pub fn send(&mut self, op: u32, payload: &Value) -> io::Result<()> {
            self.0.write_all(&super::encode(op, payload))
        }

        /// The next frame if one has arrived, without blocking otherwise.
        pub fn poll(&mut self) -> io::Result<Option<(u32, Value)>> {
            self.0.set_nonblocking(true)?;
            let mut chunk = [0u8; 4096];
            let read = loop {
                match self.0.read(&mut chunk) {
                    Ok(0) => break Err(io::Error::new(io::ErrorKind::UnexpectedEof, "Discord fechou")),
                    Ok(n) => self.1.extend_from_slice(&chunk[..n]),
                    Err(e) if e.kind() == io::ErrorKind::WouldBlock => break Ok(()),
                    Err(e) => break Err(e),
                }
            };
            self.0.set_nonblocking(false)?;
            // A whole frame already here is handed over even if Discord closed right after it.
            let frame_len = (self.1.len() >= 8).then(|| 8 + super::header(self.1[..8].try_into().expect("8 bytes")).1 as usize);
            let Some(end) = frame_len.filter(|end| self.1.len() >= *end) else {
                read?;
                return Ok(None);
            };
            let (op, _) = super::header(self.1[..8].try_into().expect("8 bytes"));
            let body: Vec<u8> = self.1.drain(..end).skip(8).collect();
            Ok(Some((op, serde_json::from_slice(&body).unwrap_or(Value::Null))))
        }
    }
}

#[cfg(not(any(windows, unix)))]
mod pipe {
    use serde_json::Value;
    pub struct Pipe;
    impl Pipe {
        pub fn connect() -> Option<Pipe> {
            None
        }
        pub fn send(&mut self, _: u32, _: &Value) -> std::io::Result<()> {
            Ok(())
        }
        pub fn poll(&mut self) -> std::io::Result<Option<(u32, Value)>> {
            Ok(None)
        }
    }
}

// ---------- secrets and tokens (Credential Manager) ----------

fn entry(name: &str) -> Option<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, name).ok()
}

fn read_secret(name: &str) -> Option<String> {
    entry(name)?.get_password().ok().filter(|s| !s.is_empty())
}

fn write_secret(name: &str, value: &str) -> Result<(), String> {
    let entry = entry(name).ok_or("não consegui abrir o Gerenciador de Credenciais")?;
    if value.is_empty() {
        let _ = entry.delete_credential();
        return Ok(());
    }
    entry.set_password(value).map_err(|e| e.to_string())
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

struct Tokens {
    access: String,
    refresh: String,
    expires_at: u64,
}

fn load_tokens() -> Option<Tokens> {
    let json: Value = serde_json::from_str(&read_secret(TOKENS)?).ok()?;
    Some(Tokens {
        access: json["access"].as_str()?.to_string(),
        refresh: json["refresh"].as_str().unwrap_or("").to_string(),
        expires_at: json["expires_at"].as_u64().unwrap_or(0),
    })
}

fn save_tokens(json: &Value) -> Result<Tokens, String> {
    let tokens = Tokens {
        access: json["access_token"].as_str().ok_or("o Discord não devolveu o token")?.to_string(),
        refresh: json["refresh_token"].as_str().unwrap_or("").to_string(),
        expires_at: now() + json["expires_in"].as_u64().unwrap_or(604_800),
    };
    write_secret(TOKENS, &json!({ "access": tokens.access, "refresh": tokens.refresh, "expires_at": tokens.expires_at }).to_string())?;
    Ok(tokens)
}

fn token_request(fields: &[(&str, &str)]) -> Result<Tokens, String> {
    let agent = ureq::Agent::new_with_config(ureq::Agent::config_builder().http_status_as_error(false).build());
    let mut response = agent.post(TOKEN_URL).send_form(fields.iter().copied()).map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let body = response.body_mut().read_to_string().map_err(|e| e.to_string())?;
    let json: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
    if status >= 400 {
        let reason = json["error_description"].as_str().or_else(|| json["error"].as_str()).unwrap_or("erro desconhecido");
        return Err(format!("Discord ({status}): {reason}"));
    }
    save_tokens(&json)
}

fn exchange(client_id: &str, secret: &str, code: &str) -> Result<Tokens, String> {
    token_request(&[
        ("client_id", client_id),
        ("client_secret", secret),
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", REDIRECT),
    ])
}

fn refresh(client_id: &str, secret: &str, refresh: &str) -> Result<Tokens, String> {
    token_request(&[("client_id", client_id), ("client_secret", secret), ("grant_type", "refresh_token"), ("refresh_token", refresh)])
}

// ---------- the connection thread ----------

enum Command {
    Authorize,
    Mute(bool),
    Deaf(bool),
    Leave,
    Forget,
}

pub struct DiscordControl {
    commands: Mutex<Sender<Command>>,
    last: Mutex<DiscordState>,
    /// The last error to show in Settings (a refused authorization, a wrong secret).
    error: Mutex<Option<String>>,
}

fn publish(app: &AppHandle, state: DiscordState) {
    let control = app.state::<DiscordControl>();
    let mut last = control.last.lock().unwrap();
    if *last != state {
        *last = state.clone();
        drop(last);
        crate::island::emit(app, "discord", state);
    }
}

fn set_error(app: &AppHandle, error: Option<String>) {
    *app.state::<DiscordControl>().error.lock().unwrap() = error;
}

fn nonce() -> String {
    format!("{}", SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0))
}

fn command(cmd: &str, args: Value) -> Value {
    json!({ "cmd": cmd, "args": args, "nonce": nonce() })
}

fn subscribe(event: &str, args: Value) -> Value {
    json!({ "cmd": "SUBSCRIBE", "evt": event, "args": args, "nonce": nonce() })
}

fn unsubscribe(event: &str, args: Value) -> Value {
    json!({ "cmd": "UNSUBSCRIBE", "evt": event, "args": args, "nonce": nonce() })
}

const CHANNEL_EVENTS: [&str; 5] = ["SPEAKING_START", "SPEAKING_STOP", "VOICE_STATE_CREATE", "VOICE_STATE_UPDATE", "VOICE_STATE_DELETE"];

/// One connection to a running Discord, until it closes. Returns when the pipe fails or Discord closes it.
fn session(app: &AppHandle, pipe: &mut pipe::Pipe, client_id: &str, commands: &Receiver<Command>) -> std::io::Result<()> {
    pipe.send(OP_HANDSHAKE, &json!({ "v": 1, "client_id": client_id }))?;
    let mut tracker = Tracker::default();
    let mut ready = false;
    let mut authed = false;

    loop {
        while let Ok(cmd) = commands.try_recv() {
            match cmd {
                Command::Authorize if ready => {
                    set_error(app, None);
                    pipe.send(OP_FRAME, &command("AUTHORIZE", json!({ "client_id": client_id, "scopes": SCOPES })))?;
                }
                Command::Mute(on) if authed => pipe.send(OP_FRAME, &command("SET_VOICE_SETTINGS", json!({ "mute": on })))?,
                Command::Deaf(on) if authed => pipe.send(OP_FRAME, &command("SET_VOICE_SETTINGS", json!({ "deaf": on })))?,
                Command::Leave if authed => pipe.send(OP_FRAME, &command("SELECT_VOICE_CHANNEL", json!({ "channel_id": null, "force": true })))?,
                Command::Forget => {
                    let _ = write_secret(TOKENS, "");
                    return Ok(());
                }
                _ => {}
            }
        }

        let Some((op, frame)) = pipe.poll()? else {
            thread::sleep(Duration::from_millis(60));
            continue;
        };
        match op {
            OP_PING => {
                pipe.send(OP_PONG, &frame)?;
                continue;
            }
            OP_CLOSE => return Ok(()),
            _ => {}
        }

        let cmd = frame["cmd"].as_str().unwrap_or("");
        let event = frame["evt"].as_str().unwrap_or("");
        let data = &frame["data"];

        if event == "ERROR" {
            match cmd {
                // A stored token that no longer works: refresh it, or ask again.
                "AUTHENTICATE" => {
                    let secret = read_secret(SECRET).unwrap_or_default();
                    match load_tokens().filter(|t| !t.refresh.is_empty()).map(|t| refresh(client_id, &secret, &t.refresh)) {
                        Some(Ok(tokens)) => pipe.send(OP_FRAME, &command("AUTHENTICATE", json!({ "access_token": tokens.access })))?,
                        _ => {
                            let _ = write_secret(TOKENS, "");
                            publish(app, DiscordState::with_status("authorize"));
                        }
                    }
                }
                "AUTHORIZE" => {
                    set_error(app, Some(data["message"].as_str().unwrap_or("o Discord recusou a autorização").to_string()));
                    publish(app, DiscordState::with_status("authorize"));
                }
                _ => {}
            }
            continue;
        }

        match (cmd, event) {
            ("DISPATCH", "READY") => {
                ready = true;
                match load_tokens() {
                    Some(tokens) if tokens.expires_at > now() + 60 => {
                        pipe.send(OP_FRAME, &command("AUTHENTICATE", json!({ "access_token": tokens.access })))?
                    }
                    Some(tokens) if !tokens.refresh.is_empty() => {
                        let secret = read_secret(SECRET).unwrap_or_default();
                        match refresh(client_id, &secret, &tokens.refresh) {
                            Ok(fresh) => pipe.send(OP_FRAME, &command("AUTHENTICATE", json!({ "access_token": fresh.access })))?,
                            Err(e) => {
                                set_error(app, Some(e));
                                publish(app, DiscordState::with_status("authorize"));
                            }
                        }
                    }
                    _ => publish(app, DiscordState::with_status("authorize")),
                }
            }
            ("AUTHORIZE", _) => {
                let code = data["code"].as_str().unwrap_or("");
                let secret = read_secret(SECRET).unwrap_or_default();
                match exchange(client_id, &secret, code) {
                    Ok(tokens) => pipe.send(OP_FRAME, &command("AUTHENTICATE", json!({ "access_token": tokens.access })))?,
                    Err(e) => {
                        set_error(app, Some(e));
                        publish(app, DiscordState::with_status("authorize"));
                    }
                }
            }
            ("AUTHENTICATE", _) => {
                authed = true;
                set_error(app, None);
                pipe.send(OP_FRAME, &subscribe("VOICE_CHANNEL_SELECT", json!({})))?;
                pipe.send(OP_FRAME, &subscribe("VOICE_SETTINGS_UPDATE", json!({})))?;
                pipe.send(OP_FRAME, &command("GET_VOICE_SETTINGS", json!({})))?;
                pipe.send(OP_FRAME, &command("GET_SELECTED_VOICE_CHANNEL", json!({})))?;
                publish(app, tracker.state());
            }
            ("GET_VOICE_SETTINGS", _) => {
                tracker.set_settings(data);
                publish(app, tracker.state());
            }
            ("GET_SELECTED_VOICE_CHANNEL", _) => {
                let before = tracker.channel_id.clone();
                tracker.set_channel(data);
                if before != tracker.channel_id {
                    for event in CHANNEL_EVENTS {
                        if let Some(old) = &before {
                            pipe.send(OP_FRAME, &unsubscribe(event, json!({ "channel_id": old })))?;
                        }
                        if let Some(new) = &tracker.channel_id {
                            pipe.send(OP_FRAME, &subscribe(event, json!({ "channel_id": new })))?;
                        }
                    }
                }
                publish(app, tracker.state());
            }
            ("DISPATCH", "VOICE_CHANNEL_SELECT") => {
                // Joined, left or moved: read the whole channel again (name and who is in it).
                pipe.send(OP_FRAME, &command("GET_SELECTED_VOICE_CHANNEL", json!({})))?;
            }
            ("DISPATCH", event) => {
                if tracker.apply(event, data) {
                    publish(app, tracker.state());
                }
            }
            _ => {}
        }
    }
}

pub fn spawn(app: AppHandle) {
    let (tx, rx) = channel();
    app.manage(DiscordControl { commands: Mutex::new(tx), last: Mutex::new(DiscordState::with_status("off")), error: Mutex::new(None) });
    thread::spawn(move || {
        loop {
            let client_id = app.state::<ConfigState>().discord_client_id();
            let configured = !client_id.is_empty() && read_secret(SECRET).is_some();
            if !configured {
                publish(&app, DiscordState::with_status("off"));
                while rx.try_recv().is_ok() {}
                thread::sleep(Duration::from_secs(3));
                continue;
            }
            let Some(mut pipe) = pipe::Pipe::connect() else {
                publish(&app, DiscordState::with_status("closed"));
                while rx.try_recv().is_ok() {}
                thread::sleep(Duration::from_secs(5));
                continue;
            };
            let _ = session(&app, &mut pipe, &client_id, &rx);
            publish(&app, DiscordState::with_status("closed"));
            thread::sleep(Duration::from_secs(2));
        }
    });
}

// ---------- commands ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordSetup {
    pub secret_saved: bool,
    pub redirect: String,
    pub error: Option<String>,
}

#[tauri::command]
pub fn discord_state(control: State<DiscordControl>) -> DiscordState {
    control.last.lock().unwrap().clone()
}

#[tauri::command]
pub fn discord_setup(control: State<DiscordControl>) -> DiscordSetup {
    DiscordSetup { secret_saved: read_secret(SECRET).is_some(), redirect: REDIRECT.into(), error: control.error.lock().unwrap().clone() }
}

#[tauri::command]
pub fn discord_save_secret(secret: String) -> Result<(), String> {
    write_secret(SECRET, secret.trim())
}

/// "authorize", "mute", "unmute", "deafen", "undeafen", "leave" or "forget".
#[tauri::command]
pub fn discord_command(control: State<DiscordControl>, action: String) -> Result<(), String> {
    let cmd = match action.as_str() {
        "authorize" => Command::Authorize,
        "mute" => Command::Mute(true),
        "unmute" => Command::Mute(false),
        "deafen" => Command::Deaf(true),
        "undeafen" => Command::Deaf(false),
        "leave" => Command::Leave,
        "forget" => {
            let _ = write_secret(TOKENS, "");
            Command::Forget
        }
        other => return Err(format!("ação desconhecida: {other}")),
    };
    control.commands.lock().unwrap().send(cmd).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quadro_do_ipc() {
        let frame = encode(OP_FRAME, &json!({ "a": 1 }));
        let (op, len) = header(frame[..8].try_into().unwrap());
        assert_eq!(op, OP_FRAME);
        assert_eq!(len as usize, frame.len() - 8);
        assert_eq!(&frame[8..], br#"{"a":1}"#);
    }

    #[test]
    fn acompanha_a_chamada() {
        let mut tracker = Tracker::default();
        tracker.set_channel(&json!({
            "id": "c1",
            "name": "Geral",
            "voice_states": [
                { "nick": "Fe", "user": { "id": "1", "username": "felype" }, "voice_state": { "self_mute": false } },
                { "user": { "id": "2", "username": "ana", "global_name": "Ana" }, "voice_state": { "self_mute": true } }
            ]
        }));
        let state = tracker.state();
        assert_eq!(state.channel.as_deref(), Some("Geral"));
        assert_eq!(state.members.iter().map(|m| m.name.as_str()).collect::<Vec<_>>(), ["Fe", "Ana"]);
        assert!(state.members[1].muted);

        assert!(tracker.apply("SPEAKING_START", &json!({ "user_id": "1" })));
        assert!(tracker.state().members[0].speaking);
        tracker.apply("VOICE_STATE_CREATE", &json!({ "user": { "id": "3", "username": "bia" }, "voice_state": {} }));
        assert_eq!(tracker.members.len(), 3);
        tracker.apply("VOICE_STATE_DELETE", &json!({ "user": { "id": "2" } }));
        assert_eq!(tracker.members.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(), ["1", "3"]);
        tracker.apply("VOICE_SETTINGS_UPDATE", &json!({ "mute": true, "deaf": false }));
        assert!(tracker.state().muted);

        tracker.set_channel(&Value::Null);
        assert_eq!(tracker.state().channel, None);
        assert!(tracker.state().members.is_empty());
        assert!(!tracker.apply("SOMETHING_ELSE", &json!({})));
    }
}
