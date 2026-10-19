import { usePreferredDark } from "@vueuse/core";

/** Reactive `prefers-color-scheme: dark` signal used when the app preference is `system`. */
export function useSystemTheme() {
  return usePreferredDark();
}
