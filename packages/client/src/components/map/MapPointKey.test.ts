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
    expect(styles[0]!.content).toContain('.bb-point-key__gps { position: relative; display: inline-grid');
    expect(styles[0]!.content).toContain('border-radius: 50%');
    expect(styles[0]!.content).toContain('.bb-point-key__gps::before {');
    expect(compileTemplate({ source: template!.content, filename: "MapPointKey.vue", id: "point-key" }).errors).toEqual([]);
    expect(compileStyle({ source: styles[0]!.content, filename: "MapPointKey.vue", id: "point-key", scoped: true }).errors).toEqual([]);
  });

  it("matches Dispatch's wide, outlined pin and centered small glyph without changing map markers", () => {
    const admin = readFileSync(new URL("../../views/_admin/AdminDispatchView.vue", import.meta.url), "utf8");
    const css = styles[0]!.content;
    expect(admin).toContain('flex: 0 0 46px; width: 46px; height: 48px;');
    expect(css).toContain('flex: 0 0 46px; width: 46px; height: 48px;');
    expect(css).toContain('top: 8px; left: 7px;');
    expect(css).toContain('width: 27px; height: 27px; border: 2px solid #fff;');
    expect(css).toContain('transform: scale(1, 1.1) rotate(-45deg);');
    expect(css).toContain('top: 6px; left: 5px; display: grid; place-items: center;');
    expect(css).toContain('width: 31px; height: 31px; font: 800 14px/1');
    expect(css).toContain('background: var(--bb-pin, #1468c9)');
    expect(template!.content).toContain('class="bb-point-key__pin"');
    expect(template!.content).toContain('class="bb-point-key__glyph"');
    expect(template!.content).toContain('v-if="MAP_POINT_META[kind].icon"');
    expect(template!.content).toContain("kind === 'stop' ? '۱' : MAP_POINT_META[kind].glyph");
    expect(template!.content).not.toContain('class="bb-map-point__sign"');
    expect(css).not.toContain('.bb-map-point__sign {');
    expect(css).toContain('@media (forced-colors: active)');
  });
});
