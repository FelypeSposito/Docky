mod apps;
mod claude;
mod claude_hooks;
mod config;
mod fullscreen;
mod google;
mod hotkeys;
mod icons;
#[cfg(windows)]
mod file_drop;
mod focus;
mod island;
mod picker;
mod placement;
mod launcher;
mod lyrics;
mod call;
mod discord;
mod downloads;
mod media;
mod mixer;
mod notes;
mod pointer;
mod power;
mod settings_window;
mod shell_icon;
mod shelf;
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
            notes::notes_save,
            notes::notes_recent,
            notes::notes_open,
            notes::notes_delete,
            launcher::icon_image,
            icons::icons_folder,
            icons::set_icons_folder,
            icons::open_icons_folder,
            icons::fetch_missing_icons,
            icons::adopt_icon,
            apps::list_apps,
            picker::pick_path,
            shelf::shelf_send,
            shelf::shelf_trash,
            shelf::recycle_bin_count,
            shelf::open_recycle_bin,
            weather::weather,
            claude::claude_decide,
            claude::claude_status,
            claude::claude_hooks_plan,
            claude::claude_hooks_install,
            claude::claude_hooks_remove,
            media::get_media,
            media::media_control,
            media::media_seek,
            media::media_open_app,
            mixer::audio_apps,
            mixer::set_app_volume,
            mixer::set_app_muted,
            mixer::media_app_volume,
            mixer::set_media_app_volume,
            mixer::set_media_app_muted,
            hotkeys::hotkeys_taken,
            discord::discord_state,
            discord::discord_setup,
            discord::discord_save_secret,
            discord::discord_command,
            call::current_call,
            call::mic_muted,
            call::set_mic_muted,
            downloads::reveal_download,
            volume::get_volume,
            volume::set_volume,
            volume::set_muted,
        ])
        // wry's own drop target (when it registers): remember what was dropped, like file_drop does.
        .on_window_event(|_, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                shelf::remember(paths);
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(config::ConfigState::load(&handle));
            // O início com o Windows guarda o caminho do exe; renova para o app que está rodando agora.
            if app.state::<config::ConfigState>().get().start_with_windows {
                let _ = app.autolaunch().enable();
            }
            app.manage(claude::ClaudeState::load(&handle));
            // Os atalhos que ficaram sem ícone ganham o do app, em segundo plano.
            icons::schedule(&handle);

            // Before the windows exist, so the island never asks for a Discord state that is not managed yet.
            discord::spawn(handle.clone());
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
            call::spawn(handle.clone());
            downloads::spawn(handle.clone());
            fullscreen::spawn(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
