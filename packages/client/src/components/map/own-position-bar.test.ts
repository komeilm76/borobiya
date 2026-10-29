import { readFileSync } from "node:fs";
import { compileStyle, parse } from "vue/compiler-sfc";
import { describe, expect, it } from "vitest";
import { ownPositionTone } from "@/map/own-position";

const bar = readFileSync(new URL("./OwnPositionBar.vue", import.meta.url), "utf8");

describe("private map position bar (no Vue mount)", () => {
  it("distinguishes off, waiting, active and error without confusing GPS display with broadcast", () => {
    expect(ownPositionTone(null, false, null)).toBe("idle");
    expect(ownPositionTone(null, true, null)).toBe("warn");
    expect(ownPositionTone({ lat: 35.7, lon: 51.4, accuracy: null }, true, null)).toBe("active");
    expect(ownPositionTone(null, false, "GPS denied")).toBe("error");
    expect(ownPositionTone(null, true, "GPS unavailable")).toBe("error");
  });

  it("keeps map and privacy controls wired while following the broadcast bar hierarchy", () => {
    expect(bar).toContain('class="own-position bb-floating-card"');
    expect(bar).toContain('elevation="2" rounded="xl"');
    expect(bar).toContain('class="own-position__indicator" aria-hidden="true"');
    expect(bar).toContain('class="own-position__copy"');
    expect(bar).toContain('class="own-position__actions"');
    expect(bar).toContain('<h2 class="own-position__headline">موقعیت من</h2>');
    expect(bar).toContain('ownPositionLabel(api.position.value, api.active.value, api.error.value)');
    expect(bar).toContain('نمایش موقعیت، اشتراک‌گذاری را فعال نمی‌کند');
    expect(bar).toContain(':disabled="!ready"');
    expect(bar).toContain("emit('start')");
    expect(bar).toContain('api.stop()');
    expect(bar).toContain("emit('center')");
    expect(bar).toContain('v-if="api.position.value && ready"');
    expect(bar).toContain('role="status" aria-live="polite"');
  });

  it("compiles dark text and card-width actions with accessible small targets", () => {
    const { descriptor } = parse(bar);
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "OwnPositionBar.vue", id: "data-v-own", scoped: true });
    expect(css.errors).toEqual([]);
    expect(css.code).toContain(":root.dark .own-position__headline");
    expect(css.code).toContain(":root.dark .own-position__detail");
    expect(css.code).toContain(":root.dark .own-position__note");
    expect(css.code).toMatch(/@container \(max-width: 380px\)[\s\S]*?\.own-position__actions\[data-v-own\]\s*\{[^}]*grid-column: 1 \/ -1;/);
    expect(css.code).toMatch(/\.own-position__actions\[data-v-own\] \.v-btn\s*\{[^}]*min-height: 44px;/);
  });
});
