import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { RouteChoice } from "@/api/mission-routing";
import { useMissionRouteGeometry } from "./mission-route-geometry";

describe("mission route map geometry snapshot", () => {
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
