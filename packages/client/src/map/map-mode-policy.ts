export type MapMode = "missions" | "trips" | "sharing" | "history";

/** Navigation restrictions for the future single map workspace. Mission state wins
 * if a late server confirmation overlaps an outgoing trip transition. Offers live
 * outside the disabled Missions tab, so they remain receivable during a trip. */
export function mapModeAvailability(
  tripNavigating: boolean, missionActive: boolean, assignmentVerified = true
): Record<MapMode, boolean> {
  return {
    missions: missionActive || !tripNavigating,
    // An unverified read is not a confirmed assignment. Trips remains
    // browsable; the map separately blocks creating a route until verified.
    trips: !missionActive,
    sharing: true,
    history: !missionActive && !tripNavigating && assignmentVerified
  };
}
