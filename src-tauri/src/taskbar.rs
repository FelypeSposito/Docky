//! Docky had its own taskbar, a dock (0.4.0 to 0.5.1), that could hide Windows' taskbar: auto-hide on, and the bar out
//! of sight. The dock is gone, but someone may update (or uninstall) with the bar still hidden. The state from before
//! was written to `taskbar.json`; while that file exists, Windows' taskbar is put back as it was and the file removed
//! (only once a taskbar was there to put back).

use std::{fs, path::PathBuf};

use serde::Deserialize;

/// Where the dock kept the taskbar's state from before it hid it.
fn saved_path() -> Option<PathBuf> {
    let base = std::env::var_os("APPDATA")?;
    Some(PathBuf::from(base).join("com.docky.desktop").join("taskbar.json"))
}

#[derive(Deserialize)]
struct Saved {
    autohide: bool,
}

/// How many times (2 s apart) a restore at Docky's start tries again while Explorer's taskbars come up.
const TRIES: u32 = 60;

/// Brings Windows' taskbar back as it was before the old dock hid it. Does nothing when it never did. When Docky
/// starts with Windows, Explorer (and its taskbars, the other screens' last) may not be up yet: then it keeps trying
/// for a while, and the note stays for the next start if the main taskbar never shows.
pub fn restore_taskbar() {
    if saved_path().is_some_and(|p| p.exists()) && !try_restore(false) {
        std::thread::spawn(|| {
            for n in 1..=TRIES {
                std::thread::sleep(std::time::Duration::from_secs(2));
                if try_restore(n == TRIES) {
                    return;
                }
            }
        });
    }
}

/// The same, once and at once: for the uninstaller, which exits right after (Explorer is up by then).
pub fn restore_taskbar_now() {
    try_restore(true);
}

/// One try: false while there is a note and a taskbar still to put back. The note goes once every screen has its bar
/// back, or, on the last try, once the main one is (the other screens may have no taskbar at all).
fn try_restore(last: bool) -> bool {
    let Some(path) = saved_path() else { return true };
    let Ok(text) = fs::read_to_string(&path) else { return true };
    if !win::taskbar_up() {
        return false;
    }
    // A note that cannot be read still means the bar may be hidden: it is shown, and auto-hide left as it is.
    if let Ok(saved) = serde_json::from_str::<Saved>(&text) {
        win::set_autohide(saved.autohide);
    }
    let shown = win::show_taskbars();
    if last || shown >= win::screens() {
        let _ = fs::remove_file(path);
        return true;
    }
    false
}

#[cfg(windows)]
mod win {
    use windows::{
        Win32::{
            Foundation::{HWND, LPARAM, RECT},
            UI::{
                Shell::{ABM_GETSTATE, ABM_SETSTATE, APPBARDATA, SHAppBarMessage},
                WindowsAndMessaging::{EnumWindows, FindWindowW, GetClassNameW, GetSystemMetrics, SM_CMONITORS, SW_SHOWNA, ShowWindow},
            },
        },
        core::{BOOL, PCWSTR, w},
    };

    /// The main taskbar and the ones on other screens.
    fn taskbars() -> Vec<HWND> {
        unsafe extern "system" fn secondary(hwnd: HWND, data: LPARAM) -> BOOL {
            let bars = unsafe { &mut *(data.0 as *mut Vec<HWND>) };
            let mut buffer = [0u16; 64];
            let len = unsafe { GetClassNameW(hwnd, &mut buffer) };
            if String::from_utf16_lossy(&buffer[..len.max(0) as usize]) == "Shell_SecondaryTrayWnd" {
                bars.push(hwnd);
            }
            BOOL(1)
        }
        let mut bars = Vec::new();
        unsafe {
            if let Ok(main) = FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()) {
                bars.push(main);
            }
            let _ = EnumWindows(Some(secondary), LPARAM(&mut bars as *mut Vec<HWND> as isize));
        }
        bars
    }

    /// Whether Explorer's main taskbar exists (it does not yet early in a Windows start).
    pub fn taskbar_up() -> bool {
        unsafe { FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()) }.is_ok_and(|h| !h.is_invalid())
    }

    /// Shows every taskbar there is now, and says how many.
    pub fn show_taskbars() -> usize {
        let bars = taskbars();
        for bar in &bars {
            unsafe {
                let _ = ShowWindow(*bar, SW_SHOWNA);
            }
        }
        bars.len()
    }

    /// How many screens Windows has: with "show the taskbar on all displays", each gets a bar.
    pub fn screens() -> usize {
        unsafe { GetSystemMetrics(SM_CMONITORS) }.max(1) as usize
    }

    const ABS_AUTOHIDE: u32 = 0x1;
    const ABS_ALWAYSONTOP: u32 = 0x2;

    fn appbar() -> APPBARDATA {
        APPBARDATA {
            cbSize: std::mem::size_of::<APPBARDATA>() as u32,
            hWnd: unsafe { FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()) }.unwrap_or_default(),
            rc: RECT::default(),
            ..Default::default()
        }
    }

    pub fn set_autohide(on: bool) {
        let mut data = appbar();
        let now = unsafe { SHAppBarMessage(ABM_GETSTATE, &mut data) } as u32 & ABS_AUTOHIDE != 0;
        if now == on {
            return;
        }
        data.lParam = LPARAM(if on { (ABS_AUTOHIDE | ABS_ALWAYSONTOP) as isize } else { ABS_ALWAYSONTOP as isize });
        unsafe {
            SHAppBarMessage(ABM_SETSTATE, &mut data);
        }
    }
}

#[cfg(not(windows))]
mod win {
    pub fn taskbar_up() -> bool {
        true
    }
    pub fn show_taskbars() -> usize {
        1
    }
    pub fn screens() -> usize {
        1
    }
    pub fn set_autohide(_: bool) {}
}
