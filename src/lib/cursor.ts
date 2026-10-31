import { ipc } from "./ipc";

/** Última posição conhecida do cursor (pixels lógicos relativos à janela da ilha). */
export const cursor = { x: 300, y: 200, lastMove: performance.now() };

const listeners = new Set<() => void>();

/** Avisa quem quiser reagir ao movimento (os olhos acordam o laço de animação por aqui). */
export function onCursorMove(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Para janelas sem o cursor global do Rust (as configurações): usa o mouse dentro da própria janela. */
export function trackDomCursor(): () => void {
  const listener = (e: PointerEvent) => {
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    cursor.lastMove = performance.now();
    listeners.forEach((l) => l());
  };
  window.addEventListener("pointermove", listener);
  return () => window.removeEventListener("pointermove", listener);
}

/** Começa a escutar o cursor global. Devolve a função que cancela. */
export function startCursorTracking(): () => void {
  return ipc.onCursor((point) => {
    cursor.x = point.x;
    cursor.y = point.y;
    cursor.lastMove = performance.now();
    listeners.forEach((listener) => listener());
  });
}
