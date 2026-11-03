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
}

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

/// Os apps instalados, dos mais usados para os menos (e por nome, onde não há registro de uso).
#[tauri::command]
pub async fn list_apps() -> Result<Vec<AppEntry>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let usage = usage_history();
        let (pinned, running) = (pinned_names(), running_programs());
        let mut apps: Vec<AppEntry> = start_menu_apps()
            .into_iter()
            .map(|(name, path)| {
                let key = normalize(&name);
                // O programa para onde o atalho aponta diz melhor quem é o app do que o nome do atalho.
                let program = fs::read(&path).ok().and_then(|bytes| lnk_target(&bytes)).and_then(|exe| program_of(&exe));
                let by_program = program.as_ref().map_or(0, |p| usage.get(p).copied().unwrap_or(0));
                AppEntry {
                    uses: by_program.max(usage_for(&name, &usage)),
                    pinned: pinned.contains(&key),
                    running: program.as_ref().is_some_and(|p| running.contains(p)),
                    target: path.to_string_lossy().into_owned(),
                    name,
                }
            })
            .collect();
        apps.sort_by(|a, b| b.score().cmp(&a.score()).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
        apps
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{lnk_target, normalize, program_of, rot13, usage_for};

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
        let apps = tauri::async_runtime::block_on(super::list_apps()).unwrap();
        println!("{} apps", apps.len());
        for app in apps.iter().take(20) {
            println!("{:>6}  uso={} fixado={} aberto={}  {}", app.score(), app.uses, app.pinned, app.running, app.name);
        }
        assert!(!apps.is_empty());
    }
}
