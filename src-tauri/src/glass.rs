//! Real blur behind the island when the liquid glass material is on.
//!
//! The island's window spans the whole top strip of the screen, and Windows' own window blurs (the system backdrop,
//! the accent blur) cover a window's whole rectangle: they ignore a window region, so they frosted the whole strip
//! (0.3.5, 0.3.6). So the blur lives in a window of its own, just under the island's: click-through, never focused,
//! drawing nothing but a Windows.UI.Composition visual tree filled with the host backdrop (the desktop behind,
//! blurred, as acrylic uses it) and clipped to the island's exact outline: the body with its rounded bottom corners
//! and the two concave ears, anti-aliased. The island sends its outline every frame it moves (springs, gel,
//! dragging), see `useGlassBlur.ts`, and only the clip changes.
//!
//! Anything that fails (an old Windows, transparency effects turned off) only means no blur: the island draws its
//! gray glass either way.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, WebviewWindow};

/// The island's outline in CSS pixels of the window (the page reports it), and the ear size.
#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize)]
pub struct Outline {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    /// Radius of the bottom corners.
    pub radius: f64,
    /// Width of each concave ear at the top corners (0 = none).
    pub ear: f64,
}

/// The outline in physical pixels, rounded: what the clip is built from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Px {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    pub radius: i32,
    pub ear: i32,
}

pub fn to_physical(o: Outline, scale: f64) -> Px {
    let s = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let r = |v: f64| (v * s).round() as i32;
    Px { x: r(o.x), y: r(o.y), w: r(o.w).max(1), h: r(o.h).max(1), radius: r(o.radius).max(0), ear: r(o.ear).max(0) }
}

/// Whether the glass is on (the island asked for it).
static ON: AtomicBool = AtomicBool::new(false);

/// Turns the glass blur on (the blur waits for the first outline) or off (the blur windows go).
#[tauri::command]
pub fn island_glass(window: WebviewWindow, on: bool) {
    ON.store(on, Ordering::SeqCst);
    if !on {
        let label = window.label().to_string();
        let _ = window.run_on_main_thread(move || imp::remove(&label));
    }
}

/// The island's outline changed: the blur under it takes the new shape (made the first time).
#[tauri::command]
pub fn island_glass_shape(window: WebviewWindow, outline: Outline) {
    if !ON.load(Ordering::SeqCst) {
        return;
    }
    let Ok(hwnd) = window.hwnd() else { return };
    let island = hwnd.0 as isize;
    let px = to_physical(outline, window.scale_factor().unwrap_or(1.0));
    let shown = window.is_visible().unwrap_or(true);
    let label = window.label().to_string();
    let _ = window.run_on_main_thread(move || {
        if ON.load(Ordering::SeqCst) {
            imp::shape(&label, island, px, shown);
        }
    });
}

/// The islands were hidden or shown (tray, fullscreen apps): their blur follows.
pub fn island_shown(app: &AppHandle, shown: bool) {
    let _ = app.run_on_main_thread(move || imp::show_all(shown));
}

#[cfg(windows)]
mod imp {
    use std::cell::{Cell, RefCell};
    use std::collections::HashMap;
    use std::ffi::c_void;

    use windows::{
        Graphics::IGeometrySource2D,
        System::{DispatcherQueue, DispatcherQueueController},
        UI::Composition::{CompositionPath, CompositionRoundedRectangleGeometry, Compositor, ContainerVisual, Desktop::DesktopWindowTarget, SpriteVisual},
        Win32::{
            Foundation::{COLORREF, E_NOTIMPL, HWND, LPARAM, LRESULT, RECT, WPARAM},
            Graphics::{
                Direct2D::{
                    Common::{D2D_SIZE_F, D2D1_FIGURE_BEGIN_FILLED, D2D1_FIGURE_END_CLOSED},
                    D2D1_ARC_SEGMENT, D2D1_ARC_SIZE_SMALL, D2D1_FACTORY_TYPE_SINGLE_THREADED, D2D1_SWEEP_DIRECTION_CLOCKWISE,
                    D2D1_SWEEP_DIRECTION_COUNTER_CLOCKWISE, D2D1CreateFactory, ID2D1Factory, ID2D1Geometry,
                },
                Dwm::{DWMWINDOWATTRIBUTE, DwmSetWindowAttribute},
            },
            System::{
                LibraryLoader::GetModuleHandleW,
                Registry::{HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RegGetValueW},
                WinRT::{
                    Composition::ICompositorDesktopInterop,
                    CreateDispatcherQueueController, DQTAT_COM_NONE, DQTYPE_THREAD_CURRENT, DispatcherQueueOptions,
                    Graphics::Direct2D::{IGeometrySource2DInterop, IGeometrySource2DInterop_Impl},
                },
            },
            UI::WindowsAndMessaging::{
                CreateWindowExW, DefWindowProcW, DestroyWindow, GetWindowRect, LWA_ALPHA, RegisterClassW, SW_HIDE, SW_SHOWNOACTIVATE,
                SWP_HIDEWINDOW, SWP_NOACTIVATE, SWP_SHOWWINDOW, SetLayeredWindowAttributes, SetWindowPos, ShowWindow, WINDOW_EX_STYLE,
                WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT,
                WS_POPUP,
            },
        },
        core::{Interface, Ref, Result, implement, w},
    };
    use windows_numerics::{Vector2, Vector3};

    use super::Px;

    /// DWMWA_USE_HOSTBACKDROPBRUSH: lets the window's composition tree use the host backdrop (Windows 11).
    const USE_HOST_BACKDROP: DWMWINDOWATTRIBUTE = DWMWINDOWATTRIBUTE(17);

    /// How much of the blur shows. Windows' host backdrop blurs hard (acrylic's radius, fixed), so it is laid over
    /// the clear desktop at half strength: halfway between frosted and clear glass.
    const BLUR_MIX: f32 = 0.5;

    /// A blur window and the visuals in it: the body and the two ears, all filled with the host backdrop.
    struct Backdrop {
        hwnd: HWND,
        compositor: Compositor,
        _target: DesktopWindowTarget,
        _root: ContainerVisual,
        body: SpriteVisual,
        body_shape: CompositionRoundedRectangleGeometry,
        ears: [SpriteVisual; 2],
        ear_px: i32,
        shown: bool,
    }

    impl Drop for Backdrop {
        fn drop(&mut self) {
            unsafe {
                let _ = DestroyWindow(self.hwnd);
            }
        }
    }

    thread_local! {
        /// The blur windows, by the label of the island window each sits under. Main thread only: composition
        /// objects belong to the thread that made them.
        static BACKDROPS: RefCell<HashMap<String, Backdrop>> = RefCell::new(HashMap::new());
        /// The dispatcher queue composition needs on this thread, kept for the app's life.
        static QUEUE: RefCell<Option<DispatcherQueueController>> = const { RefCell::new(None) };
        /// Set once making a blur failed, so an outline sent every frame does not retry (and log) every frame.
        static FAILED: Cell<bool> = const { Cell::new(false) };
        /// Whether the islands are shown (tray, fullscreen apps).
        static SHOWN: Cell<bool> = const { Cell::new(true) };
    }

    extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
    }

    /// Windows' "Transparency effects" (Settings, Personalization, Colors). Off means no blur anywhere, and the host
    /// backdrop would be a flat fill: then Docky leaves the blur off too.
    fn transparency_on() -> bool {
        let mut value: u32 = 1;
        let mut size = std::mem::size_of::<u32>() as u32;
        let read = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
                w!("EnableTransparency"),
                RRF_RT_REG_DWORD,
                None,
                Some((&mut value as *mut u32).cast()),
                Some(&mut size),
            )
        };
        read.is_err() || value != 0
    }

    fn ensure_queue() -> Result<()> {
        if DispatcherQueue::GetForCurrentThread().is_ok() {
            return Ok(());
        }
        let options = DispatcherQueueOptions {
            dwSize: std::mem::size_of::<DispatcherQueueOptions>() as u32,
            threadType: DQTYPE_THREAD_CURRENT,
            apartmentType: DQTAT_COM_NONE,
        };
        let controller = unsafe { CreateDispatcherQueueController(options)? };
        QUEUE.with(|q| *q.borrow_mut() = Some(controller));
        Ok(())
    }

    /// A Direct2D shape handed to composition as a path.
    #[implement(IGeometrySource2D, IGeometrySource2DInterop)]
    struct Shape(ID2D1Geometry);

    impl windows::Graphics::IGeometrySource2D_Impl for Shape_Impl {}

    impl IGeometrySource2DInterop_Impl for Shape_Impl {
        fn GetGeometry(&self) -> Result<ID2D1Geometry> {
            Ok(self.0.clone())
        }
        fn TryGetGeometryUsingFactory(&self, _: Ref<'_, ID2D1Factory>) -> Result<ID2D1Geometry> {
            Err(E_NOTIMPL.into())
        }
    }

    /// A concave ear `size` px wide: the square minus the circle that rounds it toward the island (the CSS `.ear`).
    fn ear_path(size: f32, right: bool) -> Result<CompositionPath> {
        unsafe {
            let factory: ID2D1Factory = D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, None)?;
            let path = factory.CreatePathGeometry()?;
            let sink = path.Open()?;
            let p = |x: f32, y: f32| Vector2 { X: x, Y: y };
            // The left ear's circle is centred on its bottom-left corner, the right one's on its bottom-right.
            let (start, corner, end, sweep) = if right {
                (p(size, 0.0), p(0.0, 0.0), p(0.0, size), D2D1_SWEEP_DIRECTION_CLOCKWISE)
            } else {
                (p(0.0, 0.0), p(size, 0.0), p(size, size), D2D1_SWEEP_DIRECTION_COUNTER_CLOCKWISE)
            };
            sink.BeginFigure(start, D2D1_FIGURE_BEGIN_FILLED);
            sink.AddLine(corner);
            sink.AddLine(end);
            sink.AddArc(&D2D1_ARC_SEGMENT {
                point: start,
                size: D2D_SIZE_F { width: size, height: size },
                rotationAngle: 0.0,
                sweepDirection: sweep,
                arcSize: D2D1_ARC_SIZE_SMALL,
            });
            sink.EndFigure(D2D1_FIGURE_END_CLOSED);
            sink.Close()?;
            let source: IGeometrySource2D = Shape(path.cast()?).into();
            CompositionPath::Create(&source)
        }
    }

    impl Backdrop {
        fn new() -> Result<Backdrop> {
            ensure_queue()?;
            unsafe {
                let instance = GetModuleHandleW(None)?;
                let class = WNDCLASSW { lpfnWndProc: Some(wndproc), hInstance: instance.into(), lpszClassName: w!("DockyGlassBlur"), ..Default::default() };
                // A second registration fails harmlessly: the class is already there.
                RegisterClassW(&class);
                let ex: WINDOW_EX_STYLE =
                    WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST | WS_EX_NOREDIRECTIONBITMAP | WS_EX_LAYERED | WS_EX_TRANSPARENT;
                let hwnd = CreateWindowExW(ex, w!("DockyGlassBlur"), w!("Docky glass"), WS_POPUP, 0, 0, 1, 1, None, None, Some(instance.into()), None)?;
                match Self::fill(hwnd) {
                    Ok(backdrop) => Ok(backdrop),
                    Err(e) => {
                        let _ = DestroyWindow(hwnd);
                        Err(e)
                    }
                }
            }
        }

        unsafe fn fill(hwnd: HWND) -> Result<Backdrop> {
            unsafe {
                SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA)?;
                let on: i32 = 1;
                DwmSetWindowAttribute(hwnd, USE_HOST_BACKDROP, (&on as *const i32).cast::<c_void>(), 4)?;
                let compositor = Compositor::new()?;
                let target = compositor.cast::<ICompositorDesktopInterop>()?.CreateDesktopWindowTarget(hwnd, false)?;
                let root = compositor.CreateContainerVisual()?;
                root.SetRelativeSizeAdjustment(Vector2 { X: 1.0, Y: 1.0 })?;
                root.SetOpacity(BLUR_MIX)?;
                target.SetRoot(&root)?;
                let brush = compositor.CreateHostBackdropBrush()?;

                let body = compositor.CreateSpriteVisual()?;
                body.SetBrush(&brush)?;
                let body_shape = compositor.CreateRoundedRectangleGeometry()?;
                body.SetClip(&compositor.CreateGeometricClipWithGeometry(&body_shape)?)?;
                root.Children()?.InsertAtTop(&body)?;
                let ear = || -> Result<SpriteVisual> {
                    let v = compositor.CreateSpriteVisual()?;
                    v.SetBrush(&brush)?;
                    root.Children()?.InsertAtTop(&v)?;
                    Ok(v)
                };
                let ears = [ear()?, ear()?];
                Ok(Backdrop { hwnd, compositor, _target: target, _root: root, body, body_shape, ears, ear_px: -1, shown: false })
            }
        }

        /// Lays the blur window over the island's window (just under it) and clips the blur to the outline.
        fn update(&mut self, island: HWND, p: Px, shown: bool) -> Result<()> {
            unsafe {
                let mut r = RECT::default();
                GetWindowRect(island, &mut r)?;
                let flags = SWP_NOACTIVATE | if shown { SWP_SHOWWINDOW } else { SWP_HIDEWINDOW };
                SetWindowPos(self.hwnd, Some(island), r.left, r.top, r.right - r.left, r.bottom - r.top, flags)?;
            }
            self.shown = shown;
            let (x, y, w, h, radius) = (p.x as f32, p.y as f32, p.w as f32, p.h as f32, p.radius as f32);
            // The body: only the bottom corners are round (the clip's top corners sit above the body, cut off).
            self.body.SetOffset(Vector3 { X: x, Y: y, Z: 0.0 })?;
            self.body.SetSize(Vector2 { X: w, Y: h })?;
            self.body_shape.SetOffset(Vector2 { X: 0.0, Y: -radius })?;
            self.body_shape.SetSize(Vector2 { X: w, Y: h + radius })?;
            self.body_shape.SetCornerRadius(Vector2 { X: radius, Y: radius })?;
            if p.ear != self.ear_px {
                self.ear_px = p.ear;
                let size = p.ear.max(1) as f32;
                for (i, ear) in self.ears.iter().enumerate() {
                    let path = self.compositor.CreatePathGeometryWithPath(&ear_path(size, i == 1)?)?;
                    ear.SetClip(&self.compositor.CreateGeometricClipWithGeometry(&path)?)?;
                    ear.SetSize(Vector2 { X: size, Y: size })?;
                    ear.SetIsVisible(p.ear > 0)?;
                }
            }
            let e = p.ear as f32;
            self.ears[0].SetOffset(Vector3 { X: x - e, Y: y, Z: 0.0 })?;
            self.ears[1].SetOffset(Vector3 { X: x + w, Y: y, Z: 0.0 })?;
            Ok(())
        }

        fn show(&mut self, shown: bool) {
            if self.shown != shown {
                self.shown = shown;
                unsafe {
                    let _ = ShowWindow(self.hwnd, if shown { SW_SHOWNOACTIVATE } else { SW_HIDE });
                }
            }
        }
    }

    pub fn shape(label: &str, island: isize, p: Px, shown: bool) {
        if FAILED.get() {
            return;
        }
        let shown = shown && SHOWN.get();
        BACKDROPS.with(|all| {
            let mut all = all.borrow_mut();
            if !all.contains_key(label) {
                if !transparency_on() {
                    FAILED.set(true);
                    crate::logfile::write("info", "vidro: os efeitos de transparência do Windows estão desligados; sem desfoque");
                    return;
                }
                match Backdrop::new() {
                    Ok(b) => {
                        all.insert(label.to_string(), b);
                    }
                    Err(e) => {
                        FAILED.set(true);
                        crate::logfile::write("warn", &format!("vidro: o Windows não criou o desfoque da ilha ({e})"));
                        return;
                    }
                }
            }
            if let Some(b) = all.get_mut(label) {
                if let Err(e) = b.update(HWND(island as *mut c_void), p, shown) {
                    crate::logfile::write("warn", &format!("vidro: o desfoque não acompanhou a ilha ({e})"));
                }
            }
        });
    }

    pub fn show_all(shown: bool) {
        SHOWN.set(shown);
        BACKDROPS.with(|all| {
            for b in all.borrow_mut().values_mut() {
                b.show(shown);
            }
        });
    }

    pub fn remove(label: &str) {
        BACKDROPS.with(|all| {
            all.borrow_mut().remove(label);
        });
        FAILED.set(false);
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn shape(_: &str, _: isize, _: super::Px, _: bool) {}
    pub fn show_all(_: bool) {}
    pub fn remove(_: &str) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passa_para_pixels_fisicos() {
        let o = Outline { x: 100.4, y: 0.0, w: 246.0, h: 36.0, radius: 18.0, ear: 16.0 };
        assert_eq!(to_physical(o, 1.5), Px { x: 151, y: 0, w: 369, h: 54, radius: 27, ear: 24 });
    }

    #[test]
    fn escala_invalida_vira_um() {
        let o = Outline { x: 10.0, y: 0.0, w: 0.2, h: 30.0, radius: -3.0, ear: 0.0 };
        assert_eq!(to_physical(o, f64::NAN), Px { x: 10, y: 0, w: 1, h: 30, radius: 0, ear: 0 });
    }
}
