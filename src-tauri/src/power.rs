use std::{thread, time::Duration};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Power {
    pub has_battery: bool,
    pub percent: u8,
    pub charging: bool,
    pub plugged: bool,
}

#[cfg(windows)]
fn read() -> Option<Power> {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

    const FLAG_CHARGING: u8 = 8;
    const FLAG_NO_BATTERY: u8 = 128;
    const FLAG_UNKNOWN: u8 = 255;
    const AC_ONLINE: u8 = 1;

    let mut status = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut status) }.ok()?;

    let has_battery = status.BatteryFlag & FLAG_NO_BATTERY == 0 && status.BatteryFlag != FLAG_UNKNOWN;
    Some(Power {
        has_battery,
        percent: if status.BatteryLifePercent <= 100 { status.BatteryLifePercent } else { 0 },
        charging: status.BatteryFlag & FLAG_CHARGING != 0,
        plugged: status.ACLineStatus == AC_ONLINE,
    })
}

#[cfg(not(windows))]
fn read() -> Option<Power> {
    None
}

#[tauri::command]
pub fn get_power() -> Option<Power> {
    read()
}

/// Avisa o frontend (evento `power`) sempre que a bateria ou o carregador mudam.
pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        let mut last = None;
        loop {
            let current = read();
            if current != last {
                if let Some(power) = current {
                    let _ = app.emit_to("island", "power", power);
                }
                last = current;
            }
            thread::sleep(Duration::from_secs(2));
        }
    });
}
