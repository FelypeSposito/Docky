import { useCallback, useEffect, useState } from "react";
import { useConfigStore } from "../config/useConfig";
import { type DiscordSetup, type DiscordState, ipc } from "../lib/ipc";
import { TextField } from "./Fields";
import { Group, Row } from "./controls";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const STEPS: { text: string; link?: { label: string; url: string } }[] = [
  { text: "No portal de desenvolvedores do Discord, clique em New Application e dê um nome (pode ser Docky).", link: { label: "Abrir o portal do Discord", url: "https://discord.com/developers/applications" } },
  { text: "Em OAuth2, adicione em Redirects exatamente http://127.0.0.1 e salve." },
  { text: "Ainda em OAuth2, copie o Client ID e, em Client Secret, clique em Reset Secret e copie a chave." },
  { text: "Cole os dois nos campos abaixo." },
  { text: "Com o Discord aberto, clique em Autorizar e confirme na janela que aparece no Discord." },
];

const STATUS_LABEL: Record<DiscordState["status"], string> = {
  off: "Falta configurar",
  closed: "Discord fechado",
  authorize: "Falta autorizar",
  ready: "Conectado",
};

/**
 * Discord (opcional): os controles da chamada na ilha. O Discord só libera a voz para o dono do app, então cada pessoa
 * cria o seu no portal, como no Google Agenda. Nada passa por servidor do Docky.
 */
export function DiscordSection() {
  const { config, update } = useConfigStore();
  const [state, setState] = useState<DiscordState | null>(null);
  const [setup, setSetup] = useState<DiscordSetup | null>(null);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);

  const refresh = useCallback(() => {
    void ipc.discordState().then(setState).catch(() => {});
    void ipc.discordSetup().then(setSetup).catch((e) => setError(message(e)));
  }, []);
  useEffect(() => {
    refresh();
    const off = ipc.onDiscord((next) => {
      setState(next);
      void ipc.discordSetup().then(setSetup).catch(() => {});
    });
    return off;
  }, [refresh]);

  const saveSecret = () => {
    const value = secret.trim();
    if (!value) return;
    ipc
      .discordSaveSecret(value)
      .then(() => {
        setSecret("");
        refresh();
      })
      .catch((e) => setError(message(e)));
  };

  const status = state?.status ?? "off";
  const shownError = error ?? setup?.error ?? null;

  return (
    <>
      <Group title="Discord">
        <Row label="Chamada do Discord" hint="Mutar, ensurdecer, sair e ver quem está falando, direto na ilha. Precisa do Discord aberto neste computador">
          <span className={`badge${status === "ready" ? " ok" : ""}`}>{STATUS_LABEL[status]}</span>
          {status === "ready" ? (
            <button className="btn danger" onClick={() => void ipc.discordCommand("forget").then(refresh)}>
              Desconectar
            </button>
          ) : (
            <button className="btn primary" disabled={status !== "authorize"} onClick={() => void ipc.discordCommand("authorize").catch((e) => setError(message(e)))}>
              Autorizar
            </button>
          )}
        </Row>
        <Row label="Client ID" hint="Um número longo, em OAuth2 no portal do Discord">
          <TextField label="Client ID do Discord" width={300} value={config.discordClientId} placeholder="123456789012345678" onCommit={(v) => update({ discordClientId: v.trim() })} />
        </Row>
        <Row label="Client Secret" hint={setup?.secretSaved ? "Guardado no Gerenciador de Credenciais do Windows. Cole outro para trocar." : "Fica guardado no Gerenciador de Credenciais do Windows, não em arquivo."}>
          <input
            className="inp"
            style={{ width: 300 }}
            type="password"
            value={secret}
            placeholder={setup?.secretSaved ? "•••••••••••• (salvo)" : "Client Secret"}
            aria-label="Client Secret do Discord"
            autoComplete="off"
            onChange={(e) => setSecret(e.target.value)}
            onBlur={saveSecret}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </Row>
      </Group>

      {shownError && <div className="error">{shownError}</div>}

      <Group>
        <Row label="Como criar o app do Discord" hint="Leva uns 3 minutos e só precisa ser feito uma vez">
          <button className="btn" onClick={() => setGuide((v) => !v)}>
            {guide ? "Esconder" : "Ver o passo a passo"}
          </button>
        </Row>
        {guide && (
          <div className="guide">
            <ol>
              {STEPS.map((step) => (
                <li key={step.text}>
                  {step.text}
                  {step.link && (
                    <button className="link" onClick={() => void ipc.openUrl(step.link!.url)}>
                      {step.link.label}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </Group>
    </>
  );
}
