import { describe, expect, it } from "vitest";
import { Spring } from "./spring";

function run(spring: Spring, seconds: number, response: number, damping: number) {
  const dt = 1 / 60;
  let peak = spring.x;
  for (let t = 0; t < seconds; t += dt) {
    spring.step(dt, response, damping);
    peak = Math.max(peak, spring.x);
  }
  return peak;
}

describe("Spring", () => {
  it("chega ao alvo e para", () => {
    const spring = new Spring(0);
    spring.target = 100;
    run(spring, 3, 0.4, 0.9);
    expect(spring.x).toBeCloseTo(100, 1);
    expect(spring.settled).toBe(true);
  });

  it("não passa do alvo quando o amortecimento é 1", () => {
    const spring = new Spring(0);
    spring.target = 100;
    const peak = run(spring, 3, 0.4, 1);
    expect(peak).toBeLessThanOrEqual(100.01);
  });

  it("passa do alvo quando o amortecimento é menor que 1", () => {
    const spring = new Spring(0);
    spring.target = 100;
    const peak = run(spring, 3, 0.4, 0.5);
    expect(peak).toBeGreaterThan(105);
  });

  it("muda de alvo no meio do caminho sem saltar", () => {
    const spring = new Spring(0);
    spring.target = 100;
    run(spring, 0.15, 0.4, 0.9);
    const before = spring.x;
    spring.target = 0;
    spring.step(1 / 240, 0.4, 0.9);
    expect(Math.abs(spring.x - before)).toBeLessThan(2);
  });

  it("snap posiciona sem animar", () => {
    const spring = new Spring(0);
    spring.snap(50);
    expect(spring.x).toBe(50);
    expect(spring.settled).toBe(true);
  });
});
