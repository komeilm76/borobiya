import { tryOnScopeDispose } from "@vueuse/core";
import { palettes } from "@/styles/tokens";
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

function applyDocumentTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor = palettes[theme].background;
  root.style.color = palettes[theme].text;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = palettes[theme].background;
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
