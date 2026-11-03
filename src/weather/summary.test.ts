import { describe, expect, it } from "vitest";
import { nextRain, rainNote, uvLabel } from "./summary";

const hours = (rains: number[], start = 14) => rains.map((rain, i) => ({ hour: (start + i) % 24, temp: 24, rain, code: 3 }));

describe("resumo do clima", () => {
  it("acha a primeira hora com chuva provável", () => {
    expect(nextRain(hours([5, 10, 70, 90]))).toEqual({ hour: 16, rain: 70, inHours: 2 });
    expect(nextRain(hours([5, 10, 20]))).toBeNull();
  });

  it("escreve a frase da chuva", () => {
    expect(rainNote({ hours: hours([5, 10, 70]), rainMax: 70, precipitationMm: 0 })).toBe("Chuva às 16h (70%)");
    expect(rainNote({ hours: hours([80, 10]), rainMax: 80, precipitationMm: 0 })).toBe("Chuva agora (80%)");
    expect(rainNote({ hours: hours([5, 30]), rainMax: 30, precipitationMm: 0 })).toBe("Chance de chuva hoje: 30%");
    expect(rainNote({ hours: hours([0, 5]), rainMax: 5, precipitationMm: 0 })).toBe("Sem chuva prevista");
    expect(rainNote({ hours: [], rainMax: null, precipitationMm: 1.2 })).toBe("Chovendo agora");
  });

  it("passa da meia-noite sem errar a hora", () => {
    expect(nextRain(hours([0, 0, 60], 22))?.hour).toBe(0);
  });

  it("descreve o índice UV", () => {
    expect([1, 4, 7, 9, 12].map(uvLabel)).toEqual(["baixo", "moderado", "alto", "muito alto", "extremo"]);
  });
});
