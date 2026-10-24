/**
 * The realtime event names, in a module that imports nothing.
 *
 * `services/socket.ts` cannot be imported cheaply — it pulls `socket.io-client` with it, which is
 * ~50 kB of transport code. A view that only needs to *name* an event (or a test that needs the
 * constant) should not pay for the client, and a static import of the client would keep the map view's
 * chunk from loading lazily. So the names live here and `socket.ts` re-exports them.
 */
export const LOCATION_UPDATE_EVENT = "location:update";
export const PEER_UPDATE_EVENT = "location:peer-update";
export const SHARE_ENDED_EVENT = "location:share-ended";
export const SOS_NEW_REQUEST_EVENT = "sos:new-request";
export const SOS_PROPOSAL_RECEIVED_EVENT = "sos:proposal-received";
export const MISSION_STATUS_UPDATED_EVENT = "mission:status-updated";
export const MISSION_SUBSCRIBE_EVENT = "mission:subscribe";
export const MISSION_CANCELLED_BY_RESCUER_EVENT = "mission:cancelled-by-rescuer";
export const MISSION_CANCELLED_BY_REQUESTER_EVENT = "mission:cancelled-by-requester";
