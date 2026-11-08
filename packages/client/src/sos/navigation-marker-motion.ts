export type NavigationMarkerPose = { lon: number; lat: number; bearing: number };

// Match the map's guidance camera duration and easing so the arrow does not
// slide away from the camera's followed position between GPS samples.
export const NAVIGATION_MOTION_MS = 850;
export function navigationMotionEase(t: number): number { return t * (2 - t); }

function separationMetres(a: NavigationMarkerPose, b: NavigationMarkerPose): number {
  const north = (b.lat - a.lat) * 111_195;
  const east = (b.lon - a.lon) * 111_195 * Math.cos(a.lat * Math.PI / 180);
  return Math.hypot(north, east);
}

function poseBetween(from: NavigationMarkerPose, to: NavigationMarkerPose, fraction: number): NavigationMarkerPose {
  const t = navigationMotionEase(fraction);
  const turn = ((to.bearing - from.bearing + 540) % 360) - 180;
  return {
    lon: from.lon + (to.lon - from.lon) * t,
    lat: from.lat + (to.lat - from.lat) * t,
    bearing: (from.bearing + turn * t + 360) % 360
  };
}

/** Animate only the displayed private marker, never the fix used by route safety,
 * arrival, rerouting or telemetry. There is no dead reckoning beyond the latest fix. */
export function createNavigationMarkerMotion(paint: (pose: NavigationMarkerPose) => void,
  schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancel: (id: number) => void = cancelAnimationFrame,
  now: () => number = () => performance.now()) {
  let current: NavigationMarkerPose | null = null;
  let from: NavigationMarkerPose | null = null;
  let target: NavigationMarkerPose | null = null;
  let startedAt = 0;
  let lastFixAt: number | null = null;
  let frame: number | null = null;
  let generation = 0;

  function stopFrame(): void {
    generation++;
    if (frame !== null) cancel(frame);
    frame = null;
  }
  function reset(): void {
    stopFrame();
    current = from = target = null;
    lastFixAt = null;
  }
  function move(next: NavigationMarkerPose, smooth: boolean): void {
    // A route/overlay watcher can repaint the same GPS fix several times. Do not
    // restart the animation or make an old sample look newly received.
    if (smooth && target && next.lon === target.lon && next.lat === target.lat && next.bearing === target.bearing) return;
    const at = now();
    const gap = lastFixAt === null ? Infinity : at - lastFixAt;
    const displayed = from && target ? poseBetween(from, target,
      Math.max(0, Math.min(1, (at - startedAt) / NAVIGATION_MOTION_MS))) : current;
    stopFrame();
    current = displayed;
    lastFixAt = at;
    // A big GPS correction, a resumed tab or a mode/accuracy change must snap;
    // drawing a long fictitious travel segment would be misleading.
    if (!smooth || !displayed || gap < 0 || gap > 2500 || separationMetres(displayed, next) > 120) {
      current = target = next;
      from = null;
      paint(next);
      return;
    }
    from = displayed;
    target = next;
    startedAt = at;
    const run = generation;
    const step = (timestamp: number): void => {
      if (run !== generation || !from || !target) return;
      frame = null;
      const fraction = Math.max(0, Math.min(1, (timestamp - startedAt) / NAVIGATION_MOTION_MS));
      current = fraction >= 1 ? target : poseBetween(from, target, fraction);
      paint(current);
      if (fraction < 1) frame = schedule(step);
      else from = null;
    };
    frame = schedule(step);
  }
  return { move, reset };
}
