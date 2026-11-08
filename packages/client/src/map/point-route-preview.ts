type RouteLine = readonly (readonly [number, number])[];
type RouteFix = { lat: number; lon: number; accuracy: number | null };

function segmentMetres(a: readonly [number, number], b: readonly [number, number]): number {
  const lonScale = Math.cos((a[1] + b[1]) * Math.PI / 360);
  return Math.hypot((b[0] - a[0]) * lonScale, b[1] - a[1]) * 111_195;
}

/** Project a reliable GPS fix onto the selected line, never onto a distant or weak fix.
 * At a crossing, prefer the earlier leg rather than prematurely claiming the later one. */
export function pointRouteProgress(line: RouteLine, fix: RouteFix | null): number | null {
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lon) ||
    fix.accuracy === null || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 35 ||
    line.length < 2) return null;
  const scale = Math.cos(fix.lat * Math.PI / 180);
  let distance = 0, closest = Infinity, progress: number | null = null;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!;
    const dx = (b[0] - a[0]) * scale, dy = b[1] - a[1];
    const length2 = dx * dx + dy * dy;
    const x = (fix.lon - a[0]) * scale, y = fix.lat - a[1];
    const fraction = length2 ? Math.max(0, Math.min(1, (x * dx + y * dy) / length2)) : 0;
    const separation = Math.hypot(x - fraction * dx, y - fraction * dy) * 111_195;
    const length = segmentMetres(a, b);
    // A loop can cross itself; sub-accuracy differences are not evidence that
    // the user has already traveled the later leg. Favor the earlier segment.
    if (length > 0 && separation < closest - Math.max(2, fix.accuracy / 2)) {
      closest = separation;
      progress = distance + length * fraction;
    }
    distance += length;
  }
  return closest <= Math.max(25, fix.accuracy + 15) ? progress : null;
}

/** GPS jitter, weak fixes and an outage must not turn traveled road back into remaining road. */
export function advanceRouteProgress(line: RouteLine, fix: RouteFix | null, completedMetres: number): number {
  const next = pointRouteProgress(line, fix);
  return next !== null && next > completedMetres + 1 ? next : completedMetres;
}

function splitRoute(line: RouteLine, distance: number): { completed: RouteLine | null; remaining: RouteLine | null } {
  const total = line.reduce((sum, point, i) => i ? sum + segmentMetres(line[i - 1]!, point) : 0, 0);
  if (distance <= 1 || total <= 0) return { completed: null, remaining: line };
  if (distance >= total - 1) return { completed: line, remaining: null };
  let passed = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!;
    const length = segmentMetres(a, b);
    if (length === 0) continue;
    if (distance > passed + length) { passed += length; continue; }
    const fraction = (distance - passed) / length;
    if (fraction >= 1 - 1e-9) return { completed: line.slice(0, i + 1), remaining: line.slice(i) };
    const junction: readonly [number, number] = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
    return { completed: [...line.slice(0, i), junction], remaining: [junction, ...line.slice(i)] };
  }
  return { completed: line, remaining: null };
}

/** Preview shows all alternatives; active guidance renders traveled and remaining selected segments separately. */
export function pointRouteFeatures(routes: readonly RouteLine[], selected: number, navigating: boolean, completedMetres = 0) {
  const feature = (coordinates: RouteLine, index: number, completed = false) => ({
    type: "Feature" as const,
    properties: { index, selected: index === selected, completed },
    geometry: { type: "LineString" as const, coordinates }
  });
  return routes.flatMap((coordinates, index) => {
    if (navigating && index !== selected) return [];
    if (!navigating || !Number.isFinite(completedMetres) || completedMetres <= 1 || coordinates.length < 2)
      return [feature(coordinates, index)];
    const { completed, remaining } = splitRoute(coordinates, completedMetres);
    return [...(completed ? [feature(completed, index, true)] : []),
      ...(remaining ? [feature(remaining, index, false)] : [])];
  });
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
  completedLayer: boolean, source: boolean): boolean {
  return active ? !selectedLayer || !alternativeLayer || !completedLayer || !source :
    selectedLayer || alternativeLayer || completedLayer || source;
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
