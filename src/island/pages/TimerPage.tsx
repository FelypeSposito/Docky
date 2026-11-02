import { useFocusStore } from "../../focus/store";
import { useConfigStore } from "../../config/useConfig";
import { clock, LABELS, type TimerMode } from "../../focus/timer";
import { PauseIcon, PlayIcon } from "../icons";

const MODES: TimerMode[] = ["focus", "short", "long"];
const CIRCUMFERENCE = 326.7;

export function TimerPage() {
  const { mode, total, left, running, cycle, done, perSet, toggle, reset, setMode } = useFocusStore();
  const focusMinutes = useConfigStore((s) => s.config.focusMinutes);
  const offset = CIRCUMFERENCE * (1 - left / total);
  const dots = Array.from({ length: perSet }, (_, i) => i < cycle);
  const minutes = done * focusMinutes;

  return (
    <div className="bento pomo">
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
    </div>
  );
}
