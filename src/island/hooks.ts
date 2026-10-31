import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Spring } from "../lib/spring";
import { ipc, type Power } from "../lib/ipc";
import { COLLAPSED_HEIGHT, type Size } from "./modes";

/** Hora atual, atualizada no começo de cada minuto. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = new Date();
      setNow(current);
      timer = setTimeout(tick, (60 - current.getSeconds()) * 1000 - current.getMilliseconds() + 20);
    };
    tick();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/** Estado da bateria e do carregador; `onPlugged` dispara quando o carregador é conectado. */
export function usePower(onPlugged: () => void): Power | null {
  const [power, setPower] = useState<Power | null>(null);
  const plugged = useRef<boolean | null>(null);
  const callback = useRef(onPlugged);
  callback.current = onPlugged;

  useEffect(() => {
    let alive = true;
    const apply = (next: Power) => {
      if (!alive) return;
      if (plugged.current === false && next.plugged && next.hasBattery) callback.current();
      plugged.current = next.plugged;
      setPower(next);
    };
    void ipc.getPower().then((initial) => initial && apply(initial));
    const off = ipc.onPower(apply);
    return () => {
      alive = false;
      off();
    };
  }, []);

  return power;
}

const GROW = { response: 0.46, damping: 0.76 };
const SHRINK = { response: 0.4, damping: 0.88 };
const REDUCED = { response: 0.26, damping: 1 };
const EAR = 32; // as duas orelhas côncavas (16px de cada lado)
const MAX_RADIUS = 34;
const MIN_RADIUS = 18;

/**
 * Anima a largura e a altura da ilha com molas e escreve direto no DOM (sem re-render por frame).
 * O laço só roda enquanto as molas se movem, para a ilha parada custar zero de CPU.
 */
export function useIslandSpring(
  notchRef: RefObject<HTMLDivElement | null>,
  islandRef: RefObject<HTMLDivElement | null>,
  size: Size,
  reduceMotion: boolean,
  maxHeight: number,
): void {
  const springs = useRef<{ w: Spring; h: Spring; grow: boolean } | null>(null);
  const raf = useRef(0);
  const reduce = useRef(reduceMotion);
  reduce.current = reduceMotion;

  const paint = useCallback(() => {
    const s = springs.current;
    const notch = notchRef.current;
    const island = islandRef.current;
    if (!s || !notch || !island) return;
    const w = Math.max(120, s.w.x);
    const h = Math.max(30, s.h.x);
    const radius = Math.min(
      MAX_RADIUS,
      Math.max(MIN_RADIUS, MIN_RADIUS + ((h - COLLAPSED_HEIGHT) / (maxHeight - COLLAPSED_HEIGHT)) * (MAX_RADIUS - MIN_RADIUS)),
    );
    notch.style.width = `${w + EAR}px`;
    notch.style.height = `${h}px`;
    island.style.borderRadius = `0 0 ${radius}px ${radius}px`;
    island.style.setProperty("--shadow", String(Math.min(0.5, Math.max(0, ((h - COLLAPSED_HEIGHT) / 190) * 0.5)).toFixed(2)));
  }, [notchRef, islandRef, maxHeight]);

  const run = useCallback(() => {
    if (raf.current) return;
    let last = performance.now();
    const frame = (now: number) => {
      const s = springs.current!;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = reduce.current ? REDUCED : s.grow ? GROW : SHRINK;
      s.w.step(dt, p.response, p.damping);
      s.h.step(dt, p.response + 0.04, Math.min(1, p.damping + 0.04));
      if (s.w.settled && s.h.settled) {
        s.w.snap(s.w.target);
        s.h.snap(s.h.target);
        paint();
        raf.current = 0;
        return;
      }
      paint();
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
  }, [paint]);

  useEffect(() => {
    if (!springs.current) {
      springs.current = { w: new Spring(size.w), h: new Spring(size.h), grow: false };
      paint();
      return;
    }
    const s = springs.current;
    s.grow = size.w * size.h > s.w.target * s.h.target;
    s.w.target = size.w;
    s.h.target = size.h;
    run();
  }, [size.w, size.h, paint, run]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);
}
