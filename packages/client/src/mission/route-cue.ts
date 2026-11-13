export interface MissionRouteCueInputs {
  blocked: boolean;
  routeError: boolean;
  navigationError: boolean;
  navigationActive: boolean;
  freshFix: boolean;
  targetLoading: boolean;
  routeLoading: boolean;
  hasRoute: boolean;
  hasTarget: boolean;
}

/** A compact map label, not an assertion that the rescuer is on the planned route. */
export function missionRouteCue(state: MissionRouteCueInputs): { label: string; tone: "normal" | "ready" | "warning" } {
  if (state.blocked) return { label: "نیاز به تأیید", tone: "warning" };
  if (state.routeError || state.navigationError) return { label: "نیاز به بررسی", tone: "warning" };
  if (state.navigationActive) return state.freshFix ?
    { label: "راهبری GPS", tone: "ready" } : { label: "در انتظار GPS", tone: "warning" };
  if (state.targetLoading) return { label: "دریافت محل", tone: "normal" };
  if (state.routeLoading) return { label: "محاسبهٔ مسیر", tone: "normal" };
  if (state.hasRoute) return { label: "مسیر آماده", tone: "ready" };
  if (state.hasTarget) return { label: "دریافت مسیر", tone: "normal" };
  return { label: "محل نامشخص", tone: "warning" };
}
