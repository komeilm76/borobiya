type RouteLine = readonly (readonly [number, number])[];

/** Show every proposed route during preview; guidance keeps only the chosen line. */
export function pointRouteFeatures(routes: readonly RouteLine[], selected: number, navigating: boolean) {
  return routes.flatMap((coordinates, index) => navigating && index !== selected ? [] : [{
    type: "Feature" as const,
    properties: { index, selected: index === selected },
    geometry: { type: "LineString" as const, coordinates }
  }]);
}

/** Geographic bounds of the supplied route lines. */
export function pointRouteExtent(routes: readonly RouteLine[]): [[number, number], [number, number]] | null {
  if (!routes.length) return null;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const route of routes) for (const [lon, lat] of route) {
    west = Math.min(west, lon); east = Math.max(east, lon);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  return Number.isFinite(west) ? [[west, south], [east, north]] : null;
}

/** For route review, zoom as far as possible while keeping the selected path and the
 * exact requested start/destination visible. Other alternatives remain selectable on the map. */
export function pointRouteSelectionExtent(route: RouteLine, start: readonly [number, number] | null,
  destination: readonly [number, number]): [[number, number], [number, number]] | null {
  return pointRouteExtent([route, start ? [start, destination] : [destination]]);
}

/** An idle/styledata event must also remove a route that was cleared while the style
 * was not loaded. Checking only for *missing* active layers leaves ghost lines behind. */
export function pointRouteOverlayNeedsSync(active: boolean, selectedLayer: boolean, alternativeLayer: boolean,
  source: boolean): boolean {
  return active ? !selectedLayer || !alternativeLayer || !source : selectedLayer || alternativeLayer || source;
}

/** Fit above the actual on-screen sheet, while leaving at least 64 px of map on a short display. */
export function pointRouteOverviewBottom(map: { top: number; bottom: number; height: number },
  sheet: { top: number; bottom: number } | null): number {
  const covered = sheet && sheet.top < map.bottom && sheet.bottom > map.top
    ? Math.max(0, map.bottom - Math.max(sheet.top, map.top)) : 0;
  return Math.min(Math.max(48, map.height - 112), Math.max(56, covered + 16));
}

/** Fit around the measured sheet: side cards should not compress the route vertically.
 * Only treat it as a side card if at least 30% / 240px of the map remains beside it. */
export function pointRouteOverviewPadding(map: { left: number; right: number; width: number; top: number; bottom: number; height: number },
  sheet: { left: number; right: number; top: number; bottom: number } | null) {
  const base = { top: 48, bottom: pointRouteOverviewBottom(map, sheet), left: 36, right: 36 };
  if (!sheet || sheet.top >= map.bottom || sheet.bottom <= map.top ||
    sheet.left >= map.right || sheet.right <= map.left) return { ...base, bottom: 56 };
  const sideRoom = Math.max(240, map.width * .3);
  const freeLeft = sheet.left - map.left;
  const freeRight = map.right - sheet.right;
  const maxSidePadding = Math.max(48, map.width - 112);
  if (freeLeft >= sideRoom)
    return { ...base, bottom: 56, right: Math.min(maxSidePadding, Math.max(36, map.right - sheet.left + 16)) };
  if (freeRight >= sideRoom)
    return { ...base, bottom: 56, left: Math.min(maxSidePadding, Math.max(36, sheet.right - map.left + 16)) };
  return base;
}
