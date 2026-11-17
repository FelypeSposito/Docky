//! "Is there a newer Docky?": asks GitHub for the latest release, a while after startup and then twice a day. Only the
//! public release list is read (no account, nothing about you is sent), and it can be turned off in Settings.
//! A newer version shows in Settings, Geral, Sobre, with a button to the release page.

use std::{sync::Mutex, thread, time::Duration};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::config::ConfigState;

const LATEST: &str = "https://api.github.com/repos/FelypeSposito/Docky/releases/latest";
const FIRST_CHECK: Duration = Duration::from_secs(45);
const EVERY: Duration = Duration::from_secs(12 * 60 * 60);

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    /// The release page, to download the installer.
    pub url: String,
}

#[derive(Default)]
pub struct UpdateState(Mutex<Option<UpdateInfo>>);

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

/// "v0.3.0", "0.3.0" → (0, 3, 0). Anything after a "-" (a pre-release) or that does not parse gives None.
pub fn parse_version(text: &str) -> Option<(u64, u64, u64)> {
    let text = text.trim().trim_start_matches(['v', 'V']);
    if text.contains('-') {
        return None;
    }
    let mut parts = text.split('.').map(|p| p.parse::<u64>().ok());
    let version = (parts.next()??, parts.next()??, parts.next().unwrap_or(Some(0))?);
    parts.next().is_none().then_some(version)
}

/// The release, if it is newer than the running version.
pub fn newer(current: &str, tag: &str) -> bool {
    matches!((parse_version(current), parse_version(tag)), (Some(now), Some(latest)) if latest > now)
}

fn check() -> Result<Option<UpdateInfo>, String> {
    let mut response = ureq::get(LATEST)
        .header("User-Agent", "Docky-update-check")
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| e.to_string())?;
    let body = response.body_mut().read_to_string().map_err(|e| e.to_string())?;
    let release: Release = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    if release.draft || release.prerelease || !newer(env!("CARGO_PKG_VERSION"), &release.tag_name) {
        return Ok(None);
    }
    Ok(Some(UpdateInfo { version: release.tag_name.trim_start_matches(['v', 'V']).to_string(), url: release.html_url }))
}

/// What the last check found (None: up to date, not checked yet, or turned off).
#[tauri::command]
pub fn update_available(state: State<UpdateState>) -> Option<UpdateInfo> {
    state.0.lock().ok().and_then(|found| found.clone())
}

pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        thread::sleep(FIRST_CHECK);
        loop {
            if app.state::<ConfigState>().get().check_updates {
                match check() {
                    Ok(found) => {
                        if let Some(info) = &found {
                            crate::logfile::write("info", &format!("versão nova disponível: {}", info.version));
                        }
                        if let Ok(mut slot) = app.state::<UpdateState>().0.lock() {
                            *slot = found;
                        }
                    }
                    // No network, GitHub down or rate-limited: try again at the next round, quietly.
                    Err(e) => crate::logfile::write("warn", &format!("não deu para procurar atualizações: {e}")),
                }
            }
            thread::sleep(EVERY);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_as_versoes() {
        assert_eq!(parse_version("v0.3.0"), Some((0, 3, 0)));
        assert_eq!(parse_version("1.2"), Some((1, 2, 0)));
        assert_eq!(parse_version("0.3.0-beta.1"), None);
        assert_eq!(parse_version("latest"), None);
        assert_eq!(parse_version("1.2.3.4"), None);
    }

    #[test]
    fn so_avisa_versao_maior() {
        assert!(newer("0.2.24", "v0.3.0"));
        assert!(newer("0.2.9", "v0.2.10"));
        assert!(!newer("0.2.24", "v0.2.24"));
        assert!(!newer("0.3.0", "v0.2.30"));
        assert!(!newer("0.2.24", "v0.4.0-rc.1"));
    }
}
