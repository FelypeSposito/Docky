import { memo, useEffect, useMemo, useRef, useState } from "react";
import { currentWork, WAIT_CLAWD, WORK_CLAWD } from "../claude/clawd";
import { describeTurn, runningSessions } from "../claude/sessions";
import { startClaudeSync, useClaudeStore } from "../claude/store";
import { useConfigStore } from "../config/useConfig";
import { useFocusStore } from "../focus/store";
import { clock as timerClock, LABELS, type TimerMode } from "../focus/timer";
import { startShelfSync } from "../shelf/store";
import { startCursorTracking } from "../lib/cursor";
import { formatClock, formatDate } from "../lib/format";
import { ipc } from "../lib/ipc";
import { lineIndexAt } from "../media/lrc";
import { useMediaStore, useMediaSync, usePositionMs } from "../media/store";
import { Dock } from "./Dock";
import { GlobalSearch } from "./GlobalSearch";
import { PeekGlance, PeekPlayer } from "./Peek";
import { Eyes, type EyesMood } from "./Eyes";
import { createHoverController } from "./hoverController";
import { useEyesPhase, useIslandSpring, useNow, usePower } from "./hooks";
import { BatteryIcon, BellIcon, BoltIcon, ClaudeSpinner, MicIcon, MicOffIcon, Equalizer, ExpandIcon, ShrinkIcon, VolumeIcon } from "./icons";
import { bodyHeight, CHIP_WIDTH, type ClaudeActivity, claudeBadge, EXPANDED_LARGE, type Mode, resolveMode, SIZES } from "./modes";
import { PAGES } from "./pages/registry";
import { useHotkeys } from "./useHotkeys";
import { glowOpacity, glowReach, islandAccent } from "./theme";
import { useIslandDrag } from "./useIslandDrag";
import { Welcome } from "./Welcome";
import { visiblePages } from "./pageOrder";
import { useIslandStore } from "./store";
import celebrateSvg from "../assets/clawd/clawd-celebrating.svg";
import codingSvg from "../assets/clawd/clawd-coding.svg";
import coffeeSvg from "../assets/clawd/clawd-coffee.svg";
import gamingSvg from "../assets/clawd/clawd-gaming.svg";
import yogaSvg from "../assets/clawd/clawd-yoga.svg";
import { formatElapsed, formatMinutes, startActivitySync, useActivityStore } from "./activity";
import { ClawdMini } from "./ClawdMini";
import { DiscordButtons, DiscordCall } from "./DiscordCall";
import { inDiscordCall } from "./activity";
import type { DiscordState } from "../lib/ipc";
import "./island.css";
import "./quick/quick.css";
import { t } from "../i18n";

const CHARGE_NOTICE_MS = 3400;
/** Páginas com campo próprio no cabeçalho (a busca dos Atalhos, a nota rápida); as outras ganham a busca geral. */
const FIELD_PAGES = new Set(["launch", "note"]);
const setHeaderSlot = (el: HTMLDivElement | null) => useIslandStore.getState().setHeaderSlot(el);
const choosePage = (id: string) => useIslandStore.getState().setPage(id);

/** O conteúdo da ilha aberta. Fica montado o tempo todo, então só redesenha quando muda algo dele (não a cada hover). */
const ExpandedContent = memo(function ExpandedContent({ pageId, large, active }: { pageId: string; large: boolean; active: boolean }) {
  const page = PAGES.find((p) => p.id === pageId)!;
  const Body = large && page.Large ? page.Large : page.Component;
  return (
    <>
      <div className="body">
        <Body active={active} />
      </div>
      {!FIELD_PAGES.has(page.id) && <GlobalSearch key={page.id} active={active} />}
      <Dock page={page.id} onPage={choosePage} />
    </>
  );
});

const fmtSeconds = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

/** Segundos desde `since` (performance.now), atualizado a cada segundo; 0 sem início. */
function useSeconds(since: number | undefined): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (since === undefined) return;
    setNow(performance.now());
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === undefined ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

/** Linha da letra na pílula: a antiga sai para cima enquanto a nova entra por baixo. */
function PillLyric({ text }: { text: string }) {
  const [shown, setShown] = useState({ id: 0, text, leaving: null as string | null });
  useEffect(() => {
    setShown((prev) => (prev.text === text ? prev : { id: prev.id + 1, text, leaving: prev.text }));
  }, [text]);
  useEffect(() => {
    if (shown.leaving === null) return;
    const timer = setTimeout(() => setShown((prev) => ({ ...prev, leaving: null })), 340);
    return () => clearTimeout(timer);
  }, [shown.id, shown.leaving]);

  return (
    <div className="pl">
      {shown.leaving !== null && (
        <span key={`out-${shown.id}`} className="out">
          {shown.leaving}
        </span>
      )}
      <span key={shown.id}>{shown.text}</span>
    </div>
  );
}

/** Sem letra, a pílula mostra a música: o nome forte e o artista mais apagado. Troca com a mesma animação da letra. */
function PillSong({ title, artist }: { title: string; artist: string }) {
  return (
    <div className="pl song">
      <span key={`${title}|${artist}`}>
        <b>{title}</b>
        {artist && <em> · {artist}</em>}
      </span>
    </div>
  );
}

/** O Foco rodando na pílula: um anel que esvazia e o tempo restante, na cor do modo (foco, pausa ou livre). */
function TimerChip({ mode, left, total }: { mode: TimerMode; left: number; total: number }) {
  const r = 6;
  const length = 2 * Math.PI * r;
  const rest = total > 0 ? Math.min(1, Math.max(0, left / total)) : 0;
  return (
    <span className={`tchip ${mode}`} title={t("{mode}: faltam {left}", { mode: t(LABELS[mode]), left: timerClock(left) })}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle className="bg" cx="8" cy="8" r={r} />
        <circle className="fg" cx="8" cy="8" r={r} strokeDasharray={length} strokeDashoffset={length * (1 - rest)} />
      </svg>
      <b>{timerClock(left)}</b>
    </span>
  );
}

/**
 * A call on the pill: how long it has been, and the buttons. In a Discord call Docky controls, Discord's own mute and
 * deafen; otherwise the mic button mutes the whole microphone, like the Windows mute.
 */
function CallChip({ app, since, muted, discord }: { app: string; since: number | null; muted: boolean; discord: DiscordState | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const time = since !== null ? <b>{formatElapsed((now - since) / 1000)}</b> : null;
  if (inDiscordCall(discord)) {
    return (
      <span className={`cchip dcchip${discord.muted || discord.deafened ? " muted" : ""}`} title={t("No Discord: {channel}", { channel: discord.channel ?? "" })}>
        <DiscordButtons discord={discord} size="sm" />
        {time}
      </span>
    );
  }
  return (
    <span className={`cchip${muted ? " muted" : ""}`} title={t("Em chamada no {app}", { app })}>
      <button
        className="cchip-mic"
        aria-label={t(muted ? "Ativar o microfone" : "Mutar o microfone")}
        aria-pressed={muted}
        onClick={() => useActivityStore.getState().toggleMic()}
      >
        {muted ? <MicOffIcon /> : <MicIcon />}
      </button>
      {time}
    </span>
  );
}

export function Island() {
  const config = useConfigStore((s) => s.config);
  const expanded = useIslandStore((s) => s.expanded);
  const overlay = useIslandStore((s) => s.overlay);
  const page = useIslandStore((s) => s.page);
  const large = useIslandStore((s) => s.large);
  const peek = useIslandStore((s) => s.peek);
  const media = useMediaStore((s) => s.media);
  const lyrics = useMediaStore((s) => s.lyrics);
  const musicAccent = useMediaStore((s) => s.accent);
  const accent = islandAccent(config.islandColor, musicAccent);
  const volume = useMediaStore((s) => s.volume);
  const now = useNow();
  const eyesPhase = useEyesPhase(config.eyes, config.reduceMotion);
  const power = usePower(() => useIslandStore.getState().showOverlay("charge", CHARGE_NOTICE_MS));
  useMediaSync();
  useEffect(() => startClaudeSync(), []);
  useEffect(() => startShelfSync(), []);
  useEffect(() => startActivitySync(), []);
  const call = useActivityStore((s) => s.call);
  const micMuted = useActivityStore((s) => s.micMuted);
  const finishedDownload = useActivityStore((s) => s.finished);
  const game = useActivityStore((s) => s.game);
  const headset = useActivityStore((s) => s.headset);
  const reminder = useActivityStore((s) => s.reminder);
  const discord = useActivityStore((s) => s.discord);
  const discordCall = inDiscordCall(discord) ? discord : null;
  const focusMode = useFocusStore((s) => s.mode);
  useHotkeys();
  const timerRunning = useFocusStore((s) => s.running);
  const timerLeft = useFocusStore((s) => s.left);
  const timerFinished = useFocusStore((s) => s.finished);
  const timerMode = useFocusStore((s) => s.mode);
  const timerTotal = useFocusStore((s) => s.total);

  const sessions = useClaudeStore((s) => s.sessions);
  const permissions = useClaudeStore((s) => s.permissions);
  const denials = useClaudeStore((s) => s.denials);
  const finishedSession = useClaudeStore((s) => s.finished);
  const running = useMemo(() => runningSessions(sessions), [sessions]);
  const asking = permissions[0] ?? null;
  const claude: ClaudeActivity = asking ? "ask" : running.length > 0 && config.claudeWorkStrip ? "work" : null;

  const lines = lyrics?.synced ?? null;
  const lyricActive = config.lyricPill && !!media?.playing && !!lines;
  // Sem letra para mostrar, a pílula mostra o nome da música enquanto ela toca.
  const songActive = !lyricActive && !!media?.playing && !!media?.title;
  const mode: Mode = resolveMode({ expanded, overlay, lyricActive: lyricActive || songActive, claude, peek });
  // O player aparece com música tocando, ou pausada há pouco (para dar play de novo sem abrir a ilha).
  const [lastPlayed, setLastPlayed] = useState(0);
  useEffect(() => {
    if (media?.playing) setLastPlayed(Date.now());
  }, [media?.playing, media?.title]);
  const peekMusic = !!media && (media.playing || Date.now() - lastPlayed < 5 * 60_000);
  const shownPages = visiblePages(PAGES, config.pageOrder, config.hiddenPages);
  const ActivePage = shownPages.find((p) => p.id === page) ?? shownPages[0];
  // Páginas com tela maior (Large) ou só com ajustes (Settings) ganham o botão de expandir.
  const canExpand = !!ActivePage.Large;
  const largeOn = large && canExpand;
  const showCall = config.callPill && (!!call || !!discordCall);
  const idleSize = {
    w: SIZES.idle.w + (timerRunning ? CHIP_WIDTH.timer : 0) + (showCall ? (discordCall ? CHIP_WIDTH.discord : CHIP_WIDTH.call) : 0),
    h: SIZES.idle.h,
  };
  const size = mode === "expanded" && largeOn ? EXPANDED_LARGE : mode === "idle" ? idleSize : SIZES[mode];

  const notchRef = useRef<HTMLDivElement>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  useIslandSpring(notchRef, islandRef, size, config.reduceMotion, EXPANDED_LARGE.h);

  // Linha atual da letra para a pílula (a posição só é atualizada enquanto ela está visível).
  const position = usePositionMs(mode === "lyric" && lyricActive);
  const lineIndex = lines ? lineIndexAt(lines, position, config.lyricDelayMs) : -1;
  const lineText = lineIndex >= 0 ? lines![lineIndex].text || "♪  ♪  ♪" : "♪  ♪  ♪";

  // Cursor global (olhos) e hover vindos do Rust.
  useEffect(() => startCursorTracking(), []);

  const hoverOpen = useRef(config.hoverOpen);
  hoverOpen.current = config.hoverOpen;
  useEffect(() => {
    const controller = createHoverController({
      canExpand: () =>
        hoverOpen.current &&
        !useIslandStore.getState().expanded &&
        !useIslandStore.getState().moving &&
        useClaudeStore.getState().permissions.length === 0,
      canCollapse: () => {
        const { expanded, pinned, moving } = useIslandStore.getState();
        return expanded && !pinned && !moving;
      },
      expand: () => useIslandStore.getState().expand(),
      collapse: () => useIslandStore.getState().collapse(),
    });
    // Com "abrir ao passar o mouse" desligado, o mouse sobre a pílula só espia: o player ou o resumo.
    const peeker = createHoverController({
      expandDelay: 220,
      collapseDelay: 260,
      canExpand: () =>
        !hoverOpen.current &&
        !useIslandStore.getState().expanded &&
        !useIslandStore.getState().moving &&
        useClaudeStore.getState().permissions.length === 0,
      canCollapse: () => useIslandStore.getState().peek && !useIslandStore.getState().moving,
      expand: () => useIslandStore.getState().setPeek(true),
      collapse: () => useIslandStore.getState().setPeek(false),
    });
    const off = ipc.onHover((inside) => {
      controller.setHover(inside);
      peeker.setHover(inside);
    });
    return () => {
      off();
      controller.dispose();
      peeker.dispose();
    };
  }, []);

  // Clicar em qualquer coisa fora do Docky recolhe a ilha (mesmo fixada), menos enquanto ela espera uma resposta.
  useEffect(
    () =>
      ipc.onOutsideClick(() => {
        if (useClaudeStore.getState().permissions.length === 0 && useIslandStore.getState().expanded) {
          useIslandStore.getState().collapse();
        }
      }),
    [],
  );

  // First run: the island on the main screen opens itself once, on the welcome card.
  const loaded = useConfigStore((s) => s.loaded);
  useEffect(() => {
    if (!loaded || config.onboarded || document.body.dataset.window !== "island") return;
    const timer = setTimeout(() => useIslandStore.setState({ expanded: true, pinned: true, peek: false }), 1200);
    return () => clearTimeout(timer);
  }, [loaded, config.onboarded]);

  // Esc recolhe e solta a ilha fixada.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && useIslandStore.getState().collapse();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Where the island sits along the top edge (0 flush left, 0.5 centered, 1 flush right); the window spans the screen.
  const spot = Number.isFinite(config.islandPosition) ? Math.min(1, Math.max(0, config.islandPosition)) : 0.5;
  /** The island's target box in the window at `pos`: the Rust side only takes clicks over it. */
  const rectAt = (pos: number) => ({ x: pos * (window.innerWidth - size.w), y: 0, w: size.w, h: size.h });
  const rectFor = useRef(rectAt);
  rectFor.current = rectAt;

  // Diz ao Rust onde a ilha vai ficar (alvo), para ele aceitar cliques só em cima dela.
  useEffect(() => {
    const report = () => ipc.setIslandRect(rectFor.current(spot));
    report();
    window.addEventListener("resize", report);
    return () => window.removeEventListener("resize", report);
  }, [size.w, size.h, spot]);

  const drag = useIslandDrag(notchRef, spot, {
    // Open, only the header moves it (the pages have sliders and tiles to drag); closed, the whole pill does.
    canStart: (target) => !useIslandStore.getState().expanded || !!target.closest(".hdr"),
    onStart: () => {
      useIslandStore.setState({ moving: true });
      // While dragging, the whole strip takes the mouse, so a fast move never slips out of the window.
      ipc.setIslandRect({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
    },
    onEnd: (next) => {
      useIslandStore.setState({ moving: false });
      ipc.setIslandRect(rectFor.current(next));
      if (next !== spot) useConfigStore.getState().update({ islandPosition: next });
    },
    onHome: () => {
      if (spot === 0.5) return;
      // Open, it stays open while it glides away from under the mouse, so you see where it lands.
      if (useIslandStore.getState().expanded) useIslandStore.setState({ pinned: true });
      useConfigStore.getState().update({ islandPosition: 0.5 });
    },
    reduceMotion: config.reduceMotion,
  });

  const clock = useMemo(() => formatClock(now, config.clock12h), [now, config.clock12h]);
  const date = useMemo(() => formatDate(now, false), [now]);

  const onIslandClick = (e: React.MouseEvent) => {
    // The second click of a double click (back to the center) must not undo what the first one did.
    if (drag.justDragged() || e.detail > 1) return;
    if ((e.target as HTMLElement).closest("button, input, .track, [role=button]")) return;
    useIslandStore.getState().togglePin();
  };

  const showBattery = power?.hasBattery ?? false;
  const charging = !!power && power.hasBattery && (power.charging || power.plugged);
  const playing = !!media?.playing;
  const timerChip = timerRunning ? <TimerChip mode={timerMode} left={timerLeft} total={timerTotal} /> : null;
  const callChip = showCall ? <CallChip app={call?.app ?? "Discord"} since={call?.since ?? null} muted={micMuted} discord={discordCall} /> : null;
  const chips = timerChip || callChip;
  // End of a Foco: Clawd takes a coffee (or does yoga before a long break); end of a break: back to coding.
  const alarmClawd = timerFinished === "focus" ? (focusMode === "long" ? yogaSvg : coffeeSvg) : timerFinished === "short" || timerFinished === "long" ? codingSvg : null;
  const volumeLevel = volume?.muted ? 0 : (volume?.level ?? 0);
  const eyesMood: EyesMood = mode === "ask" ? "ask" : mode === "work" ? "work" : mode === "charge" || mode === "done" || mode === "timer" || mode === "reminder" ? "wide" : "normal";
  const workSeconds = useSeconds(mode === "work" ? running[0]?.since : undefined);
  const work = currentWork(running);
  // With the eyes turned off, Clawd takes their place while Claude Code works (or waits for you). It is an animation,
  // so "reduce motion" keeps the spot empty.
  const clawdInEyes = eyesPhase === "gone" && !config.reduceMotion ? (asking ? WAIT_CLAWD : running.length > 0 ? WORK_CLAWD[work].src : null) : null;

  const islandStyle = {
    "--glow-opacity": glowOpacity(config.glow),
    "--glow-reach": glowReach(config.glow),
    "--glow": accent.primary,
    "--glow2": accent.secondary,
    "--accent": accent.primary,
  } as React.CSSProperties;

  return (
    <div ref={notchRef} className={`notch${eyesPhase === "gone" && !clawdInEyes ? " no-eyes" : ""}${config.glassEdge ? "" : " no-glass"}`} data-mode={mode}>
      <div className="ear l" />
      <div className="ear r" />
      <div ref={islandRef} className="island" style={islandStyle} onClick={onIslandClick} onPointerDown={drag.onPointerDown} onDoubleClick={drag.onDoubleClick}>
        <div className={`glow${mode === "expanded" ? " on" : ""}`} />
        {eyesPhase !== "gone" && <Eyes mood={eyesMood} follow={config.followCursor} shake={denials} phase={eyesPhase} />}
        {clawdInEyes && (
          <span className="eyes-clawd" title={asking ? t("O Claude espera você") : `Claude ${t(WORK_CLAWD[work].doing)}`}>
            <ClawdMini key={clawdInEyes} src={clawdInEyes} show />
          </span>
        )}

        <div className={`layer${mode === "idle" ? " on" : ""}`} style={{ width: idleSize.w }}>
          <div className="strip">
            <div className="c clock">
              <span className="time">{clock}</span>
            </div>
            <div className="r">
              {chips ? (
                <>
                  {callChip}
                  {timerChip}
                </>
              ) : (
                playing && <Equalizer playing={mode === "idle"} />
              )}
            </div>
          </div>
        </div>

        <div className={`layer${mode === "lyric" ? " on" : ""}${claudeBadge(mode, claude) ? " claude" : ""}`} style={{ width: SIZES.lyric.w }}>
          <div className="strip">
            {mode === "lyric" && (lyricActive ? <PillLyric text={lineText} /> : <PillSong title={media?.title ?? ""} artist={media?.artist ?? ""} />)}
            <div className="r">
              {claudeBadge(mode, claude) && (
                <span className="cw-badge" title={t("Claude trabalhando em {project}", { project: running[0]?.project ?? t("um projeto") })}>
                  <ClaudeSpinner />
                </span>
              )}
              {timerChip ?? callChip ?? <Equalizer playing={playing && mode === "lyric"} />}
            </div>
          </div>
        </div>

        <div className={`layer${mode === "charge" ? " on" : ""}`} style={{ width: SIZES.charge.w }}>
          <div className="strip">
            <div className="c pad">
              <span className="txt">{t("Carregando")}</span>
              {showBattery && <span className="txt sub">{power?.percent}%</span>}
            </div>
            <div className="r">
              <span className="bolt">
                <BoltIcon />
              </span>
            </div>
          </div>
        </div>

        <div className={`layer${mode === "volume" ? " on" : ""}`} style={{ width: SIZES.volume.w }}>
          <div className="strip">
            <div className="c vol-row">
              <span className="vol-ic">
                <VolumeIcon level={volumeLevel} muted={volume?.muted ?? false} />
              </span>
              <div className="vol-bar">
                <i style={{ width: `${volumeLevel * 100}%` }} />
              </div>
              <span className="txt sub vol-pct">{Math.round(volumeLevel * 100)}</span>
            </div>
          </div>
        </div>

        <div className={`layer${mode === "work" ? " on" : ""}`} style={{ width: SIZES.work.w }}>
          <div className="strip">
            <div className="c pad">
              <span className="txt">{running[0]?.project}</span>
              <span className="txt sub">
                {t(WORK_CLAWD[work].doing)} · {fmtSeconds(workSeconds)}
                {running.length > 1 ? ` · +${running.length - 1}` : ""}
              </span>
            </div>
            <div className="r">
              <span className="spin" />
            </div>
          </div>
        </div>

        <div className={`layer alarm${mode === "timer" ? " on" : ""}`} style={{ width: SIZES.timer.w }}>
          <div className="strip">
            <div className="c pad">
              <span className="txt">{t(timerFinished === "focus" ? "Foco concluído" : timerFinished === "custom" ? "Contador acabou" : "Pausa acabou")}</span>
              <span className="txt sub">{t(timerFinished === "custom" ? "Tempo esgotado" : timerFinished === "focus" ? "Hora da pausa" : "Hora de focar")}</span>
            </div>
            <div className="r">
              {alarmClawd ? (
                <ClawdMini src={alarmClawd} show={mode === "timer"} />
              ) : (
                <span className="alarm-ic">
                  <BellIcon />
                </span>
              )}
            </div>
          </div>
        </div>

        <div className={`layer${mode === "done" ? " on" : ""}`} style={{ width: SIZES.done.w }}>
          <div className="strip">
            <div className="c pad roomy">
              {finishedSession ? (
                <>
                  <span className="txt done-p" title={finishedSession.project}>
                    {finishedSession.project}
                  </span>
                  <span className="txt sub">{t("terminou")}{finishedSession.last ? ` · ${describeTurn(finishedSession.last)}` : ""}</span>
                </>
              ) : (
                <span className="txt">{t("Claude terminou")}</span>
              )}
            </div>
            <div className="r">
              {/* Clawd celebrating (clawd-pet, MIT), cropped to the pill; only mounted while the notice shows. */}
              <ClawdMini src={celebrateSvg} show={mode === "done"} />
            </div>
          </div>
        </div>

        <div className={`layer${mode === "game" ? " on" : ""}`} style={{ width: SIZES.game.w }}>
          <div className="strip">
            <div className="c pad">
              <span className="txt">{game?.app}</span>
              <span className="txt sub">{game ? (game.video ? t("{time} em tela cheia", { time: formatMinutes(game.minutes) }) : t("jogou {time}", { time: formatMinutes(game.minutes) })) : ""}</span>
            </div>
            <div className="r">{!game?.video && <ClawdMini src={gamingSvg} show={mode === "game"} />}</div>
          </div>
        </div>

        <div className={`layer${mode === "reminder" ? " on" : ""}`} style={{ width: SIZES.reminder.w }}>
          <div className="strip">
            <div className="c pad roomy">
              <span className="txt" title={reminder?.text}>
                {reminder?.text}
              </span>
              <span className="txt sub">{t("lembrete")}</span>
            </div>
            <div className="r">
              <ClawdMini src={WAIT_CLAWD} show={mode === "reminder"} />
            </div>
          </div>
        </div>

        <div className={`layer${mode === "bluetooth" ? " on" : ""}`} style={{ width: SIZES.bluetooth.w }}>
          <div className="strip">
            <div className="c pad roomy">
              <span className="txt" title={headset?.name}>
                {headset?.name}
              </span>
              <span className={`txt sub${headset?.low ? " bt-low" : ""}`}>{headset ? (headset.low ? t("bateria baixa · {n}%", { n: headset.percent }) : `${headset.percent}%`) : ""}</span>
            </div>
            <div className="r">
              {/* The headphones' charge as a small battery: red at 20% or less. */}
              <span className={`bt-bat${(headset?.percent ?? 100) <= 20 ? " low" : ""}`} style={{ "--v": `${headset?.percent ?? 0}%` } as React.CSSProperties} aria-hidden="true">
                <i />
              </span>
            </div>
          </div>
        </div>

        <div className={`layer${mode === "download" ? " on" : ""}`} style={{ width: SIZES.download.w }}>
          <div className="strip">
            <div className="c pad dl-done">
              <span className="txt">{t("Download concluído")}</span>
              <span className="txt sub" title={finishedDownload?.name}>
                {finishedDownload?.name}
              </span>
            </div>
            <div className="r">
              <button className="pill-btn" onClick={() => finishedDownload && ipc.revealDownload(finishedDownload.path)}>
                {t("Mostrar")}
              </button>
            </div>
          </div>
        </div>

        <div className={`layer${mode === "peek" ? " on" : ""}`} style={{ width: SIZES.peek.w }}>
          {discordCall ? (
            <div className="pk pk-call">
              <DiscordCall discord={discordCall} since={call?.since ?? null} />
            </div>
          ) : peekMusic ? (
            <PeekPlayer active={mode === "peek"} />
          ) : (
            <PeekGlance active={mode === "peek"} clock={clock} date={date} />
          )}
        </div>

        <div className={`layer ask${mode === "ask" ? " on" : ""}`} style={{ width: SIZES.ask.w }}>
          {asking && (
            <>
              <div className="ask-top">
                <span className="dot wait" />
                {t("Claude Code pede permissão")}
                {permissions.length > 1 ? ` · +${permissions.length - 1}` : ""}
              </div>
              <div className="ask-meta">
                <span className="chip">{asking.toolName}</span>
                <span>{t("projeto {project}", { project: asking.project })}</span>
              </div>
              <div className="ask-cmd mono" title={asking.summary}>
                {asking.summary}
              </div>
              <div className="ask-btns">
                <button className="btn-deny" onClick={() => useClaudeStore.getState().decide(asking.id, false)}>
                  {t("Negar")}
                </button>
                <button id="docky-allow" className="btn-allow" onClick={() => useClaudeStore.getState().decide(asking.id, true)}>
                  {t("Permitir")}
                </button>
              </div>
            </>
          )}
        </div>

        <div
          className={`layer${mode === "expanded" ? " on" : ""}`}
          style={{ width: largeOn ? EXPANDED_LARGE.w : SIZES.expanded.w, "--body-h": `${bodyHeight(largeOn)}px` } as React.CSSProperties}
        >
          <div className="hdr">
            <div className="hdr-slot" ref={setHeaderSlot} />
            {config.headerClock && (
              <div className="hdr-clock">
                {charging ? (
                  <span className="bolt">
                    <BoltIcon />
                  </span>
                ) : (
                  // O campo do cabeçalho precisa do espaço: a bateria só aparece quando está acabando (ou nos ajustes).
                  showBattery && (power?.percent ?? 100) <= 20 && (
                    <span className={`bat${(power?.percent ?? 100) <= 20 ? " low" : ""}`}>
                      <BatteryIcon />
                      {power?.percent}%
                    </span>
                  )
                )}
                <span className="date">{date}</span>
                <span className="time">{clock}</span>
              </div>
            )}
            <div className="hdr-act">
              {canExpand && (
                <button
                  className="xbtn"
                  aria-label={t(largeOn ? "Voltar ao tamanho normal" : "Expandir esta página")}
                  title={t(largeOn ? "Voltar ao tamanho normal" : "Expandir")}
                  onClick={() => useIslandStore.getState().toggleLarge()}
                >
                  {largeOn ? <ShrinkIcon /> : <ExpandIcon />}
                </button>
              )}
              {playing && <Equalizer playing={mode === "expanded"} />}
            </div>
          </div>

          <ExpandedContent pageId={ActivePage.id} large={largeOn} active={mode === "expanded"} />
          {loaded && !config.onboarded && <Welcome />}
        </div>
      </div>
    </div>
  );
}
