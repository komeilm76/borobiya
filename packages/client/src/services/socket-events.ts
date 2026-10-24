/**
 * The realtime event names, in a module that imports nothing.
 *
 * `services/socket.ts` cannot be imported cheaply — it pulls `socket.io-client` with it, which is
 * ~50 kB of transport code. A view that only needs to *name* an event (or a test that needs the
 * constant) should not pay for the client, and a static import of the client would keep the map view's
 * chunk from loading lazily. So the names live here and `socket.ts` re-exports them.
 */
import type { ClientToServerEvents, ServerToClientEvents } from "@shared/index";

export const LOCATION_UPDATE_EVENT = "location:update" satisfies keyof ClientToServerEvents;
export const PEER_UPDATE_EVENT = "location:peer-update" satisfies keyof ServerToClientEvents;
export const SHARE_ENDED_EVENT = "location:share-ended" satisfies keyof ServerToClientEvents;
export const SOS_NEW_REQUEST_EVENT = "sos:new-request" satisfies keyof ServerToClientEvents;
export const SOS_PROPOSAL_RECEIVED_EVENT = "sos:proposal-received" satisfies keyof ServerToClientEvents;
export const MISSION_STATUS_UPDATED_EVENT = "mission:status-updated" satisfies keyof ServerToClientEvents;
export const MISSION_SUBSCRIBE_EVENT = "mission:subscribe" satisfies keyof ClientToServerEvents;
export const MISSION_LOCATION_PUBLISH_EVENT = "mission:location-publish" satisfies keyof ClientToServerEvents;
export const MISSION_LOCATION_EVENT = "mission:location" satisfies keyof ServerToClientEvents;
export const MISSION_CANCELLED_BY_RESCUER_EVENT = "mission:cancelled-by-rescuer" satisfies keyof ServerToClientEvents;
export const MISSION_CANCELLED_BY_REQUESTER_EVENT = "mission:cancelled-by-requester" satisfies keyof ServerToClientEvents;
