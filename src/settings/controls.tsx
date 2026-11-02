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

/** Número inteiro com − e +, com a unidade ao lado (minutos, segundos…). */
export function NumberStepper({ label, value, unit, min, max, step = 1, onChange }: { label: string; value: number; unit: string; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <div className="step" role="group" aria-label={label}>
      <button aria-label="Diminuir" disabled={value <= min} onClick={() => set(value - step)}>
        −
      </button>
      <span>
        {value} {unit}
      </span>
      <button aria-label="Aumentar" disabled={value >= max} onClick={() => set(value + step)}>
        +
      </button>
    </div>
  );
}

/** Escolha entre poucas opções, no mesmo estilo do seletor de modos do Foco. */
export function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="seg2" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
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
