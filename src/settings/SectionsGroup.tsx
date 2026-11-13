import type { ShortcutSection } from "../config/types";
import { useConfigStore } from "../config/useConfig";
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from "../island/icons";
import { moveItem } from "../island/pageOrder";
import { newId } from "../launcher/model";
import { addSection, assignSection, autoOrganize, removeSection, renameSection, sectionOf } from "../launcher/sections";
import { Group, IconButton, Row } from "./controls";
import { TextField } from "./Fields";
import "./sections.css";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * As seções da tela grande dos atalhos (Jogos, Comunicação, Utilitários…): cada uma abre e fecha pela setinha na ilha.
 * Aqui dá para criar, renomear, mudar a ordem e apagar; "Organizar" separa sozinho os atalhos que ainda estão sem seção.
 */
export function SectionsGroup() {
  const { config, update } = useConfigStore();
  const sections = config.shortcutSections;
  const set = (next: ShortcutSection[]) => update({ shortcutSections: next });
  const unsorted = config.shortcuts.filter((s) => !s.group && !s.hidden && !sectionOf(s.id, sections)).length;

  return (
    <Group>
      <Row
        label="Seções"
        hint={
          sections.length === 0
            ? "Separe os atalhos em partes que abrem e fecham na tela grande da ilha (Jogos, Comunicação, Utilitários…)"
            : unsorted > 0
              ? `${plural(unsorted, "atalho ainda sem seção", "atalhos ainda sem seção")}: eles aparecem em "Outros"`
              : "Todos os atalhos estão numa seção. A seção de cada um se escolhe na lista de atalhos"
        }
      >
        {unsorted > 0 && (
          <button className="btn" onClick={() => set(autoOrganize(config.shortcuts, sections, newId))} title="Põe os atalhos sem seção nas seções prontas que fazem sentido">
            Organizar automaticamente
          </button>
        )}
        <button className="btn primary" disabled={sections.length >= 20} onClick={() => set(addSection(sections, "Nova seção", newId))}>
          + Seção
        </button>
      </Row>
      {sections.map((section, i) => (
        <div className="row sec-row" key={section.id}>
          <TextField label="Nome da seção" width={200} value={section.name} placeholder="Nome da seção" onCommit={(v) => set(renameSection(sections, section.id, v))} />
          <span className="summary">{plural(section.members.length, "atalho", "atalhos")}</span>
          <IconButton label="Subir" disabled={i === 0} onClick={() => set(moveItem(sections, i, i - 1))}>
            <ArrowUpIcon />
          </IconButton>
          <IconButton label="Descer" disabled={i === sections.length - 1} onClick={() => set(moveItem(sections, i, i + 1))}>
            <ArrowDownIcon />
          </IconButton>
          <IconButton label="Apagar a seção (os atalhos continuam, só ficam sem seção)" danger onClick={() => set(removeSection(sections, section.id))}>
            <TrashIcon />
          </IconButton>
        </div>
      ))}
    </Group>
  );
}

/** A escolha da seção de um atalho, na linha dele (só aparece quando existe alguma seção). */
export function SectionSelect({ shortcutId, name }: { shortcutId: string; name: string }) {
  const { config, update } = useConfigStore();
  const sections = config.shortcutSections;
  if (sections.length === 0) return null;
  const current = sectionOf(shortcutId, sections)?.id ?? "";
  return (
    <select
      className="secsel"
      aria-label={`Seção de ${name || "atalho"}`}
      value={current}
      onChange={(e) => update({ shortcutSections: assignSection(sections, shortcutId, e.target.value || null) })}
    >
      <option value="">Sem seção</option>
      {sections.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
