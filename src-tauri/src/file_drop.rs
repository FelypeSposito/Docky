//! Arrastar arquivos do Explorer para a ilha (Windows).
//!
//! O wry só registra o alvo de arrastar nas janelas internas do WebView2 que já existem quando a janela nasce.
//! Na ilha, que sobe junto com o Windows, o Chromium cria essas janelas depois, então ficam sem alvo e o cursor
//! mostra o ícone de bloqueio. Esta rotina olha de tempos em tempos e registra o alvo nas que estiverem faltando.
//! Os eventos têm o mesmo formato dos do Tauri (`paths`), com o prefixo `docky://`.

use std::{
    cell::Cell,
    ffi::OsString,
    os::windows::ffi::OsStringExt,
    path::PathBuf,
    ptr, thread,
    time::Duration,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use windows::{
    Win32::{
        Foundation::{DRAGDROP_E_INVALIDHWND, HWND, LPARAM, POINTL},
        System::{
            Com::{DVASPECT_CONTENT, FORMATETC, IDataObject, TYMED_HGLOBAL},
            Ole::{CF_HDROP, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_NONE, IDropTarget, IDropTarget_Impl, RegisterDragDrop, RevokeDragDrop},
            SystemServices::MODIFIERKEYS_FLAGS,
        },
        UI::{
            Shell::{DragFinish, DragQueryFileW, HDROP},
            WindowsAndMessaging::{EnumChildWindows, GetClassNameW, GetPropW},
        },
    },
    core::{BOOL, implement, w},
};

/// As janelas internas do WebView2 que recebem o mouse e, por isso, precisam do alvo.
const TARGET_CLASSES: [&str; 2] = ["Chrome_RenderWidgetHostHWND", "Chrome_WidgetWin_1"];
const CHECK_INTERVAL: Duration = Duration::from_millis(1500);

#[derive(Serialize, Clone)]
struct Paths {
    paths: Vec<String>,
}

#[implement(IDropTarget)]
struct FileDropTarget {
    app: AppHandle,
    /// O que está sendo arrastado tem arquivos? Se não, não há o que avisar nem aceitar.
    valid: Cell<bool>,
}

impl FileDropTarget {
    fn emit(&self, name: &str, paths: Vec<PathBuf>) {
        let paths = paths.into_iter().map(|p| p.to_string_lossy().into_owned()).collect();
        let _ = self.app.emit_to("island", name, Paths { paths });
    }
}

/// Os caminhos dos arquivos do que está sendo arrastado, e o HDROP para liberar depois.
unsafe fn files_of(data: &IDataObject) -> Option<(Vec<PathBuf>, HDROP)> {
    unsafe {
        let format = FORMATETC { cfFormat: CF_HDROP.0, ptd: ptr::null_mut(), dwAspect: DVASPECT_CONTENT.0, lindex: -1, tymed: TYMED_HGLOBAL.0 as u32 };
        let medium = data.GetData(&format).ok()?;
        let hdrop = HDROP(medium.u.hGlobal.0 as _);
        let count = DragQueryFileW(hdrop, 0xFFFF_FFFF, None);
        let mut paths = Vec::new();
        for i in 0..count {
            let length = DragQueryFileW(hdrop, i, None) as usize;
            let mut buffer = vec![0u16; length + 1];
            DragQueryFileW(hdrop, i, Some(&mut buffer));
            paths.push(OsString::from_wide(&buffer[..length]).into());
        }
        Some((paths, hdrop))
    }
}

#[allow(non_snake_case)]
impl IDropTarget_Impl for FileDropTarget_Impl {
    fn DragEnter(&self, data: windows::core::Ref<'_, IDataObject>, _keys: MODIFIERKEYS_FLAGS, _pt: &POINTL, effect: *mut DROPEFFECT) -> windows::core::Result<()> {
        let files = data.as_ref().and_then(|d| unsafe { files_of(d) });
        self.valid.set(files.is_some());
        let Some((paths, _)) = files else { return Ok(()) };
        self.emit("docky://drag-enter", paths);
        unsafe { *effect = DROPEFFECT_COPY };
        Ok(())
    }

    fn DragOver(&self, _keys: MODIFIERKEYS_FLAGS, _pt: &POINTL, effect: *mut DROPEFFECT) -> windows::core::Result<()> {
        unsafe { *effect = if self.valid.get() { DROPEFFECT_COPY } else { DROPEFFECT_NONE } };
        Ok(())
    }

    fn DragLeave(&self) -> windows::core::Result<()> {
        if self.valid.replace(false) {
            self.emit("docky://drag-leave", Vec::new());
        }
        Ok(())
    }

    fn Drop(&self, data: windows::core::Ref<'_, IDataObject>, _keys: MODIFIERKEYS_FLAGS, _pt: &POINTL, _effect: *mut DROPEFFECT) -> windows::core::Result<()> {
        if self.valid.replace(false) {
            if let Some((paths, hdrop)) = data.as_ref().and_then(|d| unsafe { files_of(d) }) {
                self.emit("docky://drag-drop", paths);
                unsafe { DragFinish(hdrop) };
            }
        }
        Ok(())
    }
}

fn class_name(hwnd: HWND) -> String {
    let mut buffer = [0u16; 128];
    let length = unsafe { GetClassNameW(hwnd, &mut buffer) } as usize;
    String::from_utf16_lossy(&buffer[..length])
}

/// As janelas internas de `root` que ainda não têm alvo de arrastar (o OLE marca as registradas com uma propriedade).
fn missing_targets(root: HWND) -> Vec<isize> {
    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let found = unsafe { &mut *(lparam.0 as *mut Vec<isize>) };
        let registered = !unsafe { GetPropW(hwnd, w!("OleDropTargetInterface")) }.is_invalid();
        if !registered && TARGET_CLASSES.contains(&class_name(hwnd).as_str()) {
            found.push(hwnd.0 as isize);
        }
        true.into()
    }
    let mut found: Vec<isize> = Vec::new();
    let _ = unsafe { EnumChildWindows(Some(root), Some(collect), LPARAM(&mut found as *mut _ as isize)) };
    found
}

fn register(app: &AppHandle, handles: Vec<isize>) {
    for raw in handles {
        let hwnd = HWND(raw as _);
        let target: IDropTarget = FileDropTarget { app: app.clone(), valid: Cell::new(false) }.into();
        // Mesma regra do wry: se a janela não aceita alvo de arrastar, deixa como está.
        if unsafe { RevokeDragDrop(hwnd) } != Err(DRAGDROP_E_INVALIDHWND.into()) {
            let _ = unsafe { RegisterDragDrop(hwnd, &target) };
        }
    }
}

pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        loop {
            thread::sleep(CHECK_INTERVAL);
            let Some(window) = app.get_webview_window("island") else { continue };
            let Ok(root) = window.hwnd() else { continue };
            let handles = missing_targets(HWND(root.0 as _));
            if handles.is_empty() {
                continue;
            }
            // O registro do OLE tem que acontecer na thread principal, a mesma que atende a janela.
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || register(&handle, handles));
        }
    });
}
