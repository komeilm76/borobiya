import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appShell = readFileSync(new URL("./App.vue", import.meta.url), "utf8");
const lightStyle = JSON.parse(readFileSync(new URL("../../../map-server/styles/light.json", import.meta.url), "utf8"));
const darkStyle = JSON.parse(readFileSync(new URL("../../../map-server/styles/dark.json", import.meta.url), "utf8"));

describe("OpenStreetMap attribution", () => {
  it("keeps a visible, linked OSM attribution and ODbL information in the app footer", () => {
    expect(appShell).toContain("© OpenStreetMap contributors");
    expect(appShell).toContain('href="https://www.openstreetmap.org/copyright"');
    expect(appShell).toContain("Open Database License (ODbL)");
    expect(appShell).toContain("class=\"osm-attribution\"");
  });

  it("keeps clickable OpenStreetMap attribution in both MapLibre styles", () => {
    for (const style of [lightStyle, darkStyle]) {
      const attribution = style.sources.tehran.attribution as string;
      expect(attribution).toContain("©");
      expect(attribution).toContain("OpenStreetMap contributors");
      expect(attribution).toContain("https://www.openstreetmap.org/copyright");
    }
  });
});
