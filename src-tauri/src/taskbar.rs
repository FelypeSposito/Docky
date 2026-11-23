//! Docky's taskbar (the dock at the bottom, left or right edge): which apps are open, acting on their windows, and
//! hiding Windows' own taskbar while the dock is on.
//!
//! Open apps are the windows Alt+Tab would show (visible, not tool windows, not cloaked by Windows, with a title),
//! grouped by program. Store apps (packaged, like WhatsApp or Windows' Settings) are grouped, named, drawn and started
//! by their app ID (`shell:AppsFolder\<id>`): their programs often carry no icon, and some run inside a host process. The dock's window never takes focus (WS_EX_NOACTIVATE), so the app you were in stays the
//! focused one when you click the dock, and a click on the focused app minimizes it, like the Windows taskbar.
//!
//! Hiding Windows' taskbar changes a system setting (auto-hide, so maximized windows get the whole screen) and hides
//! the bar. The state before is written to `taskbar.json`, and the bar comes back when the dock is turned off, when
//! Docky quits, on the next start after a crash, and on uninstall.

use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::config::ConfigState;

const POLL: Duration = Duration::from_millis(600);
/// How long the Windows taskbar stays out after "Bandeja" (to reach the tray icons).
const PEEK: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DockWindow {
    /// The window handle, as a number the page can send back.
    pub id: i64,
    pub title: String,
    pub minimized: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DockApp {
    /// What groups windows: the program's path in lower case (or the title, for apps hosted by another process).
    pub key: String,
    /// The program to start (empty when it cannot be started directly).
    pub path: String,
    pub name: String,
    /// PNG data URL of the program's icon.
    pub icon: Option<String>,
    pub windows: Vec<DockWindow>,
    /// One of its windows is the one in front.
    pub focused: bool,
    pub pinned: bool,
}

/// A window as read from Windows, before grouping.
#[derive(Debug, Clone, PartialEq)]
pub struct Seen {
    pub id: i64,
    pub title: String,
    pub path: String,
    pub minimized: bool,
    /// The Store app's ID (AppUserModelID) when the window belongs to a packaged app.
    pub app_id: Option<String>,
}

/// How a Store app is started, drawn and pinned: through the Apps folder.
pub fn apps_folder(app_id: &str) -> String {
    format!(r"shell:AppsFolder\{app_id}")
}

fn is_shell(path: &str) -> bool {
    path.get(..6).is_some_and(|p| p.eq_ignore_ascii_case("shell:"))
}

/// Programs that host other apps' windows: their windows are told apart by title.
const HOSTS: [&str; 1] = ["applicationframehost.exe"];

fn file_name(path: &str) -> &str {
    path.rsplit(['\\', '/']).next().unwrap_or(path)
}

/// "C:\...\chrome.exe" → "Chrome".
pub fn name_from_path(path: &str) -> String {
    let file = file_name(path);
    let stem = file.strip_suffix(".exe").or_else(|| file.strip_suffix(".EXE")).unwrap_or(file);
    let mut chars = stem.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// "WhatsApp.Root" → "WhatsApp"; other names stay as they are.
pub fn tidy_name(name: &str) -> String {
    for suffix in [".Root", ".App", ".exe"] {
        if let Some(stripped) = name.strip_suffix(suffix) {
            return stripped.to_string();
        }
    }
    name.to_string()
}

/// Groups windows by program in the dock's order (`order`, updated): the first time, pinned programs first (in their
/// pinned order) and then the open ones as they appeared; after that, new apps join at the end, and the person can
/// drag them anywhere (`dock_reorder`), pinned or not, like the Windows taskbar.
pub fn group(seen: &[Seen], focused: Option<i64>, pinned: &[String], order: &mut Vec<String>, names: &dyn Fn(&str) -> String) -> Vec<DockApp> {
    let mut apps: HashMap<String, DockApp> = HashMap::new();
    let mut appeared: Vec<String> = Vec::new();
    for window in seen {
        let host = HOSTS.contains(&file_name(&window.path).to_ascii_lowercase().as_str());
        // A Store app is known by its app ID; a hosted window whose app is unknown, by its title.
        let (key, path, name) = match &window.app_id {
            Some(id) => {
                let path = apps_folder(id);
                (path.to_lowercase(), path.clone(), names(&path))
            }
            None if host => (format!("title:{}", window.title.to_lowercase()), String::new(), window.title.clone()),
            None => (window.path.to_lowercase(), window.path.clone(), names(&window.path)),
        };
        // An unnamed Store app (the shell did not say) keeps its window's title.
        let name = if name.is_empty() { window.title.clone() } else { name };
        let app = apps.entry(key.clone()).or_insert_with(|| DockApp {
            key: key.clone(),
            path,
            name,
            icon: None,
            windows: Vec::new(),
            focused: false,
            pinned: false,
        });
        if !appeared.contains(&key) {
            appeared.push(key.clone());
        }
        app.focused |= focused == Some(window.id);
        app.windows.push(DockWindow { id: window.id, title: window.title.clone(), minimized: window.minimized });
    }
    // Pinned programs stay on the dock while closed.
    let pinned_keys: Vec<String> = pinned.iter().map(|p| p.to_lowercase()).collect();
    for (path, key) in pinned.iter().zip(&pinned_keys) {
        let app = apps.entry(key.clone()).or_insert_with(|| DockApp {
            key: key.clone(),
            path: path.clone(),
            name: names(path),
            icon: None,
            windows: Vec::new(),
            focused: false,
            pinned: true,
        });
        app.pinned = true;
    }
    // Apps new to the dock join at the end: pinned ones first, then the open ones in the order Windows lists them.
    for key in pinned_keys.into_iter().chain(appeared) {
        if !order.contains(&key) {
            order.push(key);
        }
    }
    // Apps that closed (and are not pinned) leave the order, so they come back at the end, like the Windows taskbar.
    order.retain(|key| apps.contains_key(key));
    order.iter().filter_map(|key| apps.remove(key)).collect()
}

/// The dock's apps in the order of `keys` (a drag on the dock); apps missing from `keys` keep their place after them.
pub fn apply_order(apps: &[DockApp], keys: &[String]) -> Vec<DockApp> {
    let mut sorted: Vec<DockApp> = keys.iter().filter_map(|k| apps.iter().find(|a| &a.key == k).cloned()).collect();
    sorted.extend(apps.iter().filter(|a| !keys.contains(&a.key)).cloned());
    sorted
}

/// The pinned list in the dock's new order. Pinned paths not on the dock (should not happen) keep their place after.
pub fn pinned_in_order(pinned: &[String], apps: &[DockApp]) -> Vec<String> {
    let mut sorted: Vec<String> = apps.iter().filter_map(|a| pinned.iter().find(|p| p.to_lowercase() == a.key).cloned()).collect();
    let rest: Vec<String> = pinned.iter().filter(|p| !sorted.contains(p)).cloned().collect();
    sorted.extend(rest);
    sorted
}

/// Windows' own shortcuts the dock's buttons press: virtual keys, held in order and let go in reverse.
pub fn shortcut_keys(name: &str) -> Option<&'static [u16]> {
    const WIN: u16 = 0x5B;
    Some(match name {
        "start" => &[WIN],
        "desktop" => &[WIN, b'D' as u16],
        "search" => &[WIN, b'S' as u16],
        "taskView" => &[WIN, 0x09],
        "notifications" => &[WIN, b'N' as u16],
        "quickSettings" => &[WIN, b'A' as u16],
        "taskManager" => &[0x11, 0x10, 0x1B],
        _ => return None,
    })
}

#[derive(Default)]
pub struct DockState {
    apps: Mutex<Vec<DockApp>>,
    /// The dock's order, by app key (see `group`).
    order: Mutex<Vec<String>>,
}

/// Icons and names already read, by program path.
static ICONS: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
static NAMES: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn icon_for(path: &str) -> Option<String> {
    use base64::Engine;
    if path.is_empty() {
        return None;
    }
    let cache = ICONS.get_or_init(Default::default);
    if let Some(hit) = cache.lock().ok()?.get(path) {
        return hit.clone();
    }
    let icon = crate::shell_icon::icon_png(path, 64).map(|png| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)));
    cache.lock().ok()?.insert(path.to_string(), icon.clone());
    icon
}

fn name_for(path: &str) -> String {
    let cache = NAMES.get_or_init(Default::default);
    if let Some(hit) = cache.lock().ok().and_then(|c| c.get(path).cloned()) {
        return hit;
    }
    // A Store app: the name the Start menu shows ("WhatsApp", "Configurações"); empty when unknown.
    let name = if is_shell(path) {
        win::shell_name(path).unwrap_or_default()
    } else {
        win::description(path).filter(|d| !d.trim().is_empty() && d.chars().count() <= 40).unwrap_or_else(|| name_from_path(path))
    };
    // Store apps describe themselves as "WhatsApp.Root" or "Spotify.App": the part before the dot is the name.
    let name = tidy_name(&name);
    if let Ok(mut c) = cache.lock() {
        c.insert(path.to_string(), name.clone());
    }
    name
}

#[tauri::command]
pub fn dock_apps(state: State<DockState>) -> Vec<DockApp> {
    state.apps.lock().map(|a| a.clone()).unwrap_or_default()
}

/// A click on an app: start it (pinned, not running), bring its latest window forward, or minimize it when it is
/// already the one in front.
#[tauri::command]
pub fn dock_activate(state: State<DockState>, key: String) -> Result<(), String> {
    let app = state.apps.lock().map_err(|e| e.to_string())?.iter().find(|a| a.key == key).cloned().ok_or("Esse app não está mais aberto")?;
    if app.windows.is_empty() {
        return launch(&app.path);
    }
    if app.focused {
        for window in &app.windows {
            win::minimize(window.id);
        }
        return Ok(());
    }
    // The first window in Windows' order is the one used last.
    win::focus(app.windows[0].id);
    Ok(())
}

#[tauri::command]
pub fn dock_focus_window(id: i64) {
    win::focus(id);
}

#[tauri::command]
pub fn dock_close_window(id: i64) {
    win::close(id);
}

/// A new window of the program (middle click, or "Nova janela").
#[tauri::command]
pub fn dock_launch(path: String) -> Result<(), String> {
    launch(&path)
}

fn launch(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("Esse app não abre direto por aqui".into());
    }
    // Store apps open through the Explorer, like a double click in the Apps folder.
    let mut command = if is_shell(path) {
        let mut c = std::process::Command::new("explorer.exe");
        c.arg(path);
        c
    } else {
        std::process::Command::new(path)
    };
    command.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dock_pin(app: AppHandle, state: State<ConfigState>, path: String, pin: bool) -> Result<(), String> {
    if path.is_empty() {
        return Err("Esse app não pode ser fixado".into());
    }
    state.modify(&app, |config| {
        config.dock_pinned.retain(|p| !p.eq_ignore_ascii_case(&path));
        if pin {
            config.dock_pinned.push(path.clone());
        }
    })?;
    Ok(())
}

/// One of Windows' own shortcuts: Start, show the desktop (Win+D), search, task view, notifications and calendar,
/// quick settings, Task Manager.
#[tauri::command]
pub fn dock_shortcut(which: String) -> Result<(), String> {
    let keys = shortcut_keys(&which).ok_or("Atalho desconhecido")?;
    win::press(keys);
    Ok(())
}

/// The dock in a new order (an app dragged to another place). Pinned apps keep that order in Settings too.
#[tauri::command]
pub fn dock_reorder(app: AppHandle, state: State<DockState>, config: State<ConfigState>, keys: Vec<String>) -> Result<(), String> {
    let sorted = {
        let mut apps = state.apps.lock().map_err(|e| e.to_string())?;
        let sorted = apply_order(&apps, &keys);
        *apps = sorted.clone();
        sorted
    };
    if let Ok(mut order) = state.order.lock() {
        *order = sorted.iter().map(|a| a.key.clone()).collect();
    }
    let current = config.get().dock_pinned;
    let pinned = pinned_in_order(&current, &sorted);
    if pinned != current {
        config.modify(&app, |c| c.dock_pinned = pinned.clone())?;
    }
    let _ = app.emit_to(crate::dock::LABEL, "dock-apps", sorted);
    Ok(())
}

/// Shows the program's file in the Explorer ("Abrir local do arquivo").
#[tauri::command]
pub fn dock_reveal(path: String) -> Result<(), String> {
    if path.is_empty() || is_shell(&path) || path.contains('"') || !std::path::Path::new(&path).is_file() {
        return Err("Não deu para achar o arquivo desse app".into());
    }
    win::reveal(&path)
}

/// Opens Windows' hidden tray icons (OneDrive, Discord…): the taskbar comes back for a moment and its "show hidden
/// icons" arrow is pressed (Win+B, then Enter). The bar stays while the tray is in use, and hides again after.
#[tauri::command]
pub fn dock_peek_taskbar() {
    if let Ok(mut peek) = PEEK_UNTIL.lock() {
        *peek = Some(Instant::now() + PEEK);
    }
    win::show_taskbars(true);
    thread::spawn(win::open_tray);
}

static PEEK_UNTIL: Mutex<Option<Instant>> = Mutex::new(None);

/// Where the taskbar's state before Docky hid it is kept: survives a crash, read on the next start.
fn saved_path() -> Option<PathBuf> {
    let base = std::env::var_os("APPDATA")?;
    Some(PathBuf::from(base).join("com.docky.desktop").join("taskbar.json"))
}

#[derive(Serialize, Deserialize)]
struct Saved {
    autohide: bool,
}

/// Hides Windows' taskbar (auto-hide on, so the work area is the whole screen, and the bar out of sight).
fn hide_taskbar() {
    if let Some(path) = saved_path() {
        if !path.exists() {
            let saved = Saved { autohide: win::autohide() };
            if let Ok(text) = serde_json::to_string(&saved) {
                let _ = fs::write(&path, text);
            }
        }
    }
    win::set_autohide(true);
    win::show_taskbars(false);
}

/// Brings Windows' taskbar back as it was. Safe to call any time: without a saved state it only shows the bar.
pub fn restore_taskbar() {
    let saved = saved_path().and_then(|p| fs::read_to_string(&p).ok()).and_then(|t| serde_json::from_str::<Saved>(&t).ok());
    if let Some(saved) = saved {
        win::set_autohide(saved.autohide);
        if let Some(path) = saved_path() {
            let _ = fs::remove_file(path);
        }
        win::show_taskbars(true);
    }
}

/// Reads the open apps while the dock is on, tells the dock when they change, and keeps Windows' taskbar hidden
/// (Explorer brings it back when it restarts).
pub fn spawn(app: AppHandle) {
    // A crash with the taskbar hidden: put it back unless the dock is about to hide it again.
    if !wants_hidden(&app) {
        restore_taskbar();
    }
    thread::spawn(move || {
        let mut last_external: Option<i64> = None;
        let mut hidden = false;
        loop {
            thread::sleep(POLL);
            let config = app.state::<ConfigState>().get();
            let want_hidden = config.dock_enabled && config.dock_hide_taskbar;
            let peeking = PEEK_UNTIL.lock().ok().and_then(|p| *p).is_some_and(|until| Instant::now() < until) || win::tray_in_use();
            if want_hidden && !peeking {
                // Re-hide every round: cheap, and covers Explorer restarting.
                hide_taskbar();
                hidden = true;
            } else if !want_hidden && hidden {
                restore_taskbar();
                hidden = false;
            }
            if !config.dock_enabled {
                continue;
            }

            let (seen, foreground) = win::open_windows();
            // The dock never takes focus, but another Docky window (Settings) can: keep the last app's focus then.
            if let Some(front) = foreground {
                last_external = Some(front);
            }
            let state = app.state::<DockState>();
            let mut apps = {
                let mut order = state.order.lock().unwrap_or_else(|p| p.into_inner());
                group(&seen, last_external, &config.dock_pinned, &mut order, &name_for)
            };
            for a in apps.iter_mut() {
                a.icon = icon_for(&a.path);
            }
            let changed = state.apps.lock().map(|old| *old != apps).unwrap_or(true);
            if changed {
                if let Ok(mut slot) = state.apps.lock() {
                    *slot = apps.clone();
                }
                let _ = app.emit_to(crate::dock::LABEL, "dock-apps", apps);
            }
        }
    });
}

fn wants_hidden(app: &AppHandle) -> bool {
    let config = app.state::<ConfigState>().get();
    config.dock_enabled && config.dock_hide_taskbar
}

#[cfg(windows)]
mod win {
    use std::collections::HashMap;
    use std::ffi::c_void;
    use std::sync::Mutex;

    use windows::{
        Win32::{
            Foundation::{CloseHandle, ERROR_SUCCESS, HWND, LPARAM, PROPERTYKEY, RECT, WPARAM},
            Storage::Packaging::Appx::GetApplicationUserModelId,
            System::{
                Com::{
                    COINIT_APARTMENTTHREADED, CoInitializeEx, CoTaskMemFree,
                    StructuredStorage::{PropVariantClear, PropVariantToStringAlloc},
                },
                Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
            },
            UI::Shell::{
                IShellItem, PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow}, SHCreateItemFromParsingName, SIGDN_NORMALDISPLAY,
            },
            UI::WindowsAndMessaging::EnumChildWindows,
            Graphics::Dwm::{DWMWA_CLOAKED, DwmGetWindowAttribute},
            Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW},
            UI::{
                Input::KeyboardAndMouse::{INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_KEYUP, SendInput, VIRTUAL_KEY},
                Shell::{ABM_GETSTATE, ABM_SETSTATE, APPBARDATA, SHAppBarMessage},
                WindowsAndMessaging::{
                    EnumWindows, FindWindowW, GW_OWNER, GWL_EXSTYLE, GetClassNameW, GetForegroundWindow, GetWindow, GetWindowLongW, GetWindowTextLengthW,
                    GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, PostMessageW, SW_HIDE, SW_MINIMIZE, SW_SHOWNA, ShowWindow, WM_CLOSE,
                    WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
                },
            },
        },
        core::{BOOL, PCWSTR, w},
    };

    use super::Seen;

    fn hwnd(id: i64) -> HWND {
        HWND(id as isize as *mut c_void)
    }

    fn class_of(hwnd: HWND) -> String {
        let mut buffer = [0u16; 128];
        let len = unsafe { GetClassNameW(hwnd, &mut buffer) };
        String::from_utf16_lossy(&buffer[..len.max(0) as usize])
    }

    fn cloaked(hwnd: HWND) -> bool {
        let mut value = 0u32;
        unsafe { DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, (&mut value as *mut u32).cast(), 4) }.is_ok() && value != 0
    }

    /// The Store app ID of a packaged process ("5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App"); None for others.
    fn package_app_id(pid: u32) -> Option<String> {
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buffer = [0u16; 512];
            let mut len = buffer.len() as u32;
            let result = GetApplicationUserModelId(process, &mut len, Some(windows::core::PWSTR(buffer.as_mut_ptr())));
            let _ = CloseHandle(process);
            (result == ERROR_SUCCESS && len > 1).then(|| String::from_utf16_lossy(&buffer[..len as usize - 1]))
        }
    }

    /// The app inside an ApplicationFrameHost window: its child window from another process.
    fn hosted_pid(hwnd: HWND, host_pid: u32) -> Option<u32> {
        struct Find {
            host: u32,
            found: Option<u32>,
        }
        unsafe extern "system" fn child(hwnd: HWND, data: LPARAM) -> BOOL {
            let find = unsafe { &mut *(data.0 as *mut Find) };
            let mut pid = 0u32;
            unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
            if pid != 0 && pid != find.host {
                find.found = Some(pid);
                return BOOL(0);
            }
            BOOL(1)
        }
        let mut find = Find { host: host_pid, found: None };
        unsafe {
            let _ = EnumChildWindows(Some(hwnd), Some(child), LPARAM(&mut find as *mut Find as isize));
        }
        find.found
    }

    /// The app ID Windows' taskbar reads from a window (System.AppUserModel.ID). Hosted Store apps carry it even
    /// while suspended, when their own window is gone from inside the host's.
    fn window_app_id(hwnd: HWND) -> Option<String> {
        const APP_USER_MODEL_ID: PROPERTYKEY =
            PROPERTYKEY { fmtid: windows::core::GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3), pid: 5 };
        unsafe {
            let store: IPropertyStore = SHGetPropertyStoreForWindow(hwnd).ok()?;
            let mut value = store.GetValue(&APP_USER_MODEL_ID).ok()?;
            let text = PropVariantToStringAlloc(&value).ok();
            let _ = PropVariantClear(&mut value);
            let text = text?;
            let id = text.to_string().ok();
            CoTaskMemFree(Some(text.0 as *const c_void));
            id.filter(|id| !id.trim().is_empty())
        }
    }

    /// App IDs already found, by window: a minimized hosted app lets go of its child window, so its ID would be lost.
    static APP_IDS: Mutex<Option<HashMap<i64, String>>> = Mutex::new(None);

    fn app_id_of(id: i64, hwnd: HWND, pid: u32, path: &str) -> Option<String> {
        let mut ids = APP_IDS.lock().unwrap_or_else(|p| p.into_inner());
        let ids = ids.get_or_insert_with(HashMap::new);
        if let Some(known) = ids.get(&id) {
            return Some(known.clone());
        }
        let hosted = super::HOSTS.contains(&super::file_name(path).to_ascii_lowercase().as_str());
        let found = if hosted {
            hosted_pid(hwnd, pid).and_then(package_app_id).or_else(|| window_app_id(hwnd))?
        } else {
            package_app_id(pid)?
        };
        ids.insert(id, found.clone());
        Some(found)
    }

    /// Forgets the IDs of windows that are gone (window handles get reused).
    fn forget_closed(open: &[Seen]) {
        if let Some(ids) = APP_IDS.lock().unwrap_or_else(|p| p.into_inner()).as_mut() {
            ids.retain(|id, _| open.iter().any(|w| w.id == *id));
        }
    }

    /// The name the shell shows for `shell:AppsFolder\…` ("WhatsApp").
    pub fn shell_name(target: &str) -> Option<String> {
        let wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let item: IShellItem = SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None).ok()?;
            let name = item.GetDisplayName(SIGDN_NORMALDISPLAY).ok()?;
            let text = name.to_string().ok();
            CoTaskMemFree(Some(name.0 as *const c_void));
            text.filter(|t| !t.trim().is_empty())
        }
    }

    /// The windows Alt+Tab would list, in screen order (front first), and the one in front, if it is one of them.
    pub fn open_windows() -> (Vec<Seen>, Option<i64>) {
        struct Walk {
            own_pid: u32,
            found: Vec<Seen>,
        }
        unsafe extern "system" fn visit(hwnd: HWND, data: LPARAM) -> BOOL {
            let walk = unsafe { &mut *(data.0 as *mut Walk) };
            unsafe {
                if !IsWindowVisible(hwnd).as_bool() || GetWindowTextLengthW(hwnd) == 0 {
                    return BOOL(1);
                }
                let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
                let owned = GetWindow(hwnd, GW_OWNER).map(|o| !o.is_invalid()).unwrap_or(false);
                if ex & WS_EX_TOOLWINDOW.0 != 0 || (owned && ex & WS_EX_APPWINDOW.0 == 0) || cloaked(hwnd) {
                    return BOOL(1);
                }
                let class = class_of(hwnd);
                if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
                    return BOOL(1);
                }
                let mut pid = 0u32;
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
                if pid == 0 || pid == walk.own_pid {
                    return BOOL(1);
                }
                let Some(path) = crate::focus::process_path(pid) else { return BOOL(1) };
                let mut buffer = [0u16; 256];
                let len = GetWindowTextW(hwnd, &mut buffer);
                let title = String::from_utf16_lossy(&buffer[..len.max(0) as usize]);
                let id = hwnd.0 as isize as i64;
                let app_id = app_id_of(id, hwnd, pid, &path);
                walk.found.push(Seen { id, title, path, minimized: IsIconic(hwnd).as_bool(), app_id });
            }
            BOOL(1)
        }
        let mut walk = Walk { own_pid: std::process::id(), found: Vec::new() };
        unsafe {
            let _ = EnumWindows(Some(visit), LPARAM(&mut walk as *mut Walk as isize));
        }
        forget_closed(&walk.found);
        let front = unsafe { GetForegroundWindow() };
        let front_id = front.0 as isize as i64;
        let foreground = walk.found.iter().any(|w| w.id == front_id).then_some(front_id);
        (walk.found, foreground)
    }

    pub fn focus(id: i64) {
        crate::focus::bring_to_front(hwnd(id));
    }

    pub fn minimize(id: i64) {
        unsafe {
            let _ = ShowWindow(hwnd(id), SW_MINIMIZE);
        }
    }

    pub fn close(id: i64) {
        unsafe {
            let _ = PostMessageW(Some(hwnd(id)), WM_CLOSE, WPARAM(0), LPARAM(0));
        }
    }

    /// Presses keys together, like a person would: down in order, up in reverse.
    pub fn press(keys: &[u16]) {
        let key = |vk: u16, flags: KEYBD_EVENT_FLAGS| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VIRTUAL_KEY(vk), wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
        };
        let inputs: Vec<INPUT> = keys.iter().map(|&k| key(k, KEYBD_EVENT_FLAGS(0))).chain(keys.iter().rev().map(|&k| key(k, KEYEVENTF_KEYUP))).collect();
        unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }

    /// Windows' taskbar, its tray and the flyouts they open, while one of them is the window in front.
    pub fn tray_in_use() -> bool {
        let front = unsafe { GetForegroundWindow() };
        !front.is_invalid()
            && matches!(
                class_of(front).as_str(),
                "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "TopLevelWindowForOverflowXamlIsland" | "NotifyIconOverflowWindow" | "Xaml_WindowedPopupClass"
            )
    }

    /// Win+B puts the keyboard on the tray's "show hidden icons" arrow (and slides an auto-hidden taskbar in); Enter
    /// opens it. Enter is only pressed once the taskbar really is in front, so it never lands in another app.
    pub fn open_tray() {
        std::thread::sleep(std::time::Duration::from_millis(120));
        press(&[0x5B, b'B' as u16]);
        for _ in 0..16 {
            std::thread::sleep(std::time::Duration::from_millis(40));
            let front = unsafe { GetForegroundWindow() };
            if !front.is_invalid() && class_of(front) == "Shell_TrayWnd" {
                std::thread::sleep(std::time::Duration::from_millis(60));
                press(&[0x0D]);
                return;
            }
        }
    }

    pub fn reveal(path: &str) -> Result<(), String> {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer.exe").raw_arg(format!("/select,\"{path}\"")).spawn().map(|_| ()).map_err(|e| e.to_string())
    }

    /// The program's own name ("Google Chrome"), from its version information.
    pub fn description(path: &str) -> Option<String> {
        let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            let size = GetFileVersionInfoSizeW(PCWSTR(wide.as_ptr()), None);
            if size == 0 {
                return None;
            }
            let mut data = vec![0u8; size as usize];
            GetFileVersionInfoW(PCWSTR(wide.as_ptr()), Some(0), size, data.as_mut_ptr().cast()).ok()?;
            // The first language and code page the file lists.
            let mut table: *mut c_void = std::ptr::null_mut();
            let mut len = 0u32;
            if !VerQueryValueW(data.as_ptr().cast(), w!("\\VarFileInfo\\Translation"), &mut table, &mut len).as_bool() || len < 4 {
                return None;
            }
            let pair = *(table as *const [u16; 2]);
            let key = format!("\\StringFileInfo\\{:04x}{:04x}\\FileDescription\0", pair[0], pair[1]);
            let key: Vec<u16> = key.encode_utf16().collect();
            let mut text: *mut c_void = std::ptr::null_mut();
            if !VerQueryValueW(data.as_ptr().cast(), PCWSTR(key.as_ptr()), &mut text, &mut len).as_bool() || len == 0 {
                return None;
            }
            let slice = std::slice::from_raw_parts(text as *const u16, len as usize);
            let end = slice.iter().position(|&c| c == 0).unwrap_or(slice.len());
            Some(String::from_utf16_lossy(&slice[..end]).trim().to_string())
        }
    }

    fn taskbars() -> Vec<HWND> {
        let mut bars = Vec::new();
        unsafe {
            if let Ok(main) = FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()) {
                bars.push(main);
            }
            unsafe extern "system" fn secondary(hwnd: HWND, data: LPARAM) -> BOOL {
                let bars = unsafe { &mut *(data.0 as *mut Vec<HWND>) };
                if super::win::class_of(hwnd) == "Shell_SecondaryTrayWnd" {
                    bars.push(hwnd);
                }
                BOOL(1)
            }
            let _ = EnumWindows(Some(secondary), LPARAM(&mut bars as *mut Vec<HWND> as isize));
        }
        bars
    }

    pub fn show_taskbars(show: bool) {
        for bar in taskbars() {
            unsafe {
                let _ = ShowWindow(bar, if show { SW_SHOWNA } else { SW_HIDE });
            }
        }
    }

    const ABS_AUTOHIDE: u32 = 0x1;
    const ABS_ALWAYSONTOP: u32 = 0x2;

    fn appbar() -> APPBARDATA {
        APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, hWnd: unsafe { FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()) }.unwrap_or_default(), rc: RECT::default(), ..Default::default() }
    }

    pub fn autohide() -> bool {
        let mut data = appbar();
        unsafe { SHAppBarMessage(ABM_GETSTATE, &mut data) as u32 & ABS_AUTOHIDE != 0 }
    }

    pub fn set_autohide(on: bool) {
        if autohide() == on {
            return;
        }
        let mut data = appbar();
        data.lParam = LPARAM(if on { (ABS_AUTOHIDE | ABS_ALWAYSONTOP) as isize } else { ABS_ALWAYSONTOP as isize });
        unsafe {
            SHAppBarMessage(ABM_SETSTATE, &mut data);
        }
    }
}

#[cfg(not(windows))]
mod win {
    use super::Seen;
    pub fn open_windows() -> (Vec<Seen>, Option<i64>) {
        (Vec::new(), None)
    }
    pub fn focus(_: i64) {}
    pub fn minimize(_: i64) {}
    pub fn close(_: i64) {}
    pub fn press(_: &[u16]) {}
    pub fn tray_in_use() -> bool {
        false
    }
    pub fn open_tray() {}
    pub fn reveal(_: &str) -> Result<(), String> {
        Err("Só no Windows".into())
    }
    pub fn description(_: &str) -> Option<String> {
        None
    }
    pub fn shell_name(_: &str) -> Option<String> {
        None
    }
    pub fn show_taskbars(_: bool) {}
    pub fn autohide() -> bool {
        false
    }
    pub fn set_autohide(_: bool) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seen(id: i64, title: &str, path: &str) -> Seen {
        Seen { id, title: title.into(), path: path.into(), minimized: false, app_id: None }
    }

    #[test]
    fn apps_da_loja_se_agrupam_pelo_id_e_abrem_pela_pasta_de_apps() {
        let mut order = Vec::new();
        let host = r"C:\Windows\System32\ApplicationFrameHost.exe";
        let settings = |id| Seen { app_id: Some("windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel".into()), ..seen(id, "Configurações", host) };
        let whatsapp = Seen { app_id: Some("5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App".into()), ..seen(3, "WhatsApp", r"C:\Program Files\WindowsApps\WhatsApp.Root.exe") };
        let names = |path: &str| if path.ends_with("!App") { "WhatsApp".to_string() } else { String::new() };
        let apps = group(&[settings(1), settings(2), whatsapp], None, &[], &mut order, &names);
        assert_eq!(apps.len(), 2);
        assert_eq!(apps[0].windows.len(), 2);
        // No name from the shell: the window's title.
        assert_eq!(apps[0].name, "Configurações");
        assert_eq!(apps[1].name, "WhatsApp");
        assert_eq!(apps[1].path, r"shell:AppsFolder\5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App");
        // Pinned by that path, it is the same app.
        let pinned = [apps[1].path.clone()];
        let again = group(&[], None, &pinned, &mut order, &names);
        assert_eq!(again[0].key, apps[1].key);
    }

    #[test]
    fn arrastar_muda_a_ordem_e_ela_fica() {
        let mut order = Vec::new();
        let windows = [seen(1, "Chrome", r"C:\c\chrome.exe"), seen(2, "Spotify", r"C:\s\Spotify.exe")];
        let pinned = vec![r"C:\d\Discord.exe".to_string(), r"C:\o\Obsidian.exe".to_string()];
        let apps = group(&windows, None, &pinned, &mut order, &name_from_path);
        assert_eq!(apps.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), ["Discord", "Obsidian", "Chrome", "Spotify"]);
        // Spotify dragged to the front, Obsidian after Chrome: pinned and open apps mix freely.
        let keys: Vec<String> = [3, 0, 2, 1].iter().map(|&i| apps[i].key.clone()).collect();
        let sorted = apply_order(&apps, &keys);
        assert_eq!(sorted.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), ["Spotify", "Discord", "Chrome", "Obsidian"]);
        // The pinned list follows the dock.
        assert_eq!(pinned_in_order(&pinned, &sorted), [r"C:\d\Discord.exe", r"C:\o\Obsidian.exe"]);
        let swapped = apply_order(&apps, &[apps[1].key.clone(), apps[0].key.clone()]);
        assert_eq!(pinned_in_order(&pinned, &swapped), [r"C:\o\Obsidian.exe", r"C:\d\Discord.exe"]);
        // The next reading keeps the new order.
        let mut order: Vec<String> = sorted.iter().map(|a| a.key.clone()).collect();
        let again = group(&windows, None, &pinned, &mut order, &name_from_path);
        assert_eq!(again.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), ["Spotify", "Discord", "Chrome", "Obsidian"]);
    }

    #[test]
    fn atalhos_do_windows_conhecidos() {
        assert_eq!(shortcut_keys("desktop"), Some(&[0x5B, b'D' as u16][..]));
        assert_eq!(shortcut_keys("start"), Some(&[0x5B][..]));
        assert_eq!(shortcut_keys("rm -rf"), None);
    }

    #[test]
    fn nomes_de_apps_da_loja_ficam_limpos() {
        assert_eq!(tidy_name("WhatsApp.Root"), "WhatsApp");
        assert_eq!(tidy_name("Google Chrome"), "Google Chrome");
    }

    #[test]
    fn nome_vem_do_arquivo() {
        assert_eq!(name_from_path(r"C:\Program Files\Google\chrome.exe"), "Chrome");
        assert_eq!(name_from_path("spotify.exe"), "Spotify");
    }

    #[test]
    fn agrupa_por_programa_na_ordem_em_que_apareceram() {
        let mut order = Vec::new();
        let windows = [seen(1, "Docky — GitHub", r"C:\c\chrome.exe"), seen(2, "Spotify", r"C:\s\Spotify.exe"), seen(3, "Gmail", r"C:\c\chrome.exe")];
        let apps = group(&windows, Some(3), &[], &mut order, &name_from_path);
        assert_eq!(apps.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), ["Chrome", "Spotify"]);
        assert_eq!(apps[0].windows.len(), 2);
        assert!(apps[0].focused);
        assert!(!apps[1].focused);
        // Spotify stays second even when it comes first in screen order next time.
        let again = group(&[windows[1].clone(), windows[0].clone()], None, &[], &mut order, &name_from_path);
        assert_eq!(again[0].name, "Chrome");
    }

    #[test]
    fn fixados_vem_primeiro_mesmo_fechados() {
        let mut order = Vec::new();
        let windows = [seen(1, "Spotify", r"C:\s\Spotify.exe")];
        let pinned = [r"C:\d\Discord.exe".to_string(), r"C:\s\Spotify.exe".to_string()];
        let apps = group(&windows, None, &pinned, &mut order, &name_from_path);
        assert_eq!(apps.iter().map(|a| (a.name.as_str(), a.windows.len(), a.pinned)).collect::<Vec<_>>(), [("Discord", 0, true), ("Spotify", 1, true)]);
    }

    #[test]
    fn apps_hospedados_se_separam_pelo_titulo() {
        let mut order = Vec::new();
        let host = r"C:\Windows\System32\ApplicationFrameHost.exe";
        let apps = group(&[seen(1, "Calculadora", host), seen(2, "Configurações", host)], None, &[], &mut order, &name_from_path);
        assert_eq!(apps.len(), 2);
        assert_eq!(apps[0].name, "Calculadora");
        assert!(apps[0].path.is_empty());
    }
}

#[cfg(all(test, windows))]
mod real {
    /// Lists this PC's open apps (no changes): `cargo test --lib taskbar::real -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn lista_os_apps_abertos_deste_pc() {
        let (seen, front) = super::win::open_windows();
        let mut order = Vec::new();
        for app in super::group(&seen, front, &[], &mut order, &super::name_for) {
            println!("{} | {} janela(s) | foco: {} | {}", app.name, app.windows.len(), app.focused, app.path);
        }
    }
}
