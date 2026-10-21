import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const bootScript = readFileSync(fileURLToPath(new URL("../../public/theme-init.js", import.meta.url)), "utf8");

function runThemeInit(savedPreference: string | null, systemPrefersDark: boolean) {
  const classes = new Set<string>();
  const root = {
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
    classList: {
      toggle(name: string, enabled: boolean) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    }
  };
  const themeColor = { content: "#f4f7f6" };

  runInNewContext(bootScript, {
    window: {
      localStorage: { getItem: () => savedPreference },
      matchMedia: () => ({ matches: systemPrefersDark })
    },
    document: {
      documentElement: root,
      querySelector: () => themeColor
    }
  });

  return { classes, root, themeColor };
}

describe("pre-paint theme initialization", () => {
  it("applies the system dark theme before the app bundle runs", () => {
    const { classes, root, themeColor } = runThemeInit(null, true);

    expect(classes.has("dark")).toBe(true);
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(root.style.backgroundColor).toBe("#111c1d");
    expect(themeColor.content).toBe("#111c1d");
  });

  it("lets a saved light preference override the dark system setting", () => {
    const { classes, root, themeColor } = runThemeInit("light", true);

    expect(classes.has("dark")).toBe(false);
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
    expect(themeColor.content).toBe("#f4f7f6");
  });
});
