import { useEffect, useMemo, useRef, useState } from "react";
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

/** Tentativas de ler uma imagem: a configuração é gravada em seguida à mudança, e a leitura pode chegar antes. */
const MAX_ATTEMPTS = 5;

/**
 * A imagem (data URL) de cada item que tem um arquivo como ícone, pela posição na lista. As imagens são lidas pelo
 * caminho e guardadas por ele: reordenar a lista só muda quem usa qual imagem, sem reler nada (ler pela posição
 * trocava ou apagava os ícones quando a ordem mudava antes de a configuração ser gravada).
 */
export function useIconImages(icons: string[], fetchImage: (path: string) => Promise<string | null>): Record<number, string> {
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  const have = useRef(loaded);
  have.current = loaded;
  const paths = icons.map((icon) => (iconKind(icon ?? "") === "image" ? icon.trim() : ""));
  // Muda só quando o conjunto de arquivos muda (a ordem e o resto do item não interessam).
  const wanted = [...new Set(paths.filter(Boolean))].sort().join("\n");

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const load = (path: string, attempt: number) =>
      fetchImage(path)
        .then((url) => alive && url && setLoaded((prev) => ({ ...prev, [path]: url })))
        .catch(() => {
          if (alive && attempt + 1 < MAX_ATTEMPTS) timers.push(setTimeout(() => load(path, attempt + 1), 400 * (attempt + 1)));
        });
    wanted.split("\n").forEach((path) => path && !have.current[path] && load(path, 0));
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  return useMemo(() => Object.fromEntries(paths.flatMap((path, index) => (path && loaded[path] ? [[index, loaded[path]] as const] : []))), [paths.join("\n"), loaded]);
}

/** As imagens dos ícones dos atalhos. */
export const useShortcutImages = (shortcuts: Shortcut[]) =>
  useIconImages(
    shortcuts.map((s) => s.icon ?? ""),
    (path) => ipc.iconImage(path),
  );

/** As imagens dos ícones das pastas da Shelf. */
export const useShelfImages = (folders: { icon?: string }[]) =>
  useIconImages(
    folders.map((f) => f.icon ?? ""),
    (path) => ipc.iconImage(path),
  );
