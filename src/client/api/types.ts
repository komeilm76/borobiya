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

/** One offline point of interest from the map configuration. */
export interface MapPoiView {
  id: string;
  name: string;
  kind: string;
  latitude: number;
  longitude: number;
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

/** One row of the caller's login history (successful and failed attempts). */
export interface LoginEventView {
  id: number;
  ip: string;
  deviceName: string | null;
  success: boolean;
  loginAt: number;
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
  /** Present when the list endpoint is called with include=all; absent otherwise. */
  state?: 'active' | 'expired' | 'revoked';
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

/** A user as returned by the recipient picker (`GET /_user/users/search`). */
export interface UserSearchView {
  id: string;
  username: string;
  role: Role;
  readyForMission: boolean;
  averageRating: number;
  online: boolean;
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
  /** Offline points of interest the search can offer; absent on older servers. */
  pois?: MapPoiView[];
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
  averageRating: number | null;
  readyForMission: boolean | null;
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
  jobTypeId: string | null;
  jobTypeLabel: string | null;
  securityReady: boolean;
  mustCompleteSecurityQuestions: boolean;
  readyForMission: boolean;
  averageRating: number;
  sessionCount: number;
  online: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A job type row in the administrator job-types screen. */
export interface AdminJobTypeView {
  id: string;
  label: string;
  offerPolicy: 'all' | 'ready_only';
  rank: number;
  active: boolean;
  /** Active responders whose job_type_id points at this row. */
  memberCount: number;
  createdAt: number;
  updatedAt: number;
}

/** An offer record as the administrator mission-offers endpoint returns it. */
export interface AdminMissionOfferView {
  id: string;
  sosId: string;
  responderId: string;
  responderUsername: string | null;
  policy: 'all' | 'ready_only';
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  createdAt: number;
  respondedAt: number | null;
}

/** A system setting row. */
export interface SettingView {
  key: string;
  value: string;
  updatedAt: number;
}

/** An audit-log row as `GET /_admin/audit` serializes it. */
export interface AuditEntryView {
  id: number;
  /** Human-facing reference derived from the row id (mirrors the CSV export). */
  trackingCode: number;
  actorUsername: string | null;
  action: string;
  target: string;
  ip: string;
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

/** One member of a mission team (membership is mission-scoped, not an access role). */
export interface MissionMemberView {
  userId: string;
  username: string;
  role: 'leader' | 'member';
  jobTypeId: string | null;
  jobTypeLabel: string | null;
  readyForMission: boolean;
  assignmentSource: string;
  assignmentStatus: 'active' | 'removed';
  supportRequestId: string | null;
  joinedAt: number;
  removedAt: number | null;
  /** Administrator projection only. */
  removalReason?: string | null;
}

/** A required composition line for a team mission, with its fill count. */
export interface MissionRequirementView {
  jobTypeId: string;
  jobTypeLabel: string;
  quantity: number;
  filled: number;
}

/** The composed team behind a mission; visible to members and administrators. */
export interface MissionTeamView {
  missionId: string;
  sosId: string;
  status: string;
  incidentLabel: string;
  severity: string;
  createdAt: number;
  /** 'admin' for administrators, the membership role for members, otherwise null. */
  viewerRole: 'admin' | 'leader' | 'member' | null;
  leader: MissionMemberView | null;
  members: MissionMemberView[];
  memberCount: number;
  requirements: MissionRequirementView[];
  pendingSupportRequestCount: number;
}

/** One requested composition line of a support request. */
export interface SupportRequestItemView {
  jobTypeId: string;
  jobTypeLabel: string;
  quantity: number;
  approvedQuantity: number;
}

/** One entry in the support-request decision history (requester/admin projection). */
export interface SupportRequestDecisionView {
  decision: 'approved' | 'partially_approved' | 'rejected';
  note: string | null;
  adminUsername: string | null;
  createdAt: number;
}

/** A mission support request. The internal fields are present only for the requester and administrators. */
export interface SupportRequestView {
  id: string;
  missionId: string;
  requestedBy: string;
  requestedByUsername: string;
  reason: string;
  note: string | null;
  status: 'pending' | 'partially_approved' | 'approved' | 'rejected' | 'cancelled';
  items: SupportRequestItemView[];
  adminNote?: string | null;
  reviewedBy?: string | null;
  reviewedByUsername?: string | null;
  reviewedAt?: number | null;
  decisions?: SupportRequestDecisionView[];
  createdAt: number;
  updatedAt: number;
  cancelledAt: number | null;
  /** Administrator list projection extras. */
  missionStatus?: string;
  incidentLabel?: string;
  severity?: string;
  /** Administrator/member detail projection extras (support-request detail endpoint). */
  mission?: { missionId: string; sosId: string; incidentLabel: string; severity: string; status: string };
  leader?: { userId: string; username: string } | null;
}

/** One candidate worker for a support-request line, as returned by the admin candidates endpoint. */
export interface SupportRequestCandidateView {
  id: string;
  username: string;
  jobTypeId: string | null;
  jobTypeLabel: string | null;
  readyForMission: boolean;
  averageRating: number;
  otherActiveMissions: number;
  alreadyOnMission: boolean;
  onActiveMission: boolean;
  eligible: boolean;
  ineligibleReason: string | null;
}

/** A stop on a trip (`GET /_user/trips/:id`); `placeId` links a saved place when there is one. */
export interface TripStopView {
  id: string;
  rank: number;
  label: string;
  latitude: number;
  longitude: number;
  placeId: string | null;
}

/** A member of a trip; the leader is always present exactly once. */
export interface TripMemberView {
  userId: string;
  username: string;
  role: 'leader' | 'member';
  joinedAt: number;
}

/** An invitation to a trip, visible to the leader only. */
export interface TripInvitationView {
  id: string;
  inviteeId: string;
  inviteeUsername: string;
  invitedByUsername: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: number;
  respondedAt: number | null;
}

/** A trip as the list endpoint returns it (no stops, no membership detail). */
export interface TripListItemView {
  id: string;
  name: string;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  saved: boolean;
  role: 'leader' | 'member';
  ownerId: string;
  ownerUsername: string;
  stopCount: number;
  memberCount: number;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

/** A full trip projection (`GET /_user/trips/:id`, and the create/patch responses). */
export interface TripView extends TripListItemView {
  stops: TripStopView[];
  members?: TripMemberView[];
  invitations?: TripInvitationView[];
}

/** A pending invitation in the invitee's inbox (`GET /_user/trips/invitations`). */
export interface TripInvitationInboxView {
  id: string;
  tripId: string;
  tripName: string;
  tripStatus: string;
  inviterUsername: string;
  createdAt: number;
}
