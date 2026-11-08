/** Borobiya single-page application entry point. */
import { applyTheme, errorPanel, go, mount, rerender, toast } from './ui.js';
import { get, post } from './api.js';
import { RealtimeClient } from './transport.js';
import { TalkAudio } from './audio.js';
import { ensureCatalog, renderAuth, bindAuth } from './views/auth.js';
import { ensureMapData, renderMap, bindMap, setDetent } from './views/map.js';
import { ensureAdminData, renderAdmin, bindAdmin } from './views/admin.js';

const ADMIN_VIEWS = new Set(['overview', 'dispatch', 'reports', 'users', 'groups', 'incidents', 'audit', 'alerts', 'settings']);
const USER_VIEWS = new Set(['map', 'mission', 'companions', 'history', 'profile', 'sos', 'talk']);
const AUTH_VIEWS = new Set(['login', 'register', 'recovery', 'onboarding']);

/** @type {any} */
const state = {
  user: null,
  view: 'login',
  lastView: '',
  lastPath: '',
  query: new URLSearchParams(),
  peerId: '',
  peerName: '',
  securityQuestions: [],
  recovery: { step: 'account' },
  realtime: new RealtimeClient(),
  talkAudio: null,
  unsubscribers: [],
  livePeers: new Map(),
  geoWatch: null,
  mapDetent: 'half',
  sosDraft: null,
  talkState: null,
  devices: null,
  dataError: null,
  adminError: null,
  admin: null,
  modal: null,
  action: () => {},
  submit: () => {},
  shortcut: () => {}
};
state.talkAudio = new TalkAudio((frame) => state.realtime.sendBinary(frame));

let routeToken = 0;

/** @param {any} user */
function defaultForUser(user) {
  if (user.mustCompleteSecurityQuestions) return '/_auth/onboarding';
  if (user.role === 'admin') return '/_admin/overview';
  return '/_user/map';
}

/** @param {any} current */
function newRealtime(current) {
  current.realtime.close();
  current.realtime = new RealtimeClient();
  current.talkAudio.destroy();
  current.talkAudio = new TalkAudio((frame) => current.realtime.sendBinary(frame));
}

function clearRoute() {
  for (const off of state.unsubscribers.splice(0)) off();
  if (state.geoWatch !== null && state.geoWatch !== undefined && navigator.geolocation) {
    navigator.geolocation.clearWatch(state.geoWatch);
  }
  state.geoWatch = null;
  state.action = () => {};
  state.submit = () => {};
  state.shortcut = () => {};
  if (state.lastView === 'talk') state.talkAudio.stop();
}

async function onAuthenticated() {
  newRealtime(state);
  state.user = await get('/_user/me');
  await ensureCatalog(state).catch(() => {});
  go(defaultForUser(state.user), true);
}

async function onLogout() {
  try { await post('/_auth/logout'); } catch { /* local logout still continues */ }
  newRealtime(state);
  state.user = null;
  state.livePeers.clear();
  state.modal = null;
  state.recovery = { step: 'account' };
  go('/_auth/login', true);
  toast('با امنیت خارج شدید.', 'success', 2400);
}

state.onAuthenticated = onAuthenticated;
state.onLogout = onLogout;

async function route() {
  const token = ++routeToken;
  clearRoute();
  const url = new URL(window.location.href);
  const path = url.pathname;
  state.query = url.searchParams;
  state.peerId = state.query.get('peer') || '';
  state.peerName = state.query.get('name') || '';
  if (path !== state.lastPath) state.modal = null;
  state.lastPath = path;
  const authPath = path.startsWith('/_auth/');
  const adminPath = path.startsWith('/_admin/');
  const userPath = path.startsWith('/_user/');
  try {
    if (!authPath && !adminPath && !userPath) { go('/_auth/login', true); return; }
    if (authPath) {
      const view = path.split('/')[2] || 'login';
      if (!AUTH_VIEWS.has(view)) { go('/_auth/login', true); return; }
      let session = null;
      try { session = await get('/_user/me'); } catch { session = null; }
      if (token !== routeToken) return;
      if (session && view !== 'onboarding') { state.user = session; go(defaultForUser(session), true); return; }
      if (session && view === 'onboarding' && !session.mustCompleteSecurityQuestions) { state.user = session; go(defaultForUser(session), true); return; }
      if (!session && view === 'onboarding') { go('/_auth/login', true); return; }
      if (session) state.user = session;
      if (view !== 'login') await ensureCatalog(state);
      if (token !== routeToken) return;
      state.view = view;
      mount(renderAuth(view, state), 'auth');
      bindAuth(view, state);
      state.lastView = view;
      return;
    }
    let user;
    try { user = await get('/_user/me'); } catch { go('/_auth/login', true); return; }
    if (token !== routeToken) return;
    state.user = user;
    if (user.mustCompleteSecurityQuestions) { go('/_auth/onboarding', true); return; }
    if (adminPath) {
      if (user.role !== 'admin') { go('/_user/map', true); return; }
      const view = path.split('/')[2] || 'overview';
      if (!ADMIN_VIEWS.has(view)) { go('/_admin/overview', true); return; }
      await ensureAdminData(state);
      if (token !== routeToken) return;
      state.view = view;
      mount(renderAdmin(view, state), 'admin');
      bindAdmin(view, state);
      state.lastView = view;
      return;
    }
    if (userPath) {
      if (user.role === 'admin') { go('/_admin/overview', true); return; }
      const view = path.split('/')[2] || 'map';
      if (!USER_VIEWS.has(view)) { go('/_user/map', true); return; }
      await ensureMapData(state);
      if (token !== routeToken) return;
      if (state.dataError) toast(state.dataError, 'warning');
      state.view = view;
      mount(renderMap(view, state), 'map');
      bindMap(view, state);
      state.lastView = view;
      return;
    }
    go('/_auth/login', true);
  } catch (error) {
    if (token !== routeToken) return;
    console.error('[borobiya] route failed', error);
    mount(`<main class="fatal-page">${errorPanel('بارگذاری صفحه ممکن نشد. چند لحظه بعد دوباره تلاش کنید.')}</main>`, 'auth');
  }
}

applyTheme(/** @type {any} */(document.documentElement.getAttribute('data-theme-choice') || 'system'));

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest('[data-go]');
  if (link) {
    event.preventDefault();
    go(link.getAttribute('data-go') || '/');
    return;
  }
  const actionElement = target.closest('[data-action]');
  if (!actionElement) return;
  const interactive = actionElement.matches('button,a,[role="button"],.modal-backdrop') || actionElement.getAttribute('data-action') === 'modal-noop';
  if (!interactive) return;
  event.preventDefault();
  const action = actionElement.getAttribute('data-action') || '';
  if (action === 'modal-noop') return;
  state.action(action, actionElement, event);
});

document.addEventListener('submit', (event) => {
  event.preventDefault();
  state.submit(/** @type {HTMLFormElement} */(event.target), event);
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    state.shortcut();
    return;
  }
  if (event.key === 'Escape') {
    if (state.modal) { state.modal = null; rerender(); return; }
    const sheet = /** @type {HTMLElement|null} */(document.getElementById('sheet'));
    if (sheet && sheet.dataset.detent !== 'closed') setDetent(state, 'closed');
  }
});

window.addEventListener('boro:route', () => { void route(); });
window.addEventListener('popstate', () => { void route(); });
window.addEventListener('online', () => { void state.realtime.connect(); });
window.addEventListener('offline', () => toast('اتصال اینترنت قطع شد؛ دادههای ذخیرهشده همچنان در دسترساند.', 'warning'));

if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}); });
}

void route();
