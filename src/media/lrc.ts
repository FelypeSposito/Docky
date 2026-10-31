export interface LyricLine {
  /** Instante em que a linha começa (ms). */
  timeMs: number;
  text: string;
}

const TIMESTAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/** Lê o formato LRC ("[01:23.45] texto"), aceitando várias marcas de tempo por linha. */
export function parseLrc(source: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(TIMESTAMP)];
    if (stamps.length === 0) continue;
    const text = raw.replace(TIMESTAMP, "").trim();
    for (const [, min, sec, frac] of stamps) {
      const fraction = frac ? Number(frac.padEnd(3, "0").slice(0, 3)) : 0;
      lines.push({ timeMs: (Number(min) * 60 + Number(sec)) * 1000 + fraction, text });
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

/** Índice da linha atual (−1 antes da primeira). `delayMs` positivo adianta a letra. */
export function lineIndexAt(lines: LyricLine[], positionMs: number, delayMs = 0): number {
  const t = positionMs + delayMs;
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].timeMs <= t) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
