//! Instalação dos hooks do Claude Code no `~/.claude/settings.json`. Só funções puras sobre o JSON, para
//! poder testar sem tocar no disco. Tudo o que o Docky escreve leva a marca `docky=1` na URL do comando,
//! e só isso é removido ao desinstalar: os hooks do usuário nunca são alterados.

use serde_json::{Map, Value, json};

pub const MARKER: &str = "docky=1";

/// Eventos que o Docky escuta e quanto tempo (em segundos) cada hook pode levar.
/// `PermissionRequest` espera a sua resposta na ilha, então precisa de um prazo longo.
pub const EVENTS: &[(&str, u32)] = &[
    ("SessionStart", 10),
    ("UserPromptSubmit", 10),
    ("PostToolUse", 10),
    ("PermissionRequest", 600),
    ("Stop", 10),
    ("SessionEnd", 10),
];

/// Comando do hook: manda o JSON do evento (stdin) para o servidor local e devolve a resposta (stdout).
/// O `|| true` faz o hook sair com 0 quando o Docky está fechado, e o Claude Code segue o fluxo normal.
pub fn hook_command(port: u16, token: &str, event: &str, timeout: u32) -> String {
    let wait = timeout.saturating_sub(10).max(5);
    format!(
        "curl -s -m {wait} -X POST -H \"Authorization: Bearer {token}\" -H \"Content-Type: application/json\" --data-binary @- \"http://127.0.0.1:{port}/hook/{event}?{MARKER}\" || true"
    )
}

fn is_ours(group: &Value) -> bool {
    group["hooks"]
        .as_array()
        .is_some_and(|hooks| hooks.iter().any(|h| h["command"].as_str().is_some_and(|c| c.contains(MARKER))))
}

/// Remove só as entradas do Docky e apaga listas que ficarem vazias por causa disso.
pub fn remove(settings: &mut Value) {
    let Some(hooks) = settings.get_mut("hooks").and_then(Value::as_object_mut) else {
        return;
    };
    let mut emptied = Vec::new();
    for (event, groups) in hooks.iter_mut() {
        if let Some(list) = groups.as_array_mut() {
            let before = list.len();
            list.retain(|g| !is_ours(g));
            if before > 0 && list.is_empty() {
                emptied.push(event.clone());
            }
        }
    }
    for event in emptied {
        hooks.remove(&event);
    }
    if hooks.is_empty() {
        settings.as_object_mut().map(|o| o.remove("hooks"));
    }
}

/// Instala (ou atualiza) os hooks do Docky, mantendo tudo o que já existe.
pub fn install(settings: &mut Value, port: u16, token: &str) {
    remove(settings);
    if !settings.is_object() {
        *settings = Value::Object(Map::new());
    }
    let root = settings.as_object_mut().expect("settings é um objeto");
    let hooks = root
        .entry("hooks")
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .expect("hooks é um objeto");

    for (event, timeout) in EVENTS {
        let group = json!({
            "hooks": [{
                "type": "command",
                "command": hook_command(port, token, event, *timeout),
                "timeout": timeout,
            }]
        });
        hooks
            .entry(*event)
            .or_insert_with(|| Value::Array(Vec::new()))
            .as_array_mut()
            .expect("lista de hooks")
            .push(group);
    }
}

pub fn is_installed(settings: &Value) -> bool {
    settings["hooks"]
        .as_object()
        .is_some_and(|hooks| hooks.values().filter_map(Value::as_array).flatten().any(is_ours))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ours_count(settings: &Value) -> usize {
        settings["hooks"]
            .as_object()
            .map(|h| h.values().filter_map(Value::as_array).flatten().filter(|g| is_ours(g)).count())
            .unwrap_or(0)
    }

    #[test]
    fn instala_em_arquivo_vazio() {
        let mut settings = json!({});
        install(&mut settings, 47831, "tok");
        assert_eq!(ours_count(&settings), EVENTS.len());
        assert!(is_installed(&settings));
        let command = settings["hooks"]["PermissionRequest"][0]["hooks"][0]["command"].as_str().unwrap();
        assert!(command.contains("127.0.0.1:47831/hook/PermissionRequest?docky=1"));
        assert!(command.ends_with("|| true"));
        assert_eq!(settings["hooks"]["PermissionRequest"][0]["hooks"][0]["timeout"], 600);
    }

    #[test]
    fn preserva_hooks_e_chaves_do_usuario() {
        let mut settings = json!({
            "theme": "dark",
            "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "echo meu" }] }] }
        });
        install(&mut settings, 47831, "tok");
        assert_eq!(settings["theme"], "dark");
        assert_eq!(settings["hooks"]["Stop"].as_array().unwrap().len(), 2);
        assert_eq!(settings["hooks"]["Stop"][0]["hooks"][0]["command"], "echo meu");
    }

    #[test]
    fn instalar_duas_vezes_nao_duplica() {
        let mut settings = json!({});
        install(&mut settings, 47831, "a");
        install(&mut settings, 47832, "b");
        assert_eq!(ours_count(&settings), EVENTS.len());
        let command = settings["hooks"]["Stop"][0]["hooks"][0]["command"].as_str().unwrap();
        assert!(command.contains(":47832/") && command.contains("Bearer b"));
    }

    #[test]
    fn remover_tira_so_os_do_docky() {
        let mut settings = json!({
            "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "echo meu" }] }] }
        });
        install(&mut settings, 47831, "tok");
        remove(&mut settings);
        assert!(!is_installed(&settings));
        assert_eq!(settings["hooks"]["Stop"].as_array().unwrap().len(), 1);
        assert!(settings["hooks"].get("PermissionRequest").is_none());
    }

    #[test]
    fn remover_apaga_hooks_vazio() {
        let mut settings = json!({ "theme": "dark" });
        install(&mut settings, 47831, "tok");
        remove(&mut settings);
        assert_eq!(settings, json!({ "theme": "dark" }));
    }
}
