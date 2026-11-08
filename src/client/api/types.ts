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
  shareId: string;
  ownerId: string;
  recipientId: string;
  kind: 'live' | 'history';
  expiresAt: number | null;
  createdAt: number;
}

/** An SOS request as shown to requesters, responders and administrators. */
export interface SosView {
  id: string;
  trackingCode: string;
  requesterId: string;
  requesterUsername?: string;
  incidentTypeId: string;
  incidentLabel: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  photoDataUrl?: string | null;
  latitude: number;
  longitude: number;
  accuracy: number;
  status: SosStatus;
  cancellationReasonId?: string | null;
  stageIndex?: number;
  createdAt: number;
  updatedAt: number;
  mission?: MissionView | null;
  timeline: TimelineEntry[];
}

/** One entry in the SOS timeline. */
export interface TimelineEntry {
  action: string;
  fromStatus: string;
  toStatus: string;
  note?: string | null;
  createdAt: number;
}

/** A responder mission. */
export interface MissionView {
  id: string;
  sosId: string;
  responderId: string;
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
  zoom: number;
  bounds: number[];
  minZoom: number;
  maxZoom: number;
  tileTemplate: string;
  offline: boolean;
  attribution: string;
  dataVersion: string;
}

/** Administrator overview payload. */
export interface OverviewView {
  kpis: Record<string, number>;
  trend: Array<{ label: string; value: number }>;
  statuses: Array<{ status: string; count: number }>;
  recent: SosView[];
  seriesColors: string[];
  generatedAt: number;
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
}

/** An operational alert. */
export interface AlertView {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'danger';
  message: string;
  meta: Record<string, unknown>;
  createdAt: number;
  resolvedAt: number | null;
}

/** A paged administrator user record. */
export interface AdminUserView {
  id: string;
  username: string;
  role: Role;
  isActive: boolean;
  securityReady: boolean;
  readyForMission: boolean;
  averageRating: number;
  createdAt: number;
  lastLoginAt?: number | null;
  activeSessions?: number;
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

/** A device/session row for the profile screen. */
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
