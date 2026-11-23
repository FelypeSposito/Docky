import { type RefObject, useCallback, useEffect, useRef } from "react";
import { cursor, onCursorMove } from "../lib/cursor";

/**
 * Liquid glass (Settings, Aparência, Material): the motion half of the material, after Apple's "Meet Liquid Glass"
 * (WWDC25). The look lives in island.css under `.notch.glass`; this hook drives what moves:
 *
 * - Light: the specular highlight on the rim faces the cursor, like a light source in the room, and glides there
 *   instead of jumping. When the island changes state, the light also travels around the rim ("these lights move in
 *   space" on system interactions).
 * - Touch: a press "energizes" the glass from the point under the pointer and flexes it a little, like gel; letting
 *   go settles it back with a small bounce.
 *
 * Reduce motion turns all of it off (Apple: Reduced Motion "disables any elastic properties").
 */

/** Degrees per frame the light closes toward the cursor (a fraction of the gap, so it eases in). */
const LIGHT_FOLLOW = 0.12;
/** How far the light travels around the rim when the island changes state. */
const STATE_SWEEP = 140;
/** The press: how much the glass swells under the pointer, and how it settles (a spring with a small overshoot). */
const PRESS_SCALE = 1.022;
const RELEASE_EASING =
  "linear(0, 0.18 4%, 0.55 11%, 0.86 18%, 1.02 25%, 1.07 30%, 1.06 35%, 1.02 43%, 0.995 55%, 1.001 70%, 1)";

/** The angle (degrees, 0 = up, clockwise) from the island's center to the cursor. */
export function lightAngle(box: { left: number; top: number; width: number; height: number }, x: number, y: number): number {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const deg = (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** The shortest signed turn from `from` to `to`, in degrees (-180 to 180). */
export function shortestTurn(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export function useLiquidGlass(islandRef: RefObject<HTMLDivElement | null>, enabled: boolean, reduceMotion: boolean, mode: string) {
  const light = useRef<{ angle: number; sweep: number; raf: number; wake: (() => void) | null }>({ angle: 200, sweep: 0, raf: 0, wake: null });
  const live = enabled && !reduceMotion;

  // The light follows the cursor, easing in; a state change adds a sweep that fades out.
  useEffect(() => {
    const island = islandRef.current;
    if (!island) return;
    if (!enabled) {
      island.style.removeProperty("--light");
      return;
    }
    const state = light.current;
    const paint = () => island.style.setProperty("--light", `${(state.angle + state.sweep + 360) % 360}deg`);
    if (reduceMotion) {
      // A still light from the top left, where Apple's sits by default.
      state.angle = 315;
      state.sweep = 0;
      paint();
      return;
    }
    const tick = () => {
      const target = lightAngle(island.getBoundingClientRect(), cursor.x, cursor.y);
      const turn = shortestTurn(state.angle, target);
      state.angle = (state.angle + turn * LIGHT_FOLLOW + 360) % 360;
      state.sweep *= 0.9;
      paint();
      state.raf = Math.abs(turn) > 0.3 || Math.abs(state.sweep) > 0.3 ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      if (!state.raf) state.raf = requestAnimationFrame(tick);
    };
    wake();
    const off = onCursorMove(wake);
    state.wake = wake;
    return () => {
      off();
      state.wake = null;
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    };
  }, [islandRef, enabled, reduceMotion]);

  // A new state sends the light around the rim.
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    if (!live) return;
    light.current.sweep += STATE_SWEEP;
    light.current.wake?.();
  }, [mode, live]);

  /** Energize from the point under the pointer, and flex. Call from the island's pointerdown. */
  const press = useCallback(
    (e: React.PointerEvent) => {
      const island = islandRef.current;
      if (!live || !island || e.button !== 0) return;
      const box = island.getBoundingClientRect();
      island.style.setProperty("--px", `${e.clientX - box.left}px`);
      island.style.setProperty("--py", `${e.clientY - box.top}px`);
      // The glow is animated directly: the island's class belongs to React and changes on every render.
      island.querySelector(".lq-glow")?.animate(
        [
          { opacity: 0, transform: "scale(0.55)" },
          { opacity: 1, offset: 0.16 },
          { opacity: 0, transform: "scale(1.5)" },
        ],
        { duration: 900, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
      island.getAnimations().forEach((a) => (a as CSSAnimation).id === "liquid-press" && a.cancel());
      const grow = island.animate([{ scale: "1" }, { scale: `${PRESS_SCALE}` }], { duration: 160, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards", id: "liquid-press" });
      const release = () => {
        window.removeEventListener("pointerup", release);
        window.removeEventListener("pointercancel", release);
        const from = getComputedStyle(island).scale || "1";
        grow.cancel();
        island.animate([{ scale: from === "none" ? "1" : from }, { scale: "1" }], { duration: 520, easing: RELEASE_EASING, id: "liquid-press" });
      };
      window.addEventListener("pointerup", release);
      window.addEventListener("pointercancel", release);
    },
    [islandRef, live],
  );

  return { press };
}
