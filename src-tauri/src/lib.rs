mod claude;
mod claude_hooks;
mod config;
mod fullscreen;
mod google;
mod hotkeys;
#[cfg(windows)]
mod file_drop;
mod island;
mod picker;
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
            if let Some(window) = island::window_under_cursor(app) {
                let _ = app.emit_to(window.label(), "hotkey", "toggle");
            }
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .manage(pointer::PointerState::default())
        .plugin(tauri_plugin_opener::init())
        .manage(island::Visibility::default())
        .manage(system::SystemState::new())
        .manage(google::GoogleState::default())
        .invoke_handler(tauri::generate_handler![
            config::get_config,
            config::set_config,
            pointer::set_island_rect,
            island::list_monitors,
            power::get_power,
            settings_window::open_settings,
            lyrics::lrclib,
            lyrics::netease,
            google::google_status,
            google::google_save_secret,
            google::google_connect,
            google::google_disconnect,
            google::google_events,
            google::open_meeting,
            launcher::launch,
            system::system_stats,
            notes::notes_save,
            notes::notes_recent,
            notes::notes_open,
            notes::notes_delete,
            launcher::shortcut_icon,
            picker::pick_path,
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

            island::reconcile(&handle)?;
            island::watch(handle.clone());
            hotkeys::register(&handle)?;
            tray::build(&handle)?;

            #[cfg(windows)]
            file_drop::spawn(handle.clone());
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
