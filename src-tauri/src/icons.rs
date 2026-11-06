//! Ícones automáticos dos atalhos. Um atalho novo sem ícone ganha o do app: Docky procura a imagem na internet uma vez
//! (a biblioteca aberta "dashboard-icons", via jsDelivr, e o favicon de sites), guarda na pasta de ícones e, se não
//! achar, usa o ícone que o próprio Windows mostra para o app. Nada é enviado além do nome do arquivo de imagem
//! pedido (o nome do app ou o endereço do site), e só quando a opção está ligada.
//!
//! O atalho guarda `asset:nome.png`, relativo à pasta de ícones: mudar a pasta de lugar não quebra nenhum atalho.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use tauri::{AppHandle, Manager, State};

use crate::config::{Config, ConfigState, Shortcut};

/// Como um atalho aponta para uma imagem da pasta de ícones.
pub const ASSET_PREFIX: &str = "asset:";

const DASHBOARD_ICONS: &str = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png";
const MAX_BYTES: usize = 1_500_000;
/// As imagens da biblioteca são grandes; um favicon menor que isto é o globo genérico ou fica borrado demais.
const MIN_FAVICON_WIDTH: u32 = 32;
const IMAGE_EXTENSIONS: [&str; 7] = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"];

#[cfg(windows)]
fn documents_dir() -> Option<PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_Documents, KF_FLAG_DEFAULT, SHGetKnownFolderPath};
    unsafe {
        let raw = SHGetKnownFolderPath(&FOLDERID_Documents, KF_FLAG_DEFAULT, None).ok()?;
        let text = raw.to_string().ok();
        CoTaskMemFree(Some(raw.0 as *const _));
        text.map(PathBuf::from)
    }
}

#[cfg(not(windows))]
fn documents_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Documents"))
}

/// A pasta de ícones de quem não escolheu outra: Documentos\Docky\icons.
pub fn default_icons_dir() -> PathBuf {
    documents_dir().or_else(|| std::env::var_os("USERPROFILE").map(|home| PathBuf::from(home).join("Documents"))).unwrap_or_default().join("Docky").join("icons")
}

pub fn icons_dir(config: &Config) -> PathBuf {
    let chosen = config.icons_folder.trim();
    if chosen.is_empty() { default_icons_dir() } else { PathBuf::from(chosen) }
}

/// Nome de arquivo aceito em `asset:`: só o nome (sem pasta), de uma imagem. Não deixa sair da pasta de ícones.
fn valid_asset_name(name: &str) -> bool {
    let Some((stem, extension)) = name.rsplit_once('.') else {
        return false;
    };
    !stem.is_empty()
        && name.len() <= 96
        && IMAGE_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_alphanumeric() || matches!(c, '.' | '-' | '_' | ' '))
        && !name.contains("..")
}

/// O arquivo de um ícone `asset:nome.png` dentro da pasta de ícones (ou `None` se não for um `asset:` válido).
pub fn resolve_asset(dir: &Path, icon: &str) -> Option<PathBuf> {
    let name = icon.trim().strip_prefix(ASSET_PREFIX)?;
    valid_asset_name(name).then(|| dir.join(name))
}

fn fold_accent(c: char) -> char {
    match c {
        'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
        'é' | 'è' | 'ê' | 'ë' => 'e',
        'í' | 'ì' | 'î' | 'ï' => 'i',
        'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
        'ú' | 'ù' | 'û' | 'ü' => 'u',
        'ç' => 'c',
        other => other,
    }
}

/// `Google Chrome` → `google-chrome`: minúsculas, sem acento, e o resto vira hífen.
pub fn slugify(text: &str) -> String {
    let mut out = String::new();
    for c in text.chars().flat_map(char::to_lowercase).map(fold_accent) {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    out.trim_end_matches('-').to_string()
}

/// Nomes que a biblioteca de ícones usa e que não saem direto do nome do atalho.
const NAME_ALIASES: [(&str, &str); 12] = [
    ("vs-code", "visual-studio-code"),
    ("vscode", "visual-studio-code"),
    ("code", "visual-studio-code"),
    ("chrome", "google-chrome"),
    ("edge", "microsoft-edge"),
    ("drive", "google-drive"),
    ("docs", "google-docs"),
    ("sheets", "google-sheets"),
    ("agenda", "google-calendar"),
    ("zap", "whatsapp"),
    ("terminal", "windows-terminal"),
    ("github-desktop", "github"),
];

/// Sites que ficam num subdomínio de outra empresa.
const HOST_ALIASES: [(&str, &str); 8] = [
    ("mail.google.com", "gmail"),
    ("drive.google.com", "google-drive"),
    ("docs.google.com", "google-docs"),
    ("sheets.google.com", "google-sheets"),
    ("calendar.google.com", "google-calendar"),
    ("web.whatsapp.com", "whatsapp"),
    ("open.spotify.com", "spotify"),
    ("music.youtube.com", "youtube-music"),
];

/// O endereço de um site (`https://www.exemplo.com/x` → `exemplo.com`), ou `None` se o destino não for um site.
fn host_of(target: &str) -> Option<String> {
    let lower = target.trim().to_ascii_lowercase();
    let rest = lower.strip_prefix("https://").or_else(|| lower.strip_prefix("http://"))?;
    let host = rest.split(['/', '?', '#', ':']).next()?.trim_start_matches("www.");
    (!host.is_empty() && host.contains('.')).then(|| host.to_string())
}

/// O nome da empresa de um site: o penúltimo pedaço, pulando `com.br`, `co.uk`…
fn host_label(host: &str) -> Option<String> {
    let labels: Vec<&str> = host.split('.').collect();
    let n = labels.len();
    if n < 2 {
        return None;
    }
    let generic = ["com", "net", "org", "gov", "edu", "co"];
    let label = if n >= 3 && generic.contains(&labels[n - 2]) { labels[n - 3] } else { labels[n - 2] };
    Some(slugify(label))
}

/// Do destino de um programa: `C:\…\Steam.lnk` → `steam`; `shell:AppsFolder\Pacote!Spotify` → `spotify`.
fn program_stem(target: &str) -> Option<String> {
    let target = target.trim();
    let stem = if target.to_ascii_lowercase().starts_with("shell:") {
        target.rsplit(['!', '\\']).next()?.to_string()
    } else {
        Path::new(target).file_stem()?.to_string_lossy().into_owned()
    };
    let slug = slugify(&stem);
    let generic = ["setup", "launcher", "app", "start", "run", "index", "main", "client", "application"];
    (!slug.is_empty() && !generic.contains(&slug.as_str())).then_some(slug)
}

/// Os nomes de imagem a tentar para um atalho, do mais provável ao menos.
pub fn icon_slugs(name: &str, target: &str) -> Vec<String> {
    let mut list: Vec<String> = Vec::new();
    let mut add = |slug: String| {
        if !slug.is_empty() && slug.len() <= 60 && !list.contains(&slug) {
            list.push(slug);
        }
    };
    let from_name = slugify(name);
    add(from_name.clone());
    if let Some((_, alias)) = NAME_ALIASES.iter().find(|(from, _)| *from == from_name) {
        add((*alias).to_string());
    }
    let host = host_of(target);
    if let Some(host) = &host {
        if let Some((_, alias)) = HOST_ALIASES.iter().find(|(from, _)| *from == host.as_str()) {
            add((*alias).to_string());
        }
    }
    if let Some(stem) = program_stem(target).filter(|_| host.is_none()) {
        add(stem);
    }
    if let Some(label) = host.as_deref().and_then(host_label) {
        add(label);
    }
    // "Google Chrome Beta" também é "google"; só vale para nomes com uma primeira palavra de verdade.
    if let Some(first) = from_name.split('-').next().filter(|w| w.len() >= 4 && *w != from_name) {
        add(first.to_string());
    }
    list
}

fn is_png(bytes: &[u8]) -> bool {
    bytes.len() > 64 && bytes[..8] == [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]
}

fn png_width(bytes: &[u8]) -> Option<u32> {
    is_png(bytes).then(|| u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]))
}

fn download(url: &str) -> Option<Vec<u8>> {
    let agent = ureq::Agent::new_with_config(ureq::Agent::config_builder().timeout_global(Some(Duration::from_secs(8))).build());
    let mut response = agent.get(url).header("User-Agent", "Docky/0.1").call().ok()?;
    response.body_mut().with_config().limit(MAX_BYTES as u64).read_to_vec().ok()
}

/// Grava `slug.png` na pasta de ícones (por um arquivo temporário, para nunca sobrar um arquivo pela metade).
fn save(dir: &Path, slug: &str, bytes: &[u8]) -> Option<String> {
    fs::create_dir_all(dir).ok()?;
    let name = format!("{slug}.png");
    let temporary = dir.join(format!(".{name}.part"));
    fs::write(&temporary, bytes).ok()?;
    fs::rename(&temporary, dir.join(&name)).ok()?;
    Some(format!("{ASSET_PREFIX}{name}"))
}

/// Acha (ou busca, ou extrai) o ícone de um atalho e devolve a referência `asset:nome.png`.
/// `fetch` baixa uma URL e `local` tira o ícone de um programa do Windows; entram de fora para dar para testar sem rede.
pub fn resolve_icon(dir: &Path, name: &str, target: &str, fetch: &dyn Fn(&str) -> Option<Vec<u8>>, local: &dyn Fn(&str) -> Option<Vec<u8>>) -> Option<String> {
    let slugs = icon_slugs(name, target);
    let primary = slugs.first()?;

    // 1. Já está na pasta (de uma busca anterior, ou posta lá pela pessoa): nada de rede.
    if let Some(slug) = slugs.iter().find(|s| dir.join(format!("{s}.png")).is_file()) {
        return Some(format!("{ASSET_PREFIX}{slug}.png"));
    }
    // 2. A biblioteca de ícones.
    for slug in &slugs {
        if let Some(bytes) = fetch(&format!("{DASHBOARD_ICONS}/{slug}.png")).filter(|b| png_width(b).is_some()) {
            if let Some(found) = save(dir, slug, &bytes) {
                return Some(found);
            }
        }
    }
    // 3. O favicon do site.
    if let Some(host) = host_of(target) {
        let url = format!("https://www.google.com/s2/favicons?domain={host}&sz=256");
        if let Some(bytes) = fetch(&url).filter(|b| png_width(b).is_some_and(|w| w >= MIN_FAVICON_WIDTH)) {
            return save(dir, primary, &bytes);
        }
        return None;
    }
    // 4. O ícone que o Windows mostra para o app instalado.
    local(target.trim()).filter(|b| is_png(b)).and_then(|bytes| save(dir, primary, &bytes))
}

/// O caminho sem diferença de maiúsculas, barras ou barra final, para comparar pastas.
fn same_folder(a: &Path, b: &Path) -> bool {
    let norm = |p: &Path| p.display().to_string().replace('/', "\\").trim_end_matches('\\').to_lowercase();
    norm(a) == norm(b)
}

/// Faz os ícones apontarem para a pasta de ícones por `asset:nome`, que não quebra quando a pasta muda de lugar:
/// vale para o ícone cujo arquivo sumiu (a pasta foi movida) e se uma imagem com o mesmo nome está na pasta de ícones,
/// e para o que já aponta por caminho para um arquivo dentro dela. Quem aponta para outro lugar, ou não acha a imagem,
/// fica como está. Devolve quantos refez.
pub fn relink(config: &mut Config, dir: &Path) -> usize {
    let fix = |icon: &mut String| -> bool {
        let value = icon.trim();
        let path = Path::new(value);
        let looks_like_image = path.extension().and_then(|e| e.to_str()).is_some_and(|e| IMAGE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()));
        if value.is_empty() || value.starts_with(ASSET_PREFIX) || !looks_like_image {
            return false;
        }
        // Um arquivo que existe em outro lugar é uma escolha da pessoa: não mexe.
        if path.exists() && !path.parent().is_some_and(|parent| same_folder(parent, dir)) {
            return false;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()).map(str::to_string) else {
            return false;
        };
        if valid_asset_name(&name) && dir.join(&name).is_file() {
            *icon = format!("{ASSET_PREFIX}{name}");
            true
        } else {
            false
        }
    };
    let mut fixed = 0;
    for shortcut in &mut config.shortcuts {
        fixed += usize::from(fix(&mut shortcut.icon));
    }
    for folder in &mut config.shelf_folders {
        fixed += usize::from(fix(&mut folder.icon));
    }
    fixed
}

fn relink_missing(app: &AppHandle) {
    let state = app.state::<ConfigState>();
    let config = state.get();
    let dir = icons_dir(&config);
    if relink(&mut config.clone(), &dir) > 0 {
        let _ = state.modify(app, |c| {
            relink(c, &dir);
        });
    }
}

fn attempted() -> &'static Mutex<HashSet<String>> {
    static ATTEMPTED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    ATTEMPTED.get_or_init(|| Mutex::new(HashSet::new()))
}

fn attempt_key(shortcut: &Shortcut) -> String {
    format!("{}\u{1}{}", shortcut.name.trim(), shortcut.target.trim())
}

/// Atalho que ainda pede um ícone: um destino de verdade (não grupo) e nenhum ícone escolhido.
fn needs_icon(shortcut: &Shortcut) -> bool {
    !shortcut.group && shortcut.icon.trim().is_empty() && !shortcut.target.trim().is_empty()
}

/// Busca o ícone dos atalhos que não têm e grava na configuração. Cada atalho é tentado uma vez por execução do Docky
/// (ou até mudar de nome ou destino), para uma imagem que não existe não ser procurada de novo a cada mudança.
/// Devolve quantos ganharam ícone. `force` ignora a opção desligada e tenta de novo os que falharam.
fn fill_missing(app: &AppHandle, force: bool) -> usize {
    let state = app.state::<ConfigState>();
    if force {
        attempted().lock().unwrap().clear();
    }
    let mut assigned = 0;
    loop {
        let config = state.get();
        if !config.auto_icons && !force {
            break;
        }
        let next = config.shortcuts.iter().find(|s| needs_icon(s) && !attempted().lock().unwrap().contains(&attempt_key(s))).cloned();
        let Some(shortcut) = next else {
            break;
        };
        attempted().lock().unwrap().insert(attempt_key(&shortcut));
        let dir = icons_dir(&config);
        let Some(icon) = resolve_icon(&dir, &shortcut.name, &shortcut.target, &download, &|target| crate::shell_icon::icon_png(target, 256)) else {
            continue;
        };
        // Relê a configuração na hora de gravar: só preenche se o atalho continua igual e sem ícone.
        let mut applied = false;
        let _ = state.modify(app, |c| {
            if let Some(current) = c.shortcuts.iter_mut().find(|s| s.id == shortcut.id && s.target == shortcut.target && s.icon.trim().is_empty()) {
                current.icon = icon.clone();
                applied = true;
            }
        });
        if applied {
            assigned += 1;
        }
    }
    assigned
}

/// Pede, em segundo plano, o ícone dos atalhos que não têm (chamado a cada mudança da configuração e ao iniciar).
pub fn schedule(app: &AppHandle) {
    static RUNNING: AtomicBool = AtomicBool::new(false);
    static AGAIN: AtomicBool = AtomicBool::new(false);
    if RUNNING.swap(true, Ordering::SeqCst) {
        AGAIN.store(true, Ordering::SeqCst);
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        loop {
            AGAIN.store(false, Ordering::SeqCst);
            relink_missing(&app);
            fill_missing(&app, false);
            if !AGAIN.load(Ordering::SeqCst) {
                break;
            }
        }
        RUNNING.store(false, Ordering::SeqCst);
    });
}

/// A pasta de ícones em uso (criada se ainda não existir), para mostrar nas configurações.
#[tauri::command]
pub fn icons_folder(state: State<ConfigState>) -> Result<String, String> {
    let dir = icons_dir(&state.get());
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.display().to_string())
}

/// Copia as imagens da pasta antiga para a nova (sem sobrescrever o que já existe lá). Devolve quantas copiou.
fn copy_icons(old: &Path, new: &Path) -> Result<usize, String> {
    let Ok(entries) = fs::read_dir(old) else {
        return Ok(0);
    };
    let mut copied = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let is_image = path.extension().and_then(|e| e.to_str()).is_some_and(|e| IMAGE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()));
        let Some(file_name) = path.file_name() else {
            continue;
        };
        let target = new.join(file_name);
        if path.is_file() && is_image && !target.exists() {
            fs::copy(&path, &target).map_err(|e| e.to_string())?;
            copied += 1;
        }
    }
    Ok(copied)
}

/// Troca a pasta de ícones: leva as imagens da pasta antiga para a nova e passa a usar a nova. Como os atalhos guardam
/// `asset:nome.png`, eles seguem a pasta sozinhos.
#[tauri::command]
pub fn set_icons_folder(app: AppHandle, state: State<ConfigState>, path: String) -> Result<usize, String> {
    let chosen = path.trim();
    if chosen.is_empty() {
        return Err("escolha uma pasta".into());
    }
    let new = PathBuf::from(chosen);
    fs::create_dir_all(&new).map_err(|e| format!("não consegui criar a pasta: {e}"))?;
    let old = icons_dir(&state.get());
    let copied = if old == new { 0 } else { copy_icons(&old, &new)? };
    state.modify(&app, |c| c.icons_folder = new.display().to_string())?;
    // Os ícones que apontavam para a pasta antiga (por caminho) e agora estão na nova passam a apontar para ela.
    schedule(&app);
    Ok(copied)
}

#[tauri::command]
pub fn open_icons_folder(state: State<ConfigState>) -> Result<(), String> {
    let dir = icons_dir(&state.get());
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(dir.display().to_string(), None::<&str>).map_err(|e| e.to_string())
}

/// Procura agora o ícone de todos os atalhos que estão sem (botão das configurações). Devolve quantos ganharam.
#[tauri::command]
pub async fn fetch_missing_icons(app: AppHandle) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || fill_missing(&app, true)).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Um PNG de verdade o bastante para as checagens (assinatura, comprimento e largura no cabeçalho).
    fn fake_png(width: u32) -> Vec<u8> {
        let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, b'I', b'H', b'D', b'R'];
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&[0; 60]);
        bytes
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("docky-icons-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn slug_sem_acento_e_com_hifen() {
        assert_eq!(slugify("Google Chrome"), "google-chrome");
        assert_eq!(slugify("  Calendário (pessoal)! "), "calendario-pessoal");
        assert_eq!(slugify("VS Code"), "vs-code");
        assert_eq!(slugify("???"), "");
    }

    #[test]
    fn nomes_a_tentar_para_apps_sites_e_apps_da_loja() {
        assert_eq!(icon_slugs("Blender", "C:\\Program Files\\Blender\\blender-launcher.exe")[0], "blender");
        assert_eq!(icon_slugs("VS Code", "C:\\x\\Code.lnk"), ["vs-code", "visual-studio-code", "code"]);
        assert_eq!(icon_slugs("Spotify", "shell:AppsFolder\\SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"), ["spotify"]);
        assert_eq!(icon_slugs("Meu email", "https://mail.google.com/mail/u/0"), ["meu-email", "gmail", "google"]);
        assert_eq!(icon_slugs("Painel", "https://meutime.slack.com"), ["painel", "slack"]);
        assert_eq!(icon_slugs("Loja", "https://www.loja.com.br/x"), ["loja"]);
        assert!(icon_slugs("", "").is_empty());
    }

    #[test]
    fn so_aceita_asset_de_dentro_da_pasta() {
        let dir = Path::new("C:\\icones");
        assert_eq!(resolve_asset(dir, "asset:blender.png"), Some(dir.join("blender.png")));
        assert_eq!(resolve_asset(dir, " asset:Meu Logo.svg "), Some(dir.join("Meu Logo.svg")));
        assert_eq!(resolve_asset(dir, "asset:..\\segredo.png"), None);
        assert_eq!(resolve_asset(dir, "asset:../segredo.png"), None);
        assert_eq!(resolve_asset(dir, "asset:C:\\x.png"), None);
        assert_eq!(resolve_asset(dir, "asset:nota.txt"), None);
        assert_eq!(resolve_asset(dir, "asset:.oculto.png"), None);
        assert_eq!(resolve_asset(dir, "C:\\icones\\blender.png"), None);
    }

    #[test]
    fn usa_o_que_ja_esta_na_pasta_sem_ir_a_internet() {
        let dir = temp_dir("existe");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("blender.png"), fake_png(256)).unwrap();
        let never = |_: &str| -> Option<Vec<u8>> { panic!("não era para usar a rede") };
        let found = resolve_icon(&dir, "Blender", "C:\\b\\blender.exe", &never, &never);
        assert_eq!(found.as_deref(), Some("asset:blender.png"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn baixa_da_biblioteca_e_guarda_para_a_proxima_vez() {
        let dir = temp_dir("baixa");
        let fetch = |url: &str| (url.ends_with("/png/blender.png")).then(|| fake_png(512));
        let none = |_: &str| None;
        assert_eq!(resolve_icon(&dir, "Blender", "C:\\b\\blender.exe", &fetch, &none).as_deref(), Some("asset:blender.png"));
        assert!(dir.join("blender.png").is_file());
        // Segunda vez: já está na pasta, a rede nem é consultada.
        let never = |_: &str| -> Option<Vec<u8>> { panic!("não era para usar a rede") };
        assert_eq!(resolve_icon(&dir, "Blender", "C:\\b\\blender.exe", &never, &none).as_deref(), Some("asset:blender.png"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn site_sem_imagem_na_biblioteca_usa_o_favicon_e_ignora_o_globo_pequeno() {
        let dir = temp_dir("favicon");
        let none = |_: &str| None;
        let only_favicon = |url: &str| url.contains("s2/favicons").then(|| fake_png(192));
        assert_eq!(resolve_icon(&dir, "Meu site", "https://meusite.com.br", &only_favicon, &none).as_deref(), Some("asset:meu-site.png"));
        let _ = fs::remove_dir_all(&dir);

        let dir = temp_dir("globo");
        let globe = |url: &str| url.contains("s2/favicons").then(|| fake_png(16));
        assert_eq!(resolve_icon(&dir, "Meu site", "https://meusite.com.br", &globe, &none), None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn app_sem_imagem_na_internet_usa_o_icone_do_windows() {
        let dir = temp_dir("local");
        let none = |_: &str| None;
        let local = |target: &str| (target == "C:\\x\\raro.exe").then(|| fake_png(256));
        assert_eq!(resolve_icon(&dir, "Raro", "C:\\x\\raro.exe", &none, &local).as_deref(), Some("asset:raro.png"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refaz_o_caminho_do_icone_cuja_pasta_foi_movida() {
        let dir = temp_dir("relink");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("slack.png"), fake_png(256)).unwrap();
        let mut config = Config::default();
        let make = |icon: &str| Shortcut { name: "A".into(), target: "x".into(), icon: icon.into(), id: "a".into(), group: false, members: vec![], hidden: false };
        config.shortcuts = vec![make("C:\\Antiga\\Pasta\\slack.png"), make("C:\\Antiga\\Pasta\\sumiu.png"), make("lib:bolt"), make("asset:slack.png"), make("🚀")];
        assert_eq!(relink(&mut config, &dir), 1);
        let icons: Vec<&str> = config.shortcuts.iter().map(|s| s.icon.as_str()).collect();
        assert_eq!(icons, ["asset:slack.png", "C:\\Antiga\\Pasta\\sumiu.png", "lib:bolt", "asset:slack.png", "🚀"]);

        // Um arquivo que existe dentro da pasta de ícones também vira asset:; um que existe em outro lugar não.
        let elsewhere = temp_dir("relink-fora");
        fs::create_dir_all(&elsewhere).unwrap();
        fs::write(elsewhere.join("slack.png"), fake_png(256)).unwrap();
        config.shortcuts = vec![make(&dir.join("slack.png").display().to_string()), make(&elsewhere.join("slack.png").display().to_string())];
        assert_eq!(relink(&mut config, &dir), 1);
        assert_eq!(config.shortcuts[0].icon, "asset:slack.png");
        assert_eq!(config.shortcuts[1].icon, elsewhere.join("slack.png").display().to_string());
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&elsewhere);
    }

    #[test]
    fn so_pede_icone_quem_tem_destino_e_nao_tem_icone() {
        let mut shortcut = Shortcut { name: "A".into(), target: "x".into(), icon: String::new(), id: "a".into(), group: false, members: vec![], hidden: false };
        assert!(needs_icon(&shortcut));
        shortcut.icon = "lib:bolt".into();
        assert!(!needs_icon(&shortcut));
        shortcut.icon.clear();
        shortcut.group = true;
        assert!(!needs_icon(&shortcut));
    }
}
