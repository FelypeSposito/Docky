import { useEffect, useState } from "react";
import { type Session } from "../../claude/sessions";
import { useClaudeStore } from "../../claude/store";
import { ipc } from "../../lib/ipc";

const fmt = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

function SessionRow({ session, now }: { session: Session; now: number }) {
  const running = session.state === "running";
  return (
    <div className="crow">
      <i className={`dot ${running ? "run" : "ok"}`} />
      <b>{session.project}</b>
      <span className="tx">{running ? "Escrevendo código" : "Parada"}</span>
      {running && <em>{fmt(Math.max(0, Math.floor((now - session.since) / 1000)))}</em>}
    </div>
  );
}

export function ClaudePage({ active }: { active: boolean }) {
  const sessions = useClaudeStore((s) => s.sessions);
  const waiting = useClaudeStore((s) => s.permissions.length);
  const [now, setNow] = useState(() => performance.now());
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!active) return;
    setNow(performance.now());
    const timer = setInterval(() => setNow(performance.now()), 1000);
    void ipc.claudeStatus().then((s) => setInstalled(s.hooksInstalled));
    return () => clearInterval(timer);
  }, [active]);

  const list = Object.values(sessions).sort((a, b) => a.since - b.since);
  const running = list.filter((s) => s.state === "running").length;

  if (list.length === 0) {
    return (
      <div className="tile soon">
        <b>{installed === false ? "Os hooks do Claude Code ainda não estão instalados" : "Nenhuma sessão por enquanto"}</b>
        <span>
          {installed === false
            ? "Abra Configurações, em Claude Code, para instalar. Depois, as sessões aparecem aqui."
            : "Quando você usar o Claude Code, as sessões e os pedidos de permissão aparecem aqui."}
        </span>
      </div>
    );
  }

  return (
    <div className="bento cl">
      <div className="tile stat">
        <b>{running}</b>
        <span>
          <i className="dot run" />
          Rodando
        </span>
      </div>
      <div className="tile stat">
        <b>{waiting}</b>
        <span>
          <i className="dot wait" />
          Esperando
        </span>
      </div>
      <div className="tile stat">
        <b>{list.length - running}</b>
        <span>
          <i className="dot ok" />
          Paradas
        </span>
      </div>
      <div className="tile clist">
        {list.slice(0, 3).map((s) => (
          <SessionRow key={s.id} session={s} now={now} />
        ))}
      </div>
    </div>
  );
}
