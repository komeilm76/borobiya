/**
 * One typed protocol shared by the Vue browser client and the Bun server.
 * Both sides import this module directly; there is no generated client stub and no duplicated enum.
 */

/** Product version advertised by the health endpoint and the OpenAPI document. */
export const APP_VERSION = '2.0.0';

/** Account roles understood by authentication, routing and dispatch. */
export const ROLES = Object.freeze({
  USER: 'user',
  RESPONDER: 'responder',
  ADMIN: 'admin'
} as const);

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Canonical SOS request lifecycle states. */
export const SOS_STATUS = Object.freeze({
  PENDING: 'pending',
  DISPATCHED: 'dispatched',
  ACCEPTED: 'accepted',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired'
} as const);

export type SosStatus = (typeof SOS_STATUS)[keyof typeof SOS_STATUS];

/** Canonical mission lifecycle states tracked by responders. */
export const MISSION_STATUS = Object.freeze({
  PENDING: 'pending',
  /** Directly assigned by an administrator (Immediate Dispatch); no acceptance step required. */
  ASSIGNED: 'assigned',
  ON_THE_WAY: 'on_the_way',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
} as const);

/** Per-job-type policy for whether non-ready workers may receive mission offers. */
export const OFFER_POLICIES = Object.freeze({
  /** Offers regardless of readiness; accepting flips readiness to ready. */
  ALL: 'all',
  /** Offers only while the worker is on standby. */
  READY_ONLY: 'ready_only'
} as const);

export type OfferPolicy = (typeof OFFER_POLICIES)[keyof typeof OFFER_POLICIES];

export type MissionStatus = (typeof MISSION_STATUS)[keyof typeof MISSION_STATUS];

/** Durable domain events written to the append-only log and replayed to clients. */
export const HTTP_EVENTS = Object.freeze({
  HEALTH: 'health',
  LOCATION_SHARE_CREATED: 'location.share.created',
  LOCATION_SHARE_ENDED: 'location.share.ended',
  PRESENCE_CHANGED: 'presence.changed',
  SOS_CREATED: 'sos.created',
  SOS_DISPATCHED: 'sos.dispatched',
  SOS_ACCEPTED: 'sos.accepted',
  SOS_CANCELLED: 'sos.cancelled',
  MISSION_UPDATED: 'mission.updated',
  ADMIN_ALERT: 'admin.alert',
  SETTINGS_UPDATED: 'settings.updated',
  USER_UPDATED: 'user.updated'
} as const);

/** Realtime envelope types exchanged over the authenticated WebSocket. */
export const WS_EVENTS = Object.freeze({
  HELLO: 'hello',
  EVENT: 'event',
  ACK: 'ack',
  ERROR: 'error',
  SUBSCRIBE: 'subscribe',
  SNAPSHOT: 'snapshot',
  LOCATION_UPDATE: 'location.update',
  LOCATION_PEER: 'location.peer',
  PRESENCE: 'presence',
  TALK_START: 'talk.start',
  TALK_STOP: 'talk.stop',
  TALK_STATE: 'talk.state',
  TALK_AUDIO: 'talk.audio',
  PING: 'ping',
  PONG: 'pong'
} as const);

/** WebSocket close codes used by the hub and the client reconnect policy. */
export const WS_CLOSE = Object.freeze({
  NORMAL: 1000,
  GOING_AWAY: 1001,
  POLICY: 1008,
  TOO_BIG: 1009,
  INTERNAL: 1011,
  AUTH_FAILED: 4401,
  RATE_LIMITED: 4429
} as const);

/** Binary push-to-talk frame layout: version | type | talkId(uint32 BE) | sequence(uint32 BE) | payload. */
export const AUDIO = Object.freeze({
  VERSION: 1,
  TYPE: 1,
  HEADER_BYTES: 10,
  MAX_PAYLOAD_BYTES: 16000,
  HOLD_MS: 30000,
  IDLE_MS: 2000,
  FRAMES_PER_SECOND: 50
} as const);

/** Bounded cache sizes shared by the server caches and the service-worker tile cache. */
export const CACHE = Object.freeze({
  TILE_LIMIT: 512,
  SESSION_LIMIT: 4096,
  TICKET_LIMIT: 8192,
  LIVE_LOCATION_LIMIT: 8192
} as const);

/** A durable event as stored in SQLite and delivered to realtime peers. */
export interface RealtimeEvent {
  id: number;
  type: string;
  payload: unknown;
  audience: string[];
  createdAt: string;
}

