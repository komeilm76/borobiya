/** Mobile map, SOS, mission, companions, talk, history and profile views. */
import { escapeHtml, icon, numberFa, formatClock, formatDateTime, formatDistance, statusPill, emptyState, errorPanel, metric, sparkline, toast, go, rerender } from '../ui.js';
import { get, post, patch, del, errorMessage } from '../api.js';
import { worldCoordinate } from '../geo.js';
import { WS_EVENTS, SOS_STATUS, MISSION_STATUS, SOS_STAGES, MISSION_STAGES, HTTP_EVENTS } from '../protocol.js';

/** @param {string} selector @returns {any} */
function $(selector) { return document.querySelector(selector); }
/** @param {any} root @param {string} selector @returns {any} */
function pick(root, selector) { return root ? root.querySelector(selector) : null; }

const TABS = [
  { id: 'history', label: 'تاریخچه', icon: 'history', path: '/_user/history' },
  { id: 'map', label: 'مسیریابی', icon: 'routes', path: '/_user/map' },
  { id: 'companions', label: 'همراهان', icon: 'account-group-outline', path: '/_user/companions' },
  { id: 'mission', label: 'مأموریت', icon: 'web', path: '/_user/mission' }
];

const SEVERITIES = [
  { id: 'low', label: 'کم', detail: 'کمک ضروری نیست', color: '#2C7A57' },
  { id: 'medium', label: 'متوسط', detail: 'رسیدگی لازم است', color: '#B57A12' },
  { id: 'high', label: 'شدید', detail: 'خطر جانی', color: '#AF3438' }
];

const SOS_STEP_LABELS = ['شرح حادثه', 'موقعیت', 'عکس', 'بازبینی'];
const MISSION_LABELS = ['پذیرش', 'در مسیر', 'رسیده', 'رسیدگی', 'پایان'];
const SOS_RAIL_LABELS = ['ثبت', 'اعزام', 'پذیرش', 'رسیدگی', 'پایان'];

/** @param {any} state */
export async function ensureMapData(state) {
  try {
    const [config, incidents, places, shares, sos, missions, reasons] = await Promise.all([
      get('/_public/map/config'),
      get('/_public/incident-types'),
      get('/_user/places'),
      get('/_user/location/shares'),
      get('/_user/sos'),
      get('/_user/missions'),
      get('/_public/cancellation-reasons')
    ]);
    state.mapConfig = config;
    state.incidentTypes = incidents.items || [];
    state.places = places.items || [];
    state.shares = shares.items || [];
    state.sosList = sos.items || [];
    state.missions = missions.items || [];
    state.cancellationReasons = reasons.items || [];
    if (!state.sosDraft) resetSosDraft(state);
  } catch (error) {
    state.dataError = errorMessage(error);
  }
}

/** @param {any} state */
function resetSosDraft(state) {
  const center = state.mapConfig?.center || { latitude: 35.7219, longitude: 51.3347 };
  state.sosDraft = {
    step: 1, severity: 'medium', incidentTypeId: state.incidentTypes?.[0]?.id || 'incident_fire',
    description: '', photoDataUrl: null, latitude: Number(center.latitude), longitude: Number(center.longitude),
    accuracy: 12, isManual: false
  };
}

function statusBar() {
  return `<div class="status-bar" aria-hidden="true">
    <span class="status-bar__clock">${escapeHtml(formatClock('2026-11-08T09:41:00'))}</span>
    <span class="status-bar__icons">${icon('signal')}${icon('wifi')}${icon('battery')}</span>
  </div>`;
}

/** @param {string} view */
function topPill(view) {
  const active = view === 'sos' || view === 'talk' ? 'map' : view === 'profile' ? 'history' : view;
  return `<nav class="top-pill" aria-label="بخشهای اصلی">
    ${TABS.map((tab) => `<button type="button" class="top-pill__item ${tab.id === active ? 'is-active' : ''}" data-go="${tab.path}">
      ${icon(tab.icon)}<span>${escapeHtml(tab.label)}</span>${tab.id === 'mission' ? '<b class="mission-badge">۳</b>' : ''}
    </button>`).join('')}
  </nav>`;
}

function mapFurniture(state) {
  const chips = (state.places || []).slice(0, 3).map((place) => `<button type="button" class="quick-chip" data-action="place" data-place="${escapeHtml(place.id)}">${icon(place.icon || 'map-marker-outline')}<span>${escapeHtml(place.label)}</span></button>`).join('');
  return `<div class="map-canvas" id="map-canvas" aria-label="نقشه شهر">
    <div class="map-tiles" id="map-tiles"></div>
    <div class="map-pois" aria-hidden="true">
      <span class="poi poi--fuel" style="left:18%;top:37%">${icon('gas-station')}</span>
      <span class="poi poi--camera" style="left:80%;top:35%">${icon('camera-outline')}</span>
      <span class="poi poi--school" style="left:86%;top:46%">${icon('school-outline')}</span>
      <span class="poi poi--bag" style="left:34%;top:57%">${icon('shopping-outline')}</span>
      <span class="poi poi--fire" style="left:73%;top:42%">${icon('fire')}</span>
      <span class="poi poi--pin" style="left:60%;top:53%">${icon('map-marker-outline')}</span>
      <span class="poi poi--target" style="left:46%;top:39%">${icon('target')}</span>
    </div>
    <div class="live-markers" id="live-markers"></div>
    <div class="user-marker" aria-label="موقعیت شما"><span class="user-marker__accuracy"></span><span class="user-marker__dot">${icon('navigation')}</span></div>
    <div class="map-scale"><span></span>${escapeHtml(formatDistance(250))}</div>
  </div>
  <div class="left-controls">
    <button type="button" class="round-control" data-action="layers" aria-label="لایهها">${icon('layers-outline')}</button>
    <button type="button" class="round-control compass-control" data-action="compass" aria-label="قطبمنا"><span>N</span>${icon('navigation')}</button>
  </div>
  <div class="right-controls">
    <button type="button" class="avatar-control" data-go="/_user/profile" aria-label="نمایه"><span>R</span><i></i></button>
    <button type="button" class="round-control" data-action="recenter" aria-label="مرکز نقشه">${icon('crosshairs-gps')}</button>
    <button type="button" class="round-control" data-action="radar" aria-label="جستوجوی اطراف">${icon('radar')}</button>
  </div>
  <div class="sos-dock">
    <button type="button" class="sos-button" data-sos-hold aria-label="نگه دارید تا درخواست امداد باز شود"><span>SOS</span>${icon('alarm-light')}<i class="sos-button__progress"></i></button>
  </div>
  <div class="quick-chips">${chips || `<button type="button" class="quick-chip" data-go="/_user/profile">${icon('history')}<span>آخرین مقصد</span></button><button type="button" class="quick-chip" data-action="place">${icon('briefcase-outline')}<span>محل کار</span></button><button type="button" class="quick-chip" data-action="place">${icon('home-outline')}<span>خانه</span></button>`}</div>
  <form class="search-bar" data-action="search" role="search">
    <button type="submit" aria-label="جستوجو">${icon('magnify')}</button>
    <input name="q" type="search" placeholder="کجا میروی؟" aria-label="جستوجوی مقصد">
  </form>
  <div class="home-indicator" aria-hidden="true"></div>`;
}

/** @param {any} state @param {string} view */
function sheetDetent(view, state) {
  if (['sos', 'talk', 'mission', 'profile', 'companions', 'history'].includes(view)) return 'open';
  return state.mapDetent || 'half';
}

/** @param {string} view @param {any} state */
function sheetContent(view, state) {
  if (view === 'sos') return sosSheet(state);
  if (view === 'talk') return talkSheet(state);
  if (view === 'mission') return missionSheet(state);
  if (view === 'companions') return companionsSheet(state);
  if (view === 'history') return historySheet(state);
  if (view === 'profile') return profileSheet(state);
  return destinationSheet(state);
}

/** @param {any} state */
function destinationSheet(state) {
  const places = (state.places || []).slice(0, 3);
  return `<div class="sheet__head">
    <div><strong>مقصد انتخابشده</strong><span>حرکت از موقعیت کنونی</span></div>
    <button type="button" class="sheet__expand" data-action="sheet-next">${icon('chevron-up')}</button>
  </div>
  <div class="sheet__body">
    <div class="destination-card"><span class="destination-card__line"></span><div>${icon('map-marker-outline')}<span>مقصد روی نقشه</span></div><div>${icon('flag-outline')}<span>موقعیت کنونی</span></div></div>
    <div class="place-list">${places.length ? places.map((place) => `<button type="button" class="place-row" data-action="place" data-place="${escapeHtml(place.id)}">${icon(place.icon || 'map-marker-outline')}<span><strong>${escapeHtml(place.label)}</strong><small>${escapeHtml(place.address || place.name)}</small></span>${icon('chevron-left')}</button>`).join('') : emptyState('مقصدی ذخیره نشده', 'از دکمههای زیر نقشه یا نمایه، مقصد تازه اضافه کنید.', 'map-marker-plus-outline')}</div>
  </div>
  <div class="sheet__footer"><button type="button" class="primary-button primary-button--wide" data-action="start-trip"><span>سفر</span>${icon('arrow-left')}</button></div>`;
}

/** @param {any} state */
function sosSheet(state) {
  const draft = state.sosDraft || { step: 1, description: '', severity: 'medium', incidentTypeId: '' };
  const step = Number(draft.step || 1);
  const progress = `<div class="sos-progress">${SOS_STEP_LABELS.map((label, index) => `<span class="${index < step ? 'is-done' : ''}"></span>`).join('')}</div>`;
  const incidents = (state.incidentTypes || []).slice(0, 6);
  let body = '';
  if (step === 1) {
    body = `<div class="sos-section"><div class="sos-label">شدت حادثه <span>بر اساس خطری که شما را تهدید میکند</span></div>
      <div class="severity-grid">${SEVERITIES.map((item) => `<button type="button" class="severity-card ${draft.severity === item.id ? 'is-selected' : ''}" data-action="sos-severity" data-value="${item.id}"><i style="background:${item.color}"></i><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.detail)}</span></button>`).join('')}</div></div>
      <div class="sos-section"><div class="sos-label">نوع حادثه</div><div class="incident-grid">${incidents.map((incident, index) => `<button type="button" class="incident-card ${draft.incidentTypeId === incident.id ? 'is-selected' : ''}" data-action="sos-incident" data-value="${escapeHtml(incident.id)}">${icon(incident.icon || 'alert-circle-outline')}<span>${escapeHtml(incident.label)}</span></button>`).join('')}</div></div>
      <div class="sos-section"><div class="sos-label">شرح وضعیت <span class="char-count" id="sos-count">${numberFa(String(draft.description || '').length)} / ${numberFa(500)}</span></div>
        <textarea id="sos-description" rows="3" maxlength="500" placeholder="چه اتفاقی افتاده است؟">${escapeHtml(draft.description || '')}</textarea></div>
      <div class="location-note">${icon('crosshairs-gps')}<div><strong>موقعیت شما خودکار ثبت میشود</strong><span>در گام بعد میتوانید روی نقشه اصلاحش کنید.</span></div></div>`;
  } else if (step === 2) {
    body = `<div class="sos-section"><div class="sos-label">موقعیت دقیق حادثه</div><div class="location-preview">${icon('map-marker-radius-outline')}<strong>موقعیت کنونی</strong><span>${escapeHtml(formatDistance(draft.accuracy || 12))} دقت</span></div><p class="sos-help">نشان وسط نقشه، محل اعزام امداد است. در صورت نیاز دکمه مرکز نقشه را بزنید.</p></div>`;
  } else if (step === 3) {
    body = `<div class="sos-section"><div class="sos-label">عکس اختیاری</div><label class="photo-drop" for="sos-photo">${draft.photoDataUrl ? `<img src="${escapeHtml(draft.photoDataUrl)}" alt="پیشنمایش عکس">` : `${icon('camera-outline')}<strong>افزودن عکس از صحنه</strong><span>عکس به درخواست امداد پیوست میشود.</span>`}</label><input id="sos-photo" type="file" accept="image/*" capture="environment" hidden></div>`;
  } else {
    const incident = incidents.find((item) => item.id === draft.incidentTypeId);
    const severity = SEVERITIES.find((item) => item.id === draft.severity);
    body = `<div class="sos-section"><div class="sos-label">بازبینی و ارسال</div><div class="review-card">
      <div><span>نوع حادثه</span><strong>${escapeHtml(incident?.label || 'سایر')}</strong></div>
      <div><span>شدت</span><strong>${escapeHtml(severity?.label || 'متوسط')}</strong></div>
      <div><span>شرح</span><strong>${escapeHtml(draft.description || '')}</strong></div>
      <div><span>موقعیت</span><strong>${numberFa(draft.latitude.toFixed(4))} و ${numberFa(draft.longitude.toFixed(4))}</strong></div>
      ${draft.photoDataUrl ? `<img class="review-photo" src="${escapeHtml(draft.photoDataUrl)}" alt="عکس حادثه">` : ''}
    </div></div>`;
  }
  const nextLabel = step === 4 ? 'ارسال درخواست امداد' : 'ادامه';
  return `<div class="sheet__head sheet__head--sos">
    <button type="button" class="sheet__close" data-go="/_user/map" aria-label="بستن">${icon('close')}</button>
    <div><strong>درخواست امداد فوری</strong><span>پیشنویس · هنوز ارسال نشده</span></div>
    <span class="siren-badge">${icon('alarm-light')}</span>
  </div>
  <div class="sheet__body sheet__body--sos">${progress}<div class="sos-step-title">گام ${numberFa(step)} از ${numberFa(4)} · ${escapeHtml(SOS_STEP_LABELS[step - 1])}</div>${body}</div>
  <div class="sheet__footer sheet__footer--sos">
    ${step > 1 ? `<button type="button" class="ghost-button" data-action="sos-back">بازگشت</button>` : ''}
    <button type="button" class="primary-button" data-action="sos-next"><span>${escapeHtml(nextLabel)}</span>${icon('arrow-left')}</button>
    ${step === 3 ? '<button type="button" class="text-link" data-action="sos-next">رد کردن عکس</button>' : ''}
  </div>`;
}

/** @param {any} state */
function missionSheet(state) {
  const activeSos = (state.sosList || []).find((item) => ![SOS_STATUS.COMPLETED, SOS_STATUS.CANCELLED, SOS_STATUS.EXPIRED].includes(item.status));
  const mission = (state.missions || []).find((item) => ![MISSION_STATUS.COMPLETED, MISSION_STATUS.CANCELLED].includes(item.status));
  if (activeSos && !mission) {
    const index = Math.max(0, [SOS_STATUS.PENDING, SOS_STATUS.DISPATCHED, SOS_STATUS.ACCEPTED, SOS_STATUS.IN_PROGRESS, SOS_STATUS.COMPLETED].indexOf(activeSos.status));
    return `<div class="sheet__head"><div><strong>درخواست امداد شما</strong><span>کد پیگیری ${numberFa(activeSos.trackingCode)}</span></div><span class="status-pill status-pill--warning">${escapeHtml(sosStatusLabel(activeSos.status))}</span></div>
      <div class="sheet__body"><div class="rail">${SOS_RAIL_LABELS.map((label, i) => `<div class="rail__step ${i <= index ? 'is-done' : ''}"><i>${i < index ? icon('check') : numberFa(i + 1)}</i><span>${escapeHtml(label)}</span></div>`).join('')}</div>
      <div class="info-card">${icon('map-marker-outline')}<div><strong>${escapeHtml(activeSos.incidentLabel || 'حوادث')}</strong><span>${escapeHtml(activeSos.description)}</span></div></div>
      <div class="info-card info-card--warning">${icon('information-outline')}<span>تا پایان مأموریت، موقعیت شما با امدادگر به اشتراک گذاشته میشود.</span></div></div>
      <div class="sheet__footer"><button type="button" class="danger-button" data-action="sos-cancel" data-id="${escapeHtml(activeSos.id)}"><span>لغو درخواست</span>${icon('close-circle-outline')}</button></div>`;
  }
  if (mission) {
    const index = Math.max(0, [MISSION_STATUS.PENDING, MISSION_STATUS.ON_THE_WAY, MISSION_STATUS.ARRIVED, MISSION_STATUS.IN_PROGRESS, MISSION_STATUS.COMPLETED].indexOf(mission.status));
    const nextAction = mission.status === MISSION_STATUS.PENDING ? 'accept' : mission.status === MISSION_STATUS.ON_THE_WAY ? 'arrive' : mission.status === MISSION_STATUS.ARRIVED ? 'start' : mission.status === MISSION_STATUS.IN_PROGRESS ? 'complete' : null;
    return `<div class="sheet__head"><div><strong>مأموریت فعال</strong><span>کد پیگیری ${numberFa(mission.trackingCode)}</span></div>${statusPill(missionStatusLabel(mission.status), 'info')}</div>
      <div class="sheet__body"><div class="rail">${MISSION_LABELS.map((label, i) => `<div class="rail__step ${i <= index ? 'is-done' : ''}"><i>${i < index ? icon('check') : numberFa(i + 1)}</i><span>${escapeHtml(label)}</span></div>`).join('')}</div>
      <div class="info-card">${icon('map-marker-distance')}<div><strong>${escapeHtml(mission.incidentLabel || 'مأموریت امداد')}</strong><span>${escapeHtml(formatDistance(1200))} تا محل حادثه</span></div></div></div>
      <div class="sheet__footer"><button type="button" class="primary-button primary-button--wide" data-action="mission-progress" data-id="${escapeHtml(mission.id)}" data-value="${escapeHtml(nextAction || 'complete')}"><span>${escapeHtml(nextAction ? missionActionLabel(nextAction) : 'پایان')}</span>${icon('arrow-left')}</button></div>`;
  }
  return `<div class="sheet__head"><div><strong>مأموریت</strong><span>پیشنهادهای دریافتی</span></div>${statusPill('آماده', 'success')}</div>
    <div class="sheet__body">${emptyState('پیشنهاد فعالی نیست', 'هنگامی که درخواست امدادی به شما اختصاص یابد، جزئیات اینجا نمایش داده میشود.', 'shield-check-outline')}
    <button type="button" class="ghost-button" data-action="ready">تغییر وضعیت آمادگی</button></div>`;
}

/** @param {any} state */
function companionsSheet(state) {
  const shares = state.shares || [];
  return `<div class="sheet__head"><div><strong>همراهان</strong><span>موقعیت زنده و تاریخچه</span></div><button type="button" class="sheet__expand" data-action="companion-add">${icon('account-plus-outline')}</button></div>
    <div class="sheet__body"><form class="inline-form" data-companion-form><input name="q" type="search" placeholder="جستوجوی نام کاربری"><button type="submit" class="small-button">${icon('magnify')}</button></form>
      <div id="companion-results" class="search-results"></div>
      <div class="share-list">${shares.length ? shares.map((share) => {
        const label = share.recipientUsername || share.ownerUsername || share.recipientId || share.ownerId || 'همراه';
        const freshness = share.kind === 'live' ? 'زنده' : 'تاریخچه';
        return `<div class="companion-row"><span class="freshness-ring ${share.kind === 'live' ? 'is-live' : ''}"><i>${escapeHtml(String(label).slice(0, 1).toUpperCase())}</i></span><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(freshness)} · ${escapeHtml(share.expiresAt ? formatDateTime(share.expiresAt) : 'بدون انقضا')}</span></div>
        <button type="button" class="icon-button" data-go="/_user/talk?peer=${encodeURIComponent(String(share.recipientId || share.ownerId || ''))}&name=${encodeURIComponent(String(label))}" aria-label="گفتگو">${icon('microphone')}</button>
        <button type="button" class="icon-button" data-action="revoke-share" data-id="${escapeHtml(share.id)}" aria-label="لغو اشتراک">${icon('close')}</button></div>`;
      }).join('') : emptyState('همراهی افزوده نشده', 'نام کاربری همراه را جستوجو کنید و موقعیت زنده یا تاریخچه را به اشتراک بگذارید.', 'account-group-outline')}</div></div>
    <div class="sheet__footer"><button type="button" class="primary-button primary-button--wide" data-action="share-live"><span>اشتراک موقعیت زنده</span>${icon('broadcast')}</button></div>`;
}

/** @param {any} state */
function historySheet(state) {
  const missions = (state.missions || []).slice(0, 5);
  const values = [4, 7, 5, 9, 8, 12, 10];
  return `<div class="sheet__head"><div><strong>تاریخچه</strong><span>سفرها، مأموریتها و همراهان</span></div><button type="button" class="sheet__expand" data-action="history-filter">${icon('filter-variant')}</button></div>
    <div class="sheet__body"><div class="chart-card"><div><strong>فعالیت هفت روز</strong><span>مسیرها و مأموریتها</span></div>${sparkline(values)}</div>
      <div class="segmented-control"><button class="is-active" type="button" data-action="history-tab" data-value="trips">سفرها</button><button type="button" data-action="history-tab" data-value="missions">مأموریتها</button><button type="button" data-action="history-tab" data-value="companions">همراهان</button></div>
      <div id="history-list" class="history-list">${missions.length ? missions.map((mission) => `<button type="button" class="history-row" data-action="history-detail" data-id="${escapeHtml(mission.id)}"><span class="history-row__icon">${icon('shield-check-outline')}</span><span><strong>${escapeHtml(mission.incidentLabel || 'مأموریت')}</strong><small>${escapeHtml(formatDateTime(mission.createdAt))}</small></span>${icon('chevron-left')}</button>`).join('') : emptyState('تاریخچهای ثبت نشده', 'پس از نخستین سفر یا مأموریت، گزارش اینجا نمایش داده میشود.', 'history')}</div>
      <form class="history-filter" data-history-form><input type="datetime-local" name="from"><input type="datetime-local" name="to"><button type="submit" class="small-button">اعمال</button></form></div>`;
}

/** @param {any} state */
function profileSheet(state) {
  const user = state.user || {};
  return `<div class="sheet__head"><div><strong>نمایه و حساب</strong><span>${escapeHtml(user.username || '')}</span></div><button type="button" class="sheet__expand" data-go="/_user/map">${icon('close')}</button></div>
    <div class="sheet__body"><div class="profile-hero"><span class="profile-avatar">${escapeHtml(String(user.username || 'R').slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(user.username || 'کاربر')}</strong><span>${escapeHtml(roleLabel(user.role))}</span></div>${statusPill(user.securityReady ? 'امنیت کامل' : 'نیاز به تکمیل', user.securityReady ? 'success' : 'warning')}</div>
      <form class="profile-form" data-profile-form><label>نام کاربری<input name="username" value="${escapeHtml(user.username || '')}"></label><button type="submit" class="small-button">ذخیره</button></form>
      <div class="profile-grid">${metric('امتیاز میانگین', numberFa(user.averageRating || 0))}${metric('نشستهای فعال', numberFa(state.devices?.items?.length || 0))}${metric('آمادگی مأموریت', user.readyForMission ? 'فعال' : 'غیرفعال')}</div>
      <div id="profile-devices" class="profile-list">${(state.devices?.items || []).slice(0, 4).map((device) => `<div><span>${icon(device.deviceName?.toLowerCase().includes('mobile') ? 'cellphone' : 'laptop')}</span><div><strong>${escapeHtml(device.deviceName || 'دستگاه')}</strong><small>${escapeHtml(formatDateTime(device.lastActiveAt))}</small></div><button type="button" class="icon-button" data-action="revoke-device" data-id="${escapeHtml(device.sessionId)}">${icon('logout')}</button></div>`).join('') || emptyState('دستگاهی نیست', 'نشستهای فعال پس از ورود نمایش داده میشوند.', 'devices')}</div></div>
    <div class="sheet__footer"><button type="button" class="danger-button" data-action="logout"><span>خروج از حساب</span>${icon('logout')}</button></div>`;
}

/** @param {any} state */
function talkSheet(state) {
  const peer = state.peerName || 'همراه';
  const active = state.talkState?.active;
  return `<div class="talk-panel">
    <div class="talk-panel__handle"></div>
    <div class="talk-panel__head"><span class="talk-avatar">${escapeHtml(String(peer).slice(0, 1).toUpperCase())}</span><div><strong>در ارتباط با ${escapeHtml(peer)}</strong><span>${active ? 'نگه داشته باشید — برای پایان رها کنید' : 'برای صحبت، دکمه را نگه دارید'}</span></div><span class="talk-timer" id="talk-timer">${escapeHtml(formatClock(Date.now()))}</span></div>
    <div class="waveform" aria-hidden="true">${Array.from({ length: 36 }, (_, index) => `<i style="height:${18 + ((index * 37) % 42)}px"></i>`).join('')}</div>
    <p class="talk-hint">${active ? 'صدای شما به همراه میرسد' : 'ارتباط دونفره است؛ مسیر سوم صدای شما را نمی شنود.'}</p>
    <button type="button" class="talk-hold" data-talk-hold aria-label="نگه دارید تا صحبت کنید">${icon('microphone')}</button>
    <p class="talk-foot">نگه داشتهاید — برای پایان رها کنید<br><small>ارتباط دونفره است؛ ضبط نمیشود و جایی ذخیره نمیماند.</small></p>
    <button type="button" class="text-link text-link--light" data-go="/_user/companions">بازگشت به همراهان</button>
  </div>`;
}

/** @param {string} status */
function sosStatusLabel(status) {
  return ({ pending: 'در انتظار اعزام', dispatched: 'اعزام شده', accepted: 'پذیرفته شده', in_progress: 'در رسیدگی', completed: 'پایان یافته', cancelled: 'لغو شده', expired: 'منقضی شده' })[status] || status;
}
/** @param {string} status */
function missionStatusLabel(status) {
  return ({ pending: 'پیشنهاد', on_the_way: 'در مسیر', arrived: 'رسیده', in_progress: 'در رسیدگی', completed: 'پایان یافته', cancelled: 'لغو شده' })[status] || status;
}
/** @param {string} action */
function missionActionLabel(action) {
  return ({ accept: 'پذیرش مأموریت', arrive: 'رسیدم', start: 'شروع رسیدگی', complete: 'پایان مأموریت', cancel: 'لغو' })[action] || action;
}
/** @param {string} role */
function roleLabel(role) { return role === 'admin' ? 'مدیر سامانه' : role === 'responder' ? 'امدادگر' : 'کاربر'; }

/** @param {string} view @param {any} state */
export function renderMap(view, state) {
  const detent = sheetDetent(view, state);
  const hasSheet = view !== 'talk';
  return `<main class="phone-shell phone-shell--${escapeHtml(view)}">
    ${statusBar()}${topPill(view)}${mapFurniture(state)}
    ${hasSheet ? `<section class="sheet" id="sheet" data-detent="${detent}" aria-label="پنل ${escapeHtml(view)}">
      <button type="button" class="sheet__handle" id="sheet-handle" aria-label="تغییر ارتفاع پنل"></button>
      <div class="sheet__inner" id="sheet-inner">${sheetContent(view, state)}</div>
    </section>` : talkSheet(state)}
    <div class="connection-badge" id="connection-badge">${icon('cloud-check-outline')}<span>برخط</span></div>
  </main>`;
}

/** @param {any} state */
function renderTiles(state) {
  const canvas = $('#map-canvas');
  const host = $('#map-tiles');
  const config = state.mapConfig;
  if (!canvas || !host || !config) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width || 393));
  const height = Math.max(640, Math.round(rect.height || 852));
  const zoom = Number(config.defaultZoom || 14);
  const center = config.center || { latitude: 35.7219, longitude: 51.3347 };
  const origin = worldCoordinate(Number(center.latitude), Number(center.longitude), zoom);
  const xMin = Math.floor((origin.x - width / 2) / 256);
  const xMax = Math.floor((origin.x + width / 2) / 256);
  const yMin = Math.floor((origin.y - height / 2) / 256);
  const yMax = Math.floor((origin.y + height / 2) / 256);
  const template = String(config.tileTemplate || '/_public/map/tiles/{z}/{x}/{y}.svg');
  const tiles = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      const url = template.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
      const left = x * 256 - origin.x + width / 2;
      const top = y * 256 - origin.y + height / 2;
      tiles.push(`<img class="map-tile" src="${escapeHtml(url)}" alt="" draggable="false" style="left:${left.toFixed(1)}px;top:${top.toFixed(1)}px">`);
    }
  }
  host.innerHTML = tiles.join('');
}

/** @param {any} state */
function renderLiveMarkers(state) {
  const host = $('#live-markers');
  if (!host || !state.mapConfig) return;
  const config = state.mapConfig;
  const canvas = $('#map-canvas');
  const rect = canvas?.getBoundingClientRect() || { width: 393, height: 852 };
  const zoom = Number(config.defaultZoom || 14);
  const center = config.center || { latitude: 35.7219, longitude: 51.3347 };
  const origin = worldCoordinate(Number(center.latitude), Number(center.longitude), zoom);
  host.innerHTML = '';
  for (const [userId, fix] of state.livePeers || new Map()) {
    if (userId === state.user?.id) continue;
    const point = worldCoordinate(Number(fix.latitude), Number(fix.longitude), zoom);
    const left = point.x - origin.x + rect.width / 2;
    const top = point.y - origin.y + rect.height / 2;
    if (left < -40 || left > rect.width + 40 || top < -40 || top > rect.height + 40) continue;
    const node = document.createElement('span');
    node.className = 'peer-marker';
    node.style.left = `${left.toFixed(1)}px`;
    node.style.top = `${top.toFixed(1)}px`;
    node.innerHTML = `<i>${icon('account')}</i><b>${escapeHtml(userId.slice(-1).toUpperCase())}</b>`;
    host.append(node);
  }
}

/** @param {any} state */
function updateConnection(state, status) {
  const badge = $('#connection-badge');
  if (!badge) return;
  const labels = { connected: 'برخط', connecting: 'در اتصال', disconnected: 'برونخط', error: 'خطای اتصال' };
  badge.dataset.status = status;
  badge.innerHTML = `${icon(status === 'connected' ? 'cloud-check-outline' : 'cloud-sync-outline')}<span>${escapeHtml(labels[status] || status)}</span>`;
}

/** @param {any} state */
function attachRealtime(state) {
  const unsubscribers = state.unsubscribers;
  unsubscribers.push(state.realtime.on('status', (status) => updateConnection(state, status)));
  unsubscribers.push(state.realtime.on('hello', (hello) => {
    for (const fix of hello.snapshot?.items || []) state.livePeers.set(fix.userId, fix);
    renderLiveMarkers(state);
  }));
  unsubscribers.push(state.realtime.on(WS_EVENTS.LOCATION_PEER, (message) => {
    state.livePeers.set(message.userId, message.fix);
    renderLiveMarkers(state);
  }));
  unsubscribers.push(state.realtime.on(WS_EVENTS.PRESENCE, (message) => {
    if (message.online) toast('یک همراه برخط شد.', 'info', 2200);
  }));
  unsubscribers.push(state.realtime.on(WS_EVENTS.TALK_STATE, (message) => {
    state.talkState = message;
    if (!message.active) state.talkAudio.stop();
    updateTalkPanel(state, message);
  }));
  unsubscribers.push(state.realtime.on('binary', (frame) => {
    if (state.talkState?.active) void state.talkAudio.play(frame);
  }));
  unsubscribers.push(state.realtime.on(WS_EVENTS.ERROR, (message) => toast(message.message || 'خطای ارتباط زنده', 'error')));
  unsubscribers.push(state.realtime.on(HTTP_EVENTS.SOS_CREATED, () => { void refreshSos(state); }));
  unsubscribers.push(state.realtime.on(HTTP_EVENTS.SOS_DISPATCHED, () => { void refreshSos(state); }));
  unsubscribers.push(state.realtime.on(HTTP_EVENTS.SOS_ACCEPTED, () => { void refreshSos(state); }));
  unsubscribers.push(state.realtime.on(HTTP_EVENTS.MISSION_UPDATED, () => { void refreshSos(state); }));
  unsubscribers.push(state.realtime.on(HTTP_EVENTS.LOCATION_SHARE_CREATED, () => { void refreshShares(state); }));
  unsubscribers.push(state.realtime.on(HTTP_EVENTS.LOCATION_SHARE_ENDED, () => { void refreshShares(state); }));
  void state.realtime.connect();
}

/** @param {any} state */
async function refreshSos(state) {
  try {
    const [sos, missions] = await Promise.all([get('/_user/sos'), get('/_user/missions')]);
    state.sosList = sos.items || [];
    state.missions = missions.items || [];
    const inner = $('#sheet-inner');
    if (inner && ['map', 'mission'].includes(state.view)) inner.innerHTML = sheetContent(state.view, state);
  } catch { /* transient network errors are handled by the transport */ }
}

/** @param {any} state */
async function refreshShares(state) {
  try {
    const result = await get('/_user/location/shares');
    state.shares = result.items || [];
    if (state.view === 'companions') {
      const inner = $('#sheet-inner');
      if (inner) inner.innerHTML = sheetContent('companions', state);
      bindSheetEvents(state);
    }
  } catch { /* transient network errors are handled by the transport */ }
}

/** @param {any} state */
function startLocation(state) {
  if (state.geoWatch !== null && state.geoWatch !== undefined || !navigator.geolocation) return;
  state.geoWatch = navigator.geolocation.watchPosition((position) => {
    state.realtime.sendJson({
      type: WS_EVENTS.LOCATION_UPDATE,
      latitude: position.coords.latitude, longitude: position.coords.longitude,
      accuracy: position.coords.accuracy || 20,
      heading: Number.isFinite(position.coords.heading) ? position.coords.heading : undefined,
      speed: Number.isFinite(position.coords.speed) ? position.coords.speed : undefined,
      recordedAt: position.timestamp
    });
  }, () => { /* location permission is optional */ }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
}

/** @param {any} state */
function stopLocation(state) {
  if (state.geoWatch !== null && state.geoWatch !== undefined) navigator.geolocation.clearWatch(state.geoWatch);
  state.geoWatch = null;
}

/** @param {any} state */
function attachSheetDrag(state) {
  const sheet = $('#sheet');
  const handle = $('#sheet-handle');
  if (!sheet || !handle) return;
  let startY = 0;
  let dragged = false;
  handle.addEventListener('pointerdown', (event) => {
    startY = event.clientY;
    dragged = false;
    handle.setPointerCapture?.(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!startY) return;
    if (Math.abs(event.clientY - startY) > 12) dragged = true;
  });
  handle.addEventListener('pointerup', (event) => {
    const delta = event.clientY - startY;
    startY = 0;
    if (!dragged) { cycleDetent(state); return; }
    if (delta > 45) setDetent(state, 'closed');
    else if (delta < -45) setDetent(state, 'open');
  });
}

/** @param {any} state @param {'closed'|'half'|'open'} value */
export function setDetent(state, value) {
  state.mapDetent = value;
  const sheet = $('#sheet');
  if (sheet) sheet.dataset.detent = value;
}
/** @param {any} state */
function cycleDetent(state) {
  const order = ['closed', 'half', 'open'];
  const current = $('#sheet')?.dataset.detent || 'half';
  setDetent(state, /** @type {any} */(order[(order.indexOf(current) + 1) % order.length]));
}

/** @param {any} state */
function attachHold(state) {
  const sos = $('[data-sos-hold]');
  let timer = null;
  const clear = () => { if (timer) window.clearTimeout(timer); timer = null; sos?.classList.remove('is-holding'); };
  if (sos) {
    sos.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      sos.classList.add('is-holding');
      timer = window.setTimeout(() => { clear(); resetSosDraft(state); go('/_user/sos'); }, 800);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) sos.addEventListener(type, clear);
  }
  const talk = $('[data-talk-hold]');
  let stopping = false;
  if (talk) {
    talk.addEventListener('pointerdown', async (event) => {
      event.preventDefault();
      if (!state.peerId) { toast('ابتدا همراه گفتگو را انتخاب کنید.', 'warning'); return; }
      state.talkAudio.preparePlayback();
      state.realtime.sendJson({ type: WS_EVENTS.TALK_START, peerUserId: state.peerId, requestId: `talk-${Date.now()}` });
      talk.classList.add('is-holding');
      stopping = false;
    });
    const release = (event) => {
      event.preventDefault();
      if (stopping) return;
      stopping = true;
      talk.classList.remove('is-holding');
      state.talkAudio.stop();
      if (state.talkState?.active && state.talkState.talkId) state.realtime.sendJson({ type: WS_EVENTS.TALK_STOP, talkId: state.talkState.talkId });
    };
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) talk.addEventListener(type, release);
  }
}

/** @param {any} state @param {any} message */
async function updateTalkPanel(state, message) {
  const timer = $('#talk-timer');
  if (timer) timer.textContent = formatClock(Date.now());
  if (message.active && message.speakerUserId === state.user?.id) {
    try { await state.talkAudio.start(Number(message.talkId)); } catch (error) { toast(errorMessage(error), 'error'); }
  }
}

/** @param {File} file */
async function compressPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const max = 720;
  const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const context = /** @type {CanvasRenderingContext2D} */(canvas.getContext('2d'));
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  let quality = 0.72;
  let data = canvas.toDataURL('image/jpeg', quality);
  while (data.length > 150000 && quality > 0.35) { quality -= 0.1; data = canvas.toDataURL('image/jpeg', quality); }
  if (data.length > 150000) throw new Error('عکس خیلی بزرگ است. عکس کوچکتری انتخاب کنید.');
  return data;
}

/** @param {any} state */
function bindSheetEvents(state) {
  const description = $('#sos-description');
  if (description) {
    description.addEventListener('input', () => {
      state.sosDraft.description = description.value;
      const count = $('#sos-count');
      if (count) count.textContent = `${numberFa(description.value.length)} / ${numberFa(500)}`;
    });
  }
  const photo = $('#sos-photo');
  if (photo) {
    photo.addEventListener('change', async () => {
      const file = photo.files?.[0];
      if (!file) return;
      try { state.sosDraft.photoDataUrl = await compressPhoto(file); toast('عکس آماده پیوست شد.', 'success'); rerender(); }
      catch (error) { toast(errorMessage(error), 'error'); }
    });
  }
}

/** @param {string} action @param {any} element @param {any} state */
async function performAction(action, element, state) {
  const value = element.getAttribute('data-value');
  const id = element.getAttribute('data-id');
  try {
    switch (action) {
      case 'theme': return;
      case 'layers': toast('لایههای نقشه: استاندارد', 'info', 1800); return;
      case 'compass': toast('جهت شمال تنظیم شد.', 'info', 1800); return;
      case 'recenter': toast('نقشه روی موقعیت شما مرکز شد.', 'success', 1800); return;
      case 'radar': toast('جستوجوی اطراف آماده است.', 'info', 1800); return;
      case 'place': toast('مقصد انتخاب شد.', 'success', 1800); return;
      case 'sheet-next': cycleDetent(state); return;
      case 'start-trip': toast('مسیریابی آغاز شد.', 'success'); return;
      case 'sos-severity': state.sosDraft.severity = value; rerender(); return;
      case 'sos-incident': state.sosDraft.incidentTypeId = value; rerender(); return;
      case 'sos-back': state.sosDraft.step = Math.max(1, Number(state.sosDraft.step) - 1); rerender(); return;
      case 'sos-next': {
        const draft = state.sosDraft;
        if (draft.step === 1 && String(draft.description || '').trim().length < 10) { toast('شرح حادثه حداقل ۱۰ نویسه باشد.', 'warning'); return; }
        if (draft.step === 4) {
          const payload = {
            incidentTypeId: draft.incidentTypeId, severity: draft.severity, description: draft.description.trim(),
            latitude: Number(draft.latitude), longitude: Number(draft.longitude), accuracy: Number(draft.accuracy), isManual: Boolean(draft.isManual)
          };
          if (draft.photoDataUrl) payload.photoDataUrl = draft.photoDataUrl;
          await post('/_user/sos', payload);
          toast('درخواست امداد ثبت شد.', 'success');
          await refreshSos(state);
          go('/_user/mission');
        } else { draft.step = Number(draft.step) + 1; rerender(); }
        return;
      }
      case 'sos-cancel': {
        const reason = (state.cancellationReasons || [])[0];
        if (!reason) { toast('دلیل لغو در دسترس نیست.', 'error'); return; }
        await post(`/_user/sos/${encodeURIComponent(id)}/cancel`, { reasonId: reason.id, detail: 'لغو توسط کاربر از پنل مأموریت' });
        toast('درخواست امداد لغو شد.', 'success'); await refreshSos(state); rerender(); return;
      }
      case 'mission-progress': await post(`/_user/missions/${encodeURIComponent(id)}/progress`, { action: value }); toast('وضعیت مأموریت بروز شد.', 'success'); await refreshSos(state); rerender(); return;
      case 'ready': await post('/_user/ready', { ready: !state.user?.readyForMission }); state.user.readyForMission = !state.user.readyForMission; toast('آمادگی بروز شد.', 'success'); return;
      case 'companion-add': { const input = $('[data-companion-form] input'); input?.focus(); return; }
      case 'revoke-share': await del(`/_user/location/shares/${encodeURIComponent(id)}`); toast('اشتراک لغو شد.', 'success'); await refreshShares(state); return;
      case 'share-live-selected':
        await post('/_user/location/shares', { recipientId: id, kind: 'live', durationSeconds: 3600 });
        toast('موقعیت زنده بهاشتراک گذاشته شد.', 'success'); await refreshShares(state); return;
      case 'share-live': {
        const first = (state.shares || [])[0];
        if (!first) { toast('ابتدا همراهی را جستوجو و انتخاب کنید.', 'warning'); return; }
        await post('/_user/location/shares', { recipientId: first.recipientId || first.ownerId, kind: 'live', durationSeconds: 3600 });
        toast('موقعیت زنده بهاشتراک گذاشته شد.', 'success'); await refreshShares(state); return;
      }
      case 'history-filter': toast('بازه تاریخچه را از فرم زیر انتخاب کنید.', 'info', 1800); return;
      case 'history-tab': {
        for (const button of document.querySelectorAll('[data-action="history-tab"]')) button.classList.toggle('is-active', button === element);
        return;
      }
      case 'history-detail': toast('جزئیات مسیر بارگذاری شد.', 'info', 1800); return;
      case 'revoke-device': await del(`/_user/devices/${encodeURIComponent(id)}`); toast('نشست بسته شد.', 'success'); return;
      case 'logout': await state.onLogout(); return;
      default: return;
    }
  } catch (error) {
    toast(errorMessage(error), 'error');
  }
}

/** @param {any} state */
async function handleSubmit(form, state) {
  const kind = form.getAttribute('data-companion-form') !== null ? 'companion' :
    form.getAttribute('data-profile-form') !== null ? 'profile' :
      form.getAttribute('data-history-form') !== null ? 'history' :
        form.getAttribute('data-action') === 'search' ? 'search' : 'none';
  const values = /** @type {any} */(Object.fromEntries(new FormData(form).entries()));
  try {
    if (kind === 'search') { toast(`جستوجو: ${values.q || 'همه مقصدها'}`, 'info', 1800); return; }
    if (kind === 'companion') {
      if (!values.q || String(values.q).trim().length < 2) { toast('حداقل دو نویسه وارد کنید.', 'warning'); return; }
      const result = await get('/_user/users/search', { q: values.q, limit: 8 });
      const host = $('#companion-results');
      if (host) host.innerHTML = (result.items || []).map((user) => `<div class="search-result"><span>${escapeHtml(user.username)}</span><button type="button" class="small-button" data-action="share-live-selected" data-id="${escapeHtml(user.id)}">اشتراک زنده</button></div>`).join('') || emptyState('کاربری یافت نشد', 'نام کاربری دقیقتری وارد کنید.', 'account-search-outline');
      return;
    }
    if (kind === 'profile') {
      await patch('/_user/me', { username: String(values.username).trim() });
      state.user.username = String(values.username).trim();
      toast('نمایه ذخیره شد.', 'success'); return;
    }
    if (kind === 'history') {
      const from = values.from ? new Date(values.from).getTime() : Date.now() - 86_400_000;
      const to = values.to ? new Date(values.to).getTime() : Date.now();
      const result = await get(`/_user/location/history/${encodeURIComponent(state.user.id)}`, { from, to, limit: 200 });
      toast(`${numberFa(result.total || 0)} نقطه مسیر بارگذاری شد.`, 'success'); return;
    }
  } catch (error) { toast(errorMessage(error), 'error'); }
}

/** @param {string} view @param {any} state */
export function bindMap(view, state) {
  state.view = view;
  renderTiles(state);
  renderLiveMarkers(state);
  attachSheetDrag(state);
  attachHold(state);
  bindSheetEvents(state);
  attachRealtime(state);
  startLocation(state);
  state.action = (action, element) => { void performAction(action, element, state); };
  state.submit = (form) => { void handleSubmit(form, state); };
  if (view === 'profile') {
    void (async () => {
      try {
        const [devices] = await Promise.all([get('/_user/devices')]);
        state.devices = devices;
        const list = $('#profile-devices');
        if (list) {
          const inner = $('#sheet-inner');
          if (inner) { inner.innerHTML = sheetContent('profile', state); bindSheetEvents(state); }
        }
      } catch (error) { toast(errorMessage(error), 'error'); }
    })();
  }
  if (view === 'talk' && state.peerId) {
    void (async () => {
      try {
        const result = await get('/_user/users/search', { q: state.peerId, limit: 1 });
        state.peerName = result.items?.[0]?.username || state.peerName || state.peerId;
        const title = $('.talk-panel__head strong');
        if (title) title.textContent = `در ارتباط با ${state.peerName}`;
      } catch { /* peer label is cosmetic */ }
    })();
  }
}
