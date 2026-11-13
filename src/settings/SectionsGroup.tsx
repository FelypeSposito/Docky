import { useState } from "react";
import type { ShortcutSection } from "../config/types";
import { filterShortcuts } from "../launcher/filter";
import { useConfigStore } from "../config/useConfig";
import { GripIcon, TrashIcon } from "../island/icons";
import { newId } from "../launcher/model";
import { addSection, assignSection, autoOrganize, removeSection, renameSection, sectionOf, toggleCollapsed } from "../launcher/sections";
import { Group, IconButton, Row, Toggle } from "./controls";
import { TextField } from "./Fields";
import { useSortable } from "./useSortable";
import "../launcher/iconPicker.css";
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
  /** A seção cujos atalhos estão sendo escolhidos (o painel aparece logo abaixo da lista). */
  const [choosing, setChoosing] = useState<string | null>(null);
  const chosen = sections.find((s) => s.id === choosing);
  const plain = filterShortcuts(config.shortcuts, "").filter((e) => !e.item.group);

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
                <button
                  className={`btn sec-pick${choosing === section.id ? " on" : ""}`}
                  aria-expanded={choosing === section.id}
                  onClick={() => setChoosing((current) => (current === section.id ? null : section.id))}
                  title="Marque quais atalhos ficam nesta seção"
                >
                  {plural(section.members.length, "atalho", "atalhos")}
                </button>
                <span className="summary" />
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

      {chosen && (
        <Group title={`Atalhos em ${chosen.name || "Nova seção"}`}>
          <p className="grp-note">Clique para pôr ou tirar. Um atalho fica numa seção só: escolher aqui tira ele da outra.</p>
          {plain.length === 0 ? (
            <p className="grp-note">Crie atalhos na aba Atalhos primeiro.</p>
          ) : (
            <div className="ge-chips sec-chips">
              {plain.map(({ item }) => {
                const here = chosen.members.includes(item.id);
                const elsewhere = !here ? sectionOf(item.id, sections) : undefined;
                return (
                  <button
                    key={item.id}
                    className={here ? "on" : ""}
                    aria-pressed={here}
                    title={elsewhere ? `Hoje em ${elsewhere.name}` : undefined}
                    onClick={() => set(assignSection(sections, item.id, here ? null : chosen.id))}
                  >
                    {item.name}
                    {elsewhere && <i className="from">{elsewhere.name}</i>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="sec-done">
            <button className="btn" onClick={() => setChoosing(null)}>
              Pronto
            </button>
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
