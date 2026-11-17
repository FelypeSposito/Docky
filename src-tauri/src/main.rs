// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // The uninstaller runs `docky.exe --uninstall-cleanup` before removing the files (windows/hooks.nsh).
    if std::env::args().any(|arg| arg == "--uninstall-cleanup") {
        docky_lib::uninstall_cleanup();
        return;
    }
    docky_lib::run()
}
