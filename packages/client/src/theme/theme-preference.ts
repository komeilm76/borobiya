export const THEME_STORAGE_KEY = "borobiya:theme";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export interface ThemeStorageReader {
  getItem(key: string): string | null;
}

export interface ThemeStorageWriter {
  setItem(key: string, value: string): void;
}

function getBrowserStorage(): (ThemeStorageReader & ThemeStorageWriter) | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function readThemePreference(storage?: ThemeStorageReader): ThemePreference {
  try {
    return parseThemePreference((storage ?? getBrowserStorage())?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function writeThemePreference(preference: ThemePreference, storage?: ThemeStorageWriter): void {
  try {
    (storage ?? getBrowserStorage())?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Theme selection still works for this session when browser storage is blocked or full.
  }
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}
