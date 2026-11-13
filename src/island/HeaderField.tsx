import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIslandStore } from "./store";

/** Põe o conteúdo no cabeçalho da ilha aberta, ao lado dos olhinhos (só a página ativa está montada, então só uma usa). */
export function InHeader({ children }: { children: ReactNode }) {
  const slot = useIslandStore((s) => s.headerSlot);
  return slot ? createPortal(children, slot) : null;
}

interface HeaderFieldProps {
  icon: ReactNode;
  value: string;
  placeholder: string;
  label: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  /** Com a página aberta, qualquer tecla de letra já começa a digitar aqui. */
  typeToFocus?: boolean;
}

/**
 * O campo do cabeçalho (a busca dos Atalhos, a nota rápida): o mesmo desenho em todas as páginas.
 * Enter confirma; Esc com algo digitado só limpa, e vazio deixa a ilha recolher como sempre.
 */
export function HeaderField({ icon, value, placeholder, label, onChange, onEnter, typeToFocus = false }: HeaderFieldProps) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!typeToFocus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!(e.target instanceof Element)) return input.current?.focus();
      if (e.target.closest("input, textarea, select, [contenteditable]")) return;
      // Espaço num botão focado continua apertando o botão.
      if (e.key === " " && e.target.closest("button, [role=button]")) return;
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [typeToFocus]);

  return (
    <InHeader>
      <label className="hsearch">
        {icon}
        <input
          ref={input}
          value={value}
          placeholder={placeholder}
          aria-label={label}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter();
            if (e.key === "Escape" && value) {
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              onChange("");
            }
          }}
        />
        {value && <kbd>Enter</kbd>}
      </label>
    </InHeader>
  );
}
