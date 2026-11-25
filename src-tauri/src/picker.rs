//! Seletor de arquivo ou pasta do Windows (imagem de ícone, programa de um atalho, pasta da Shelf).
//! Usa a caixa de diálogo do próprio sistema (IFileOpenDialog), sem biblioteca extra.

#[cfg(windows)]
fn open_dialog(owner: isize, kind: &str) -> Result<Option<String>, String> {
    use windows::{
        Win32::{
            Foundation::HWND,
            System::Com::{CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize},
            UI::Shell::{
                Common::COMDLG_FILTERSPEC, FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, FOS_PICKFOLDERS, FileOpenDialog, IFileOpenDialog, SIGDN_FILESYSPATH,
            },
        },
        core::w,
    };

    unsafe {
        let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        let result = (|| -> windows::core::Result<Option<String>> {
            let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)?;
            let options = dialog.GetOptions()? | FOS_FORCEFILESYSTEM;
            match kind {
                "folder" => {
                    dialog.SetOptions(options | FOS_PICKFOLDERS)?;
                    dialog.SetTitle(w!("Escolher a pasta"))?;
                }
                "app" => {
                    dialog.SetOptions(options | FOS_FILEMUSTEXIST)?;
                    let filter = [
                        COMDLG_FILTERSPEC { pszName: w!("Programas e atalhos"), pszSpec: w!("*.exe;*.lnk;*.bat;*.cmd;*.url") },
                        COMDLG_FILTERSPEC { pszName: w!("Todos os arquivos"), pszSpec: w!("*.*") },
                    ];
                    dialog.SetFileTypes(&filter)?;
                    dialog.SetTitle(w!("Escolher o programa ou arquivo"))?;
                }
                _ => {
                    dialog.SetOptions(options | FOS_FILEMUSTEXIST)?;
                    let filter = [COMDLG_FILTERSPEC { pszName: w!("Imagens"), pszSpec: w!("*.png;*.jpg;*.jpeg;*.gif;*.webp;*.svg;*.ico;*.bmp") }];
                    dialog.SetFileTypes(&filter)?;
                    dialog.SetTitle(w!("Escolher o ícone do atalho"))?;
                }
            }
            if dialog.Show(Some(HWND(owner as _))).is_err() {
                return Ok(None); // cancelou
            }
            let name = dialog.GetResult()?.GetDisplayName(SIGDN_FILESYSPATH)?;
            let path = name.to_string();
            CoTaskMemFree(Some(name.0 as _));
            Ok(Some(path?))
        })();
        if initialized {
            CoUninitialize();
        }
        result.map_err(|e| e.to_string())
    }
}

/// Abre o seletor e devolve o caminho escolhido, ou `None` se a pessoa cancelar.
/// `kind`: "image" (imagem de ícone), "app" (programa, atalho ou arquivo) ou "folder".
#[cfg(windows)]
#[tauri::command]
pub async fn pick_path(window: tauri::WebviewWindow, kind: String) -> Result<Option<String>, String> {
    let owner = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    tauri::async_runtime::spawn_blocking(move || open_dialog(owner, &kind)).await.map_err(|e| e.to_string())?
}

/// macOS: the system's own chooser, through AppleScript. Cancelling is not an error: it gives `None`.
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn pick_path(kind: String) -> Result<Option<String>, String> {
    // `activate` first: the chooser comes from a background process and would open behind the other windows.
    let script = match kind.as_str() {
        "folder" => "activate\nPOSIX path of (choose folder)",
        "image" => "activate\nPOSIX path of (choose file of type {\"public.image\"})",
        _ => "activate\nPOSIX path of (choose file)",
    };
    tauri::async_runtime::spawn_blocking(move || Ok(crate::mac::osascript(script).filter(|p| !p.is_empty())))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(not(any(windows, target_os = "macos")))]
#[tauri::command]
pub async fn pick_path(_kind: String) -> Result<Option<String>, String> {
    Ok(None)
}
