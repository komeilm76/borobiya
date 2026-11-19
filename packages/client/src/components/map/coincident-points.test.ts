import { describe, expect, it } from "vitest";
import type { Marker } from "maplibre-gl";
import { spreadCoincidentPoints } from "./coincident-points";

function fakeMarker(lng: number, lat: number) {
  let offset: [number, number] = [0, 0];
  return { getLngLat: () => ({ lng, lat }), setOffset(next: [number, number]) { offset = next; },
    get offset() { return offset; } };
}

describe("coincident map points", () => {
  it("leaves an isolated marker anchored at its coordinate", () => {
    const one = fakeMarker(51.4, 35.7);
    spreadCoincidentPoints([one as unknown as Marker]);
    expect(one.offset).toEqual([0, 0]);
  });
  it("separates overlapping controls and restores their offsets when a member moves", () => {
    const one = fakeMarker(51.4, 35.7), two = fakeMarker(51.4, 35.7);
    spreadCoincidentPoints([one, two] as unknown as Marker[]);
    expect(one.offset).not.toEqual(two.offset);
    expect(Math.hypot(one.offset[0] - two.offset[0], one.offset[1] - two.offset[1])).toBeGreaterThanOrEqual(44);
    spreadCoincidentPoints([one] as unknown as Marker[]);
    expect(one.offset).toEqual([0, 0]);
  });
  it("keeps every 44px hit target distinct for four points and multiple rings", () => {
    for (const count of [4, 6, 10]) {
      const peers = Array.from({ length: count }, () => fakeMarker(51, 35));
      spreadCoincidentPoints(peers as unknown as Marker[]);
      for (let i = 0; i < peers.length; i++) for (let j = i + 1; j < peers.length; j++) {
        const a = peers[i]!.offset, b = peers[j]!.offset;
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThanOrEqual(44);
      }
    }
  });
  it("keeps a private GPS marker on its true position and outside the other hit targets", () => {
    const gps = fakeMarker(51, 35), peers = Array.from({ length: 9 }, () => fakeMarker(51, 35));
    spreadCoincidentPoints(peers as unknown as Marker[], [gps as unknown as Marker]);
    expect(gps.offset).toEqual([0, 0]);
    expect(new Set(peers.map((marker) => marker.offset.join(","))).size).toBe(9);
    expect(peers.every((marker) => Math.hypot(...marker.offset) >= 44)).toBe(true);
    const elsewhere = fakeMarker(52, 36);
    spreadCoincidentPoints([elsewhere] as unknown as Marker[], [gps as unknown as Marker]);
    expect(elsewhere.offset).toEqual([0, 0]);
  });
});
