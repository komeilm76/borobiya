import type { RoutePoint } from "@/api/mission-routing";

/** Copy only a real destination address, never the loading/unavailable text in the sheet. */
export function destinationCopyText(kind: "coordinates" | "address", point: RoutePoint | null,
  address: string | null): string | null {
  if (!point) return null;
  if (kind === "address") return address?.trim() || null;
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) ||
    Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return null;
  return `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`; // Latitude, longitude (WGS84).
}

/** HTTP LAN pages can lack clipboard permission. Return false for a selectable manual fallback. */
export async function tryCopyDestination(text: string, writeText?: (value: string) => Promise<void>): Promise<boolean> {
  if (!writeText) return false;
  try { await writeText(text); return true; }
  catch { return false; }
}
