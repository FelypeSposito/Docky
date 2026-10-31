import { type ComponentType, useEffect, useState } from "react";
import { useConfigStore } from "../config/useConfig";
import { Eyes } from "../island/Eyes";
import { CloudIcon, GearIcon, GridIcon, KeyboardIcon, MusicIcon, SparkIcon, SunIcon, TrayIcon } from "../island/icons";
import { trackDomCursor } from "../lib/cursor";
import { ipc } from "../lib/ipc";
import "../island/island.css";
import { ClaudeSection } from "./ClaudeSection";
import { NotesFolderRow, PagesSection, ShelfFolders, ShortcutsEditor, WeatherCityRow } from "./Fields";
import { Group, Row, Slider, Stepper, Toggle } from "./controls";
import "./settings.css";

type SectionId = "geral" | "aparencia" | "paginas" | "musica" | "claude" | "shelf" | "integracoes" | "atalhos";

const SECTIONS: { id: SectionId; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: "geral", label: "Geral", Icon: GearIcon },
  { id: "aparencia", label: "Aparência", Icon: SunIcon },
  { id: "paginas", label: "Páginas", Icon: GridIcon },
  { id: "musica", label: "Música", Icon: MusicIcon },
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
            <Row label="Fonte das letras" hint="Letras sincronizadas, sem chave de API">
              <span className="badge">LRCLIB</span>
            </Row>
            <Row label="Players" hint="Qualquer app com controle de mídia do Windows">
              <span className="badge">Spotify · Navegador · Outros</span>
            </Row>
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
          <Group>
            <WeatherCityRow />
          </Group>
          <Group>
            <Row label="Google Calendar" hint="Somente leitura e opcional. A conexão por OAuth chega numa próxima etapa">
              <span className="badge">Em breve</span>
            </Row>
          </Group>
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
