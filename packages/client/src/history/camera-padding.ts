/** The playback controls live beside the map on wide screens, but outside it in the narrow flow. */
export function historyCameraPadding(compact: boolean): { top: number; bottom: number; left: number; right: number } {
  return compact
    ? { top: 24, bottom: 24, left: 24, right: 24 }
    : { top: 96, bottom: 168, left: 72, right: 72 };
}
