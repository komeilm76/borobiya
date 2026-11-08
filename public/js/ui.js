/** Shared, dependency-free browser helpers. */
import { formatClock, formatDistance, toPersianDigits } from './geo.js';

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character] || character);
}

/** @param {string} name @param {string} [className] */
export function icon(name, className = '') {
  return `<span class="mdi mdi-${escapeHtml(name)} ${escapeHtml(className)}" aria-hidden="true"></span>`;
}

/** @param {string|number} value */
export function numberFa(value) { return toPersianDigits(value); }
export { formatClock, formatDistance };

/** @param {string|number|Date} value */
export function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(date); } catch { return date.toISOString().slice(0, 10); }
}

/** @param {string|number|Date} value */
export function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(date); } catch { return date.toISOString(); }
}

/**
 * @param {string} markup
 * @param {'auth'|'map'|'admin'} mode
 */
export function mount(markup, mode) {
  const root = /** @type {HTMLElement|null} */(document.getElementById('app'));
  if (!root) return;
  document.body.dataset.mode = mode;
  root.innerHTML = markup;
  root.classList.remove('view-enter');
  void root.offsetWidth;
  root.classList.add('view-enter');
  window.scrollTo(0, 0);
}

/** @param {string} message @param {'info'|'success'|'warning'|'error'} [kind] @param {number} [timeout] */
export function toast(message, kind = 'info', timeout = 3600) {
  const root = /** @type {HTMLElement|null} */(document.getElementById('toast-root'));
  if (!root) return;
  const node = document.createElement('div');
  node.className = `toast toast--${kind}`;
  node.innerHTML = icon(kind === 'success' ? 'check-circle-outline' : kind === 'error' ? 'alert-circle-outline' : kind === 'warning' ? 'alert-outline' : 'information-outline');
  const text = document.createElement('span');
  text.textContent = String(message);
  node.append(text);
  root.append(node);
  window.setTimeout(() => { node.classList.add('toast--out'); window.setTimeout(() => node.remove(), 260); }, timeout);
}

/** Re-renders the current route without changing browser history. */
export function rerender() { queueMicrotask(() => window.dispatchEvent(new Event('boro:route'))); }

/** @param {string} path @param {boolean} [replace] */
export function go(path, replace = false) {
  const target = new URL(path, window.location.origin);
  const next = `${target.pathname}${target.search}`;
  if (next === `${window.location.pathname}${window.location.search}`) return;
  if (replace) window.history.replaceState({}, '', next);
  else window.history.pushState({}, '', next);
  queueMicrotask(() => window.dispatchEvent(new Event('boro:route')));
}

let mediaQuery = /** @type {MediaQueryList|null} */(null);
let mediaListener = /** @type {((event: MediaQueryListEvent) => void)|null} */(null);

function resolveTheme(choice) {
  if (choice !== 'system') return choice;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  catch { return 'light'; }
}

/** @param {'system'|'light'|'dark'} choice */
export function applyTheme(choice) {
  try { window.localStorage.setItem('bb-theme', choice); } catch { /* storage can be disabled */ }
  document.documentElement.setAttribute('data-theme-choice', choice);
  document.documentElement.setAttribute('data-theme', resolveTheme(choice));
  if (mediaQuery && mediaListener) mediaQuery.removeEventListener('change', mediaListener);
  mediaQuery = null;
  mediaListener = null;
  if (choice === 'system') {
    try {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaListener = () => { document.documentElement.setAttribute('data-theme', resolveTheme('system')); };
      mediaQuery.addEventListener('change', mediaListener);
    } catch { /* older browsers do not support system theme changes */ }
  }
}

/** Cycles system -> light -> dark -> system and returns the new choice. */
export function cycleTheme() {
  const current = document.documentElement.getAttribute('data-theme-choice') || 'system';
  const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
  applyTheme(next);
  return next;
}

/** @param {number[]} values @param {string} [color] */
export function sparkline(values, color = '#0E6666') {
  const points = values.length ? values : [0, 0];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coordinates = points.map((value, index) => {
    const x = (index / Math.max(1, points.length - 1)) * 220;
    const y = 54 - ((value - min) / span) * 44;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const area = `0,58 ${coordinates} 220,58`;
  return `<svg class="sparkline" viewBox="0 0 220 60" preserveAspectRatio="none" role="img" aria-label="trend">
    <line x1="0" y1="14" x2="220" y2="14"/><line x1="0" y1="36" x2="220" y2="36"/>
    <polygon points="${area}" fill="${escapeHtml(color)}" opacity=".09"/>
    <polyline points="${coordinates}" fill="none" stroke="${escapeHtml(color)}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/** @param {string} label @param {'success'|'warning'|'danger'|'info'|'neutral'} [tone] */
export function statusPill(label, tone = 'neutral') {
  return `<span class="status-pill status-pill--${tone}">${escapeHtml(label)}</span>`;
}

/** @param {string} title @param {string} detail @param {string} [iconName] */
export function emptyState(title, detail, iconName = 'clipboard-text-outline') {
  return `<div class="empty-state">${icon(iconName, 'empty-state__icon')}<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`;
}

/** @param {string} message */
export function errorPanel(message) {
  return `<div class="error-panel">${icon('alert-circle-outline')}<span>${escapeHtml(message)}</span></div>`;
}

/** @param {string} label @param {string} value */
export function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}
