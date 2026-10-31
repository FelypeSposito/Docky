import { useEffect, useState } from "react";
import { create } from "zustand";
import { ipc, type Media, type Volume } from "../lib/ipc";
import { useIslandStore } from "../island/store";
import { type Accent, accentFromImage } from "./accent";
import { fetchLyrics, type Lyrics } from "./lyrics";

interface MediaStore {
  media: Media | null;
  /** Instante (performance.now) em que `media.positionMs` foi lido, para extrapolar a posição. */
  receivedAt: number;
  thumbnail: string | null;
  lyrics: Lyrics | null;
  accent: Accent | null;
  volume: Volume | null;
  setMedia: (media: Media | null) => void;
}

const trackKey = (m: Media) => `${m.app}|${m.title}|${m.artist}`;

export const useMediaStore = create<MediaStore>((set) => ({
  media: null,
  receivedAt: 0,
  thumbnail: null,
  lyrics: null,
  accent: null,
  volume: null,
  setMedia: (media) =>
    set((s) => {
      if (!media) return { media: null, thumbnail: null, lyrics: null, accent: null };
      const changed = !s.media || trackKey(s.media) !== trackKey(media);
      return {
        media,
        receivedAt: performance.now(),
        thumbnail: changed ? media.thumbnail : (media.thumbnail ?? s.thumbnail),
        lyrics: changed ? null : s.lyrics,
        accent: changed ? null : s.accent,
      };
    }),
}));

/** Posição atual da faixa em ms, extrapolada desde a última leitura. */
export function getPositionMs(): number {
  const { media, receivedAt } = useMediaStore.getState();
  if (!media) return 0;
  const elapsed = media.playing ? performance.now() - receivedAt : 0;
  const position = media.positionMs + elapsed;
  return media.durationMs > 0 ? Math.min(position, media.durationMs) : position;
}

/** Posição em ms, atualizada 4x por segundo enquanto `active`. */
export function usePositionMs(active: boolean): number {
  const [position, setPosition] = useState(() => getPositionMs());
  useEffect(() => {
    setPosition(getPositionMs());
    if (!active) return;
    const timer = setInterval(() => setPosition(getPositionMs()), 250);
    return () => clearInterval(timer);
  }, [active]);
  return position;
}

const VOLUME_NOTICE_MS = 1800;

/** Liga o estado de mídia, letras, capa/acento e volume aos eventos do Rust. Chame uma vez, na ilha. */
export function useMediaSync(): void {
  const key = useMediaStore((s) => (s.media ? trackKey(s.media) : ""));
  const thumbnail = useMediaStore((s) => s.thumbnail);

  useEffect(() => {
    const { setMedia } = useMediaStore.getState();
    let alive = true;
    void ipc.getMedia().then((m) => alive && setMedia(m));
    void ipc.getVolume().then((v) => alive && useMediaStore.setState({ volume: v }));
    const offMedia = ipc.onMedia(setMedia);
    const offVolume = ipc.onVolume((volume) => {
      useMediaStore.setState({ volume });
      useIslandStore.getState().showOverlay("volume", VOLUME_NOTICE_MS);
    });
    return () => {
      alive = false;
      offMedia();
      offVolume();
    };
  }, []);

  // Letra da faixa atual.
  useEffect(() => {
    const media = useMediaStore.getState().media;
    if (!key || !media) return;
    const controller = new AbortController();
    const query = { title: media.title, artist: media.artist, album: media.album, durationMs: media.durationMs };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const load = () =>
      fetchLyrics(query, controller.signal)
        .then((lyrics) => !controller.signal.aborted && useMediaStore.setState({ lyrics }))
        .catch(() => {
          // O LRCLIB às vezes sai do ar: tenta de novo em 30 s, 60 s e 90 s e depois desiste desta faixa.
          if (controller.signal.aborted || attempt >= 3) return;
          attempt += 1;
          timer = setTimeout(load, attempt * 30_000);
        });
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [key]);

  // Cor de acento da capa.
  useEffect(() => {
    if (!thumbnail) {
      useMediaStore.setState({ accent: null });
      return;
    }
    let alive = true;
    void accentFromImage(thumbnail).then((accent) => alive && useMediaStore.setState({ accent }));
    return () => {
      alive = false;
    };
  }, [thumbnail]);
}
