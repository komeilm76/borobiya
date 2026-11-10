import type { MapPosition } from "@/map/overlay-sync";
import type { PlaybackFrame } from "./playback";

/** Camera-fit identity includes visible geometry and canvas size, not only timestamps.
 * Two history reads may have identical timestamps/counts but different positions, and a
 * resize may change the useful map corridor without changing phone/tablet breakpoints.
 */
export function historyCameraKey(
  frames: readonly PlaybackFrame[],
  bounds: [MapPosition, MapPosition] | null,
  padding: ReturnType<typeof historyCameraPadding>,
  viewport: { width: number; height: number }
): string {
  const first = frames[0];
  const last = frames[frames.length - 1];
  return JSON.stringify([
    first?.ms, last?.ms, frames.length, bounds,
    first?.lon, first?.lat, padding, viewport.width, viewport.height
  ]);
}

/** Reserve space for the controls that actually cover each map layout. */
export function historyCameraPadding(compact: boolean, phoneHeight?: number): { top: number; bottom: number; left: number; right: number } {
  if (phoneHeight !== undefined) {
    // A full-screen phone map has an app rail and dock/SOS over its edges. Scale the
    // clearance on short/landscape viewports so the track retains a useful center.
    return {
      top: Math.min(128, Math.floor(phoneHeight * 0.28)),
      bottom: Math.min(152, Math.floor(phoneHeight * 0.32)),
      left: 24,
      right: 24
    };
  }
  return compact
    ? { top: 24, bottom: 24, left: 24, right: 24 }
    : { top: 96, bottom: 168, left: 72, right: 72 };
}
