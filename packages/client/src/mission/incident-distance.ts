type Position = { lat: number; lon: number };

/** Approximate great-circle distance, NOT remaining road distance or verified route progress.
 * Caller must supply a current, non-stale fix; a saved route origin is not suitable. */
export function incidentDistanceMetres(fix: Position | null, incident: Position | null): number | null {
  if (!fix || !incident || [fix.lat, fix.lon, incident.lat, incident.lon].some((n) => !Number.isFinite(n)) ||
      Math.abs(fix.lat) > 90 || Math.abs(incident.lat) > 90 ||
      Math.abs(fix.lon) > 180 || Math.abs(incident.lon) > 180) return null;
  const radians = Math.PI / 180;
  const latDifference = (incident.lat - fix.lat) * radians;
  const lonDifference = (incident.lon - fix.lon) * radians;
  const haversine = Math.sin(latDifference / 2) ** 2 +
    Math.cos(fix.lat * radians) * Math.cos(incident.lat * radians) * Math.sin(lonDifference / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
}
