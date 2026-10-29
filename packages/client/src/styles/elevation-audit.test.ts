import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { designTokenStylesheet, shadows } from "./tokens";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} must have a CSS rule`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start) + 1);
}

describe("remaining CSS, Tailwind and Vuetify elevation audit", () => {
  it("uses themed, low-tier shadows for interactive rows and raised hovers", () => {
    const [light, dark] = designTokenStylesheet().split(":root.dark {");
    for (const css of [light, dark]) {
      expect(css).toContain("--bb-shadow-item:");
      expect(css).toContain("--bb-shadow-item-hover:");
    }
    expect(shadows.light.item).not.toBe(shadows.dark.item);
    expect(shadows.light.itemHover).not.toBe(shadows.dark.itemHover);
    expect(light).toContain(`--bb-shadow-item: ${shadows.light.item}`);
    expect(dark).toContain(`--bb-shadow-item: ${shadows.dark.item}`);
    const offers = source("../views/_user/UserProposalsView.vue");
    const sos = source("../views/_user/UserSosHistoryView.vue");
    const rescuer = source("../views/_user/UserRescuerHistoryView.vue");
    for (const [css, selector] of [[offers, ".offer-card"], [sos, ".history__item"], [rescuer, ".history__item"]]) {
      expect(rule(css, selector)).toContain("box-shadow: var(--bb-shadow-item);");
      expect(rule(css, `${selector}:not(:disabled):not(${selector}--selected):hover`)).toContain("box-shadow: var(--bb-shadow-item-hover);");
      expect(rule(css, `${selector}--selected`)).toContain("var(--bb-shadow-item)");
      expect(rule(css, `${selector}--selected`)).toContain("0 0 0 2px");
    }
    expect(sos).toContain(".history__item:focus-visible { outline:");
    expect(offers).toContain(".offer-card:focus-visible, .offers__pages :focus-visible { outline:");
    for (const [css, selector] of [[offers, ".offers__items"], [sos, ".history__items"], [rescuer, ".history__items"]]) {
      const gutterRule = css.slice(css.lastIndexOf(`${selector} {`));
      expect(gutterRule.slice(0, gutterRule.indexOf("}"))).toContain("padding: 8px 10px 12px;"); // scroll clip must leave a shadow gutter
    }
    for (const css of [offers, sos, rescuer]) {
      expect(css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"))).toContain("transform: none;");
    }
  });

  it("avoids elevating the broadcast bar when it is inside a dashboard card", () => {
    const broadcast = source("../components/sharing/LiveBroadcastBar.vue");
    expect(source("../views/_user/UserDashboardView.vue")).toContain("<LiveBroadcastBar inset />");
    expect(source("../views/_user/UserLocationSharesView.vue")).toContain("<LiveBroadcastBar />");
    expect(broadcast).toContain(':elevation="inset ? 0 : 2"');
    expect(rule(broadcast, ".broadcast-bar--inset")).toContain("border-radius: var(--bb-radius-nested, 16px) !important;");
  });

  it("keeps map controls visible above dark tiles without changing their button semantics", () => {
    const canvas = source("../components/map/MapCanvas.vue");
    expect(rule(canvas, ":deep(.maplibregl-ctrl-group:not(:empty))")).toContain("box-shadow: var(--bb-shadow-item-hover);");
    expect(rule(canvas, ":global(:root.dark) :deep(.maplibregl-ctrl-group)")).toContain("border-color:");
    expect(canvas).toContain("@media (forced-colors: active)");
    expect(canvas).toContain("box-shadow: 0 0 0 2px ButtonText;");
    expect(canvas).not.toContain(":deep(.maplibregl-ctrl button)");
  });

  it("does not add a global card shadow that flattens dialog and inset tiers", () => {
    expect(source("./tailwind.css")).not.toMatch(/\.v-card\s*\{[^}]*box-shadow:/);
  });
});
