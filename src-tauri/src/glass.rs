//! Real blur behind the island when the liquid glass material is on.
//!
//! The island's window spans the whole top strip of the screen, so Windows' acrylic on it would frost the whole
//! strip. Instead the window is cut to the island's exact outline (a window region: the body with its rounded bottom
//! corners, plus the two concave "ears" at the top), and the acrylic only shows inside it. The island sends its
//! outline every frame it moves (springs, gel, dragging), see `useGlassBlur.ts`. Outside the outline the window does
//! not exist, so the desktop is untouched there, exactly as before.
//!
//! The black material clears both: no effect and no region, the window is whole again.

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

/// Turns the glass on (acrylic, the region comes with the first outline) or off (no effect, the whole window back).
#[tauri::command]
pub fn island_glass(window: WebviewWindow, on: bool) {
    if on {
        let effects = tauri::utils::config::WindowEffectsConfig {
            effects: vec![tauri::window::Effect::Acrylic],
            state: None,
            radius: None,
            color: Some(tauri::window::Color(22, 22, 28, 40)),
            interactive: false,
        };
        let _ = window.set_effects(effects);
    } else {
        let _ = window.set_effects(None);
        imp::clear(&window);
    }
}

/// The island's outline changed: the window is cut to it again.
#[tauri::command]
pub fn island_glass_shape(window: WebviewWindow, outline: Outline) {
    let scale = window.scale_factor().unwrap_or(1.0);
    imp::cut(&window, to_physical(outline, scale));
}

#[cfg(windows)]
mod imp {
    use tauri::WebviewWindow;
    use windows::Win32::{
        Foundation::HWND,
        Graphics::Gdi::{CombineRgn, CreateEllipticRgn, CreateRectRgn, CreateRoundRectRgn, DeleteObject, HGDIOBJ, HRGN, RGN_DIFF, RGN_OR, SetWindowRgn},
    };

    use super::Px;

    fn hwnd(window: &WebviewWindow) -> Option<HWND> {
        window.hwnd().ok().map(|h| HWND(h.0 as *mut std::ffi::c_void))
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

    pub fn cut(window: &WebviewWindow, p: Px) {
        let Some(hwnd) = hwnd(window) else { return };
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
            }
        }
    }

    pub fn clear(window: &WebviewWindow) {
        if let Some(hwnd) = hwnd(window) {
            unsafe {
                SetWindowRgn(hwnd, None, true);
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use tauri::WebviewWindow;

    pub fn cut(_: &WebviewWindow, _: super::Px) {}
    pub fn clear(_: &WebviewWindow) {}
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
