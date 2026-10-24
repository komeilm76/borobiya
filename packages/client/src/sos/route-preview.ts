/** Decode OSRM's polyline5 locally, with strict bounds so malformed routing replies cannot exhaust the UI. */
export function decodeRoutePolyline(encoded: string): [number, number][] {
  if (!encoded || encoded.length > 200_000) throw new Error("INVALID_ROUTE");
  const points: [number, number][] = [];
  let latitude = 0;
  let longitude = 0;
  let index = 0;
  function delta(): number {
    let shift = 0;
    let value = 0;
    while (true) {
      if (index >= encoded.length || shift > 30) throw new Error("INVALID_ROUTE");
      const part = encoded.charCodeAt(index++) - 63;
      if (part < 0 || part > 63) throw new Error("INVALID_ROUTE");
      value += (part & 31) * 2 ** shift;
      shift += 5;
      if (part < 32) break;
    }
    return value & 1 ? -(Math.floor(value / 2) + 1) : Math.floor(value / 2);
  }
  while (index < encoded.length) {
    if (points.length >= 30_000) throw new Error("INVALID_ROUTE");
    latitude += delta();
    longitude += delta();
    const lat = latitude / 1e5;
    const lon = longitude / 1e5;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new Error("INVALID_ROUTE");
    }
    points.push([lon, lat]);
  }
  if (points.length < 2) throw new Error("INVALID_ROUTE");
  return points;
}

export function formatRouteDistance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres).toLocaleString("fa-IR")} متر` :
    `${(metres / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلومتر`;
}
export function formatRouteDuration(seconds: number): string {
  return `${Math.max(1, Math.ceil(seconds / 60)).toLocaleString("fa-IR")} دقیقهٔ تقریبی`;
}
