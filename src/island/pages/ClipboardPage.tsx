import { useEffect, useRef, useState } from "react";
import { useConfigStore } from "../../config/useConfig";
import { formatAgo } from "../../lib/format";
import { type ClipItem, ipc } from "../../lib/ipc";
import { EmptyState } from "../EmptyState";
import { CheckIcon, CloseIcon } from "../icons";

/** What happened to the card just clicked: copied back, or why not. */
type Status = { id: number; ok: true } | { id: number; ok: false; text: string };

/**
 * Copiados: the last texts you copied. A click puts one back on the clipboard, ready for Ctrl+V. The list lives only
 * in memory on the Rust side, and texts that password managers mark as private never get here.
 */
export function ClipboardPage({ active }: { active: boolean }) {
  const on = useConfigStore((s) => s.config.clipboardHistory);
  const update = useConfigStore((s) => s.update);
  const [items, setItems] = useState<ClipItem[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void ipc.clipboardHistory().then(setItems);
    return ipc.onClipboard(setItems);
  }, []);

  // "há 2 min" is worked out again when the page opens or the list changes, not on a timer.
  useEffect(() => {
    if (active) setNow(Date.now());
  }, [active, items]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (item: ClipItem) => {
    let next: Status;
    try {
      await ipc.clipboardCopy(item.id);
      next = { id: item.id, ok: true };
    } catch (e) {
      next = { id: item.id, ok: false, text: e instanceof Error ? e.message : String(e) };
    }
    setStatus(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(null), next.ok ? 1600 : 4000);
  };

  if (!on) {
    return (
      <EmptyState
        title="O histórico está desligado"
        text="Ligado, os últimos textos que você copiar ficam aqui para copiar de novo com um clique."
        action={{ label: "Ligar", onClick: () => update({ clipboardHistory: true }) }}
      />
    );
  }
  if (items.length === 0) {
    return <EmptyState title="Nada copiado ainda" text="Os últimos 10 textos que você copiar aparecem aqui. Senhas copiadas de gerenciadores ficam de fora." />;
  }

  return (
    <div className="nlist clist">
      {items.map((item, i) => {
        const mine = status?.id === item.id ? status : null;
        return (
          <div
            key={item.id}
            className={`tile ncard ccard${mine?.ok ? " copied" : ""}${i === 0 ? " current" : ""}`}
            role="button"
            tabIndex={0}
            title={i === 0 ? "Na área de transferência agora" : "Clique para copiar de novo"}
            onClick={() => void copy(item)}
            onKeyDown={(e) => e.target === e.currentTarget && e.key === "Enter" && void copy(item)}
          >
            <p>{item.preview}</p>
            <em>
              {mine?.ok ? (
                <span className="cok">
                  <CheckIcon size={11} /> Copiado, é só colar
                </span>
              ) : mine ? (
                <span className="cerr">{mine.text}</span>
              ) : (
                (i === 0 ? "na área de transferência" : formatAgo(item.at, new Date(now)))
              )}
            </em>
            <div className="nact">
              <button
                className="del"
                aria-label="Tirar do histórico"
                title="Tirar do histórico"
                onClick={(e) => {
                  e.stopPropagation();
                  void ipc.clipboardRemove(item.id);
                }}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          </div>
        );
      })}
      <button className="tile ncard cclear" onClick={() => void ipc.clipboardClear()}>
        Limpar o histórico
      </button>
    </div>
  );
}
