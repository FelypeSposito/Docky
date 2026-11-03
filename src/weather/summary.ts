import type { Weather } from "../lib/ipc";

/** Chance de chuva (%) a partir da qual avisamos "chuva às 15h". */
const RAIN_LIKELY = 40;

/** A primeira hora das próximas 12 com chuva provável, ou null. */
export function nextRain(hours: Weather["hours"]): { hour: number; rain: number; inHours: number } | null {
  const index = hours.findIndex((h) => h.rain >= RAIN_LIKELY);
  return index < 0 ? null : { hour: hours[index].hour, rain: hours[index].rain, inHours: index };
}

/** Uma frase curta sobre a chuva: "Chuva agora", "Chuva às 15h (70%)", "Chance de chuva hoje: 30%" ou "Sem chuva prevista". */
export function rainNote(weather: Pick<Weather, "hours" | "rainMax" | "precipitationMm">): string {
  if ((weather.precipitationMm ?? 0) > 0.1) return "Chovendo agora";
  const next = nextRain(weather.hours);
  if (next) return next.inHours === 0 ? `Chuva agora (${Math.round(next.rain)}%)` : `Chuva às ${next.hour}h (${Math.round(next.rain)}%)`;
  const max = weather.rainMax ?? 0;
  return max >= 20 ? `Chance de chuva hoje: ${Math.round(max)}%` : "Sem chuva prevista";
}

/** Descrição do índice UV: baixo, moderado, alto, muito alto, extremo. */
export function uvLabel(uv: number): string {
  if (uv < 3) return "baixo";
  if (uv < 6) return "moderado";
  if (uv < 8) return "alto";
  if (uv < 11) return "muito alto";
  return "extremo";
}
