import type { ReactNode } from "react";

export function Group({ children }: { children: ReactNode }) {
  return <div className="grp">{children}</div>;
}

export function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="row">
      <div className="rl">
        <b>{label}</b>
        {hint && <span>{hint}</span>}
      </div>
      <div className="rc">{children}</div>
    </div>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button className={`tg${value ? " on" : ""}`} role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)}>
      <i />
    </button>
  );
}

export function Slider({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <input className="sl" type="range" min={0} max={100} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
  );
}

interface StepperProps {
  label: string;
  value: number;
  unit: string;
  step: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export function Stepper({ label, value, unit, step, min, max, onChange }: StepperProps) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, Math.round(next / step) * step)));
  const shown = `${value > 0 ? "+" : ""}${value.toFixed(1).replace(".", ",")} ${unit}`;
  return (
    <div className="step" role="group" aria-label={label}>
      <button aria-label="Diminuir" onClick={() => set(value - step)}>
        −
      </button>
      <span>{shown}</span>
      <button aria-label="Aumentar" onClick={() => set(value + step)}>
        +
      </button>
    </div>
  );
}

export function Soon({ phase, text }: { phase: number; text: string }) {
  return (
    <div className="soon-card">
      <b>Chega na Fase {phase}</b>
      <span>{text}</span>
    </div>
  );
}
