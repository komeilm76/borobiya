import { describe, expect, it } from "vitest";
import type { GeocodeResult } from "@shared/index";
import { resultCameraPadding, resultExtent, resultMarkerOffsets } from "./search-result-markers";

const place = (placeId: string, lon: number, lat: number): GeocodeResult =>
  ({ placeId, lon, lat, name: placeId, address: "street", type: "place" });

describe("map search result geometry", () => {
  it("fits all and only the current results, including one/zero-result cases", () => {
    expect(resultExtent([])).toBeNull();
    expect(resultExtent([place("one", 51.4, 35.7)])).toEqual([[51.4, 35.7], [51.4, 35.7]]);
    expect(resultExtent([place("a", 51.4, 35.7), place("b", 51.3, 35.8)])).toEqual([[51.3, 35.7], [51.4, 35.8]]);
  });
  it("keeps distinct coordinates at their actual positions", () => {
    expect([...resultMarkerOffsets([place("a", 51.4, 35.7), place("b", 51.3, 35.8)])]).toEqual([
      ["a", [0, 0]], ["b", [0, 0]]
    ]);
  });
  it("spreads exact-coordinate duplicates without moving the true camera extent", () => {
    const hits = Array.from({ length: 5 }, (_, i) => place(String(i), 51.4, 35.7));
    const offsets = resultMarkerOffsets(hits);
    expect(offsets.size).toBe(5);
    expect(new Set([...offsets.values()].map(([x, y]) => `${x}:${y}`)).size).toBe(5);
    expect(resultExtent(hits)).toEqual([[51.4, 35.7], [51.4, 35.7]]);
  });
  it("reserves phone header and dock space without squeezing short screens to zero", () => {
    for (const [w, h] of [[320, 400], [360, 640], [568, 320]]) {
      const p = resultCameraPadding(w, h, true);
      expect(p.top).toBeGreaterThanOrEqual(70);
      expect(p.bottom).toBeGreaterThanOrEqual(95);
      expect(h - p.top - p.bottom).toBeGreaterThan(70);
      expect(w - p.left - p.right).toBeGreaterThan(200);
    }
    expect(resultCameraPadding(1280, 800, false).left).toBeGreaterThan(350);
    expect(resultCameraPadding(800, 480, false)).toEqual({ top: 48, bottom: 48, left: 48, right: 48 });
  });
});
