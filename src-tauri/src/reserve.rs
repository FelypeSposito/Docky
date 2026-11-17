//! Reserva uma faixa no topo de cada tela da ilha, para as janelas maximizadas (o Chrome com as abas e a barra de
//! endereço, por exemplo) começarem abaixo da pílula em vez de ficarem atrás dela.
//!
//! Cada tela ganha uma "appbar" do Windows (`SHAppBarMessage`), a mesma coisa que a barra de tarefas usa: o Windows
//! tira a faixa da área de trabalho só daquela tela e reajusta as janelas maximizadas. A appbar é presa a uma janela
//! escondida do Docky, então o Windows devolve a faixa sozinho se o Docky fechar ou travar (o Explorer percebe que a
//! janela sumiu). Ao sair, a faixa é devolvida antes.
//!
//! Telas em tela cheia (jogos, vídeos) cobrem a tela inteira de qualquer jeito; a faixa continua reservada enquanto a
//! ilha está escondida por isso, para as janelas não pularem de tamanho toda vez que um vídeo entra em tela cheia.
//! Quando a pessoa esconde a ilha pela bandeja, a faixa é devolvida.

use std::sync::Mutex;

use tauri::{AppHandle, Manager, Monitor};

use crate::{config::ConfigState, island};

/// Altura da pílula recolhida, em pixels lógicos (a mesma de `src/island/modes.ts`).
pub const PILL_HEIGHT: f64 = 36.0;

/// Uma faixa no topo de uma tela, em pixels físicos (como o Windows conta).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Strip {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Strip {
    /// A faixa que a pílula recolhida ocupa numa tela: a largura toda, da borda de cima até o fim da pílula.
    pub fn for_screen(left: i32, top: i32, width: u32, scale: f64) -> Self {
        let height = (PILL_HEIGHT * scale).ceil() as i32;
        Self { left, top, right: left + width as i32, bottom: top + height }
    }

    pub fn of_monitor(monitor: &Monitor) -> Self {
        Self::for_screen(monitor.position().x, monitor.position().y, monitor.size().width, monitor.scale_factor())
    }
}

/// Onde termina a faixa reservada quando o topo livre da tela começa em `free_top` (outra appbar, como a barra de
/// tarefas no topo, pode já ocupar a borda). Só reserva até o fim da pílula; se a outra barra já passa disso, nada.
pub fn reserved_bottom(strip: Strip, free_top: i32) -> i32 {
    free_top.max(strip.bottom)
}

/// As faixas a reservar: as das telas da ilha, se a opção está ligada e a ilha não foi escondida pela bandeja.
pub fn wanted(enabled: bool, user_hidden: bool, screens: &[Strip]) -> Vec<Strip> {
    if !enabled || user_hidden {
        return Vec::new();
    }
    let mut out: Vec<Strip> = Vec::new();
    for strip in screens {
        if !out.contains(strip) {
            out.push(*strip);
        }
    }
    out
}

/// As telas onde a ilha está agora (o `island::reconcile` atualiza).
static SCREENS: Mutex<Vec<Strip>> = Mutex::new(Vec::new());

pub fn set_screens(screens: Vec<Strip>) {
    *SCREENS.lock().unwrap() = screens;
}

/// Reserva (ou devolve) as faixas conforme a configuração, as telas e se a ilha está à vista.
pub fn sync(app: &AppHandle) {
    let enabled = app.state::<ConfigState>().get().reserve_space;
    let strips = wanted(enabled, island::user_hidden(app), &SCREENS.lock().unwrap());
    imp::request(strips);
}

/// Devolve todas as faixas e espera o Windows aplicar (no máximo um segundo). Para a saída do app.
pub fn release() {
    imp::request(Vec::new());
    imp::wait();
}

#[cfg(windows)]
mod imp {
    use std::{
        cell::RefCell,
        sync::{
            Condvar, Mutex, OnceLock,
            atomic::{AtomicUsize, Ordering},
        },
        thread,
        time::Duration,
    };

    use windows::Win32::{
        Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM},
        UI::{
            Shell::{ABE_TOP, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS, ABN_POSCHANGED, APPBARDATA, SHAppBarMessage},
            WindowsAndMessaging::{
                CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, MSG, PostMessageW, RegisterClassW,
                RegisterWindowMessageW, TranslateMessage, WM_APP, WNDCLASSW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
                WS_POPUP,
            },
        },
    };
    use windows::core::w;

    use super::{Strip, reserved_bottom};

    /// Quantas vezes a posição foi gravada no Windows (o teste de verdade confere que as appbars não ficam se avisando).
    pub static SETS: AtomicUsize = AtomicUsize::new(0);

    /// Pedido de refazer as faixas (para a janela de controle).
    const WM_SYNC: u32 = WM_APP + 41;
    /// Avisos do Explorer para as appbars (a barra de tarefas mudou, outra appbar entrou…).
    const WM_APPBAR: u32 = WM_APP + 42;

    struct Shared {
        /// O pedido mais recente (número, faixas).
        wanted: Mutex<(u64, Vec<Strip>)>,
        /// O último pedido que já foi aplicado.
        applied: Mutex<u64>,
        done: Condvar,
        /// A janela escondida que recebe os pedidos (fica pronta logo depois que a thread começa).
        control: Mutex<Option<isize>>,
    }

    #[derive(Clone, Copy)]
    struct Bar {
        hwnd: isize,
        strip: Strip,
        /// O retângulo que foi passado ao Windows da última vez.
        set: RECT,
    }

    thread_local! {
        static BARS: RefCell<Vec<Bar>> = const { RefCell::new(Vec::new()) };
        static TASKBAR_CREATED: RefCell<u32> = const { RefCell::new(0) };
    }

    fn shared() -> &'static Shared {
        static SHARED: OnceLock<Shared> = OnceLock::new();
        SHARED.get_or_init(|| {
            thread::Builder::new().name("docky-reserve".into()).spawn(run).expect("thread da faixa reservada");
            Shared { wanted: Mutex::new((0, Vec::new())), applied: Mutex::new(0), done: Condvar::new(), control: Mutex::new(None) }
        })
    }

    pub fn request(strips: Vec<Strip>) {
        let shared = shared();
        {
            let mut wanted = shared.wanted.lock().unwrap();
            if wanted.1 == strips {
                return;
            }
            wanted.0 += 1;
            wanted.1 = strips;
        }
        if let Some(control) = *shared.control.lock().unwrap() {
            let _ = unsafe { PostMessageW(Some(HWND(control as _)), WM_SYNC, WPARAM(0), LPARAM(0)) };
        }
    }

    pub fn wait() {
        let shared = shared();
        let target = shared.wanted.lock().unwrap().0;
        let applied = shared.applied.lock().unwrap();
        let _ = shared.done.wait_timeout_while(applied, Duration::from_secs(1), |applied| *applied < target);
    }

    fn window() -> Option<HWND> {
        unsafe {
            // Janela de nível superior e escondida (não "message-only"): assim recebe o aviso de que o Explorer
            // reiniciou e não aparece em lugar nenhum.
            CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, w!("DockyReserve"), w!("Docky"), WS_POPUP, 0, 0, 0, 0, None, None, None, None).ok()
        }
    }

    fn data(hwnd: isize) -> APPBARDATA {
        APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, hWnd: HWND(hwnd as _), uCallbackMessage: WM_APPBAR, uEdge: ABE_TOP, ..Default::default() }
    }

    /// Pergunta ao Windows onde a faixa cabe e reserva só até o fim da pílula.
    fn position(hwnd: isize, strip: Strip) -> RECT {
        let mut abd = data(hwnd);
        abd.rc = RECT { left: strip.left, top: strip.top, right: strip.right, bottom: strip.bottom };
        unsafe { SHAppBarMessage(ABM_QUERYPOS, &mut abd) };
        abd.rc.bottom = reserved_bottom(strip, abd.rc.top);
        SETS.fetch_add(1, Ordering::Relaxed);
        unsafe { SHAppBarMessage(ABM_SETPOS, &mut abd) };
        abd.rc
    }

    fn register(hwnd: isize) -> bool {
        let mut abd = data(hwnd);
        unsafe { SHAppBarMessage(ABM_NEW, &mut abd) != 0 }
    }

    fn add(strip: Strip) -> Option<Bar> {
        let hwnd = window()?.0 as isize;
        if !register(hwnd) {
            let _ = unsafe { DestroyWindow(HWND(hwnd as _)) };
            return None;
        }
        Some(Bar { hwnd, strip, set: position(hwnd, strip) })
    }

    fn remove(bar: &Bar) {
        let mut abd = data(bar.hwnd);
        unsafe {
            SHAppBarMessage(ABM_REMOVE, &mut abd);
            let _ = DestroyWindow(HWND(bar.hwnd as _));
        }
    }

    /// Deixa as appbars iguais ao pedido mais recente. Os empréstimos de `BARS` são curtos: o Explorer pode mandar
    /// avisos para as nossas janelas enquanto uma chamada ao `SHAppBarMessage` espera.
    fn apply() {
        let shared = shared();
        let (generation, strips) = shared.wanted.lock().unwrap().clone();
        let current: Vec<Bar> = BARS.with(|b| b.borrow().clone());
        for bar in current.iter().filter(|b| !strips.contains(&b.strip)) {
            remove(bar);
            BARS.with(|b| b.borrow_mut().retain(|x| x.hwnd != bar.hwnd));
        }
        for strip in strips.iter().filter(|s| !current.iter().any(|b| b.strip == **s)) {
            if let Some(bar) = add(*strip) {
                BARS.with(|b| b.borrow_mut().push(bar));
            }
        }
        *shared.applied.lock().unwrap() = generation;
        shared.done.notify_all();
    }

    /// Algo mudou na borda (barra de tarefas, outra appbar): refaz a posição, mas só regrava se ela mudou.
    /// Sem isso, duas appbars do Docky (uma por tela) ficariam se avisando sem parar.
    fn reposition(hwnd: isize) {
        let Some(bar) = BARS.with(|b| b.try_borrow().ok().and_then(|b| b.iter().find(|x| x.hwnd == hwnd).copied())) else {
            return;
        };
        let mut abd = data(hwnd);
        abd.rc = RECT { left: bar.strip.left, top: bar.strip.top, right: bar.strip.right, bottom: bar.strip.bottom };
        unsafe { SHAppBarMessage(ABM_QUERYPOS, &mut abd) };
        abd.rc.bottom = reserved_bottom(bar.strip, abd.rc.top);
        if abd.rc == bar.set {
            return;
        }
        SETS.fetch_add(1, Ordering::Relaxed);
        unsafe { SHAppBarMessage(ABM_SETPOS, &mut abd) };
        let set = abd.rc;
        BARS.with(|b| {
            if let Ok(mut b) = b.try_borrow_mut() {
                if let Some(x) = b.iter_mut().find(|x| x.hwnd == hwnd) {
                    x.set = set;
                }
            }
        });
    }

    /// O Explorer reiniciou e esqueceu as appbars: registra de novo.
    fn reregister() {
        let current: Vec<Bar> = BARS.with(|b| b.borrow().clone());
        for bar in &current {
            if register(bar.hwnd) {
                let set = position(bar.hwnd, bar.strip);
                BARS.with(|b| {
                    if let Some(x) = b.borrow_mut().iter_mut().find(|x| x.hwnd == bar.hwnd) {
                        x.set = set;
                    }
                });
            }
        }
    }

    fn is_control(hwnd: HWND) -> bool {
        *shared().control.lock().unwrap() == Some(hwnd.0 as isize)
    }

    unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        match msg {
            WM_SYNC => apply(),
            WM_APPBAR if wparam.0 as u32 == ABN_POSCHANGED => reposition(hwnd.0 as isize),
            // O aviso vai para todas as janelas de nível superior; só a de controle refaz.
            _ if msg != 0 && msg == TASKBAR_CREATED.with(|t| *t.borrow()) && is_control(hwnd) => reregister(),
            _ => return unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
        }
        LRESULT(0)
    }

    fn run() {
        unsafe {
            let class = WNDCLASSW { lpfnWndProc: Some(wndproc), lpszClassName: w!("DockyReserve"), ..Default::default() };
            RegisterClassW(&class);
            TASKBAR_CREATED.with(|t| *t.borrow_mut() = RegisterWindowMessageW(w!("TaskbarCreated")));
        }
        let Some(control) = window() else {
            return;
        };
        *shared().control.lock().unwrap() = Some(control.0 as isize);
        // Um pedido pode ter chegado antes da janela de controle existir.
        apply();
        let mut msg = MSG::default();
        unsafe {
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Strip;

    pub fn request(_strips: Vec<Strip>) {}
    pub fn wait() {}
}

#[cfg(test)]
mod tests {
    use super::{Strip, reserved_bottom, wanted};

    #[test]
    fn faixa_da_pilula_em_cada_escala() {
        assert_eq!(Strip::for_screen(0, 0, 1920, 1.0), Strip { left: 0, top: 0, right: 1920, bottom: 36 });
        // 36 x 1,25 = 45; 36 x 1,5 = 54. Arredonda para cima para a pílula nunca passar da faixa.
        assert_eq!(Strip::for_screen(0, 0, 2560, 1.25).bottom, 45);
        assert_eq!(Strip::for_screen(-1080, -300, 1080, 1.75).bottom, -300 + 63);
        assert_eq!(Strip::for_screen(-1080, -300, 1080, 1.75).right, 0);
    }

    #[test]
    fn so_reserva_o_que_falta_ate_o_fim_da_pilula() {
        let strip = Strip::for_screen(0, 0, 1920, 1.0);
        assert_eq!(reserved_bottom(strip, 0), 36, "borda livre: a faixa inteira");
        assert_eq!(reserved_bottom(strip, 20), 36, "uma barra de 20 px no topo: reserva de 20 a 36");
        assert_eq!(reserved_bottom(strip, 48), 48, "barra de tarefas no topo já passa da pílula: altura zero");
    }

    #[test]
    fn nada_quando_desligado_ou_escondido() {
        let screens = [Strip::for_screen(0, 0, 1920, 1.0), Strip::for_screen(-1080, 0, 1080, 1.0)];
        assert_eq!(wanted(true, false, &screens), screens);
        assert!(wanted(false, false, &screens).is_empty());
        assert!(wanted(true, true, &screens).is_empty());
        assert_eq!(wanted(true, false, &[screens[0], screens[0]]), [screens[0]], "uma faixa por tela");
    }

    /// Mexe na área de trabalho de verdade (uma faixa de 2 px em cada tela, por um instante). Rodar à mão:
    /// `cargo test reserva_de_verdade -- --ignored --nocapture`.
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn reserva_de_verdade() {
        use std::{sync::atomic::Ordering, thread::sleep, time::Duration};
        use windows::Win32::{
            Foundation::{LPARAM, RECT},
            Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO},
        };
        use windows::core::BOOL;

        unsafe extern "system" fn collect(monitor: HMONITOR, _: HDC, _: *mut RECT, lparam: LPARAM) -> BOOL {
            let found = unsafe { &mut *(lparam.0 as *mut Vec<(RECT, RECT)>) };
            let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            let _ = unsafe { GetMonitorInfoW(monitor, &mut info) };
            found.push((info.rcMonitor, info.rcWork));
            true.into()
        }
        let screens = || {
            let mut found: Vec<(RECT, RECT)> = Vec::new();
            let _ = unsafe { EnumDisplayMonitors(None, None, Some(collect), LPARAM(&mut found as *mut _ as isize)) };
            found
        };

        let before = screens();
        let strips: Vec<Strip> = before.iter().map(|(s, _)| Strip { left: s.left, top: s.top, right: s.right, bottom: s.top + 2 }).collect();
        super::imp::request(strips);
        sleep(Duration::from_millis(1500));
        let during = screens();
        let sets = super::imp::SETS.load(Ordering::Relaxed);
        sleep(Duration::from_millis(1000));
        let settled = super::imp::SETS.load(Ordering::Relaxed);
        super::release();
        sleep(Duration::from_millis(500));
        let after = screens();
        println!("antes {before:?}\ndurante {during:?}\ndepois {after:?}\nposições gravadas: {sets} -> {settled}");
        for ((screen, was), (_, now)) in before.iter().zip(&during) {
            if was.top == screen.top {
                assert_eq!(now.top, screen.top + 2, "a faixa de cada tela é reservada");
            }
        }
        assert_eq!(sets, settled, "as appbars pararam de se reposicionar");
        assert_eq!(before.iter().map(|s| s.1).collect::<Vec<_>>(), after.iter().map(|s| s.1).collect::<Vec<_>>(), "tudo devolvido");
    }
}
