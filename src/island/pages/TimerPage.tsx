import { useEffect, useState } from "react";
import { useFocusStore } from "../../focus/store";
import { useConfigStore } from "../../config/useConfig";
import { clock, LABELS, type TimerMode } from "../../focus/timer";
import { PauseIcon, PlayIcon } from "../icons";

const MODES: TimerMode[] = ["focus", "short", "long", "custom"];
const PRESETS = [5, 15, 30, 45, 60];
const MIN_CUSTOM = 1;
const MAX_CUSTOM = 600;
const CIRCUMFERENCE = 326.7;

const clamp = (minutes: number) => Math.min(MAX_CUSTOM, Math.max(MIN_CUSTOM, Math.round(minutes)));

/** Campo de minutos: deixa apagar e digitar à vontade e só aplica o número quando você sai do campo ou aperta Enter. */
function MinutesInput({ value, disabled, onCommit }: { value: number; disabled: boolean; onCommit: (minutes: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const typed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(typed)) return setDraft(String(value));
    onCommit(clamp(typed));
    setDraft(String(clamp(typed)));
  };
  return (
    <input
      className="mins"
      inputMode="numeric"
      aria-label="Minutos do contador"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 3))}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

export function TimerPage() {
  const { mode, total, left, running, cycle, done, perSet, toggle, reset, setMode } = useFocusStore();
  const focusMinutes = useConfigStore((s) => s.config.focusMinutes);
  const customMinutes = useConfigStore((s) => s.config.timerCustomMinutes);
  const update = useConfigStore((s) => s.update);
  const offset = CIRCUMFERENCE * (1 - left / total);
  const dots = Array.from({ length: perSet }, (_, i) => i < cycle);
  const minutes = done * focusMinutes;
  const setCustom = (value: number) => update({ timerCustomMinutes: clamp(value) });

  return (
    <div className={`bento pomo ${mode}`}>
      <div className="tile ringt">
        <div className="ring">
          <svg width="116" height="116" viewBox="0 0 118 118" aria-hidden="true">
            <circle className="bg" cx="59" cy="59" r="52" />
            <circle className="fg" cx="59" cy="59" r="52" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset} />
          </svg>
          <div className="t">
            <b>{clock(left)}</b>
            <span>{LABELS[mode]}</span>
          </div>
        </div>
      </div>

      <div className="tile ctl1">
        <div className="seg" role="tablist">
          {MODES.map((m) => (
            <button key={m} role="tab" aria-selected={m === mode} className={m === mode ? "on" : ""} onClick={() => setMode(m)}>
              {LABELS[m]}
            </button>
          ))}
        </div>
        <div className="row">
          <button className="pbtn" onClick={toggle}>
            {running ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
            {running ? "Pausar" : "Iniciar"}
          </button>
          <button className="ib" aria-label="Reiniciar" onClick={reset}>
            ↺
          </button>
        </div>
      </div>

      {mode === "custom" ? (
        <div className="tile st cust" title={running ? "Pause para mudar o tempo" : undefined}>
          <div className="stp" role="group" aria-label="Tempo do contador">
            <button aria-label="Menos um minuto" disabled={running || customMinutes <= MIN_CUSTOM} onClick={() => setCustom(customMinutes - 1)}>
              −
            </button>
            <MinutesInput value={customMinutes} disabled={running} onCommit={setCustom} />
            <span>min</span>
            <button aria-label="Mais um minuto" disabled={running || customMinutes >= MAX_CUSTOM} onClick={() => setCustom(customMinutes + 1)}>
              +
            </button>
          </div>
          <div className="chips">
            {PRESETS.map((m) => (
              <button key={m} className={m === customMinutes ? "on" : ""} disabled={running} onClick={() => setCustom(m)}>
                {m}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="tile st">
          <div className="cyc">
            {dots.map((on, i) => (
              <i key={i} className={on ? "on" : ""} />
            ))}
          </div>
          <div>
            <b>
              {Math.min(cycle, perSet)} de {perSet} focos
            </b>
            <span>{done === 0 ? "Nenhum foco hoje ainda" : `${done} ${done === 1 ? "foco" : "focos"} · ${minutes} min`}</span>
          </div>
        </div>
      )}
    </div>
  );
}
