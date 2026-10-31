import { useCallback, useEffect, useState } from "react";
import { useConfigStore } from "../config/useConfig";
import { type ClaudeStatus, type HooksPlan, ipc } from "../lib/ipc";
import { Group, Row, Toggle } from "./controls";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function ClaudeSection() {
  const { config, update } = useConfigStore();
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [plan, setPlan] = useState<HooksPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => ipc.claudeStatus().then(setStatus).catch((e) => setError(message(e))), []);
  useEffect(() => void refresh(), [refresh]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setPlan(null);
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const serverUp = (status?.port ?? 0) > 0;

  return (
    <>
      <Group>
        <Row label="Servidor local" hint="Só aceita conexões desta máquina, com um token secreto">
          <span className={`badge${serverUp ? " ok" : ""}`}>{serverUp ? `127.0.0.1:${status?.port}` : "parado"}</span>
        </Row>
        <Row label="Hooks do Claude Code" hint={status?.settingsPath ?? "…"}>
          <span className={`badge${status?.hooksInstalled ? " ok" : ""}`}>{status?.hooksInstalled ? "Instalados" : "Não instalados"}</span>
          {status?.hooksInstalled ? (
            <button className="btn danger" disabled={busy} onClick={() => run(() => ipc.claudeHooksRemove())}>
              Remover
            </button>
          ) : (
            <button className="btn primary" disabled={busy || !serverUp} onClick={() => ipc.claudeHooksPlan().then(setPlan).catch((e) => setError(message(e)))}>
              Instalar…
            </button>
          )}
        </Row>
      </Group>

      {plan && (
        <div className="plan">
          <b>O que vai mudar</b>
          <p>
            O Docky vai adicionar hooks em <code>{plan.settingsPath}</code> para os eventos{" "}
            {plan.events.map((e) => (
              <code key={e}>{e}</code>
            ))}
            . Seus hooks e configurações atuais ficam como estão. Uma cópia do arquivo original é guardada em{" "}
            <code>{plan.backupPath}</code>.
          </p>
          <p>Cada hook roda um comando como este (o token fica oculto aqui):</p>
          <pre>{plan.exampleCommand}</pre>
          <p>
            Se o Docky estiver fechado, o comando não faz nada e o Claude Code pergunta no terminal como sempre. Para
            desfazer, use Remover.
          </p>
          <div className="plan-actions">
            <button className="btn" disabled={busy} onClick={() => setPlan(null)}>
              Cancelar
            </button>
            <button className="btn primary" disabled={busy} onClick={() => run(() => ipc.claudeHooksInstall())}>
              Aplicar
            </button>
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <Group>
        <Row label="Aprovar pela ilha" hint="Se o Docky estiver fechado ou isto desligado, o terminal pergunta normalmente">
          <Toggle label="Aprovar pela ilha" value={config.claudeApprove} onChange={(v) => update({ claudeApprove: v })} />
        </Row>
      </Group>
    </>
  );
}
