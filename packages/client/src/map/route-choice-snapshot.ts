// A route card previews its line on the map before the user accepts it.
// Restore the previous choice only if the same route batch still exists: GPS,
// transport changes, and reconnects can replace the alternatives while open.
export function previousRouteIndex<Route>(
  snapshot: { routes: readonly Route[]; index: number } | null,
  routes: readonly Route[],
): number | null {
  return snapshot?.routes === routes && Number.isInteger(snapshot.index) &&
    snapshot.index >= 0 && snapshot.index < routes.length ? snapshot.index : null;
}
