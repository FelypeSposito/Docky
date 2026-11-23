//! Real blur behind the island when the liquid glass material is on.
//!
//! The island's window spans the whole top strip of the screen. The window is cut to the island's exact outline (a
//! window region: the body with its rounded bottom corners, plus the two concave "ears" at the top), and the blur is
//! the window's accent blur, which DWM clips to that region. The island sends its outline every frame it moves
//! (springs, gel, dragging), see `useGlassBlur.ts`.
//!
//! Not Tauri's window effects: on Windows 11 22H2 and newer they use the system backdrop, which Microsoft draws
//! "behind the entire window bounds" and which ignores the region, so the whole strip went gray (0.3.5).
//! To stay safe, the blur only turns on after a region is in place, and turning the glass off clears both.

use std::sync::Mutex;

use tauri::WebviewWindow;

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

/// The outline in physical pixels, rounded: what the region is built from.
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

/// Windows (by label) whose glass is wanted, and whether the blur is already on for each.
static WANTED: Mutex<Vec<(String, bool)>> = Mutex::new(Vec::new());

/// Turns the glass on (the blur waits for the first outline) or off (no blur, the whole window back).
#[tauri::command]
pub fn island_glass(window: WebviewWindow, on: bool) {
    let label = window.label().to_string();
    let mut wanted = WANTED.lock().unwrap_or_else(|p| p.into_inner());
    wanted.retain(|(l, _)| *l != label);
    if on {
        wanted.push((label, false));
    } else {
        drop(wanted);
        imp::blur(&window, false);
        imp::clear(&window);
    }
}

/// The island's outline changed: the window is cut to it again, and the blur comes on the first time.
#[tauri::command]
pub fn island_glass_shape(window: WebviewWindow, outline: Outline) {
    let label = window.label().to_string();
    let mut wanted = WANTED.lock().unwrap_or_else(|p| p.into_inner());
    let Some(entry) = wanted.iter_mut().find(|(l, _)| *l == label) else { return };
    let scale = window.scale_factor().unwrap_or(1.0);
    if !imp::cut(&window, to_physical(outline, scale)) {
        crate::logfile::write("warn", "vidro: o Windows recusou o recorte da janela da ilha; sem desfoque");
        return;
    }
    if !entry.1 {
        entry.1 = imp::blur(&window, true);
        if !entry.1 {
            crate::logfile::write("warn", "vidro: o Windows não ligou o desfoque da janela da ilha");
        }
    }
}

#[cfg(windows)]
mod imp {
    use std::ffi::c_void;

    use tauri::WebviewWindow;
    use windows::{
        Win32::{
            Foundation::HWND,
            Graphics::Gdi::{CombineRgn, CreateEllipticRgn, CreateRectRgn, CreateRoundRectRgn, DeleteObject, HGDIOBJ, HRGN, RGN_DIFF, RGN_OR, SetWindowRgn},
            System::LibraryLoader::{GetModuleHandleW, GetProcAddress},
        },
        core::{s, w},
    };

    use super::Px;

    fn hwnd(window: &WebviewWindow) -> Option<HWND> {
        window.hwnd().ok().map(|h| HWND(h.0 as *mut c_void))
    }

    /// A concave ear: the square at (left, 0) minus the circle that rounds it toward the island.
    unsafe fn ear(left: i32, size: i32, circle_left: i32) -> HRGN {
        unsafe {
            let square = CreateRectRgn(left, 0, left + size, size);
            let circle = CreateEllipticRgn(circle_left, 0, circle_left + 2 * size, 2 * size);
            CombineRgn(Some(square), Some(square), Some(circle), RGN_DIFF);
            let _ = DeleteObject(HGDIOBJ(circle.0));
            square
        }
    }

    /// Cuts the window to the outline. False if Windows refused.
    pub fn cut(window: &WebviewWindow, p: Px) -> bool {
        let Some(hwnd) = hwnd(window) else { return false };
        unsafe {
            // The body: rounded only at the bottom (the top corners are pushed above the window, out of sight).
            let body = CreateRoundRectRgn(p.x, p.y - p.radius, p.x + p.w + 1, p.y + p.h + 1, 2 * p.radius, 2 * p.radius);
            if p.ear > 0 {
                let left = ear(p.x - p.ear, p.ear, p.x - 2 * p.ear);
                let right = ear(p.x + p.w, p.ear, p.x + p.w);
                CombineRgn(Some(body), Some(body), Some(left), RGN_OR);
                CombineRgn(Some(body), Some(body), Some(right), RGN_OR);
                let _ = DeleteObject(HGDIOBJ(left.0));
                let _ = DeleteObject(HGDIOBJ(right.0));
            }
            // The window owns the region from here on: it must not be deleted.
            if SetWindowRgn(hwnd, Some(body), true) == 0 {
                let _ = DeleteObject(HGDIOBJ(body.0));
                return false;
            }
        }
        true
    }

    pub fn clear(window: &WebviewWindow) {
        if let Some(hwnd) = hwnd(window) {
            unsafe {
                SetWindowRgn(hwnd, None, true);
            }
        }
    }

    #[repr(C)]
    struct AccentPolicy {
        state: u32,
        flags: u32,
        gradient_color: u32,
        animation_id: u32,
    }

    #[repr(C)]
    struct CompositionData {
        attribute: u32,
        data: *mut c_void,
        size: usize,
    }

    type SetWindowCompositionAttribute = unsafe extern "system" fn(HWND, *mut CompositionData) -> i32;

    /// WCA_ACCENT_POLICY with ACCENT_ENABLE_BLURBEHIND: a plain blur that DWM clips to the window region (the
    /// page draws the gray tint). User32 exports it without documenting it, so it is looked up at run time and its
    /// absence only means no blur.
    pub fn blur(window: &WebviewWindow, on: bool) -> bool {
        const WCA_ACCENT_POLICY: u32 = 19;
        const ACCENT_DISABLED: u32 = 0;
        const ACCENT_ENABLE_BLURBEHIND: u32 = 3;
        let Some(hwnd) = hwnd(window) else { return false };
        unsafe {
            let Ok(user32) = GetModuleHandleW(w!("user32.dll")) else { return false };
            let Some(proc) = GetProcAddress(user32, s!("SetWindowCompositionAttribute")) else { return false };
            let set: SetWindowCompositionAttribute = std::mem::transmute(proc);
            let mut policy = AccentPolicy { state: if on { ACCENT_ENABLE_BLURBEHIND } else { ACCENT_DISABLED }, flags: 0, gradient_color: 0, animation_id: 0 };
            let mut data = CompositionData { attribute: WCA_ACCENT_POLICY, data: (&mut policy as *mut AccentPolicy).cast(), size: std::mem::size_of::<AccentPolicy>() };
            set(hwnd, &mut data) != 0
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use tauri::WebviewWindow;

    pub fn cut(_: &WebviewWindow, _: super::Px) -> bool {
        false
    }
    pub fn clear(_: &WebviewWindow) {}
    pub fn blur(_: &WebviewWindow, _: bool) -> bool {
        false
    }
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
