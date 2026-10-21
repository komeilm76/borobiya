import { describe, expect, it, vi } from "vitest";
import {
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeThemePreference
} from "./theme-preference";

function createStorage(initialValue: string | null = null) {
  let value = initialValue;
  return {
    getItem: vi.fn((_key: string) => value),
    setItem: vi.fn((_key: string, nextValue: string) => { value = nextValue; })
  };
}

describe("app theme preference", () => {
  it("accepts only the supported preference values", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("sepia")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
  });

  it("defaults to system and reads a saved preference from the app storage key", () => {
    const storage = createStorage();
    expect(readThemePreference(storage)).toBe("system");
    writeThemePreference("dark", storage);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(THEME_STORAGE_KEY, "dark");
    expect(readThemePreference(storage)).toBe("dark");
  });

  it("resolves system preference reactively while honoring explicit light and dark choices", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("continues with the system preference if browser storage is unavailable", () => {
    const failingStorage = {
      getItem: vi.fn(() => { throw new Error("storage blocked"); }),
      setItem: vi.fn(() => { throw new Error("storage blocked"); })
    };

    expect(readThemePreference(failingStorage)).toBe("system");
    expect(() => writeThemePreference("dark", failingStorage)).not.toThrow();
  });
});
