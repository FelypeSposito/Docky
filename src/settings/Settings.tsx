import { type ComponentType, useEffect, useState } from "react";
import { useConfigStore } from "../config/useConfig";
import { Eyes } from "../island/Eyes";
import { CloudIcon, GearIcon, GridIcon, KeyboardIcon, MusicIcon, PulseIcon, SparkIcon, SunIcon, TimerIcon, TrayIcon } from "../island/icons";
import { trackDomCursor } from "../lib/cursor";
import { ipc } from "../lib/ipc";
import "../island/island.css";
import { ClaudeSection } from "./ClaudeSection";
import { NotesFolderRow, PagesSection, ShelfFolders, ShortcutsEditor, WeatherCityRow } from "./Fields";
import { CalendarSection } from "./CalendarSection";
import { Group, NumberStepper, Row, Segmented, Slider, Stepper, Toggle } from "./controls";
import "./settings.css";

type SectionId = "geral" | "aparencia" | "paginas" | "musica" | "foco" | "sistema" | "claude" | "shelf" | "integracoes" | "atalhos";

const SECTIONS: { id: SectionId; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: "geral", label: "Geral", Icon: GearIcon },
  { id: "aparencia", label: "Aparência", Icon: SunIcon },
  { id: "paginas", label: "Páginas", Icon: GridIcon },
  { id: "musica", label: "Música", Icon: MusicIcon },
  { id: "foco", label: "Foco", Icon: TimerIcon },
  { id: "sistema", label: "Sistema", Icon: PulseIcon },
  { id: "claude", label: "Claude Code", Icon: SparkIcon },
  { id: "shelf", label: "Shelf", Icon: TrayIcon },
  { id: "integracoes", label: "Integrações", Icon: CloudIcon },
  { id: "atalhos", label: "Atalhos", Icon: KeyboardIcon },
];

function Section({ id }: { id: SectionId }) {
  const { config, update } = useConfigStore();

  switch (id) {
    case "geral":
      return (
        <>
          <Group>
            <Row label="Iniciar com o Windows" hint="Abre o Docky quando você entra no PC">
              <Toggle label="Iniciar com o Windows" value={config.startWithWindows} onChange={(v) => update({ startWithWindows: v })} />
            </Row>
          </Group>
          <Group>
            <NotesFolderRow />
          </Group>
          <Group>
            <Row label="Aviso do carregador" hint="Um aviso curto quando você liga o carregador">
              <Toggle label="Aviso do carregador" value={config.noticeCharge} onChange={(v) => update({ noticeCharge: v })} />
            </Row>
            <Row label="Aviso de volume" hint="A barra de volume quando ele muda">
              <Toggle label="Aviso de volume" value={config.noticeVolume} onChange={(v) => update({ noticeVolume: v })} />
            </Row>
            <Row label="Aviso do Foco" hint="Quando um foco ou uma pausa termina">
              <Toggle label="Aviso do Foco" value={config.noticeTimer} onChange={(v) => update({ noticeTimer: v })} />
            </Row>
          </Group>
          <Group>
            <Row label="Abrir ao passar o mouse" hint="Senão, só abre com clique ou com Ctrl+Alt+D">
              <Toggle label="Abrir ao passar o mouse" value={config.hoverOpen} onChange={(v) => update({ hoverOpen: v })} />
            </Row>
            <Row label="Esconder em tela cheia" hint="Jogos, vídeos e apresentações">
              <Toggle label="Esconder em tela cheia" value={config.hideInFullscreen} onChange={(v) => update({ hideInFullscreen: v })} />
            </Row>
          </Group>
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
          <Group>
            <Row label="Olhinhos" hint="O mascote no canto da ilha">
              <Toggle label="Olhinhos" value={config.eyes} onChange={(v) => update({ eyes: v })} />
            </Row>
            <Row label="Seguir o cursor" hint="Se desligado, olham para a frente">
              <Toggle label="Seguir o cursor" value={config.followCursor} onChange={(v) => update({ followCursor: v })} />
            </Row>
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
          <Group>
            <Row label="Fonte das letras" hint="Letras sincronizadas, sem chave de API. Se o LRCLIB não tiver, o NetEase (bom em música brasileira) é a reserva">
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
          <Group>
            <Row label="Foco" hint="Quanto dura cada sessão de foco">
              <NumberStepper label="Foco" value={config.focusMinutes} unit="min" min={1} max={120} step={5} onChange={(v) => update({ focusMinutes: v })} />
            </Row>
            <Row label="Pausa curta">
              <NumberStepper label="Pausa curta" value={config.shortBreakMinutes} unit="min" min={1} max={60} onChange={(v) => update({ shortBreakMinutes: v })} />
            </Row>
            <Row label="Pausa longa" hint="Vem depois do último foco do ciclo">
              <NumberStepper label="Pausa longa" value={config.longBreakMinutes} unit="min" min={1} max={90} step={5} onChange={(v) => update({ longBreakMinutes: v })} />
            </Row>
          </Group>
          <Group>
            <Row label="Focos por ciclo" hint="Depois deles, a pausa é a longa">
              <NumberStepper label="Focos por ciclo" value={config.focusPerSet} unit="focos" min={1} max={8} onChange={(v) => update({ focusPerSet: v })} />
            </Row>
            <Row label="Aviso ao terminar" hint="Um aviso curto na ilha quando o tempo acaba">
              <Toggle label="Aviso ao terminar" value={config.noticeTimer} onChange={(v) => update({ noticeTimer: v })} />
            </Row>
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
          <Group>
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

/** A janela de configurações, no mesmo visual da ilha: preto, vidro, brilho e um dock para navegar. */
export function Settings() {
  const [current, setCurrent] = useState<SectionId>("geral");
  const section = SECTIONS.find((s) => s.id === current)!;

  // Os olhinhos acompanham o mouse dentro desta janela.
  useEffect(() => trackDomCursor(), []);

  return (
    <div className="sa">
      <div className="sa-glow" />
      <div className="grain" />

      <header className="sa-bar" data-tauri-drag-region>
        <div className="sa-eyes">
          <Eyes mood="normal" follow shake={0} />
        </div>
        <nav className="sdock" aria-label="Seções">
          {SECTIONS.map(({ id, label, Icon }) => (
            <button key={id} className={`sdk${id === current ? " on" : ""}`} aria-label={label} onClick={() => setCurrent(id)}>
              <Icon size={16} />
              <span className="lb">{label}</span>
            </button>
          ))}
        </nav>
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
      </header>

      <main className="sa-main">
        <h1>{section.label}</h1>
        <div className="sa-body" key={current}>
          <Section id={current} />
        </div>
      </main>
    </div>
  );
}
