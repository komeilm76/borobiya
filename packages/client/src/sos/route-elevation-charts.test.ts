import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { RouteChoice } from "@/api/mission-routing";
import { useRouteElevationCharts } from "./route-elevation-charts";

const choice = { elevation: { profile: [{ distance_m: 0, elevation_m: 10 }, { distance_m: 100, elevation_m: 20 }] } } as RouteChoice;

describe("mission route chart work", () => {
  it("builds each chart once per changed routes/profile, not on unrelated renders", () => {
    const routes = ref<RouteChoice[]>([choice, choice]);
    const profile = ref<"car" | "foot" | "bicycle">("car");
    const builder = vi.fn(() => ({ line: "line", area: "area", range: "range", description: "description" }));
    const charts = useRouteElevationCharts(routes, profile, builder);
    expect(charts.value).toEqual([null, null]);
    expect(builder).not.toHaveBeenCalled();
    profile.value = "foot";
    expect(charts.value).toHaveLength(2);
    expect(builder).toHaveBeenCalledTimes(2);
    expect(charts.value[0]?.description).toBe("description");
    expect(builder).toHaveBeenCalledTimes(2); // five template fields must use the same snapshot
    routes.value = [choice];
    expect(charts.value).toHaveLength(1);
    expect(builder).toHaveBeenCalledTimes(3);
    profile.value = "car";
    expect(charts.value).toEqual([null]);
  });
});
