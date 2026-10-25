/** Keep the map usable on phones; an explicit shared-history deep link opens its controls. */
export function historyPanelInitiallyOpen(narrowViewport: boolean, shareQuery: unknown): boolean {
  const shareId = Array.isArray(shareQuery) ? shareQuery[0] : shareQuery;
  return !narrowViewport || (typeof shareId === "string" && shareId.trim().length > 0);
}
