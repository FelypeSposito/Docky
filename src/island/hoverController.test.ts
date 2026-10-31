import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHoverController } from "./hoverController";

function setup(overrides: { canExpand?: boolean; canCollapse?: boolean } = {}) {
  const expand = vi.fn();
  const collapse = vi.fn();
  const controller = createHoverController({
    canExpand: () => overrides.canExpand ?? true,
    canCollapse: () => overrides.canCollapse ?? true,
    expand,
    collapse,
  });
  return { controller, expand, collapse };
}

describe("createHoverController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("expande depois de um instante com o mouse em cima", () => {
    const { controller, expand } = setup();
    controller.setHover(true);
    vi.advanceTimersByTime(129);
    expect(expand).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(expand).toHaveBeenCalledOnce();
  });

  it("não expande se o mouse só passou", () => {
    const { controller, expand } = setup();
    controller.setHover(true);
    vi.advanceTimersByTime(60);
    controller.setHover(false);
    vi.advanceTimersByTime(1000);
    expect(expand).not.toHaveBeenCalled();
  });

  it("recolhe depois que o mouse sai", () => {
    const { controller, collapse } = setup();
    controller.setHover(false);
    vi.advanceTimersByTime(379);
    expect(collapse).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(collapse).toHaveBeenCalledOnce();
  });

  it("não recolhe se o mouse voltou a tempo", () => {
    const { controller, collapse } = setup();
    controller.setHover(false);
    vi.advanceTimersByTime(200);
    controller.setHover(true);
    vi.advanceTimersByTime(1000);
    expect(collapse).not.toHaveBeenCalled();
  });

  it("respeita canExpand e canCollapse", () => {
    const blocked = setup({ canExpand: false, canCollapse: false });
    blocked.controller.setHover(true);
    blocked.controller.setHover(false);
    vi.advanceTimersByTime(1000);
    expect(blocked.expand).not.toHaveBeenCalled();
    expect(blocked.collapse).not.toHaveBeenCalled();
  });
});
