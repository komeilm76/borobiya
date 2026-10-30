import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileStyle, parse } from "vue/compiler-sfc";
import { describe, expect, it } from "vitest";
import { palettes } from "./tokens";

const clientSrc = fileURLToPath(new URL("../", import.meta.url));

function contrast(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((index) => {
      const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [bright, dim] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (bright! + 0.05) / (dim! + 0.05);
}

function overWhite(surface: string, opacity: number): string {
  return `#${[1, 3, 5].map((index) =>
    Math.round(parseInt(surface.slice(index, index + 2), 16) * opacity + 255 * (1 - opacity))
      .toString(16).padStart(2, "0")
  ).join("")}`;
}

function compiledStyles(file: string): string {
  const path = join(clientSrc, file);
  const { descriptor } = parse(readFileSync(path, "utf8"), { filename: path });
  return descriptor.styles.map((style) =>
    compileStyle({ source: style.content, filename: path, id: "data-v-audit", scoped: style.scoped }).code
  ).join("\n");
}

function darkTextColor(css: string, selector: string): string {
  const target = `:root.dark ${selector}`;
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!block[1]!.split(",").map((part) => part.trim()).includes(target)) continue;
    const color = block[2]!.match(/(?:^|;)\s*color:\s*(#[0-9a-f]{6})\s*;/i)?.[1];
    if (color) return color;
  }
  throw new Error(`Missing compiled dark text color for ${target}`);
}

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? vueFiles(path) : entry.name.endsWith(".vue") ? [path] : [];
  });
}

// Source-level CSS compilation only: do not mount Vue components in unit tests.
describe("dark selectors in scoped Vue styles", () => {
  it("keeps every dark override attached to its target after Vue compiles :global()", () => {
    let checked = 0;
    for (const file of vueFiles(clientSrc)) {
      const { descriptor } = parse(readFileSync(file, "utf8"), { filename: file });
      for (const style of descriptor.styles.filter((part) => part.scoped && part.content.includes(":root.dark"))) {
        // Vue drops the descendant in `:global(:root.dark) .label` and emits
        // `:root.dark { color: ... }`, leaving the label in its light palette.
        expect(style.content, file).not.toMatch(/:global\(:root\.dark\)\s+[^,{]+/);
        const targets = [...style.content.matchAll(/:global\((:root\.dark [^)]+)\)/g)]
          .map((match) => match[1]!);
        const compiled = compileStyle({ source: style.content, filename: file, id: "data-v-audit", scoped: true });
        expect(compiled.errors, file).toEqual([]);
        expect(compiled.code, file).not.toMatch(/:root\.dark\s*\{/);
        for (const selector of targets) {
          expect(compiled.code, `${file}: ${selector}`).toContain(selector);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(64);
  });

  it("gives the reported headings and adjacent small text at least 4.5:1 dark contrast", () => {
    const page = palettes.dark.background;
    const card = palettes.dark.surface;
    // A white map tile beneath a 94% opaque map overlay is its lightest backdrop.
    const mapCard = overWhite(card, 0.94);
    for (const [file, selector, background] of [
      ["views/_user/UserDashboardView.vue", ".user-dashboard h1", page],
      ["views/_user/UserDashboardView.vue", ".user-dashboard__card-header h2", card],
      ["views/_user/UserDashboardView.vue", ".user-dashboard__feature-card h2", card],
      ["views/_user/UserDashboardView.vue", ".user-dashboard__note-card h2", card],
      ["views/_user/UserDashboardView.vue", ".user-dashboard__welcome", page],
      ["components/sharing/LiveBroadcastBar.vue", ".broadcast-bar__headline", card],
      ["components/sharing/LiveBroadcastBar.vue", ".broadcast-bar__detail", card],
      ["components/map/OwnPositionBar.vue", ".own-position__headline", mapCard],
      ["components/map/OwnPositionBar.vue", ".own-position__detail", mapCard],
      ["components/map/OwnPositionBar.vue", ".own-position__note", mapCard],
      ["components/map/HistoryPlaybackPanel.vue", ".history-playback", mapCard],
      ["components/map/HistoryPlaybackPanel.vue", ".history-playback__title-block p", mapCard],
      ["components/map/LiveCompanionPanel.vue", ".live-companions__title-block h2", mapCard],
      ["components/map/LiveCompanionPanel.vue", ".live-companions__status", mapCard]
    ]) {
      const foreground = darkTextColor(compiledStyles(file!), selector!);
      expect(contrast(foreground, background!), `${file}: ${selector}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
