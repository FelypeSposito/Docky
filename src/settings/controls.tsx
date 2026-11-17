import type { ReactNode } from "react";
import { t } from "../i18n";

/** Um bloco de opções. Com `title`, ganha um título pequeno em cima (ajuda a varrer a página com os olhos). */
export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="grp">
      {title && <h2 className="grp-h">{t(title)}</h2>}
      {children}
    </section>
  );
}

/** Uma opção: nome, explicação curta e o controle. `data-label` é por onde a busca acha a linha. */
export function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="row" data-label={t(label)}>
      <div className="rl">
        <b>{t(label)}</b>
        {hint && <span>{t(hint)}</span>}
      </div>
      <div className="rc">{children}</div>
    </div>
  );
}

/** Botão só com ícone, para as ações das linhas (escolher, ocultar, remover): o texto vai no tooltip. */
export function IconButton({
  children,
  label,
  onClick,
  danger,
  active,
  disabled,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button className={`icb${danger ? " danger" : ""}${active ? " on" : ""}`} title={t(label)} aria-label={t(label)} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button className={`tg${value ? " on" : ""}`} role="switch" aria-checked={value} aria-label={t(label)} onClick={() => onChange(!value)}>
      <i />
    </button>
  );
}

export function Slider({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <input className="sl" type="range" min={0} max={100} value={value} aria-label={t(label)} onChange={(e) => onChange(Number(e.target.value))} />
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
    <div className="step" role="group" aria-label={t(label)}>
      <button aria-label={t("Diminuir")} onClick={() => set(value - step)}>
        −
      </button>
      <span>{shown}</span>
      <button aria-label={t("Aumentar")} onClick={() => set(value + step)}>
        +
      </button>
    </div>
  );
}

/** Número inteiro com − e +, com a unidade ao lado (minutos, segundos…). */
export function NumberStepper({ label, value, unit, min, max, step = 1, onChange }: { label: string; value: number; unit: string; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <div className="step" role="group" aria-label={t(label)}>
      <button aria-label={t("Diminuir")} disabled={value <= min} onClick={() => set(value - step)}>
        −
      </button>
      <span>
        {value} {t(unit)}
      </span>
      <button aria-label={t("Aumentar")} disabled={value >= max} onClick={() => set(value + step)}>
        +
      </button>
    </div>
  );
}

/** Escolha entre poucas opções, no mesmo estilo do seletor de modos do Foco. */
export function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="seg2" role="radiogroup" aria-label={t(label)}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {t(o.label)}
        </button>
      ))}
    </div>
  );
}

/** One color out of a few, as round swatches; `null` is the "automatic" choice, drawn as a ring of hues. */
export function Swatches({
  label,
  value,
  options,
  auto,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly { id: string; label: string; color: string }[];
  auto: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="sws" role="radiogroup" aria-label={t(label)}>
      <button className={`sw auto${value === null ? " on" : ""}`} role="radio" aria-checked={value === null} aria-label={t(auto)} title={t(auto)} onClick={() => onChange(null)} />
      {options.map((o) => (
        <button
          key={o.id}
          className={`sw${value === o.id ? " on" : ""}`}
          role="radio"
          aria-checked={value === o.id}
          aria-label={t(o.label)}
          title={t(o.label)}
          style={{ "--sw": o.color } as React.CSSProperties}
          onClick={() => onChange(o.id)}
        />
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
