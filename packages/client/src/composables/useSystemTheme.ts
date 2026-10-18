import { usePreferredDark } from "@vueuse/core";

/** Exposes the OS theme preference; persisted app-wide theme selection lands in T1.5.3. */
export function useSystemTheme() {
  return usePreferredDark();
}
