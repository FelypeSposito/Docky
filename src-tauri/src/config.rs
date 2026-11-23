use std::{collections::HashSet, fs, path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

/// Pasta de destino da Shelf (um nome curto e o caminho no disco).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShelfFolder {
    pub name: String,
    pub path: String,
    /// Ícone da pasta: emoji, `lib:nome` (biblioteca do Docky) ou o caminho de uma imagem. Vazio = pasta padrão.
    #[serde(default)]
    pub icon: String,
}

/// Atalho do lançador: abre um app, pasta, arquivo ou site.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Shortcut {
    pub name: String,
    pub target: String,
    /// Ícone do atalho: um emoji ou texto curto, ou o caminho de uma imagem. Vazio = a inicial do nome.
    #[serde(default)]
    pub icon: String,
    /// Identifica o atalho (os grupos apontam para os membros por aqui). Gerado quando falta.
    #[serde(default)]
    pub id: String,
    /// É um grupo: abre todos os atalhos de `members` de uma vez. `target` não é usado.
    #[serde(default)]
    pub group: bool,
    #[serde(default)]
    pub members: Vec<String>,
    /// Fica fora da lista de atalhos, mas continua valendo como item de um grupo.
    #[serde(default)]
    pub hidden: bool,
}

/// Arruma a configuração antes de usar e de gravar: ids dos atalhos, caminhos de pasta e membros das seções.
pub fn normalize(config: &mut Config) {
    config.island_position = if config.island_position.is_finite() { config.island_position.clamp(0.0, 1.0) } else { 0.5 };
    normalize_shortcuts(&mut config.shortcuts);
    normalize_paths(config);
    normalize_sections(&mut config.shortcut_sections, &config.shortcuts);
}

/// Uma seção da tela de atalhos (Jogos, Comunicação…): o nome, se está recolhida e os atalhos dela (ids, sem grupos).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShortcutSection {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub collapsed: bool,
    #[serde(default)]
    pub members: Vec<String>,
    /// Part of the day when this section goes first in the island ("morning", "afternoon", "night"); empty = always.
    #[serde(default)]
    pub hours: String,
}

/// Tira das seções os atalhos que não existem mais (ou viraram grupo) e deixa cada atalho numa seção só (a primeira).
pub fn normalize_sections(sections: &mut [ShortcutSection], shortcuts: &[Shortcut]) {
    let plain: HashSet<&str> = shortcuts.iter().filter(|s| !s.group).map(|s| s.id.as_str()).collect();
    let mut placed: HashSet<String> = HashSet::new();
    for section in sections.iter_mut() {
        section.members.retain(|m| plain.contains(m.as_str()) && placed.insert(m.clone()));
    }
}

/// Um caminho como o Windows o abre: sem espaços nas pontas e sem as aspas que o "Copiar como caminho" do Explorer traz.
pub fn clean_path(path: &str) -> String {
    path.trim().trim_matches(|c| c == '"' || c == '\'').trim().to_string()
}

/// Limpa os caminhos de pasta da configuração (Shelf, notas e ícones). Uma pasta salva com aspas nunca existiria.
pub fn normalize_paths(config: &mut Config) {
    config.notes_folder = clean_path(&config.notes_folder);
    config.icons_folder = clean_path(&config.icons_folder);
    for folder in &mut config.shelf_folders {
        folder.path = clean_path(&folder.path);
    }
}

/// Dá um id a cada atalho que não tem (ou que repete o de outro) e tira dos grupos os membros que não existem mais
/// ou que são outros grupos.
pub fn normalize_shortcuts(shortcuts: &mut [Shortcut]) {
    let mut seen: HashSet<String> = HashSet::new();
    let mut missing = Vec::new();
    for (i, shortcut) in shortcuts.iter().enumerate() {
        let id = shortcut.id.trim();
        if id.is_empty() || !seen.insert(id.to_string()) {
            missing.push(i);
        }
    }
    let mut next = 1;
    for i in missing {
        loop {
            let candidate = format!("s{next}");
            next += 1;
            if seen.insert(candidate.clone()) {
                shortcuts[i].id = candidate;
                break;
            }
        }
    }
    let plain: HashSet<String> = shortcuts.iter().filter(|s| !s.group).map(|s| s.id.clone()).collect();
    for shortcut in shortcuts.iter_mut() {
        if shortcut.group {
            shortcut.members.retain(|m| plain.contains(m));
        } else {
            shortcut.members.clear();
        }
    }
}

/// Preferências do usuário. O formato (camelCase) é o mesmo que o frontend usa em `config/types.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub start_with_windows: bool,
    pub hover_open: bool,
    pub hide_in_fullscreen: bool,
    /// Reserva uma faixa no topo das telas da ilha: as janelas maximizadas começam abaixo da pílula.
    pub reserve_space: bool,
    pub eyes: bool,
    pub follow_cursor: bool,
    pub glow: u8,
    /// The island's color (see `island/theme.ts`); empty = taken from the album cover of what is playing.
    pub island_color: String,
    /// The thin light along the island's edge.
    pub glass_edge: bool,
    /// The island's material: "solid" (black) or "glass" (liquid glass, see `island/useLiquidGlass.ts`).
    pub material: String,
    /// With the glass material: "clear" (more see-through) or "tinted" (more opaque, more contrast), like Apple's
    /// Liquid Glass setting.
    pub glass_style: String,
    /// Docky's own taskbar (the dock) on the main screen.
    pub dock_enabled: bool,
    /// Which edge the dock sits on: "bottom", "left" or "right" (the island owns the top).
    pub dock_side: String,
    /// While the dock is on, Windows' taskbar is hidden (and comes back when the dock is off or Docky quits).
    pub dock_hide_taskbar: bool,
    /// Programs pinned to the dock (paths to their .exe), in order.
    pub dock_pinned: Vec<String>,
    /// The clock on the pill and in the header on a 12-hour dial.
    pub clock_12h: bool,
    /// Keeps the last texts you copied (in memory only) for the Copiados page.
    pub clipboard_history: bool,
    /// The welcome card was seen (or closed). Off only on a brand-new install: see `ConfigState::load`.
    pub onboarded: bool,
    /// Asks GitHub, twice a day, whether a newer Docky was released (Settings, Geral, Sobre).
    pub check_updates: bool,
    /// Interface language: "auto" (follow Windows), "pt" or "en".
    pub language: String,
    pub reduce_motion: bool,
    /// Mostra a linha atual da letra na pílula quando a ilha está recolhida.
    pub lyric_pill: bool,
    /// Ajuste fino da letra, em milissegundos (positivo = letra adianta).
    pub lyric_delay_ms: i32,
    /// Mostra os pedidos de permissão do Claude Code na ilha (senão, o terminal pergunta normalmente).
    pub claude_approve: bool,
    /// Pasta onde as notas rápidas viram arquivos .md.
    pub notes_folder: String,
    /// Destinos da Shelf; os arquivos soltos na ilha são copiados para um deles.
    pub shelf_folders: Vec<ShelfFolder>,
    /// Cidade do clima (Open-Meteo).
    pub weather_city: String,
    /// Foco (Pomodoro): duração do foco, da pausa curta e da longa, em minutos, e quantos focos formam um ciclo.
    pub focus_minutes: u32,
    pub short_break_minutes: u32,
    pub long_break_minutes: u32,
    pub focus_per_set: u32,
    /// Avisos curtos da ilha: cada um pode ser desligado.
    pub notice_charge: bool,
    pub notice_volume: bool,
    pub notice_claude_done: bool,
    pub notice_timer: bool,
    /// Um som suave quando o Foco ou o contador termina.
    pub timer_sound: bool,
    /// Short notice on the pill when a long fullscreen session (a game) ends.
    pub notice_game: bool,
    /// Short notice on the pill when a download finishes.
    pub notice_download: bool,
    /// Short notice with the charge of Bluetooth headphones when they connect, and when it runs low.
    pub notice_bluetooth: bool,
    /// Call timer and mic mute on the pill while an app uses the microphone.
    pub call_pill: bool,
    /// Data e hora no cabeçalho da ilha aberta.
    pub header_clock: bool,
    /// Where the island sits along the top edge: 0 = flush left, 0.5 = centered, 1 = flush right.
    pub island_position: f64,
    /// Faixa "Claude trabalhando" na ilha recolhida.
    pub claude_work_strip: bool,
    /// Páginas escondidas do dock (ids).
    pub hidden_pages: Vec<String>,
    /// Unidade da temperatura: "c" ou "f".
    pub weather_unit: String,
    /// Shelf: mover os arquivos para o destino (apaga o original) em vez de copiar.
    pub shelf_move: bool,
    /// Shelf: the Recycle Bin tile next to the folders.
    pub shelf_trash: bool,
    /// Client ID do Google Cloud para o Google Agenda (o segredo fica no Gerenciador de Credenciais).
    pub google_client_id: String,
    /// Client ID of the person's own Discord app (Developer Portal); the secret stays in the Credential Manager.
    pub discord_client_id: String,
    /// Itens do lançador (página Atalhos).
    pub shortcuts: Vec<Shortcut>,
    /// Ordem das páginas do dock (ids). Vazio = ordem original.
    pub page_order: Vec<String>,
    /// Notas fixadas no topo da lista (nomes de arquivo).
    pub pinned_notes: Vec<String>,
    /// Color of each note (file name to color id, see `notes/colors.ts`); notes without one stay plain.
    pub note_colors: std::collections::BTreeMap<String, String>,
    /// Ordem das notas escolhida arrastando (nomes de arquivo). As notas novas, que não estão aqui, ficam no topo.
    pub note_order: Vec<String>,
    /// Duração do contador personalizado do Foco, em minutos.
    pub timer_custom_minutes: u32,
    /// Em quais telas a ilha aparece (nomes dos monitores). Vazio = só na principal.
    pub screens: Vec<String>,
    /// Pede confirmação antes de abrir apps, jogos e grupos pelos atalhos.
    pub confirm_apps: bool,
    /// Um app que já está aberto vem para a frente, em vez de abrir outra janela dele.
    pub focus_open_apps: bool,
    /// Pasta dos ícones (imagens) dos atalhos; os ícones automáticos são guardados nela. Vazio = Documentos\Docky\icons.
    pub icons_folder: String,
    /// Busca na internet, uma vez, o ícone de cada atalho novo que ficou sem ícone.
    pub auto_icons: bool,
    /// A pessoa deixou o Docky procurar os apps e jogos instalados (Menu Iniciar, Steam, Epic) para sugerir atalhos.
    /// Desligado até ela permitir; a busca é toda local.
    pub scan_apps: bool,
    /// Seções da tela de atalhos, na ordem em que aparecem.
    pub shortcut_sections: Vec<ShortcutSection>,
}

/// Se existir um cofre do Obsidian chamado "brain" em Documentos, as notas vão para a Inbox dele.
fn default_notes_folder() -> String {
    let Some(home) = std::env::var_os("USERPROFILE") else {
        return String::new();
    };
    let brain = PathBuf::from(home).join("OneDrive").join("Documentos").join("brain");
    if brain.is_dir() { brain.join("Inbox").display().to_string() } else { String::new() }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            // Só liga com o consentimento do usuário, pelas configurações.
            start_with_windows: false,
            hover_open: true,
            hide_in_fullscreen: true,
            reserve_space: false,
            eyes: true,
            follow_cursor: true,
            glow: 70,
            island_color: String::new(),
            glass_edge: true,
            material: "solid".into(),
            glass_style: "clear".into(),
            dock_enabled: false,
            dock_side: "bottom".into(),
            dock_hide_taskbar: true,
            dock_pinned: Vec::new(),
            clock_12h: false,
            clipboard_history: true,
            onboarded: false,
            check_updates: true,
            language: "auto".into(),
            reduce_motion: false,
            lyric_pill: true,
            lyric_delay_ms: 0,
            claude_approve: true,
            notes_folder: default_notes_folder(),
            shelf_folders: Vec::new(),
            weather_city: String::new(),
            google_client_id: String::new(),
            discord_client_id: String::new(),
            focus_minutes: 25,
            short_break_minutes: 5,
            long_break_minutes: 15,
            focus_per_set: 4,
            notice_charge: true,
            notice_volume: true,
            notice_claude_done: true,
            notice_timer: true,
            timer_sound: true,
            notice_game: true,
            notice_download: true,
            notice_bluetooth: true,
            call_pill: true,
            header_clock: true,
            island_position: 0.5,
            claude_work_strip: true,
            // The Agenda needs a Google account: a new install starts without it (Settings, or connecting, shows it).
            hidden_pages: vec!["cal".into()],
            weather_unit: "c".into(),
            shelf_move: false,
            shelf_trash: true,
            shortcuts: Vec::new(),
            page_order: Vec::new(),
            pinned_notes: Vec::new(),
            note_colors: Default::default(),
            note_order: Vec::new(),
            timer_custom_minutes: 10,
            screens: Vec::new(),
            confirm_apps: true,
            focus_open_apps: true,
            icons_folder: String::new(),
            auto_icons: true,
            scan_apps: false,
            shortcut_sections: Vec::new(),
        }
    }
}

/// A config saved before the welcome card existed: someone who already used Docky, who never needs the card.
pub fn saved_before_welcome(saved: Option<&str>) -> bool {
    saved.is_some_and(|text| !text.contains("\"onboarded\""))
}

pub struct ConfigState {
    path: PathBuf,
    current: Mutex<Config>,
}

impl ConfigState {
    pub fn load(app: &AppHandle) -> Self {
        let dir = app
            .path()
            .app_config_dir()
            .expect("não foi possível resolver a pasta de configuração");
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("config.json");
        let text = fs::read_to_string(&path).ok();
        let mut current: Config = text.as_deref().and_then(|text| serde_json::from_str(text).ok()).unwrap_or_default();
        if saved_before_welcome(text.as_deref()) {
            current.onboarded = true;
        }
        normalize(&mut current);
        Self { path, current: Mutex::new(current) }
    }

    pub fn get(&self) -> Config {
        self.current.lock().unwrap().clone()
    }

    /// The Discord Client ID, read by the Discord thread without cloning the whole config.
    pub fn discord_client_id(&self) -> String {
        self.current.lock().unwrap().discord_client_id.trim().to_string()
    }

    /// Hide the island while an app is fullscreen. Read every second, so without cloning the whole config.
    pub fn hide_in_fullscreen(&self) -> bool {
        self.current.lock().unwrap().hide_in_fullscreen
    }

    /// The eyes are on and follow the cursor. Read by the pointer loop without cloning the whole config.
    pub fn eyes_follow(&self) -> bool {
        let config = self.current.lock().unwrap();
        config.eyes && config.follow_cursor
    }

    fn save(&self, config: &Config) -> std::io::Result<()> {
        let text = serde_json::to_string_pretty(config).expect("Config é serializável");
        fs::write(&self.path, text)
    }

    /// Muda a configuração por dentro (fora de uma tela): relê o estado atual, aplica `change`, grava e avisa as janelas.
    /// Quem muda em segundo plano (os ícones automáticos) usa isto para não sobrescrever o que a pessoa acabou de editar.
    pub fn modify(&self, app: &AppHandle, change: impl FnOnce(&mut Config)) -> Result<Config, String> {
        let snapshot = {
            let mut current = self.current.lock().unwrap();
            change(&mut current);
            normalize(&mut current);
            current.clone()
        };
        self.save(&snapshot).map_err(|e| e.to_string())?;
        app.emit("config-changed", &snapshot).map_err(|e| e.to_string())?;
        Ok(snapshot)
    }
}

#[tauri::command]
pub fn get_config(state: State<ConfigState>) -> Config {
    state.get()
}

#[tauri::command]
pub fn set_config(
    app: AppHandle,
    state: State<ConfigState>,
    mut config: Config,
) -> Result<Config, String> {
    let previous = state.get();
    normalize(&mut config);

    if previous.start_with_windows != config.start_with_windows {
        let autolaunch = app.autolaunch();
        let result = if config.start_with_windows {
            autolaunch.enable()
        } else {
            autolaunch.disable()
        };
        result.map_err(|e| e.to_string())?;
    }

    state.save(&config).map_err(|e| e.to_string())?;
    *state.current.lock().unwrap() = config.clone();
    app.emit("config-changed", &config).map_err(|e| e.to_string())?;
    if previous.dock_enabled != config.dock_enabled || previous.dock_side != config.dock_side {
        // Creating and closing windows off this command: on Windows, doing it here can hang.
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            crate::dock::sync(&handle);
        });
    }
    if previous.material != config.material {
        crate::settings_window::material_changed(&app, &config.material);
    }
    if previous.language != config.language {
        crate::tray::relabel(&app, &config.language);
    }
    // Atalho novo sem ícone: busca o ícone dele em segundo plano.
    crate::icons::schedule(&app);
    if previous.reserve_space != config.reserve_space {
        crate::reserve::sync(&app);
    }
    if previous.screens != config.screens {
        // Criar e fechar janelas fora deste comando: no Windows, fazer isso aqui pode travar.
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = crate::island::reconcile(&handle);
        });
    }
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::{Config, ShelfFolder, Shortcut, ShortcutSection, clean_path, normalize, normalize_paths, normalize_shortcuts, saved_before_welcome};

    #[test]
    fn so_quem_instala_agora_ve_as_boas_vindas() {
        assert!(!saved_before_welcome(None));
        assert!(saved_before_welcome(Some(r#"{"eyes":true,"glow":70}"#)));
        assert!(!saved_before_welcome(Some(r#"{"eyes":true,"onboarded":false}"#)));
        assert!(Config::default().hidden_pages.contains(&"cal".to_string()));
    }

    #[test]
    fn tira_as_aspas_do_copiar_como_caminho() {
        assert_eq!(clean_path("\"C:\\Users\\a\\Área de Trabalho\\Clipes\""), "C:\\Users\\a\\Área de Trabalho\\Clipes");
        assert_eq!(clean_path("  C:\\x  "), "C:\\x");
        assert_eq!(clean_path(""), "");
        let mut config = Config::default();
        config.shelf_folders.push(ShelfFolder { name: "Clipes".into(), path: "\"C:\\Clipes\"".into(), icon: String::new() });
        config.notes_folder = "\"D:\\Notas\"".into();
        normalize_paths(&mut config);
        assert_eq!(config.shelf_folders[0].path, "C:\\Clipes");
        assert_eq!(config.notes_folder, "D:\\Notas");
    }

    #[test]
    fn secao_so_guarda_atalhos_que_existem_cada_um_numa_secao() {
        let mut config = Config::default();
        config.shortcuts = vec![shortcut("a", false, &[]), shortcut("b", false, &[]), shortcut("g", true, &["a"])];
        let section = |id: &str, members: &[&str]| ShortcutSection { id: id.into(), name: id.into(), collapsed: false, members: members.iter().map(|m| m.to_string()).collect(), hours: String::new() };
        config.shortcut_sections = vec![section("s1", &["a", "sumiu", "g"]), section("s2", &["a", "b"])];
        normalize(&mut config);
        assert_eq!(config.shortcut_sections[0].members, ["a"]);
        assert_eq!(config.shortcut_sections[1].members, ["b"], "o a já está na primeira seção");
    }

    fn shortcut(id: &str, group: bool, members: &[&str]) -> Shortcut {
        Shortcut {
            name: id.into(),
            target: String::new(),
            icon: String::new(),
            id: id.into(),
            group,
            members: members.iter().map(|m| m.to_string()).collect(),
            hidden: false,
        }
    }

    #[test]
    fn da_id_a_quem_nao_tem_e_a_quem_repete() {
        let mut list = vec![shortcut("", false, &[]), shortcut("a", false, &[]), shortcut("a", false, &[]), shortcut("s1", false, &[])];
        normalize_shortcuts(&mut list);
        let ids: Vec<_> = list.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids.len(), 4);
        let unique: std::collections::HashSet<_> = ids.iter().collect();
        assert_eq!(unique.len(), 4, "ids repetidos: {ids:?}");
        assert_eq!(list[1].id, "a");
        assert_eq!(list[3].id, "s1");
    }

    #[test]
    fn grupo_so_guarda_membros_que_existem_e_nao_sao_grupos() {
        let mut list = vec![shortcut("a", false, &["x"]), shortcut("g", true, &["a", "g2", "nao-existe"]), shortcut("g2", true, &[])];
        normalize_shortcuts(&mut list);
        assert!(list[0].members.is_empty(), "atalho comum não tem membros");
        assert_eq!(list[1].members, ["a"]);
    }
}
