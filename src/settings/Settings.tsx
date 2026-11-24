import { type ComponentType, useEffect, useRef, useState } from "react";
import { useConfigStore } from "../config/useConfig";
import { Eyes } from "../island/Eyes";
import { CloudIcon, GearIcon, GridIcon, KeyboardIcon, MusicIcon, SearchIcon, SparkIcon, SunIcon, TimerIcon, TrayIcon } from "../island/icons";
import { trackDomCursor } from "../lib/cursor";
import { ipc } from "../lib/ipc";
import "../island/island.css";
import { AREAS, type AreaId, type SearchHit, isArea, searchOptions } from "./areas";
import { ClaudeSection } from "./ClaudeSection";
import { HotkeysGroup, NotesFolderRow, PagesSection, ScreensRow, ShelfFolders, ShortcutsEditor, WeatherCityRow } from "./Fields";
import { CalendarSection } from "./CalendarSection";
import { DiscordSection } from "./DiscordSection";
import { ISLAND_COLORS, islandColor } from "../island/theme";
import { Group, NumberStepper, Row, Segmented, Slider, Stepper, Swatches, Toggle } from "./controls";
import { Preview } from "./Preview";
import "./settings.css";
import { t } from "../i18n";

/** Where the project lives: releases, issues and ideas. */
const REPO_URL = "https://github.com/FelypeSposito/Docky";

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
};

/** A área pedida por `?section=` ou pela ilha (os ids continuam os mesmos das versões anteriores). */
const areaFrom = (value: string | null): AreaId | null => (isArea(value) ? value : null);

/** The newer release GitHub has, if any (read once when Settings opens). */
function useUpdate() {
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(null);
  useEffect(() => {
    void ipc.updateAvailable().then(setUpdate).catch(() => {});
  }, []);
  return update;
}

function AreaContent({ id }: { id: AreaId }) {
  const { config, update } = useConfigStore();
  const newer = useUpdate();

  switch (id) {
    case "geral":
      return (
        <>
          <Group title="Idioma">
            <Row label="Idioma da interface" hint="Automático segue o idioma do Windows">
              <Segmented
                label="Idioma da interface"
                value={config.language === "pt" || config.language === "en" ? config.language : "auto"}
                options={[
                  { value: "auto", label: "Automático" },
                  { value: "pt", label: "Português" },
                  { value: "en", label: "English" },
                ]}
                onChange={(v) => update({ language: v })}
              />
            </Row>
          </Group>
          <Group title={t("Ao ligar")}>
            <Row label={t("Iniciar com o Windows")} hint={t("Abre o Docky quando você entra no PC")}>
              <Toggle label={t("Iniciar com o Windows")} value={config.startWithWindows} onChange={(v) => update({ startWithWindows: v })} />
            </Row>
            <ScreensRow />
          </Group>
          <Group title={t("Comportamento")}>
            <Row label={t("Abrir ao passar o mouse")} hint={t("Desligado, passar o mouse mostra o player (com música) ou um resumo, e a ilha abre com clique ou Ctrl+Alt+D")}>
              <Toggle label={t("Abrir ao passar o mouse")} value={config.hoverOpen} onChange={(v) => update({ hoverOpen: v })} />
            </Row>
            <Row label={t("Esconder em tela cheia")} hint={t("Jogos, vídeos e apresentações")}>
              <Toggle label={t("Esconder em tela cheia")} value={config.hideInFullscreen} onChange={(v) => update({ hideInFullscreen: v })} />
            </Row>
            <Row label={t("Chamada na pílula")} hint={t("Enquanto um app usa o microfone: o tempo da chamada e um botão para mutar")}>
              <Toggle label={t("Chamada na pílula")} value={config.callPill} onChange={(v) => update({ callPill: v })} />
            </Row>
            <Row label="Deixar espaço para a ilha" hint="Janelas maximizadas, como a do navegador, começam abaixo da pílula">
              <Toggle label="Deixar espaço para a ilha" value={config.reserveSpace} onChange={(v) => update({ reserveSpace: v })} />
            </Row>
          </Group>
          <Group title={t("Copiados")}>
            <Row
              label={t("Histórico do que você copia")}
              hint={t("Os últimos 10 textos, só na memória: somem quando o Docky fecha. Senhas copiadas de gerenciadores ficam de fora")}
            >
              <Toggle
                label={t("Histórico do que você copia")}
                value={config.clipboardHistory}
                onChange={(v) => {
                  update({ clipboardHistory: v });
                  if (!v) void ipc.clipboardClear();
                }}
              />
            </Row>
          </Group>
          <Group title={t("Avisos curtos")}>
            <Row label={t("Aviso do carregador")} hint={t("Quando você liga o carregador")}>
              <Toggle label={t("Aviso do carregador")} value={config.noticeCharge} onChange={(v) => update({ noticeCharge: v })} />
            </Row>
            <Row label={t("Aviso de volume")} hint={t("A barra de volume quando ele muda")}>
              <Toggle label={t("Aviso de volume")} value={config.noticeVolume} onChange={(v) => update({ noticeVolume: v })} />
            </Row>
            <Row label={t("Aviso do Foco")} hint={t("Quando um foco ou uma pausa termina")}>
              <Toggle label={t("Aviso do Foco")} value={config.noticeTimer} onChange={(v) => update({ noticeTimer: v })} />
            </Row>
            <Row label={t("Resumo do jogo")} hint={t("Quando você sai de um jogo em tela cheia: quanto tempo jogou")}>
              <Toggle label={t("Resumo do jogo")} value={config.noticeGame} onChange={(v) => update({ noticeGame: v })} />
            </Row>
            <Row label={t("Bateria do fone")} hint={t("Quando um fone Bluetooth conecta, a carga dele; e um aviso quando ela fica em 20% (se o fone informa a carga ao Windows)")}>
              <Toggle label={t("Bateria do fone")} value={config.noticeBluetooth} onChange={(v) => update({ noticeBluetooth: v })} />
            </Row>
            <Row label={t("Download concluído")} hint={t("Quando um download do navegador termina, com um botão para mostrar o arquivo")}>
              <Toggle label={t("Download concluído")} value={config.noticeDownload} onChange={(v) => update({ noticeDownload: v })} />
            </Row>
          </Group>
          <HotkeysGroup />
          <Group title={t("Sobre")}>
            <Row
              label={`Docky ${__APP_VERSION__}`}
              hint={newer ? t("A versão {v} saiu: baixe o instalador e rode por cima, suas configurações ficam", { v: newer.version }) : "Código aberto: veja as novidades, relate um problema ou sugira uma ideia"}
            >
              {newer ? (
                <button className="btn primary" onClick={() => ipc.openUrl(newer.url)}>
                  {t("Baixar a {v}", { v: newer.version })}
                </button>
              ) : (
                <button className="btn" onClick={() => ipc.openUrl(REPO_URL)}>
                  {t("Abrir no GitHub")}
                </button>
              )}
            </Row>
            <Row label={t("Procurar atualizações")} hint={t("Duas vezes por dia, o Docky olha no GitHub se saiu versão nova. Nada sobre você é enviado")}>
              <Toggle label={t("Procurar atualizações")} value={config.checkUpdates} onChange={(v) => update({ checkUpdates: v })} />
            </Row>
            <Row label={t("Registros")} hint={t("Um arquivo com os erros do Docky, só no seu computador. Anexe ao relatar um problema")}>
              <button className="btn" onClick={() => void ipc.openLogs()}>
                {t("Abrir a pasta")}
              </button>
            </Row>
          </Group>
        </>
      );
    case "aparencia":
      return (
        <>
          <Group title={t("Cor e brilho")}>
            <Row
              label={t("Cor da ilha")}
              hint={islandColor(config.islandColor) ? t("{color}, sempre, com ou sem música", { color: t(islandColor(config.islandColor)!.label) }) : "Da capa da música que está tocando; sem música, o rosa do Docky"}
            >
              <Swatches
                label={t("Cor da ilha")}
                value={islandColor(config.islandColor)?.id ?? null}
                options={ISLAND_COLORS.map((c) => ({ id: c.id, label: c.label, color: c.primary }))}
                auto={t("Da música")}
                onChange={(id) => update({ islandColor: id ?? "" })}
              />
            </Row>
            <Row label={t("Brilho ambiente")} hint={t("A luz colorida atrás da ilha aberta")}>
              <Slider label={t("Brilho ambiente")} value={config.glow} onChange={(v) => update({ glow: v })} />
            </Row>
            <Row
              label="Material"
              hint={
                config.material === "glass"
                  ? "Vidro líquido: o fundo aparece escurecido, a luz da borda segue o mouse e a ilha se acende ao toque"
                  : "A ilha preta de sempre"
              }
            >
              <Segmented
                label="Material"
                value={config.material === "glass" ? "glass" : "solid"}
                options={[
                  { value: "solid", label: "Preto" },
                  { value: "glass", label: "Vidro líquido" },
                ]}
                onChange={(v) => update({ material: v })}
              />
            </Row>
            {config.material === "glass" && (
              <Row
                label="Aparência do vidro"
                hint={config.glassStyle === "tinted" ? "Tingido: mais opaco, com mais contraste para ler" : "Transparente: mostra mais do que está por trás"}
              >
                <Segmented
                  label="Aparência do vidro"
                  value={config.glassStyle === "tinted" ? "tinted" : "clear"}
                  options={[
                    { value: "clear", label: "Transparente" },
                    { value: "tinted", label: "Tingido" },
                  ]}
                  onChange={(v) => update({ glassStyle: v })}
                />
              </Row>
            )}
            <Row label={t("Borda de vidro")} hint={t("Um fio de luz na borda da ilha. Desligada, a ilha fica só preta")}>
              <Toggle label={t("Borda de vidro")} value={config.glassEdge} onChange={(v) => update({ glassEdge: v })} />
            </Row>
          </Group>
          <Group title={t("Olhinhos")}>
            <Row label={t("Olhinhos")} hint={t(config.eyes ? "O mascote no canto da ilha" : "Desligados, o Clawd aparece no lugar deles")}>
              <Toggle label={t("Olhinhos")} value={config.eyes} onChange={(v) => update({ eyes: v })} />
            </Row>
            {!config.eyes && (
              <Row label={t("Clawd sempre visível")} hint={t("No lugar dos olhos o tempo todo: ouve junto quando toca música e, sem música, fica de bobeira, toma um café, se alonga ou dança. Desligado, só aparece enquanto o Claude Code trabalha")}>
                <Toggle label={t("Clawd sempre visível")} value={config.clawdAlways} onChange={(v) => update({ clawdAlways: v })} />
              </Row>
            )}
            <Row label={t("Seguir o cursor")} hint={t("Se desligado, olham para a frente")}>
              <Toggle label={t("Seguir o cursor")} value={config.followCursor} onChange={(v) => update({ followCursor: v })} />
            </Row>
          </Group>
          <Group title={t("Posição")}>
            <Row label={t("Lugar no topo")} hint={t("Ou arraste a ilha para os lados, pela pílula ou pelo cabeçalho quando aberta")}>
              <Segmented
                label={t("Lugar no topo")}
                value={config.islandPosition === 0 ? "left" : config.islandPosition === 1 ? "right" : config.islandPosition === 0.5 ? "center" : "custom"}
                options={[
                  { value: "left", label: "Esquerda" },
                  { value: "center", label: "Centro" },
                  { value: "right", label: "Direita" },
                ]}
                onChange={(v) => update({ islandPosition: v === "left" ? 0 : v === "right" ? 1 : 0.5 })}
              />
            </Row>
          </Group>
          <Group title={t("Relógio")}>
            <Row label={t("Formato da hora")} hint={t("Na pílula e no topo da ilha aberta")}>
              <Segmented
                label={t("Formato da hora")}
                value={config.clock12h ? "12" : "24"}
                options={[
                  { value: "24", label: "24 horas" },
                  { value: "12", label: "12 horas" },
                ]}
                onChange={(v) => update({ clock12h: v === "12" })}
              />
            </Row>
            <Row label={t("Data e hora no topo")} hint={t("Na ilha aberta. Desligado, a busca dos atalhos ocupa o cabeçalho inteiro")}>
              <Toggle label={t("Data e hora no topo")} value={config.headerClock} onChange={(v) => update({ headerClock: v })} />
            </Row>
          </Group>
          <Group title={t("Movimento")}>
            <Row label={t("Reduzir movimento")} hint={t("Troca molas e desfoque por fades curtos")}>
              <Toggle label={t("Reduzir movimento")} value={config.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
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
            <Row label={t("Letra na pílula")} hint={t("Mostra a linha atual com a ilha recolhida")}>
              <Toggle label={t("Letra na pílula")} value={config.lyricPill} onChange={(v) => update({ lyricPill: v })} />
            </Row>
            <Row label={t("Atraso da letra")} hint={t("Se a letra vem adiantada, diminua; se vem atrasada, aumente")}>
              <Stepper
                label={t("Atraso da letra")}
                value={config.lyricDelayMs / 1000}
                unit="s"
                step={0.5}
                min={-5}
                max={5}
                onChange={(seconds) => update({ lyricDelayMs: Math.round(seconds * 1000) })}
              />
            </Row>
          </Group>
          <Group title={t("De onde vem")}>
            <Row label={t("Fonte das letras")} hint={t("Letras sincronizadas, sem chave. Se o LRCLIB não tiver, o NetEase (bom em música brasileira) é a reserva")}>
              <span className="badge">{t("LRCLIB + NetEase")}</span>
            </Row>
            <Row label={t("Players")} hint={t("Qualquer app com controle de mídia do Windows")}>
              <span className="badge">{t("Spotify · Navegador · Outros")}</span>
            </Row>
          </Group>
        </>
      );
    case "foco":
      return (
        <>
          <Group title={t("Pomodoro")}>
            <Row label={t("Foco")} hint={t("Quanto dura cada sessão de foco")}>
              <NumberStepper label={t("Foco")} value={config.focusMinutes} unit="min" min={1} max={120} step={5} onChange={(v) => update({ focusMinutes: v })} />
            </Row>
            <Row label={t("Pausa curta")}>
              <NumberStepper label={t("Pausa curta")} value={config.shortBreakMinutes} unit="min" min={1} max={60} onChange={(v) => update({ shortBreakMinutes: v })} />
            </Row>
            <Row label={t("Pausa longa")} hint={t("Vem depois do último foco do ciclo")}>
              <NumberStepper label={t("Pausa longa")} value={config.longBreakMinutes} unit="min" min={1} max={90} step={5} onChange={(v) => update({ longBreakMinutes: v })} />
            </Row>
            <Row label={t("Focos por ciclo")} hint={t("Depois deles, a pausa é a longa")}>
              <NumberStepper label={t("Focos por ciclo")} value={config.focusPerSet} unit="focos" min={1} max={8} onChange={(v) => update({ focusPerSet: v })} />
            </Row>
            <Row label={t("Aviso ao terminar")} hint={t("Um aviso curto na ilha quando o tempo acaba")}>
              <Toggle label={t("Aviso ao terminar")} value={config.noticeTimer} onChange={(v) => update({ noticeTimer: v })} />
            </Row>
            <Row label={t("Som ao terminar")} hint={t("Um toque suave quando o foco, a pausa ou o contador acaba")}>
              <Toggle label={t("Som ao terminar")} value={config.timerSound} onChange={(v) => update({ timerSound: v })} />
            </Row>
          </Group>
          <Group title={t("Notas")}>
            <NotesFolderRow />
          </Group>
        </>
      );
    case "claude":
      return <ClaudeSection />;
    case "shelf":
      return <ShelfFolders />;
    case "integracoes":
      return (
        <>
          <Group title={t("Clima")}>
            <WeatherCityRow />
            <Row label={t("Unidade")} hint={t("Como a temperatura aparece na Agenda")}>
              <Segmented
                label={t("Unidade")}
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
          <DiscordSection />
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
          placeholder={t("Buscar uma opção")}
          aria-label={t("Buscar uma opção")}
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
          {hits.length === 0 && <li className="none">{t("Nada com esse nome")}</li>}
          {hits.map((hit, i) => (
            <li key={`${hit.area.id}-${hit.option ?? ""}`} role="option" aria-selected={i === active}>
              <button className={i === active ? "on" : ""} onMouseEnter={() => setActive(i)} onClick={() => pick(hit)}>
                <b>{t(hit.option ?? hit.area.label)}</b>
                <span>{t(hit.option ? hit.area.label : "Área")}</span>
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
/** The Settings window in liquid glass: only where Windows puts real acrylic behind it, else it stays solid. */
function useGlassWindow(): boolean {
  const material = useConfigStore((s) => s.config.material);
  const [acrylic, setAcrylic] = useState(false);
  useEffect(() => {
    void ipc.settingsAcrylic().then(setAcrylic).catch(() => setAcrylic(false));
  }, []);
  return acrylic && material === "glass";
}

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
    const row = main ? Array.from(main.querySelectorAll<HTMLElement>("[data-label]")).find((el) => el.dataset.label === t(target)) : undefined;
    setTarget(null);
    if (!main || !row) return;
    const top = row.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - main.clientHeight / 3;
    main.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    row.classList.remove("found");
    void row.offsetWidth;
    row.classList.add("found");
  }, [target, current]);

  const go = (id: AreaId) => setCurrent(id);
  const glassWindow = useGlassWindow();
  const glassStyle = useConfigStore((s) => s.config.glassStyle);

  return (
    <div className={`sa${glassWindow ? " glass" : ""}${glassWindow && glassStyle === "tinted" ? " tinted" : ""}`}>
      <aside className="sa-rail">
        <div className="sa-brand" data-tauri-drag-region>
          <span className="sa-eyes">
            <Eyes mood="normal" follow shake={0} />
          </span>
          <b data-tauri-drag-region>{t("Configurações")}</b>
        </div>
        <SearchBox
          onPick={(hit) => {
            go(hit.area.id);
            setTarget(hit.option);
          }}
        />
        <nav className="sa-nav" aria-label={t("Áreas")}>
          {GROUPS.map((group) => (
            <div key={group || "main"} className="sa-navg">
              {group && <h2>{t(group)}</h2>}
              {AREAS.filter((a) => a.group === group).map((a) => {
                const Icon = ICONS[a.id];
                return (
                  <button key={a.id} className={a.id === current ? "on" : ""} aria-current={a.id === current ? "page" : undefined} onClick={() => go(a.id)}>
                    <Icon size={16} />
                    <span>{t(a.label)}</span>
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
            <button aria-label={t("Minimizar")} onClick={() => ipc.windowControl("minimize")}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <button className="close" aria-label={t("Fechar")} onClick={() => ipc.windowControl("close")}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <main className="sa-main" ref={mainRef}>
          <Preview area={current} />
          <header className="sa-head">
            <h1>{t(area.label)}</h1>
            <p>{t(area.lead)}</p>
          </header>
          <div className="sa-body" key={current}>
            <AreaContent id={current} />
          </div>
        </main>
      </div>
    </div>
  );
}
