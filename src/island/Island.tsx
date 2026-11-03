import { useEffect, useMemo, useRef, useState } from "react";
import { runningSessions } from "../claude/sessions";
import { startClaudeSync, useClaudeStore } from "../claude/store";
import { useConfigStore } from "../config/useConfig";
import { useFocusStore } from "../focus/store";
import { clock as timerClock, LABELS } from "../focus/timer";
import { startShelfSync } from "../shelf/store";
import { startCursorTracking } from "../lib/cursor";
import { formatClock, formatDate } from "../lib/format";
import { ipc } from "../lib/ipc";
import { DEFAULT_ACCENT } from "../media/accent";
import { lineIndexAt } from "../media/lrc";
import { useMediaStore, useMediaSync, usePositionMs } from "../media/store";
import { Dock } from "./Dock";
import { Eyes, type EyesMood } from "./Eyes";
import { createHoverController } from "./hoverController";
import { useIslandSpring, useNow, usePower } from "./hooks";
import { BatteryIcon, BoltIcon, CheckIcon, Equalizer, ExpandIcon, ShrinkIcon, VolumeIcon } from "./icons";
import { bodyHeight, type ClaudeActivity, EXPANDED_LARGE, type Mode, resolveMode, SIZES } from "./modes";
import { PAGES } from "./pages/registry";
import { useHotkeys } from "./useHotkeys";
import { visiblePages } from "./pageOrder";
import { useIslandStore } from "./store";
import "./island.css";

const CHARGE_NOTICE_MS = 3400;

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

export function Island() {
  const config = useConfigStore((s) => s.config);
  const expanded = useIslandStore((s) => s.expanded);
  const overlay = useIslandStore((s) => s.overlay);
  const page = useIslandStore((s) => s.page);
  const large = useIslandStore((s) => s.large);
  const media = useMediaStore((s) => s.media);
  const lyrics = useMediaStore((s) => s.lyrics);
  const accent = useMediaStore((s) => s.accent) ?? DEFAULT_ACCENT;
  const volume = useMediaStore((s) => s.volume);
  const now = useNow();
  const power = usePower(() => useIslandStore.getState().showOverlay("charge", CHARGE_NOTICE_MS));
  useMediaSync();
  useEffect(() => startClaudeSync(), []);
  useEffect(() => startShelfSync(), []);
  useHotkeys();
  const timerRunning = useFocusStore((s) => s.running);
  const timerLeft = useFocusStore((s) => s.left);
  const timerFinished = useFocusStore((s) => s.finished);

  const sessions = useClaudeStore((s) => s.sessions);
  const permissions = useClaudeStore((s) => s.permissions);
  const denials = useClaudeStore((s) => s.denials);
  const running = useMemo(() => runningSessions(sessions), [sessions]);
  const asking = permissions[0] ?? null;
  const claude: ClaudeActivity = asking ? "ask" : running.length > 0 && config.claudeWorkStrip ? "work" : null;

  const lines = lyrics?.synced ?? null;
  const lyricActive = config.lyricPill && !!media?.playing && !!lines;
  const mode: Mode = resolveMode({ expanded, overlay, lyricActive, claude });
  const shownPages = visiblePages(PAGES, config.pageOrder, config.hiddenPages);
  const ActivePage = shownPages.find((p) => p.id === page) ?? shownPages[0];
  const largeOn = large && !!ActivePage.Large;
  const size = mode === "expanded" && largeOn ? EXPANDED_LARGE : SIZES[mode];

  const notchRef = useRef<HTMLDivElement>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  useIslandSpring(notchRef, islandRef, size, config.reduceMotion, EXPANDED_LARGE.h);

  // Linha atual da letra para a pílula (a posição só é atualizada enquanto ela está visível).
  const position = usePositionMs(mode === "lyric");
  const lineIndex = lines ? lineIndexAt(lines, position, config.lyricDelayMs) : -1;
  const lineText = lineIndex >= 0 ? lines![lineIndex].text || "♪  ♪  ♪" : "♪  ♪  ♪";

  // Cursor global (olhos) e hover vindos do Rust.
  useEffect(() => startCursorTracking(), []);

  const hoverOpen = useRef(config.hoverOpen);
  hoverOpen.current = config.hoverOpen;
  useEffect(() => {
    const controller = createHoverController({
      canExpand: () =>
        hoverOpen.current && !useIslandStore.getState().expanded && useClaudeStore.getState().permissions.length === 0,
      canCollapse: () => {
        const { expanded, pinned } = useIslandStore.getState();
        return expanded && !pinned;
      },
      expand: () => useIslandStore.getState().expand(),
      collapse: () => useIslandStore.getState().collapse(),
    });
    const off = ipc.onHover((inside) => controller.setHover(inside));
    return () => {
      off();
      controller.dispose();
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

  // Esc recolhe e solta a ilha fixada.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && useIslandStore.getState().collapse();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Diz ao Rust onde a ilha vai ficar (alvo), para ele aceitar cliques só em cima dela.
  useEffect(() => {
    const report = () => ipc.setIslandRect({ x: (window.innerWidth - size.w) / 2, y: 0, w: size.w, h: size.h });
    report();
    window.addEventListener("resize", report);
    return () => window.removeEventListener("resize", report);
  }, [size.w, size.h]);

  const clock = useMemo(() => formatClock(now), [now]);
  const date = useMemo(() => formatDate(now), [now]);

  const onIslandClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, .track, [role=button]")) return;
    useIslandStore.getState().togglePin();
  };

  const showBattery = power?.hasBattery ?? false;
  const charging = !!power && power.hasBattery && (power.charging || power.plugged);
  const playing = !!media?.playing;
  const volumeLevel = volume?.muted ? 0 : (volume?.level ?? 0);
  const eyesMood: EyesMood = mode === "ask" ? "ask" : mode === "work" ? "work" : mode === "charge" || mode === "done" || mode === "timer" ? "wide" : "normal";
  const workSeconds = useSeconds(mode === "work" ? running[0]?.since : undefined);

  const islandStyle = {
    "--glow-strength": config.glow / 100,
    "--glow": accent.primary,
    "--glow2": accent.secondary,
    "--accent": accent.primary,
  } as React.CSSProperties;

  return (
    <div ref={notchRef} className="notch" data-mode={mode}>
      <div className="ear l" />
      <div className="ear r" />
      <div ref={islandRef} className="island" style={islandStyle} onClick={onIslandClick}>
        <div className={`glow${mode === "expanded" ? " on" : ""}`} />
        <div className="grain" />
        {config.eyes && <Eyes mood={eyesMood} follow={config.followCursor} shake={denials} />}

        <div className={`layer${mode === "idle" ? " on" : ""}`} style={{ width: SIZES.idle.w }}>
          <div className="strip">
            <div className="c clock">
              <span className="time">{clock}</span>
              {timerRunning && <span className="txt sub">· {timerClock(timerLeft)}</span>}
            </div>
            <div className="r">{playing && <Equalizer playing />}</div>
          </div>
        </div>

        <div className={`layer${mode === "lyric" ? " on" : ""}`} style={{ width: SIZES.lyric.w }}>
          <div className="strip">
            {mode === "lyric" && <PillLyric text={lineText} />}
            <div className="r">
              <Equalizer playing={playing} />
            </div>
          </div>
        </div>

        <div className={`layer${mode === "charge" ? " on" : ""}`} style={{ width: SIZES.charge.w }}>
          <div className="strip">
            <div className="c pad">
              <span className="txt">Carregando</span>
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
                escrevendo código · {fmtSeconds(workSeconds)}
                {running.length > 1 ? ` · +${running.length - 1}` : ""}
              </span>
            </div>
            <div className="r">
              <span className="spin" />
            </div>
          </div>
        </div>

        <div className={`layer${mode === "timer" ? " on" : ""}`} style={{ width: SIZES.timer.w }}>
          <div className="strip">
            <div className="c pad">
              <span className="txt">{timerFinished === "focus" ? "Foco concluído" : timerFinished === "custom" ? "Contador acabou" : "Pausa acabou"}</span>
              <span className="txt sub">{timerFinished === "custom" ? "Tempo esgotado" : timerFinished ? LABELS[timerFinished] : ""}</span>
            </div>
            <div className="r">
              <span className="okc">
                <CheckIcon />
              </span>
            </div>
          </div>
        </div>

        <div className={`layer${mode === "done" ? " on" : ""}`} style={{ width: SIZES.done.w }}>
          <div className="strip">
            <div className="c pad">
              <span className="txt">Claude terminou</span>
            </div>
            <div className="r">
              <span className="okc">
                <CheckIcon />
              </span>
            </div>
          </div>
        </div>

        <div className={`layer ask${mode === "ask" ? " on" : ""}`} style={{ width: SIZES.ask.w }}>
          {asking && (
            <>
              <div className="ask-top">
                <span className="dot wait" />
                Claude Code pede permissão
                {permissions.length > 1 ? ` · +${permissions.length - 1}` : ""}
              </div>
              <div className="ask-meta">
                <span className="chip">{asking.toolName}</span>
                <span>projeto {asking.project}</span>
              </div>
              <div className="ask-cmd mono" title={asking.summary}>
                {asking.summary}
              </div>
              <div className="ask-btns">
                <button className="btn-deny" onClick={() => useClaudeStore.getState().decide(asking.id, false)}>
                  Negar
                </button>
                <button id="docky-allow" className="btn-allow" onClick={() => useClaudeStore.getState().decide(asking.id, true)}>
                  Permitir
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
            {charging ? (
              <span className="bolt">
                <BoltIcon />
              </span>
            ) : (
              showBattery && (
                <span className="bat">
                  <BatteryIcon />
                  {power?.percent}%
                </span>
              )
            )}
            <span className="date">{date}</span>
            <span className="time">{clock}</span>
            {ActivePage.Large && (
              <button
                className="xbtn"
                aria-label={largeOn ? "Voltar ao tamanho normal" : "Expandir esta página"}
                title={largeOn ? "Voltar ao tamanho normal" : "Expandir"}
                onClick={() => useIslandStore.getState().toggleLarge()}
              >
                {largeOn ? <ShrinkIcon /> : <ExpandIcon />}
              </button>
            )}
            <div className="hdr-eq">
              <Equalizer playing={playing} />
            </div>
          </div>

          <div className="body">
            {largeOn && ActivePage.Large ? <ActivePage.Large active={mode === "expanded"} /> : <ActivePage.Component active={mode === "expanded"} />}
          </div>

          <Dock page={ActivePage.id} onPage={(id) => useIslandStore.getState().setPage(id)} />
        </div>
      </div>
    </div>
  );
}
