/** Borobiya single-page application entry point. */
import { applyTheme, busy, errorPanel, go, loadingShell, mount, offlinePanel, rerender, toast } from './ui.js';
import { get, post } from './api.js';
import { RealtimeClient } from './transport.js';
import { TalkAudio } from './audio.js';

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
  modalOpener: null,
  lastModal: false,
  action: () => {},
  submit: () => {},
  shortcut: () => {}
};
state.talkAudio = new TalkAudio((frame) => state.realtime.sendBinary(frame));

let routeToken = 0;
const modules = { auth: null, map: null, admin: null };

/** @param {'auth'|'map'|'admin'} kind */
function viewModule(kind) {
  if (!modules[kind]) {
    if (kind === 'auth') modules[kind] = import('./views/auth.js');
    else if (kind === 'map') modules[kind] = import('./views/map.js');
    else modules[kind] = import('./views/admin.js');
  }
  return modules[kind];
}

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

function focusAfterRender() {
  const modal = /** @type {HTMLElement|null} */(document.querySelector('.modal'));
  if (modal) {
    const target = /** @type {HTMLElement|null} */(modal.querySelector('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]'));
    target?.focus();
    state.lastModal = true;
    return;
  }
  if (state.lastModal && state.modalOpener instanceof HTMLElement) state.modalOpener.focus();
  if (!state.modal) state.modalOpener = null;
  state.lastModal = false;
}

/** @param {KeyboardEvent} event */
function trapModalFocus(event) {
  if (!state.modal || event.key !== 'Tab') return;
  const modal = /** @type {HTMLElement|null} */(document.querySelector('.modal'));
  if (!modal) return;
  const focusables = [...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];
  if (!focusables.length) return;
  const first = /** @type {HTMLElement} */(focusables[0]);
  const last = /** @type {HTMLElement} */(focusables[focusables.length - 1]);
  const inside = modal.contains(document.activeElement);
  if (event.shiftKey && (!inside || document.activeElement === first)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (!inside || document.activeElement === last)) { event.preventDefault(); first.focus(); }
}

/** @param {KeyboardEvent} event */
function navigateCommandPalette(event) {
  if (!document.querySelector('.command-list')) return;
  const buttons = /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll('.command-list button')]);
  if (!buttons.length) return;
  const current = buttons.findIndex((button) => button.classList.contains('is-keyboard-active'));
  let next = current;
  if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
  else if (event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = buttons.length - 1;
  else return;
  event.preventDefault();
  buttons.forEach((button) => button.classList.remove('is-keyboard-active'));
  buttons[next].classList.add('is-keyboard-active');
  buttons[next].focus();
}

async function onAuthenticated() {
  newRealtime(state);
  state.user = await get('/_user/me');
  const auth = await viewModule('auth');
  await auth.ensureCatalog(state).catch(() => {});
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
  if (path !== state.lastPath) { state.modal = null; state.modalOpener = null; }
  state.lastPath = path;
  const authPath = path.startsWith('/_auth/');
  const adminPath = path.startsWith('/_admin/');
  const userPath = path.startsWith('/_user/');
  const mode = authPath ? 'auth' : adminPath ? 'admin' : 'map';
  mount(loadingShell(mode), mode);
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
      const auth = await viewModule('auth');
      if (view !== 'login') await auth.ensureCatalog(state);
      if (token !== routeToken) return;
      state.view = view;
      mount(auth.renderAuth(view, state), 'auth');
      auth.bindAuth(view, state);
      state.lastView = view;
      focusAfterRender();
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
      const admin = await viewModule('admin');
      await admin.ensureAdminData(state);
      if (token !== routeToken) return;
      if (state.adminError && !navigator.onLine) { mount(offlinePanel(state.adminError), 'admin'); focusAfterRender(); return; }
      state.view = view;
      mount(admin.renderAdmin(view, state), 'admin');
      admin.bindAdmin(view, state);
      state.lastView = view;
      focusAfterRender();
      return;
    }
    if (userPath) {
      if (user.role === 'admin') { go('/_admin/overview', true); return; }
      const view = path.split('/')[2] || 'map';
      if (!USER_VIEWS.has(view)) { go('/_user/map', true); return; }
      const map = await viewModule('map');
      await map.ensureMapData(state);
      if (token !== routeToken) return;
      if (state.dataError && !navigator.onLine) { mount(offlinePanel(state.dataError), 'map'); focusAfterRender(); return; }
      if (state.dataError) toast(state.dataError, 'warning');
      state.view = view;
      mount(map.renderMap(view, state), 'map');
      map.bindMap(view, state);
      state.lastView = view;
      focusAfterRender();
      return;
    }
    go('/_auth/login', true);
  } catch (error) {
    if (token !== routeToken) return;
    console.error('[borobiya] route failed', error);
    mount(navigator.onLine
      ? `<main class="fatal-page">${errorPanel('بارگذاری صفحه ممکن نشد. چند لحظه بعد دوباره تلاش کنید.')}</main>`
      : `<main class="fatal-page">${offlinePanel()}</main>`, mode);
    focusAfterRender();
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
  state.modalOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const action = actionElement.getAttribute('data-action') || '';
  if (action === 'modal-noop') return;
  state.action(action, actionElement, event);
});

document.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = /** @type {HTMLFormElement} */(event.target);
  const button = /** @type {HTMLElement|null} */(form.querySelector('button[type="submit"]'));
  if (button) void busy(button, async () => { await state.submit(form, event); });
  else state.submit(form, event);
});

document.addEventListener('keydown', async (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    state.modalOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    state.shortcut();
    return;
  }
  if (event.key === 'Escape') {
    if (state.modal) {
      state.modal = null;
      rerender();
      return;
    }
    const sheet = /** @type {HTMLElement|null} */(document.getElementById('sheet'));
    if (sheet && sheet.dataset.detent !== 'closed') {
      const map = await viewModule('map');
      map.setDetent(state, 'closed');
    }
    return;
  }
  if (event.key === 'Tab') { trapModalFocus(event); return; }
  navigateCommandPalette(event);
});

window.addEventListener('boro:route', () => { void route(); });
window.addEventListener('popstate', () => { void route(); });
window.addEventListener('online', () => {
  document.documentElement.removeAttribute('data-offline');
  void state.realtime.connect();
  toast('اتصال برقرار شد؛ دادهها بهروز میشوند.', 'success', 2400);
  rerender();
});
window.addEventListener('offline', () => {
  document.documentElement.setAttribute('data-offline', 'true');
  toast('اتصال اینترنت قطع شد؛ دادههای ذخیرهشده همچنان در دسترساند.', 'warning');
});

if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}); });
}

void route();
