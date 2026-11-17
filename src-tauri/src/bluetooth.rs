//! Battery of Bluetooth headphones: a short notice with the charge when they connect, and another when it runs low.
//!
//! Windows keeps the charge that a headset reports (over the hands-free profile) as a property of its device node,
//! the same number the Settings app shows. Only devices that report a charge are watched, so a keyboard or a phone
//! paired without one never shows up. Whether a device is connected comes from the WinRT Bluetooth API.

use std::{collections::HashMap, thread, time::Duration};

use serde::Serialize;
use tauri::{AppHandle, Manager};

/// How often the devices are read: cheap (a few device nodes), and a notice a few seconds late is fine.
const POLL: Duration = Duration::from_secs(4);
/// A headset sends its charge a moment after it connects; before that the value is the one from last time.
const POLLS_BEFORE_NOTICE: u32 = 2;
/// Give up on a notice if the device never reports a charge after connecting.
const POLLS_GIVE_UP: u32 = 8;
/// At or below this the "low battery" notice shows, once per connection.
const LOW: u8 = 20;

/// One device as read on a poll.
#[derive(Debug, Clone, PartialEq)]
pub struct Reading {
    pub address: u64,
    pub name: String,
    pub battery: Option<u8>,
    pub connected: bool,
}

/// What the island shows.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BatteryNotice {
    pub name: String,
    pub percent: u8,
    /// The charge just dropped to `LOW` or below (otherwise the device just connected).
    pub low: bool,
}

#[derive(Debug, Default)]
struct Device {
    connected: bool,
    /// Polls since it connected, while its notice is still to come.
    pending: Option<u32>,
    battery: Option<u8>,
    warned_low: bool,
}

/// Turns polls into notices. The first poll only learns what is already connected: no notice at startup.
#[derive(Debug, Default)]
pub struct Tracker {
    devices: HashMap<u64, Device>,
    started: bool,
}

impl Tracker {
    pub fn poll(&mut self, readings: &[Reading]) -> Vec<BatteryNotice> {
        let first = !self.started;
        self.started = true;
        let mut notices = Vec::new();
        for r in readings {
            let device = self.devices.entry(r.address).or_default();
            if r.connected && !device.connected {
                device.pending = if first { None } else { Some(0) };
                device.warned_low = false;
            }
            if !r.connected {
                device.pending = None;
            }
            device.connected = r.connected;

            if let Some(polls) = device.pending.as_mut() {
                *polls += 1;
                if *polls >= POLLS_BEFORE_NOTICE {
                    if let Some(percent) = r.battery {
                        notices.push(BatteryNotice { name: r.name.clone(), percent, low: false });
                        device.pending = None;
                        device.warned_low = percent <= LOW;
                    } else if *polls >= POLLS_GIVE_UP {
                        device.pending = None;
                    }
                }
            } else if r.connected && !first && !device.warned_low {
                if let (Some(before), Some(now)) = (device.battery, r.battery) {
                    if before > LOW && now <= LOW {
                        notices.push(BatteryNotice { name: r.name.clone(), percent: now, low: true });
                        device.warned_low = true;
                    }
                }
            }
            device.battery = r.battery;
        }
        notices
    }
}

/// The Bluetooth address in a device instance id: `BTHENUM\DEV_B0F00C63786C\…` or a service node ending in
/// `…&B0F00C63786C_C00000000`.
pub fn address_of(instance_id: &str) -> Option<u64> {
    let upper = instance_id.to_ascii_uppercase();
    let hex = if let Some(at) = upper.find("\\DEV_") {
        upper.get(at + 5..at + 17)?.to_string()
    } else {
        let last = upper.rsplit('\\').next()?;
        let tail = last.rsplit('&').next()?;
        tail.split('_').next()?.to_string()
    };
    if hex.len() != 12 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    u64::from_str_radix(&hex, 16).ok().filter(|a| *a != 0)
}

/// "UGREEN Studio Pro Hands-Free AG" → "UGREEN Studio Pro": the name of a service node without the profile.
pub fn device_name(service_name: &str) -> String {
    let mut name = service_name.trim();
    for suffix in [" Hands-Free AG", " Hands-Free", " Avrcp Transport", " Stereo"] {
        if let Some(stripped) = name.strip_suffix(suffix) {
            name = stripped.trim_end();
        }
    }
    name.to_string()
}

pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        let mut tracker = Tracker::default();
        loop {
            let notices = tracker.poll(&win::read());
            if !notices.is_empty() && app.state::<crate::config::ConfigState>().get().notice_bluetooth {
                for notice in notices {
                    crate::island::emit(&app, "bt-battery", notice);
                }
            }
            thread::sleep(POLL);
        }
    });
}

#[cfg(windows)]
mod win {
    use std::collections::HashMap;

    use windows::{
        core::{w, GUID},
        Devices::Bluetooth::{BluetoothConnectionStatus, BluetoothDevice},
        Win32::{
            Devices::{
                DeviceAndDriverInstallation::{SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW, SetupDiGetDeviceInstanceIdW, SetupDiGetDevicePropertyW, DIGCF_ALLCLASSES, DIGCF_PRESENT, HDEVINFO, SP_DEVINFO_DATA},
                Properties::{DEVPKEY_Device_FriendlyName, DEVPROPTYPE, DEVPROP_TYPE_BYTE, DEVPROP_TYPE_STRING},
            },
            Foundation::DEVPROPKEY,
        },
    };

    use super::{address_of, device_name, Reading};

    /// The charge a Bluetooth device reports, as Windows stores it on the device node (0 to 100).
    const BATTERY: DEVPROPKEY = DEVPROPKEY { fmtid: GUID::from_u128(0x104ea319_6ee2_4701_bd47_8ddbf425bbe5), pid: 2 };

    fn property(set: HDEVINFO, info: &SP_DEVINFO_DATA, key: &DEVPROPKEY) -> Option<(DEVPROPTYPE, Vec<u8>)> {
        let mut kind = DEVPROPTYPE::default();
        let mut buffer = vec![0u8; 512];
        let mut size = 0u32;
        unsafe { SetupDiGetDevicePropertyW(set, info, key, &mut kind, Some(&mut buffer), Some(&mut size), 0) }.ok()?;
        buffer.truncate(size as usize);
        Some((kind, buffer))
    }

    fn text(bytes: &[u8]) -> String {
        let wide: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).take_while(|&c| c != 0).collect();
        String::from_utf16_lossy(&wide)
    }

    fn instance_id(set: HDEVINFO, info: &SP_DEVINFO_DATA) -> Option<String> {
        let mut buffer = vec![0u16; 512];
        let mut size = 0u32;
        unsafe { SetupDiGetDeviceInstanceIdW(set, info, Some(&mut buffer), Some(&mut size)) }.ok()?;
        Some(String::from_utf16_lossy(&buffer[..(size as usize).saturating_sub(1).min(buffer.len())]))
    }

    fn connected(address: u64) -> bool {
        BluetoothDevice::FromBluetoothAddressAsync(address)
            .and_then(|op| op.get())
            .and_then(|device| device.ConnectionStatus())
            .map(|status| status == BluetoothConnectionStatus::Connected)
            .unwrap_or(false)
    }

    /// The paired devices that report a charge, with their name and whether they are connected now.
    pub fn read() -> Vec<Reading> {
        let mut battery: HashMap<u64, (u8, String)> = HashMap::new();
        let mut names: HashMap<u64, String> = HashMap::new();
        unsafe {
            let Ok(set) = SetupDiGetClassDevsW(None, w!("BTHENUM"), None, DIGCF_PRESENT | DIGCF_ALLCLASSES) else {
                return Vec::new();
            };
            let mut index = 0;
            loop {
                let mut info = SP_DEVINFO_DATA { cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32, ..Default::default() };
                if SetupDiEnumDeviceInfo(set, index, &mut info).is_err() {
                    break;
                }
                index += 1;
                let Some(address) = instance_id(set, &info).as_deref().and_then(address_of) else { continue };
                let name = property(set, &info, &DEVPKEY_Device_FriendlyName).filter(|(k, _)| *k == DEVPROP_TYPE_STRING).map(|(_, b)| text(&b)).unwrap_or_default();
                let is_device_node = instance_id(set, &info).is_some_and(|id| id.to_ascii_uppercase().contains("\\DEV_"));
                if is_device_node && !name.is_empty() {
                    names.insert(address, name.clone());
                }
                if let Some((kind, bytes)) = property(set, &info, &BATTERY) {
                    if kind == DEVPROP_TYPE_BYTE && !bytes.is_empty() && bytes[0] <= 100 {
                        battery.insert(address, (bytes[0], device_name(&name)));
                    }
                }
            }
            let _ = SetupDiDestroyDeviceInfoList(set);
        }
        battery
            .into_iter()
            .map(|(address, (percent, service_name))| Reading {
                address,
                name: names.get(&address).cloned().filter(|n| !n.is_empty()).unwrap_or(service_name),
                battery: Some(percent),
                connected: connected(address),
            })
            .collect()
    }
}

#[cfg(not(windows))]
mod win {
    pub fn read() -> Vec<super::Reading> {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fone(battery: Option<u8>, connected: bool) -> Reading {
        Reading { address: 1, name: "Fone".into(), battery, connected }
    }

    #[test]
    fn acha_o_endereco_no_id_do_dispositivo() {
        assert_eq!(address_of(r"BTHENUM\DEV_B0F00C63786C\7&3A387F5E&0&BLUETOOTHDEVICE_B0F00C63786C"), Some(0xB0F00C63786C));
        assert_eq!(address_of(r"BTHENUM\{0000111E-0000-1000-8000-00805F9B34FB}_VID&000105D6_PID&0001\8&2E1&0&B0F00C63786C_C00000000"), Some(0xB0F00C63786C));
        assert_eq!(address_of(r"BTH\MS_BTHBRB\6&2613CA43&0&1"), None);
        assert_eq!(address_of(r"BTHENUM\{00001101}\7&1&0&000000000000_00000000"), None);
    }

    #[test]
    fn tira_o_perfil_do_nome() {
        assert_eq!(device_name("UGREEN Studio Pro Hands-Free AG"), "UGREEN Studio Pro");
        assert_eq!(device_name("WH-1000XM5"), "WH-1000XM5");
    }

    #[test]
    fn nao_avisa_o_que_ja_estava_conectado_ao_abrir() {
        let mut t = Tracker::default();
        assert!(t.poll(&[fone(Some(80), true)]).is_empty());
        assert!(t.poll(&[fone(Some(80), true)]).is_empty());
        assert!(t.poll(&[fone(Some(80), true)]).is_empty());
    }

    #[test]
    fn avisa_ao_conectar_depois_que_a_carga_chega() {
        let mut t = Tracker::default();
        t.poll(&[fone(Some(50), false)]);
        assert!(t.poll(&[fone(Some(50), true)]).is_empty());
        let notices = t.poll(&[fone(Some(85), true)]);
        assert_eq!(notices, vec![BatteryNotice { name: "Fone".into(), percent: 85, low: false }]);
        assert!(t.poll(&[fone(Some(85), true)]).is_empty());
    }

    #[test]
    fn desiste_se_a_carga_nunca_chega() {
        let mut t = Tracker::default();
        t.poll(&[fone(None, false)]);
        for _ in 0..POLLS_GIVE_UP + 2 {
            assert!(t.poll(&[fone(None, true)]).is_empty());
        }
    }

    #[test]
    fn avisa_bateria_baixa_uma_vez_por_conexao() {
        let mut t = Tracker::default();
        t.poll(&[fone(Some(40), true)]);
        assert!(t.poll(&[fone(Some(25), true)]).is_empty());
        assert_eq!(t.poll(&[fone(Some(20), true)]), vec![BatteryNotice { name: "Fone".into(), percent: 20, low: true }]);
        assert!(t.poll(&[fone(Some(15), true)]).is_empty());
        // Reconnected with a low charge: the connect notice says it, no second "low" right after.
        t.poll(&[fone(Some(15), false)]);
        t.poll(&[fone(Some(15), true)]);
        assert_eq!(t.poll(&[fone(Some(15), true)]).len(), 1);
        assert!(t.poll(&[fone(Some(12), true)]).is_empty());
    }
}

#[cfg(all(test, windows))]
mod real {
    /// Reads this machine's devices (no changes): `cargo test --lib bluetooth::real -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn le_os_dispositivos_deste_pc() {
        println!("{:#?}", super::win::read());
    }
}
