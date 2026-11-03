import { ipc } from "../lib/ipc";
import { type LyricLine, parseLrc } from "./lrc";

export interface TrackQuery {
  title: string;
  artist: string;
  album: string;
  durationMs: number;
}

export interface Lyrics {
  /** Letra sincronizada (LRC). */
  synced: LyricLine[];
  /** De onde a letra veio. */
  source: "lrclib" | "netease";
}

/** Quanto a duração da faixa pode diferir da da letra (ms) sem a letra ficar fora de sincronia. */
const DURATION_TOLERANCE_MS = 8000;

interface LrclibResult {
  syncedLyrics?: string | null;
  /** Em segundos. */
  duration?: number;
}

interface NeteaseSong {
  id: number;
  name: string;
  artists?: { name: string }[];
  /** Em milissegundos. */
  duration?: number;
}

const cache = new Map<string, Lyrics | null>();

const keyOf = (q: TrackQuery) => `${q.artist}|${q.title}|${Math.round(q.durationMs / 1000)}`.toLowerCase();

/** Minúsculas, sem acentos e sem pontuação: "Evidências!" e "evidencias" ficam iguais. */
export const normalize = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Tira do título o que atrapalha a busca: "(feat. X)", "[Remastered]" e "- Ao Vivo". */
export function cleanTitle(title: string): string {
  const cleaned = title
    .replace(/\s*[([][^)\]]*[)\]]/g, "")
    .replace(/\s+[-–—]\s+.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || title.trim();
}

/** Só o primeiro artista: "Chitãozinho & Xororó" e "A, B feat. C" viram "Chitãozinho" e "A". */
export function mainArtist(artist: string): string {
  const first = artist.split(/\s*(?:,|;|&|\bfeat\.?|\bft\.?|\bcom\b|\be\b|\bx\b)\s*/i)[0].trim();
  return first || artist.trim();
}

const closeEnough = (lyricMs: number | undefined, trackMs: number) =>
  !lyricMs || trackMs <= 0 || Math.abs(lyricMs - trackMs) <= DURATION_TOLERANCE_MS;

/** A música do NetEase que é a faixa tocando (mesmo título, mesmo artista e duração parecida). */
export function pickNeteaseSong(songs: NeteaseSong[], query: TrackQuery): NeteaseSong | undefined {
  const title = normalize(cleanTitle(query.title));
  const artist = normalize(mainArtist(query.artist));
  return songs.find((song) => {
    const sameTitle = normalize(song.name) === title || normalize(cleanTitle(song.name)) === title;
    const sameArtist =
      !artist ||
      (song.artists ?? []).some((a) => {
        const name = normalize(a.name);
        return name.includes(artist) || artist.includes(name);
      });
    return sameTitle && sameArtist && closeEnough(song.duration, query.durationMs);
  });
}

/** Linhas de crédito que o NetEase põe no começo da letra ("作曲 : …"). */
const CREDIT = /^(作[词曲詞]|编曲|編曲|制作|製作|混音|母带|录音|监制)\s*[:：]/;

export const lrcFromNetease = (lyric: string): LyricLine[] => parseLrc(lyric).filter((line) => !CREDIT.test(line.text));

async function getJson<T>(path: string, signal: AbortSignal): Promise<T | null> {
  const body = await ipc.lrclib(path);
  if (signal.aborted) throw new DOMException("cancelado", "AbortError");
  return body ? (JSON.parse(body) as T) : null;
}

const syncedOf = (results: LrclibResult[] | null, durationMs: number): string | null | undefined =>
  results?.find((r) => r.syncedLyrics && closeEnough(r.duration ? r.duration * 1000 : undefined, durationMs))?.syncedLyrics;

/** LRCLIB (gratuito, sem chave): casamento exato, depois busca por texto, depois busca com o título e o artista limpos. */
async function fromLrclib(query: TrackQuery, signal: AbortSignal): Promise<LyricLine[]> {
  const exact = new URLSearchParams({ track_name: query.title, artist_name: query.artist });
  if (query.album) exact.set("album_name", query.album);
  if (query.durationMs > 0) exact.set("duration", String(Math.round(query.durationMs / 1000)));

  let synced = (await getJson<LrclibResult>(`get?${exact}`, signal))?.syncedLyrics;
  if (!synced) {
    const results = await getJson<LrclibResult[]>(`search?${new URLSearchParams({ track_name: query.title, artist_name: query.artist })}`, signal);
    synced = syncedOf(results, query.durationMs);
  }
  const title = cleanTitle(query.title);
  const artist = mainArtist(query.artist);
  if (!synced && (title !== query.title || artist !== query.artist)) {
    const results = await getJson<LrclibResult[]>(`search?${new URLSearchParams({ track_name: title, artist_name: artist })}`, signal);
    synced = syncedOf(results, query.durationMs);
  }
  return synced ? parseLrc(synced) : [];
}

/** NetEase Music (API pública não oficial): fonte reserva, forte em música brasileira. */
async function fromNetease(query: TrackQuery, signal: AbortSignal): Promise<LyricLine[]> {
  const search = new URLSearchParams({ s: `${cleanTitle(query.title)} ${mainArtist(query.artist)}`, type: "1", offset: "0", limit: "8" });
  const found = await ipc.netease(`api/search/get?${search}`);
  if (signal.aborted) throw new DOMException("cancelado", "AbortError");
  const songs = (found ? (JSON.parse(found) as { result?: { songs?: NeteaseSong[] } }) : null)?.result?.songs ?? [];
  const song = pickNeteaseSong(songs, query);
  if (!song) return [];

  const body = await ipc.netease(`api/song/lyric?${new URLSearchParams({ id: String(song.id), lv: "1", kv: "1", tv: "-1" })}`);
  if (signal.aborted) throw new DOMException("cancelado", "AbortError");
  const lyric = body ? (JSON.parse(body) as { lrc?: { lyric?: string } }).lrc?.lyric : null;
  return lyric ? lrcFromNetease(lyric) : [];
}

/**
 * Busca a letra sincronizada: LRCLIB primeiro e, se ele não tiver (ou estiver fora do ar), o NetEase.
 * Devolve null quando nenhuma fonte tem. Se a fonte principal falhar e a reserva também não achar, o erro sobe:
 * quem chamou decide tentar de novo, e a falha não vai para o cache.
 */
export async function fetchLyrics(query: TrackQuery, signal: AbortSignal): Promise<Lyrics | null> {
  const key = keyOf(query);
  if (cache.has(key)) return cache.get(key) ?? null;

  let lrclibError: unknown = null;
  let source: Lyrics["source"] = "lrclib";
  let lines = await fromLrclib(query, signal).catch((e) => {
    if (signal.aborted) throw e;
    lrclibError = e;
    return [] as LyricLine[];
  });
  if (lines.length === 0) {
    lines = await fromNetease(query, signal).catch((e) => {
      if (signal.aborted) throw e;
      return [] as LyricLine[];
    });
    source = "netease";
  }
  if (lines.length === 0 && lrclibError) throw lrclibError;

  const result = lines.length > 0 ? { synced: lines, source } : null;
  cache.set(key, result);
  return result;
}
