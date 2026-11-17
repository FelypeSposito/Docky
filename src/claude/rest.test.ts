import { describe, expect, it } from "vitest";
import { restAt } from "./rest";

describe("restAt", () => {
  it("follows the hours of the day", () => {
    expect(restAt(2)).toBe("sleep");
    expect(restAt(23)).toBe("sleep");
    expect(restAt(5)).toBe("coffee");
    expect(restAt(10)).toBe("coffee");
    expect(restAt(11)).toBe("idle");
    expect(restAt(18)).toBe("idle");
    expect(restAt(19)).toBe("gaming");
    expect(restAt(22)).toBe("gaming");
  });

  it("wraps hours outside 0 to 23", () => {
    expect(restAt(24)).toBe("sleep");
    expect(restAt(-1)).toBe("sleep");
    expect(restAt(31)).toBe("coffee");
  });
});
