//! Atalhos: abre um app, pasta, arquivo ou site da lista que o usuário cadastrou nas configurações.
//! O comando recebe só a posição na lista, nunca um caminho qualquer, então não serve para abrir algo arbitrário.

use std::{fs, path::Path};

use base64::{Engine, engine::general_purpose::STANDARD};
use tauri::{State, WebviewWindow};

use crate::{
    config::{ConfigState, Shortcut},
    placement,
};

/// Por quanto tempo, depois de abrir, a ilha procura a janela nova do app para levá-la à tela certa.
const FOLLOW_SECONDS: u64 = 10;

/// Imagens de ícone maiores que isso não são lidas (o ícone vai embutido na tela).
const MAX_ICON_BYTES: u64 = 1_500_000;

/// O tipo da imagem pela extensão. Só estes formatos são lidos; qualquer outra coisa não é uma imagem de ícone.
fn image_mime(path: &str) -> Option<&'static str> {
    let extension = Path::new(path).extension()?.to_str()?.to_ascii_lowercase();
    Some(match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        _ => return None,
    })
}

/// A imagem de um ícone, pronta para a tela (`data:`), ou `None` se o ícone for um emoji, da biblioteca ou vazio.
/// Só lê arquivos de imagem de até 1,5 MB.
pub fn read_icon_image(icon: &str) -> Result<Option<String>, String> {
    let icon = icon.trim();
    let Some(mime) = image_mime(icon) else {
        return Ok(None);
    };
    let metadata = fs::metadata(icon).map_err(|_| "não achei a imagem do ícone".to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_ICON_BYTES {
        return Err("a imagem do ícone precisa ser um arquivo de até 1,5 MB".into());
    }
    let bytes = fs::read(icon).map_err(|e| e.to_string())?;
    Ok(Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes))))
}

/// O ícone de imagem do atalho da posição `index`. Recebe só a posição, como o `launch`: não lê um caminho qualquer.
#[tauri::command]
pub fn shortcut_icon(state: State<ConfigState>, index: usize) -> Result<Option<String>, String> {
    match state.get().shortcuts.get(index) {
        Some(shortcut) => read_icon_image(&shortcut.icon),
        None => Ok(None),
    }
}

/// O ícone de imagem da pasta da Shelf na posição `index`.
#[tauri::command]
pub fn shelf_icon(state: State<ConfigState>, index: usize) -> Result<Option<String>, String> {
    match state.get().shelf_folders.get(index) {
        Some(folder) => read_icon_image(&folder.icon),
        None => Ok(None),
    }
}

/// Tem cara de endereço com protocolo: `https://…`, mas também `steam://…` ou `spotify://…`, que abrem apps e jogos.
/// (Letra única antes de `://` é uma unidade de disco, não um protocolo.)
fn is_url(target: &str) -> bool {
    let Some((scheme, _)) = target.split_once("://") else { return false };
    scheme.len() >= 2 && scheme.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'))
}

/// Troca `%NOME%` pelo valor da variável de ambiente (`%USERPROFILE%`); o que não existir fica como está.
fn expand_env(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find('%') {
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(len) if len > 0 => match std::env::var(&after[..len]) {
                Ok(value) => {
                    out.push_str(&rest[..start]);
                    out.push_str(&value);
                    rest = &after[len + 1..];
                }
                Err(_) => {
                    out.push_str(&rest[..=start]);
                    rest = after;
                }
            },
            _ => {
                out.push_str(&rest[..=start]);
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// O que a pessoa colou, pronto para abrir: sem espaços nas pontas nem aspas (copiar como caminho do Explorer traz
/// `"C:\…"`, e as aspas fazem o Windows recusar o nome) e com as variáveis de ambiente expandidas.
pub fn clean_target(raw: &str) -> String {
    expand_env(raw.trim().trim_matches('"').trim())
}

/// O que um atalho abre, em ordem: o próprio destino, ou o de cada membro de um grupo.
fn targets_of(shortcuts: &[Shortcut], index: usize) -> Result<Vec<String>, String> {
    let shortcut = shortcuts.get(index).ok_or("esse atalho não existe")?;
    if !shortcut.group {
        let target = clean_target(&shortcut.target);
        return if target.is_empty() { Err("esse atalho não tem destino".into()) } else { Ok(vec![target]) };
    }
    let targets: Vec<String> = shortcut
        .members
        .iter()
        .filter_map(|id| shortcuts.iter().find(|s| &s.id == id && !s.group))
        .map(|s| clean_target(&s.target))
        .filter(|t| !t.is_empty())
        .collect();
    if targets.is_empty() { Err("esse grupo está vazio".into()) } else { Ok(targets) }
}

fn open_target(target: &str) -> Result<(), String> {
    let result = if is_url(target) {
        tauri_plugin_opener::open_url(target, None::<&str>)
    } else if target.to_ascii_lowercase().starts_with("shell:") {
        // Apps da Microsoft Store (`shell:AppsFolder\…`) abrem pelo Explorer.
        return std::process::Command::new("explorer.exe")
            .arg(target)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("não consegui abrir {target}: {e}"));
    } else {
        tauri_plugin_opener::open_path(target, None::<&str>)
    };
    result.map_err(|e| format!("não consegui abrir {target}: {e}"))
}

/// Pausa entre os itens de um grupo, para os apps não disputarem a abertura todos no mesmo instante.
const GROUP_GAP: std::time::Duration = std::time::Duration::from_millis(400);

/// Abre o atalho da posição `index` (um destino, ou todos os de um grupo). A confirmação é feita na tela, antes.
#[tauri::command]
pub async fn launch(window: WebviewWindow, state: State<'_, ConfigState>, index: usize) -> Result<(), String> {
    let targets = targets_of(&state.get().shortcuts, index)?;
    // As janelas que os apps abrirem vão para a tela da ilha que foi clicada, não para a principal.
    placement::follow(placement::Screen::of_window(&window), FOLLOW_SECONDS + targets.len() as u64 * 2);
    tauri::async_runtime::spawn_blocking(move || {
        let mut errors = Vec::new();
        for (i, target) in targets.iter().enumerate() {
            if i > 0 {
                std::thread::sleep(GROUP_GAP);
            }
            if let Err(e) = open_target(target) {
                errors.push(e);
            }
        }
        if errors.is_empty() { Ok(()) } else { Err(errors.join("; ")) }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{Shortcut, clean_target, image_mime, is_url, targets_of};

    #[test]
    fn so_le_imagens_como_icone() {
        assert_eq!(image_mime("C:\\icones\\git.PNG"), Some("image/png"));
        assert_eq!(image_mime("logo.svg"), Some("image/svg+xml"));
        assert_eq!(image_mime("foto.jpeg"), Some("image/jpeg"));
        assert_eq!(image_mime("C:\\Windows\\system.ini"), None);
        assert_eq!(image_mime("segredo.txt"), None);
        assert_eq!(image_mime("🚀"), None);
        assert_eq!(image_mime(""), None);
    }

    #[test]
    fn reconhece_enderecos_com_protocolo() {
        assert!(is_url("https://github.com"));
        assert!(is_url("HTTP://exemplo.com"));
        assert!(is_url("steam://rungameid/730"));
        assert!(is_url("spotify://"));
        assert!(!is_url("spotify:"));
        assert!(!is_url("C:\\Program Files\\App\\app.exe"));
        assert!(!is_url("C://x"));
    }

    #[test]
    fn limpa_aspas_e_espacos_do_caminho_colado() {
        assert_eq!(clean_target("  \"C:\\Users\\x\\Bambuzal.lnk\" "), "C:\\Users\\x\\Bambuzal.lnk");
        assert_eq!(clean_target("https://github.com"), "https://github.com");
        assert_eq!(clean_target(""), "");
    }

    #[test]
    fn expande_variaveis_de_ambiente() {
        unsafe { std::env::set_var("DOCKY_TESTE", "abc") };
        assert_eq!(clean_target("%DOCKY_TESTE%\\app.exe"), "abc\\app.exe");
        assert_eq!(clean_target("100%\\x"), "100%\\x");
        assert_eq!(clean_target("%NAO_EXISTE_XYZ%\\a"), "%NAO_EXISTE_XYZ%\\a");
    }

    fn item(id: &str, target: &str, group: bool, members: &[&str]) -> Shortcut {
        Shortcut { name: id.into(), target: target.into(), icon: String::new(), id: id.into(), group, members: members.iter().map(|m| m.to_string()).collect(), hidden: false }
    }

    #[test]
    fn um_grupo_abre_os_membros_na_ordem() {
        let list = vec![item("a", "\"C:\\a.exe\"", false, &[]), item("b", "https://b.dev", false, &[]), item("g", "", true, &["b", "a", "sumiu"])];
        assert_eq!(targets_of(&list, 2).unwrap(), ["https://b.dev", "C:\\a.exe"]);
        assert_eq!(targets_of(&list, 0).unwrap(), ["C:\\a.exe"]);
        assert!(targets_of(&list, 9).is_err());
    }

    #[test]
    fn grupo_vazio_e_atalho_sem_destino_dao_erro() {
        let list = vec![item("a", "", false, &[]), item("g", "", true, &["a"])];
        assert!(targets_of(&list, 0).is_err());
        assert!(targets_of(&list, 1).is_err());
    }

}
