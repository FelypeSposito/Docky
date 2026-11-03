import { useConfigStore } from "../../config/useConfig";
import type { ShelfFolder } from "../../config/types";
import { ipc } from "../../lib/ipc";
import { QButton, QPanel, QPath, QRow, QSegmented, QStepper, QText, QTitle, QToggle } from "./controls";

/** Os ajustes de cada página, sem abrir a janela de configurações. Valem na hora: gravam a cada mudança. */

export function MusicQuick() {
  const { config, update } = useConfigStore();
  return (
    <QPanel>
      <QRow label="Letra na pílula" hint="Mostra a linha atual com a ilha recolhida">
        <QToggle label="Letra na pílula" value={config.lyricPill} onChange={(v) => update({ lyricPill: v })} />
      </QRow>
      <QRow label="Atraso da letra" hint="Se a letra vem adiantada, diminua; se vem atrasada, aumente">
        <QStepper
          label="Atraso da letra"
          value={config.lyricDelayMs / 1000}
          min={-5}
          max={5}
          step={0.5}
          unit="s"
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}`}
          onChange={(seconds) => update({ lyricDelayMs: Math.round(seconds * 1000) })}
        />
      </QRow>
      <QRow label="Fontes das letras" hint="LRCLIB e, se ele não tiver, o NetEase (bom em música brasileira)" />
    </QPanel>
  );
}

export function TimerQuick() {
  const { config, update } = useConfigStore();
  return (
    <QPanel>
      <QRow label="Foco" hint="Quanto dura cada sessão">
        <QStepper label="Foco" value={config.focusMinutes} min={1} max={120} step={5} unit="min" onChange={(v) => update({ focusMinutes: v })} />
      </QRow>
      <QRow label="Pausa curta">
        <QStepper label="Pausa curta" value={config.shortBreakMinutes} min={1} max={60} unit="min" onChange={(v) => update({ shortBreakMinutes: v })} />
      </QRow>
      <QRow label="Pausa longa" hint="Vem depois do último foco do ciclo">
        <QStepper label="Pausa longa" value={config.longBreakMinutes} min={1} max={90} step={5} unit="min" onChange={(v) => update({ longBreakMinutes: v })} />
      </QRow>
      <QRow label="Focos por ciclo" hint="Depois deles, a pausa é a longa">
        <QStepper label="Focos por ciclo" value={config.focusPerSet} min={1} max={8} unit="focos" onChange={(v) => update({ focusPerSet: v })} />
      </QRow>
      <QRow label="Contador livre" hint="O tempo da aba Livre">
        <QStepper label="Contador livre" value={config.timerCustomMinutes} min={1} max={600} step={5} unit="min" onChange={(v) => update({ timerCustomMinutes: v })} />
      </QRow>
      <QRow label="Aviso ao terminar" hint="Um aviso curto na ilha quando o tempo acaba">
        <QToggle label="Aviso ao terminar" value={config.noticeTimer} onChange={(v) => update({ noticeTimer: v })} />
      </QRow>
    </QPanel>
  );
}

export function NotesQuick() {
  const { config, update } = useConfigStore();
  return (
    <QPanel>
      <QRow label="Pasta das notas" hint="Cada nota é um arquivo .md nesta pasta (por exemplo, a Inbox do Obsidian)">
        <QPath label="Pasta das notas" kind="folder" value={config.notesFolder} width={230} placeholder="C:\Users\você\Obsidian\Inbox" onCommit={(v) => update({ notesFolder: v })} />
      </QRow>
      <QRow label="Notas fixadas" hint={config.pinnedNotes.length === 0 ? "Fixe uma nota pelo pino que aparece ao passar o mouse" : `${config.pinnedNotes.length} no topo da lista`}>
        {config.pinnedNotes.length > 0 && <QButton onClick={() => update({ pinnedNotes: [] })}>Desafixar todas</QButton>}
      </QRow>
    </QPanel>
  );
}

export function ShelfQuick() {
  const { config, update } = useConfigStore();
  const folders = config.shelfFolders;
  const set = (next: ShelfFolder[]) => update({ shelfFolders: next });
  const change = (index: number, patch: Partial<ShelfFolder>) => set(folders.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  return (
    <QPanel>
      <QRow label="Ao enviar" hint={config.shelfMove ? "O arquivo vai para o destino e é apagado de onde estava" : "O arquivo é copiado e o original continua onde estava"}>
        <QSegmented
          label="Ao enviar"
          value={config.shelfMove ? "move" : "copy"}
          options={[
            { value: "copy", label: "Copiar" },
            { value: "move", label: "Mover" },
          ]}
          onChange={(v) => update({ shelfMove: v === "move" })}
        />
      </QRow>
      <QTitle>Pastas de destino</QTitle>
      {folders.map((folder, i) => (
        <div className="qs-line" key={i}>
          <QText label="Nome da pasta" width={110} value={folder.name} placeholder="Nome" onCommit={(v) => change(i, { name: v })} />
          <QPath label="Caminho da pasta" kind="folder" width={210} value={folder.path} placeholder="Escolha a pasta" onCommit={(v) => change(i, { path: v, name: folder.name || v.split(/[\\/]/).filter(Boolean).pop() || "" })} />
          <QButton tone="danger" onClick={() => set(folders.filter((_, k) => k !== i))}>
            Remover
          </QButton>
        </div>
      ))}
      <div className="qs-line">
        <QButton tone="primary" disabled={folders.length >= 4} onClick={() => set([...folders, { name: "", path: "" }])}>
          Adicionar pasta
        </QButton>
        {folders.length >= 4 && <span className="qs-note">No máximo 4 pastas.</span>}
      </div>
    </QPanel>
  );
}

export function AgendaQuick() {
  const { config, update } = useConfigStore();
  return (
    <QPanel>
      <QRow label="Cidade do clima" hint="Para a previsão da Agenda">
        <QText label="Cidade do clima" width={200} value={config.weatherCity} placeholder="São Paulo" onCommit={(v) => update({ weatherCity: v })} />
      </QRow>
      <QRow label="Unidade">
        <QSegmented
          label="Unidade"
          value={config.weatherUnit}
          options={[
            { value: "c", label: "°C" },
            { value: "f", label: "°F" },
          ]}
          onChange={(v) => update({ weatherUnit: v })}
        />
      </QRow>
      <QRow label="Google Agenda" hint="O login e as credenciais ficam nas configurações">
        <QButton onClick={() => ipc.openSettings("integracoes")}>Abrir configurações</QButton>
      </QRow>
    </QPanel>
  );
}

export function LauncherQuick() {
  const { config, update } = useConfigStore();
  return (
    <QPanel>
      <QRow label="Confirmar antes de abrir" hint="Apps, jogos e grupos pedem confirmação antes de abrir">
        <QToggle label="Confirmar antes de abrir" value={config.confirmApps} onChange={(v) => update({ confirmApps: v })} />
      </QRow>
      <QRow label="Atalhos e grupos" hint="Para criar, reordenar e editar, use Editar na tela de atalhos" />
    </QPanel>
  );
}

export function SystemQuick() {
  const { config, update } = useConfigStore();
  return (
    <QPanel>
      <QRow label="Atualizar a cada" hint="Quanto menor, mais fluido e um pouco mais de uso do processador enquanto a página está aberta">
        <QSegmented
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
      </QRow>
    </QPanel>
  );
}

export function ClaudeQuick() {
  const { config, update } = useConfigStore();
  return (
    <QPanel>
      <QRow label="Aprovar pela ilha" hint="Se desligado, o terminal pergunta normalmente">
        <QToggle label="Aprovar pela ilha" value={config.claudeApprove} onChange={(v) => update({ claudeApprove: v })} />
      </QRow>
      <QRow label="Faixa “Claude trabalhando”" hint="Mostra o projeto e o tempo na ilha recolhida">
        <QToggle label="Faixa Claude trabalhando" value={config.claudeWorkStrip} onChange={(v) => update({ claudeWorkStrip: v })} />
      </QRow>
      <QRow label="Aviso “Claude terminou”">
        <QToggle label="Aviso Claude terminou" value={config.noticeClaudeDone} onChange={(v) => update({ noticeClaudeDone: v })} />
      </QRow>
      <QRow label="Hooks do Claude Code" hint="Instalar ou remover fica nas configurações">
        <QButton onClick={() => ipc.openSettings("claude")}>Abrir configurações</QButton>
      </QRow>
    </QPanel>
  );
}
