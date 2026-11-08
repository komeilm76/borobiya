/** Label for one of the panel's numeric playback speed options. */
export function playbackSpeedLabel(speed: number): string {
  return `${speed.toLocaleString("fa-IR")}×`;
}

/** Start compact at every width; only an explicit shared-history deep link opens the controls. */
export function historyPanelInitiallyOpen(shareQuery: unknown): boolean {
  const shareId = Array.isArray(shareQuery) ? shareQuery[0] : shareQuery;
  return typeof shareId === "string" && shareId.trim().length > 0;
}
