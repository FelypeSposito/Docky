import { type RefObject, useEffect, useRef } from "react";

/** How far the mouse must travel sideways before a press on the island becomes a drag (a smaller move is a click). */
const DRAG_THRESHOLD = 5;
/** Within this many pixels of the middle, the island snaps back to the center. */
const CENTER_SNAP = 18;
/** The notch is the island plus an ear of this width on each side. */
const EAR = 16;

/**
 * A spring for the glide back home (damping 0.82): a quick start, a long soft landing and a 1% overshoot, the same
 * springy family as the island's own resizing.
 */
const GLIDE_EASING =
  "linear(0, 0.0272, 0.0949, 0.186, 0.288, 0.392, 0.492, 0.5843, 0.6668, 0.7385, 0.7994, 0.8501, 0.8914, 0.9243, 0.95, 0.9696, 0.9842, 0.9947, 1.0019, 1.0066, 1.0094, 1.0107, 1.0111, 1.0108, 1.01, 1.009, 1.0079, 1.0067, 1.0056, 1.0046, 1.0037, 1.0029, 1.0022, 1.0016, 1.0012, 1.0008, 1)";

/** Where a press must not start a drag: controls keep their own clicks and drags (sliders, sortable tiles, fields). */
const INTERACTIVE = "button, input, textarea, select, a, [role=button], [role=slider], [contenteditable], .track";

/**
 * The island's position along the top edge, from where its left side is: 0 = flush left, 0.5 = centered,
 * 1 = flush right. Near the middle it snaps to the center.
 */
export function positionFor(left: number, islandWidth: number, screenWidth: number): number {
  const room = screenWidth - islandWidth;
  if (room <= 0) return 0.5;
  if (Math.abs(left - room / 2) < CENTER_SNAP) return 0.5;
  return Math.min(1, Math.max(0, left / room));
}

interface DragOptions {
  /** Whether a press on this element may move the island (for example, only the header when it is open). */
  canStart: (target: HTMLElement) => boolean;
  /** The drag began: the window must take the mouse everywhere along the strip until it ends. */
  onStart: () => void;
  /** The drag ended at `position`. */
  onEnd: (position: number) => void;
  /** Double click on an empty spot: the island goes back to the center. */
  onHome: () => void;
  /** "Reduzir movimento": a new position fades in instead of gliding. */
  reduceMotion: boolean;
}

/**
 * Drag the island sideways along the top of the screen; a double click on an empty spot sends it back to the center.
 * The position lives in the `--pos` CSS variable of the notch,
 * so moving costs no React render; it is saved once, when the mouse is released.
 */
export function useIslandDrag(notchRef: RefObject<HTMLDivElement | null>, position: number, options: DragOptions) {
  const live = useRef(options);
  live.current = options;
  /** A drag just happened: the click that follows the release must not open or pin the island. */
  const dragged = useRef(false);

  // A new position from elsewhere (double click, Settings) glides there: the notch jumps to its new place and is drawn
  // back from the old one with `translate` (FLIP), so the move costs no layout. A drop needs no glide: the drag already
  // put the island where it lands.
  const mounted = useRef(false);
  useEffect(() => {
    const notch = notchRef.current;
    if (!notch) return;
    if (!mounted.current) {
      mounted.current = true;
      notch.style.setProperty("--pos", String(position));
      return;
    }
    const before = notch.getBoundingClientRect().left; // includes a glide still running, so a new one picks up from there
    notch.getAnimations().forEach((a) => a.id.startsWith("glide") && a.cancel());
    notch.style.setProperty("--pos", String(position));
    const dx = before - notch.getBoundingClientRect().left;
    if (Math.abs(dx) < 1) return;
    if (live.current.reduceMotion) {
      notch.animate({ opacity: [0.35, 1] }, { id: "glide-fade", duration: 180, easing: "ease-out" });
      return;
    }
    const distance = Math.abs(dx);
    const duration = Math.min(760, 440 + distance * 0.22);
    notch.animate({ translate: [`${dx}px 0`, "0 0"] }, { id: "glide", duration, easing: GLIDE_EASING });
    // Squash and stretch along the way: wider and a touch flatter while it travels, more for a longer trip.
    const stretch = Math.min(0.045, distance / 10_000);
    notch.animate(
      { scale: ["1 1", `${1 + stretch} ${1 - stretch / 2.5}`, "1 1"], offset: [0, 0.32, 1] },
      { id: "glide-stretch", duration: duration * 0.8, easing: "cubic-bezier(0.33, 0, 0.2, 1)" },
    );
  }, [notchRef, position]);

  const onPointerDown = (e: React.PointerEvent) => {
    const notch = notchRef.current;
    const target = e.target as HTMLElement;
    if (e.button !== 0 || !notch || target.closest(INTERACTIVE) || !live.current.canStart(target)) return;

    const box = notch.getBoundingClientRect();
    const grab = e.clientX - (box.left + EAR);
    const startX = e.clientX;
    let moving = false;
    let next = position;

    const move = (ev: PointerEvent) => {
      if (!moving) {
        if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD) return;
        moving = true;
        notch.getAnimations().forEach((a) => a.id.startsWith("glide") && a.finish());
        notch.classList.add("moving");
        live.current.onStart();
      }
      const width = notch.getBoundingClientRect().width - 2 * EAR;
      next = positionFor(ev.clientX - grab, width, window.innerWidth);
      notch.style.setProperty("--pos", next.toFixed(4));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!moving) return;
      notch.classList.remove("moving");
      dragged.current = true;
      // A click event may not follow (released off the island): forget the drag shortly after either way.
      setTimeout(() => (dragged.current = false), 0);
      live.current.onEnd(next);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(INTERACTIVE) || !live.current.canStart(target)) return;
    live.current.onHome();
  };

  return {
    onPointerDown,
    onDoubleClick,
    /** True when the click being handled is the end of a drag (and should be ignored). */
    justDragged: () => dragged.current,
  };
}
