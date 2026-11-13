/**
 * Deterministic admin fixtures for the visual preview server. See `demo-data.ts` for the
 * rules: fiction only, derived timestamps, one coherent world. Field shapes mirror the
 * client-side types in `src/client/api/types.ts` exactly.
 */

import { T0, incidentTypes, jobTypes } from './demo-data.ts';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ----------------------------------- admin groups (GroupView) ---------- */

export const adminGroups = [
  { id: 'grp_north', name: 'تیم شعله شمال', color: '#0E6666', capacity: 8, status: 'active', incidentIds: ['inc_fire', 'inc_accident'], memberCount: 4, coverageCount: 2, memberIds: ['usr_reza', 'usr_samira', 'usr_nima', 'usr_leila'] },
  { id: 'grp_central', name: 'امداد مرکزی', color: '#AF3438', capacity: 10, status: 'active', incidentIds: ['inc_medical', 'inc_rescue'], memberCount: 5, coverageCount: 2, memberIds: ['usr_maryam', 'usr_demo', 'usr_hadi', 'usr_reza', 'usr_nima'] },
  { id: 'grp_east', name: 'گروه شرق (غیرفعال)', color: '#B57A12', capacity: 6, status: 'inactive', incidentIds: ['inc_fire'], memberCount: 0, coverageCount: 0, memberIds: [] as string[] }
];

/** Roster rows mirroring `GET /_admin/groups/:id/members` (leader first). */
export const adminGroupMembers: Record<string, Array<{ userId: string; username: string; membership: string; accountRole: string; active: boolean; averageRating: number; readyForMission: boolean; jobTypeLabel: string | null; online: boolean }>> = {
  grp_north: [
    { userId: 'usr_leila', username: 'leila.n', membership: 'leader', accountRole: 'responder', active: true, averageRating: 4.4, readyForMission: true, jobTypeLabel: 'آتش‌نشان', online: true },
    { userId: 'usr_reza', username: 'reza.m', membership: 'member', accountRole: 'responder', active: true, averageRating: 4.8, readyForMission: true, jobTypeLabel: 'آتش‌نشان', online: true },
    { userId: 'usr_samira', username: 'samira.r', membership: 'member', accountRole: 'responder', active: true, averageRating: 4.6, readyForMission: true, jobTypeLabel: 'پارامدیک', online: true },
    { userId: 'usr_nima', username: 'nima.t', membership: 'member', accountRole: 'responder', active: true, averageRating: 4.2, readyForMission: false, jobTypeLabel: 'آتش‌نشان', online: false }
  ],
  grp_central: [
    { userId: 'usr_maryam', username: 'maryam.a', membership: 'leader', accountRole: 'responder', active: true, averageRating: 5.0, readyForMission: true, jobTypeLabel: 'پارامدیک', online: true },
    { userId: 'usr_demo', username: 'saeed.k', membership: 'member', accountRole: 'responder', active: true, averageRating: 4.0, readyForMission: true, jobTypeLabel: 'فوریت‌های پزشکی', online: true },
    { userId: 'usr_hadi', username: 'hadi.e', membership: 'member', accountRole: 'responder', active: false, averageRating: 3.8, readyForMission: false, jobTypeLabel: 'پارامدیک', online: false },
    { userId: 'usr_reza', username: 'reza.m', membership: 'member', accountRole: 'responder', active: true, averageRating: 4.8, readyForMission: true, jobTypeLabel: 'آتش‌نشان', online: true },
    { userId: 'usr_nima', username: 'nima.t', membership: 'member', accountRole: 'responder', active: true, averageRating: 4.2, readyForMission: false, jobTypeLabel: 'آتش‌نشان', online: false }
  ],
  grp_east: []
};

/* ------------------------------------------- admin dispatch queue ------- */

/** Open/queued SOS rows for the dispatch board (SosView, list projection). */
export const dispatchQueue = [
  { id: 'sos_a3', trackingCode: 943, requesterId: 'usr_samira', requesterUsername: 'samira.r', incidentTypeId: 'inc_medical', incidentLabel: 'پزشکی', incidentIcon: 'medical-bag', incidentColor: '#af3438', severity: 'high', description: 'ایست قلبی در دفتر کار؛ احیای قلبی ریوی در جریان است', latitude: 35.7387, longitude: 51.3725, accuracy: 9, isManual: false, assignedGroupId: null, assignedResponderId: null, status: 'pending', createdAt: T0 - 2 * MIN, updatedAt: T0 - 2 * MIN },
  { id: 'sos_a1', trackingCode: 941, requesterId: 'usr_parsa', requesterUsername: 'parsa.t', incidentTypeId: 'inc_accident', incidentLabel: 'تصادف', incidentIcon: 'car', incidentColor: '#b45309', severity: 'high', description: 'تصادف دو خودرو در خیابان انقلاب؛ یک نفر مصدوم', latitude: 35.7315, longitude: 51.3450, accuracy: 12, isManual: false, assignedGroupId: null, assignedResponderId: null, status: 'pending', createdAt: T0 - 4 * MIN, updatedAt: T0 - 4 * MIN },
  { id: 'sos_a2', trackingCode: 942, requesterId: 'usr_leila', requesterUsername: 'leila.n', incidentTypeId: 'inc_fire', incidentLabel: 'آتش‌سوزی', incidentIcon: 'fire', incidentColor: '#c2410c', severity: 'medium', description: 'آتش‌سوزی کوچک در انبار چوب فروشگاه', latitude: 35.7289, longitude: 51.3491, accuracy: 18, isManual: true, assignedGroupId: 'grp_north', assignedResponderId: null, status: 'dispatched', createdAt: T0 - 11 * MIN, updatedAt: T0 - 10 * MIN },
  { id: 'sos_a4', trackingCode: 940, requesterId: 'usr_parsa', requesterUsername: 'parsa.t', incidentTypeId: 'inc_rescue', incidentLabel: 'نجات و امداد', incidentIcon: 'hand-heart-outline', incidentColor: '#0e6666', severity: 'medium', description: 'فرد گرفتار در آسانسور ساختمان اداری', latitude: 35.7341, longitude: 51.3602, accuracy: 14, isManual: true, assignedGroupId: 'grp_north', assignedResponderId: 'usr_nima', status: 'dispatched', createdAt: T0 - 19 * MIN, updatedAt: T0 - 17 * MIN },
  { id: 'sos_a5', trackingCode: 939, requesterId: 'usr_leila', requesterUsername: 'leila.n', incidentTypeId: 'inc_accident', incidentLabel: 'تصادف', incidentIcon: 'car', incidentColor: '#b45309', severity: 'low', description: 'برخورد پیک موتوری با گاردریل', latitude: 35.7211, longitude: 51.3330, accuracy: 20, isManual: false, assignedGroupId: 'grp_central', assignedResponderId: 'usr_maryam', status: 'accepted', createdAt: T0 - 28 * MIN, updatedAt: T0 - 24 * MIN },
  { id: 'sos_a6', trackingCode: 938, requesterId: 'usr_samira', requesterUsername: 'samira.r', incidentTypeId: 'inc_fire', incidentLabel: 'آتش‌سوزی', incidentIcon: 'fire', incidentColor: '#c2410c', severity: 'high', description: 'دود شدید از طبقه سوم مسکونی', latitude: 35.7190, longitude: 51.3290, accuracy: 11, isManual: false, assignedGroupId: 'grp_north', assignedResponderId: 'usr_reza', status: 'in_progress', createdAt: T0 - 33 * MIN, updatedAt: T0 - 29 * MIN }
];

export const nearestResponders = [
  { id: 'usr_reza', username: 'reza.m', averageRating: 4.8, readyForMission: true, latitude: 35.7270, longitude: 51.3425, distanceMeters: 380, recordedAt: T0 - 40_000 },
  { id: 'usr_maryam', username: 'maryam.a', averageRating: 5.0, readyForMission: true, latitude: 35.7289, longitude: 51.3491, distanceMeters: 640, recordedAt: T0 - 75_000 },
  { id: 'usr_nima', username: 'nima.t', averageRating: 4.2, readyForMission: false, latitude: 35.7258, longitude: 51.3508, distanceMeters: 1150, recordedAt: T0 - 4 * MIN }
];

/* ------------------------------------------------- admin overview ------ */

const trendCounts = [11, 9, 14, 8, 16, 21, 18];

export const adminOverview = {
  kpis: { requestsToday: 18, activeMissions: 3, onlineResponders: 6 },
  trend: trendCounts.map((count, index) => ({ day: new Date(T0 - (6 - index) * DAY).toISOString().slice(0, 10), count })),
  statusCounts: { pending: 3, dispatched: 2, accepted: 1, in_progress: 2, completed: 41, cancelled: 3, expired: 1 },
  recentRequests: [
    { id: 'sos_a3', status: 'pending', severity: 'high', incidentLabel: 'پزشکی', requesterUsername: 'samira.r', createdAt: T0 - 2 * MIN },
    { id: 'sos_a1', status: 'pending', severity: 'high', incidentLabel: 'تصادف', requesterUsername: 'parsa.t', createdAt: T0 - 4 * MIN },
    { id: 'sos_a2', status: 'dispatched', severity: 'medium', incidentLabel: 'آتش‌سوزی', requesterUsername: 'leila.n', createdAt: T0 - 11 * MIN },
    { id: 'sos_a4', status: 'dispatched', severity: 'medium', incidentLabel: 'نجات و امداد', requesterUsername: 'parsa.t', createdAt: T0 - 19 * MIN },
    { id: 'sos_a5', status: 'accepted', severity: 'low', incidentLabel: 'تصادف', requesterUsername: 'leila.n', createdAt: T0 - 28 * MIN },
    { id: 'sos_a6', status: 'in_progress', severity: 'high', incidentLabel: 'آتش‌سوزی', requesterUsername: 'samira.r', createdAt: T0 - 33 * MIN }
  ],
  groups: adminGroups,
  alerts: [
    { id: 'alt_1', kind: 'responder_offline', severity: 'danger', message: 'hadi.e بیش از ۳۰ دقیقه آفلاین بوده است', createdAt: T0 - 26 * MIN, resolvedAt: null, resolvedBy: null },
    { id: 'alt_2', kind: 'location_stale', severity: 'warning', message: 'موقعیت امداد مرکزی به‌روز نشده است', createdAt: T0 - 40 * MIN, resolvedAt: null, resolvedBy: null }
  ]
};

/* --------------------------------- admin users (AdminUserView) --------- */

export const adminUsers = [
  { id: 'usr_reza', username: 'reza.m', role: 'responder', active: true, jobTypeId: 'jt_fire', jobTypeLabel: 'آتش‌نشان', securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: true, averageRating: 4.8, sessionCount: 2, online: true, createdAt: T0 - 400 * DAY, updatedAt: T0 - 2 * HOUR },
  { id: 'usr_maryam', username: 'maryam.a', role: 'responder', active: true, jobTypeId: 'jt_med', jobTypeLabel: 'پارامدیک', securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: true, averageRating: 5.0, sessionCount: 1, online: true, createdAt: T0 - 380 * DAY, updatedAt: T0 - 30 * MIN },
  { id: 'usr_nima', username: 'nima.t', role: 'responder', active: true, jobTypeId: 'jt_fire', jobTypeLabel: 'آتش‌نشان', securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false, averageRating: 4.2, sessionCount: 1, online: false, createdAt: T0 - 290 * DAY, updatedAt: T0 - 3 * DAY },
  { id: 'usr_leila', username: 'leila.n', role: 'responder', active: true, jobTypeId: 'jt_med', jobTypeLabel: 'پارامدیک', securityReady: false, mustCompleteSecurityQuestions: true, readyForMission: false, averageRating: 0, sessionCount: 1, online: true, createdAt: T0 - 12 * DAY, updatedAt: T0 - 6 * HOUR },
  { id: 'usr_samira', username: 'samira.r', role: 'responder', active: true, jobTypeId: 'jt_fire', jobTypeLabel: 'آتش‌نشان', securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: true, averageRating: 4.9, sessionCount: 3, online: true, createdAt: T0 - 210 * DAY, updatedAt: T0 - 90 * MIN },
  { id: 'usr_hadi', username: 'hadi.e', role: 'responder', active: false, jobTypeId: 'jt_driver', jobTypeLabel: 'راننده آتش‌نشان', securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false, averageRating: 3.8, sessionCount: 0, online: false, createdAt: T0 - 500 * DAY, updatedAt: T0 - 40 * DAY },
  { id: 'usr_parsa', username: 'parsa.t', role: 'user', active: true, jobTypeId: null, jobTypeLabel: null, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false, averageRating: 4.5, sessionCount: 1, online: false, createdAt: T0 - 260 * DAY, updatedAt: T0 - 5 * DAY },
  { id: 'usr_demo', username: 'saeed.k', role: 'responder', active: true, jobTypeId: 'jt_driver', jobTypeLabel: 'راننده آتش‌نشان', securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: true, averageRating: 4.6, sessionCount: 1, online: true, createdAt: T0 - 340 * DAY, updatedAt: T0 - 20 * MIN }
];

/* -------------------------------------- job types / incident types ----- */

export const adminJobTypes = jobTypes.map((j) => ({ ...j }));
export const adminIncidentTypes = incidentTypes.map((i) => ({ ...i }));

/* --------------------------- mission offers (AdminMissionOfferView) ---- */

export const adminOffers = [
  { id: 'aoff_1', sosId: 'sos_a1', responderId: 'usr_reza', responderUsername: 'reza.m', policy: 'all', status: 'pending', createdAt: T0 - 3 * MIN, respondedAt: null },
  { id: 'aoff_2', sosId: 'sos_a1', responderId: 'usr_maryam', responderUsername: 'maryam.a', policy: 'all', status: 'pending', createdAt: T0 - 2 * MIN, respondedAt: null },
  { id: 'aoff_3', sosId: 'sos_a3', responderId: 'usr_maryam', responderUsername: 'maryam.a', policy: 'ready_only', status: 'accepted', createdAt: T0 - 90 * 1000, respondedAt: T0 - 55 * 1000 },
  { id: 'aoff_4', sosId: 'sos_a4', responderId: 'usr_nima', responderUsername: 'nima.t', policy: 'all', status: 'declined', createdAt: T0 - 18 * MIN, respondedAt: T0 - 17 * MIN },
  { id: 'aoff_5', sosId: 'sos_a6', responderId: 'usr_hadi', responderUsername: 'hadi.e', policy: 'all', status: 'expired', createdAt: T0 - 40 * MIN, respondedAt: null }
];

/* ------------------------------- support requests (admin projections) -- */

export const adminSupportRequests = [
  {
    id: 'spr_admin_1', missionId: 'mis_team', requestedBy: 'usr_demo', requestedByUsername: 'saeed.k',
    reason: 'به یک پارامدیک دیگر در محل نیاز داریم؛ مصدوم دوم زیر آوار است.', note: 'اولویت با افرادی است که سابقه تیم دارند.',
    status: 'pending',
    items: [{ jobTypeId: 'jt_med', jobTypeLabel: 'پارامدیک', quantity: 1, approvedQuantity: 0 }],
    missionStatus: 'on_the_way', incidentLabel: 'آتش‌سوزی', severity: 'high',
    createdAt: T0 - 9 * MIN, updatedAt: T0 - 9 * MIN, cancelledAt: null
  },
  {
    id: 'spr_admin_2', missionId: 'mis_single2', requestedBy: 'usr_reza', requestedByUsername: 'reza.m',
    reason: 'نیاز به آمبولانس برای انتقال مصدوم', note: 'مصدوم بی‌هوش است',
    status: 'pending',
    items: [
      { jobTypeId: 'jt_med', jobTypeLabel: 'پارامدیک', quantity: 1, approvedQuantity: 0 },
      { jobTypeId: 'jt_driver', jobTypeLabel: 'راننده آتش‌نشان', quantity: 1, approvedQuantity: 0 }
    ],
    missionStatus: 'in_progress', incidentLabel: 'نجات و امداد', severity: 'medium',
    createdAt: T0 - 17 * MIN, updatedAt: T0 - 15 * MIN, cancelledAt: null
  },
  {
    id: 'spr_admin_3', missionId: 'mis_hist', requestedBy: 'usr_reza', requestedByUsername: 'reza.m',
    reason: 'درخواست نردبان برای طبقه ششم', note: null,
    status: 'approved',
    items: [{ jobTypeId: 'jt_fire', jobTypeLabel: 'آتش‌نشان', quantity: 1, approvedQuantity: 1 }],
    missionStatus: 'completed', incidentLabel: 'تصادف', severity: 'high',
    adminNote: 'تأیید شد؛ تیم شعله شمال اعزام شد', reviewedBy: 'usr_admin', reviewedByUsername: 'admin', reviewedAt: T0 - 2 * DAY,
    decisions: [{ decision: 'approved', note: 'تأیید شد؛ تیم شعله شمال اعزام شد', adminUsername: 'admin', createdAt: T0 - 2 * DAY }],
    createdAt: T0 - 2 * DAY - 20 * MIN, updatedAt: T0 - 2 * DAY, cancelledAt: null
  }
];

export const adminSupportRequestDetail = {
  ...adminSupportRequests[0],
  mission: { missionId: 'mis_team', sosId: 'sos_team', incidentLabel: 'آتش‌سوزی', severity: 'high', status: 'on_the_way' },
  leader: { userId: 'usr_demo', username: 'saeed.k' }
};

export const adminSupportRequestCandidates: Record<string, Array<Record<string, unknown>>> = {
  spr_admin_1: [
    { id: 'usr_maryam', username: 'maryam.a', jobTypeId: 'jt_med', jobTypeLabel: 'پارامدیک', readyForMission: true, averageRating: 5.0, otherActiveMissions: 1, alreadyOnMission: true, onActiveMission: true, eligible: false, ineligibleReason: 'در مأموریت فعلی حضور دارد' },
    { id: 'usr_leila', username: 'leila.n', jobTypeId: 'jt_med', jobTypeLabel: 'پارامدیک', readyForMission: false, averageRating: 0, otherActiveMissions: 0, alreadyOnMission: false, onActiveMission: false, eligible: false, ineligibleReason: 'آماده مأموریت نیست (سؤالات امنیتی ناقص)' },
    { id: 'usr_samira', username: 'samira.r', jobTypeId: 'jt_med', jobTypeLabel: 'پارامدیک', readyForMission: true, averageRating: 4.9, otherActiveMissions: 0, alreadyOnMission: false, onActiveMission: false, eligible: true, ineligibleReason: null }
  ],
  spr_admin_2: [
    { id: 'usr_maryam', username: 'maryam.a', jobTypeId: 'jt_med', jobTypeLabel: 'پارامدیک', readyForMission: true, averageRating: 5.0, otherActiveMissions: 1, alreadyOnMission: false, onActiveMission: false, eligible: true, ineligibleReason: null },
    { id: 'usr_leila', username: 'leila.n', jobTypeId: 'jt_driver', jobTypeLabel: 'راننده آتش‌نشان', readyForMission: false, averageRating: 0, otherActiveMissions: 0, alreadyOnMission: false, onActiveMission: false, eligible: false, ineligibleReason: 'آماده مأموریت نیست' }
  ]
};

/* --------------------------------------------------------- alerts ------ */

export const adminAlerts = [
  { id: 'alt_1', kind: 'responder_offline', severity: 'danger', message: 'hadi.e بیش از ۳۰ دقیقه آفلاین بوده است', createdAt: T0 - 26 * MIN, resolvedAt: null, resolvedBy: null },
  { id: 'alt_2', kind: 'location_stale', severity: 'warning', message: 'موقعیت امداد مرکزی به‌روز نشده است', createdAt: T0 - 40 * MIN, resolvedAt: null, resolvedBy: null },
  { id: 'alt_3', kind: 'sla_warning', severity: 'info', message: 'میانگین زمان اعزام امروز ۴ دقیقه افزایش یافته است', createdAt: T0 - 2 * HOUR, resolvedAt: T0 - 90 * MIN, resolvedBy: 'usr_admin' }
];

/* --------------------------------------------------- audit log --------- */

export const adminAudit = [
  { id: 1042, trackingCode: 1042, actorUsername: 'maryam.a', action: 'mission_offer_accept', target: 'aoff_3', ip: '10.0.0.21', createdAt: T0 - 55 * 1000 },
  { id: 1041, trackingCode: 1041, actorUsername: 'admin', action: 'support_request_approved', target: 'spr_admin_3', ip: '10.0.0.2', createdAt: T0 - 2 * DAY },
  { id: 1040, trackingCode: 1040, actorUsername: 'nima.t', action: 'user_ready_toggle', target: 'usr_nima', ip: '10.0.0.44', createdAt: T0 - 3 * DAY },
  { id: 1039, trackingCode: 1039, actorUsername: 'admin', action: 'admin_login', target: 'usr_admin', ip: '10.0.0.2', createdAt: T0 - 5 * DAY },
  { id: 1038, trackingCode: 1038, actorUsername: 'reza.m', action: 'mission_complete', target: 'mis_hist', ip: '10.0.0.31', createdAt: T0 - 2 * DAY + 3 * HOUR },
  { id: 1037, trackingCode: 1037, actorUsername: 'saeed.k', action: 'share_create', target: 'shr_hist_old', ip: '10.0.0.55', createdAt: T0 - 2 * DAY + 1 * HOUR }
];

/* ------------------------------------------------------- settings ------ */

/* Mirror the server seed exactly (src/server/db/database.ts + SETTINGS_KEYS); the preview must not
   invent keys the real settings endpoint would reject on save. */
export const adminSettings = [
  { key: 'sos_auto_dispatch', value: '0', updatedAt: T0 - 30 * DAY },
  { key: 'default_dispatch_radius_m', value: '5000', updatedAt: T0 - 30 * DAY },
  { key: 'mission_ready_required', value: '1', updatedAt: T0 - 20 * DAY },
  { key: 'maintenance_mode', value: '0', updatedAt: T0 - 15 * DAY }
];

/* ------------------------------------------------- system health ------- */

/* Shape mirrors `services/admin.systemHealth()`: repo.stats() under `database`,
   hub+realtime stats under `realtime`, and `serverTime` — no `dataVersion` (that lives on the
   public health endpoint only). */
export const systemHealth = {
  status: 'ok',
  uptimeSeconds: 512345,
  database: { users: 128, sessions: 37, shares: 12, sosRequests: 864, missions: 421, alerts: 2, events: 51200, locationPoints: 9021 },
  realtime: { connections: 4, users: 4, sessions: 4, rooms: 2, framesIn: 312, framesOut: 486, onlineUsers: 4, onlineSessions: 4 },
  map: { tiles: 1421 },
  serverTime: T0
};
/* --------------------------------------------------- admin reports ------ */

/**
 * Deterministic `/_admin/reports` payload for the preview. Numbers are fiction; the shape mirrors
 * the server exactly, and `days` re-derives the series so the period selector stays coherent.
 */
export function adminReportsFor(daysInput: number): Record<string, unknown> {
  const days = Math.min(92, Math.max(7, Math.floor(Number(daysInput) || 30)));
  const since = T0 - (T0 % DAY) - (days - 1) * DAY;
  const trend = Array.from({ length: days }, (_, index) => {
    const seed = (index * 37 + 13) % 17;
    const requests = 6 + seed;
    const missions = Math.max(0, Math.round(requests * 0.62) - (seed % 3));
    return { day: new Date(since + index * DAY).toISOString().slice(0, 10), requests, missions };
  });
  const totalRequests = trend.reduce((sum, point) => sum + point.requests, 0);
  const scale = days / 30;
  const groups = [
    { id: 'grp_north', name: 'تیم شعله شمال', color: '#0E6666', requests: Math.round(96 * scale), avgResponseSeconds: 234, acceptanceRate: 96, ratingAvg: 4.8 },
    { id: 'grp_central', name: 'امداد مرکزی', color: '#AF3438', requests: Math.round(71 * scale), avgResponseSeconds: 260, acceptanceRate: 93, ratingAvg: 4.6 },
    { id: 'grp_east', name: 'گروه شرق (غیرفعال)', color: '#B57A12', requests: Math.round(14 * scale), avgResponseSeconds: 451, acceptanceRate: 74, ratingAvg: 3.6 }
  ];
  const groupRequestTotal = groups.reduce((sum, group) => sum + group.requests, 0);
  return {
    days,
    periodStart: since,
    periodEnd: T0,
    kpis: {
      totalRequests,
      requestsDeltaPct: 8,
      avgResponseSeconds: 252,
      avgResponseDeltaSeconds: 38,
      acceptanceRate: 92,
      acceptanceRateDeltaPct: 2,
      cancelledMissions: Math.max(1, Math.round(3 * scale)),
      cancelledDeltaPct: -25
    },
    trend,
    incidentTypes: [
      { label: 'آتش‌سوزی', color: '#c2410c', icon: 'fire', count: Math.round(184 * scale) },
      { label: 'پزشکی', color: '#af3438', icon: 'medical-bag', count: Math.round(152 * scale) },
      { label: 'غرق‌شدگی', color: '#316D86', icon: 'waves', count: Math.round(96 * scale) },
      { label: 'تصادف', color: '#b45309', icon: 'car', count: Math.round(84 * scale) },
      { label: 'نجات و امداد', color: '#0e6666', icon: 'hand-heart-outline', count: Math.round(61 * scale) },
      { label: 'سایر', color: '#6b7280', icon: 'dots-horizontal', count: Math.round(26 * scale) }
    ],
    groups,
    groupRequestTotal,
    serverTime: T0
  };
}
