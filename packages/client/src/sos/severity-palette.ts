import type { Severity } from "@shared/index";

/** One SOS priority language across form, dispatch map/list, and rescuer offers.
 * Marker accents have white-icon contrast; softer surfaces carry readable text.
 * This is incident severity, not the delivery/mission status palette. */
export const SOS_PRIORITY_PALETTE: Record<Severity, {
  accent: string; ink: string; surface: string; darkInk: string; darkSurface: string;
}> = {
  high: { accent: "#dc2626", ink: "#a2241e", surface: "#ffe8e7", darkInk: "#ffadad", darkSurface: "#422b2b" },
  medium: { accent: "#b45309", ink: "#a44900", surface: "#fff1df", darkInk: "#ffca8a", darkSurface: "#49331f" },
  low: { accent: "#075c94", ink: "#075c94", surface: "#e4f3fc", darkInk: "#89d1ff", darkSurface: "#163e56" }
};

/** CSS custom properties inherit into nested labels, so a whole incident uses one priority. */
export function sosPriorityStyle(severity: Severity) {
  const { accent, ink, surface, darkInk, darkSurface } = SOS_PRIORITY_PALETTE[severity];
  return {
    "--sos-priority-accent": accent,
    "--sos-priority-ink": ink,
    "--sos-priority-surface": surface,
    "--sos-priority-dark-ink": darkInk,
    "--sos-priority-dark-surface": darkSurface
  };
}
