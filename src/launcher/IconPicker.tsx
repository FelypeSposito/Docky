import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import { Glyph, LIBRARY, libraryId } from "./iconLibrary";
import { iconKind } from "./icons";
import { ItemIcon } from "./ShortcutIcon";
import "./iconPicker.css";

interface IconPickerProps {
  /** O ícone atual (vazio, emoji, `lib:nome` ou caminho de imagem). */
  value: string;
  /** O nome do item, para a inicial de quando não há ícone. */
  name: string;
  /** Cor do fundo do ícone na prévia. */
  color: string;
  /** A imagem do ícone atual, se for um arquivo. */
  image?: string;
  /** Troca o ícone (grava na hora). */
  onChange: (icon: string) => void;
  onDone: () => void;
}

/**
 * Escolher o ícone de um atalho ou pasta: um desenho da biblioteca do Docky, um emoji, ou uma foto do computador.
 * Serve na ilha e nas configurações; grava a cada escolha.
 */
export function IconPicker({ value, name, color, image, onChange, onDone }: IconPickerProps) {
  const current = libraryId(value);
  const [emoji, setEmoji] = useState(iconKind(value) === "text" ? value : "");
  useEffect(() => setEmoji(iconKind(value) === "text" ? value : ""), [value]);

  return (
    <div className="ip" role="dialog" aria-label={`Ícone de ${name || "item"}`}>
      <div className="ip-head">
        <span className="ip-preview">
          <ItemIcon icon={value} image={image} color={color} name={name} className="li" size={18} />
        </span>
        <div className="ip-title">
          <b>Ícone de {name || "item"}</b>
          <span>Escolha um desenho, um emoji ou uma foto</span>
        </div>
        <button className="ip-btn primary" onClick={onDone}>
          Pronto
        </button>
      </div>

      <div className="ip-grid" role="listbox" aria-label="Biblioteca de ícones">
        {LIBRARY.map((icon) => (
          <button
            key={icon.id}
            role="option"
            aria-selected={current === icon.id}
            className={current === icon.id ? "on" : ""}
            title={icon.label}
            onClick={() => onChange(`lib:${icon.id}`)}
          >
            <Glyph id={icon.id} size={18} />
          </button>
        ))}
      </div>

      <div className="ip-foot">
        <label className="ip-emoji">
          <span>Emoji</span>
          <input
            value={emoji}
            maxLength={8}
            placeholder="🙂"
            aria-label="Emoji do ícone"
            onChange={(e) => setEmoji(e.target.value)}
            onBlur={() => emoji.trim() !== (iconKind(value) === "text" ? value : "") && onChange(emoji.trim())}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </label>
        <button className="ip-btn" onClick={() => void ipc.pickPath("image").then((path) => path && onChange(path))}>
          Escolher foto…
        </button>
        <button className="ip-btn" disabled={!value.trim()} onClick={() => onChange("")}>
          Usar o padrão
        </button>
      </div>
    </div>
  );
}
