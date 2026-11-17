//! Quick reminders ("15 min tirar a pizza", typed in the note field). They live here, not in the island, so they fire
//! once even with an island on each screen, and survive a restart: they are kept in `reminders.json` next to the
//! config. One that came due while Docky was closed fires as soon as it opens.

use std::{
    fs,
    path::PathBuf,
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

/// More than this many pending reminders is a mistake (a stuck key), not a plan.
const LIMIT: usize = 50;
const MAX_TEXT: usize = 300;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: u64,
    pub text: String,
    /// Unix ms
    pub at: u64,
}

pub struct ReminderState {
    path: Option<PathBuf>,
    list: Mutex<Vec<Reminder>>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Splits the reminders into the ones due at `now` (oldest first) and the ones still to come.
pub fn take_due(list: Vec<Reminder>, now: u64) -> (Vec<Reminder>, Vec<Reminder>) {
    let (mut due, rest): (Vec<_>, Vec<_>) = list.into_iter().partition(|r| r.at <= now);
    due.sort_by_key(|r| r.at);
    (due, rest)
}

impl ReminderState {
    pub fn load(app: &AppHandle) -> Self {
        let path = app.path().app_config_dir().ok().map(|dir| dir.join("reminders.json"));
        let list = path
            .as_ref()
            .and_then(|p| fs::read_to_string(p).ok())
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        Self { path, list: Mutex::new(list) }
    }

    fn with<T>(&self, f: impl FnOnce(&mut Vec<Reminder>) -> T) -> T {
        let mut list = self.list.lock().unwrap_or_else(|p| p.into_inner());
        let out = f(&mut list);
        if let Some(path) = &self.path {
            if let Ok(text) = serde_json::to_string_pretty(&*list) {
                let _ = fs::write(path, text);
            }
        }
        out
    }

    fn list(&self) -> Vec<Reminder> {
        let mut list = self.list.lock().unwrap_or_else(|p| p.into_inner()).clone();
        list.sort_by_key(|r| r.at);
        list
    }
}

fn announce(app: &AppHandle) {
    crate::island::emit(app, "reminders", app.state::<ReminderState>().list());
}

#[tauri::command]
pub fn reminder_list(state: State<ReminderState>) -> Vec<Reminder> {
    state.list()
}

#[tauri::command]
pub fn reminder_add(app: AppHandle, state: State<ReminderState>, text: String, at: u64) -> Result<Reminder, String> {
    let text: String = text.trim().chars().take(MAX_TEXT).collect();
    if text.is_empty() {
        return Err("Falta o que lembrar".into());
    }
    if at <= now_ms() {
        return Err("Esse horário já passou".into());
    }
    let reminder = state.with(|list| {
        if list.len() >= LIMIT {
            return Err(format!("Já são {LIMIT} lembretes esperando"));
        }
        let id = list.iter().map(|r| r.id).max().unwrap_or(0) + 1;
        let reminder = Reminder { id, text, at };
        list.push(reminder.clone());
        Ok(reminder)
    })?;
    announce(&app);
    Ok(reminder)
}

#[tauri::command]
pub fn reminder_cancel(app: AppHandle, state: State<ReminderState>, id: u64) {
    state.with(|list| list.retain(|r| r.id != id));
    announce(&app);
}

/// Checks every second; each due reminder goes to the islands once and leaves the list.
pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        // A reminder that came due while Docky was closed waits for the islands to be up and listening.
        thread::sleep(Duration::from_secs(8));
        loop {
            tick(&app);
            thread::sleep(Duration::from_secs(1));
        }
    });
}

fn tick(app: &AppHandle) {
    let state = app.state::<ReminderState>();
    let has_due = state.list.lock().map(|l| l.iter().any(|r| r.at <= now_ms())).unwrap_or(false);
    if !has_due {
        return;
    }
    let due = state.with(|list| {
        let (due, rest) = take_due(std::mem::take(list), now_ms());
        *list = rest;
        due
    });
    for reminder in due {
        crate::island::emit(app, "reminder", reminder);
    }
    announce(app);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(id: u64, at: u64) -> Reminder {
        Reminder { id, text: format!("r{id}"), at }
    }

    #[test]
    fn separa_os_que_venceram_do_mais_velho_para_o_mais_novo() {
        let (due, rest) = take_due(vec![r(1, 300), r(2, 100), r(3, 900), r(4, 200)], 300);
        assert_eq!(due.iter().map(|r| r.id).collect::<Vec<_>>(), [2, 4, 1]);
        assert_eq!(rest.iter().map(|r| r.id).collect::<Vec<_>>(), [3]);
    }

    #[test]
    fn nada_vence_antes_da_hora() {
        let (due, rest) = take_due(vec![r(1, 500)], 499);
        assert!(due.is_empty());
        assert_eq!(rest.len(), 1);
    }
}
