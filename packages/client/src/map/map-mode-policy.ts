export type MapMode = "missions" | "trips" | "sharing" | "history";

/** Navigation restrictions for the future single map workspace. Mission state wins
 * if a late server confirmation overlaps an outgoing trip transition. Offers live
 * outside the disabled Missions tab, so they remain receivable during a trip. */
export function mapModeAvailability(tripNavigating: boolean, missionActive: boolean): Record<MapMode, boolean> {
  return {
    missions: missionActive || !tripNavigating,
    trips: !missionActive,
    sharing: true,
    history: !missionActive && !tripNavigating
  };
}
