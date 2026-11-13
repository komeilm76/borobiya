import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileTemplate, parse } from "vue/compiler-sfc";

const page = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");

// Do not mount Vue SFCs in unit tests (docs/TASKS.md).
describe("mission guidance distance presentation", () => {
  it("only reads the fresh navigation fix and the private current mission target", () => {
    expect(page).toContain('incidentDistanceMetres(navigation.fix.value, routing.target.value?.incident ?? null)');
    expect(page).toContain('const incidentDistance = computed(');
    expect(page).not.toContain('incidentDistanceMetres(routing.from.value'); // Planned origin is not current GPS.
    expect(page).toContain('v-if="incidentDistance !== null"');
    expect(page).toContain('فاصلهٔ مستقیم تقریبی تا محل حادثه');
    expect(page).toContain('مسیر برنامه‌ریزی‌شده');
    expect(page).toContain('زمان رسیدن زنده در دسترس نیست');
    expect(page).toContain('aria-live="off"'); // Do not announce every GPS update.
    const compiled = compileTemplate({ filename: "UserMissionView.vue", id: "mission-distance", source: parse(page).descriptor.template!.content });
    expect(compiled.errors).toEqual([]);
  });
  it("preserves active Stop and shows the current distance on short screens", () => {
    expect(page).toContain('@click="stopGuidance">توقف راهبری</v-btn>');
    expect(page).toContain('.mission-desk__guidance--active .mission-desk__planned-distance {');
    expect(page).not.toContain('.mission-desk__guidance--active .mission-desk__guidance-copy small {\n    position: absolute;');
  });
});
