import { useState } from "react";
import type { ShortcutSection } from "../config/types";
import { filterShortcuts } from "../launcher/filter";
import { useConfigStore } from "../config/useConfig";
import { GripIcon, TrashIcon } from "../island/icons";
import { newId } from "../launcher/model";
import { DAY_PARTS } from "../launcher/schedule";
import { addSection, assignSection, autoOrganize, removeSection, renameSection, sectionOf, toggleCollapsed } from "../launcher/sections";
import { Group, IconButton, Row, Toggle } from "./controls";
import { TextField } from "./Fields";
import { useSortable } from "./useSortable";
import "../launcher/iconPicker.css";
import "./sections.css";
import { t } from "../i18n";

/** "1 atalho" / "3 atalhos", in the interface's language ("{n}" is the count). */
const plural = (n: number, one: string, many: string) => t(n === 1 ? `1 ${one}` : `{n} ${many}`, { n });

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
          label={t("Seções")}
          hint={
            sections.length === 0
              ? "Separe os atalhos em partes que abrem e fecham na ilha, com um filtro para cada uma"
              : unsorted > 0
                ? t("{what}: eles aparecem em “Outros”", { what: plural(unsorted, "atalho ainda sem seção", "atalhos ainda sem seção") })
                : "Todos os atalhos estão numa seção"
          }
        >
          {unsorted > 0 && (
            <button className="btn" onClick={() => set(autoOrganize(config.shortcuts, sections, newId))} title={t("Põe os atalhos sem seção nas seções prontas que fazem sentido")}>
              {t("Organizar automaticamente")}
            </button>
          )}
          <button className="btn primary" disabled={sections.length >= 20} onClick={() => set(addSection(sections, t("Nova seção"), newId))}>
            {t("+ Seção")}
          </button>
        </Row>
      </Group>

      {sections.length > 0 && (
        <Group title={t("Ordem de prioridade")}>
          <p className="grp-note">{t("A primeira seção aparece em cima e primeiro nos filtros da ilha. Arraste pela alça para mudar. Com um horário, os atalhos da seção vêm primeiro na ilha nesse período (por exemplo, Trabalho de manhã e Jogos à noite).")}</p>
          <div className="sortable">
            {sections.map((section, i) => (
              <div
                className={`row sec-row srow${sortable.dragId === section.id ? " drag" : ""}`}
                key={section.id}
                data-label={section.name}
                ref={sortable.rowRef(section.id)}
                style={{ order: sortable.position.get(section.id) }}
              >
                <span className="handle" role="presentation" title={t("Arraste para mudar a ordem")} onPointerDown={(e) => sortable.down(e, section.id)}>
                  <GripIcon />
                </span>
                <span className="sec-rank" aria-label={`Prioridade ${(sortable.position.get(section.id) ?? i) + 1}`}>
                  {(sortable.position.get(section.id) ?? i) + 1}
                </span>
                <TextField label={t("Nome da seção")} width={150} value={section.name} placeholder={t("Nome da seção")} onCommit={(v) => set(renameSection(sections, section.id, v))} />
                <button
                  className={`btn sec-pick${choosing === section.id ? " on" : ""}`}
                  aria-expanded={choosing === section.id}
                  onClick={() => setChoosing((current) => (current === section.id ? null : section.id))}
                  title={t("Marque quais atalhos ficam nesta seção")}
                >
                  {plural(section.members.length, "atalho", "atalhos")}
                </button>
                <select
                  className="secsel sec-hours"
                  aria-label={t("Quando {name} vem primeiro na ilha", { name: section.name })}
                  title={t("Nesse período, os atalhos desta seção aparecem primeiro na ilha")}
                  value={section.hours ?? ""}
                  onChange={(e) => set(sections.map((s) => (s.id === section.id ? { ...s, hours: e.target.value } : s)))}
                >
                  <option value="">{t("Qualquer hora")}</option>
                  {DAY_PARTS.map((part) => (
                    <option key={part.value} value={part.value}>
                      {t(part.label)} ({part.hours})
                    </option>
                  ))}
                </select>
                <span className="summary" />
                <span className="sec-open">
                  <span>{t("Aberta")}</span>
                  <Toggle label={t("{name} começa aberta", { name: section.name })} value={!section.collapsed} onChange={() => set(toggleCollapsed(sections, section.id))} />
                </span>
                <IconButton label={t("Apagar a seção (os atalhos continuam, só ficam sem seção)")} danger onClick={() => set(removeSection(sections, section.id))}>
                  <TrashIcon />
                </IconButton>
              </div>
            ))}
          </div>
        </Group>
      )}

      {chosen && (
        <Group title={t("Atalhos em {name}", { name: chosen.name || t("Nova seção") })}>
          <p className="grp-note">{t("Clique para pôr ou tirar. Um atalho fica numa seção só: escolher aqui tira ele da outra.")}</p>
          {plain.length === 0 ? (
            <p className="grp-note">{t("Crie atalhos na aba Atalhos primeiro.")}</p>
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
                    title={elsewhere ? t("Hoje em {name}", { name: elsewhere.name }) : undefined}
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
              {t("Pronto")}
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
    <select className="secsel" aria-label={t("Seção de {name}", { name: name || t("atalho") })} value={current} onChange={(e) => update({ shortcutSections: assignSection(sections, shortcutId, e.target.value || null) })}>
      <option value="">{t("Sem seção")}</option>
      {sections.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
