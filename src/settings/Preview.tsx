import { useEffect, useState } from "react";
import { useConfigStore } from "../config/useConfig";
import { Eyes } from "../island/Eyes";
import { visiblePages } from "../island/pageOrder";
import { PAGES } from "../island/pages/registry";
import { filterShortcuts } from "../launcher/filter";
import { useShortcutImages } from "../launcher/icons";
import { layoutSections } from "../launcher/sections";
import { SHORTCUT_COLORS, ShortcutIcon } from "../launcher/ShortcutIcon";
import { formatClock } from "../lib/format";
import { glowOpacity, islandAccent } from "../island/theme";
import type { AreaId } from "./areas";
import "./preview.css";
import { t } from "../i18n";

const pad = (n: number) => String(n).padStart(2, "0");

function useClock() {
  const twelveHour = useConfigStore((s) => s.config.clock12h);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return formatClock(now, twelveHour);
}

const Eq = () => (
  <span className="pv-eq">
    <i />
    <i />
    <i />
    <i />
  </span>
);

/** A ilha recolhida: olhinhos (quando ligados) à esquerda, o conteúdo no meio, algo à direita. */
function Pill({ width, children, right }: { width: number; children: React.ReactNode; right?: React.ReactNode }) {
  const eyes = useConfigStore((s) => s.config.eyes);
  const follow = useConfigStore((s) => s.config.followCursor);
  return (
    <div className="pv-island pill" style={{ width }}>
      <span className="pv-ear l" />
      <span className="pv-ear r" />
      {eyes && <Eyes mood="normal" follow={follow} shake={0} />}
      <div className={`pv-pill${eyes ? " with-eyes" : ""}`}>{children}</div>
      {right && <div className="pv-right">{right}</div>}
    </div>
  );
}

/** A ilha aberta, com o conteúdo de uma página. */
function Open({ width, height, children, eyes = false }: { width: number; height: number; children: React.ReactNode; eyes?: boolean }) {
  const showEyes = useConfigStore((s) => s.config.eyes) && eyes;
  const follow = useConfigStore((s) => s.config.followCursor);
  return (
    <div className="pv-island open" style={{ width, height }}>
      <span className="pv-ear l" />
      <span className="pv-ear r" />
      {showEyes && <Eyes mood="normal" follow={follow} shake={0} />}
      {children}
    </div>
  );
}

function ShortcutsPreview() {
  const { shortcuts, shortcutSections } = useConfigStore((s) => s.config);
  const images = useShortcutImages(shortcuts);
  const items = filterShortcuts(shortcuts, "").filter((e) => !e.item.group);
  const blocks = layoutSections(items, shortcutSections);
  const tiles = blocks.flatMap((b) => b.entries).slice(0, 8);
  const rows = Math.max(1, Math.ceil(tiles.length / 4));
  const clock = useClock();
  // A mesma ilha aberta de verdade: a busca no cabeçalho, a hora à direita e os atalhos grandes embaixo.
  return (
    <Open width={430} height={44 + rows * 48} eyes>
      <div className="pv-hdr">
        <span className="pv-search">{items.length > 8 ? `Buscar entre ${items.length} atalhos` : "Buscar atalho"}</span>
        <b>{clock}</b>
      </div>
      <div className="pv-tiles">
        {tiles.map(({ item, index }, i) => (
          <span key={item.id} className={`pv-tile${i === 0 ? " first" : ""}`}>
            <ShortcutIcon shortcut={item} image={images[index]} color={SHORTCUT_COLORS[index % SHORTCUT_COLORS.length]} className="li" />
            <b>{item.name || "Sem nome"}</b>
          </span>
        ))}
        {items.length === 0 && <span className="pv-empty">{t("Os atalhos que você criar aparecem aqui")}</span>}
      </div>
    </Open>
  );
}

function DockPreview() {
  const { pageOrder, hiddenPages } = useConfigStore((s) => s.config);
  const pages = visiblePages(PAGES, pageOrder, hiddenPages);
  return (
    <Open width={340} height={70}>
      <div className="pv-dock">
        {pages.map(({ id, label, Icon }, i) => (
          <span key={id} className={i === 0 ? "on" : ""} title={t(label)}>
            <Icon size={14} />
            {i === 0 && <b>{t(label)}</b>}
          </span>
        ))}
      </div>
    </Open>
  );
}

/** A miniatura da ilha que muda com a área aberta e com o que você mexe nela. */
export function Preview({ area }: { area: AreaId }) {
  const config = useConfigStore((s) => s.config);
  const clock = useClock();
  // The stage is darker and smaller than the desktop, so the preview's glow starts a little lit and tops out at full.
  const glow = Math.min(1, 0.15 + glowOpacity(config.glow) * 0.9);
  // No music in Settings: "from the music" shows the brand pink, like the island with nothing playing.
  const accent = islandAccent(config.islandColor, null);

  let island: React.ReactNode;
  switch (area) {
    case "atalhos":
      island = <ShortcutsPreview />;
      break;
    case "paginas":
      island = <DockPreview />;
      break;
    case "musica":
      island = config.lyricPill ? (
        <Pill width={330} right={<Eq />}>
          <span className="pv-lyric">{t("E o mundo lá fora gira devagar")}</span>
        </Pill>
      ) : (
        <Pill width={250} right={<Eq />}>
          <b>{clock}</b>
        </Pill>
      );
      break;
    case "foco":
      island = (
        <Pill width={250} right={<span className="pv-ring" />}>
          <span className="pv-sub">{t("Foco")}</span>
          <b className="pv-num">{pad(config.focusMinutes)}:00</b>
        </Pill>
      );
      break;
    case "claude":
      island = (
        <Pill width={330} right={<span className="pv-spin" />}>
          <b>docky</b>
          <span className="pv-sub">{t("escrevendo código · 02:35")}</span>
        </Pill>
      );
      break;
    case "shelf":
      island = (
        <Open width={360} height={96}>
          <div className="pv-shelf">
            <span className="pv-drop">{t("Solte arquivos aqui")}</span>
            {(config.shelfFolders.length > 0 ? config.shelfFolders.slice(0, 3).map((f) => f.name || "Pasta") : ["Documentos"]).map((name, i) => (
              <span key={`${name}-${i}`} className="pv-folder">
                {name}
              </span>
            ))}
            {config.shelfTrash && <span className="pv-folder pv-bin">{t("Lixeira")}</span>}
          </div>
        </Open>
      );
      break;
    case "integracoes":
      island = (
        <Open width={360} height={88}>
          <div className="pv-agenda">
            <div>
              <b className="pv-num">24°</b>
              <span className="pv-sub">{config.weatherCity || "Sua cidade"}</span>
            </div>
            <div className="pv-event">
              <i />
              <span>
                <b>{t("Reunião de time")}</b>
                <span className="pv-sub">{t("10:00 · Google Meet")}</span>
              </span>
            </div>
          </div>
        </Open>
      );
      break;
    default:
      island = (
        <Pill width={220}>
          <b>{clock}</b>
        </Pill>
      );
  }

  return (
    <div
      className={`pv${config.reduceMotion ? " still" : ""}${config.glassEdge ? "" : " no-glass"}`}
      style={{ "--pv-glow": glow, "--accent": accent.primary, "--pv-c1": accent.primary, "--pv-c2": accent.secondary } as React.CSSProperties}
      aria-hidden="true"
    >
      <div className="pv-glow" />
      {island}
    </div>
  );
}
