import { useEffect, useState } from "react";
import type { Shortcut } from "../config/types";
import { ipc } from "../lib/ipc";

/** Espelha a lista de extensões de `launcher.rs` (`image_mime`): só estas viram imagem. */
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i;

export type IconKind = "none" | "text" | "image";

/**
 * O que o campo de ícone guarda: nada (vale a inicial do nome), um emoji/texto curto, ou o caminho de uma imagem.
 * Um caminho que não termina numa extensão de imagem não é ícone.
 */
export function iconKind(icon: string): IconKind {
  const value = icon.trim();
  if (!value) return "none";
  if (IMAGE_EXTENSION.test(value)) return "image";
  return /[\\/]/.test(value) ? "none" : "text";
}

/** Os dois primeiros caracteres (um emoji conta como um, mesmo composto). */
export function iconText(icon: string): string {
  const value = icon.trim();
  const Segmenter = (Intl as unknown as { Segmenter?: new () => { segment: (text: string) => Iterable<{ segment: string }> } }).Segmenter;
  const segments = Segmenter ? [...new Segmenter().segment(value)].map((s) => s.segment) : Array.from(value);
  return segments.slice(0, 2).join("");
}

/** A imagem (data URL) de cada atalho que tem um arquivo como ícone, pela posição na lista. */
export function useShortcutImages(shortcuts: Shortcut[]): Record<number, string> {
  const [images, setImages] = useState<Record<number, string>>({});
  // Muda só quando o ícone muda (o resto do atalho não interessa).
  const signature = shortcuts.map((s) => (iconKind(s.icon ?? "") === "image" ? s.icon.trim() : "")).join("\n");

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const load = (index: number, retry: boolean) =>
      ipc
        .shortcutIcon(index)
        .then((url) => alive && url && setImages((prev) => ({ ...prev, [index]: url })))
        .catch(() => {
          // A configuração é gravada em seguida à mudança; se a leitura chegou antes, tenta mais uma vez.
          if (alive && retry) timers.push(setTimeout(() => load(index, false), 600));
        });

    setImages({});
    signature.split("\n").forEach((icon, index) => icon && load(index, true));
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [signature]);

  return images;
}
