import { describe, expect, it, vi } from "vitest";
import { createNavigationMarkerMotion, NAVIGATION_MOTION_MS, navigationMotionEase } from "./navigation-marker-motion";

const west = { lon: 51.38, lat: 35.68, bearing: 350 };
const east = { lon: 51.381, lat: 35.68, bearing: 10 };

function harness() {
  let time = 0, nextId = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const paint = vi.fn();
  const motion = createNavigationMarkerMotion(paint,
    (callback) => { const id = ++nextId; pending.set(id, callback); return id; },
    (id) => { pending.delete(id); }, () => time);
  return {
    motion, paint, pending,
    tick(ms: number) {
      time += ms;
      const callbacks = [...pending.values()]; pending.clear();
      for (const callback of callbacks) callback(time);
    }
  };
}

describe("navigation arrow motion", () => {
  it("paints the first fix immediately then interpolates position and the shortest bearing arc", () => {
    const h = harness();
    h.motion.move(west, true);
    expect(h.paint).toHaveBeenLastCalledWith(west);
    h.tick(1000);
    h.motion.move(east, true);
    expect(h.pending.size).toBe(1);
    h.tick(NAVIGATION_MOTION_MS / 2);
    expect(h.paint.mock.lastCall?.[0].lon).toBeGreaterThan(west.lon);
    expect(h.paint.mock.lastCall?.[0].lon).toBeLessThan(east.lon);
    expect(h.paint.mock.lastCall?.[0].bearing).toBeCloseTo(5, 3); // 350° -> 10° via north, not a backwards 340° turn.
    expect(navigationMotionEase(0.5)).toBeGreaterThan(0.5);
    h.tick(NAVIGATION_MOTION_MS / 2);
    expect(h.paint).toHaveBeenLastCalledWith(east);
    expect(h.pending.size).toBe(0);
  });

  it("retargets from the current displayed pose without jumping on a faster GPS fix", () => {
    const h = harness();
    h.motion.move(west, true);
    h.tick(1000);
    h.motion.move(east, true);
    h.tick(250);
    const before = h.paint.mock.lastCall?.[0];
    const next = { lon: 51.3814, lat: 35.68, bearing: 40 };
    h.motion.move(next, true);
    expect(h.paint.mock.lastCall?.[0]).toEqual(before);
    expect(h.pending.size).toBe(1);
    h.tick(NAVIGATION_MOTION_MS);
    expect(h.paint).toHaveBeenLastCalledWith(next);
  });

  it("snaps large, stale or non-guidance changes instead of inventing a long path", () => {
    const h = harness();
    h.motion.move(west, true);
    h.tick(1000);
    h.motion.move(east, true);
    h.tick(100);
    h.motion.move({ ...east, lon: 51.4 }, true); // ~1.7 km GPS jump.
    expect(h.pending.size).toBe(0);
    expect(h.paint.mock.lastCall?.[0].lon).toBe(51.4);
    h.tick(3000);
    h.motion.move({ ...east, lon: 51.4001 }, true); // Long gap in foreground fixes.
    expect(h.pending.size).toBe(0);
    h.tick(1000);
    h.motion.move(east, true);
    h.motion.move({ ...east, bearing: 0 }, false); // Route ended, fix became unreliable or reduced motion.
    expect(h.pending.size).toBe(0);
    expect(h.paint.mock.lastCall?.[0].bearing).toBe(0);
    h.tick(1000);
    expect(h.paint.mock.lastCall?.[0].bearing).toBe(0);
  });

  it("stays smooth when fresh stationary GPS fixes keep the same coordinates", () => {
    const h = harness();
    h.motion.move(west, true, true);
    for (let i = 0; i < 4; i++) {
      h.tick(1000);
      h.motion.move({ ...west }, true, true); // Fresh watchPosition callback, same observed location.
    }
    h.tick(1000);
    h.motion.move(east, true, true);
    expect(h.pending.size).toBe(1); // No multi-second lurch on the first fix after a stop.
    h.tick(NAVIGATION_MOTION_MS);
    expect(h.paint).toHaveBeenLastCalledWith(east);
  });

  it("does not treat a duplicate UI repaint as a fresh GPS fix", () => {
    const h = harness();
    h.motion.move(west, true);
    h.tick(1000);
    h.motion.move(east, true);
    h.tick(3000); // A backgrounded tab only paints the last known fix, not a predicted one.
    h.motion.move(east, true); // Route/overlay repaint of the same fix.
    const next = { ...east, lon: 51.3811 };
    h.motion.move(next, true);
    expect(h.paint).toHaveBeenLastCalledWith(next); // Old sample gap must snap.
    expect(h.pending.size).toBe(0);
  });

  it("cancels pending frames on teardown", () => {
    const h = harness();
    h.motion.move(west, true);
    h.tick(1000);
    h.motion.move(east, true);
    const oldFrame = [...h.pending.values()][0]!;
    h.tick(100);
    h.motion.move(east, true);
    expect(h.pending.size).toBe(1);
    h.motion.reset();
    expect(h.pending.size).toBe(0);
    const calls = h.paint.mock.calls.length;
    oldFrame(2000); // A queued callback already dispatched before cancellation.
    expect(h.paint).toHaveBeenCalledTimes(calls);
    h.motion.move(west, true); // A replacement marker must start at its own fix.
    expect(h.paint).toHaveBeenLastCalledWith(west);
    expect(h.pending.size).toBe(0);
  });
});
