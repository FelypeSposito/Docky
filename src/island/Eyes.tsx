import { useEffect, useRef, useState } from "react";
import { cursor, onCursorMove } from "../lib/cursor";

export type EyesMood = "normal" | "wide" | "work" | "ask";

interface EyesProps {
  mood: EyesMood;
  /** Se falso, os olhos olham para a frente em vez de seguir o cursor. */
  follow: boolean;
  /** Cada vez que aumenta, os olhos balançam "não" (você negou um pedido). */
  shake: number;
}

const MAX_PUPIL_OFFSET = 3.6;
const MAX_HEAD_SHIFT = 1.6;
const GLANCE_AFTER_MS = 4500;
const SLEEP_AFTER_MS = 60_000;

/** Para onde olhar, conforme o humor: lendo (de um lado a outro), no botão Permitir, ou no cursor. */
function lookTarget(mood: EyesMood, now: number, follow: boolean, glance: { x: number; y: number }, sleeping: boolean) {
  const center = window.innerWidth / 2;
  if (mood === "work") return { x: center + Math.sin(now / 1000 * 1.7) * 170, y: 40 + Math.sin(now / 1000 * 0.6) * 8 };
  if (mood === "ask") {
    const button = document.getElementById("docky-allow")?.getBoundingClientRect();
    if (button) return { x: button.left + button.width / 2, y: button.top + button.height / 2 };
  }
  if (!follow) return { x: center, y: 140 };
  if (sleeping) return { x: center, y: 900 };
  return now - cursor.lastMove > GLANCE_AFTER_MS ? glance : { x: cursor.x, y: cursor.y };
}

/**
 * O mascote do Docky: dois olhinhos que seguem o cursor, piscam e olham em volta quando nada acontece.
 * O laço de animação só roda enquanto há algo se mexendo; parado, não gasta CPU.
 */
export function Eyes({ mood, follow, shake }: EyesProps) {
  const root = useRef<HTMLDivElement>(null);
  const [blink, setBlink] = useState(false);
  const [sleepy, setSleepy] = useState(false);
  const [shaking, setShaking] = useState(false);
  const wake = useRef<() => void>(() => {});
  const live = useRef({ mood, follow });
  live.current = { mood, follow };

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const eyes = [...el.querySelectorAll<HTMLElement>(".eye")];
    const pupils = eyes.map((eye) => eye.querySelector<HTMLElement>(".pupil")!);
    const offsets = eyes.map(() => ({ x: 0, y: 0 }));
    const shift = { x: 0, y: 0 };
    let glance = { x: window.innerWidth / 2, y: 140 };
    let raf = 0;
    let last = performance.now();
    let sleeping = false;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const idleFor = now - cursor.lastMove;
      const { mood: currentMood, follow: currentFollow } = live.current;

      const shouldSleep = idleFor > SLEEP_AFTER_MS && currentMood === "normal";
      if (shouldSleep !== sleeping) {
        sleeping = shouldSleep;
        setSleepy(sleeping);
      }

      const target = lookTarget(currentMood, now, currentFollow, glance, sleeping);
      const k = 1 - Math.exp(-dt * (currentMood === "work" ? 9 : 16));
      let moving = 0;
      let sx = 0;
      let sy = 0;
      eyes.forEach((eye, i) => {
        const box = eye.getBoundingClientRect();
        const dx = target.x - (box.left + box.width / 2 - shift.x);
        const dy = target.y - (box.top + box.height / 2 - shift.y);
        const dist = Math.hypot(dx, dy) || 1;
        const reach = Math.min(MAX_PUPIL_OFFSET, dist / 22);
        const wantX = (dx / dist) * reach;
        const wantY = (dy / dist) * reach;
        moving = Math.max(moving, Math.abs(wantX - offsets[i].x), Math.abs(wantY - offsets[i].y));
        offsets[i].x += (wantX - offsets[i].x) * k;
        offsets[i].y += (wantY - offsets[i].y) * k;
        pupils[i].style.transform = `translate(${offsets[i].x.toFixed(2)}px, ${offsets[i].y.toFixed(2)}px)`;
        sx += (dx / dist) * Math.min(MAX_HEAD_SHIFT, dist / 160);
        sy += (dy / dist) * Math.min(MAX_HEAD_SHIFT, dist / 160);
      });
      shift.x += (sx / eyes.length - shift.x) * k;
      shift.y += (sy / eyes.length - shift.y) * k;
      el.style.translate = `${shift.x.toFixed(2)}px ${shift.y.toFixed(2)}px`;

      // Lendo, os olhos nunca param; nos outros casos o laço dorme quando as pupilas chegam.
      raf = moving > 0.02 || currentMood === "work" ? requestAnimationFrame(frame) : 0;
    };

    const start = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    wake.current = start;
    const offCursor = onCursorMove(start);

    // Olhadinhas aleatórias quando o cursor fica parado.
    let glanceTimer: ReturnType<typeof setTimeout>;
    const scheduleGlance = () => {
      glanceTimer = setTimeout(() => {
        glance = { x: Math.random() * window.innerWidth, y: Math.random() * 260 };
        start();
        scheduleGlance();
      }, 1700 + Math.random() * 3400);
    };
    scheduleGlance();

    // Piscadas, às vezes duplas.
    let blinkTimer: ReturnType<typeof setTimeout>;
    const scheduleBlink = (delay: number) => {
      blinkTimer = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 120);
        scheduleBlink(Math.random() < 0.22 ? 260 : 2400 + Math.random() * 3800);
      }, delay);
    };
    scheduleBlink(2500);

    start();
    return () => {
      cancelAnimationFrame(raf);
      offCursor();
      clearTimeout(glanceTimer);
      clearTimeout(blinkTimer);
    };
  }, []);

  useEffect(() => wake.current(), [mood, follow, sleepy]);

  useEffect(() => {
    if (shake === 0) return;
    setShaking(true);
    const timer = setTimeout(() => setShaking(false), 450);
    return () => clearTimeout(timer);
  }, [shake]);

  const state = sleepy ? "sleep" : mood;
  return (
    <div
      ref={root}
      className={`eyes${blink ? " blink" : ""}${shaking ? " shake" : ""}`}
      data-mood={state}
      aria-hidden="true"
    >
      <div className="eye l">
        <i className="pupil" />
        <b className="lid t" />
        <b className="lid b" />
      </div>
      <div className="eye r">
        <i className="pupil" />
        <b className="lid t" />
        <b className="lid b" />
      </div>
    </div>
  );
}
