type RouteLine = readonly (readonly [number, number])[];

/** Show every proposed route during preview; guidance keeps only the chosen line. */
export function pointRouteFeatures(routes: readonly RouteLine[], selected: number, navigating: boolean) {
  return routes.flatMap((coordinates, index) => navigating && index !== selected ? [] : [{
    type: "Feature" as const,
    properties: { index, selected: index === selected },
    geometry: { type: "LineString" as const, coordinates }
  }]);
}

/** All alternatives must fit the overview, not only the currently selected one. */
export function pointRouteExtent(routes: readonly RouteLine[]): [[number, number], [number, number]] | null {
  if (!routes.length) return null;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const route of routes) for (const [lon, lat] of route) {
    west = Math.min(west, lon); east = Math.max(east, lon);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  return Number.isFinite(west) ? [[west, south], [east, north]] : null;
}

/** Fit above the actual on-screen sheet, while leaving at least 64 px of map on a short display. */
export function pointRouteOverviewBottom(map: { top: number; bottom: number; height: number },
  sheet: { top: number; bottom: number } | null): number {
  const covered = sheet && sheet.top < map.bottom && sheet.bottom > map.top
    ? Math.max(0, map.bottom - Math.max(sheet.top, map.top)) : 0;
  return Math.min(Math.max(48, map.height - 112), Math.max(56, covered + 16));
}
