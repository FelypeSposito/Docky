import { type RefObject, useEffect } from "react";
import { isTauri } from "../lib/ipc";

/**
 * Real blur behind the liquid glass (glass.rs): a blur window just under the island's, clipped to the island's
 * outline (body and ears) so only the glass is frosted, not the whole top strip.
 *
 * The outline is sent while it changes (springs, the gel stretch, a press, dragging and gliding) and the loop stops
 * once it has held still for a few frames, so a resting island costs nothing.
 */
const EAR = 16;
/** Frames the outline must hold still before the loop stops. */
const STILL_FRAMES = 20;

export interface GlassOutline {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  ear: number;
}

/** Whether two outlines differ by at least half a pixel anywhere (smaller changes are not worth a new region). */
export function outlineMoved(a: GlassOutline | null, b: GlassOutline): boolean {
  if (!a) return true;
  return (Object.keys(b) as (keyof GlassOutline)[]).some((k) => Math.abs(a[k] - b[k]) >= 0.5);
}

export function useGlassBlur(notchRef: RefObject<HTMLDivElement | null>, islandRef: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!isTauri || !enabled) return;
    const notch = notchRef.current;
    const island = islandRef.current;
    if (!notch || !island) return;

    let alive = true;
    let invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
    let last: GlassOutline | null = null;
    let raf = 0;
    let still = 0;

    const measure = (): GlassOutline => {
      const box = island.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(island).borderBottomLeftRadius) || 0;
      return { x: box.left, y: box.top, w: box.width, h: box.height, radius, ear: EAR };
    };

    const frame = () => {
      raf = 0;
      if (!alive || !invoke) return;
      const now = measure();
      if (outlineMoved(last, now)) {
        last = now;
        still = 0;
        void invoke("island_glass_shape", { outline: now }).catch(() => {});
      } else {
        still += 1;
      }
      if (still < STILL_FRAMES) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      still = 0;
      if (!raf) raf = requestAnimationFrame(frame);
    };

    void import("@tauri-apps/api/core").then((core) => {
      if (!alive) return;
      invoke = core.invoke;
      void invoke("island_glass", { on: true }).catch(() => {});
      kick();
    });

    // The spring writes the size into the notch's style every frame; drags and presses change style and class too.
    const watcher = new MutationObserver(kick);
    watcher.observe(notch, { attributes: true, attributeFilter: ["style", "class"] });
    watcher.observe(island, { attributes: true, attributeFilter: ["style", "class"] });
    // Animations that move it without touching attributes (the glide after a drag).
    window.addEventListener("pointerdown", kick);
    window.addEventListener("pointerup", kick);
    window.addEventListener("resize", kick);
    notch.addEventListener("animationstart", kick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      watcher.disconnect();
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("pointerup", kick);
      window.removeEventListener("resize", kick);
      notch.removeEventListener("animationstart", kick);
      void invoke?.("island_glass", { on: false }).catch(() => {});
    };
  }, [notchRef, islandRef, enabled]);
}
