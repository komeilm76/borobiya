export interface HistoryWindowPreview {
  fromLabel: string;
  toLabel: string;
  durationMinutes: number;
  includesFuture: boolean;
}

/** Preview the same ISO instants the history grant will send, not re-parsed local input.
 * A preset can represent one of two repeated DST hours; converting its wall clock back
 * to an instant just for display would silently show the wrong occurrence. */
export function historyWindowPreview(
  window: { from: string; to: string } | null,
  nowMs = Date.now(),
  timeZone?: string
): HistoryWindowPreview | null {
  if (!window) return null;
  const fromMs = Date.parse(window.from);
  const toMs = Date.parse(window.to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return null;
  const zone = timeZone ? { timeZone } : {};
  const formatter = new Intl.DateTimeFormat("fa-IR-u-ca-gregory", {
    dateStyle: "medium",
    timeStyle: "short",
    ...zone
  });
  let fromLabel = formatter.format(fromMs);
  let toLabel = formatter.format(toMs);
  // A clock moved back can give two different instants the exact same local label.
  // Add offsets only in that case so the preview remains readable in ordinary windows.
  if (fromLabel === toLabel) {
    const offsetFormatter = new Intl.DateTimeFormat("en", { timeZoneName: "shortOffset", ...zone });
    const offset = (ms: number) => offsetFormatter.formatToParts(ms).find(({ type }) => type === "timeZoneName")?.value ?? "";
    fromLabel = `${fromLabel} (${offset(fromMs)})`;
    toLabel = `${toLabel} (${offset(toMs)})`;
  }
  return {
    fromLabel,
    toLabel,
    durationMinutes: Math.round((toMs - fromMs) / 60_000),
    includesFuture: toMs > nowMs
  };
}
