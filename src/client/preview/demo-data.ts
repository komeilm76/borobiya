/**
 * Deterministic demo world for the visual preview server.
 *
 * Every fixture below is fiction. No real account, phone number, address, credential or
 * location is used; the coordinates are a fixed neighbourhood grid in Tehran and every
 * timestamp derives from `T0` so re-renders are byte-identical. The world is coherent:
 * the mission a user sees on the history screen is the same mission the responder
 * screen renders, and the share rows match the sharing-center direction filter.
 *
 * NEVER paste production payloads in here — the preview is a review harness.
 */

/** Fixed "now": 2026-11-08 09:00:00 UTC. */
export const T0 = 1_794_128_400_000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const DEMO_USER_ID = 'usr_demo';
export const DEMO_USERNAME = 'saeed.k';
export const DEMO_ADMIN_ID = 'usr_admin';

export const LAT = 35.7242;
export const LNG = 51.3312;

/* ---------------------------------------------------------------- users */

export const users = [
  { id: DEMO_USER_ID, username: DEMO_USERNAME, role: 'responder', isActive: true, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: true, recordTrack: true, averageRating: 4.6, createdAt: T0 - 340 * DAY },
  { id: 'usr_reza', username: 'reza.m', role: 'responder', isActive: true, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: true, averageRating: 4.8, createdAt: T0 - 400 * DAY },
  { id: 'usr_maryam', username: 'maryam.a', role: 'responder', isActive: true, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: true, averageRating: 5.0, createdAt: T0 - 380 * DAY },
  { id: 'usr_nima', username: 'nima.t', role: 'responder', isActive: true, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false, averageRating: 4.2, createdAt: T0 - 290 * DAY },
  { id: 'usr_parsa', username: 'parsa.t', role: 'user', isActive: true, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false, averageRating: 4.5, createdAt: T0 - 260 * DAY },
  { id: 'usr_leila', username: 'leila.n', role: 'responder', isActive: true, securityReady: true, mustCompleteSecurityQuestions: true, readyForMission: false, averageRating: 0, createdAt: T0 - 12 * DAY },
  { id: 'usr_samira', username: 'samira.r', role: 'responder', isActive: true, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: true, averageRating: 4.9, createdAt: T0 - 210 * DAY },
  { id: 'usr_hadi', username: 'hadi.e', role: 'responder', isActive: false, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false, averageRating: 3.8, createdAt: T0 - 500 * DAY },
  { id: DEMO_ADMIN_ID, username: 'admin', role: 'admin', isActive: true, securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false, averageRating: 0, createdAt: T0 - 420 * DAY }
] as const;

export const demoUser = users[0] as unknown as Record<string, unknown>;
export const demoAdmin = users[users.length - 1] as unknown as Record<string, unknown>;

/* ------------------------------------------------------- catalogs */

export const incidentTypes = [
  { id: 'inc_accident', label: 'تصادف', icon: 'car', color: '#b45309', rank: 1 },
  { id: 'inc_medical', label: 'پزشکی', icon: 'medical-bag', color: '#af3438', rank: 2 },
  { id: 'inc_fire', label: 'آتش‌سوزی', icon: 'fire', color: '#c2410c', rank: 3 },
  { id: 'inc_rescue', label: 'نجات و امداد', icon: 'hand-heart-outline', color: '#0e6666', rank: 4 }
];

export const cancellationReasons = [
  { id: 'cr_resolved', label: 'مشکل برطرف شد', requiresText: false },
  { id: 'cr_mistake', label: 'اشتباه ثبت شد', requiresText: false },
  { id: 'cr_duplicate', label: 'درخواست تکراری', requiresText: false },
  { id: 'cr_other', label: 'دلیل دیگر', requiresText: true }
];

export const securityQuestions = [
  { id: 'sq_pet', label: 'نام اولین حیوان خانگی‌تان؟' },
  { id: 'sq_school', label: 'نام مدرسه‌ای که تحصیل کردید؟' },
  { id: 'sq_city', label: 'در کدام شهر متولد شده‌اید؟' },
  { id: 'sq_friend', label: 'نام نزدیک‌ترین دوست دوران کودکی‌تان؟' },
  { id: 'sq_street', label: 'نام خیابانی که بزرگ شدید؟' }
];

export const jobTypes = [
  { id: 'jt_fire', label: 'آتش‌نشان', offerPolicy: 'all', rank: 1, active: true, memberCount: 4, createdAt: T0 - 420 * DAY, updatedAt: T0 - 30 * DAY },
  { id: 'jt_med', label: 'پارامدیک', offerPolicy: 'ready_only', rank: 2, active: true, memberCount: 2, createdAt: T0 - 420 * DAY, updatedAt: T0 - 30 * DAY },
  { id: 'jt_driver', label: 'راننده آتش‌نشان', offerPolicy: 'all', rank: 3, active: true, memberCount: 1, createdAt: T0 - 420 * DAY, updatedAt: T0 - 30 * DAY },
  { id: 'jt_manager', label: 'مدیر امداد', offerPolicy: 'all', rank: 4, active: false, memberCount: 0, createdAt: T0 - 420 * DAY, updatedAt: T0 - 30 * DAY }
];

export const userJobTypes = [
  { id: 'jt_driver', label: 'راننده آتش‌نشان' },
  { id: 'jt_fire', label: 'آتش‌نشان' },
  { id: 'jt_med', label: 'پارامدیک' }
];

/* ------------------------------------------------------------ geo */

export const savedPlaces = [
  { id: 'plc_home', name: 'خانه', label: 'منزل', latitude: 35.7242, longitude: 51.3312, address: 'تهران، خیابان ولیعصر، کوچه بهار ۴', icon: 'home-outline', rank: 1 },
  { id: 'plc_work', name: 'محل کار', label: 'آتش‌نشانی منطقه ۷', latitude: 35.7422, longitude: 51.3787, address: 'تهران، میدان سهروردی، ایستگاه ۱۲', icon: 'briefcase-outline', rank: 2 },
  { id: 'plc_hospital', name: 'بیمارستان امید', label: 'بیمارستان', latitude: 35.7335, longitude: 51.4108, address: 'تهران، خیابان انقلاب، بیمارستان امید', icon: 'hospital-box-outline', rank: 3 }
];

export const mapConfig = {
  center: { latitude: LAT, longitude: LNG },
  defaultZoom: 13,
  bounds: [51.28, 35.69, 51.45, 35.77],
  minZoom: 11,
  maxZoom: 17,
  tileSize: 256,
  tileTemplate: '/_public/map/tiles/{z}/{x}/{y}.svg',
  offline: true,
  attribution: 'نقشه آفلاین — دادگان پیش‌نمایش',
  dataVersion: 'preview-2026-11',
  pois: [
    { id: 'poi_hospital', name: 'بیمارستان امید', kind: 'hospital', latitude: 35.7335, longitude: 51.4108 },
    { id: 'poi_station', name: 'ایستگاه آتش‌نشانی ۱۲', kind: 'fire_station', latitude: 35.7422, longitude: 51.3787 },
    { id: 'poi_pharmacy', name: 'داروخانه شبانه‌روزی مرکز', kind: 'pharmacy', latitude: 35.7271, longitude: 51.3398 }
  ]
};

/** A recorded route for the demo trip (used by history/playback surfaces as they land). */
export const recordedTrack = Array.from({ length: 48 }, (_, index) => {
  const ratio = index / 47;
  return {
    latitude: 35.7242 + ratio * 0.0093 + Math.sin(index * 1.7) * 0.0006,
    longitude: 51.3312 + ratio * 0.0796 + Math.cos(index * 1.3) * 0.0006,
    accuracy: 6 + (index % 5) * 2,
    speed: 8 + ((index * 7) % 14),
    heading: 78 + ((index * 13) % 30),
    recordedAt: T0 - 3 * DAY + Math.floor((index / 47) * 92 * MIN)
  };
});

/** Great-circle distance in metres (mirrors the server haversine). */
function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Track payloads served by the preview for the featured (recorded) trip and mission. */
function buildTrackEnvelope(contextType: 'trip' | 'mission', contextId: string, startAt?: number, durationMs?: number): Record<string, unknown> {
  const span = durationMs ?? 0;
  const points = recordedTrack.map((point, index) => ({
    userId: DEMO_USER_ID,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy: point.accuracy,
    heading: point.heading,
    speed: point.speed,
    recordedAt: startAt === undefined ? point.recordedAt
      : startAt + Math.round((index / (recordedTrack.length - 1)) * span)
  }));
  let distanceM = 0;
  for (let index = 1; index < points.length; index++) {
    distanceM += haversineMeters(points[index - 1].latitude, points[index - 1].longitude, points[index].latitude, points[index].longitude);
  }
  const firstPointAt = points[0].recordedAt;
  const lastPointAt = points[points.length - 1].recordedAt;
  return {
    contextType,
    contextId,
    availability: 'available',
    access: 'member',
    scope: null,
    authorizedUntil: null,
    retentionDays: 180,
    window: { from: firstPointAt, to: lastPointAt },
    points,
    summaries: [
      {
        userId: DEMO_USER_ID, username: DEMO_USERNAME,
        distanceM: Math.round(distanceM), durationMs: lastPointAt - firstPointAt,
        pointCount: points.length, firstPointAt, lastPointAt, quality: 'ok'
      }
    ],
    truncated: false
  };
}

export const demoTripTrack = buildTrackEnvelope('trip', 'trp_target');
export const demoMissionTrack = buildTrackEnvelope('mission', 'mis_hist', T0 - 2 * DAY + 11 * MIN, 74 * MIN);

/* ---------------------------------------------------- SOS and missions */

/** The offer currently addressed to the demo responder. */
export const pendingOffer = {
  id: 'offer_1', sosId: 'sos_offer', trackingCode: 918, requesterId: 'usr_leila', responderId: DEMO_USER_ID,
  incidentLabel: 'آتش‌سوزی', status: 'pending', policy: 'all', severity: 'medium',
  description: 'آتش‌سوزی کوچک در انبار چوب', latitude: 35.7289, longitude: 51.3491, accuracy: 20,
  isManual: true, createdAt: T0 - 8 * MIN, expiresAt: T0 + 22 * MIN, distanceMeters: 640
};

/** Active team mission led by the demo responder. */
export const teamMission = {
  missionId: 'mis_team', sosId: 'sos_team', status: 'on_the_way', incidentLabel: 'آتش‌سوزی',
  severity: 'high', createdAt: T0 - 22 * MIN,
  viewerRole: 'leader',
  leader: {
    userId: DEMO_USER_ID, username: DEMO_USERNAME, role: 'leader', jobTypeId: 'jt_fire', jobTypeLabel: 'آتش‌نشان',
    readyForMission: true, assignmentSource: 'team_dispatch', assignmentStatus: 'active', supportRequestId: null,
    joinedAt: T0 - 22 * MIN, removedAt: null
  },
  members: [
    {
      userId: DEMO_USER_ID, username: DEMO_USERNAME, role: 'leader', jobTypeId: 'jt_fire', jobTypeLabel: 'آتش‌نشان',
      readyForMission: true, assignmentSource: 'team_dispatch', assignmentStatus: 'active', supportRequestId: null,
      joinedAt: T0 - 22 * MIN, removedAt: null
    },
    {
      userId: 'usr_reza', username: 'reza.m', role: 'member', jobTypeId: 'jt_fire', jobTypeLabel: 'آتش‌نشان',
      readyForMission: true, assignmentSource: 'team_dispatch', assignmentStatus: 'active', supportRequestId: null,
      joinedAt: T0 - 21 * MIN, removedAt: null
    },
    {
      userId: 'usr_maryam', username: 'maryam.a', role: 'member', jobTypeId: 'jt_med', jobTypeLabel: 'پارامدیک',
      readyForMission: true, assignmentSource: 'support_request', assignmentStatus: 'active', supportRequestId: 'spr_done',
      joinedAt: T0 - 15 * MIN, removedAt: null
    }
  ],
  memberCount: 3,
  requirements: [
    { jobTypeId: 'jt_fire', jobTypeLabel: 'آتش‌نشان', quantity: 2, filled: 2 },
    { jobTypeId: 'jt_med', jobTypeLabel: 'پارامدیک', quantity: 1, filled: 1 }
  ],
  pendingSupportRequestCount: 1
};

export const supportRequestsForTeam = [
  {
    id: 'spr_pending', missionId: 'mis_team', requestedBy: DEMO_USER_ID, requestedByUsername: DEMO_USERNAME,
    reason: 'به یک پارامدیک دیگر در محل نیاز داریم؛ مصدوم دوم زیر آوار است.', note: 'اولویت با خانم‌هایی است که سابقه تیم دارند.',
    status: 'pending',
    items: [{ jobTypeId: 'jt_med', jobTypeLabel: 'پارامدیک', quantity: 1, approvedQuantity: 0 }],
    createdAt: T0 - 9 * MIN, updatedAt: T0 - 9 * MIN, cancelledAt: null
  }
];

/** A plain single-responder mission assigned to the demo responder (responder perspective). */
export const plainMission = {
  id: 'mis_single', sosId: 'sos_single', trackingCode: 905, responderId: DEMO_USER_ID, requesterId: 'usr_parsa',
  incidentLabel: 'پزشکی', status: 'on_the_way', createdAt: T0 - 31 * MIN, updatedAt: T0 - 4 * MIN,
  trackStatus: 'none', trackConsent: 'accepted'
};

/** A completed mission the demo user ran as responder (history). */
export const responderCompletedMission = {
  id: 'mis_hist', sosId: 'sos_hist', trackingCode: 871, responderId: DEMO_USER_ID, requesterId: 'usr_parsa',
  incidentLabel: 'تصادف', status: 'completed', rating: 4, ratingNote: 'رسیدن سریع، برخورد حرفه‌ای',
  createdAt: T0 - 2 * DAY, updatedAt: T0 - 2 * DAY + 3 * HOUR,
  trackStatus: 'available', trackConsent: 'accepted'
};

/** The request the demo user filed as a requester (history, rated). */
export const requesterCompletedSos = {
  id: 'sos_hist_req', trackingCode: 860, requesterId: DEMO_USER_ID, incidentTypeId: 'inc_medical',
  incidentLabel: 'پزشکی', severity: 'medium', description: 'سرگیجه و تهوع پس از سقوط از پله',
  latitude: 35.7242, longitude: 51.3312, accuracy: 10, isManual: false, status: 'completed',
  createdAt: T0 - 5 * DAY, updatedAt: T0 - 5 * DAY + 70 * MIN
};

export const requesterSosTimeline = [
  { action: 'assign', fromStatus: '', toStatus: 'dispatched', note: 'Immediate dispatch', createdAt: T0 - 5 * DAY + 4 * MIN, actorUsername: 'admin' },
  { action: 'accept', fromStatus: 'dispatched', toStatus: 'on_the_way', note: null, createdAt: T0 - 5 * DAY + 9 * MIN, actorUsername: 'reza.m' },
  { action: 'arrive', fromStatus: 'on_the_way', toStatus: 'on_scene', note: null, createdAt: T0 - 5 * DAY + 21 * MIN, actorUsername: 'reza.m' },
  { action: 'complete', fromStatus: 'on_scene', toStatus: 'completed', note: null, createdAt: T0 - 5 * DAY + 66 * MIN, actorUsername: 'reza.m' }
];

/** A cancelled request of the demo user (history). */
export const cancelledSos = {
  id: 'sos_hist_cancelled', trackingCode: 812, requesterId: DEMO_USER_ID, incidentTypeId: 'inc_fire',
  incidentLabel: 'آتش‌سوزی', severity: 'low', description: 'بوی دود از واحد پایینی می‌آمد؛ با همسایه بررسی کردیم',
  latitude: 35.7261, longitude: 51.3328, accuracy: 12, isManual: true, status: 'cancelled',
  createdAt: T0 - 9 * DAY, updatedAt: T0 - 9 * DAY + 25 * MIN
};


/* --------------------------------------------- trips and user shares */

export const demoTrips = [
  {
    id: 'trp_target', name: 'بازدید از ایستگاه تازه تأسیس شمال', status: 'completed', saved: true, role: 'leader',
    ownerId: DEMO_USER_ID, ownerUsername: DEMO_USERNAME, stopCount: 3, memberCount: 2,
    createdAt: T0 - 3 * DAY - 2 * HOUR, updatedAt: T0 - 3 * DAY + 2 * HOUR,
    startedAt: T0 - 3 * DAY, completedAt: T0 - 3 * DAY + 92 * MIN,
    trackStatus: 'available', trackConsent: 'accepted'
  },
  {
    id: 'trp_relay', name: 'تحویل تجهیزات به ایستگاه ۱۲', status: 'completed', saved: false, role: 'member',
    ownerId: 'usr_reza', ownerUsername: 'reza.m', stopCount: 2, memberCount: 3,
    createdAt: T0 - 8 * DAY, updatedAt: T0 - 8 * DAY + 5 * HOUR,
    startedAt: T0 - 8 * DAY + 1 * HOUR, completedAt: T0 - 8 * DAY + 4 * HOUR,
    trackStatus: 'expired', trackConsent: 'accepted'
  },
  {
    id: 'trp_round', name: 'گشت دوره‌ای منطقه ۷', status: 'planned', saved: false, role: 'leader',
    ownerId: DEMO_USER_ID, ownerUsername: DEMO_USERNAME, stopCount: 4, memberCount: 1,
    createdAt: T0 - 2 * DAY, updatedAt: T0 - 2 * DAY, startedAt: null, completedAt: null,
    trackStatus: 'none', trackConsent: null
  },
  {
    id: 'trp_drill', name: 'تمرین امداد جاده‌ای (لغو شده)', status: 'cancelled', saved: true, role: 'leader',
    ownerId: DEMO_USER_ID, ownerUsername: DEMO_USERNAME, stopCount: 2, memberCount: 4,
    createdAt: T0 - 11 * DAY, updatedAt: T0 - 11 * DAY + 3 * HOUR, startedAt: null, completedAt: null,
    trackStatus: 'none', trackConsent: null
  }
];

export const demoTripInvitations = [
  {
    id: 'inv_1', tripId: 'trp_team2', tripName: 'مانور مشترک شمال‌غرب', tripStatus: 'planned',
    inviterUsername: 'samira.r', createdAt: T0 - 5 * HOUR
  }
];

/** Full detail for the featured trip; the stops follow `recordedTrack`. */
export const demoTripDetail = {
  ...demoTrips[0],
  stops: [
    { id: 'stp_1', rank: 1, label: 'خانه', latitude: 35.7242, longitude: 51.3312, placeId: 'plc_home' },
    { id: 'stp_2', rank: 2, label: 'ایستگاه آتش‌نشانی ۱۲', latitude: 35.7422, longitude: 51.3787, placeId: null },
    { id: 'stp_3', rank: 3, label: 'محل تمرین', latitude: 35.7335, longitude: 51.4108, placeId: null }
  ],
  members: [
    { userId: DEMO_USER_ID, username: DEMO_USERNAME, role: 'leader', joinedAt: T0 - 3 * DAY - 2 * HOUR },
    { userId: 'usr_reza', username: 'reza.m', role: 'member', joinedAt: T0 - 3 * DAY - 1 * HOUR }
  ],
  invitations: []
};

export const demoShares = [
  {
    id: 'shr_live_out', ownerId: DEMO_USER_ID, recipientId: 'usr_reza', recipientUsername: 'reza.m',
    kind: 'live', durationSeconds: 7200, expiresAt: T0 + 2 * HOUR, createdAt: T0 - 10 * MIN, state: 'active'
  },
  {
    id: 'shr_hist_in', ownerId: 'usr_leila', recipientId: DEMO_USER_ID, ownerUsername: 'leila.n',
    kind: 'history', expiresAt: T0 + 26 * HOUR, historyFrom: T0 - 4 * HOUR, historyTo: T0 - 1 * HOUR,
    createdAt: T0 - 1 * HOUR, state: 'active'
  },
  {
    id: 'shr_hist_old', ownerId: DEMO_USER_ID, recipientId: 'usr_maryam', recipientUsername: 'maryam.a',
    kind: 'history', expiresAt: T0 - 2 * DAY, historyFrom: T0 - 3 * DAY, historyTo: T0 - 3 * DAY + 2 * HOUR,
    createdAt: T0 - 2 * DAY - 1 * HOUR, state: 'expired'
  },
  {
    id: 'shr_revoked', ownerId: DEMO_USER_ID, recipientId: 'usr_nima', recipientUsername: 'nima.t',
    kind: 'live', durationSeconds: 3600, expiresAt: T0 - 5 * DAY, createdAt: T0 - 6 * DAY, revokedAt: T0 - 5 * DAY, state: 'revoked'
  }
];

/** The demo responder's own active request (showing a responder en route). */
export const activeRequest = {
  id: 'sos_active_req', trackingCode: 977, requesterId: DEMO_USER_ID, incidentTypeId: 'inc_accident',
  incidentLabel: 'تصادف', incidentIcon: 'car', incidentColor: '#b45309',
  severity: 'high', description: 'تصادف دو خودرو پشت ایستگاه؛ یک نفر گمانه‌زنی خونریزی دارد',
  latitude: 35.7261, longitude: 51.3328, accuracy: 8, isManual: false,
  assignedGroupId: 'grp_central', assignedResponderId: 'usr_reza',
  status: 'dispatched', createdAt: T0 - 12 * MIN, updatedAt: T0 - 4 * MIN
};

/** The SOS behind the plain mission: what the rail watches. */
export const singleSos = {
  id: 'sos_single', trackingCode: 905, requesterId: 'usr_parsa', requesterUsername: 'parsa.t',
  incidentTypeId: 'inc_medical', incidentLabel: 'پزشکی', incidentIcon: 'medical-bag', incidentColor: '#af3438',
  severity: 'medium', description: 'سردرد شدید و تب بالا؛ نیاز به بررسی پارامدیک',
  latitude: 35.7179, longitude: 51.3402, accuracy: 10, isManual: false,
  assignedGroupId: 'grp_central', assignedResponderId: DEMO_USER_ID,
  status: 'accepted', createdAt: T0 - 31 * MIN, updatedAt: T0 - 4 * MIN
};

/** SOS detail timeline for the demo responder's own active request. */
export const activeRequestTimeline = [
  { action: 'assign', fromStatus: '', toStatus: 'dispatched', note: 'Immediate dispatch', createdAt: T0 - 12 * MIN + 2 * MIN, actorUsername: 'admin' }
];

export const singleSosTimeline = [
  { action: 'assign', fromStatus: '', toStatus: 'dispatched', note: 'Immediate dispatch', createdAt: T0 - 31 * MIN + 3 * MIN, actorUsername: 'admin' },
  { action: 'accept', fromStatus: 'dispatched', toStatus: 'accepted', note: null, createdAt: T0 - 29 * MIN, actorUsername: 'saeed.k' }
];

export const userRequests = [activeRequest, singleSos, requesterCompletedSos, cancelledSos];
export const userMissions = [plainMission, responderCompletedMission];

/** Offer addressed to the demo responder (SosView-shaped for the offers endpoint). */
export const pendingOfferSos = {
  id: 'sos_offer', trackingCode: 918, requesterId: 'usr_leila', requesterUsername: 'leila.n',
  incidentTypeId: 'inc_fire', incidentLabel: 'آتش‌سوزی', incidentIcon: 'fire', incidentColor: '#c2410c',
  severity: 'medium', description: 'آتش‌سوزی کوچک در انبار چوب فروشگاه',
  latitude: 35.7289, longitude: 51.3491, accuracy: 20, isManual: true,
  assignedGroupId: null, assignedResponderId: null,
  status: 'dispatched', createdAt: T0 - 8 * MIN, updatedAt: T0 - 8 * MIN
};
