use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::placement::Screen;

const LABEL: &str = "settings";

/// Só aceita letras minúsculas, para o nome da seção ir com segurança dentro do endereço da janela.
fn clean_section(section: Option<&str>) -> Option<&str> {
    section.filter(|s| !s.is_empty() && s.len() <= 24 && s.chars().all(|c| c.is_ascii_lowercase()))
}

/// Abre a janela de configurações (já na `section`, se for dada), ou traz a que já existe para a frente.
pub fn open(app: &AppHandle, section: Option<&str>, screen: Option<Screen>) -> tauri::Result<()> {
    let section = clean_section(section);

    if let Some(window) = app.get_webview_window(LABEL) {
        center_on(&window, screen);
        window.show()?;
        window.unminimize()?;
        window.set_focus()?;
        if let Some(section) = section {
            let _ = app.emit_to(LABEL, "settings-section", section);
        }
        return Ok(());
    }

    let url = match section {
        Some(section) => format!("index.html?section={section}"),
        None => "index.html".to_string(),
    };
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(url.into()))
        .title("Docky — Configurações")
        // Sem moldura do Windows: a barra de cima, a borda e os cantos são desenhados pelo frontend, como na ilha.
        .decorations(false)
        .transparent(true)
        .shadow(false)
        // Dá para redimensionar pelas bordas mesmo sem moldura (o Tauri deixa uma borda de redimensionar invisível).
        // O mínimo ainda cabe o trilho de 240px à esquerda e uma coluna de conteúdo usável.
        .resizable(true)
        .inner_size(960.0, 680.0)
        .min_inner_size(720.0, 520.0)
        .theme(Some(Theme::Dark))
        .center()
        .visible(screen.is_none())
        .build()?;
    apply_material(&window, &app.state::<crate::config::ConfigState>().get().material);
    if screen.is_some() {
        center_on(&window, screen);
        window.show()?;
    }
    Ok(())
}

/// The liquid glass material on the Settings window: on Windows 11, real acrylic, so the desktop behind is blurred
/// (the page then draws itself see-through, see settings.css `.sa.glass`), with the system's rounded corners and
/// shadow. Anywhere else, or with the black material, the window stays as it was. Returns whether glass is on.
pub fn apply_material(window: &WebviewWindow, material: &str) -> bool {
    let glass = material == "glass" && windows_11();
    if glass {
        let effects = tauri::utils::config::WindowEffectsConfig {
            effects: vec![tauri::window::Effect::Acrylic],
            state: None,
            radius: None,
            color: Some(tauri::window::Color(12, 12, 18, 90)),
            interactive: false,
        };
        let _ = window.set_effects(effects);
        let _ = window.set_shadow(true);
    } else {
        let _ = window.set_effects(None);
        let _ = window.set_shadow(false);
    }
    round_corners(window, glass);
    glass
}

/// Whether the Settings window can be glass here (Windows 11): the page only draws itself see-through when it is.
#[tauri::command]
pub fn settings_acrylic() -> bool {
    windows_11()
}

/// The material changed in Settings: the open Settings window follows.
pub fn material_changed(app: &AppHandle, material: &str) {
    if let Some(window) = app.get_webview_window(LABEL) {
        apply_material(&window, material);
    }
}

/// Windows 11 is build 22000 or newer; acrylic on Windows 10 drags when the window moves, so it stays off there.
#[cfg(windows)]
fn windows_11() -> bool {
    use windows::{
        Win32::System::Registry::{HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ, RegGetValueW},
        core::w,
    };
    let mut buffer = [0u16; 16];
    let mut size = (buffer.len() * 2) as u32;
    let read = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            w!(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion"),
            w!("CurrentBuildNumber"),
            RRF_RT_REG_SZ,
            None,
            Some(buffer.as_mut_ptr().cast()),
            Some(&mut size),
        )
    };
    if read.is_err() {
        return false;
    }
    let len = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..len]).trim().parse::<u32>().map(|build| build >= 22000).unwrap_or(false)
}

#[cfg(not(windows))]
fn windows_11() -> bool {
    false
}

/// The system's rounded corners (Windows 11), so the acrylic does not show square corners past the page's own.
#[cfg(windows)]
fn round_corners(window: &WebviewWindow, round: bool) {
    use windows::Win32::Graphics::Dwm::{DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DEFAULT, DWMWCP_ROUND, DwmSetWindowAttribute};
    let Ok(hwnd) = window.hwnd() else { return };
    let preference = if round { DWMWCP_ROUND } else { DWMWCP_DEFAULT };
    unsafe {
        let _ = DwmSetWindowAttribute(
            windows::Win32::Foundation::HWND(hwnd.0 as *mut std::ffi::c_void),
            DWMWA_WINDOW_CORNER_PREFERENCE,
            (&preference as *const windows::Win32::Graphics::Dwm::DWM_WINDOW_CORNER_PREFERENCE).cast(),
            std::mem::size_of_val(&preference) as u32,
        );
    }
}

#[cfg(not(windows))]
fn round_corners(_: &WebviewWindow, _: bool) {}

/// Centraliza a janela na tela dada (a da ilha que pediu); sem tela, deixa onde está.
fn center_on(window: &WebviewWindow, screen: Option<Screen>) {
    let (Some(screen), Ok(size)) = (screen, window.outer_size()) else { return };
    let x = screen.left + (screen.width - size.width as i32) / 2;
    let y = screen.top + (screen.height - size.height as i32) / 2;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

// Assíncrono de propósito: criar janelas em comandos síncronos pode travar no Windows.
#[tauri::command]
pub async fn open_settings(app: AppHandle, window: WebviewWindow, section: Option<String>) -> Result<(), String> {
    // Abre na tela da ilha que foi clicada.
    open(&app, section.as_deref(), Screen::of_window(&window)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::clean_section;

    #[test]
    fn so_aceita_nome_de_secao_simples() {
        assert_eq!(clean_section(Some("atalhos")), Some("atalhos"));
        assert_eq!(clean_section(Some("../x")), None);
        assert_eq!(clean_section(Some("a b")), None);
        assert_eq!(clean_section(Some("")), None);
        assert_eq!(clean_section(None), None);
    }
}
