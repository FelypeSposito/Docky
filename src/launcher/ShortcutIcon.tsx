import type { ReactNode } from "react";
import type { Shortcut } from "../config/types";
import { Glyph, libraryId } from "./iconLibrary";
import { iconKind, iconText } from "./icons";

export const SHORTCUT_COLORS = ["#4c8dff", "#8b5cf6", "#ff9f43", "#34d399", "#ff5c7a", "#30b0c7"];

interface ItemIconProps {
  /** O campo de ícone: vazio, emoji, `lib:nome` ou o caminho de uma imagem. */
  icon: string;
  /** A imagem já carregada (data URL), quando o ícone é um arquivo. */
  image?: string;
  /** A cor de fundo do ícone da biblioteca e da inicial. */
  color: string;
  /** O que mostrar quando não há ícone (por padrão, a inicial do nome). */
  empty?: ReactNode;
  name?: string;
  className?: string;
  size?: number;
}

/** O ícone de um atalho ou pasta: a imagem, o emoji, um desenho da biblioteca, ou o padrão sobre uma cor. */
export function ItemIcon({ icon, image, color, empty, name = "", className = "li", size = 15 }: ItemIconProps) {
  const kind = iconKind(icon ?? "");
  if (kind === "image" && image) {
    return <img className={`${className} img`} src={image} alt="" draggable={false} />;
  }
  if (kind === "text") {
    return <span className={`${className} txt`}>{iconText(icon)}</span>;
  }
  const id = kind === "library" ? libraryId(icon) : null;
  if (id) {
    return (
      <span className={`${className} lib`} style={{ background: color }}>
        <Glyph id={id} size={size} />
      </span>
    );
  }
  return (
    <span className={className} style={{ background: color }}>
      {empty ?? (name.trim().charAt(0).toUpperCase() || "?")}
    </span>
  );
}

/** O ícone do atalho: a imagem escolhida, o emoji/texto, um desenho da biblioteca ou a inicial do nome. */
export function ShortcutIcon({ shortcut, image, color, className = "li" }: { shortcut: Shortcut; image?: string; color: string; className?: string }) {
  return <ItemIcon icon={shortcut.icon ?? ""} image={image} color={color} name={shortcut.name} className={className} />;
}
