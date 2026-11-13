/**
 * O som do fim do Foco: três notas curtas e suaves (um arpejo de sino), feitas na hora com Web Audio,
 * sem arquivo de áudio. Baixo o bastante para não assustar, claro o bastante para ouvir com música.
 */
let context: AudioContext | null = null;

const NOTES = [659.25, 830.61, 987.77]; // mi, sol sustenido e si: um acorde maior, sem tensão
const GAP = 0.16;
const DECAY = 1.4;
const GAIN = 0.11;

function bell(ctx: AudioContext, freq: number, at: number) {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, at);
  out.gain.linearRampToValueAtTime(GAIN, at + 0.012);
  out.gain.exponentialRampToValueAtTime(0.0001, at + DECAY);
  out.connect(ctx.destination);

  // A fundamental e um harmônico bem baixo dão o timbre de sino sem ficar estridente.
  for (const [ratio, level] of [
    [1, 1],
    [2.01, 0.18],
  ] as const) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    amp.gain.value = level;
    osc.connect(amp).connect(out);
    osc.start(at);
    osc.stop(at + DECAY + 0.05);
  }
}

export function playChime() {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime + 0.03;
    NOTES.forEach((freq, i) => bell(context!, freq, start + i * GAP));
  } catch {
    // Sem saída de áudio: o aviso visual continua.
  }
}
