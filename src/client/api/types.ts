import type { MissionStatus, Role, SosStatus } from '@shared/protocol.ts';

/** A user as returned by authentication and profile endpoints. */
export interface UserView {
  id: string;
  username: string;
  role: Role;
  isActive: boolean;
  securityReady: boolean;
  mustCompleteSecurityQuestions: boolean;
  readyForMission: boolean;
  averageRating: number;
  createdAt: number;
}

/** One incident type from the catalog. */
export interface IncidentTypeView {
  id: string;
  label: string;
  icon: string;
  color: string;
  rank?: number;
}

/** One cancellation reason from the catalog. */
export interface CancellationReasonView {
  id: string;
  label: string;
  requiresText: boolean;
}

/** A catalog-backed security question. */
export interface SecurityQuestionView {
  id: string;
  label: string;
}

/** A saved place owned by the signed-in user. */
export interface SavedPlaceView {
  id: string;
  name: string;
  label: string;
  latitude: number;
  longitude: number;
  address: string;
  icon: string;
  rank: number;
}

/** A bounded live or historical location share. */
export interface ShareView {
  /** Primary key as the API returns it; also the value the revoke endpoint takes. */
  id: string;
  ownerId: string;
  recipientId: string;
  ownerUsername?: string;
  recipientUsername?: string;
  kind: 'live' | 'history';
  durationSeconds?: number;
  expiresAt: number | null;
  historyFrom?: number | null;
  historyTo?: number | null;
  createdAt: number;
  revokedAt?: number | null;
}

/** An SOS request as shown to requesters, responders and administrators. */
export interface SosView {
  id: string;
  /** Tracking number as the server serializes it: an integer, not a string. */
  trackingCode: number;
  requesterId: string;
  requesterUsername?: string | null;
  incidentTypeId: string;
  incidentLabel: string;
  incidentIcon?: string | null;
  incidentColor?: string | null;
  severity: 'low' | 'medium' | 'high';
  description: string;
  photoDataUrl?: string | null;
  latitude: number;
  longitude: number;
  accuracy: number;
  isManual: boolean;
  assignedGroupId?: string | null;
  assignedResponderId?: string | null;
  status: SosStatus;
  cancellationReasonId?: string | null;
  createdAt: number;
  updatedAt: number;
  mission?: MissionView | null;
  /** Only the detail endpoint attaches the audit trail; the list omits it. */
  timeline?: TimelineEntry[];
}

/** One entry in the SOS timeline. */
interface TimelineEntry {
  action: string;
  fromStatus: string;
  toStatus: string;
  note?: string | null;
  createdAt: number;
  actorUsername?: string;
}

/** A responder mission. */
export interface MissionView {
  id: string;
  sosId: string;
  trackingCode: number;
  responderId: string;
  requesterId: string;
  incidentLabel: string;
  status: MissionStatus;
  rating?: number | null;
  ratingNote?: string | null;
  createdAt: number;
  updatedAt: number;
}

/** A live fix for a peer shown on the map. */
export interface LiveFixView {
  userId: string;
  username?: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  recordedAt: number;
}

/** Vector map configuration returned by the public API. */
export interface MapConfigView {
  center: { latitude: number; longitude: number };
  /** Initial zoom level; the field is not named `zoom`. */
  defaultZoom: number;
  bounds: number[];
  minZoom: number;
  maxZoom: number;
  tileSize: number;
  tileTemplate: string;
  offline: boolean;
  attribution: string;
  dataVersion: string;
}

/** Administrator overview payload. */
export interface OverviewView {
  kpis: Record<string, number>;
  /** Requests per day for the last week, oldest first. */
  trend: Array<{ day: string; count: number }>;
  /** Count keyed by SOS status, not an array. */
  statusCounts: Record<string, number>;
  recentRequests: Array<{
    id: string;
    status: SosStatus;
    severity: string;
    incidentLabel: string;
    requesterUsername: string;
    createdAt: number;
  }>;
  groups: GroupView[];
  alerts: AlertView[];
}

/** One responder entry in the admin "nearest responders" result. */
export interface NearestResponderView {
  id: string;
  username: string;
  averageRating: number;
  readyForMission: boolean;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  recordedAt: number | null;
}

/** A service group. */
export interface GroupView {
  id: string;
  name: string;
  color: string;
  capacity: number;
  status: string;
  incidentIds: string[];
  memberCount: number;
  coverageCount: number;
  /** Responders who may receive a dispatch for this group. */
  memberIds?: string[];
}

/** An operational alert. */
export interface AlertView {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'danger';
  message: string;
  createdAt: number;
  resolvedAt: number | null;
  resolvedBy: string | null;
}

/** A paged administrator user record. */
export interface AdminUserView {
  id: string;
  username: string;
  role: Role;
  /** Whether the account may sign in; the administrator routes call it `active`. */
  active: boolean;
  securityReady: boolean;
  mustCompleteSecurityQuestions: boolean;
  readyForMission: boolean;
  averageRating: number;
  sessionCount: number;
  online: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A system setting row. */
export interface SettingView {
  key: string;
  value: string;
  updatedAt: number;
}

/** An audit-log row. */
export interface AuditEntryView {
  id: number;
  actorId: string | null;
  actorUsername: string | null;
  action: string;
  target: string;
  ip: string;
  meta: Record<string, unknown>;
  createdAt: number;
}

/** One active device session, as `GET /_user/devices` returns it. */
export interface SessionView {
  /** Session identifier, and the value the revoke endpoint takes. */
  sessionId: string;
  deviceId: string;
  deviceName: string;
  ip: string;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
  /** True for the session making the request: it cannot be revoked from here. */
  isCurrentDevice: boolean;
  isOnline: boolean;
}

/** A paged list envelope. */
export interface ListView<T> {
  items: T[];
  total?: number;
  page?: number;
  limit?: number;
}
