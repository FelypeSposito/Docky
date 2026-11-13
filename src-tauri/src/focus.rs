//! Trazer para a frente um programa que já está aberto, em vez de abrir outra janela dele (o Chrome, por exemplo,
//! abre uma janela nova a cada vez que o `.exe` é chamado). É o que a barra de tarefas faz ao clicar num app aberto.

/// O programa que um destino abre, quando dá para saber e quando focar faz sentido: o próprio `.exe`, ou o `.exe` de um
/// atalho `.lnk` sem argumentos. Um atalho com argumentos (um jogo pela Steam, um perfil do Chrome) faz algo além de
/// abrir o programa, então continua sendo aberto normalmente. O Explorer fica de fora: ele está sempre rodando como a
/// área de trabalho, e um atalho para ele quer uma janela nova.
pub fn program_of(target: &str) -> Option<String> {
    let lower = target.to_ascii_lowercase();
    let program = if lower.ends_with(".exe") {
        target.to_string()
    } else if lower.ends_with(".lnk") {
        link_program(target)?
    } else {
        return None;
    };
    let name = program.rsplit(['\\', '/']).next().unwrap_or("").to_ascii_lowercase();
    (name != "explorer.exe" && !name.is_empty()).then_some(program)
}

/// Traz para a frente a janela principal mais recente do programa, se ele estiver aberto. `true` quando conseguiu.
#[cfg(windows)]
pub fn focus_running(program: &str) -> bool {
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows::core::BOOL;
    use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GW_OWNER, GetWindow, GetWindowLongW, GetWindowTextLengthW, GetWindowThreadProcessId, GWL_EXSTYLE, IsWindowVisible, WS_EX_TOOLWINDOW};

    struct Search {
        program: String,
        found: Option<HWND>,
    }

    unsafe extern "system" fn visit(hwnd: HWND, data: LPARAM) -> BOOL {
        let search = unsafe { &mut *(data.0 as *mut Search) };
        unsafe {
            // Só janelas de verdade: visíveis, com título, sem dono e que não sejam paletas de ferramentas.
            let tool = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW.0 != 0;
            let owned = GetWindow(hwnd, GW_OWNER).map(|o| !o.is_invalid()).unwrap_or(false);
            if !IsWindowVisible(hwnd).as_bool() || tool || owned || GetWindowTextLengthW(hwnd) == 0 {
                return BOOL(1);
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid != 0 && process_path(pid).is_some_and(|path| path.eq_ignore_ascii_case(&search.program)) {
                search.found = Some(hwnd);
                return BOOL(0); // a primeira na ordem da tela é a usada por último
            }
        }
        BOOL(1)
    }

    let mut search = Search { program: program.to_string(), found: None };
    unsafe {
        let _ = EnumWindows(Some(visit), LPARAM(&mut search as *mut Search as isize));
    }
    match search.found {
        Some(hwnd) => bring_to_front(hwnd),
        None => false,
    }
}

#[cfg(not(windows))]
pub fn focus_running(_program: &str) -> bool {
    false
}

/// O caminho completo do `.exe` de um processo.
#[cfg(windows)]
fn process_path(pid: u32) -> Option<String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW};
    use windows::core::PWSTR;

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buffer = [0u16; 1024];
        let mut len = buffer.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buffer.as_mut_ptr()), &mut len).is_ok();
        let _ = CloseHandle(handle);
        ok.then(|| String::from_utf16_lossy(&buffer[..len as usize]))
    }
}

/// Restaura (se minimizada) e põe a janela na frente. O Windows só deixa trocar o foco depois de uma entrada do usuário
/// neste processo; o clique na ilha costuma bastar, e um toque de Alt sintético destrava os outros casos.
#[cfg(windows)]
fn bring_to_front(hwnd: windows::Win32::Foundation::HWND) -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_KEYUP, SendInput, VK_MENU};
    use windows::Win32::UI::WindowsAndMessaging::{IsIconic, SW_RESTORE, SetForegroundWindow, ShowWindow};

    unsafe {
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }
        if SetForegroundWindow(hwnd).as_bool() {
            return true;
        }
        let key = |flags: KEYBD_EVENT_FLAGS| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VK_MENU, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
        };
        SendInput(&[key(KEYBD_EVENT_FLAGS(0)), key(KEYEVENTF_KEYUP)], std::mem::size_of::<INPUT>() as i32);
        SetForegroundWindow(hwnd).as_bool()
    }
}

/// O `.exe` para o qual um `.lnk` aponta, só quando o atalho não passa argumentos.
#[cfg(windows)]
fn link_program(target: &str) -> Option<String> {
    use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, IPersistFile, STGM_READ};
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
    use windows::core::{Interface, PCWSTR};

    let wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    let text = |buffer: &[u16]| String::from_utf16_lossy(&buffer[..buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len())]);
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let file: IPersistFile = link.cast().ok()?;
        file.Load(PCWSTR(wide.as_ptr()), STGM_READ).ok()?;
        let mut args = [0u16; 1024];
        link.GetArguments(&mut args).ok()?;
        if !text(&args).trim().is_empty() {
            return None;
        }
        let mut program = [0u16; 260];
        link.GetPath(&mut program, std::ptr::null_mut(), 0).ok()?;
        let program = text(&program);
        program.to_ascii_lowercase().ends_with(".exe").then_some(program)
    }
}

#[cfg(not(windows))]
fn link_program(_target: &str) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::program_of;

    #[test]
    fn foca_programas_mas_nao_o_explorer_nem_o_resto() {
        assert_eq!(program_of(r"C:\Program Files\Google\Chrome\Application\chrome.exe").as_deref(), Some(r"C:\Program Files\Google\Chrome\Application\chrome.exe"));
        assert_eq!(program_of(r"C:\Windows\explorer.exe"), None);
        assert_eq!(program_of(r"C:\Users\voce\Documentos"), None);
        assert_eq!(program_of("https://www.sposence.com.br/"), None);
        assert_eq!(program_of(r"shell:AppsFolder\Spotify!Spotify"), None);
        assert_eq!(program_of(r"C:\nao\existe.lnk"), None);
    }
}

#[cfg(all(test, windows))]
mod manual {
    /// Rodar à mão: `cargo test focus::manual -- --ignored --nocapture` (traz o Chrome para a frente, se estiver aberto).
    #[test]
    #[ignore]
    fn traz_o_chrome() {
        let chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe";
        println!("chrome aberto e focado: {}", super::focus_running(chrome));
    }
}
