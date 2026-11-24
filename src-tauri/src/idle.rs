//! How long the computer has gone without a key press or a mouse move: with nothing to do and nobody at the computer,
//! the Clawd in place of the eyes goes to sleep.

/// Seconds since the last keyboard or mouse input on this computer (0 when Windows does not say).
#[tauri::command]
pub fn idle_seconds() -> u64 {
    imp::idle_seconds()
}

#[cfg(windows)]
mod imp {
    use windows::Win32::{
        System::SystemInformation::GetTickCount,
        UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
    };

    pub fn idle_seconds() -> u64 {
        let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
        if !unsafe { GetLastInputInfo(&mut info) }.as_bool() {
            return 0;
        }
        // Both are milliseconds since Windows started, in 32 bits: the subtraction wraps the same way they do.
        let now = unsafe { GetTickCount() };
        u64::from(now.wrapping_sub(info.dwTime) / 1000)
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn idle_seconds() -> u64 {
        0
    }
}
