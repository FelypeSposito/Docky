use std::{fs, path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

/// Pasta de destino da Shelf (um nome curto e o caminho no disco).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShelfFolder {
    pub name: String,
    pub path: String,
}

/// Atalho do lançador: abre um app, pasta, arquivo ou site.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Shortcut {
    pub name: String,
    pub target: String,
    /// Ícone do atalho: um emoji ou texto curto, ou o caminho de uma imagem. Vazio = a inicial do nome.
    #[serde(default)]
    pub icon: String,
}

/// Preferências do usuário. O formato (camelCase) é o mesmo que o frontend usa em `config/types.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub start_with_windows: bool,
    pub hover_open: bool,
    pub hide_in_fullscreen: bool,
    pub eyes: bool,
    pub follow_cursor: bool,
    pub glow: u8,
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
    /// Faixa "Claude trabalhando" na ilha recolhida.
    pub claude_work_strip: bool,
    /// Páginas escondidas do dock (ids).
    pub hidden_pages: Vec<String>,
    /// De quanto em quanto tempo a página Sistema atualiza, em milissegundos.
    pub system_refresh_ms: u32,
    /// Unidade da temperatura: "c" ou "f".
    pub weather_unit: String,
    /// Shelf: mover os arquivos para o destino (apaga o original) em vez de copiar.
    pub shelf_move: bool,
    /// Client ID do Google Cloud para o Google Agenda (o segredo fica no Gerenciador de Credenciais).
    pub google_client_id: String,
    /// Itens do lançador (página Atalhos).
    pub shortcuts: Vec<Shortcut>,
    /// Ordem das páginas do dock (ids). Vazio = ordem original.
    pub page_order: Vec<String>,
    /// Notas fixadas no topo da lista (nomes de arquivo).
    pub pinned_notes: Vec<String>,
    /// Duração do contador personalizado do Foco, em minutos.
    pub timer_custom_minutes: u32,
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
            eyes: true,
            follow_cursor: true,
            glow: 70,
            reduce_motion: false,
            lyric_pill: true,
            lyric_delay_ms: 0,
            claude_approve: true,
            notes_folder: default_notes_folder(),
            shelf_folders: Vec::new(),
            weather_city: String::new(),
            google_client_id: String::new(),
            focus_minutes: 25,
            short_break_minutes: 5,
            long_break_minutes: 15,
            focus_per_set: 4,
            notice_charge: true,
            notice_volume: true,
            notice_claude_done: true,
            notice_timer: true,
            claude_work_strip: true,
            hidden_pages: Vec::new(),
            system_refresh_ms: 1500,
            weather_unit: "c".into(),
            shelf_move: false,
            shortcuts: Vec::new(),
            page_order: Vec::new(),
            pinned_notes: Vec::new(),
            timer_custom_minutes: 10,
        }
    }
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
        let current = fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        Self { path, current: Mutex::new(current) }
    }

    pub fn get(&self) -> Config {
        self.current.lock().unwrap().clone()
    }

    fn save(&self, config: &Config) -> std::io::Result<()> {
        let text = serde_json::to_string_pretty(config).expect("Config é serializável");
        fs::write(&self.path, text)
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
    config: Config,
) -> Result<Config, String> {
    let previous = state.get();

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
    Ok(config)
}
