import { describe, expect, it } from "vitest";
import { needsOverlayRestore } from "./overlay-restore";

function map(loaded: boolean, sources: string[], layers: string[]) {
  return { styleLoaded: loaded, hasSource: (id: string) => sources.includes(id),
    hasLayer: (id: string) => layers.includes(id) };
}

describe("idle/styledata overlay restoration", () => {
  const sources = ["history", "live"];
  const layers = ["line", "dot"];
  it("does not issue map mutations when all resources exist (including repeated idle and paint events)", () => {
    const ready = map(true, sources, layers);
    expect(needsOverlayRestore(ready, sources, layers)).toBe(false);
    expect(needsOverlayRestore(ready, sources, layers)).toBe(false);
  });
  it("waits for a loaded style, then repairs missing sources or layers", () => {
    expect(needsOverlayRestore(map(false, [], []), sources, layers)).toBe(false);
    expect(needsOverlayRestore(map(true, ["history"], layers), sources, layers)).toBe(true);
    expect(needsOverlayRestore(map(true, sources, ["line"]), sources, layers)).toBe(true);
    expect(needsOverlayRestore(map(true, [], []), sources, layers)).toBe(true);
  });
});
