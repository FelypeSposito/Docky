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
    /// Itens do lançador (página Atalhos).
    pub shortcuts: Vec<Shortcut>,
    /// Ordem das páginas do dock (ids). Vazio = ordem original.
    pub page_order: Vec<String>,
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
            shortcuts: Vec::new(),
            page_order: Vec::new(),
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
