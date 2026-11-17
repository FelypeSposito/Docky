import { useEffect, useState } from "react";
import { type Session } from "../../claude/sessions";
import { useClaudeStore } from "../../claude/store";
import { ipc } from "../../lib/ipc";
import { CheckIcon, ClaudeSpinner } from "../icons";
import celebrateSvg from "../../assets/clawd/clawd-celebrating.svg";
import idleSvg from "../../assets/clawd/clawd-idle-living.svg";
import sadSvg from "../../assets/clawd/clawd-sad.svg";
import waitSvg from "../../assets/clawd/clawd-notification.svg";
import sleepSvg from "../../assets/clawd/clawd-sleeping.svg";
import buildingSvg from "../../assets/clawd/clawd-working-building.svg";
import { currentWork, WORK_CLAWD as WORK } from "../../claude/clawd";
import { workKind } from "../../claude/sessions";

type Mood = "work" | "wait" | "idle" | "sleep" | "celebrate" | "sad";

/**
 * Clawd for each mood: ready-made animated SVGs from clawd-pet (MIT), see src/assets/clawd/README.md. Their canvas is
 * much larger than Clawd (room for effects), so each is drawn at the same scale per SVG unit: `box` is the viewBox
 * size and `dx` the shift that puts Clawd (x 0 to 15) in the middle of the stage.
 */
const CLAWD: Record<Mood, { src: string; label: string; box: number; dx: number }> = {
  work: { src: buildingSvg, label: "Clawd trabalhando", box: 45, dx: 0 },
  wait: { src: waitSvg, label: "Clawd chamando você", box: 45, dx: 0 },
  idle: { src: idleSvg, label: "Clawd à toa", box: 45, dx: 0 },
  sleep: { src: sleepSvg, label: "Clawd dormindo", box: 40, dx: 2.5 },
  celebrate: { src: celebrateSvg, label: "Clawd comemorando", box: 45, dx: 0 },
  sad: { src: sadSvg, label: "Clawd triste", box: 45, dx: 0 },
};
/** Pixels per SVG unit: Clawd is 15 units wide, so 90px on the stage. */
const UNIT = 6;

const clock = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

/** "agora", "há 4 min", "há 2 h": how long a session has been stopped. */
const ago = (seconds: number) => (seconds < 60 ? "agora" : seconds < 3600 ? `há ${Math.floor(seconds / 60)} min` : `há ${Math.floor(seconds / 3600)} h`);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function SessionRow({ session, now, asking }: { session: Session; now: number; asking: string | null }) {
  const seconds = Math.max(0, Math.floor((now - session.since) / 1000));
  const state = asking ? "wait" : session.state === "running" ? "run" : "done";
  return (
    <div className={`cs-row ${state}`}>
      <span className="cs-ic">
        {state === "wait" ? <i className="cs-ping" /> : state === "run" ? <ClaudeSpinner size={14} /> : <CheckIcon />}
      </span>
      <b>{session.project}</b>
      <span className="cs-tx">{state === "wait" ? `quer usar ${asking}` : state === "run" ? WORK[workKind(session.tool)].doing : "parada"}</span>
      <em>{state === "done" ? ago(seconds) : clock(seconds)}</em>
    </div>
  );
}

/**
 * Claude Code at a glance: Clawd shows the mood (typing, waiting for you, idle, asleep), one sentence says
 * what is going on, and each session sits on its own row with a live icon.
 */
export function ClaudePage({ active }: { active: boolean }) {
  const sessions = useClaudeStore((s) => s.sessions);
  const permissions = useClaudeStore((s) => s.permissions);
  const reaction = useClaudeStore((s) => s.reaction);
  const [now, setNow] = useState(() => performance.now());
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!active) return;
    setNow(performance.now());
    const timer = setInterval(() => setNow(performance.now()), 1000);
    void ipc.claudeStatus().then((s) => setInstalled(s.hooksInstalled));
    return () => clearInterval(timer);
  }, [active]);

  const list = Object.values(sessions).sort((a, b) => (a.state === b.state ? a.since - b.since : a.state === "running" ? -1 : 1));
  const running = list.filter((s) => s.state === "running");
  const askingBy = new Map(permissions.map((p) => [p.sessionId, p.toolName]));
  const waiting = permissions[0];

  // A reaction (session finished, permission denied) shows for a few seconds, unless a new request is waiting.
  const reacting = !waiting && reaction && now < reaction.until ? reaction.kind : null;
  const mood: Mood = reacting ?? (waiting ? "wait" : running.length > 0 ? "work" : list.length > 0 ? "idle" : "sleep");
  // What the most recent running session is doing picks Clawd's work animation.
  const work = currentWork(running);
  const stopped = list.length - running.length;

  let title: string;
  let sub: string;
  if (reacting === "celebrate") {
    title = "Terminou!";
    sub = running.length > 0 ? `Ainda escrevendo em ${plural(running.length, "projeto", "projetos")}` : "Pode conferir o resultado.";
  } else if (reacting === "sad") {
    title = "Permissão negada";
    sub = "Tudo bem, o Claude não vai fazer isso.";
  } else if (waiting) {
    title = "Esperando você";
    sub = `${list.find((s) => s.id === waiting.sessionId)?.project ?? "Uma sessão"} quer usar ${waiting.toolName}`;
  } else if (running.length > 0) {
    title = WORK[work].doing.charAt(0).toUpperCase() + WORK[work].doing.slice(1);
    sub = running.length === 1 ? `em ${running[0].project}` : `em ${plural(running.length, "projeto", "projetos")}`;
    if (stopped > 0) sub += ` · ${plural(stopped, "parada", "paradas")}`;
  } else if (list.length > 0) {
    title = "Tudo pronto";
    sub = plural(stopped, "sessão parada", "sessões paradas");
  } else if (installed === false) {
    title = "Falta ligar o Claude Code";
    sub = "Instale os hooks nas Configurações para ver as sessões aqui.";
  } else {
    title = "Nenhuma sessão agora";
    sub = "Quando você usar o Claude Code, ele aparece trabalhando aqui.";
  }

  return (
    <div className={`cs ${mood}`}>
      <div className="cs-stage">
        {/* Only mounted while the page is open: the animation lives inside the SVG and cannot be paused from outside. */}
        {active && (
          <img
            key={mood === "work" ? `work-${work}` : mood}
            className="cs-clawd"
            src={mood === "work" ? WORK[work].src : CLAWD[mood].src}
            alt={mood === "work" ? WORK[work].label : CLAWD[mood].label}
            draggable={false}
            style={{ width: CLAWD[mood].box * UNIT, height: CLAWD[mood].box * UNIT, translate: `${CLAWD[mood].dx * UNIT}px 0` }}
          />
        )}
      </div>
      <div className="cs-main">
        <div className="cs-head">
          <b>{title}</b>
          <span>{sub}</span>
        </div>
        {list.length > 0 ? (
          <div className="cs-list">
            {list.map((s) => (
              <SessionRow key={s.id} session={s} now={now} asking={askingBy.get(s.id) ?? null} />
            ))}
          </div>
        ) : (
          installed === false && (
            <button className="btn sm cs-setup" onClick={() => ipc.openSettings("claude")}>
              Abrir configurações
            </button>
          )
        )}
      </div>
    </div>
  );
}
