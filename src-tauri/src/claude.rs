//! Integração com o Claude Code: um servidor HTTP local (só 127.0.0.1, protegido por token) recebe os eventos
//! dos hooks, avisa a ilha e, nos pedidos de permissão, espera a resposta do usuário.

use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    sync::{
        Mutex,
        atomic::{AtomicU16, AtomicU64, Ordering},
        mpsc::{self, RecvTimeoutError, Sender},
    },
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{claude_hooks, config::ConfigState};

const FIRST_PORT: u16 = 47831;
const PORT_ATTEMPTS: u16 = 10;
const MAX_HEADER: usize = 64 * 1024;
const MAX_BODY: usize = 2 * 1024 * 1024;
/// Um pouco menos que o prazo do hook (600 s), para responder antes de o Claude Code cancelar.
const PERMISSION_WAIT: Duration = Duration::from_secs(590);

pub struct ClaudeState {
    token: String,
    port: AtomicU16,
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, Sender<bool>>>,
}

impl ClaudeState {
    pub fn load(app: &AppHandle) -> Self {
        Self {
            token: load_or_create_token(app),
            port: AtomicU16::new(0),
            next_id: AtomicU64::new(1),
            pending: Mutex::new(HashMap::new()),
        }
    }
}

fn load_or_create_token(app: &AppHandle) -> String {
    let dir = app.path().app_config_dir().expect("pasta de configuração");
    let _ = fs::create_dir_all(&dir);
    let path = dir.join("claude-token");
    if let Ok(token) = fs::read_to_string(&path) {
        let token = token.trim().to_string();
        if token.len() >= 32 {
            return token;
        }
    }
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).expect("sem fonte de aleatoriedade");
    let token: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    let _ = fs::write(&path, &token);
    token
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ClaudeEvent {
    event: String,
    session_id: String,
    cwd: String,
    tool_name: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PermissionRequest {
    id: u64,
    session_id: String,
    cwd: String,
    tool_name: String,
    summary: String,
}

fn text<'a>(body: &'a Value, key: &str) -> &'a str {
    body.get(key).and_then(Value::as_str).unwrap_or("")
}

/// O que mostrar do pedido: o comando, o arquivo ou o endereço, conforme a ferramenta.
fn summarize(tool: &str, input: &Value) -> String {
    let pick = |keys: &[&str]| keys.iter().find_map(|k| input.get(*k).and_then(Value::as_str)).map(str::to_string);
    let summary = match tool {
        "Bash" => pick(&["command"]),
        "Edit" | "Write" | "MultiEdit" | "NotebookEdit" | "Read" => pick(&["file_path", "notebook_path"]),
        "WebFetch" => pick(&["url"]),
        "WebSearch" => pick(&["query"]),
        _ => None,
    };
    let mut summary = summary.unwrap_or_else(|| input.to_string());
    if summary.chars().count() > 240 {
        summary = summary.chars().take(240).collect::<String>() + "…";
    }
    summary
}

fn decision_json(allow: bool) -> String {
    let decision = if allow {
        json!({ "behavior": "allow" })
    } else {
        json!({ "behavior": "deny", "message": "Negado pelo Docky.", "interrupt": false })
    };
    json!({ "hookSpecificOutput": { "hookEventName": "PermissionRequest", "decision": decision } }).to_string()
}

/// O cliente (curl do hook) fechou a conexão? Acontece quando você responde no terminal.
fn client_gone(stream: &TcpStream) -> bool {
    let _ = stream.set_nonblocking(true);
    let mut probe = [0u8; 1];
    let gone = matches!(stream.peek(&mut probe), Ok(0));
    let _ = stream.set_nonblocking(false);
    gone
}

fn wait_for_decision(app: &AppHandle, stream: &TcpStream, request: PermissionRequest) -> Option<bool> {
    let state = app.state::<ClaudeState>();
    let (tx, rx) = mpsc::channel();
    let id = request.id;
    state.pending.lock().unwrap().insert(id, tx);
    let _ = app.emit_to("island", "claude-permission", &request);

    let started = Instant::now();
    let decision = loop {
        match rx.recv_timeout(Duration::from_millis(400)) {
            Ok(allow) => break Some(allow),
            Err(RecvTimeoutError::Timeout) => {
                if started.elapsed() >= PERMISSION_WAIT || client_gone(stream) {
                    break None;
                }
            }
            Err(RecvTimeoutError::Disconnected) => break None,
        }
    };

    state.pending.lock().unwrap().remove(&id);
    if decision.is_none() {
        let _ = app.emit_to("island", "claude-permission-cancel", id);
    }
    decision
}

/// Corpo da resposta ao hook. Vazio = o Claude Code segue o fluxo normal (pergunta no terminal).
fn handle_hook(app: &AppHandle, stream: &TcpStream, event: &str, body: &Value) -> String {
    let session_id = text(body, "session_id").to_string();
    let cwd = text(body, "cwd").to_string();
    let tool_name = body.get("tool_name").and_then(Value::as_str).map(str::to_string);

    let _ = app.emit_to(
        "island",
        "claude-event",
        ClaudeEvent { event: event.to_string(), session_id: session_id.clone(), cwd: cwd.clone(), tool_name: tool_name.clone() },
    );

    if event != "PermissionRequest" || !app.state::<ConfigState>().get().claude_approve {
        return String::new();
    }

    let tool = tool_name.unwrap_or_default();
    if tool.is_empty() {
        return String::new(); // corpo inválido: deixa o Claude Code perguntar no terminal
    }
    let summary = summarize(&tool, body.get("tool_input").unwrap_or(&Value::Null));
    let id = app.state::<ClaudeState>().next_id.fetch_add(1, Ordering::SeqCst);
    match wait_for_decision(app, stream, PermissionRequest { id, session_id, cwd, tool_name: tool, summary }) {
        Some(allow) => decision_json(allow),
        None => String::new(),
    }
}

struct Request {
    method: String,
    path: String,
    authorization: String,
    body: Vec<u8>,
}

fn read_request(stream: &mut TcpStream) -> Option<Request> {
    let mut data = Vec::new();
    let mut chunk = [0u8; 4096];
    let header_end = loop {
        if let Some(pos) = data.windows(4).position(|w| w == b"\r\n\r\n") {
            break pos;
        }
        if data.len() > MAX_HEADER {
            return None;
        }
        let n = stream.read(&mut chunk).ok()?;
        if n == 0 {
            return None;
        }
        data.extend_from_slice(&chunk[..n]);
    };

    let head = String::from_utf8_lossy(&data[..header_end]).to_string();
    let mut lines = head.lines();
    let mut first = lines.next()?.split_whitespace();
    let method = first.next()?.to_string();
    let path = first.next()?.to_string();

    let mut authorization = String::new();
    let mut length = 0usize;
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            match name.trim().to_ascii_lowercase().as_str() {
                "authorization" => authorization = value.trim().to_string(),
                "content-length" => length = value.trim().parse().ok()?,
                _ => {}
            }
        }
    }
    if length > MAX_BODY {
        return None;
    }

    let mut body = data[header_end + 4..].to_vec();
    while body.len() < length {
        let n = stream.read(&mut chunk).ok()?;
        if n == 0 {
            return None;
        }
        body.extend_from_slice(&chunk[..n]);
    }
    body.truncate(length);
    Some(Request { method, path, authorization, body })
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
}

/// Comparação sem sair no primeiro byte diferente.
fn same_token(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn serve(app: AppHandle, mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let Some(request) = read_request(&mut stream) else {
        return respond(&mut stream, "400 Bad Request", "");
    };
    let state = app.state::<ClaudeState>();
    let expected = format!("Bearer {}", state.token);
    if !same_token(&request.authorization, &expected) {
        return respond(&mut stream, "401 Unauthorized", "");
    }
    let route = request.path.split('?').next().unwrap_or("");
    let Some(event) = route.strip_prefix("/hook/").filter(|e| request.method == "POST" && !e.is_empty()) else {
        return respond(&mut stream, "404 Not Found", "");
    };
    let body: Value = serde_json::from_slice(&request.body).unwrap_or(Value::Null);
    let _ = stream.set_read_timeout(None);
    let reply = handle_hook(&app, &stream, event, &body);
    respond(&mut stream, "200 OK", &reply);
}

/// Abre o servidor na primeira porta livre a partir de 47831 (só na máquina local).
pub fn spawn(app: AppHandle) {
    let listener = (FIRST_PORT..FIRST_PORT + PORT_ATTEMPTS)
        .find_map(|port| TcpListener::bind(("127.0.0.1", port)).ok().map(|l| (port, l)));
    let Some((port, listener)) = listener else {
        eprintln!("docky: nenhuma porta livre para o servidor do Claude Code");
        return;
    };
    app.state::<ClaudeState>().port.store(port, Ordering::SeqCst);

    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            thread::spawn(move || serve(app, stream));
        }
    });
}

#[tauri::command]
pub fn claude_decide(state: State<ClaudeState>, id: u64, allow: bool) {
    if let Some(sender) = state.pending.lock().unwrap().get(&id) {
        let _ = sender.send(allow);
    }
}

fn settings_path() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    Some(PathBuf::from(home).join(".claude").join("settings.json"))
}

fn read_settings(path: &PathBuf) -> Result<Value, String> {
    match fs::read_to_string(path) {
        Ok(text) if text.trim().is_empty() => Ok(json!({})),
        Ok(text) => serde_json::from_str(&text).map_err(|e| format!("settings.json inválido: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(json!({})),
        Err(e) => Err(e.to_string()),
    }
}

fn write_settings(path: &PathBuf, settings: &Value) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // Guarda a cópia original uma única vez, antes da primeira alteração do Docky.
    let backup = path.with_extension("json.docky-backup");
    if path.exists() && !backup.exists() {
        fs::copy(path, &backup).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, text + "\n").map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeStatus {
    /// Porta do servidor local, ou 0 se não subiu.
    port: u16,
    hooks_installed: bool,
    settings_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HooksPlan {
    settings_path: String,
    events: Vec<String>,
    example_command: String,
    backup_path: String,
}

#[tauri::command]
pub fn claude_status(state: State<ClaudeState>) -> Result<ClaudeStatus, String> {
    let path = settings_path().ok_or("não achei a pasta do usuário")?;
    let installed = read_settings(&path).map(|s| claude_hooks::is_installed(&s)).unwrap_or(false);
    Ok(ClaudeStatus {
        port: state.port.load(Ordering::SeqCst),
        hooks_installed: installed,
        settings_path: path.display().to_string(),
    })
}

/// O que será alterado, para o usuário ver antes de aprovar. Não escreve nada.
#[tauri::command]
pub fn claude_hooks_plan(state: State<ClaudeState>) -> Result<HooksPlan, String> {
    let path = settings_path().ok_or("não achei a pasta do usuário")?;
    let port = state.port.load(Ordering::SeqCst);
    Ok(HooksPlan {
        backup_path: path.with_extension("json.docky-backup").display().to_string(),
        settings_path: path.display().to_string(),
        events: claude_hooks::EVENTS.iter().map(|(e, _)| e.to_string()).collect(),
        // O token fica escondido na prévia.
        example_command: claude_hooks::hook_command(port, "••••••••", "PermissionRequest", 600),
    })
}

#[tauri::command]
pub fn claude_hooks_install(state: State<ClaudeState>) -> Result<(), String> {
    let port = state.port.load(Ordering::SeqCst);
    if port == 0 {
        return Err("o servidor local do Docky não está rodando".into());
    }
    let path = settings_path().ok_or("não achei a pasta do usuário")?;
    let mut settings = read_settings(&path)?;
    claude_hooks::install(&mut settings, port, &state.token);
    write_settings(&path, &settings)
}

#[tauri::command]
pub fn claude_hooks_remove() -> Result<(), String> {
    let path = settings_path().ok_or("não achei a pasta do usuário")?;
    let mut settings = read_settings(&path)?;
    claude_hooks::remove(&mut settings);
    write_settings(&path, &settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resume_comando_arquivo_e_endereco() {
        assert_eq!(summarize("Bash", &json!({ "command": "npm test" })), "npm test");
        assert_eq!(summarize("Edit", &json!({ "file_path": "C:/a.ts" })), "C:/a.ts");
        assert_eq!(summarize("WebFetch", &json!({ "url": "https://x.dev" })), "https://x.dev");
    }

    #[test]
    fn resume_corta_textos_longos() {
        let long = "x".repeat(500);
        let summary = summarize("Bash", &json!({ "command": long }));
        assert_eq!(summary.chars().count(), 241);
        assert!(summary.ends_with('…'));
    }

    #[test]
    fn decisao_tem_o_formato_do_claude_code() {
        let allow: Value = serde_json::from_str(&decision_json(true)).unwrap();
        assert_eq!(allow["hookSpecificOutput"]["hookEventName"], "PermissionRequest");
        assert_eq!(allow["hookSpecificOutput"]["decision"]["behavior"], "allow");
        let deny: Value = serde_json::from_str(&decision_json(false)).unwrap();
        assert_eq!(deny["hookSpecificOutput"]["decision"]["behavior"], "deny");
        assert_eq!(deny["hookSpecificOutput"]["decision"]["interrupt"], false);
    }

    #[test]
    fn token_so_casa_se_for_igual() {
        assert!(same_token("Bearer abc", "Bearer abc"));
        assert!(!same_token("Bearer abc", "Bearer abd"));
        assert!(!same_token("Bearer abc", "Bearer ab"));
    }
}
