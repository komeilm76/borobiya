import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = (path: string) => parse(read(path)).descriptor.styles[0]!.content;
const radius = "border-radius: var(--bb-map-action-radius";

function rule(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("}", start));
}

describe("floating map action shape", () => {
  it("uses the legend's rounded-square shape for user, mission and dispatch controls", () => {
    const shell = read("../styles/tailwind.css");
    expect(rule(shell, ".app-shell--map")).toContain("--bb-map-action-radius: var(--bb-radius-nested);");
    expect(rule(shell, ".app-shell--map :is(.sos-fab.sos-fab)")).toContain(`${radius});`);
    expect(rule(css("../App.vue"), ".app-general-share")).toContain(radius);

    const user = css("./_user/UserMapView.vue");
    expect(rule(user, ".user-map-view__recenter, .user-map-view__share")).toContain(radius);
    expect(rule(user, ".user-map-view__search-action")).toContain(radius);

    const mission = css("./_user/UserMissionView.vue");
    for (const selector of [".mission-desk__legend-action", ".mission-desk__info-action"]) {
      const anchored = mission.indexOf(`${selector} { position: absolute;`);
      expect(anchored).toBeGreaterThan(-1);
      expect(mission.slice(anchored, mission.indexOf("}", anchored))).toContain(radius);
    }
    expect(rule(mission, ".mission-desk__map-focus :deep(.v-btn)")).toContain(radius);

    const admin = css("./_admin/AdminDispatchView.vue");
    expect(rule(admin, ".admin-dispatch__legend-toggle")).toContain(radius);

    const canvas = css("../components/map/MapCanvas.vue");
    for (const selector of [
      ".map-canvas--action-compass :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-group:not(:empty))",
      ".map-canvas--action-compass :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass)"
    ]) expect(rule(canvas, selector)).toContain(radius);
    expect(rule(css("../components/shell/NetworkStatusIcon.vue"), ".network-status-icon__button"))
      .toContain(radius);

    for (const path of ["./_user/UserMapView.vue", "./_user/UserMissionView.vue",
      "./_admin/AdminDispatchView.vue", "../components/map/MapCanvas.vue"] ) {
      expect(compileStyle({ filename: path, id: "map-action-shape", scoped: true, source: css(path) }).errors)
        .toEqual([]);
    }
  });

  it("keeps the overlapping-point chooser beside the map action rail at every width", () => {
    const admin = css("./_admin/AdminDispatchView.vue");
    expect(rule(admin, ".dispatch-map-choices")).toContain("width: min(17rem, calc(100% - 44px - 2.75rem));");
    expect(rule(admin, ".admin-dispatch__map-and-actions .dispatch-map-choices"))
      .toContain("right: calc(44px + 2rem);");
    const phone = admin.slice(admin.lastIndexOf("@media (max-width: 900px) {"));
    expect(rule(phone, ".admin-dispatch__map-and-actions .dispatch-map-choices"))
      .not.toContain("right:");
  });
});
