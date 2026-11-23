//! Docky had its own taskbar, a dock (0.4.0 to 0.5.1), that could hide Windows' taskbar: auto-hide on, and the bar out
//! of sight. The dock is gone, but someone may update (or uninstall) with the bar still hidden. The state from before
//! was written to `taskbar.json`; while that file exists, Windows' taskbar is put back as it was and the file removed.

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

/// Brings Windows' taskbar back as it was before the old dock hid it. Does nothing when it never did.
pub fn restore_taskbar() {
    let Some(path) = saved_path() else { return };
    let Some(saved) = fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str::<Saved>(&t).ok()) else { return };
    win::set_autohide(saved.autohide);
    win::show_taskbars();
    let _ = fs::remove_file(path);
}

#[cfg(windows)]
mod win {
    use windows::{
        Win32::{
            Foundation::{HWND, LPARAM, RECT},
            UI::{
                Shell::{ABM_GETSTATE, ABM_SETSTATE, APPBARDATA, SHAppBarMessage},
                WindowsAndMessaging::{EnumWindows, FindWindowW, GetClassNameW, SW_SHOWNA, ShowWindow},
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

    pub fn show_taskbars() {
        for bar in taskbars() {
            unsafe {
                let _ = ShowWindow(bar, SW_SHOWNA);
            }
        }
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
    pub fn show_taskbars() {}
    pub fn set_autohide(_: bool) {}
}
