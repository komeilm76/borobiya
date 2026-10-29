import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { palettes } from "@/styles/tokens";

// CSS/contrast at the unit seam; .vue components are deliberately not mounted in this workspace.
const live = readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8");
const rating = readFileSync(new URL("./MissionRatingPanel.vue", import.meta.url), "utf8");
const timeline = readFileSync(new URL("./MissionTimelinePanel.vue", import.meta.url), "utf8");
const missionView = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");

function luminance(hex: string): number {
  const channel = (i: number) => {
    const n = parseInt(hex.slice(i, i + 2), 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("mission member and rating controls contrast", () => {
  it("does not use light-only green for small live/rating labels on a dark card", () => {
    expect(contrast("#16826c", palettes.dark.surface)).toBeLessThan(4.5); // original 3.18:1
    for (const mode of ["light", "dark"] as const) {
      expect(contrast(palettes[mode].primary, palettes[mode].surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(live).toMatch(/\.live-panel__eyebrow\s*\{[^}]*color:\s*rgb\(var\(--v-theme-primary\)\)/);
    expect(rating).toMatch(/\.rating__eyebrow\s*\{[^}]*color:\s*rgb\(var\(--v-theme-primary\)\)/);
  });

  it("uses theme ink for the small status-timeline eyebrow in light and dark cards", () => {
    expect(contrast("#167f69", palettes.dark.surface)).toBeLessThan(4.5);
    for (const mode of ["light", "dark"] as const) {
      expect(contrast(palettes[mode].primary, palettes[mode].surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(timeline).toMatch(/\.timeline__eyebrow\s*\{[^}]*color:\s*rgb\(var\(--v-theme-primary\)\)/);
  });

  it("does not fade future mission-stage text below 4.5:1 on light cards", () => {
    const blend = (hex: string, base: string, alpha: number) => "#" + [1, 3, 5].map((i) =>
      Math.round(parseInt(hex.slice(i, i + 2), 16) * alpha + parseInt(base.slice(i, i + 2), 16) * (1 - alpha))
        .toString(16).padStart(2, "0")).join("");
    const oldTint = blend("#6f8a82", palettes.light.surface, 0.09);
    expect(contrast(blend(palettes.light.text, oldTint, 0.6), oldTint)).toBeLessThan(4.5);
    for (const theme of ["light", "dark"] as const) {
      const tint = blend("#6f8a82", palettes[theme].surface, 0.09);
      expect(contrast(palettes[theme].text, tint)).toBeGreaterThanOrEqual(4.5);
    }
    expect(missionView).toMatch(/\.mission-steps__item \{[^}]*color: rgb\(var\(--v-theme-on-surface\)\);[^}]*\}/);
    expect(missionView).not.toMatch(/\.mission-steps__item \{[^}]*opacity: \.6;/);
    expect(missionView).toContain(".mission-steps__item--reached { background:");
  });

  it("keeps star controls, saved stars and their borders distinguishable in both themes", () => {
    const lightStar = "#915800";
    expect(contrast(lightStar, palettes.light.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palettes.dark.secondary, palettes.dark.surface)).toBeGreaterThanOrEqual(4.5);
    for (const mode of ["light", "dark"] as const) {
      expect(contrast(palettes[mode].muted, palettes[mode].surface)).toBeGreaterThanOrEqual(3);
    }
    expect(rating).toMatch(/\.rating__choice\s*\{[^}]*border: 1px solid var\(--bb-color-muted\);[^}]*color: #915800;/);
    expect(rating).toMatch(/\.rating__saved span\s*\{[^}]*color: #915800;/);
    expect(rating).toMatch(/:global\(:root\.dark\) \.rating__choice,[\s\S]*?:global\(:root\.dark\) \.rating__saved span\s*\{\s*color: var\(--bb-color-secondary\);/);
    expect(rating).toContain(".rating__choice:focus-within { outline: 3px solid #26977b;");
    expect(rating).toContain(".rating__fieldset:disabled .rating__choice { opacity: .5;");
  });
});
