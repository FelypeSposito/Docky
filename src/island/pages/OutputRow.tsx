import { useCallback, useEffect, useState } from "react";
import { sortOutputs, splitOutputName } from "../../audio/devices";
import { useAudioStore } from "../../audio/store";
import { t } from "../../i18n";
import { type AudioOutput, type AudioState, ipc, type OutputKind, type SwitchError } from "../../lib/ipc";
import { HeadphonesIcon, MicIcon, MicOffIcon, ScreenIcon, SpeakerIcon } from "../icons";

const REFRESH_MS = 3000;
/** The microphone's hotkey, as Rust names it (`hotkeys.rs`, `label`). */
const MIC_HOTKEY = "Ctrl+Alt+M";

function OutputIcon({ kind }: { kind: OutputKind }) {
  if (kind === "headphones") return <HeadphonesIcon size={16} />;
  if (kind === "display") return <ScreenIcon size={16} />;
  return <SpeakerIcon size={16} />;
}

/** "Fones de ouvido · UGREEN Studio Pro" */
const label = (output: AudioOutput) => {
  const { title, detail } = splitOutputName(output.name);
  return detail ? `${title} · ${detail}` : title;
};

/**
 * Where the sound goes, and the microphone: stacked under "Volume geral" on the Som page. Switching uses an
 * undocumented Windows interface (audio.rs); when Windows refuses, the sound settings open instead, and when a sound
 * enhancer (FxSound) takes the default back, it says so.
 */
export function OutputRow({ active }: { active: boolean }) {
  const [state, setState] = useState<AudioState | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const mic = useAudioStore((s) => s.mic);
  // The hotkey is shown only when it works: another program may have taken Ctrl+Alt+M first.
  const [micKey, setMicKey] = useState<string | null>(null);
  useEffect(() => {
    void ipc
      .hotkeysTaken()
      .then((taken) => setMicKey(taken.includes(MIC_HOTKEY) ? null : MIC_HOTKEY))
      .catch(() => setMicKey(null));
  }, []);

  const refresh = useCallback(async () => {
    const next = await ipc.audioState();
    setState(next);
    useAudioStore.setState({ mic: next.mic });
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);

  if (!state) return null;
  const outputs = sortOutputs(state.outputs);
  const current = outputs.find((o) => o.default) ?? outputs[0];

  const pick = async (id: string) => {
    setNote(null);
    try {
      await ipc.setOutput(id);
    } catch (e) {
      const error = e as SwitchError;
      if (error?.kind === "takenBack") setNote(t("{app} pegou a saída de volta: escolha o aparelho na janela dele", { app: splitOutputName(error.by).detail || error.by }));
      else {
        setNote(t("O Windows não deixou trocar: abri as configurações de som"));
        void ipc.openSoundSettings();
      }
    }
    void refresh();
  };

  const toggleMic = () => {
    if (!mic) return;
    const muted = !mic.muted;
    useAudioStore.setState({ mic: { muted } });
    void ipc.setDefaultMicMuted(muted).then((ok) => !ok && useAudioStore.setState({ mic: { muted: !muted } }));
  };

  return (
    <>
      {current ? (
        <label className="mx-field">
          <span className="mx-field-ic" aria-hidden="true">
            <OutputIcon kind={current.kind} />
          </span>
          <select className="mx-out" aria-label={t("Saída de som")} title={label(current)} value={current.id} onChange={(e) => void pick(e.target.value)}>
            {outputs.map((o) => (
              <option key={o.id} value={o.id}>
                {label(o)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        // No speakers or headphones: say so where the choice would be, and keep the microphone below.
        <div className="mx-field none">
          <span className="mx-field-ic" aria-hidden="true">
            <SpeakerIcon size={16} />
          </span>
          <span className="mx-mic-txt">{t("Nenhuma saída de som")}</span>
        </div>
      )}
      {note && <div className="mx-note">{note}</div>}
      {mic && (
        <button
          className={`mx-mic${mic.muted ? " off" : ""}`}
          aria-pressed={mic.muted}
          aria-label={t(mic.muted ? "Ativar o microfone" : "Mutar o microfone")}
          title={micKey ? `${t(mic.muted ? "Ativar o microfone" : "Mutar o microfone")} (${micKey})` : t(mic.muted ? "Ativar o microfone" : "Mutar o microfone")}
          onClick={toggleMic}
        >
          <span className="mx-field-ic">{mic.muted ? <MicOffIcon /> : <MicIcon />}</span>
          <span className="mx-mic-txt">{t(mic.muted ? "Microfone mudo" : "Microfone ligado")}</span>
          {micKey && <kbd>{micKey}</kbd>}
        </button>
      )}
    </>
  );
}
