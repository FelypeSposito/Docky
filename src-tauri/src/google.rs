//! Google Calendar, somente leitura, por OAuth 2.0 para apps de computador (PKCE + redirecionamento local).
//!
//! O usuário cria o próprio Client ID no Google Cloud e o cola nas configurações. O Docky abre o navegador para o
//! login, recebe o código numa porta local temporária (127.0.0.1) e troca por um token. O segredo do cliente e o
//! token de renovação ficam no Gerenciador de Credenciais do Windows, nunca em arquivo.

use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use time::{Date, OffsetDateTime, format_description::well_known::Rfc3339, macros::format_description};

use crate::{config::ConfigState, weather::encode};

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const EVENTS_URL: &str = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const SCOPE: &str = "https://www.googleapis.com/auth/calendar.readonly";

const KEYRING_SERVICE: &str = "Docky";
const SECRET_KEY: &str = "google-client-secret";
const REFRESH_KEY: &str = "google-refresh-token";

/// Quanto o navegador tem para terminar o login antes de o Docky desistir.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Default)]
pub struct GoogleState {
    /// Token de acesso em memória e quando ele vence.
    access: Mutex<Option<(String, Instant)>>,
    connecting: AtomicBool,
}

// ---------- credenciais no Gerenciador de Credenciais ----------

fn entry(name: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, name).map_err(|e| e.to_string())
}

fn read_secret(name: &str) -> Option<String> {
    entry(name).ok()?.get_password().ok().filter(|s| !s.is_empty())
}

fn write_secret(name: &str, value: &str) -> Result<(), String> {
    let entry = entry(name)?;
    if value.is_empty() {
        // Apagar algo que não existe não é erro.
        let _ = entry.delete_credential();
        return Ok(());
    }
    entry.set_password(value).map_err(|e| e.to_string())
}

// ---------- partes puras (testáveis sem rede) ----------

/// O "code challenge" do PKCE: SHA-256 do verificador, em base64 sem preenchimento (RFC 7636).
pub fn code_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn random_token(bytes: usize) -> String {
    let mut buffer = vec![0u8; bytes];
    getrandom::fill(&mut buffer).expect("sem fonte de aleatoriedade");
    URL_SAFE_NO_PAD.encode(buffer)
}

pub fn auth_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str) -> String {
    format!(
        "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={challenge}&code_challenge_method=S256&state={state}&access_type=offline&prompt=consent",
        encode(client_id),
        encode(redirect_uri),
        encode(SCOPE),
    )
}

fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() + 0 && i + 2 <= bytes.len() - 1 => {
                if let Ok(byte) = u8::from_str_radix(&text[i + 1..i + 3], 16) {
                    out.push(byte);
                    i += 3;
                    continue;
                }
                out.push(b'%');
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            other => {
                out.push(other);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Lê a primeira linha da requisição que o navegador faz ao voltar do login ("GET /?code=…&state=… HTTP/1.1").
/// Devolve o código, ou o motivo do erro; recusa se o `state` não for o que o Docky enviou.
pub fn parse_callback(request_line: &str, expected_state: &str) -> Result<String, String> {
    let target = request_line.split_whitespace().nth(1).ok_or("requisição inválida")?;
    let query = target.split_once('?').map(|(_, q)| q).ok_or("sem parâmetros")?;
    let mut code = None;
    let mut state = None;
    let mut error = None;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        match key {
            "code" => code = Some(percent_decode(value)),
            "state" => state = Some(percent_decode(value)),
            "error" => error = Some(percent_decode(value)),
            _ => {}
        }
    }
    if let Some(error) = error {
        return Err(if error == "access_denied" { "você não autorizou o acesso".into() } else { error });
    }
    if state.as_deref() != Some(expected_state) {
        return Err("resposta de login inesperada (state diferente)".into());
    }
    code.filter(|c| !c.is_empty()).ok_or_else(|| "o Google não devolveu o código".into())
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalEvent {
    pub id: String,
    pub title: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub all_day: bool,
    pub location: Option<String>,
    /// Link da videochamada (Meet, por exemplo), se o evento tiver.
    pub meet_url: Option<String>,
}

fn time_ms(part: &Value) -> Option<(i64, bool)> {
    if let Some(text) = part["dateTime"].as_str() {
        return Some((OffsetDateTime::parse(text, &Rfc3339).ok()?.unix_timestamp() * 1000, false));
    }
    let date = Date::parse(part["date"].as_str()?, format_description!("[year]-[month]-[day]")).ok()?;
    Some((date.midnight().assume_utc().unix_timestamp() * 1000, true))
}

/// Eventos da resposta da API, sem os cancelados, na ordem em que vêm (a API já ordena por início).
pub fn parse_events(response: &Value) -> Vec<CalEvent> {
    response["items"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter(|item| item["status"].as_str() != Some("cancelled"))
                .filter_map(|item| {
                    let (start_ms, all_day) = time_ms(&item["start"])?;
                    let (end_ms, _) = time_ms(&item["end"]).unwrap_or((start_ms, all_day));
                    let meet_url = item["hangoutLink"].as_str().map(str::to_string).or_else(|| {
                        item["conferenceData"]["entryPoints"]
                            .as_array()?
                            .iter()
                            .find(|p| p["entryPointType"] == "video")
                            .and_then(|p| p["uri"].as_str())
                            .map(str::to_string)
                    });
                    Some(CalEvent {
                        id: item["id"].as_str()?.to_string(),
                        title: item["summary"].as_str().unwrap_or("(sem título)").to_string(),
                        start_ms,
                        end_ms,
                        all_day,
                        location: item["location"].as_str().map(str::to_string),
                        meet_url,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

// ---------- rede ----------

fn agent() -> ureq::Agent {
    // Com erro HTTP o Google explica o motivo no corpo; queremos ler esse corpo.
    ureq::Agent::new_with_config(ureq::Agent::config_builder().http_status_as_error(false).build())
}

fn read_json(mut response: ureq::http::Response<ureq::Body>) -> Result<Value, String> {
    let status = response.status().as_u16();
    let body = response.body_mut().read_to_string().map_err(|e| e.to_string())?;
    let json: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
    if status >= 400 {
        let reason = json["error_description"]
            .as_str()
            .or_else(|| json["error"]["message"].as_str())
            .or_else(|| json["error"].as_str())
            .unwrap_or("erro desconhecido");
        return Err(format!("Google ({status}): {reason}"));
    }
    Ok(json)
}

fn post_form(url: &str, fields: &[(&str, &str)]) -> Result<Value, String> {
    read_json(agent().post(url).send_form(fields.iter().copied()).map_err(|e| e.to_string())?)
}

struct Tokens {
    access: String,
    refresh: Option<String>,
    expires_in: u64,
}

fn tokens_from(json: &Value) -> Result<Tokens, String> {
    Ok(Tokens {
        access: json["access_token"].as_str().ok_or("o Google não devolveu o token")?.to_string(),
        refresh: json["refresh_token"].as_str().map(str::to_string),
        expires_in: json["expires_in"].as_u64().unwrap_or(3600),
    })
}

fn exchange_code(token_url: &str, client_id: &str, secret: &str, code: &str, verifier: &str, redirect: &str) -> Result<Tokens, String> {
    tokens_from(&post_form(
        token_url,
        &[
            ("client_id", client_id),
            ("client_secret", secret),
            ("code", code),
            ("code_verifier", verifier),
            ("redirect_uri", redirect),
            ("grant_type", "authorization_code"),
        ],
    )?)
}

/// Espera o navegador voltar do login na porta local e devolve o código.
fn wait_for_code(listener: &TcpListener, expected_state: &str, timeout: Duration) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let started = Instant::now();
    while started.elapsed() < timeout {
        match listener.accept() {
            Ok((mut stream, _)) => {
                if let Some(result) = handle_callback(&mut stream, expected_state) {
                    return result;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("o login demorou demais; tente de novo".into())
}

/// Atende uma conexão. `None` = não era o retorno do login (por exemplo, o ícone da aba), segue esperando.
fn handle_callback(stream: &mut TcpStream, expected_state: &str) -> Option<Result<String, String>> {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buffer = [0u8; 4096];
    let n = stream.read(&mut buffer).ok()?;
    let request = String::from_utf8_lossy(&buffer[..n]);
    let line = request.lines().next()?;
    if !line.contains("code=") && !line.contains("error=") {
        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        return None;
    }
    let result = parse_callback(line, expected_state);
    let message = if result.is_ok() { "Pronto! O Docky já está conectado ao seu Google Agenda. Pode fechar esta janela." } else { "Não deu certo. Volte ao Docky e tente de novo." };
    let page = format!("<!doctype html><meta charset=utf-8><title>Docky</title><body style=\"font:16px system-ui;background:#000;color:#fff;display:grid;place-items:center;height:100vh;margin:0\"><p>{message}</p>");
    let _ = stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{page}", page.len()).as_bytes());
    Some(result)
}

fn remember(state: &GoogleState, tokens: &Tokens) {
    let margin = tokens.expires_in.saturating_sub(60);
    *state.access.lock().unwrap() = Some((tokens.access.clone(), Instant::now() + Duration::from_secs(margin)));
}

fn access_token(state: &GoogleState, client_id: &str) -> Result<String, String> {
    if let Some((token, expires)) = state.access.lock().unwrap().as_ref() {
        if Instant::now() < *expires {
            return Ok(token.clone());
        }
    }
    let refresh = read_secret(REFRESH_KEY).ok_or("o Google Agenda não está conectado")?;
    let secret = read_secret(SECRET_KEY).ok_or("falta o segredo do cliente nas configurações")?;
    let tokens = post_form(
        TOKEN_URL,
        &[("client_id", client_id), ("client_secret", &secret), ("refresh_token", &refresh), ("grant_type", "refresh_token")],
    )
    .and_then(|json| tokens_from(&json))
    .map_err(|e| format!("ao renovar o acesso: {e}"))?;
    remember(state, &tokens);
    Ok(tokens.access)
}

// ---------- comandos ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleStatus {
    /// Tem Client ID e segredo cadastrados, então dá para conectar.
    configured: bool,
    /// Já fez o login e tem o token de renovação.
    connected: bool,
    secret_saved: bool,
}

#[tauri::command]
pub fn google_status(config: State<ConfigState>) -> GoogleStatus {
    let secret_saved = read_secret(SECRET_KEY).is_some();
    GoogleStatus {
        configured: !config.get().google_client_id.trim().is_empty() && secret_saved,
        connected: read_secret(REFRESH_KEY).is_some(),
        secret_saved,
    }
}

/// Guarda (ou apaga, se vazio) o segredo do cliente no Gerenciador de Credenciais.
#[tauri::command]
pub fn google_save_secret(secret: String) -> Result<(), String> {
    write_secret(SECRET_KEY, secret.trim())
}

#[tauri::command]
pub fn google_disconnect(google: State<GoogleState>) -> Result<(), String> {
    *google.access.lock().unwrap() = None;
    write_secret(REFRESH_KEY, "")
}

#[tauri::command]
pub async fn google_connect(config: State<'_, ConfigState>, google: State<'_, GoogleState>) -> Result<(), String> {
    let client_id = config.get().google_client_id.trim().to_string();
    let secret = read_secret(SECRET_KEY);
    if client_id.is_empty() || secret.is_none() {
        return Err("preencha o Client ID e o segredo do cliente primeiro".into());
    }
    if google.connecting.swap(true, Ordering::SeqCst) {
        return Err("já existe um login em andamento".into());
    }

    let secret = secret.unwrap();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<Tokens, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
        let redirect = format!("http://127.0.0.1:{}", listener.local_addr().map_err(|e| e.to_string())?.port());
        let (verifier, state) = (random_token(32), random_token(16));
        let url = auth_url(&client_id, &redirect, &code_challenge(&verifier), &state);
        tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|e| format!("não consegui abrir o navegador: {e}"))?;
        let code = wait_for_code(&listener, &state, LOGIN_TIMEOUT)?;
        exchange_code(TOKEN_URL, &client_id, &secret, &code, &verifier, &redirect)
    })
    .await
    .map_err(|e| e.to_string());
    google.connecting.store(false, Ordering::SeqCst);

    let tokens = result??;
    let refresh = tokens.refresh.as_deref().ok_or("o Google não devolveu o token de renovação; tente de novo")?;
    write_secret(REFRESH_KEY, refresh)?;
    remember(&google, &tokens);
    Ok(())
}

/// Próximos eventos (agora até daqui a 36 horas) do calendário principal.
#[tauri::command]
pub async fn google_events(app: AppHandle) -> Result<Vec<CalEvent>, String> {
    // Tudo roda numa thread de bloqueio: renovar o token e buscar os eventos fazem rede, e `block_on` aqui
    // dentro de um comando assíncrono derruba o app (o Tokio proíbe, e o build de release aborta no panic).
    tauri::async_runtime::spawn_blocking(move || {
        let client_id = app.state::<ConfigState>().get().google_client_id.trim().to_string();
        let token = access_token(&app.state::<GoogleState>(), &client_id)?;
        let now = OffsetDateTime::now_utc();
        let from = now.format(&Rfc3339).map_err(|e| e.to_string())?;
        let to = (now + time::Duration::hours(36)).format(&Rfc3339).map_err(|e| e.to_string())?;
        let url = format!(
            "{EVENTS_URL}?timeMin={}&timeMax={}&singleEvents=true&orderBy=startTime&maxResults=10",
            encode(&from),
            encode(&to)
        );
        let json = agent()
            .get(&url)
            .header("Authorization", &format!("Bearer {token}"))
            .call()
            .map_err(|e| e.to_string())
            .and_then(read_json)
            .map_err(|e| format!("ao buscar os eventos: {e}"))?;
        Ok(parse_events(&json))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Abre o link de uma videochamada. Só endereços https, nunca outro tipo de destino.
#[tauri::command]
pub fn open_meeting(url: String) -> Result<(), String> {
    if !url.to_ascii_lowercase().starts_with("https://") {
        return Err("só links https podem ser abertos".into());
    }
    tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn code_challenge_bate_com_o_exemplo_da_rfc_7636() {
        assert_eq!(code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn url_de_login_tem_os_parametros_certos() {
        let url = auth_url("abc.apps.googleusercontent.com", "http://127.0.0.1:5555", "CHAL", "ST");
        assert!(url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
        assert!(url.contains("client_id=abc.apps.googleusercontent.com"));
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A5555"));
        assert!(url.contains("scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly"));
        assert!(url.contains("code_challenge=CHAL&code_challenge_method=S256&state=ST"));
        assert!(url.contains("access_type=offline"));
    }

    #[test]
    fn le_o_codigo_do_retorno() {
        let line = "GET /?code=4%2F0AbC-d&state=ST&scope=x HTTP/1.1";
        assert_eq!(parse_callback(line, "ST").unwrap(), "4/0AbC-d");
    }

    #[test]
    fn recusa_state_diferente_erro_e_resposta_sem_codigo() {
        assert!(parse_callback("GET /?code=abc&state=OUTRO HTTP/1.1", "ST").unwrap_err().contains("state"));
        assert!(parse_callback("GET /?error=access_denied&state=ST HTTP/1.1", "ST").unwrap_err().contains("não autorizou"));
        assert!(parse_callback("GET /?state=ST HTTP/1.1", "ST").is_err());
        assert!(parse_callback("GET / HTTP/1.1", "ST").is_err());
    }

    #[test]
    fn decodifica_percentuais_sem_quebrar_no_fim() {
        assert_eq!(percent_decode("a%2Fb%20c+d"), "a/b c d");
        assert_eq!(percent_decode("fim%"), "fim%");
        assert_eq!(percent_decode("fim%2"), "fim%2");
    }

    #[test]
    fn le_eventos_com_hora_dia_todo_e_meet() {
        let response = json!({ "items": [
            { "id": "1", "summary": "Standup", "status": "confirmed",
              "start": { "dateTime": "2026-11-02T10:30:00-03:00" }, "end": { "dateTime": "2026-11-02T11:00:00-03:00" },
              "hangoutLink": "https://meet.google.com/abc-defg-hij", "location": "Sala 2" },
            { "id": "2", "status": "confirmed", "start": { "date": "2026-11-03" }, "end": { "date": "2026-11-04" } },
            { "id": "3", "summary": "Cancelado", "status": "cancelled", "start": { "dateTime": "2026-11-02T12:00:00Z" }, "end": { "dateTime": "2026-11-02T13:00:00Z" } },
            { "id": "4", "summary": "Zoom", "start": { "dateTime": "2026-11-02T15:00:00Z" }, "end": { "dateTime": "2026-11-02T16:00:00Z" },
              "conferenceData": { "entryPoints": [ { "entryPointType": "phone", "uri": "tel:123" }, { "entryPointType": "video", "uri": "https://zoom.us/j/1" } ] } }
        ]});
        let events = parse_events(&response);
        assert_eq!(events.len(), 3);
        assert_eq!(events[0].title, "Standup");
        assert_eq!(events[0].start_ms, 1_793_626_200_000); // 2026-11-02T13:30:00Z
        assert_eq!(events[0].meet_url.as_deref(), Some("https://meet.google.com/abc-defg-hij"));
        assert_eq!(events[0].location.as_deref(), Some("Sala 2"));
        assert!(events[1].all_day && events[1].title == "(sem título)");
        assert_eq!(events[2].meet_url.as_deref(), Some("https://zoom.us/j/1"));
    }

    #[test]
    fn resposta_sem_itens_vira_lista_vazia() {
        assert!(parse_events(&json!({})).is_empty());
    }

    /// Servidor HTTP mínimo que responde uma vez e devolve o corpo recebido.
    fn fake_server(reply: &'static str) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let url = format!("http://127.0.0.1:{}/token", listener.local_addr().unwrap().port());
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut data = Vec::new();
            let mut chunk = [0u8; 2048];
            loop {
                let n = stream.read(&mut chunk).unwrap();
                data.extend_from_slice(&chunk[..n]);
                let text = String::from_utf8_lossy(&data).to_string();
                if let Some((head, body)) = text.split_once("\r\n\r\n") {
                    let length: usize = head.lines().find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse().unwrap())).unwrap_or(0);
                    if body.len() >= length {
                        break;
                    }
                }
                if n == 0 {
                    break;
                }
            }
            let (status, body) = reply.split_once('|').unwrap();
            stream.write_all(format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).unwrap();
            String::from_utf8_lossy(&data).to_string()
        });
        (url, handle)
    }

    #[test]
    fn troca_o_codigo_por_tokens() {
        let (url, server) = fake_server(r#"200 OK|{"access_token":"AT","refresh_token":"RT","expires_in":3599}"#);
        let tokens = exchange_code(&url, "cid", "sec", "o-codigo", "o-verificador", "http://127.0.0.1:1").unwrap();
        assert_eq!((tokens.access.as_str(), tokens.refresh.as_deref(), tokens.expires_in), ("AT", Some("RT"), 3599));
        let request = server.join().unwrap();
        for esperado in ["grant_type=authorization_code", "code=o-codigo", "code_verifier=o-verificador", "client_secret=sec", "client_id=cid"] {
            assert!(request.contains(esperado), "faltou {esperado} em {request}");
        }
    }

    #[test]
    fn mostra_o_motivo_quando_o_google_recusa() {
        let (url, _server) = fake_server(r#"400 Bad Request|{"error":"invalid_client","error_description":"The OAuth client was not found."}"#);
        let error = exchange_code(&url, "cid", "sec", "c", "v", "http://127.0.0.1:1").err().unwrap();
        assert!(error.contains("400") && error.contains("OAuth client was not found"), "{error}");
    }

    #[test]
    fn volta_do_login_pela_porta_local() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let browser = thread::spawn(move || {
            // Primeiro um pedido qualquer (como o ícone da aba), depois o retorno de verdade.
            for path in ["/favicon.ico", "/?code=COD%2F1&state=ST"] {
                let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
                stream.write_all(format!("GET {path} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes()).unwrap();
                let mut reply = String::new();
                stream.read_to_string(&mut reply).unwrap();
            }
        });
        let code = wait_for_code(&listener, "ST", Duration::from_secs(5)).unwrap();
        browser.join().unwrap();
        assert_eq!(code, "COD/1");
    }

    #[test]
    fn so_abre_links_https() {
        assert!(open_meeting("http://meet.google.com/x".into()).is_err());
        assert!(open_meeting("file:///C:/Windows/system32/calc.exe".into()).is_err());
        assert!(open_meeting("javascript:alert(1)".into()).is_err());
    }
}
