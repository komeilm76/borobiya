import { tryOnScopeDispose } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useSystemTheme } from "../composables/useSystemTheme";
import {
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference
} from "../theme/theme-preference";

const THEME_COLORS: Record<ResolvedTheme, { background: string; foreground: string }> = {
  light: { background: "#f4f7f6", foreground: "#193536" },
  dark: { background: "#111c1d", foreground: "#edf5f2" }
};

function applyDocumentTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor = THEME_COLORS[theme].background;
  root.style.color = THEME_COLORS[theme].foreground;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = THEME_COLORS[theme].background;
}

export const useThemeStore = defineStore("app-theme", () => {
  const preference = ref<ThemePreference>(readThemePreference());
  const systemPrefersDark = useSystemTheme();
  const resolvedTheme = computed(() => resolveTheme(preference.value, systemPrefersDark.value));
  const isDark = computed(() => resolvedTheme.value === "dark");
  const vuetifyThemeName = computed(() => isDark.value ? "borobiyaDark" : "borobiyaLight");

  watch(resolvedTheme, applyDocumentTheme, { immediate: true, flush: "sync" });

  function setPreference(nextPreference: ThemePreference): void {
    preference.value = nextPreference;
    writeThemePreference(nextPreference);
  }

  function toggleTheme(): void {
    setPreference(isDark.value ? "light" : "dark");
  }

  if (typeof window !== "undefined") {
    const syncStoragePreference = (event: StorageEvent): void => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      preference.value = event.key === THEME_STORAGE_KEY ? parseThemePreference(event.newValue) : "system";
    };
    window.addEventListener("storage", syncStoragePreference);
    tryOnScopeDispose(() => window.removeEventListener("storage", syncStoragePreference));
  }

  return {
    preference,
    resolvedTheme,
    isDark,
    vuetifyThemeName,
    setPreference,
    toggleTheme
  };
});
