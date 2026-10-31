import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../../components/map/MapCanvas.vue", import.meta.url), "utf8");
const { descriptor } = parse(view);
const css = compileStyle({ filename: "UserMapView.vue", id: "data-v-compass", scoped: true,
  source: descriptor.styles[0]!.content });

function block(selector: string): string {
  const start = descriptor.styles[0]!.content.indexOf(`${selector} {`);
  expect(start, `Missing ${selector}`).toBeGreaterThan(-1);
  return descriptor.styles[0]!.content.slice(start, descriptor.styles[0]!.content.indexOf("}", start));
}

describe("map-only compass action", () => {
  it("removes +/- only on the companion map but retains MapLibre's real compass", () => {
    expect(view).toContain(':show-zoom="false"');
    expect(canvas).toContain("showZoom?: boolean;");
    expect(canvas).toContain("showZoom: true"); // Other MapCanvas consumers retain their zoom UI.
    expect(canvas).toContain("showZoom: props.showZoom");
    expect(canvas).toContain("showCompass: true"); // Native tap/drag, keyboard and bearing indication.
    expect(canvas).toContain("visualizePitch: true");
  });

  it("positions the compass with the SOS/share rail at all widths", () => {
    expect(css.errors).toEqual([]);
    const control = block(".user-map-view__canvas :deep(.maplibregl-ctrl-top-right)");
    expect(control).toContain("position: fixed;");
    expect(control).toContain("inset-inline-start: 1.25rem;");
    expect(control).toContain("inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 10.5rem);");
    expect(control).toContain("z-index: 6;");
    const group = block(".user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-group:not(:empty))");
    expect(group).toContain("border: 0;");
    expect(group).toContain("border-radius: 50%;");
    expect(group).toContain("box-shadow: var(--bb-shadow-overlay);");
    const button = block(".user-map-view__canvas :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass)");
    expect(button).toContain("width: 48px;");
    expect(button).toContain("height: 48px;");
    expect(css.code).toContain(".maplibregl-ctrl-compass");
    const phone = descriptor.styles[0]!.content.split("@media (max-width: 599px) {")[1]!;
    expect(phone).toContain(".maplibregl-ctrl-top-right");
    expect(phone).toContain("inset-block-end: calc(16rem + env(safe-area-inset-bottom, 0px))");
    expect(phone).toContain("inset-inline-start: calc(0.75rem + env(safe-area-inset-right, 0px))");
    const short = descriptor.styles[0]!.content.split("@media (max-width: 599px) and (max-height: 360px) {")[1]!;
    expect(short).toContain("inset-block-end: calc(12.5rem + env(safe-area-inset-bottom, 0px))");
    expect(short).toContain("inset-inline-start: calc(0.75rem + 3.5rem + env(safe-area-inset-right, 0px))");
  });
});
