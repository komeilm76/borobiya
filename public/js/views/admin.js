/** Desktop operations console. */
import { escapeHtml, icon, numberFa, formatDate, formatDateTime, formatDistance, statusPill, emptyState, errorPanel, metric, sparkline, toast, go, rerender } from '../ui.js';
import { get, post, patch, put, del, errorMessage } from '../api.js';
import { formatDuration, worldCoordinate } from '../geo.js';
import { HTTP_EVENTS, SOS_STATUS } from '../protocol.js';

/** @param {string} selector @returns {any} */
function $(selector) { return document.querySelector(selector); }

const NAV = [
  { group: 'عملیات', items: [
    { id: 'overview', label: 'نمای کلی', icon: 'view-dashboard-outline', path: '/_admin/overview' },
    { id: 'dispatch', label: 'اعزام و امداد', icon: 'bullseye-arrow', path: '/_admin/dispatch' },
    { id: 'reports', label: 'گزارشها', icon: 'file-chart-outline', path: '/_admin/reports' }
  ] },
  { group: 'مدیریت', items: [
    { id: 'users', label: 'کاربران', icon: 'account-group-outline', path: '/_admin/users' },
    { id: 'groups', label: 'گروههای امداد', icon: 'earth', path: '/_admin/groups' },
    { id: 'incidents', label: 'انواع حادثه', icon: 'shape-outline', path: '/_admin/incidents' }
  ] },
  { group: 'سامانه', items: [
    { id: 'audit', label: 'گزارش رویدادها', icon: 'history', path: '/_admin/audit' },
    { id: 'alerts', label: 'هشدارها', icon: 'bell-outline', path: '/_admin/alerts' },
    { id: 'settings', label: 'تنظیمات', icon: 'cog-outline', path: '/_admin/settings' }
  ] }
];

const TITLES = {
  overview: { title: 'نمای کلی', crumb: 'عملیات / نمای کلی', subtitle: 'وضعیت لحظهای کاربران، مأموریتهای فعال، درخواستهای امداد و آمادگی گروهها.' },
  dispatch: { title: 'اعزام و امداد', crumb: 'عملیات / اعزام و امداد', subtitle: 'درخواستهای باز، نزدیکترین امدادگران و ثبت اعزام — همه در یک صفحه.' },
  reports: { title: 'گزارشها', crumb: 'عملیات / گزارشها', subtitle: 'روند هفت روز، توزیع وضعیتها و شاخصهای پاسخگویی.' },
  users: { title: 'کاربران', crumb: 'مدیریت / کاربران', subtitle: 'جستوجو، دسترسی و عضویت امدادگران — تغییر وضعیت بلافاصله اعمال میشود.' },
  groups: { title: 'گروههای امداد', crumb: 'مدیریت / گروههای امداد', subtitle: 'پوشش حادثه، ظرفیت و اعضای هر گروه امدادی.' },
  incidents: { title: 'انواع حادثه', crumb: 'مدیریت / انواع حادثه', subtitle: 'فهرست طبقهبندیهای قابل انتخاب هنگام ثبت درخواست امداد.' },
  audit: { title: 'گزارش رویدادها', crumb: 'سامانه / گزارش رویدادها', subtitle: 'همه اقدامات حساس با کد پیگیری، کاربر، زمان و نشانیIP ثبت شدهاند.' },
  alerts: { title: 'هشدارها', crumb: 'سامانه / هشدارها', subtitle: 'هشدارهای عملیاتی باز و بررسیشده در یک نما.' },
  settings: { title: 'تنظیمات', crumb: 'سامانه / تنظیمات', subtitle: 'سیاستهای اعزام، شعاع جستوجو، آمادگی مأموریت و حالت نگهداری.' }
};

/** @param {any} state */
export async function ensureAdminData(state) {
  try {
    const [overview, users, groups, incidents, audit, alerts, settings, dispatch, health, mapConfig] = await Promise.all([
      get('/_admin/overview'), get('/_admin/users'), get('/_admin/groups'), get('/_admin/incident-types'),
      get('/_admin/audit'), get('/_admin/alerts?includeResolved=true').catch(() => ({ items: [] })),
      get('/_admin/settings'), get('/_admin/dispatch'), get('/_admin/system/health'), get('/_public/map/config')
    ]);
    state.admin = {
      overview, users, groups, incidents, audit, alerts,
      settings, dispatch, health, mapConfig,
      nearest: state.admin?.nearest || [], selectedSosId: state.admin?.selectedSosId || dispatch.queue?.items?.[0]?.id || null
    };
    state.adminError = null;
  } catch (error) {
    state.adminError = errorMessage(error);
  }
}

/** @param {any} config */
function mapTileUrl(config) {
  if (!config?.tileTemplate || !config?.center) return '';
  const zoom = Number(config.defaultZoom || 14);
  const world = worldCoordinate(Number(config.center.latitude), Number(config.center.longitude), zoom);
  const x = Math.floor(world.x / 256);
  const y = Math.floor(world.y / 256);
  return String(config.tileTemplate).replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
}

/** @param {string} view */
function sidebar(view) {
  return `<aside class="admin-sidebar">
    <div class="admin-brand"><img src="/assets/logo.svg" alt=""><div><strong>بورو بیا</strong><span>پلتفرم مدیریت امداد</span></div></div>
    <nav class="admin-nav">${NAV.map((section) => `<div class="admin-nav__group"><span>${escapeHtml(section.group)}</span>${section.items.map((item) => `<button type="button" class="admin-nav__item ${item.id === view ? 'is-active' : ''}" data-go="${item.path}">${icon(item.icon)}<span>${escapeHtml(item.label)}</span>${item.id === view ? '<i></i>' : ''}</button>`).join('')}</div>`).join('')}</nav>
    <div class="admin-user"><span class="admin-user__avatar">${icon('account-outline')}</span><div><strong>مهدی رستمی</strong><span>مدیر ارشد امداد</span></div>${icon('chevron-left')}</div>
  </aside>`;
}

/** @param {string} view */
function topbar(view) {
  const meta = TITLES[view] || TITLES.overview;
  return `<header class="admin-topbar">
    <div class="admin-crumb"><span>${escapeHtml(meta.crumb)}</span></div>
    <div class="admin-topbar__tools">
      <button type="button" class="admin-search" data-action="command">${icon('magnify')}<span>جستوجوی کاربر، مأموریت، درخواست...</span><kbd>Ctrl K</kbd></button>
      <button type="button" class="admin-icon has-dot" data-action="notifications" aria-label="اعلانها">${icon('bell-outline')}</button>
      <button type="button" class="admin-icon" data-action="help" aria-label="راهنما">${icon('help-circle-outline')}</button>
      <button type="button" class="admin-avatar" data-action="account" aria-label="حساب">م</button>
    </div>
  </header>`;
}

/** @param {string} label @param {unknown} value @param {string} note @param {'success'|'warning'|'danger'|'info'|'neutral'} [tone] @param {string} [iconName] */
function kpi(label, value, note, tone = 'neutral', iconName = 'chart-line') {
  return `<article class="kpi-card"><span class="kpi-card__icon">${icon(iconName)}</span><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div><em class="kpi-card__note kpi-card__note--${tone}">${icon('circle-medium')}${escapeHtml(note)}</em></article>`;
}

/** @param {string} label @param {string} action @param {string} [style] */
function actionButton(label, action, style = 'primary') {
  return `<button type="button" class="admin-button admin-button--${style}" data-action="${action}">${icon(style === 'primary' && action.includes('report') ? 'download' : action.includes('refresh') ? 'refresh' : 'plus')}<span>${escapeHtml(label)}</span></button>`;
}

/** @param {string} view @param {any} state */
function pageHeader(view, state) {
  const meta = TITLES[view] || TITLES.overview;
  const actions = {
    overview: `${actionButton('گزارش روز', 'export-audit')}${actionButton('بروزرسانی', 'admin-refresh', 'soft')}`,
    dispatch: `${actionButton('بازخوانی صف', 'admin-refresh', 'soft')}`,
    reports: `${actionButton('گزارش روز', 'export-audit')}`,
    users: `${actionButton('کاربر جدید', 'new-user')}${actionButton('خروجی CSV', 'export-users', 'soft')}`,
    groups: `${actionButton('گروه تازه', 'new-group')}`,
    incidents: `${actionButton('بروزرسانی', 'admin-refresh', 'soft')}`,
    audit: `${actionButton('خروجی CSV', 'export-audit')}`,
    alerts: `${actionButton('بازخوانی', 'admin-refresh', 'soft')}`,
    settings: `${actionButton('بازخوانی', 'admin-refresh', 'soft')}`
  }[view] || '';
  return `<div class="admin-page-head"><div><h1>${escapeHtml(meta.title)}</h1><p>${escapeHtml(meta.subtitle)}</p></div><div class="admin-page-actions">${actions}</div></div>`;
}

/** @param {string} title @param {string} body @param {string} [className] */
function card(title, body, className = '') {
  return `<section class="admin-card ${className}"><div class="admin-card__head"><strong>${escapeHtml(title)}</strong></div><div class="admin-card__body">${body}</div></section>`;
}

/** @param {string} status */
function statusLabel(status) {
  return ({ pending: 'در انتظار', dispatched: 'اعزام شده', accepted: 'پذیرفته شده', in_progress: 'در رسیدگی', completed: 'پایان یافته', cancelled: 'لغو شده', expired: 'منقضی شده', on_the_way: 'در مسیر', arrived: 'رسیده' })[status] || status;
}
/** @param {string} status */
function statusTone(status) {
  if (status === SOS_STATUS.COMPLETED) return 'success';
  if (status === SOS_STATUS.CANCELLED || status === SOS_STATUS.EXPIRED) return 'danger';
  if (status === SOS_STATUS.PENDING) return 'danger';
  if (status === SOS_STATUS.IN_PROGRESS || status === SOS_STATUS.DISPATCHED) return 'warning';
  return 'info';
}
/** @param {string} role */
function roleLabel(role) { return role === 'admin' ? 'مدیر سامانه' : role === 'responder' ? 'امدادگر' : 'کاربر'; }
/** @param {string} action */
function auditLabel(action) { return ({ 'user.update': 'ویرایش کاربر', 'user.create': 'ساخت کاربر', 'group.create': 'ساخت گروه', 'group.update': 'ویرایش گروه', 'group.member.add': 'افزودن عضو', 'group.member.remove': 'حذف عضو', 'alert.resolve': 'بررسی هشدار', 'settings.update': 'ویرایش تنظیمات' })[action] || action; }

/** @param {any} state */
function overviewContent(state) {
  const data = state.admin?.overview || {};
  const kpis = data.kpis || {};
  const groups = (data.groups || []).slice(0, 4);
  const alerts = (data.alerts || []).slice(0, 4);
  const recent = (data.recentRequests || []).slice(0, 5);
  const trend = (data.trend || []).map((item) => Number(item.count || 0));
  const mapUrl = mapTileUrl(state.admin?.mapConfig);
  const groupBody = groups.map((group) => `<div class="group-row"><span class="group-row__dot" style="background:${escapeHtml(group.color)}"></span><div><strong>${escapeHtml(group.name)}</strong><span>${numberFa(group.memberCount || 0)} از ${numberFa(group.capacity || 0)} نفر</span></div>${statusPill(group.status === 'paused' ? 'متوقف' : 'آماده', group.status === 'paused' ? 'danger' : 'success')}</div>`).join('') || emptyState('گروهی تعریف نشده', 'برای پوشش انواع حادثه، گروه امدادی بسازید.', 'account-group-outline');
  const alertBody = alerts.map((alert) => `<div class="alert-row ${alert.severity === 'danger' ? 'is-danger' : alert.severity === 'warning' ? 'is-warning' : ''}"><i></i><div><strong>${escapeHtml(alert.message)}</strong><span>${escapeHtml(formatDateTime(alert.createdAt))}</span></div><button type="button" class="icon-button" data-action="alert-resolve" data-id="${escapeHtml(alert.id)}" aria-label="بررسی">${icon('check')}</button></div>`).join('') || emptyState('هشدار بازی نیست', 'همه شاخصهای عملیاتی در وضعیت مطلوباند.', 'bell-check-outline');
  const tableBody = recent.length ? `<table class="admin-table"><thead><tr><th>درخواستکننده</th><th>نوع حادثه</th><th>موقعیت</th><th>زمان</th><th>وضعیت</th><th></th></tr></thead><tbody>${recent.map((row) => `<tr>
    <td><span class="table-user"><i>${escapeHtml(String(row.requesterUsername || 'ک').slice(0, 1).toUpperCase())}</i><span>${escapeHtml(row.requesterUsername || 'کاربر')}</span></span></td>
    <td>${escapeHtml(row.incidentLabel || '—')}</td><td>موقعیت ثبتشده</td><td>${escapeHtml(formatDateTime(row.createdAt))}</td>
    <td>${statusPill(statusLabel(row.status), statusTone(row.status))}</td>
    <td class="admin-table__menu"><button type="button" data-action="sos-detail" data-id="${escapeHtml(row.id)}">${icon('dots-vertical')}</button></td></tr>`).join('')}</tbody></table>` : emptyState('درخواستی ثبت نشده', 'نخستین درخواست امداد در این جدول نمایش داده میشود.', 'clipboard-text-outline');
  return `<div class="kpi-grid">
    ${kpi('امدادگران آنلاین', numberFa(kpis.onlineResponders || 0), 'از ۴۴ نفر', 'info', 'account-group-outline')}
    ${kpi('میانگین زمان پاسخ', formatDuration(kpis.averageResponseSeconds || 0), '۴۲ ثانیه سریعتر', 'success', 'timer-outline')}
    ${kpi('مأموریتهای فعال', numberFa(kpis.activeMissions || 0), '۲ در انتظار پذیرش', 'warning', 'steering')}
    ${kpi('درخواستهای امروز', numberFa(kpis.requestsToday || 0), '۱۲٪ بیشتر از دیروز', 'info', 'bell-ring-outline')}
  </div>
  <div class="admin-overview-grid">
    ${card('نقشه عملیات زنده', `<div class="admin-map"><span class="live-chip">${icon('circle-medium')}زنده</span><img src="${escapeHtml(mapUrl)}" alt="نقشه عملیات"><span class="admin-map__marker admin-map__marker--one">${icon('fire')}</span><span class="admin-map__marker admin-map__marker--two">${icon('account')}</span><span class="admin-map__marker admin-map__marker--three">${icon('crosshairs-gps')}</span><span class="admin-map__footer">آخرین بروزرسانی ${escapeHtml(formatDateTime(data.serverTime || Date.now()))}</span></div>`, 'admin-card--map')}
    ${card('گروههای امداد', groupBody, 'admin-card--groups')}
    ${card('آخرین درخواستهای امداد', tableBody, 'admin-card--table')}
    ${card('هشدارهای سامانه', alertBody, 'admin-card--alerts')}
  </div>`;
}

/** @param {any} state */
function reportsContent(state) {
  const data = state.admin?.overview || {};
  const trend = (data.trend || []).map((item) => Number(item.count || 0));
  const counts = data.statusCounts || {};
  return `<div class="report-grid">
    ${card('روند هفت روز', `<div class="report-chart">${sparkline(trend, '#0E6666')}<div>${(data.trend || []).map((item) => `<span>${escapeHtml(item.day)}<strong>${numberFa(item.count)}</strong></span>`).join('')}</div></div>`, 'admin-card--chart')}
    ${card('توزیع وضعیتها', Object.entries(counts).map(([key, value]) => `<div class="distribution-row"><span>${escapeHtml(statusLabel(key))}</span><div><i style="width:${Math.min(100, Number(value) * 12)}%"></i></div><strong>${numberFa(value)}</strong></div>`).join('') || emptyState('دادهای نیست', 'پس از ثبت درخواستها، توزیع وضعیتها اینجا ظاهر میشود.', 'chart-box-outline'), 'admin-card--distribution')}
  </div>
  <div class="kpi-grid">${kpi('کل درخواستها', numberFa(Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0)), 'بازه هفت روز', 'info', 'clipboard-list-outline')}${kpi('میانگین پاسخ', formatDuration(data.kpis?.averageResponseSeconds || 0), 'از ثبت تا پذیرش', 'success', 'timer-outline')}${kpi('مأموریتهای فعال', numberFa(data.kpis?.activeMissions || 0), 'لحظهای', 'warning', 'steering')}${kpi('امدادگران برخط', numberFa(data.kpis?.onlineResponders || 0), 'از طریق سوکت', 'info', 'lan-connect')}</div>`;
}

/** @param {any} state */
function dispatchContent(state) {
  const data = state.admin?.dispatch || {};
  const queue = data.queue?.items || [];
  const groups = data.groups?.items || [];
  const selected = queue.find((item) => item.id === state.admin?.selectedSosId) || queue[0];
  const nearest = state.admin?.nearest || [];
  const mapUrl = mapTileUrl(state.admin?.mapConfig);
  return `<div class="admin-dispatch-grid">
    <section class="admin-card admin-card--detail"><div class="admin-card__head"><strong>جزئیات درخواست</strong>${selected ? statusPill('باز', 'danger') : ''}</div><div class="admin-card__body">
      ${selected ? `<h2>${escapeHtml(selected.incidentLabel || 'درخواست امداد')}</h2><p class="dispatch-subtitle">${escapeHtml(selected.description || 'شرح حادثه')}</p>
      <dl class="detail-list"><div><dt>نوع حادثه</dt><dd>${escapeHtml(selected.incidentLabel || '—')}</dd></div><div><dt>درخواستکننده</dt><dd>${escapeHtml(selected.requesterId)}</dd></div><div><dt>زمان ثبت</dt><dd>${escapeHtml(formatDateTime(selected.createdAt))}</dd></div><div><dt>اولویت</dt><dd>${escapeHtml(selected.severity === 'high' ? 'بحرانی' : 'معمولی')}</dd></div></dl>
      <form data-admin-form="dispatch-form" class="dispatch-form"><label>گروه امدادی<select name="groupId">${groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join('')}</select></label><span class="dispatch-label">امدادگران انتخابی</span><div class="responder-list">${nearest.map((responder) => `<label><input type="checkbox" name="responderIds" value="${escapeHtml(responder.id)}" checked><span>${escapeHtml(responder.username)}</span><small>${escapeHtml(formatDistance(responder.distanceMeters || 0))}</small></label>`).join('') || '<span>امدادگری در شعاع یافت نشد.</span>'}</div><button type="submit" class="admin-button admin-button--primary admin-button--wide">${icon('send-outline')}<span>ثبت و ارسال اعزام</span></button></form>
      <button type="button" class="admin-button admin-button--soft admin-button--wide" data-action="dispatch-cancel">انصراف از درخواست</button>` : emptyState('صف خالی است', 'همه درخواستهای باز پردازش شدهاند.', 'check-circle-outline')}
    </div></section>
    <section class="admin-card admin-card--dispatch-map"><div class="admin-card__head"><strong>موقعیت حادثه</strong>${icon('map-marker-outline')}</div><div class="admin-card__body"><div class="admin-map"><img src="${escapeHtml(mapUrl)}" alt="موقعیت حادثه"><span class="admin-map__marker admin-map__marker--one">${icon('fire')}</span></div>
      ${card('نزدیکترین امدادگران', nearest.map((responder) => `<div class="responder-row"><i>${escapeHtml(String(responder.username || 'ا').slice(0, 1).toUpperCase())}</i><div><strong>${escapeHtml(responder.username || 'امدادگر')}</strong><span>${escapeHtml(formatDistance(responder.distanceMeters || 0))}</span></div>${statusPill(responder.ready ? 'آماده' : 'در مأموریت', responder.ready ? 'success' : 'warning')}</div>`).join('') || emptyState('امدادگری یافت نشد', 'شعاع جستوجو یا فیلتر گروه را تغییر دهید.', 'account-search-outline'), 'admin-card--nested')}
    </div></section>
    <section class="admin-card admin-card--queue"><div class="admin-card__head"><strong>صف درخواستها</strong><span>${numberFa(queue.length)} باز</span></div><div class="admin-card__body">${queue.length ? queue.map((item) => `<button type="button" class="queue-card ${selected?.id === item.id ? 'is-selected' : ''}" data-action="dispatch-select" data-id="${escapeHtml(item.id)}">${statusPill(statusLabel(item.status), statusTone(item.status))}<strong>${escapeHtml(item.incidentLabel || 'درخواست امداد')}</strong><span>${escapeHtml(formatDateTime(item.createdAt))}</span><small>${escapeHtml(item.description || '')}</small></button>`).join('') : emptyState('درخواست بازی نیست', 'صف اعزام خالی است.', 'clipboard-check-outline')}</div></section>
  </div>`;
}

/** @param {any} state */
function usersContent(state) {
  const data = state.admin?.users || {};
  const items = data.items || [];
  return `<div class="kpi-grid">
    ${kpi('مدیران', numberFa(4), 'شامل حساب شما', 'info', 'shield-account-outline')}
    ${kpi('بدون گروه امداد', numberFa(23), 'نیازمند تخصیص', 'warning', 'account-alert-outline')}
    ${kpi('غیرفعال', numberFa(8), '۳ نفر این هفته', 'danger', 'account-cancel-outline')}
    ${kpi('کل کاربران', numberFa(data.total || 0), '۹۳٪ تکمیل پروفایل', 'success', 'account-group-outline')}
  </div>
  <div class="admin-toolbar"><form data-admin-form="user-filters" class="admin-filters"><label><span>همه وضعیتها</span><select name="active"><option value="">همه</option><option value="true">فعال</option><option value="false">غیرفعال</option></select></label><label><span>همه گروهها</span><select name="group"><option value="">همه</option></select></label><label><span>همه نقشها</span><select name="role"><option value="">همه</option><option value="admin">مدیر</option><option value="responder">امدادگر</option><option value="user">کاربر</option></select></label><label class="admin-filter-search">${icon('magnify')}<input type="search" name="q" placeholder="جستوجوی نام کاربری یا شماره همراه"></label><button class="small-button" type="submit">اعمال</button></form><div class="admin-tabs"><button class="is-active">${numberFa(data.total || 0)} کاربر</button><button>${numberFa(4)} مدیران</button><button>${numberFa(136)} امدادگر</button></div></div>
  <section class="admin-card admin-card--users"><div class="admin-card__body"><table class="admin-table"><thead><tr><th>کاربر</th><th>نقش</th><th>گروه امداد</th><th>آخرین ورود</th><th>وضعیت</th><th></th></tr></thead><tbody>${items.length ? items.map((user) => `<tr>
    <td><span class="table-user"><i>${escapeHtml(String(user.username || 'ک').slice(0, 1).toUpperCase())}</i><span><strong>${escapeHtml(user.username)}</strong><small>${escapeHtml(user.id)}</small></span></span></td>
    <td>${escapeHtml(roleLabel(user.role))}</td><td>گروه عملیاتی</td><td>${escapeHtml(formatDateTime(user.updatedAt))}</td>
    <td>${statusPill(user.active ? 'فعال' : 'غیرفعال', user.active ? 'success' : 'danger')}</td>
    <td class="admin-table__menu"><button type="button" data-action="user-detail" data-id="${escapeHtml(user.id)}">${icon('dots-vertical')}</button></td></tr>`).join('') : `<tr><td colspan="6">${emptyState('کاربری یافت نشد', 'فیلترها را تغییر دهید.', 'account-search-outline')}</td></tr>`}</tbody></table><div class="table-footer">نمایش ${numberFa(items.length)} کاربر از ${numberFa(data.total || 0)} · صفحه ${numberFa(data.page || 1)}</div></div></section>`;
}

/** @param {any} state */
function groupsContent(state) {
  const groups = state.admin?.groups?.items || [];
  const incidents = state.admin?.incidents?.items || [];
  return `<div class="group-grid">${groups.length ? groups.map((group) => `<section class="admin-card group-card"><div class="group-card__stripe" style="background:${escapeHtml(group.color)}"></div><div class="admin-card__head"><strong>${escapeHtml(group.name)}</strong><button type="button" class="icon-button" data-action="group-edit" data-id="${escapeHtml(group.id)}">${icon('pencil-outline')}</button></div><div class="admin-card__body"><div class="group-capacity"><strong>${numberFa(group.memberCount || 0)}</strong><span>از ${numberFa(group.capacity || 0)} عضو</span><div><i style="width:${Math.min(100, ((group.memberCount || 0) / Math.max(1, group.capacity || 1)) * 100)}%"></i></div></div><div class="group-tags">${(group.incidentIds || []).map((id) => `<span>${escapeHtml(incidents.find((incident) => incident.id === id)?.label || id)}</span>`).join('')}</div><div class="group-actions"><button type="button" class="small-button" data-action="group-member" data-id="${escapeHtml(group.id)}">افزودن عضو</button>${statusPill(group.status === 'paused' ? 'متوقف' : 'آماده', group.status === 'paused' ? 'danger' : 'success')}</div></div></section>`).join('') : emptyState('گروهی تعریف نشده', 'نخستین گروه امدادی را بسازید.', 'account-group-outline')}</div>`;
}

/** @param {any} state */
function incidentsContent(state) {
  const items = state.admin?.incidents?.items || [];
  return `<section class="admin-card"><div class="admin-card__body"><div class="incident-catalog">${items.map((item) => `<div class="incident-tile"><span style="background:${escapeHtml(item.color || '#E4F0EE')}">${icon(item.icon || 'alert-circle-outline')}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.id)}</small></div></div>`).join('')}</div></div></section>`;
}

/** @param {any} state */
function auditContent(state) {
  const items = state.admin?.audit?.items || [];
  return `<div class="admin-toolbar"><form data-admin-form="audit-filters" class="admin-filters"><label class="admin-filter-search">${icon('magnify')}<input type="search" name="q" placeholder="جستوجوی کاربر، اقدام یا کد"></label><label><span>اقدام</span><select name="action"><option value="">همه اقدامات</option>${['user.create', 'user.update', 'group.create', 'group.update', 'settings.update', 'alert.resolve'].map((action) => `<option value="${action}">${escapeHtml(auditLabel(action))}</option>`).join('')}</select></label><button class="small-button" type="submit">اعمال</button></form></div>
  <section class="admin-card"><div class="admin-card__body"><table class="admin-table"><thead><tr><th>کد پیگیری</th><th>کاربر</th><th>اقدام</th><th>هدف</th><th>زمان</th><th>IP</th></tr></thead><tbody>${items.length ? items.map((row) => `<tr><td>${numberFa(row.trackingCode)}</td><td>${escapeHtml(row.actorUsername || 'سامانه')}</td><td>${escapeHtml(auditLabel(row.action))}</td><td>${escapeHtml(row.target)}</td><td>${escapeHtml(formatDateTime(row.createdAt))}</td><td dir="ltr">${escapeHtml(row.ip)}</td></tr>`).join('') : `<tr><td colspan="6">${emptyState('رویدادی ثبت نشده', 'اقدامات مدیریتی اینجا قابل پیگیریاند.', 'clipboard-list-outline')}</td></tr>`}</tbody></table></div></section>`;
}

/** @param {any} state */
function alertsContent(state) {
  const items = state.admin?.alerts?.items || [];
  return `<div class="alert-grid">${items.length ? items.map((alert) => `<section class="admin-card alert-card"><div class="admin-card__head"><strong>${escapeHtml(alert.severity === 'danger' ? 'بحرانی' : alert.severity === 'warning' ? 'هشدار' : 'اطلاع')}</strong>${statusPill(alert.resolvedAt ? 'بررسی شده' : 'باز', alert.resolvedAt ? 'success' : alert.severity === 'danger' ? 'danger' : 'warning')}</div><div class="admin-card__body"><p>${escapeHtml(alert.message)}</p><span>${escapeHtml(formatDateTime(alert.createdAt))}</span>${!alert.resolvedAt ? `<button type="button" class="admin-button admin-button--soft" data-action="alert-resolve" data-id="${escapeHtml(alert.id)}">بررسی شد</button>` : ''}</div></section>`).join('') : emptyState('هشداری نیست', 'سامانه در وضعیت پایدار است.', 'bell-check-outline')}</div>`;
}

/** @param {any} state */
function settingsContent(state) {
  const items = state.admin?.settings?.items || [];
  const values = Object.fromEntries(items.map((item) => [item.key, item.value]));
  return `<div class="settings-grid"><form class="admin-card settings-card" data-admin-form="settings-form"><div class="admin-card__head"><strong>سیاستهای عملیاتی</strong></div><div class="admin-card__body">
    <label class="setting-row"><span><strong>اعزام خودکار</strong><small>ارسال خودکار نزدیکترین امدادگران پس از ثبت درخواست</small></span><select name="sos_auto_dispatch"><option value="0" ${values.sos_auto_dispatch === '0' ? 'selected' : ''}>غیرفعال</option><option value="1" ${values.sos_auto_dispatch === '1' ? 'selected' : ''}>فعال</option></select></label>
    <label class="setting-row"><span><strong>شعاع پیشفرض اعزام</strong><small>بر حسب متر، برای یافتن امدادگران نزدیک</small></span><input name="default_dispatch_radius_m" type="number" min="100" max="999999" value="${escapeHtml(values.default_dispatch_radius_m || '2500')}"></label>
    <label class="setting-row"><span><strong>الزام آمادگی مأموریت</strong><small>فقط امدادگران آماده در فهرست اعزام قرار گیرند</small></span><select name="mission_ready_required"><option value="0" ${values.mission_ready_required === '0' ? 'selected' : ''}>غیرفعال</option><option value="1" ${values.mission_ready_required === '1' ? 'selected' : ''}>فعال</option></select></label>
    <label class="setting-row"><span><strong>حالت نگهداری</strong><small>جلوگیری از عملیات تازه هنگام بروزرسانی سامانه</small></span><select name="maintenance_mode"><option value="0" ${values.maintenance_mode === '0' ? 'selected' : ''}>غیرفعال</option><option value="1" ${values.maintenance_mode === '1' ? 'selected' : ''}>فعال</option></select></label>
    <button type="submit" class="admin-button admin-button--primary">${icon('content-save-outline')}<span>ذخیره تنظیمات</span></button>
  </div></form>
  <section class="admin-card health-card"><div class="admin-card__head"><strong>سلامت سامانه</strong>${statusPill('پایدار', 'success')}</div><div class="admin-card__body">${metric('اتصالهای زنده', numberFa(state.admin?.health?.realtime?.connections ?? 0))}${metric('نسخه نقشه', state.admin?.health?.map?.dataVersion || '—')}${metric('کش نقشه', numberFa(state.admin?.health?.map?.tiles?.size ?? 0))}${metric('زمان کار', formatDuration(Math.floor((state.admin?.health?.uptimeSeconds || 0) / 60) * 60))}</div></section></div>`;
}

/** @param {any} state */
function modal(state) {
  const data = state.modal;
  if (!data) return '';
  let title = '';
  let body = '';
  if (data.type === 'command') {
    title = 'جستوجوی سریع';
    body = `<div class="command-list">${NAV.flatMap((section) => section.items).map((item) => `<button type="button" data-go="${item.path}" data-action="modal-close">${icon(item.icon)}<span>${escapeHtml(item.label)}</span>${icon('chevron-left')}</button>`).join('')}</div>`;
  } else if (data.type === 'new-user') {
    title = 'کاربر جدید';
    body = `<form data-admin-form="new-user" class="modal-form"><label>نام کاربری<input name="username" required minlength="3" maxlength="40"></label><label>گذرواژه موقت<input name="password" type="password" required minlength="8"></label><label>نقش<select name="role"><option value="user">کاربر</option><option value="responder">امدادگر</option><option value="admin">مدیر</option></select></label><p class="modal-note">کاربر در نخستین ورود پنج پرسش امنیتی را تکمیل میکند.</p><button type="submit" class="admin-button admin-button--primary admin-button--wide">ساخت کاربر</button></form>`;
  } else if (data.type === 'user-detail' || data.type === 'user-role') {
    title = 'حساب کاربر';
    const user = data.user || {};
    body = `<div class="modal-profile"><span>${escapeHtml(String(user.username || 'ک').slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(user.username || '')}</strong><small>${escapeHtml(user.role || '')}</small></div></div><form data-admin-form="user-role" class="modal-form"><input type="hidden" name="userId" value="${escapeHtml(user.id || '')}"><label>نقش<select name="role"><option value="user" ${user.role === 'user' ? 'selected' : ''}>کاربر</option><option value="responder" ${user.role === 'responder' ? 'selected' : ''}>امدادگر</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>مدیر</option></select></label><label>وضعیت<select name="active"><option value="true" ${user.active !== false ? 'selected' : ''}>فعال</option><option value="false" ${user.active === false ? 'selected' : ''}>غیرفعال</option></select></label><button type="submit" class="admin-button admin-button--primary admin-button--wide">ذخیره تغییرات</button></form>`;
  } else if (data.type === 'group-form') {
    const group = data.group || {};
    const incidents = state.admin?.incidents?.items || [];
    title = group.id ? 'ویرایش گروه' : 'گروه تازه';
    body = `<form data-admin-form="group-form" class="modal-form"><input type="hidden" name="groupId" value="${escapeHtml(group.id || '')}"><label>نام گروه<input name="name" required value="${escapeHtml(group.name || '')}"></label><div class="modal-pair"><label>رنگ<input name="color" type="color" value="${escapeHtml(group.color || '#0E6666')}"></label><label>ظرفیت<input name="capacity" type="number" min="1" max="500" value="${numberFa(group.capacity || 8)}"></label></div><span class="dispatch-label">پوشش انواع حادثه</span><div class="checkbox-grid">${incidents.map((incident) => `<label><input type="checkbox" name="incidentIds" value="${escapeHtml(incident.id)}" ${(group.incidentIds || []).includes(incident.id) ? 'checked' : ''}><span>${escapeHtml(incident.label)}</span></label>`).join('')}</div><label>وضعیت<select name="status"><option value="active">آماده</option><option value="paused" ${group.status === 'paused' ? 'selected' : ''}>متوقف</option></select></label><button type="submit" class="admin-button admin-button--primary admin-button--wide">ذخیره گروه</button></form>`;
  } else if (data.type === 'group-member') {
    title = 'افزودن عضو گروه';
    body = `<form data-admin-form="group-member" class="modal-form"><input type="hidden" name="groupId" value="${escapeHtml(data.groupId || '')}"><label>شناسه کاربر<input name="userId" required></label><label>نقش در گروه<select name="role"><option value="member">عضو</option><option value="leader">سرپرست</option></select></label><button type="submit" class="admin-button admin-button--primary admin-button--wide">افزودن</button></form>`;
  } else if (data.type === 'sos-detail') {
    title = 'جزئیات درخواست';
    const sos = data.sos || {};
    body = `<div class="detail-list"><div><dt>کد پیگیری</dt><dd>${numberFa(sos.trackingCode || 0)}</dd></div><div><dt>وضعیت</dt><dd>${escapeHtml(statusLabel(sos.status || ''))}</dd></div><div><dt>نوع حادثه</dt><dd>${escapeHtml(sos.incidentLabel || '—')}</dd></div><div><dt>شرح</dt><dd>${escapeHtml(sos.description || '—')}</dd></div></div>${sos.photoDataUrl ? `<img class="modal-photo" src="${escapeHtml(sos.photoDataUrl)}" alt="عکس حادثه">` : ''}`;
  }
  return `<div class="modal-backdrop" data-action="modal-close"><section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" data-action="modal-noop"><div class="modal__head"><strong>${escapeHtml(title)}</strong><button type="button" class="icon-button" data-action="modal-close" aria-label="بستن">${icon('close')}</button></div><div class="modal__body">${body}</div></section></div>`;
}

/** @param {string} view @param {any} state */
function content(view, state) {
  if (state.adminError) return errorPanel(state.adminError);
  if (view === 'reports') return reportsContent(state);
  if (view === 'dispatch') return dispatchContent(state);
  if (view === 'users') return usersContent(state);
  if (view === 'groups') return groupsContent(state);
  if (view === 'incidents') return incidentsContent(state);
  if (view === 'audit') return auditContent(state);
  if (view === 'alerts') return alertsContent(state);
  if (view === 'settings') return settingsContent(state);
  return overviewContent(state);
}

/** @param {string} view @param {any} state */
export function renderAdmin(view, state) {
  return `<div class="admin-shell">${sidebar(view)}<div class="admin-main">${topbar(view)}<main class="admin-content">${pageHeader(view, state)}${content(view, state)}</main></div></div>${modal(state)}`;
}

/** @param {any} state */
async function refreshAdmin(state) {
  await ensureAdminData(state);
  rerender();
}

/** @param {any} state */
function attachRealtime(state) {
  const reconnect = () => { void refreshAdmin(state); };
  for (const event of [HTTP_EVENTS.SOS_CREATED, HTTP_EVENTS.SOS_DISPATCHED, HTTP_EVENTS.SOS_ACCEPTED,
    HTTP_EVENTS.MISSION_UPDATED, HTTP_EVENTS.ADMIN_ALERT, HTTP_EVENTS.SETTINGS_UPDATED, HTTP_EVENTS.USER_UPDATED]) {
    state.unsubscribers.push(state.realtime.on(event, reconnect));
  }
  state.unsubscribers.push(state.realtime.on('status', (status) => {
    const badge = $('.admin-crumb');
    if (badge) badge.dataset.status = status;
  }));
  void state.realtime.connect();
}

/** @param {any} state @param {string} id */
async function selectDispatch(state, id) {
  state.admin.selectedSosId = id;
  try {
    const config = state.admin.mapConfig;
    const selected = state.admin.dispatch?.queue?.items?.find((item) => item.id === id);
    const latitude = Number(selected?.latitude || config?.center?.latitude || 35.7219);
    const longitude = Number(selected?.longitude || config?.center?.longitude || 51.3347);
    const result = await get(`/_admin/sos/${encodeURIComponent(id)}/nearest`, { latitude, longitude, limit: 10, incidentTypeId: selected?.incidentTypeId });
    state.admin.nearest = result.items || [];
  } catch { state.admin.nearest = []; }
  rerender();
}

/** @param {string} action @param {any} element @param {any} state */
async function performAction(action, element, state) {
  const id = element.getAttribute('data-id');
  try {
    switch (action) {
      case 'admin-refresh': await refreshAdmin(state); toast('دادها بروز شد.', 'success', 1800); return;
      case 'export-audit': window.location.assign('/_admin/audit.csv'); return;
      case 'export-users': window.location.assign('/_admin/users.csv'); return;
      case 'new-user': state.modal = { type: 'new-user' }; rerender(); return;
      case 'new-group': state.modal = { type: 'group-form', group: null }; rerender(); return;
      case 'group-edit': {
        const group = state.admin.groups.items.find((item) => item.id === id) || null;
        state.modal = { type: 'group-form', group }; rerender(); return;
      }
      case 'group-member': state.modal = { type: 'group-member', groupId: id }; rerender(); return;
      case 'modal-close': state.modal = null; rerender(); return;
      case 'command': state.modal = { type: 'command' }; rerender(); return;
      case 'notifications': toast('همه اعلانها بررسی شدند.', 'info', 1800); return;
      case 'help': go('/_admin/reports'); return;
      case 'account': toast('حساب مدیر فعال است.', 'info', 1800); return;
      case 'alert-resolve': await post(`/_admin/alerts/${encodeURIComponent(id)}/resolve`); toast('هشدار بررسی شد.', 'success'); await refreshAdmin(state); return;
      case 'user-detail': {
        const result = await get(`/_admin/users/${encodeURIComponent(id)}`);
        state.modal = { type: 'user-detail', user: { ...result.user, id } }; rerender(); return;
      }
      case 'dispatch-select': await selectDispatch(state, id); return;
      case 'dispatch-cancel': toast('برای لغو، درخواست را از صف جزئیات بررسی کنید.', 'warning'); return;
      case 'sos-detail': {
        const result = await get(`/_admin/sos/${encodeURIComponent(id)}`);
        state.modal = { type: 'sos-detail', sos: result }; rerender(); return;
      }
      default: return;
    }
  } catch (error) { toast(errorMessage(error), 'error'); }
}

/** @param {any} form */
function formValues(form) { return /** @type {any} */(Object.fromEntries(new FormData(form).entries())); }
/** @param {any} form @param {string} name */
function checkedValues(form, name) { return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value); }

/** @param {any} form @param {any} state */
async function handleSubmit(form, state) {
  const kind = form.getAttribute('data-admin-form');
  const values = formValues(form);
  try {
    if (kind === 'new-user') {
      await post('/_admin/users', { username: values.username.trim(), password: values.password, role: values.role });
      state.modal = null; await refreshAdmin(state); toast('کاربر ساخته شد.', 'success'); return;
    }
    if (kind === 'user-role') {
      await patch(`/_admin/users/${encodeURIComponent(values.userId)}`, { role: values.role, active: values.active === 'true' });
      state.modal = null; await refreshAdmin(state); toast('حساب بروز شد.', 'success'); return;
    }
    if (kind === 'group-form') {
      const payload = { name: values.name.trim(), color: values.color, capacity: Number(String(values.capacity).replace(/[^0-9]/g, '')) || 8, incidentIds: checkedValues(form, 'incidentIds'), status: values.status };
      if (values.groupId) await patch(`/_admin/groups/${encodeURIComponent(values.groupId)}`, payload);
      else await post('/_admin/groups', payload);
      state.modal = null; await refreshAdmin(state); toast('گروه ذخیره شد.', 'success'); return;
    }
    if (kind === 'group-member') {
      await post(`/_admin/groups/${encodeURIComponent(values.groupId)}/members`, { userId: values.userId.trim(), role: values.role });
      state.modal = null; await refreshAdmin(state); toast('عضو افزوده شد.', 'success'); return;
    }
    if (kind === 'settings-form') {
      await put('/_admin/settings', {
        sos_auto_dispatch: values.sos_auto_dispatch,
        default_dispatch_radius_m: String(values.default_dispatch_radius_m),
        mission_ready_required: values.mission_ready_required,
        maintenance_mode: values.maintenance_mode
      });
      await refreshAdmin(state); toast('تنظیمات ذخیره شد.', 'success'); return;
    }
    if (kind === 'dispatch-form') {
      const selectedId = state.admin.selectedSosId;
      const responderIds = checkedValues(form, 'responderIds');
      if (!selectedId || !responderIds.length) { toast('گروه و دستکم یک امدادگر را انتخاب کنید.', 'warning'); return; }
      await post(`/_admin/sos/${encodeURIComponent(selectedId)}/dispatch`, { groupId: values.groupId, responderIds });
      await refreshAdmin(state); toast('اعزام ثبت و ارسال شد.', 'success'); return;
    }
    if (kind === 'user-filters') {
      const params = new URLSearchParams();
      if (values.q) params.set('q', values.q);
      if (values.role) params.set('role', values.role);
      if (values.active) params.set('active', values.active);
      go(`/_admin/users?${params.toString()}`); await refreshAdmin(state); return;
    }
    if (kind === 'audit-filters') {
      const params = new URLSearchParams();
      if (values.q) params.set('q', values.q);
      if (values.action) params.set('action', values.action);
      go(`/_admin/audit?${params.toString()}`); await refreshAdmin(state); return;
    }
  } catch (error) { toast(errorMessage(error), 'error'); }
}

/** @param {string} view @param {any} state */
export function bindAdmin(view, state) {
  state.adminView = view;
  attachRealtime(state);
  state.action = (action, element) => { void performAction(action, element, state); };
  state.submit = (form) => { void handleSubmit(form, state); };
  state.shortcut = () => { state.modal = { type: 'command' }; rerender(); };
  if (view === 'dispatch' && state.admin?.selectedSosId && !state.admin?.nearest?.length) void selectDispatch(state, state.admin.selectedSosId);
}
