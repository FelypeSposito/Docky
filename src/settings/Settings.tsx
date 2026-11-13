import { type ComponentType, useEffect, useRef, useState } from "react";
import { useConfigStore } from "../config/useConfig";
import { Eyes } from "../island/Eyes";
import { CloudIcon, GearIcon, GridIcon, KeyboardIcon, MusicIcon, PulseIcon, SearchIcon, SparkIcon, SunIcon, TimerIcon, TrayIcon } from "../island/icons";
import { trackDomCursor } from "../lib/cursor";
import { ipc } from "../lib/ipc";
import "../island/island.css";
import { AREAS, type AreaId, type SearchHit, isArea, searchOptions } from "./areas";
import { ClaudeSection } from "./ClaudeSection";
import { HotkeysGroup, NotesFolderRow, PagesSection, ScreensRow, ShelfFolders, ShortcutsEditor, WeatherCityRow } from "./Fields";
import { CalendarSection } from "./CalendarSection";
import { Group, NumberStepper, Row, Segmented, Slider, Stepper, Toggle } from "./controls";
import { Preview } from "./Preview";
import "./settings.css";

const ICONS: Record<AreaId, ComponentType<{ size?: number }>> = {
  atalhos: KeyboardIcon,
  paginas: GridIcon,
  aparencia: SunIcon,
  musica: MusicIcon,
  foco: TimerIcon,
  claude: SparkIcon,
  integracoes: CloudIcon,
  shelf: TrayIcon,
  geral: GearIcon,
  sistema: PulseIcon,
};

/** A área pedida por `?section=` ou pela ilha (os ids continuam os mesmos das versões anteriores). */
const areaFrom = (value: string | null): AreaId | null => (isArea(value) ? value : null);

function AreaContent({ id }: { id: AreaId }) {
  const { config, update } = useConfigStore();

  switch (id) {
    case "geral":
      return (
        <>
          <Group title="Ao ligar">
            <Row label="Iniciar com o Windows" hint="Abre o Docky quando você entra no PC">
              <Toggle label="Iniciar com o Windows" value={config.startWithWindows} onChange={(v) => update({ startWithWindows: v })} />
            </Row>
            <ScreensRow />
          </Group>
          <Group title="Comportamento">
            <Row label="Abrir ao passar o mouse" hint="Senão, só abre com clique ou com Ctrl+Alt+D">
              <Toggle label="Abrir ao passar o mouse" value={config.hoverOpen} onChange={(v) => update({ hoverOpen: v })} />
            </Row>
            <Row label="Esconder em tela cheia" hint="Jogos, vídeos e apresentações">
              <Toggle label="Esconder em tela cheia" value={config.hideInFullscreen} onChange={(v) => update({ hideInFullscreen: v })} />
            </Row>
          </Group>
          <Group title="Avisos curtos">
            <Row label="Aviso do carregador" hint="Quando você liga o carregador">
              <Toggle label="Aviso do carregador" value={config.noticeCharge} onChange={(v) => update({ noticeCharge: v })} />
            </Row>
            <Row label="Aviso de volume" hint="A barra de volume quando ele muda">
              <Toggle label="Aviso de volume" value={config.noticeVolume} onChange={(v) => update({ noticeVolume: v })} />
            </Row>
            <Row label="Aviso do Foco" hint="Quando um foco ou uma pausa termina">
              <Toggle label="Aviso do Foco" value={config.noticeTimer} onChange={(v) => update({ noticeTimer: v })} />
            </Row>
          </Group>
          <HotkeysGroup />
        </>
      );
    case "aparencia":
      return (
        <>
          <Group>
            <Row label="Brilho ambiente" hint="A luz colorida no fundo da ilha, tirada da capa da música">
              <Slider label="Brilho ambiente" value={config.glow} onChange={(v) => update({ glow: v })} />
            </Row>
          </Group>
          <Group title="Olhinhos">
            <Row label="Olhinhos" hint="O mascote no canto da ilha">
              <Toggle label="Olhinhos" value={config.eyes} onChange={(v) => update({ eyes: v })} />
            </Row>
            <Row label="Seguir o cursor" hint="Se desligado, olham para a frente">
              <Toggle label="Seguir o cursor" value={config.followCursor} onChange={(v) => update({ followCursor: v })} />
            </Row>
          </Group>
          <Group title="Movimento">
            <Row label="Reduzir movimento" hint="Troca molas e desfoque por fades curtos">
              <Toggle label="Reduzir movimento" value={config.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
            </Row>
          </Group>
        </>
      );
    case "paginas":
      return <PagesSection />;
    case "musica":
      return (
        <>
          <Group>
            <Row label="Letra na pílula" hint="Mostra a linha atual com a ilha recolhida">
              <Toggle label="Letra na pílula" value={config.lyricPill} onChange={(v) => update({ lyricPill: v })} />
            </Row>
            <Row label="Atraso da letra" hint="Se a letra vem adiantada, diminua; se vem atrasada, aumente">
              <Stepper
                label="Atraso da letra"
                value={config.lyricDelayMs / 1000}
                unit="s"
                step={0.5}
                min={-5}
                max={5}
                onChange={(seconds) => update({ lyricDelayMs: Math.round(seconds * 1000) })}
              />
            </Row>
          </Group>
          <Group title="De onde vem">
            <Row label="Fonte das letras" hint="Letras sincronizadas, sem chave. Se o LRCLIB não tiver, o NetEase (bom em música brasileira) é a reserva">
              <span className="badge">LRCLIB + NetEase</span>
            </Row>
            <Row label="Players" hint="Qualquer app com controle de mídia do Windows">
              <span className="badge">Spotify · Navegador · Outros</span>
            </Row>
          </Group>
        </>
      );
    case "foco":
      return (
        <>
          <Group title="Pomodoro">
            <Row label="Foco" hint="Quanto dura cada sessão de foco">
              <NumberStepper label="Foco" value={config.focusMinutes} unit="min" min={1} max={120} step={5} onChange={(v) => update({ focusMinutes: v })} />
            </Row>
            <Row label="Pausa curta">
              <NumberStepper label="Pausa curta" value={config.shortBreakMinutes} unit="min" min={1} max={60} onChange={(v) => update({ shortBreakMinutes: v })} />
            </Row>
            <Row label="Pausa longa" hint="Vem depois do último foco do ciclo">
              <NumberStepper label="Pausa longa" value={config.longBreakMinutes} unit="min" min={1} max={90} step={5} onChange={(v) => update({ longBreakMinutes: v })} />
            </Row>
            <Row label="Focos por ciclo" hint="Depois deles, a pausa é a longa">
              <NumberStepper label="Focos por ciclo" value={config.focusPerSet} unit="focos" min={1} max={8} onChange={(v) => update({ focusPerSet: v })} />
            </Row>
            <Row label="Aviso ao terminar" hint="Um aviso curto na ilha quando o tempo acaba">
              <Toggle label="Aviso ao terminar" value={config.noticeTimer} onChange={(v) => update({ noticeTimer: v })} />
            </Row>
          </Group>
          <Group title="Notas">
            <NotesFolderRow />
          </Group>
        </>
      );
    case "sistema":
      return (
        <Group>
          <Row label="Atualizar a cada" hint="Quanto menor, mais fluido, e um pouco mais de uso do processador enquanto a página está aberta">
            <Segmented
              label="Atualizar a cada"
              value={config.systemRefreshMs}
              options={[
                { value: 1000, label: "1 s" },
                { value: 1500, label: "1,5 s" },
                { value: 3000, label: "3 s" },
                { value: 5000, label: "5 s" },
              ]}
              onChange={(v) => update({ systemRefreshMs: v })}
            />
          </Row>
        </Group>
      );
    case "claude":
      return <ClaudeSection />;
    case "shelf":
      return <ShelfFolders />;
    case "integracoes":
      return (
        <>
          <Group title="Clima">
            <WeatherCityRow />
            <Row label="Unidade" hint="Como a temperatura aparece na Agenda">
              <Segmented
                label="Unidade"
                value={config.weatherUnit}
                options={[
                  { value: "c", label: "°C" },
                  { value: "f", label: "°F" },
                ]}
                onChange={(v) => update({ weatherUnit: v })}
              />
            </Row>
          </Group>
          <CalendarSection />
        </>
      );
    case "atalhos":
      return <ShortcutsEditor />;
  }
}

/** A busca da barra lateral: acha qualquer opção pelo nome e leva até ela. */
function SearchBox({ onPick }: { onPick: (hit: SearchHit) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const hits = searchOptions(query);
  const pick = (hit: SearchHit) => {
    onPick(hit);
    setQuery("");
    setActive(0);
  };
  return (
    <div className="sa-search">
      <label className="sa-field">
        <SearchIcon />
        <input
          value={query}
          placeholder="Buscar uma opção"
          aria-label="Buscar uma opção"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="sa-hits"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((i) => Math.min(hits.length - 1, i + 1));
            else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
            else if (e.key === "Enter" && hits[active]) pick(hits[active]);
            else if (e.key === "Escape") setQuery("");
            else return;
            e.preventDefault();
          }}
        />
      </label>
      {query.trim() !== "" && (
        <ul className="sa-hits" id="sa-hits" role="listbox">
          {hits.length === 0 && <li className="none">Nada com esse nome</li>}
          {hits.map((hit, i) => (
            <li key={`${hit.area.id}-${hit.option ?? ""}`} role="option" aria-selected={i === active}>
              <button className={i === active ? "on" : ""} onMouseEnter={() => setActive(i)} onClick={() => pick(hit)}>
                <b>{hit.option ?? hit.area.label}</b>
                <span>{hit.option ? hit.area.label : "Área"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const GROUPS: ("" | "Conexões" | "Sistema")[] = ["", "Conexões", "Sistema"];

/**
 * A janela de configurações: a barra lateral acha qualquer área ou opção, e cada área abre sob uma miniatura da ilha
 * que muda na hora com o que você mexe.
 */
export function Settings() {
  // Abre já na área pedida (`?section=atalhos`); se a janela já estava aberta, o Rust avisa e ela troca.
  const [current, setCurrent] = useState<AreaId>(() => areaFrom(new URLSearchParams(location.search).get("section")) ?? "atalhos");
  const area = AREAS.find((a) => a.id === current)!;
  const mainRef = useRef<HTMLElement>(null);
  /** A opção que a busca escolheu: depois de abrir a área, a tela rola até ela e ela pisca. */
  const [target, setTarget] = useState<string | null>(null);
  useEffect(
    () =>
      ipc.onSettingsSection((asked) => {
        const next = areaFrom(asked);
        if (next) setCurrent(next);
      }),
    [],
  );

  // Os olhinhos acompanham o mouse dentro desta janela.
  useEffect(() => trackDomCursor(), []);

  // Trocar de área volta para o topo.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [current]);

  // A busca leva à opção: acha a linha pelo nome, rola só a área de conteúdo (não a janela) e a destaca.
  useEffect(() => {
    if (!target) return;
    const main = mainRef.current;
    const row = main ? Array.from(main.querySelectorAll<HTMLElement>("[data-label]")).find((el) => el.dataset.label === target) : undefined;
    setTarget(null);
    if (!main || !row) return;
    const top = row.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - main.clientHeight / 3;
    main.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    row.classList.remove("found");
    void row.offsetWidth;
    row.classList.add("found");
  }, [target, current]);

  const go = (id: AreaId) => setCurrent(id);

  return (
    <div className="sa">
      <aside className="sa-rail">
        <div className="sa-brand" data-tauri-drag-region>
          <span className="sa-eyes">
            <Eyes mood="normal" follow shake={0} />
          </span>
          <b data-tauri-drag-region>Configurações</b>
        </div>
        <SearchBox
          onPick={(hit) => {
            go(hit.area.id);
            setTarget(hit.option);
          }}
        />
        <nav className="sa-nav" aria-label="Áreas">
          {GROUPS.map((group) => (
            <div key={group || "main"} className="sa-navg">
              {group && <h2>{group}</h2>}
              {AREAS.filter((a) => a.group === group).map((a) => {
                const Icon = ICONS[a.id];
                return (
                  <button key={a.id} className={a.id === current ? "on" : ""} aria-current={a.id === current ? "page" : undefined} onClick={() => go(a.id)}>
                    <Icon size={16} />
                    <span>{a.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="sa-pane">
        <div className="sa-strip" data-tauri-drag-region>
          <div className="sa-wc">
            <button aria-label="Minimizar" onClick={() => ipc.windowControl("minimize")}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <button className="close" aria-label="Fechar" onClick={() => ipc.windowControl("close")}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <main className="sa-main" ref={mainRef}>
          <Preview area={current} />
          <header className="sa-head">
            <h1>{area.label}</h1>
            <p>{area.lead}</p>
          </header>
          <div className="sa-body" key={current}>
            <AreaContent id={current} />
          </div>
        </main>
      </div>
    </div>
  );
}
