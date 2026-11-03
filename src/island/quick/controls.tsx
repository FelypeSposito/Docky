import { type ReactNode, useEffect, useState } from "react";
import { ipc } from "../../lib/ipc";
import { FolderIcon } from "../icons";

/** Os controles dos ajustes rápidos: os mesmos da janela de configurações, no visual da ilha. */

export function QPanel({ children }: { children: ReactNode }) {
  return <div className="qs">{children}</div>;
}

export function QTitle({ children }: { children: ReactNode }) {
  return <h3 className="qs-title">{children}</h3>;
}

export function QRow({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="qs-row">
      <div className="qs-l">
        <b>{label}</b>
        {hint && <span>{hint}</span>}
      </div>
      <div className="qs-c">{children}</div>
    </div>
  );
}

export function QToggle({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button className={`qs-tg${value ? " on" : ""}`} role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)}>
      <i />
    </button>
  );
}

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** Como mostrar o número (por padrão, o próprio número). */
  format?: (value: number) => string;
  onChange: (value: number) => void;
}

export function QStepper({ label, value, min, max, step = 1, unit = "", format, onChange }: StepperProps) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, Math.round(next / step) * step)));
  return (
    <div className="qs-step" role="group" aria-label={label}>
      <button aria-label="Diminuir" disabled={value <= min} onClick={() => set(value - step)}>
        −
      </button>
      <span>
        {format ? format(value) : value}
        {unit && <small> {unit}</small>}
      </span>
      <button aria-label="Aumentar" disabled={value >= max} onClick={() => set(value + step)}>
        +
      </button>
    </div>
  );
}

export function QSegmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="qs-seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={String(option.value)} role="radio" aria-checked={option.value === value} className={option.value === value ? "on" : ""} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Campo de texto que só grava ao sair dele ou apertar Enter. */
export function QText({
  value,
  placeholder,
  label,
  width = 200,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  label: string;
  width?: number | string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft.trim() !== value && onCommit(draft.trim());
  return (
    <input
      className="qs-inp"
      style={{ width }}
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

/** Botão só com ícone, para as ações das linhas (abrir seletor, ocultar, excluir…): o texto vai no tooltip. */
export function QIconButton({
  children,
  label,
  onClick,
  tone,
  active,
  disabled,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "danger";
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button className={`qs-ib${tone ? ` ${tone}` : ""}${active ? " on" : ""}`} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** Texto com o botão (só o ícone de pasta) que abre o seletor de arquivo ou pasta do Windows. */
export function QPath({
  value,
  kind,
  placeholder,
  label,
  width = 200,
  onCommit,
}: {
  value: string;
  kind: "app" | "folder" | "image";
  placeholder?: string;
  label: string;
  width?: number | string;
  onCommit: (value: string) => void;
}) {
  return (
    <span className="qs-path">
      <QText value={value} placeholder={placeholder} label={label} width={width} onCommit={onCommit} />
      <QIconButton label={kind === "folder" ? "Escolher a pasta" : "Escolher no computador"} onClick={() => void ipc.pickPath(kind).then((path) => path && onCommit(path))}>
        <FolderIcon />
      </QIconButton>
    </span>
  );
}

export function QButton({ children, onClick, tone, disabled, title }: { children: ReactNode; onClick: () => void; tone?: "primary" | "danger"; disabled?: boolean; title?: string }) {
  return (
    <button className={`qs-btn${tone ? ` ${tone}` : ""}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}
