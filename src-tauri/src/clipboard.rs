//! Clipboard history: the last texts you copied, so one click puts an older one back.
//!
//! Only text, only in memory (it is gone when Docky closes), and never what password managers and other apps mark as
//! private: Windows has formats for that ("ExcludeClipboardContentFromMonitorProcessing", "CanIncludeInClipboardHistory"
//! set to 0 and "Clipboard Viewer Ignore"), the same ones the Windows clipboard history (Win+V) respects.

use std::{
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::config::ConfigState;

/// How many texts the history keeps.
const LIMIT: usize = 10;
/// Longer texts (a whole log, a book) are left out: the history is for the small things you copy all day.
const MAX_CHARS: usize = 100_000;
/// What the island gets of each text: enough for two lines, the rest stays here until it is copied back.
const PREVIEW_CHARS: usize = 280;

#[derive(Debug, Clone, PartialEq)]
struct Entry {
    id: u64,
    text: String,
    /// Unix ms
    at: u64,
}

/// One copied text, as the island shows it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClipItem {
    pub id: u64,
    /// The start of the text, with the spacing tidied for one or two lines.
    pub preview: String,
    /// Characters in the whole text.
    pub chars: usize,
    /// Unix ms
    pub at: u64,
}

#[derive(Debug, Default)]
pub struct History {
    entries: Vec<Entry>,
    next_id: u64,
}

impl History {
    /// Adds a copied text at the top. Copying the same text again moves it up instead of repeating it.
    /// Returns false when the text is not worth keeping (blank or too long).
    pub fn push(&mut self, text: String, at: u64) -> bool {
        if text.trim().is_empty() || text.chars().count() > MAX_CHARS {
            return false;
        }
        self.entries.retain(|e| e.text != text);
        self.next_id += 1;
        self.entries.insert(0, Entry { id: self.next_id, text, at });
        self.entries.truncate(LIMIT);
        true
    }

    pub fn text(&self, id: u64) -> Option<&str> {
        self.entries.iter().find(|e| e.id == id).map(|e| e.text.as_str())
    }

    pub fn remove(&mut self, id: u64) {
        self.entries.retain(|e| e.id != id);
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }

    pub fn items(&self) -> Vec<ClipItem> {
        self.entries.iter().map(|e| ClipItem { id: e.id, preview: preview(&e.text), chars: e.text.chars().count(), at: e.at }).collect()
    }
}

/// The text squeezed for a short preview: runs of spaces, tabs and line breaks become one space.
fn preview(text: &str) -> String {
    let squeezed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if squeezed.chars().count() <= PREVIEW_CHARS {
        squeezed
    } else {
        let cut: String = squeezed.chars().take(PREVIEW_CHARS).collect();
        format!("{}…", cut.trim_end())
    }
}

pub struct ClipboardState(Mutex<History>);

impl ClipboardState {
    pub fn new() -> Self {
        Self(Mutex::new(History::default()))
    }

    fn with<T>(&self, f: impl FnOnce(&mut History) -> T) -> T {
        let mut history = self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        f(&mut history)
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn announce(app: &AppHandle) {
    let items = app.state::<ClipboardState>().with(|h| h.items());
    crate::island::emit(app, "clipboard", items);
}

#[tauri::command]
pub fn clipboard_history(state: State<ClipboardState>) -> Vec<ClipItem> {
    state.with(|h| h.items())
}

/// Puts an older text back on the clipboard (it then goes to the top of the history).
#[tauri::command]
pub fn clipboard_copy(app: AppHandle, state: State<ClipboardState>, id: u64) -> Result<(), String> {
    let text = state.with(|h| h.text(id).map(str::to_string)).ok_or("Esse texto não está mais no histórico")?;
    win::write_text(&text)?;
    // The watcher would see it too, but answering now makes the island react at once.
    state.with(|h| h.push(text, now_ms()));
    announce(&app);
    Ok(())
}

#[tauri::command]
pub fn clipboard_remove(app: AppHandle, state: State<ClipboardState>, id: u64) {
    state.with(|h| h.remove(id));
    announce(&app);
}

#[tauri::command]
pub fn clipboard_clear(app: AppHandle, state: State<ClipboardState>) {
    state.with(|h| h.clear());
    announce(&app);
}

/// Watches the clipboard: a cheap counter from Windows says when it changed, and only then is it read.
pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        let mut seen = win::sequence();
        loop {
            thread::sleep(Duration::from_millis(400));
            let now = win::sequence();
            if now == seen {
                continue;
            }
            seen = now;
            if !app.state::<ConfigState>().get().clipboard_history {
                continue;
            }
            let Some(text) = win::read_text() else { continue };
            if app.state::<ClipboardState>().with(|h| h.push(text, now_ms())) {
                announce(&app);
            }
        }
    });
}

#[cfg(windows)]
mod win {
    use std::{thread, time::Duration};

    use windows::{
        core::w,
        Win32::{
            Foundation::{HANDLE, HGLOBAL},
            System::{
                DataExchange::{CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber, IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW, SetClipboardData},
                Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE},
                Ole::CF_UNICODETEXT,
            },
        },
    };

    pub fn sequence() -> u32 {
        unsafe { GetClipboardSequenceNumber() }
    }

    /// Opens the clipboard, waiting a little if another app has it open right now.
    fn open() -> bool {
        for _ in 0..8 {
            if unsafe { OpenClipboard(None) }.is_ok() {
                return true;
            }
            thread::sleep(Duration::from_millis(25));
        }
        false
    }

    struct Opened;
    impl Drop for Opened {
        fn drop(&mut self) {
            let _ = unsafe { CloseClipboard() };
        }
    }

    /// The app that copied asked to stay out of clipboard monitors and history (password managers do).
    fn private() -> bool {
        unsafe {
            let exclude = RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing"));
            let ignore = RegisterClipboardFormatW(w!("Clipboard Viewer Ignore"));
            if (exclude != 0 && IsClipboardFormatAvailable(exclude).is_ok()) || (ignore != 0 && IsClipboardFormatAvailable(ignore).is_ok()) {
                return true;
            }
            let history = RegisterClipboardFormatW(w!("CanIncludeInClipboardHistory"));
            if history != 0 && IsClipboardFormatAvailable(history).is_ok() {
                if let Ok(handle) = GetClipboardData(history) {
                    let memory = HGLOBAL(handle.0);
                    let data = GlobalLock(memory) as *const u32;
                    let allowed = data.is_null() || GlobalSize(memory) < 4 || *data != 0;
                    let _ = GlobalUnlock(memory);
                    return !allowed;
                }
            }
            false
        }
    }

    /// The text on the clipboard, unless there is none or it is private.
    pub fn read_text() -> Option<String> {
        unsafe {
            if IsClipboardFormatAvailable(CF_UNICODETEXT.0 as u32).is_err() || !open() {
                return None;
            }
            let _opened = Opened;
            if private() {
                return None;
            }
            let handle = GetClipboardData(CF_UNICODETEXT.0 as u32).ok()?;
            let memory = HGLOBAL(handle.0);
            let data = GlobalLock(memory) as *const u16;
            if data.is_null() {
                return None;
            }
            // Never read past the block, even if the text is not terminated.
            let max = GlobalSize(memory) / 2;
            let len = (0..max).take_while(|&i| *data.add(i) != 0).count();
            let text = String::from_utf16_lossy(std::slice::from_raw_parts(data, len));
            let _ = GlobalUnlock(memory);
            Some(text)
        }
    }

    pub fn write_text(text: &str) -> Result<(), String> {
        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            if !open() {
                return Err("Outro app está usando a área de transferência".into());
            }
            let _opened = Opened;
            EmptyClipboard().map_err(|e| e.to_string())?;
            let memory = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2).map_err(|e| e.to_string())?;
            let data = GlobalLock(memory) as *mut u16;
            if data.is_null() {
                return Err("Sem memória para copiar".into());
            }
            std::ptr::copy_nonoverlapping(wide.as_ptr(), data, wide.len());
            let _ = GlobalUnlock(memory);
            // After this the clipboard owns the memory.
            SetClipboardData(CF_UNICODETEXT.0 as u32, Some(HANDLE(memory.0))).map_err(|e| e.to_string())?;
            Ok(())
        }
    }
}

/// macOS: the general pasteboard (its change count stands for Windows' clipboard sequence number).
#[cfg(target_os = "macos")]
mod win {
    pub fn sequence() -> u32 {
        crate::mac::pasteboard_change_count()
    }
    pub fn read_text() -> Option<String> {
        crate::mac::pasteboard_text()
    }
    pub fn write_text(text: &str) -> Result<(), String> {
        crate::mac::set_pasteboard_text(text)
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod win {
    pub fn sequence() -> u32 {
        0
    }
    pub fn read_text() -> Option<String> {
        None
    }
    pub fn write_text(_: &str) -> Result<(), String> {
        Err("Só no Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guarda_os_mais_novos_primeiro_e_no_maximo_o_limite() {
        let mut h = History::default();
        for i in 0..15 {
            assert!(h.push(format!("texto {i}"), i));
        }
        let items = h.items();
        assert_eq!(items.len(), LIMIT);
        assert_eq!(items[0].preview, "texto 14");
        assert_eq!(items[LIMIT - 1].preview, "texto 5");
    }

    #[test]
    fn copiar_de_novo_sobe_sem_repetir() {
        let mut h = History::default();
        h.push("a".into(), 1);
        h.push("b".into(), 2);
        h.push("a".into(), 3);
        let items = h.items();
        assert_eq!(items.iter().map(|i| i.preview.as_str()).collect::<Vec<_>>(), ["a", "b"]);
        assert_eq!(items[0].at, 3);
    }

    #[test]
    fn ignora_texto_vazio_e_gigante() {
        let mut h = History::default();
        assert!(!h.push("   \n\t".into(), 1));
        assert!(!h.push("x".repeat(MAX_CHARS + 1), 1));
        assert!(h.items().is_empty());
    }

    #[test]
    fn a_previa_junta_os_espacos_e_corta_o_resto() {
        assert_eq!(preview("linha 1\n\n   linha 2\tfim"), "linha 1 linha 2 fim");
        let long = preview(&"palavra ".repeat(100));
        assert!(long.ends_with('…'));
        assert!(long.chars().count() <= PREVIEW_CHARS + 1);
    }

    #[test]
    fn devolve_o_texto_inteiro_e_remove() {
        let mut h = History::default();
        h.push("um texto\ncom duas linhas".into(), 1);
        let id = h.items()[0].id;
        assert_eq!(h.text(id), Some("um texto\ncom duas linhas"));
        assert_eq!(h.items()[0].chars, 24);
        h.remove(id);
        assert_eq!(h.text(id), None);
    }
}
