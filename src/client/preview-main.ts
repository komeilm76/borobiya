/**
 * Entry point of the visual preview bundle (`bun run preview`).
 *
 * Identical to `main.ts` except it installs the deterministic demo fetch mock
 * (and demo persona) before the app mounts, and never registers a service worker.
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { installMotion } from './motion/index.ts';
import App from './App.vue';
import { router } from './router/index.ts';
import { vuetify } from './plugins/vuetify.ts';
import { useSettingsStore } from './stores/settings.ts';
import { installDemoFetch, setPreviewPersona, setPreviewSession } from './preview/demo-fetch.ts';
import './styles/tailwind.css';

const params = new URLSearchParams(window.location.search);
const persona = params.get('persona');
if (persona === 'admin' || persona === 'onboarding' || persona === 'user') setPreviewPersona(persona);
if (params.get('anon') === '1') setPreviewSession(false);
installDemoFetch();

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(vuetify);
installMotion(app);

const settings = useSettingsStore(pinia);
settings.apply(settings.themeChoice);

app.mount('#app');

/* Floating "fake data" pill — part of the contract that previews never look like real data. */
const pill = document.createElement('div');
pill.setAttribute('data-testid', 'preview-pill');
pill.textContent = 'پیش‌نمایش با دادگان ساختگی';
Object.assign(pill.style, {
  position: 'fixed', bottom: '14px', insetInlineStart: '14px', zIndex: '10000',
  background: '#AF3438', color: '#fff', fontSize: '11px', fontWeight: '700',
  padding: '6px 10px', borderRadius: '999px', opacity: '0.92',
  fontFamily: 'Vazirmatn, system-ui, sans-serif', pointerEvents: 'none',
  boxShadow: '0 2px 10px rgba(0,0,0,0.25)'
} satisfies Partial<CSSStyleDeclaration>);
document.body.appendChild(pill);

document.body.dataset.mode = String(router.currentRoute.value.meta.layout ?? 'auth');
router.isReady().then(() => {
  document.body.dataset.mode = String(router.currentRoute.value.meta.layout ?? 'auth');
});
