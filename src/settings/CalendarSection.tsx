import { useCallback, useEffect, useState } from "react";
import { useCalendarStore, type CalendarStatus } from "../calendar/store";
import { useConfigStore } from "../config/useConfig";
import { ipc } from "../lib/ipc";
import { TextField } from "./Fields";
import { Group, Row } from "./controls";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const STEPS: { text: string; link?: { label: string; url: string } }[] = [
  { text: "Entre no Google Cloud e crie um projeto novo (pode chamar de Docky).", link: { label: "Abrir o Google Cloud", url: "https://console.cloud.google.com/projectcreate" } },
  { text: "Em APIs e serviços, ative a Google Calendar API.", link: { label: "Ativar a Calendar API", url: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" } },
  { text: "Em Tela de consentimento OAuth, escolha Externo, dê um nome ao app e preencha o seu e-mail.", link: { label: "Abrir a tela de consentimento", url: "https://console.cloud.google.com/apis/credentials/consent" } },
  { text: "Em Credenciais, crie um ID do cliente OAuth do tipo App para computador.", link: { label: "Abrir as credenciais", url: "https://console.cloud.google.com/apis/credentials" } },
  { text: "Copie o ID do cliente e a chave secreta e cole nos campos abaixo." },
  { text: "Em Público-alvo, clique em Publicar app. Sem isso o Google derruba o login a cada 7 dias. Para uso pessoal não precisa de verificação." },
  { text: "Clique em Conectar. Se o Google avisar que o app não foi verificado, vá em Avançado e continue: o app é o seu." },
];

/** O Google Agenda (somente leitura): credenciais, login e o passo a passo para criá-las. */
export function CalendarSection() {
  const { config, update } = useConfigStore();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);

  const refresh = useCallback(() => ipc.calendarStatus().then(setStatus).catch((e) => setError(message(e))), []);
  useEffect(() => void refresh(), [refresh]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      await refresh();
      void useCalendarStore.getState().load(true);
    }
  };

  const saveSecret = () => {
    const value = secret.trim();
    if (!value) return;
    void run(async () => {
      await ipc.calendarSaveSecret(value);
      setSecret("");
    });
  };

  const label = status?.connected ? "Conectado" : status?.configured ? "Falta fazer o login" : "Falta configurar";

  return (
    <>
      <Group>
        <Row label="Google Agenda" hint="Somente leitura: o Docky mostra os próximos eventos e o botão de entrar na chamada">
          <span className={`badge${status?.connected ? " ok" : ""}`}>{label}</span>
          {status?.connected ? (
            <button className="btn danger" disabled={busy} onClick={() => run(() => ipc.calendarDisconnect())}>
              Desconectar
            </button>
          ) : (
            <button className="btn primary" disabled={busy || !status?.configured} onClick={() => run(() => ipc.calendarConnect())}>
              {busy ? "Aguardando o login…" : "Conectar"}
            </button>
          )}
        </Row>
        <Row label="ID do cliente" hint="Termina em .apps.googleusercontent.com">
          <TextField label="ID do cliente" width={300} value={config.googleClientId} placeholder="123456-abc.apps.googleusercontent.com" onCommit={(v) => update({ googleClientId: v })} />
        </Row>
        <Row label="Chave secreta" hint={status?.secretSaved ? "Guardada no Gerenciador de Credenciais do Windows. Cole outra para trocar." : "Fica guardada no Gerenciador de Credenciais do Windows, não em arquivo."}>
          <input
            className="inp"
            style={{ width: 300 }}
            type="password"
            value={secret}
            placeholder={status?.secretSaved ? "•••••••••••• (salva)" : "GOCSPX-…"}
            aria-label="Chave secreta"
            autoComplete="off"
            onChange={(e) => setSecret(e.target.value)}
            onBlur={saveSecret}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </Row>
      </Group>

      {error && <div className="error">{error}</div>}

      <Group>
        <Row label="Como criar o ID do cliente" hint="Leva uns 5 minutos e só precisa ser feito uma vez">
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
