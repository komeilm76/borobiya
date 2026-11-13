#!/usr/bin/env bun
/**
 * Visual preview server — a review harness for the Borobiya client, fully isolated from
 * production:
 *
 * - Serves the real Vue client bundle built with `VITE_PREVIEW_DEMO=true` (real routing,
 *   stores, styles and behavior — only the network layer is replaced by deterministic
 *   fixtures in `src/client/preview/`).
 * - The catalog at `/` is generated from `src/client/preview/registry.ts`; nothing is
 *   hand-added on the page and no data comes from a database.
 * - Serves vector SVG map tiles and the built `/assets/*` (icons/fonts/logo) locally.
 * - Binds `0.0.0.0` by default so another device on the LAN can open it. Never expose
 *   the port to the public internet; it has no authentication by design.
 *
 * Usage:
 *   bun run preview                 # build (if needed) and serve on :4173
 *   bun run preview -- --port 4200  # custom port
 *   bun run preview -- --host 127.0.0.1 --skip-build
 *
 * Stop with Ctrl+C. Nothing here touches `public/`, `data/` or any deployed artifact.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREVIEW_PAGES, SECTION_LABELS, STATUS_LABELS, previewCounts, type PreviewPage, type PreviewPersona } from '../src/client/preview/registry.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = path.join(ROOT, 'build', 'preview-app');
const ASSETS_DIR = path.join(ROOT, 'public', 'assets');
const MANIFEST = path.join(ROOT, 'public', 'manifest.webmanifest');

/* ------------------------------------------------------------- args */
const args = process.argv.slice(2);
const argValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const HOST = argValue('--host') ?? process.env.PREVIEW_HOST ?? '0.0.0.0';
const PORT = Number(argValue('--port') ?? process.env.PREVIEW_PORT ?? 4173);
const SKIP_BUILD = args.includes('--skip-build') || process.env.PREVIEW_SKIP_BUILD === '1';

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`Invalid port: ${PORT}`);
  process.exit(2);
}

/* ------------------------------------------------------- build step */
if (!SKIP_BUILD) {
  console.log('[preview] building the preview bundle (vite build --mode preview)…');
  const child = Bun.spawn(['bunx', 'vite', 'build', '--mode', 'preview', '--config', 'vite.preview.config.ts'], {
    cwd: ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'ignore'
  });
  const status = await child.exited;
  if (status !== 0) {
    console.error('[preview] build failed; fix the errors above and retry.');
    process.exit(status);
  }
} else if (!existsSync(path.join(APP_DIR, 'preview.html')) && !existsSync(path.join(APP_DIR, 'index.html'))) {
  console.error('[preview] --skip-build given but build/preview-app is missing. Run `bun run preview:build` first.');
  process.exit(2);
}

/* ------------------------------------------------- deterministic tiles */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tileSvg(z: number, x: number, y: number): string {
  const h = hash(`${z}:${x}:${y}`);
  const roadA = 28 + (h % 190);
  const roadB = 24 + ((h >>> 5) % 200);
  const roadC = 20 + ((h >>> 11) % 200);
  const parkCx = 40 + ((h >>> 7) % 170);
  const parkCy = 44 + ((h >>> 13) % 160);
  const water = (h >>> 17) % 5 === 0;
  const diag = (h >>> 19) % 3 === 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#F0F2EC"/>
  ${water ? '<path d="M0 150 Q 64 120 128 150 T 256 150 L 256 256 L 0 256 Z" fill="#B6D7E4"/>' : ''}
  <ellipse cx="${parkCx}" cy="${parkCy}" rx="34" ry="22" fill="#D3E6C6"/>
  <g stroke="#D8D6CC" stroke-width="1">${Array.from({ length: 3 }, (_, i) => {
    const g = 48 * (i + 1);
    return `<line x1="${g}" y1="0" x2="${g}" y2="256"/><line x1="0" y1="${g}" x2="256" y2="${g}"/>`;
  }).join('')}</g>
  ${diag ? '<line x1="0" y1="230" x2="256" y2="26" stroke="#FFFFFF" stroke-width="14"/>' : ''}
  <line x1="${roadA}" y1="0" x2="${roadA}" y2="256" stroke="#FFFFFF" stroke-width="16"/>
  <line x1="0" y1="${roadB}" x2="256" y2="${roadB}" stroke="#FFFFFF" stroke-width="13"/>
  <line x1="0" y1="${roadC + 60}" x2="256" y2="${roadC + 44}" stroke="#FFFFFF" stroke-width="8"/>
  <line x1="${roadA}" y1="0" x2="${roadA}" y2="256" stroke="#E3E1D6" stroke-width="1.5"/>
  <line x1="0" y1="${roadB}" x2="256" y2="${roadB}" stroke="#E3E1D6" stroke-width="1.5"/>
</svg>`;
}

/* --------------------------------------------------------- static map */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'SAMEORIGIN'
};

function serveFile(absolute: string, extraHeaders: Record<string, string> = {}): Response {
  const body = readFileSync(absolute);
  return new Response(body, {
    headers: { 'Content-Type': MIME[path.extname(absolute)] ?? 'application/octet-stream', ...SECURITY_HEADERS, ...extraHeaders }
  });
}

/** Resolve `/app/<path>` inside APP_DIR; returns undefined when missing or unsafe. */
function resolveAppAsset(pathname: string): string | undefined {
  const relative = pathname.replace(/^\/app\/?/, '');
  const candidate = path.normalize(path.join(APP_DIR, relative));
  if (!candidate.startsWith(APP_DIR)) return undefined;
  return existsSync(candidate) && statSync(candidate).isFile() ? candidate : undefined;
}

function resolvePublicAsset(pathname: string): string | undefined {
  const relative = pathname.replace(/^\/assets\/?/, '');
  const candidate = path.normalize(path.join(ASSETS_DIR, relative));
  if (!candidate.startsWith(ASSETS_DIR) || !existsSync(candidate)) return undefined;
  return statSync(candidate).isFile() ? candidate : undefined;
}

/* ------------------------------------------------------------ catalog */
const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function previewHref(page: PreviewPage): string {
  const base = `/app${page.route}`;
  switch (page.persona) {
    case 'admin': return `${base}?persona=admin`;
    case 'onboarding': return `${base}?persona=onboarding`;
    case 'anon': return `${base}?anon=1`;
    default: return base;
  }
}

const PERSONA_HINT: Record<PreviewPersona, string> = {
  user: 'کاربر عادی — saeed.k (امدادگر آماده)',
  admin: 'مدیر — admin',
  onboarding: 'کاربر با پرسش‌های امنیتی ناقص — leila.n',
  anon: 'مهمان — بدون نشست'
};

function card(page: PreviewPage): string {
  const href = previewHref(page);
  const pill = page.status === 'ready' ? 'pill pill--ready' : page.status === 'partial' ? 'pill pill--partial' : 'pill pill--missing';
  const hints = page.testHints.map((hint) => `<li>${esc(hint)}</li>`).join('');
  const limitation = page.limitation ? `<p class="card-limitation"><strong>محدودیت:</strong> ${esc(page.limitation)}</p>` : '';
  const missing = page.missing?.length ? `<p class="card-limitation"><strong>ناقص:</strong> ${esc(page.missing.join('؛ '))}</p>` : '';
  return `<article class="card" data-section="${page.section}" data-persona="${page.persona}" data-search="${esc(`${page.name} ${page.route} ${page.id}`.toLowerCase())}">
  <header class="card-head">
    <h3>${esc(page.name)}</h3>
    <span class="${pill}">${esc(STATUS_LABELS[page.status])}</span>
  </header>
  <div class="card-meta"><span class="chip">${esc(SECTION_LABELS[page.section])}</span><code>${esc(page.route)}</code></div>
  <p class="card-summary">${esc(page.summary)}</p>
  <details class="card-details"><summary>چه چیزی را بازبینی کنیم؟</summary><ul>${hints}</ul></details>
  ${limitation}${missing}
  <footer class="card-foot">
    <a class="btn btn--primary" href="${href}">باز کردن (دسکتاپ)</a>
    <button class="btn btn--ghost" type="button" data-mobile-href="${href}">موبایل ۳۹۰×۸۴۴</button>
    <span class="persona">${esc(PERSONA_HINT[page.persona])}</span>
  </footer>
</article>`;
}

function catalogHtml(requestHost: string): string {
  const sections = (Object.keys(SECTION_LABELS) as Array<keyof typeof SECTION_LABELS>)
    .map((section) => {
      const pages = PREVIEW_PAGES.filter((page) => page.section === section);
      return `<section class="section" data-section="${section}">
  <h2>${esc(SECTION_LABELS[section])} <span class="count">${pages.length}</span></h2>
  <div class="grid">${pages.map(card).join('\n')}</div>
</section>`;
    })
    .join('\n');
  const date = new Date().toISOString().slice(0, 10);
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>بورو بیا — کاتالوگ بازبینی بصری</title>
<style>
@font-face { font-family: 'Vazirmatn'; src: url('/assets/fonts/Vazirmatn-Regular.ttf') format('truetype'); font-display: swap; }
:root { --teal: #0E6666; --teal-deep: #0A4B4B; --danger: #AF3438; --ink: #16302B; --line: #D9DED4; --bg: #F7F8F4; --ok: #2C7A57; --warn: #B57A12; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Vazirmatn', system-ui, sans-serif; background: var(--bg); color: var(--ink); }
header.top { background: linear-gradient(135deg, var(--teal-deep), var(--teal)); color: #fff; padding: 22px 28px 26px; }
header.top h1 { margin: 0 0 6px; font-size: 22px; }
header.top .sub { margin: 0; opacity: .92; font-size: 13px; }
.badges { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
.badge { background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.35); border-radius: 999px; padding: 4px 12px; font-size: 11px; }
.notice { background: #FDF3E3; border: 1px solid #E7CDA0; color: #6B4B0A; border-radius: 12px; padding: 10px 14px; margin: 16px 28px 0; font-size: 12.5px; }
main { padding: 18px 28px 60px; max-width: 1240px; margin: 0 auto; }
.stats { display: flex; gap: 10px; flex-wrap: wrap; margin: 14px 0 4px; }
.stat { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 10px 16px; min-width: 120px; }
.stat b { display: block; font-size: 22px; color: var(--teal-deep); }
.stat span { font-size: 11px; color: #556; }
.controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 14px 0 6px; }
.controls input[type="search"] { flex: 1 1 240px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 10px; font: inherit; }
.chipbtn { border: 1px solid var(--line); background: #fff; border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 12px; cursor: pointer; }
.chipbtn[aria-pressed="true"] { background: var(--teal); border-color: var(--teal); color: #fff; }
.section h2 { font-size: 15px; color: var(--teal-deep); margin: 22px 0 10px; border-bottom: 2px solid var(--line); padding-bottom: 8px; }
.count { background: #E4EBE4; border-radius: 8px; padding: 0 8px; font-size: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 14px; }
.card { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 1px 2px rgba(15,30,25,.05); }
.card[hidden] { display: none; }
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.card-head h3 { margin: 0; font-size: 15px; }
.pill { font-size: 10.5px; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
.pill--ready { background: #E3F2E9; color: var(--ok); border: 1px solid #B9DCC8; }
.pill--partial { background: #FBF3DE; color: var(--warn); border: 1px solid #E9D9A8; }
.pill--missing { background: #FAE3E3; color: var(--danger); border: 1px solid #EBBDBD; }
.card-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.chip { font-size: 10px; background: #EEF2EC; border-radius: 6px; padding: 2px 8px; }
code { font-size: 10.5px; background: #F0EFE9; border-radius: 6px; padding: 2px 6px; direction: ltr; }
.card-summary { margin: 0; font-size: 12px; line-height: 1.9; color: #2C3E38; }
.card-details summary { font-size: 11.5px; color: var(--teal-deep); cursor: pointer; }
.card-details ul { margin: 6px 18px 0 0; padding: 0; font-size: 11.5px; line-height: 2; }
.card-limitation { margin: 0; font-size: 11px; color: #7A3B10; background: #FDF6EC; border-radius: 8px; padding: 6px 8px; }
.card-foot { margin-top: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; border-top: 1px dashed var(--line); padding-top: 8px; }
.persona { font-size: 10px; color: #5A6B64; flex-basis: 100%; }
.btn { text-decoration: none; border-radius: 8px; padding: 7px 12px; font-size: 12px; border: 1px solid transparent; cursor: pointer; font-family: inherit; }
.btn--primary { background: var(--teal); color: #fff; }
.btn--primary:hover { background: var(--teal-deep); }
.btn--ghost { background: #fff; border-color: var(--teal); color: var(--teal-deep); }
footer.help { border-top: 1px solid var(--line); background: #fff; padding: 18px 28px; font-size: 12px; line-height: 2.1; color: #33433C; }
footer.help code { background: #F0EFE9; }
footer.help h2 { font-size: 13px; margin: 0 0 6px; color: var(--teal-deep); }
.empty { display: none; text-align: center; color: #678; padding: 30px; }
.empty.visible { display: block; }
@media (max-width: 560px) { main, header.top, footer.help { padding-inline: 14px; } .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header class="top">
  <h1>بورو بیا — کاتالوگ بازبینی بصری ۲٫۰</h1>
  <p class="sub">پیش‌نمایش زندهٔ واقعی‌ترین صفحات پیاده‌سازی‌شده، با دادگان کاملاً ساختگی · ${esc(date)}</p>
  <div class="badges">
    <span class="badge">داده‌ها ۱۰۰٪ ساختگی‌اند</span>
    <span class="badge">بدون اتصال به سرور یا پایگاه‌دادهٔ واقعی</span>
    <span class="badge">تأیید بصری فقط توسط صاحب محصول</span>
  </div>
</header>
<div class="notice">این کاتالوگ از رجیستری صریح <code>src/client/preview/registry.ts</code> ساخته می‌شود و هیچ صفحه‌ای صرفاً به‌خاطر وجود ارجاع طراحی یا کامپوننت وارد آن نشده است. همهٔ لینک‌ها همین‌جا (<code>${esc(requestHost)}</code>) را باز می‌کنند؛ هیچ داده‌ای از بیرون بارگذاری نمی‌شود.</div>
<main>
  <div class="stats">
    <div class="stat"><b>${previewCounts.total}</b><span>صفحهٔ پیش‌نمایش‌پذیر</span></div>
    <div class="stat"><b>${previewCounts.ready}</b><span>آمادهٔ بازبینی</span></div>
    <div class="stat"><b>${previewCounts.partial}</b><span>پیاده‌سازی ناقص (با ذکر دلیل)</span></div>
    <div class="stat"><b>${previewCounts.notReady}</b><span>آماده نیست</span></div>
  </div>
  <div class="controls" role="toolbar" aria-label="فیلتر صفحات">
    <input id="q" type="search" placeholder="جست‌وجو در نام صفحه یا مسیر…" aria-label="جست‌وجو">
    <button class="chipbtn" data-filter-section="all" aria-pressed="true">همه</button>
    <button class="chipbtn" data-filter-section="auth" aria-pressed="false">ورود و عضویت</button>
    <button class="chipbtn" data-filter-section="user" aria-pressed="false">تجربهٔ کاربر</button>
    <button class="chipbtn" data-filter-section="admin" aria-pressed="false">کنسول مدیریت</button>
  </div>
  ${sections}
  <p class="empty" id="empty">صفحه‌ای با این فیلتر پیدا نشد.</p>
</main>
<footer class="help">
  <h2>راه‌اندازی و دسترسی</h2>
  <div>اجرا: <code>bun run preview</code> (ساخت خودکار) یا <code>bun run preview:build</code> سپس <code>bun scripts/preview.ts --skip-build</code></div>
  <div>توقف: <code>Ctrl+C</code> · پورت پیش‌فرض <code>4173</code> (<code>--port</code> یا متغیر <code>PREVIEW_PORT</code>)</div>
  <div>محلی: <code>http://127.0.0.1:4173/</code> · شبکهٔ محلی (LAN): <code>http://&lt;IP-رایانهٔ شما&gt;:4173/</code> — سرور روی <code>0.0.0.0</code> گوش می‌دهد؛ فقط در همان شبکه در دسترس است و نباید به اینترنت عمومی باز شود.</div>
  <div>دیوار آتش: روی لینوکس <code>sudo ufw allow 4173/tcp</code> (یا معادل iptables/firewalld)؛ روی macOS در صورت پرسش، دسترسی «Network» را برای اجرای ترمینال تأیید کنید؛ روی ویندوز یک قاعدهٔ inbound برای پورت 4173 بسازید. بدون این قواعد، دستگاه‌های دیگر LAN به پیش‌نمایش نمی‌رسند.</div>
  <div>هیچ حسابی در این محیط واقعی نیست؛ رمز عبور هر چیزی که دلتان بخواهد کار می‌کند. خروج از حساب نمایشی با دکمهٔ خروج انجام می‌شود ولی نشست فقط تا بارگذاری مجدد باقی می‌ماند.</div>
</footer>
<script>
const cards = [...document.querySelectorAll('.card')];
const sections = [...document.querySelectorAll('.section')];
const empty = document.getElementById('empty');
const query = document.getElementById('q');
let section = 'all';
function apply() {
  const q = (query.value || '').trim().toLowerCase();
  let visible = 0;
  for (const card of cards) {
    const matchSection = section === 'all' || card.dataset.section === section;
    const matchQuery = !q || (card.dataset.search || '').includes(q);
    const show = matchSection && matchQuery;
    card.hidden = !show;
    if (show) visible++;
  }
  for (const sec of sections) {
    const any = [...sec.querySelectorAll('.card')].some((c) => !c.hidden);
    sec.style.display = any ? '' : 'none';
  }
  empty.classList.toggle('visible', visible === 0);
}
query.addEventListener('input', apply);
for (const btn of document.querySelectorAll('[data-filter-section]')) {
  btn.addEventListener('click', () => {
    section = btn.dataset.filterSection;
    for (const other of document.querySelectorAll('[data-filter-section]')) other.setAttribute('aria-pressed', String(other === btn));
    apply();
  });
}
for (const btn of document.querySelectorAll('[data-mobile-href]')) {
  btn.addEventListener('click', () => {
    window.open(btn.dataset.mobileHref, 'preview-mobile', 'width=390,height=844,menubar=no,toolbar=no,location=no');
  });
}
</script>
</body>
</html>`;
}

/* ------------------------------------------------------------ server */
const lanIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((entry): entry is os.NetworkInterfaceInfo => Boolean(entry) && entry!.family === 'IPv4' && !entry!.internal)
  .map((entry) => entry.address);

let server: ReturnType<typeof Bun.serve>;
try {
  server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: SECURITY_HEADERS });
    }

    // Catalog
    if (pathname === '/' || pathname === '/index.html') {
      return new Response(catalogHtml(url.host), { headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS } });
    }

    // Built app: static assets, then SPA fallback.
    if (pathname === '/app') {
      return Response.redirect(`${url.origin}/app/`, 302);
    }
    if (pathname.startsWith('/app/')) {
      const asset = resolveAppAsset(pathname);
      if (asset) return serveFile(asset);
      const index = path.join(APP_DIR, 'preview.html');
      if (existsSync(index)) return serveFile(index);
      return new Response('Preview app is not built. Run `bun run preview:build`.', { status: 503, ...SECURITY_HEADERS });
    }

    // Vector tiles (same URL shape the client uses).
    const tile = /^\/_public\/map\/tiles\/(\d+)\/(\d+)\/(\d+)\.svg$/.exec(pathname);
    if (tile) {
      const z = Number(tile[1]), x = Number(tile[2]), y = Number(tile[3]);
      if (z > 22 || x >= 2 ** z || y >= 2 ** z) return new Response('Bad tile', { status: 400, headers: SECURITY_HEADERS });
      return new Response(tileSvg(z, x, y), { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400', ...SECURITY_HEADERS } });
    }

    // Built static assets shared with the real app shell.
    if (pathname.startsWith('/assets/')) {
      const asset = resolvePublicAsset(pathname);
      if (asset) return serveFile(asset);
      return new Response('Not Found', { status: 404, headers: SECURITY_HEADERS });
    }
    if (pathname === '/manifest.webmanifest' && existsSync(MANIFEST)) {
      return serveFile(MANIFEST);
    }

    // Anything else: go home.
    return Response.redirect(`${url.origin}/`, 302);
  }
  });
} catch (error) {
  console.error(`[preview] could not bind ${HOST}:${PORT} (${(error as Error).message}). Is another preview already running? Use --port or stop the old one.`);
  process.exit(1);
}

console.log(`[preview] listening on http://${HOST}:${server.port}/`);
console.log(`[preview] local:   http://127.0.0.1:${server.port}/`);
for (const ip of lanIps) console.log(`[preview] network: http://${ip}:${server.port}/`);
console.log('[preview] catalog, app and tiles all served from this process; Ctrl+C to stop.');
