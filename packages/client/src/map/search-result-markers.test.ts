import { describe, expect, it } from "vitest";
import type { GeocodeResult } from "@shared/index";
import { groupSearchResults, mapLabelShift, nextClusterZoom, resultCameraPadding, resultExtent } from "./search-result-markers";

const place = (placeId: string, lon: number, lat: number): GeocodeResult =>
  ({ placeId, lon, lat, name: placeId, address: "street", type: "place" });
const project = (place: GeocodeResult) => ({ x: place.lon, y: place.lat });

describe("map search result geometry", () => {
  it("fits all and only the current results, including one/zero-result cases", () => {
    expect(resultExtent([])).toBeNull();
    expect(resultExtent([place("one", 51.4, 35.7)])).toEqual([[51.4, 35.7], [51.4, 35.7]]);
    expect(resultExtent([place("a", 51.4, 35.7), place("b", 51.3, 35.8)])).toEqual([[51.3, 35.7], [51.4, 35.8]]);
  });
  it("groups only nearby compact pins using projected screen pixels, not just identical coordinates", () => {
    const hits = [place("a", 0, 0), place("b", 48, 20), place("c", 420, 200)];
    expect(groupSearchResults(hits, project).map(group => group.map(hit => hit.placeId)))
      .toEqual([["a", "b"], ["c"]]);
    expect(groupSearchResults(hits, p => ({ x: p.lon * 3, y: p.lat * 3 })).map(group => group.map(hit => hit.placeId)))
      .toEqual([["a"], ["b"], ["c"]]);
  });
  it("keeps diagonally separate pin targets visible", () => {
    const hits = [place("a", 0, 0), place("b", 50, 50)];
    expect(groupSearchResults(hits, project).map(group => group.length)).toEqual([1, 1]);
  });
  it("does not group vertically separated pins even when they share a longitude", () => {
    const hits = [place("a", 0, 0), place("b", 0, 80)];
    expect(groupSearchResults(hits, project).map(group => group.length)).toEqual([1, 1]);
  });
  it("respects an explicitly enlarged footprint without changing the compact default", () => {
    const hits = [place("a", 0, 0), place("b", 120, 10)];
    expect(groupSearchResults(hits, project).map(group => group.length)).toEqual([1, 1]);
    expect(groupSearchResults(hits, project, 240, 64)).toEqual([hits]);
  });
  it("groups exact-coordinate duplicates at every zoom, but never drops or duplicates a result", () => {
    const hits = Array.from({ length: 30 }, (_, i) => place(`p-${i}`, 51.4, 35.7));
    const groups = groupSearchResults(hits, project);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(hits);
    expect(resultExtent(groups[0]!)).toEqual([[51.4, 35.7], [51.4, 35.7]]);
  });
  it("merges collision chains even when neighboring groups would otherwise cover each other", () => {
    const hits = [place("a", 0, 0), place("b", 60, 0), place("c", 120, 0)];
    expect(groupSearchResults(hits, project)).toEqual([hits]);
  });
  it("zooms progressively within map limits, then hands overlapping hits to the chooser", () => {
    expect(nextClusterZoom(8, 16)).toBe(10);
    expect(nextClusterZoom(15.2, 16)).toBe(16);
    expect(nextClusterZoom(16, 16)).toBeNull();
    expect(nextClusterZoom(15.99, 16)).toBeNull();
    expect(nextClusterZoom(16, 15)).toBeNull();
    expect(nextClusterZoom(NaN, 16)).toBeNull();
    expect(nextClusterZoom(8, Infinity)).toBeNull();
  });
  it("keeps centered names inside the clipped map canvas at either edge", () => {
    expect(mapLabelShift(40, 280, 0, 320)).toBe(0);
    expect(mapLabelShift(-100, 140, 0, 320)).toBe(108);
    expect(mapLabelShift(240, 480, 0, 320)).toBe(-168);
    expect(mapLabelShift(60, 100, 50, 130)).toBe(0);
    // A pathological overwide label cannot fit: center its unavoidable overflow.
    expect(mapLabelShift(-40, 360, 0, 320)).toBe(0);
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
