mod claude;
mod claude_hooks;
mod config;
mod fullscreen;
mod hotkeys;
mod island;
mod launcher;
mod lyrics;
mod media;
mod notes;
mod pointer;
mod power;
mod settings_window;
mod shelf;
mod system;
mod tray;
mod volume;
mod weather;

use tauri::Manager;
use tauri::Emitter;
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Tem que ser o primeiro plugin. Abrir o Docky de novo só abre a ilha que já está rodando.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app.emit_to("island", "hotkey", "toggle");
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .manage(pointer::PointerState::default())
        .plugin(tauri_plugin_opener::init())
        .manage(island::Visibility::default())
        .manage(system::SystemState::new())
        .invoke_handler(tauri::generate_handler![
            config::get_config,
            config::set_config,
            pointer::set_island_rect,
            power::get_power,
            settings_window::open_settings,
            lyrics::lrclib,
            launcher::launch,
            system::system_stats,
            notes::notes_save,
            notes::notes_recent,
            notes::notes_open,
            shelf::shelf_send,
            weather::weather,
            claude::claude_decide,
            claude::claude_status,
            claude::claude_hooks_plan,
            claude::claude_hooks_install,
            claude::claude_hooks_remove,
            media::get_media,
            media::media_control,
            media::media_seek,
            volume::get_volume,
            volume::set_volume,
            volume::set_muted,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(config::ConfigState::load(&handle));
            // O início com o Windows guarda o caminho do exe; renova para o app que está rodando agora.
            if app.state::<config::ConfigState>().get().start_with_windows {
                let _ = app.autolaunch().enable();
            }
            app.manage(claude::ClaudeState::load(&handle));

            island::place(&handle)?;
            hotkeys::register(&handle)?;
            tray::build(&handle)?;

            pointer::spawn(handle.clone());
            power::spawn(handle.clone());
            media::spawn(handle.clone());
            claude::spawn(handle.clone());
            volume::spawn(handle.clone());
            fullscreen::spawn(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
