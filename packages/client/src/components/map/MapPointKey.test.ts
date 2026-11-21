import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// The legend is checked without mounting a Vue component (docs/TASKS.md).
const source = readFileSync(new URL("./MapPointKey.vue", import.meta.url), "utf8");
const mission = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;

describe("map legend matches plotted points", () => {
  it("shows a circular private GPS crosshair, not the destination pin, in Mission", () => {
    expect(mission).toContain('<MapPointKey :kinds="[\'sos\', \'start\', \'stop\', \'helper\', \'requester\', \'director\']" show-gps />');
    expect(template!.content).toContain('v-if="showGps"');
    expect(template!.content).toContain('bb-point-key__gps');
    expect(template!.content).toContain('mdi-crosshairs-gps');
    expect(styles[0]!.content).toContain('.bb-point-key__gps { display: inline-grid');
    expect(styles[0]!.content).toContain('border-radius: 50%');
    expect(compileTemplate({ source: template!.content, filename: "MapPointKey.vue", id: "point-key" }).errors).toEqual([]);
    expect(compileStyle({ source: styles[0]!.content, filename: "MapPointKey.vue", id: "point-key", scoped: true }).errors).toEqual([]);
  });
});
