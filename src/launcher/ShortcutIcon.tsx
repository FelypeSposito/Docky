import type { Shortcut } from "../config/types";
import { iconKind, iconText } from "./icons";

export const SHORTCUT_COLORS = ["#4c8dff", "#8b5cf6", "#ff9f43", "#34d399", "#ff5c7a", "#30b0c7"];

/** O ícone do atalho: a imagem escolhida, o emoji/texto, ou a inicial do nome sobre uma cor. */
export function ShortcutIcon({ shortcut, image, color, className = "li" }: { shortcut: Shortcut; image?: string; color: string; className?: string }) {
  const kind = iconKind(shortcut.icon ?? "");
  if (kind === "image" && image) {
    return <img className={`${className} img`} src={image} alt="" draggable={false} />;
  }
  if (kind === "text") {
    return <span className={`${className} txt`}>{iconText(shortcut.icon)}</span>;
  }
  return (
    <span className={className} style={{ background: color }}>
      {shortcut.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
