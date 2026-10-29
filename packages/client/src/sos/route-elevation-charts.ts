import { computed, type Ref } from "vue";
import type { RouteChoice, TransportProfile } from "@/api/mission-routing";
import { buildElevationChart } from "./elevation-chart";

/** Prepare chart geometry once per route/profile change, never per template field or GPS repaint. */
export function useRouteElevationCharts(routes: Ref<RouteChoice[]>, profile: Ref<TransportProfile>,
  build: typeof buildElevationChart = buildElevationChart) {
  return computed(() => routes.value.map((choice) => profile.value === "car"
    ? null : build(choice.elevation?.profile)));
}
