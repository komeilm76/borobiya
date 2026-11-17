import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// docs/TASKS.md: source/compiled SFC contracts, never mount a Vue component.
const map = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const mission = readFileSync(new URL("./UserMissionView.vue", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");
const css = parse(map).descriptor.styles[0]!.content;

function rule(source: string, selector: string): string {
  const index = source.indexOf(selector + " {");
  expect(index, selector).toBeGreaterThan(-1);
  return source.slice(index, source.indexOf("}", index));
}

describe("all map tabs share an accessible action rail", () => {
  it("reserves Location's bottom-right slot and moves SOS above it on every wide tab", () => {
    expect(rule(css, ".user-map-view__recenter, .user-map-view__share"))
      .toContain("inset-block-end: max(1.25rem, env(safe-area-inset-bottom, 0px));");
    expect(css).toContain(".user-map-view__share { inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 7rem); }");
    expect(rule(css, ".user-map-view__canvas :deep(.maplibregl-ctrl-top-right)"))
      .toContain("inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 10.5rem);");
    expect(rule(shell, ".app-shell--map:has(.user-map-view) .sos-fab.sos-fab"))
      .toContain("inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 3.5rem);");
    expect(css).not.toContain(".user-map-view--mission-idle .user-map-view__recenter");
    // A 48px target (3rem) gets 8px of clearance to the next row.
    expect(3.5 - 3).toBe(.5);
  });

  it("uses two non-overlapping 48px rows at phone widths, including short landscape", () => {
    const phone = css.slice(css.indexOf("@media (max-width: 599px) {"));
    expect(rule(phone, ".user-map-view__recenter"))
      .toContain("inset-block-end: calc(.75rem + env(safe-area-inset-bottom, 0px));");
    expect(rule(phone.slice(phone.indexOf("/* Search/Location are the lower row;")), ".user-map-view__share"))
      .toContain("inset-block-end: calc(4.25rem + env(safe-area-inset-bottom, 0px));");
    expect(rule(phone, ".user-map-view__search-action"))
      .toContain("inset-inline-start: calc(4.25rem + env(safe-area-inset-right, 0px));");
    expect(phone).toContain("right: calc(7.75rem + env(safe-area-inset-right, 0px));");
    expect(rule(shell, ".app-shell--map .sos-fab.sos-fab"))
      .toContain("inset-block-end: calc(4.25rem + env(safe-area-inset-bottom, 0px));");
    expect(phone).not.toContain("@media (max-width: 599px) and (max-height: 360px)");
    expect(7.75 * 16 + 48 + .75 * 16).toBeLessThan(320);
  });

  it("tracks both trip sheets without covering SOS, Search or the canvas", () => {
    expect(css).toContain("--bb-map-action-sheet-height: var(--bb-map-point-sheet-height, 48dvh);");
    expect(css).toContain("--bb-map-action-sheet-height: var(--bb-map-navigation-sheet-height, 15rem);");
    expect(css).toContain("bottom: calc(var(--bb-map-action-sheet-height) + .5rem);");
    expect(css).toContain("bottom: calc(var(--bb-map-action-sheet-height) + 4rem);");
    expect(shell).toContain(".app-shell--map:has(.user-map-view--route-preview) .sos-fab.sos-fab");
    expect(shell).toContain(".app-shell--map:has(.user-map-view--navigating) .sos-fab.sos-fab");
    expect(css).toContain(".user-map-view--mission-active.user-map-view--mission-steps");
    expect(mission).toContain(".mission-desk--active.mission-desk--steps-visible .mission-desk__map-focus,");
  });

  it("keeps tablet controls on the full-screen map and wide History clear of its right rail", () => {
    const tablet = css.slice(css.indexOf("@media (min-width: 600px) and (max-width: 1023px) {", css.indexOf("/* Tablet map controls")));
    expect(tablet).toContain("position: fixed; inset: 0; z-index: 1; display: block;");
    expect(tablet).toContain("position: absolute; inset: 0; width: 100%; height: 100%;");
    expect(tablet).toContain("width: min(25rem, calc(50vw - 1.5rem));");
    expect(tablet).toContain("max-height: calc((100dvh - 8rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) / 2);");
    const missionTablet = parse(mission).descriptor.styles[0]!.content;
    expect(missionTablet).toContain("width: min(30rem, calc(50vw - 1.5rem - env(safe-area-inset-left, 0px)));");
    expect(missionTablet).toContain("margin: calc(50dvh + 1.75rem + env(safe-area-inset-top, 0px)) 0 0 calc(1rem + env(safe-area-inset-left, 0px));");
    expect(rule(css, ".user-map-view__playback"))
      .toContain("inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 14.5rem);");
    expect(14.5 - 10.5 - 3).toBeGreaterThanOrEqual(.5);
    const descriptor = parse(map).descriptor;
    expect(compileTemplate({ filename: "UserMapView.vue", id: "map-rail", source: descriptor.template!.content }).errors).toEqual([]);
    expect(compileStyle({ filename: "UserMapView.vue", id: "map-rail", scoped: true, source: css }).errors).toEqual([]);
  });
});
