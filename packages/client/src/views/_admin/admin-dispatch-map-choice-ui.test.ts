import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;
const markup = template!.content;
const css = styles[0]!.content;

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("dispatch overlap chooser and cluster count", () => {
  it("thickens the white count without relying on a font weight absent from the map server", () => {
    const count = source.slice(source.indexOf("if (!map.getLayer(RESPONDER_COUNT_LAYER_ID))"),
      source.indexOf("// Keep the selected fix above the cluster count"));
    expect(count).toContain('"text-font": ["Borobiya Vazirmatn"]');
    expect(count).toContain('"text-size": 16');
    expect(count).toContain('"text-halo-color": "#ffffff"');
    expect(count).toContain('"text-halo-width": .8');
    expect(count).toContain('"text-allow-overlap": true');
  });

  it("uses a compact, labeled, scrollable choice card beside the buttons and above attribution", () => {
    const chooser = markup.slice(markup.indexOf('id="dispatch-map-choices"'),
      markup.indexOf('id="dispatch-legend-toggle"'));
    expect(chooser).toContain('aria-labelledby="dispatch-map-choices-heading"');
    expect(chooser).toContain('mapPointChoices.length.toLocaleString(\'fa-IR\')');
    expect(chooser).toContain('aria-label="بستن فهرست نقاط"');
    expect(chooser).toContain('class="dispatch-map-choices__item"');
    expect(chooser).toContain(':aria-pressed="choice.kind === \'cluster\' ? undefined : isMapChoiceSelected(choice)"');
    expect(chooser).toContain('choice.title ?? choice.label');
    expect(chooser).toContain('mapChoiceHint(choice)');
    expect(rule(".admin-dispatch__map-and-actions .dispatch-map-choices"))
      .toContain("right: calc(44px + 2rem);");
    expect(rule(".admin-dispatch__map-and-actions .dispatch-map-choices"))
      .toContain("bottom: calc(1.75rem + env(safe-area-inset-bottom, 0px));");
    // Two 58px choices plus the labeled header fit on a normal-height map;
    // short viewports still constrain the scrollable list to the map area.
    expect(rule(".admin-dispatch__map-and-actions .dispatch-map-choices"))
      .toContain("max-height: min(15rem, calc(100% - 6rem));");
    expect(rule(".dispatch-map-choices")).toContain("max-height: min(15rem, 50%);");
    expect(rule(".dispatch-map-choices__items")).toContain("overflow-y: auto;");
    expect(css).toContain(".dispatch-map-choices__item--selected { border-color: rgb(var(--v-theme-primary));");
    expect(css).toContain("@media (forced-colors: active) {\n  .dispatch-map-choices, .dispatch-map-choices__item");
    expect(css).not.toContain("bottom: 5rem; max-height: min(30dvh, 15rem)");
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "choices", source: markup }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminDispatchView.vue", id: "choices", scoped: true, source: css }).errors).toEqual([]);
  });
});
