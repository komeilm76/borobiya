import type { PlaybackFrameData } from "./playback";
import { planOverlayRemoval, planOverlaySync, type OverlayMapState, type OverlayOp, type OverlayStyle } from "@/map/overlay-sync";

/**
 * Playback's slice of the overlay planner (T2.2.6).
 *
 * The rules live in `@/map/overlay-sync`, because live companion markers (T2.1.8) need the identical
 * ones and two copies of an ordering rule is how one overlay ends up painted over the other. What is
 * playback-specific is the name of each collection, so the planner here is a lookup.
 */

/** One maplibre call the plan asks for, re-exported so the view types its executor without naming maplibre. */
export type PlaybackOp = OverlayOp;

/** The maplibre surface the planner needs, re-exported for the same reason. */
export type PlaybackMapState = OverlayMapState;

/** The one coupling between the descriptor and the frame: which source carries which collection. */
const DATA_BY_SOURCE: Record<string, keyof PlaybackFrameData> = {
  "borobiya-history": "trace",
  "borobiya-history-played": "played",
  "borobiya-history-head": "head"
};

export function planPlaybackSync(state: PlaybackMapState, style: OverlayStyle, frame: PlaybackFrameData): PlaybackOp[] {
  return planOverlaySync(state, style, (sourceId) => frame[DATA_BY_SOURCE[sourceId] ?? "trace"]);
}

/** What to run when the view unmounts, so leaving the map does not leave two dead sources on it. */
export function planPlaybackRemoval(state: PlaybackMapState, style: OverlayStyle): PlaybackOp[] {
  return planOverlayRemoval(state, style);
}
