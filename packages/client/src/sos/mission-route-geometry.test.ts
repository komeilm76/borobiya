import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { RouteChoice } from "@/api/mission-routing";
import { useMissionRouteGeometry } from "./mission-route-geometry";

describe("mission route map geometry snapshot", () => {
  it("keeps a date-line-crossing route short in both its camera bounds and painted line", () => {
    const selected = ref<RouteChoice | null>({ polyline: "across" } as RouteChoice);
    const decode = vi.fn((): [number, number][] => [[179.8, 7], [179.95, 7.02], [-179.9, 7.04], [-179.8, 7.05]]);
    const snapshot = useMissionRouteGeometry(selected, decode);
    const bounds = snapshot.value.bounds!;
    expect(bounds[0][0]).toBeCloseTo(179.8);
    expect(bounds[1][0]).toBeCloseTo(180.2);
    expect(bounds[1][0] - bounds[0][0]).toBeCloseTo(.4);
    const points = snapshot.value.data.features[0]!.geometry.coordinates;
    expect(points[0]![0]).toBeCloseTo(179.8);
    expect(points[2]![0]).toBeCloseTo(180.1);
    expect(points[3]![0]).toBeCloseTo(180.2);
    expect(decode).toHaveBeenCalledTimes(1);
  });
  it("decodes once for camera bounds and GeoJSON across repeat map-style restorations", () => {
    const first = { polyline: "first" } as RouteChoice;
    const second = { polyline: "second" } as RouteChoice;
    const selected = ref<RouteChoice | null>(first);
    const decode = vi.fn((): [number, number][] => [[51, 35], [53, 34], [52, 36]]);
    const snapshot = useMissionRouteGeometry(selected, decode);
    expect(snapshot.value.bounds).toEqual([[51, 34], [53, 36]]);
    expect(snapshot.value.data.features[0]?.geometry.coordinates).toEqual(decode.mock.results[0]?.value);
    snapshot.value.data;
    snapshot.value.bounds;
    expect(decode).toHaveBeenCalledTimes(1);
    selected.value = second;
    expect(snapshot.value.data.features).toHaveLength(1);
    expect(decode).toHaveBeenCalledTimes(2);
    selected.value = null;
    expect(snapshot.value.bounds).toBeNull();
    expect(snapshot.value.data.features).toEqual([]);
    expect(decode).toHaveBeenCalledTimes(2);
  });
});
