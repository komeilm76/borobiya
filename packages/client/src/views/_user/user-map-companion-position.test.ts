import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const source = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const { descriptor } = parse(source);
const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "UserMapView.vue",
  id: "data-v-companion-position", scoped: true });

function rule(selector: string, stylesheet = descriptor.styles[0]!.content): string {
  const start = stylesheet.indexOf(`${selector} {`);
  expect(start, `${selector} must have a CSS rule`).toBeGreaterThan(-1);
  return stylesheet.slice(start, stylesheet.indexOf("}", start) + 1);
}

describe("map companions card placement", () => {
  it("anchors the desktop card to the physical bottom-left without reducing its content", () => {
    expect(css.errors).toEqual([]);
    const live = rule(".user-map-view__live");
    expect(live).toContain("position: absolute;");
    expect(live).toContain("inset-inline-end: calc(1rem + env(safe-area-inset-left, 0px));");
    expect(live).toContain("inset-block-end: calc(1rem + env(safe-area-inset-bottom, 0px));");
    expect(live).not.toContain("inset-inline-start:"); // In RTL this would put the card on the right.
    expect(live).toContain("max-height:");
    expect(live).toContain("overflow-y: auto;"); // Short desktop windows must still expose all actions.
    expect(rule(".user-map-view__live :deep(.live-companions)")).toContain("flex-shrink: 0;");
    expect(source).toContain('<LiveCompanionPanel :api="live"');
  });

  it("moves the native scale away from the card, restoring its edge on tablet/phone", () => {
    expect(rule(".user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left)")).toContain("left: calc(27rem + env(safe-area-inset-left, 0px));");
    const tablet = source.slice(source.indexOf("@media (max-width: 1023px)"), source.indexOf("@media (max-width: 599px)"));
    expect(tablet).toContain(".user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) { left: 0; }");
    expect(tablet).toContain(".user-map-view__live { order: 4; }"); // Tablet keeps its in-flow panel.
    expect(source).toContain(':is="isPhone ? VDialog : \'div\'"'); // Phone remains modal.
  });
});
