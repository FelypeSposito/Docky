//! Sugestões de atalhos: os apps instalados (os atalhos do Menu Iniciar e da Área de Trabalho) ordenados pelos que
//! você mais usa. Os sinais de uso, todos locais (nada sai do computador): o histórico que o Windows guarda para o
//! seu usuário (UserAssist, que pode estar vazio), os apps fixados na barra de tarefas e os que estão abertos agora.

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppEntry {
    /// O nome como aparece no Menu Iniciar ("Spotify").
    pub name: String,
    /// O atalho `.lnk` do Menu Iniciar: abre o app exatamente como o Menu Iniciar abriria.
    pub target: String,
    /// Quantas vezes o Windows contou que você abriu o app (0 se não houver registro).
    pub uses: u32,
    /// Está fixado na barra de tarefas.
    pub pinned: bool,
    /// Está aberto agora.
    pub running: bool,
    /// De onde veio: `app` (Menu Iniciar e Loja), `steam` ou `epic` (jogos instalados).
    pub kind: String,
    /// Um arquivo local de onde o ícone do atalho pode sair (imagem `.jpg/.png/.ico` ou um programa `.exe`).
    pub icon: Option<String>,
}

/// O tipo dos apps do Menu Iniciar e da Loja.
const KIND_APP: &str = "app";

impl AppEntry {
    /// O peso na ordenação: o histórico conta por abertura; fixado e aberto agora pesam bastante.
    pub fn score(&self) -> u32 {
        self.uses.min(100_000) + if self.pinned { 1_000 } else { 0 } + if self.running { 500 } else { 0 }
    }
}

/// Minúsculas e só letras e números: "Spotify.exe" e "spotify" ficam iguais.
pub fn normalize(text: &str) -> String {
    text.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect()
}

/// O nome que o Windows grava no histórico vem em ROT13.
pub fn rot13(text: &str) -> String {
    text.chars()
        .map(|c| match c {
            'a'..='z' => (((c as u8 - b'a') + 13) % 26 + b'a') as char,
            'A'..='Z' => (((c as u8 - b'A') + 13) % 26 + b'A') as char,
            other => other,
        })
        .collect()
}

/// O nome do programa num registro do histórico: `{GUID}\Spotify\Spotify.exe` → `spotify`; ids de apps da Loja
/// (`Microsoft.WindowsCalculator_…!App`) e atalhos `.lnk` também. `None` se não houver nome aproveitável.
pub fn program_of(entry: &str) -> Option<String> {
    let last = entry.rsplit(['\\', '/', '!']).next()?;
    let stem = last.rsplit_once('.').map_or(last, |(stem, ext)| if ext.len() <= 4 { stem } else { last });
    let key = normalize(stem);
    (key.len() >= 2).then_some(key)
}

/// Quantas vezes o app foi aberto: procura o nome dele entre os programas do histórico (igual, ou um contido no outro).
pub fn usage_for(name: &str, usage: &HashMap<String, u32>) -> u32 {
    let key = normalize(name);
    if key.is_empty() {
        return 0;
    }
    if let Some(count) = usage.get(&key) {
        return *count;
    }
    usage
        .iter()
        .filter(|(program, _)| program.len() >= 4 && key.len() >= 4 && (program.contains(&key) || key.contains(program.as_str())))
        .map(|(_, count)| *count)
        .max()
        .unwrap_or(0)
}

/// O programa para onde um atalho `.lnk` aponta (`C:\\Program Files\\Spotify\\Spotify.exe`), lendo só o que o formato
/// guarda no bloco LinkInfo. `None` para atalhos sem caminho local (apps da Loja, itens do shell).
pub fn lnk_target(bytes: &[u8]) -> Option<String> {
    let u32_at = |at: usize| bytes.get(at..at + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize);
    if u32_at(0)? != 0x4C {
        return None;
    }
    let flags = u32_at(0x14)?;
    let mut at = 0x4C;
    if flags & 0b01 != 0 {
        // HasLinkTargetIDList: um tamanho de 16 bits e a lista, que não interessa aqui.
        let size = bytes.get(at..at + 2).map(|b| u16::from_le_bytes([b[0], b[1]]) as usize)?;
        at += 2 + size;
    }
    if flags & 0b10 == 0 {
        return None; // sem LinkInfo
    }
    let info = at;
    if u32_at(info + 8)? & 1 == 0 {
        return None; // sem caminho local
    }
    let read = |offset: usize| -> Option<String> {
        let start = info + offset;
        let end = bytes.get(start..)?.iter().position(|b| *b == 0)? + start;
        Some(String::from_utf8_lossy(&bytes[start..end]).into_owned())
    };
    let base = read(u32_at(info + 16)?)?;
    let suffix = u32_at(info + 24).filter(|offset| *offset > 0).and_then(read).unwrap_or_default();
    let path = format!("{base}{suffix}");
    (!path.is_empty()).then_some(path)
}

/// As linhas "Nome<TAB>AppID" que o Windows lista para o Menu Iniciar (`Get-StartApps`). Fica só com o que abre um app
/// (sai quem aponta para um site) e com o nome limpo.
pub fn parse_start_apps(text: &str) -> Vec<(String, String)> {
    text.lines()
        .filter_map(|line| {
            let (name, id) = line.split_once('\t')?;
            let (name, id) = (name.trim(), id.trim());
            let is_web = id.contains("://") || id.starts_with("http");
            (!name.is_empty() && !id.is_empty() && !is_web && !is_noise(name)).then(|| (name.to_string(), id.to_string()))
        })
        .collect()
}

/// Todos os apps que o Windows mostra no Menu Iniciar, inclusive os da Loja da Microsoft (Spotify, WhatsApp, Claude…),
/// que não têm atalho `.lnk`. Abrem por `shell:AppsFolder\<AppID>`.
#[cfg(windows)]
fn windows_start_apps() -> Vec<(String, String)> {
    use std::os::windows::process::CommandExt;

    const NO_WINDOW: u32 = 0x0800_0000;
    let script = "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); Get-StartApps | ForEach-Object { $_.Name + [char]9 + $_.AppID }";
    let output = std::process::Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", script]).creation_flags(NO_WINDOW).output();
    match output {
        Ok(out) if out.status.success() => parse_start_apps(&String::from_utf8_lossy(&out.stdout)),
        _ => Vec::new(),
    }
}

#[cfg(not(windows))]
fn windows_start_apps() -> Vec<(String, String)> {
    Vec::new()
}

/// Atalhos do Menu Iniciar que não são o app em si.
fn is_noise(name: &str) -> bool {
    let lower = name.to_lowercase();
    ["uninstall", "desinstal", "readme", "léame", "license", "licen", "help", "ajuda", "manual", "documentation", "release notes", "website", "support"]
        .iter()
        .any(|bad| lower.contains(bad))
}

fn collect_links(dir: &Path, depth: u32, out: &mut Vec<(String, PathBuf)>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if depth < 3 {
                collect_links(&path, depth + 1, out);
            }
        } else if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("lnk")) {
            if let Some(name) = path.file_stem().map(|s| s.to_string_lossy().into_owned()) {
                if !is_noise(&name) {
                    out.push((name, path));
                }
            }
        }
    }
}

/// Os apps do Menu Iniciar (de todos os usuários e do seu) e os atalhos da Área de Trabalho, sem repetir o nome.
fn start_menu_apps() -> Vec<(String, PathBuf)> {
    let mut found = Vec::new();
    for variable in ["ProgramData", "APPDATA"] {
        if let Some(base) = std::env::var_os(variable) {
            collect_links(&PathBuf::from(base).join(r"Microsoft\Windows\Start Menu\Programs"), 0, &mut found);
        }
    }
    // Jogos e apps portáteis costumam ter atalho só na Área de Trabalho (que pode estar no OneDrive).
    let home = std::env::var_os("USERPROFILE").map(PathBuf::from);
    let desktops = [
        home.as_ref().map(|h| h.join("Desktop")),
        home.as_ref().map(|h| h.join("OneDrive").join("Desktop")),
        home.as_ref().map(|h| h.join("OneDrive").join("Área de Trabalho")),
        std::env::var_os("PUBLIC").map(|p| PathBuf::from(p).join("Desktop")),
    ];
    for desktop in desktops.into_iter().flatten() {
        collect_links(&desktop, 3, &mut found); // profundidade 3: só a própria pasta, sem descer nas outras
    }
    let mut seen = std::collections::HashSet::new();
    found.retain(|(name, _)| seen.insert(normalize(name)));
    found
}

#[cfg(windows)]
fn usage_history() -> HashMap<String, u32> {
    use windows::{
        Win32::{
            Foundation::ERROR_SUCCESS,
            System::Registry::{HKEY, HKEY_CURRENT_USER, KEY_READ, RegCloseKey, RegEnumValueW, RegOpenKeyExW},
        },
        core::{PCWSTR, PWSTR},
    };

    let mut usage: HashMap<String, u32> = HashMap::new();
    // Programas (.exe) e atalhos (.lnk) abertos.
    for guid in ["{CEBFF5CD-ACE2-4F4F-9178-9926F41749EA}", "{F4E57C4B-2036-45F0-A9AB-443BCFE33D9F}"] {
        let path: Vec<u16> = format!(r"Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist\{guid}\Count").encode_utf16().chain([0]).collect();
        let mut key = HKEY::default();
        if unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, PCWSTR(path.as_ptr()), None, KEY_READ, &mut key) } != ERROR_SUCCESS {
            continue;
        }
        for index in 0u32.. {
            let mut name = [0u16; 1024];
            let mut name_len = name.len() as u32;
            let mut data = [0u8; 128];
            let mut data_len = data.len() as u32;
            let status = unsafe {
                RegEnumValueW(key, index, Some(PWSTR(name.as_mut_ptr())), &mut name_len, None, None, Some(data.as_mut_ptr()), Some(&mut data_len))
            };
            if status != ERROR_SUCCESS {
                break;
            }
            // O registro tem 72 bytes; as execuções ficam no 2º número de 32 bits.
            if data_len < 8 {
                continue;
            }
            let Some(program) = program_of(&rot13(&String::from_utf16_lossy(&name[..name_len as usize]))) else { continue };
            let runs = u32::from_le_bytes([data[4], data[5], data[6], data[7]]);
            *usage.entry(program).or_insert(0) += runs;
        }
        unsafe {
            let _ = RegCloseKey(key);
        }
    }
    usage
}

#[cfg(not(windows))]
fn usage_history() -> HashMap<String, u32> {
    HashMap::new()
}

/// Os nomes (só letras e números) dos atalhos fixados na barra de tarefas.
fn pinned_names() -> std::collections::HashSet<String> {
    let mut links = Vec::new();
    if let Some(appdata) = std::env::var_os("APPDATA") {
        collect_links(&PathBuf::from(appdata).join(r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"), 3, &mut links);
    }
    links.into_iter().map(|(name, _)| normalize(&name)).collect()
}

/// Os nomes (só letras e números) dos programas abertos agora, fora os do próprio Windows.
fn running_programs() -> std::collections::HashSet<String> {
    use sysinfo::{ProcessesToUpdate, System};
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);
    system
        .processes()
        .values()
        .filter(|p| p.exe().is_some_and(|exe| !exe.to_string_lossy().to_lowercase().contains(r"\windows\")))
        .filter_map(|p| program_of(&p.name().to_string_lossy()))
        .collect()
}

/// As strings entre aspas de uma linha do formato de texto da Valve (KeyValues), já sem os escapes (`\\` e `\"`).
fn quoted_strings(line: &str) -> Vec<String> {
    let mut found = Vec::new();
    let mut chars = line.chars();
    while let Some(c) = chars.next() {
        if c != '"' {
            continue;
        }
        let mut text = String::new();
        while let Some(c) = chars.next() {
            match c {
                '"' => break,
                '\\' => match chars.next() {
                    Some(escaped @ ('\\' | '"')) => text.push(escaped),
                    Some(other) => {
                        text.push('\\');
                        text.push(other);
                    }
                    None => text.push('\\'),
                },
                other => text.push(other),
            }
        }
        found.push(text);
    }
    found
}

/// Os pares chave/valor de um arquivo `.vdf`/`.acf` da Steam, com a profundidade de cada um (1 = dentro do bloco de
/// fora). Uma linha com duas strings é um par; `{` e `}` sozinhos abrem e fecham blocos.
pub fn vdf_pairs(text: &str) -> Vec<(usize, String, String)> {
    let mut depth = 0usize;
    let mut pairs = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('{') {
            depth += 1;
            continue;
        }
        if trimmed.starts_with('}') {
            depth = depth.saturating_sub(1);
            continue;
        }
        let mut strings = quoted_strings(trimmed).into_iter();
        if let (Some(key), Some(value)) = (strings.next(), strings.next()) {
            pairs.push((depth, key, value));
        }
    }
    pairs
}

/// As pastas de biblioteca da Steam listadas no `libraryfolders.vdf`.
pub fn steam_library_paths(text: &str) -> Vec<PathBuf> {
    vdf_pairs(text).into_iter().filter(|(_, key, _)| key.eq_ignore_ascii_case("path")).map(|(_, _, value)| PathBuf::from(value)).collect()
}

/// Um jogo instalado pela Steam, lido do `appmanifest_<appid>.acf`.
#[derive(Debug, Clone, PartialEq)]
pub struct SteamGame {
    pub appid: String,
    pub name: String,
    /// Quando foi jogado pela última vez (segundos Unix; 0 se nunca).
    pub last_played: u64,
}

/// Lê o `appid`, o `name` e o `LastPlayed` de um `appmanifest_<appid>.acf` (só os do bloco de fora).
pub fn parse_app_manifest(text: &str) -> Option<SteamGame> {
    let (mut appid, mut name, mut last_played) = (None, None, 0);
    for (depth, key, value) in vdf_pairs(text) {
        if depth != 1 {
            continue;
        }
        match key.to_ascii_lowercase().as_str() {
            "appid" if appid.is_none() => appid = Some(value),
            "name" if name.is_none() => name = Some(value),
            "lastplayed" => last_played = value.trim().parse().unwrap_or(0),
            _ => {}
        }
    }
    let (appid, name) = (appid?.trim().to_string(), name?.trim().to_string());
    (!appid.is_empty() && !name.is_empty()).then_some(SteamGame { appid, name, last_played })
}

/// Ferramentas e bibliotecas que a Steam instala junto e que não são jogos.
pub fn is_steam_tool(appid: &str, name: &str) -> bool {
    let lower = name.to_lowercase();
    appid == "228980" || ["redistributable", "steamworks", "proton", "steam linux runtime"].iter().any(|bad| lower.contains(bad))
}

/// Nome de arquivo que é um hash SHA-1 (40 dígitos hexadecimais): o ícone quadrado no cache novo da Steam.
fn is_sha1_stem(stem: &str) -> bool {
    stem.len() == 40 && stem.chars().all(|c| c.is_ascii_hexdigit())
}

/// A melhor imagem do jogo no cache da Steam (`appcache\librarycache`): o ícone quadrado, depois o logo, por último
/// a capa larga. Vale o cache novo (uma pasta por jogo) e o antigo (`<appid>_icon.jpg` soltos).
pub fn steam_icon(cache: &Path, appid: &str) -> Option<PathBuf> {
    let folder = cache.join(appid);
    let square = fs::read_dir(&folder).ok().and_then(|entries| {
        let mut found: Vec<PathBuf> = entries
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| {
                path.is_file()
                    && path.extension().is_some_and(|e| e.eq_ignore_ascii_case("jpg"))
                    && path.file_stem().and_then(|s| s.to_str()).is_some_and(is_sha1_stem)
            })
            .collect();
        found.sort();
        found.into_iter().next()
    });
    square
        .into_iter()
        .chain([cache.join(format!("{appid}_icon.jpg")), folder.join("logo.png"), folder.join("header.jpg"), cache.join(format!("{appid}_header.jpg"))])
        .find(|path| path.is_file())
}

/// Os jogos de uma instalação da Steam, dos jogados há menos tempo para os mais antigos.
fn steam_games_in(steam: &Path) -> Vec<AppEntry> {
    let mut libraries = vec![steam.to_path_buf()];
    if let Ok(text) = fs::read_to_string(steam.join("steamapps").join("libraryfolders.vdf")) {
        libraries.extend(steam_library_paths(&text));
    }
    let mut seen_libraries = std::collections::HashSet::new();
    libraries.retain(|path| seen_libraries.insert(path.to_string_lossy().replace('/', "\\").trim_end_matches('\\').to_lowercase()));

    let mut games: Vec<SteamGame> = Vec::new();
    for library in libraries {
        let Ok(entries) = fs::read_dir(library.join("steamapps")) else { continue };
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_lowercase();
            if !(file_name.starts_with("appmanifest_") && file_name.ends_with(".acf")) {
                continue;
            }
            let Some(game) = fs::read_to_string(entry.path()).ok().and_then(|text| parse_app_manifest(&text)) else { continue };
            if !is_steam_tool(&game.appid, &game.name) && !games.iter().any(|g| g.appid == game.appid) {
                games.push(game);
            }
        }
    }
    games.sort_by(|a, b| b.last_played.cmp(&a.last_played).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    let cache = steam.join("appcache").join("librarycache");
    games
        .into_iter()
        .map(|game| AppEntry {
            icon: steam_icon(&cache, &game.appid).map(|path| path.to_string_lossy().into_owned()),
            target: format!("steam://rungameid/{}", game.appid),
            name: game.name,
            uses: 0,
            pinned: false,
            running: false,
            kind: "steam".to_string(),
        })
        .collect()
}

/// A pasta da Steam: a que ela grava no registro (`SteamPath`, com barras `/`), ou a pasta padrão.
#[cfg(windows)]
fn steam_dir() -> Option<PathBuf> {
    use windows::{
        Win32::{
            Foundation::ERROR_SUCCESS,
            System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_SZ, RegGetValueW},
        },
        core::w,
    };

    let mut buffer = [0u16; 1024];
    let mut size = (buffer.len() * 2) as u32;
    let status = unsafe { RegGetValueW(HKEY_CURRENT_USER, w!(r"Software\Valve\Steam"), w!("SteamPath"), RRF_RT_REG_SZ, None, Some(buffer.as_mut_ptr().cast()), Some(&mut size)) };
    let from_registry = (status == ERROR_SUCCESS)
        .then(|| {
            let end = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
            PathBuf::from(String::from_utf16_lossy(&buffer[..end]).trim().replace('/', "\\"))
        })
        .filter(|path| path.is_dir());
    let default = std::env::var_os("ProgramFiles(x86)").map_or_else(|| PathBuf::from(r"C:\Program Files (x86)"), PathBuf::from).join("Steam");
    from_registry.or_else(|| default.is_dir().then_some(default))
}

#[cfg(not(windows))]
fn steam_dir() -> Option<PathBuf> {
    None
}

/// Os jogos instalados pela Steam nesta máquina.
fn steam_games() -> Vec<AppEntry> {
    steam_dir().map(|steam| steam_games_in(&steam)).unwrap_or_default()
}

/// Um jogo instalado pela Epic Games, lido de um manifesto `.item`.
#[derive(Debug, Clone, PartialEq)]
pub struct EpicGame {
    pub name: String,
    pub target: String,
    /// O programa do jogo (`InstallLocation` + `LaunchExecutable`), se o manifesto diz qual é. Pode não existir.
    pub executable: Option<PathBuf>,
}

/// Lê um manifesto `.item` da Epic. Fica só com jogos (categoria `games`); complementos (`addons`) só entram se
/// abrem sozinhos (`addons/launchable`, como o Fortnite Reload).
pub fn parse_epic_manifest(text: &str) -> Option<EpicGame> {
    let json: serde_json::Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    let field = |key: &str| json.get(key).and_then(|v| v.as_str()).map(str::trim).unwrap_or_default().to_string();
    let categories: Vec<String> = json.get("AppCategories").and_then(|v| v.as_array()).into_iter().flatten().filter_map(|v| v.as_str()).map(str::to_lowercase).collect();
    let has = |category: &str| categories.iter().any(|c| c == category);
    let is_addon = categories.iter().any(|c| c == "addons" || c.starts_with("addons/"));
    if !has("games") || (is_addon && !has("addons/launchable")) {
        return None;
    }
    let name = field("DisplayName").replace(['®', '™'], "").trim().to_string();
    let app = field("AppName");
    if name.is_empty() || app.is_empty() {
        return None;
    }
    let (namespace, item) = (field("CatalogNamespace"), field("CatalogItemId"));
    let target = if namespace.is_empty() || item.is_empty() {
        format!("com.epicgames.launcher://apps/{app}?action=launch&silent=true")
    } else {
        format!("com.epicgames.launcher://apps/{namespace}%3A{item}%3A{app}?action=launch&silent=true")
    };
    let (location, launch) = (field("InstallLocation"), field("LaunchExecutable"));
    let executable = (!location.is_empty() && !launch.is_empty()).then(|| launch.split(['/', '\\']).filter(|part| !part.is_empty()).fold(PathBuf::from(&location), |path, part| path.join(part)));
    Some(EpicGame { name, target, executable })
}

/// Os jogos dos manifestos da Epic numa pasta, sem repetir o nome, em ordem alfabética.
fn epic_games_in(manifests: &Path) -> Vec<AppEntry> {
    let Ok(entries) = fs::read_dir(manifests) else { return Vec::new() };
    let mut paths: Vec<PathBuf> = entries.flatten().map(|e| e.path()).filter(|p| p.is_file() && p.extension().is_some_and(|e| e.eq_ignore_ascii_case("item"))).collect();
    paths.sort();
    let mut games: Vec<EpicGame> = Vec::new();
    for path in paths {
        let Some(game) = fs::read_to_string(&path).ok().and_then(|text| parse_epic_manifest(&text)) else { continue };
        if !games.iter().any(|g| normalize(&g.name) == normalize(&game.name)) {
            games.push(game);
        }
    }
    games.sort_by_key(|g| g.name.to_lowercase());
    games
        .into_iter()
        .map(|game| AppEntry {
            icon: game.executable.filter(|exe| exe.is_file()).map(|exe| exe.to_string_lossy().into_owned()),
            target: game.target,
            name: game.name,
            uses: 0,
            pinned: false,
            running: false,
            kind: "epic".to_string(),
        })
        .collect()
}

/// Os jogos instalados pela Epic Games nesta máquina (`%ProgramData%\Epic\EpicGamesLauncher\Data\Manifests`).
fn epic_games() -> Vec<AppEntry> {
    let data = std::env::var_os("ProgramData").map_or_else(|| PathBuf::from(r"C:\ProgramData"), PathBuf::from);
    epic_games_in(&data.join(r"Epic\EpicGamesLauncher\Data\Manifests"))
}

/// Os apps instalados, dos mais usados para os menos (e por nome, onde não há registro de uso), e depois os jogos
/// da Steam (dos jogados há menos tempo) e da Epic Games. Só procura se a pessoa permitiu (Configurações → Atalhos →
/// Sugestões); sem a permissão, a lista volta vazia e nada do computador é lido.
#[tauri::command]
pub async fn list_apps(state: tauri::State<'_, crate::config::ConfigState>) -> Result<Vec<AppEntry>, String> {
    if !state.get().scan_apps {
        return Ok(Vec::new());
    }
    tauri::async_runtime::spawn_blocking(collect_apps).await.map_err(|e| e.to_string())
}

/// A busca em si: Menu Iniciar, apps da Loja, Steam e Epic (lenta: lê arquivos e o histórico do Windows).
fn collect_apps() -> Vec<AppEntry> {
    {
        let usage = usage_history();
        let (pinned, running) = (pinned_names(), running_programs());
        let links = start_menu_apps();
        let known: std::collections::HashSet<String> = links.iter().map(|(name, _)| normalize(name)).collect();
        let mut apps: Vec<AppEntry> = links
            .into_iter()
            .map(|(name, path)| {
                let key = normalize(&name);
                // O programa para onde o atalho aponta diz melhor quem é o app do que o nome do atalho.
                let program = fs::read(&path).ok().and_then(|bytes| lnk_target(&bytes)).and_then(|exe| program_of(&exe));
                let by_program = program.as_ref().map_or(0, |p| usage.get(p).copied().unwrap_or(0));
                AppEntry {
                    uses: by_program.max(usage_for(&name, &usage)),
                    pinned: pinned.contains(&key),
                    // Apps que abrem por um atualizador (Discord: `Update.exe --processStart`) não mostram o programa no atalho;
                    // então vale também o nome do app.
                    running: program.as_ref().is_some_and(|p| running.contains(p)) || (key.len() >= 5 && running.iter().any(|p| p == &key || p.starts_with(&key))),
                    target: path.to_string_lossy().into_owned(),
                    name,
                    kind: KIND_APP.to_string(),
                    icon: None,
                }
            })
            .collect();
        // Apps da Loja e outros que o Menu Iniciar lista sem atalho `.lnk`.
        for (name, id) in windows_start_apps() {
            let key = normalize(&name);
            if key.is_empty() || known.contains(&key) {
                continue;
            }
            apps.push(AppEntry {
                uses: usage_for(&name, &usage),
                pinned: pinned.contains(&key),
                // Sem o programa do atalho, vale o nome: o processo "Spotify" é o app "Spotify".
                running: key.len() >= 5 && running.iter().any(|program| program == &key || program.starts_with(&key)),
                target: format!(r"shell:AppsFolder\{id}"),
                name,
                kind: KIND_APP.to_string(),
                icon: None,
            });
        }
        apps.sort_by(|a, b| b.score().cmp(&a.score()).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
        // Os jogos vêm depois. Um atalho do Menu Iniciar com o mesmo nome de um jogo sai: o do jogo abre pela loja
        // certa e traz a imagem do jogo.
        let games: Vec<AppEntry> = steam_games().into_iter().chain(epic_games()).collect();
        let game_names: std::collections::HashSet<String> = games.iter().map(|g| normalize(&g.name)).collect();
        apps.retain(|app| !game_names.contains(&normalize(&app.name)));
        apps.extend(games);
        apps
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use std::{fs, path::PathBuf};

    use super::{
        EpicGame, SteamGame, epic_games_in, is_steam_tool, lnk_target, normalize, parse_app_manifest, parse_epic_manifest, parse_start_apps, program_of, rot13, steam_games_in, steam_icon,
        steam_library_paths, usage_for, vdf_pairs,
    };

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("docky-apps-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    const LIBRARY_FOLDERS: &str = "\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"\n\t\t\"label\"\t\t\"\"\n\t\t\"apps\"\n\t\t{\n\t\t\t\"730\"\t\t\"73943688238\"\n\t\t}\n\t}\n\t\"1\"\n\t{\n\t\t\"path\"\t\t\"D:\\\\SteamLibrary\"\n\t}\n}\n";

    fn app_manifest(appid: &str, name: &str, last_played: u64) -> String {
        format!(
            "\"AppState\"\n{{\n\t\"appid\"\t\t\"{appid}\"\n\t\"name\"\t\t\"{name}\"\n\t\"LastPlayed\"\t\t\"{last_played}\"\n\t\"UserConfig\"\n\t{{\n\t\t\"name\"\t\t\"outro\"\n\t}}\n}}\n"
        )
    }

    #[test]
    fn le_o_formato_de_texto_da_steam_com_caminhos_escapados() {
        assert_eq!(steam_library_paths(LIBRARY_FOLDERS), vec![PathBuf::from(r"C:\Program Files (x86)\Steam"), PathBuf::from(r"D:\SteamLibrary")]);
        let pairs = vdf_pairs(LIBRARY_FOLDERS);
        assert!(pairs.contains(&(2, "label".to_string(), String::new())));
        assert!(pairs.contains(&(3, "730".to_string(), "73943688238".to_string())));
        assert_eq!(vdf_pairs("\"nome\"\t\"Diz \\\"oi\\\"\"\n"), vec![(0, "nome".to_string(), "Diz \"oi\"".to_string())]);
    }

    #[test]
    fn le_o_manifesto_de_um_jogo_da_steam() {
        assert_eq!(
            parse_app_manifest(&app_manifest("730", "Counter-Strike 2", 1789254908)),
            Some(SteamGame { appid: "730".into(), name: "Counter-Strike 2".into(), last_played: 1789254908 })
        );
        assert_eq!(parse_app_manifest("\"AppState\"\n{\n\t\"appid\"\t\t\"1\"\n}\n"), None);
        assert_eq!(parse_app_manifest(""), None);
    }

    #[test]
    fn pula_as_ferramentas_da_steam() {
        assert!(is_steam_tool("228980", "Steamworks Common Redistributables"));
        assert!(is_steam_tool("1", "Microsoft Visual C++ Redistributable"));
        assert!(is_steam_tool("1493710", "Proton Experimental"));
        assert!(is_steam_tool("1628350", "Steam Linux Runtime 3.0 (sniper)"));
        for name in ["Counter-Strike 2", "QUIET Demo", "Fart Together Demo", "We Were Here", "Moonlighter", "Lossless Scaling", "SteamVR"] {
            assert!(!is_steam_tool("730", name), "{name}");
        }
    }

    #[test]
    fn escolhe_a_imagem_do_jogo_no_cache_da_steam() {
        let cache = temp_dir("cache-steam");
        // Cache novo: uma pasta por jogo com o ícone quadrado (hash), o logo e a capa.
        let new = cache.join("1007");
        fs::create_dir_all(new.join("0eeacc724c77e1f5abeeba4fb542f45bad894470")).unwrap(); // pasta com nome de hash não conta
        fs::write(new.join("header.jpg"), b"capa").unwrap();
        fs::write(new.join("logo.png"), b"logo").unwrap();
        assert_eq!(steam_icon(&cache, "1007"), Some(new.join("logo.png")));
        fs::write(new.join("7807d6dcd71d8161465619b4f041794b0353a6d0.jpg"), b"icone").unwrap();
        fs::write(new.join("library_600x900.jpg"), b"capa alta").unwrap();
        assert_eq!(steam_icon(&cache, "1007"), Some(new.join("7807d6dcd71d8161465619b4f041794b0353a6d0.jpg")));
        fs::remove_file(new.join("logo.png")).unwrap();
        fs::remove_file(new.join("7807d6dcd71d8161465619b4f041794b0353a6d0.jpg")).unwrap();
        assert_eq!(steam_icon(&cache, "1007"), Some(new.join("header.jpg")));

        // Cache antigo: arquivos soltos `<appid>_icon.jpg` e `<appid>_header.jpg`.
        fs::write(cache.join("440_header.jpg"), b"capa").unwrap();
        assert_eq!(steam_icon(&cache, "440"), Some(cache.join("440_header.jpg")));
        fs::write(cache.join("440_icon.jpg"), b"icone").unwrap();
        assert_eq!(steam_icon(&cache, "440"), Some(cache.join("440_icon.jpg")));

        assert_eq!(steam_icon(&cache, "999"), None);
        let _ = fs::remove_dir_all(&cache);
    }

    #[test]
    fn lista_os_jogos_da_steam_do_mais_recente_e_sem_ferramentas() {
        let root = temp_dir("steam");
        let steam = root.join("Steam");
        let other = root.join("Biblioteca");
        fs::create_dir_all(steam.join("steamapps")).unwrap();
        fs::create_dir_all(other.join("steamapps")).unwrap();
        let escaped = |p: &PathBuf| p.display().to_string().replace('\\', "\\\\");
        fs::write(
            steam.join("steamapps").join("libraryfolders.vdf"),
            format!("\"libraryfolders\"\n{{\n\t\"0\"\n\t{{\n\t\t\"path\"\t\t\"{}\"\n\t}}\n\t\"1\"\n\t{{\n\t\t\"path\"\t\t\"{}\"\n\t}}\n}}\n", escaped(&steam), escaped(&other)),
        )
        .unwrap();
        fs::write(steam.join("steamapps").join("appmanifest_228980.acf"), app_manifest("228980", "Steamworks Common Redistributables", 9)).unwrap();
        fs::write(steam.join("steamapps").join("appmanifest_730.acf"), app_manifest("730", "Counter-Strike 2", 100)).unwrap();
        fs::write(other.join("steamapps").join("appmanifest_606150.acf"), app_manifest("606150", "Moonlighter", 200)).unwrap();
        let icon = steam.join("appcache").join("librarycache").join("730").join("8dbc71957312bbd3baea65848b545be9eae2a355.jpg");
        fs::create_dir_all(icon.parent().unwrap()).unwrap();
        fs::write(&icon, b"icone").unwrap();

        let games = steam_games_in(&steam);
        let summary: Vec<(&str, &str, &str)> = games.iter().map(|g| (g.name.as_str(), g.target.as_str(), g.kind.as_str())).collect();
        assert_eq!(summary, [("Moonlighter", "steam://rungameid/606150", "steam"), ("Counter-Strike 2", "steam://rungameid/730", "steam")]);
        assert_eq!(games[0].icon, None);
        assert_eq!(games[1].icon.as_deref().map(PathBuf::from), Some(icon));
        let _ = fs::remove_dir_all(&root);
    }

    const ROCKET_LEAGUE: &str = r#"{"FormatVersion": 0, "DisplayName": "Rocket League®", "AppName": "Sugar", "CatalogNamespace": "9773aa1aa54f4f7b80e44bef04986cea", "CatalogItemId": "530145df28a24424923f5828cc9031a1", "InstallLocation": "C:\\Program Files\\Epic Games\\rocketleague", "LaunchExecutable": "Binaries/Win64/Launcher.exe", "AppCategories": ["public", "games", "applications"]}"#;
    const FORTNITE_RELOAD: &str = r#"{"DisplayName": "Fortnite Reload", "AppName": "21339bc36b00459aa034300a9a7ad99e", "CatalogNamespace": "fn", "CatalogItemId": "e86c48dd240e41bc9565c6b6b16a9ec1", "InstallLocation": "C:\\Program Files\\Epic Games\\Fortnite", "LaunchExecutable": "", "AppCategories": ["addons/launchable", "addons", "games", "games/experience", "applications"]}"#;
    const FORTNITE: &str = "\u{feff}{\"DisplayName\": \"Fortnite\", \"AppName\": \"Fortnite\", \"CatalogNamespace\": \"fn\", \"CatalogItemId\": \"4fe75bbc5a674f4f9b356b5c90567da5\", \"InstallLocation\": \"C:\\\\Program Files\\\\Epic Games\\\\Fortnite\", \"LaunchExecutable\": \"FortniteGame/Binaries/Win64/FortniteBootstrapper.exe\", \"AppCategories\": [\"games\", \"applications\"]}";

    #[test]
    fn le_os_manifestos_da_epic() {
        assert_eq!(
            parse_epic_manifest(ROCKET_LEAGUE),
            Some(EpicGame {
                name: "Rocket League".into(),
                target: "com.epicgames.launcher://apps/9773aa1aa54f4f7b80e44bef04986cea%3A530145df28a24424923f5828cc9031a1%3ASugar?action=launch&silent=true".into(),
                executable: Some(PathBuf::from(r"C:\Program Files\Epic Games\rocketleague").join("Binaries").join("Win64").join("Launcher.exe")),
            })
        );
        assert_eq!(
            parse_epic_manifest(FORTNITE_RELOAD),
            Some(EpicGame {
                name: "Fortnite Reload".into(),
                target: "com.epicgames.launcher://apps/fn%3Ae86c48dd240e41bc9565c6b6b16a9ec1%3A21339bc36b00459aa034300a9a7ad99e?action=launch&silent=true".into(),
                executable: None,
            })
        );
        let fortnite = parse_epic_manifest(FORTNITE).unwrap();
        assert_eq!(fortnite.name, "Fortnite");
        assert_eq!(fortnite.target, "com.epicgames.launcher://apps/fn%3A4fe75bbc5a674f4f9b356b5c90567da5%3AFortnite?action=launch&silent=true");
        assert_eq!(fortnite.executable, Some(PathBuf::from(r"C:\Program Files\Epic Games\Fortnite").join("FortniteGame").join("Binaries").join("Win64").join("FortniteBootstrapper.exe")));
    }

    #[test]
    fn epic_fica_so_com_jogos_e_sem_complementos() {
        let addon = r#"{"DisplayName": "Pacote ™ ", "AppName": "Pacote", "AppCategories": ["addons", "games"]}"#;
        assert_eq!(parse_epic_manifest(addon), None);
        let tool = r#"{"DisplayName": "Unreal Engine", "AppName": "UE_5", "AppCategories": ["engines", "applications"]}"#;
        assert_eq!(parse_epic_manifest(tool), None);
        let no_catalog = r#"{"DisplayName": " Jogo™ ", "AppName": "Jogo", "AppCategories": ["games"]}"#;
        assert_eq!(
            parse_epic_manifest(no_catalog),
            Some(EpicGame { name: "Jogo".into(), target: "com.epicgames.launcher://apps/Jogo?action=launch&silent=true".into(), executable: None })
        );
        assert_eq!(parse_epic_manifest("não é json"), None);
    }

    #[test]
    fn lista_os_jogos_da_epic_sem_repetir_e_com_o_programa_como_icone() {
        let dir = temp_dir("epic");
        let install = dir.join("rocketleague");
        let launcher = install.join("Binaries").join("Win64").join("Launcher.exe");
        fs::create_dir_all(launcher.parent().unwrap()).unwrap();
        fs::write(&launcher, b"MZ").unwrap();
        let rocket = ROCKET_LEAGUE.replace(r"C:\\Program Files\\Epic Games\\rocketleague", &install.display().to_string().replace('\\', "\\\\"));
        fs::write(dir.join("A.item"), &rocket).unwrap();
        fs::write(dir.join("B.item"), FORTNITE_RELOAD).unwrap();
        fs::write(dir.join("C.item"), FORTNITE).unwrap();
        fs::write(dir.join("D.item"), FORTNITE.replace("4fe75bbc", "00000000")).unwrap(); // o mesmo nome de novo
        fs::write(dir.join("nota.txt"), "x").unwrap();
        let games = epic_games_in(&dir);
        let names: Vec<&str> = games.iter().map(|g| g.name.as_str()).collect();
        assert_eq!(names, ["Fortnite", "Fortnite Reload", "Rocket League"]);
        assert!(games.iter().all(|g| g.kind == "epic" && g.target.starts_with("com.epicgames.launcher://apps/")));
        assert_eq!(games[2].icon.as_deref().map(PathBuf::from), Some(launcher));
        assert_eq!(games[1].icon, None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn le_a_lista_de_apps_do_menu_iniciar_do_windows() {
        let text = "Spotify\tSpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify\r\nSteam Support Center\thttp://support.steampowered.com/\nObsidian\tmd.obsidian\n\nUninstall Foo\tfoo.uninstall\nsem tab\n";
        assert_eq!(
            parse_start_apps(text),
            vec![("Spotify".to_string(), "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify".to_string()), ("Obsidian".to_string(), "md.obsidian".to_string())]
        );
    }

    /// Um `.lnk` mínimo: cabeçalho, sem lista de destino e com um LinkInfo que guarda o caminho local.
    fn fake_lnk(path: &str, with_id_list: bool) -> Vec<u8> {
        let mut bytes = vec![0u8; 0x4C];
        bytes[0] = 0x4C;
        bytes[0x14] = if with_id_list { 0b11 } else { 0b10 };
        if with_id_list {
            bytes.extend_from_slice(&3u16.to_le_bytes());
            bytes.extend_from_slice(&[9, 9, 9]);
        }
        let header = 28usize;
        let size = header + path.len() + 2;
        let mut info = vec![0u8; header];
        info[0..4].copy_from_slice(&(size as u32).to_le_bytes());
        info[4..8].copy_from_slice(&(header as u32).to_le_bytes());
        info[8..12].copy_from_slice(&1u32.to_le_bytes());
        info[16..20].copy_from_slice(&(header as u32).to_le_bytes());
        info[24..28].copy_from_slice(&((header + path.len() + 1) as u32).to_le_bytes());
        info.extend_from_slice(path.as_bytes());
        info.extend_from_slice(&[0, 0]);
        bytes.extend(info);
        bytes
    }

    #[test]
    fn le_o_programa_de_um_atalho() {
        assert_eq!(lnk_target(&fake_lnk(r"C:\Program Files\Spotify\Spotify.exe", false)).as_deref(), Some(r"C:\Program Files\Spotify\Spotify.exe"));
        assert_eq!(lnk_target(&fake_lnk(r"D:\Jogos\Bambuzal.exe", true)).as_deref(), Some(r"D:\Jogos\Bambuzal.exe"));
        assert_eq!(lnk_target(b"nao e um atalho"), None);
        assert_eq!(lnk_target(&[]), None);
    }

    #[test]
    fn rot13_vai_e_volta() {
        assert_eq!(rot13("HRZR_PGYFRFFVBA"), "UEME_CTLSESSION");
        assert_eq!(rot13(&rot13(r"C:\Spotify\Spotify.exe")), r"C:\Spotify\Spotify.exe");
    }

    #[test]
    fn acha_o_nome_do_programa_no_historico() {
        assert_eq!(program_of(r"{6D809377-6AF0-444B-8957-A3773F02200E}\Spotify\Spotify.exe").as_deref(), Some("spotify"));
        assert_eq!(program_of(r"C:\Program Files\Google\Chrome\Application\chrome.exe").as_deref(), Some("chrome"));
        assert_eq!(program_of(r"{9E3995AB-1F9C-4F13-B827-48B24B6C7174}\TaskBar\Discord.lnk").as_deref(), Some("discord"));
        assert_eq!(program_of("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App").as_deref(), Some("app"));
        assert_eq!(program_of(""), None);
    }

    #[test]
    fn soma_o_uso_pelo_nome_do_app() {
        let usage: HashMap<String, u32> = [("spotify", 120), ("chrome", 300), ("claudedesktop", 15), ("a", 9)].iter().map(|(k, v)| (k.to_string(), *v)).collect();
        assert_eq!(usage_for("Spotify", &usage), 120);
        assert_eq!(usage_for("Google Chrome", &usage), 300); // "googlechrome" contém "chrome"
        assert_eq!(usage_for("Claude", &usage), 15); // "claudedesktop" contém "claude"
        assert_eq!(usage_for("Obsidian", &usage), 0);
        assert_eq!(usage_for("", &usage), 0);
    }

    #[test]
    fn normaliza_sem_pontuacao() {
        assert_eq!(normalize("Visual Studio Code!"), "visualstudiocode");
    }
}

#[cfg(all(test, windows))]
mod smoke {
    /// Teste de fumaça na máquina real: o Menu Iniciar e o histórico de uso abrem e dão uma lista plausível.
    #[test]
    fn lista_os_apps_desta_maquina() {
        let apps = super::collect_apps();
        println!("{} apps", apps.len());
        for app in apps.iter().take(20) {
            println!("{:>6}  uso={} fixado={} aberto={}  {}", app.score(), app.uses, app.pinned, app.running, app.name);
        }
        assert!(!apps.is_empty());
    }

    /// Teste de fumaça na máquina real: os jogos da Steam e da Epic instalados aqui aparecem. Só cobra o Counter-Strike 2
    /// e o Fortnite se os manifestos deles existem nesta máquina.
    #[test]
    fn lista_os_jogos_desta_maquina() {
        let steam = super::steam_games();
        let epic = super::epic_games();
        for game in steam.iter().chain(&epic) {
            println!("{:<6} {:<28} {:<100} {}", game.kind, game.name, game.target, game.icon.as_deref().unwrap_or("-"));
        }
        let has_cs2 = super::steam_dir().is_some_and(|dir| dir.join("steamapps").join("appmanifest_730.acf").is_file());
        if has_cs2 {
            assert!(steam.iter().any(|g| g.name == "Counter-Strike 2" && g.target == "steam://rungameid/730" && g.kind == "steam"));
        }
        let manifests = std::path::PathBuf::from(std::env::var_os("ProgramData").unwrap_or_else(|| r"C:\ProgramData".into())).join(r"Epic\EpicGamesLauncher\Data\Manifests");
        let has_fortnite = std::fs::read_dir(&manifests)
            .map(|entries| entries.flatten().any(|e| std::fs::read_to_string(e.path()).ok()
                    .and_then(|text| serde_json::from_str::<serde_json::Value>(text.trim_start_matches('\u{feff}')).ok())
                    .is_some_and(|json| json["AppName"] == "Fortnite")))
            .unwrap_or(false);
        if has_fortnite {
            assert!(epic.iter().any(|g| g.name == "Fortnite" && g.kind == "epic"));
        }
        assert!(steam.iter().chain(&epic).all(|g| super::normalize(&g.name).len() >= 2));
    }
}
