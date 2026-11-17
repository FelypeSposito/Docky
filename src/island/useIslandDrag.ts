import { type RefObject, useEffect, useRef } from "react";

/** How far the mouse must travel sideways before a press on the island becomes a drag (a smaller move is a click). */
const DRAG_THRESHOLD = 5;
/** Within this many pixels of the middle, the island snaps back to the center. */
const CENTER_SNAP = 18;
/** The notch is the island plus an ear of this width on each side. */
const EAR = 16;

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
}

/**
 * Drag the island sideways along the top of the screen. The position lives in the `--pos` CSS variable of the notch,
 * so moving costs no React render; it is saved once, when the mouse is released.
 */
export function useIslandDrag(notchRef: RefObject<HTMLDivElement | null>, position: number, options: DragOptions) {
  const live = useRef(options);
  live.current = options;
  /** A drag just happened: the click that follows the release must not open or pin the island. */
  const dragged = useRef(false);

  useEffect(() => {
    notchRef.current?.style.setProperty("--pos", String(position));
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

  return {
    onPointerDown,
    /** True when the click being handled is the end of a drag (and should be ignored). */
    justDragged: () => dragged.current,
  };
}
