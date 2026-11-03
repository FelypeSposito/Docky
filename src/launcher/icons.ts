import { useEffect, useState } from "react";
import type { Shortcut } from "../config/types";
import { ipc } from "../lib/ipc";

/** Espelha a lista de extensões de `launcher.rs` (`image_mime`): só estas viram imagem. */
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i;
const LIBRARY_ICON = /^lib:[a-z0-9-]+$/;

export type IconKind = "none" | "text" | "image" | "library";

/**
 * O que o campo de ícone guarda: nada (vale a inicial do nome), `lib:nome` (a biblioteca do Docky), o caminho de uma
 * imagem ou um emoji/texto curto. Um caminho que não termina numa extensão de imagem não é ícone.
 */
export function iconKind(icon: string): IconKind {
  const value = icon.trim();
  if (!value) return "none";
  if (LIBRARY_ICON.test(value)) return "library";
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

/** A imagem (data URL) de cada item que tem um arquivo como ícone, pela posição na lista. */
export function useIconImages(icons: string[], fetchImage: (index: number) => Promise<string | null>): Record<number, string> {
  const [images, setImages] = useState<Record<number, string>>({});
  // Muda só quando o ícone muda (o resto do item não interessa).
  const signature = icons.map((icon) => (iconKind(icon ?? "") === "image" ? icon.trim() : "")).join("\n");

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const load = (index: number, retry: boolean) =>
      fetchImage(index)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return images;
}

/** As imagens dos ícones dos atalhos. */
export const useShortcutImages = (shortcuts: Shortcut[]) =>
  useIconImages(
    shortcuts.map((s) => s.icon ?? ""),
    (index) => ipc.shortcutIcon(index),
  );

/** As imagens dos ícones das pastas da Shelf. */
export const useShelfImages = (folders: { icon?: string }[]) =>
  useIconImages(
    folders.map((f) => f.icon ?? ""),
    (index) => ipc.shelfIcon(index),
  );
