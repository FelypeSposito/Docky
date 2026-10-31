import { describe, expect, it } from "vitest";
import { neighbor } from "./navigation";

const ids = ["a", "b", "c"];

describe("neighbor", () => {
  it("anda para frente e para trás", () => {
    expect(neighbor(ids, "a", 1)).toBe("b");
    expect(neighbor(ids, "c", -1)).toBe("b");
  });

  it("dá a volta nas pontas", () => {
    expect(neighbor(ids, "c", 1)).toBe("a");
    expect(neighbor(ids, "a", -1)).toBe("c");
  });

  it("parte da primeira se a atual não existe", () => {
    expect(neighbor(ids, "x", 1)).toBe("b");
  });
});
