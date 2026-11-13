import type { ShortcutSection } from "../config/types";
import { useConfigStore } from "../config/useConfig";
import { GripIcon, TrashIcon } from "../island/icons";
import { newId } from "../launcher/model";
import { addSection, assignSection, autoOrganize, removeSection, renameSection, sectionOf, toggleCollapsed } from "../launcher/sections";
import { Group, IconButton, Row, Toggle } from "./controls";
import { TextField } from "./Fields";
import { useSortable } from "./useSortable";
import "./sections.css";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * As seções da tela grande dos atalhos (Jogos, Comunicação, Utilitários…), em ordem de prioridade: a primeira aparece
 * em cima e primeiro nos filtros da ilha. Arraste pela alça para mudar a ordem; "Organizar" separa sozinho os atalhos
 * que ainda estão sem seção.
 */
export function SectionsGroup() {
  const { config, update } = useConfigStore();
  const sections = config.shortcutSections;
  const set = (next: ShortcutSection[]) => update({ shortcutSections: next });
  const sortable = useSortable(
    sections.map((s) => s.id),
    (order) => set(order.map((id) => sections.find((s) => s.id === id)!).filter(Boolean)),
  );
  const unsorted = config.shortcuts.filter((s) => !s.group && !s.hidden && !sectionOf(s.id, sections)).length;

  return (
    <>
      <Group>
        <Row
          label="Seções"
          hint={
            sections.length === 0
              ? "Separe os atalhos em partes que abrem e fecham na ilha, com um filtro para cada uma"
              : unsorted > 0
                ? `${plural(unsorted, "atalho ainda sem seção", "atalhos ainda sem seção")}: eles aparecem em "Outros"`
                : "Todos os atalhos estão numa seção"
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
      </Group>

      {sections.length > 0 && (
        <Group title="Ordem de prioridade">
          <p className="grp-note">A primeira seção aparece em cima e primeiro nos filtros da ilha. Arraste pela alça para mudar.</p>
          <div className="sortable">
            {sections.map((section, i) => (
              <div
                className={`row sec-row srow${sortable.dragId === section.id ? " drag" : ""}`}
                key={section.id}
                data-label={section.name}
                ref={sortable.rowRef(section.id)}
                style={{ order: sortable.position.get(section.id) }}
              >
                <span className="handle" role="presentation" title="Arraste para mudar a ordem" onPointerDown={(e) => sortable.down(e, section.id)}>
                  <GripIcon />
                </span>
                <span className="sec-rank" aria-label={`Prioridade ${(sortable.position.get(section.id) ?? i) + 1}`}>
                  {(sortable.position.get(section.id) ?? i) + 1}
                </span>
                <TextField label="Nome da seção" width={200} value={section.name} placeholder="Nome da seção" onCommit={(v) => set(renameSection(sections, section.id, v))} />
                <span className="summary">{plural(section.members.length, "atalho", "atalhos")}</span>
                <span className="sec-open">
                  <span>Aberta</span>
                  <Toggle label={`${section.name} começa aberta`} value={!section.collapsed} onChange={() => set(toggleCollapsed(sections, section.id))} />
                </span>
                <IconButton label="Apagar a seção (os atalhos continuam, só ficam sem seção)" danger onClick={() => set(removeSection(sections, section.id))}>
                  <TrashIcon />
                </IconButton>
              </div>
            ))}
          </div>
        </Group>
      )}
    </>
  );
}

/** A escolha da seção de um atalho, na linha dele (só aparece quando existe alguma seção). */
export function SectionSelect({ shortcutId, name }: { shortcutId: string; name: string }) {
  const { config, update } = useConfigStore();
  const sections = config.shortcutSections;
  if (sections.length === 0) return null;
  const current = sectionOf(shortcutId, sections)?.id ?? "";
  return (
    <select className="secsel" aria-label={`Seção de ${name || "atalho"}`} value={current} onChange={(e) => update({ shortcutSections: assignSection(sections, shortcutId, e.target.value || null) })}>
      <option value="">Sem seção</option>
      {sections.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
