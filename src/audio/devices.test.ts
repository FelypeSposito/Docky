import { describe, expect, it } from "vitest";
import type { AudioOutput } from "../lib/ipc";
import { appName, micText, sortOutputs, splitOutputName } from "./devices";

describe("splitOutputName", () => {
  it("separates the kind of output from the device", () => {
    expect(splitOutputName("Fones de ouvido (UGREEN Studio Pro)")).toEqual({ title: "Fones de ouvido", detail: "UGREEN Studio Pro" });
  });

  it("keeps parentheses inside the device name", () => {
    expect(splitOutputName("Alto-falantes (Realtek(R) Audio)")).toEqual({ title: "Alto-falantes", detail: "Realtek(R) Audio" });
  });

  it("drops the port number Windows puts before a monitor", () => {
    expect(splitOutputName("5 - H238F165 (3- AMD High Definition Audio Device)")).toEqual({
      title: "H238F165",
      detail: "3- AMD High Definition Audio Device",
    });
  });

  it("leaves names without a device as they are", () => {
    expect(splitOutputName("Saída de som")).toEqual({ title: "Saída de som", detail: "" });
    expect(splitOutputName("(Só o aparelho)")).toEqual({ title: "Só o aparelho", detail: "" });
  });
});

describe("appName", () => {
  it("names the app or device behind an output", () => {
    expect(appName("Alto-falantes (FxSound Audio Enhancer)")).toBe("FxSound Audio Enhancer");
    expect(appName("Saída de som")).toBe("Saída de som");
  });
});

describe("sortOutputs", () => {
  const out = (name: string, isDefault = false): AudioOutput => ({ id: name, name, kind: "other", default: isDefault });

  it("puts the default first and the rest in name order", () => {
    expect(sortOutputs([out("Zeta"), out("Beta", true), out("Alfa")]).map((o) => o.name)).toEqual(["Beta", "Alfa", "Zeta"]);
  });

  it("orders by the shown name, ignoring a monitor's port number", () => {
    expect(sortOutputs([out("5 - Monitor (AMD)"), out("Alto-falantes (Realtek)")]).map((o) => o.name)).toEqual([
      "Alto-falantes (Realtek)",
      "5 - Monitor (AMD)",
    ]);
  });
});

describe("micText", () => {
  it("says the state in plain words", () => {
    expect(micText(true)).toBe("Microfone mudo");
    expect(micText(false)).toBe("Microfone ligado");
  });
});
