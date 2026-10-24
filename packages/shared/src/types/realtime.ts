import type { LocationUpdate } from "../schemas/location";
import type {
  MissionLocationEvent, MissionLocationPublish, MissionStatusUpdatedEvent,
  RequesterCancellationEvent, RescuerCancellationEvent, SosNewRequestEvent,
  SosProposalAcceptedEvent, SosProposalReceivedEvent
} from "../schemas/sos";

/** Application Socket.IO events only. `connect`, `disconnect`, etc. are Socket.IO reserved events. */
export interface LocationUpdateAck {
  ok: boolean;
  status: "accepted" | "rejected";
  code?: string;
  message?: string;
  peers?: string[];
  retryAfterMs?: number;
}
export type MissionLocationAck = LocationUpdateAck | {
  ok: false; status: "rejected"; code: "MISSION_UNAVAILABLE"; message: string
};
export type MissionJoinAck = { ok: true } | { ok: false;
  code: "INVALID_MISSION" | "MISSION_UNAVAILABLE" | "UNAUTHORIZED" | "SERVICE_UNAVAILABLE" };

export interface ClientToServerEvents {
  // An acknowledgement is required by the typed client API so .timeout() can add its leading
  // `(error, response)` parameter. The server still treats an untrusted client omitting it safely.
  "location:update": (payload: LocationUpdate, ack: (response: LocationUpdateAck) => void) => void;
  "mission:subscribe": (payload: { missionId: string }, ack: (response: MissionJoinAck) => void) => void;
  "mission:location-publish": (payload: MissionLocationPublish, ack: (response: MissionLocationAck) => void) => void;
}

export interface PeerLocationEvent {
  userId: string;
  lat: number;
  lon: number;
  accuracy: number | null;
  timestamp: string;
}
export interface ShareEndedEvent {
  shareId: string;
  userId: string;
  reason: "revoked" | "expired";
}
export interface ServerToClientEvents {
  "location:peer-update": (payload: PeerLocationEvent) => void;
  "location:share-ended": (payload: ShareEndedEvent) => void;
  "sos:new-request": (payload: SosNewRequestEvent) => void;
  "sos:proposal-received": (payload: SosProposalReceivedEvent) => void;
  "sos:proposal-accepted": (payload: SosProposalAcceptedEvent) => void;
  "mission:status-updated": (payload: MissionStatusUpdatedEvent) => void;
  "mission:location": (payload: MissionLocationEvent) => void;
  "mission:cancelled-by-requester": (payload: RequesterCancellationEvent) => void;
  /** Admins receive additional location/review fields; participants receive only the common fields. */
  "mission:cancelled-by-rescuer": (payload: RescuerCancellationEvent) => void;
}
