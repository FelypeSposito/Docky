import { ipc } from "../lib/ipc";
import { type LyricLine, parseLrc } from "./lrc";

export interface TrackQuery {
  title: string;
  artist: string;
  album: string;
  durationMs: number;
}

export interface Lyrics {
  /** Letra sincronizada (LRC), ou null se só houver texto simples. */
  synced: LyricLine[] | null;
}

interface LrclibResult {
  syncedLyrics?: string | null;
}

const cache = new Map<string, Lyrics | null>();

const keyOf = (q: TrackQuery) => `${q.artist}|${q.title}|${Math.round(q.durationMs / 1000)}`.toLowerCase();

async function getJson<T>(path: string, signal: AbortSignal): Promise<T | null> {
  const body = await ipc.lrclib(path);
  if (signal.aborted) throw new DOMException("cancelado", "AbortError");
  return body ? (JSON.parse(body) as T) : null;
}

/**
 * Busca letra sincronizada no LRCLIB (gratuito, sem chave). Tenta o casamento exato por faixa e duração e,
 * se falhar, uma busca por texto. Devolve null quando não há letra sincronizada.
 */
export async function fetchLyrics(query: TrackQuery, signal: AbortSignal): Promise<Lyrics | null> {
  const key = keyOf(query);
  if (cache.has(key)) return cache.get(key) ?? null;

  const params = new URLSearchParams({ track_name: query.title, artist_name: query.artist });
  if (query.album) params.set("album_name", query.album);
  if (query.durationMs > 0) params.set("duration", String(Math.round(query.durationMs / 1000)));

  // Se a rede ou o LRCLIB falharem (ou a busca for cancelada), o erro sobe: quem chamou decide tentar de novo,
  // e a falha não vai para o cache.
  let synced = (await getJson<LrclibResult>(`get?${params}`, signal))?.syncedLyrics;
  if (!synced) {
    const results = await getJson<LrclibResult[]>(
      `search?${new URLSearchParams({ track_name: query.title, artist_name: query.artist })}`,
      signal,
    );
    synced = results?.find((r) => r.syncedLyrics)?.syncedLyrics;
  }

  const lines = synced ? parseLrc(synced) : [];
  const result = lines.length > 0 ? { synced: lines } : null;
  cache.set(key, result);
  return result;
}
