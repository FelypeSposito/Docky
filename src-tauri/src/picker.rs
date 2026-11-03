//! Seletor de arquivo do Windows, para escolher a imagem do ícone de um atalho.
//! Usa a caixa de diálogo do próprio sistema (IFileOpenDialog), sem biblioteca extra.

#[cfg(windows)]
fn open_image_dialog(owner: isize) -> Result<Option<String>, String> {
    use windows::{
        Win32::{
            Foundation::HWND,
            System::Com::{CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize},
            UI::Shell::{
                Common::COMDLG_FILTERSPEC, FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, FileOpenDialog, IFileOpenDialog, SIGDN_FILESYSPATH,
            },
        },
        core::w,
    };

    unsafe {
        let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        let result = (|| -> windows::core::Result<Option<String>> {
            let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)?;
            dialog.SetOptions(dialog.GetOptions()? | FOS_FILEMUSTEXIST | FOS_FORCEFILESYSTEM)?;
            let filter = [COMDLG_FILTERSPEC { pszName: w!("Imagens"), pszSpec: w!("*.png;*.jpg;*.jpeg;*.gif;*.webp;*.svg;*.ico;*.bmp") }];
            dialog.SetFileTypes(&filter)?;
            dialog.SetTitle(w!("Escolher o ícone do atalho"))?;
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

/// Abre o seletor de imagem e devolve o caminho escolhido, ou `None` se a pessoa cancelar.
#[cfg(windows)]
#[tauri::command]
pub async fn pick_image(window: tauri::WebviewWindow) -> Result<Option<String>, String> {
    let owner = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    tauri::async_runtime::spawn_blocking(move || open_image_dialog(owner)).await.map_err(|e| e.to_string())?
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn pick_image() -> Result<Option<String>, String> {
    Ok(None)
}
