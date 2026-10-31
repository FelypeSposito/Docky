/** Cor de acento tirada da capa: a média dos pixels mais vivos, com uma segunda cor próxima para o brilho. */
export interface Accent {
  primary: string;
  secondary: string;
}

export const DEFAULT_ACCENT: Accent = { primary: "#ff5c7a", secondary: "#7a3cff" };

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

/** `pixels` é RGBA. Devolve null quando a imagem é cinza demais para ter uma cor de destaque. */
export function pickAccent(pixels: Uint8ClampedArray): Accent | null {
  let sumX = 0;
  let sumY = 0;
  let weight = 0;
  let lightness = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 200) continue;
    const [h, s, l] = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (l < 0.12 || l > 0.92) continue; // preto e branco não são cor
    const w = s * s;
    sumX += Math.cos((h * Math.PI) / 180) * w;
    sumY += Math.sin((h * Math.PI) / 180) * w;
    lightness += l * w;
    weight += w;
  }
  if (weight < 1) return null;
  const hue = (Math.atan2(sumY, sumX) * 180) / Math.PI;
  const strength = Math.min(1, Math.hypot(sumX, sumY) / weight + 0.35);
  const l = Math.min(0.66, Math.max(0.52, lightness / weight));
  return { primary: hsl(hue, 0.78 * strength + 0.12, l), secondary: hsl(hue + 48, 0.7, Math.max(0.4, l - 0.1)) };
}

/** Lê a capa (data URL) num canvas pequeno e escolhe o acento. Falha em silêncio: fica o acento padrão. */
export function accentFromImage(src: string): Promise<Accent | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0, size, size);
        resolve(pickAccent(context.getImageData(0, 0, size, size).data));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
