import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { installMotion } from './motion/index.ts';
import App from './App.vue';
import { router } from './router/index.ts';
import { vuetify } from './plugins/vuetify.ts';
import { useSettingsStore } from './stores/settings.ts';
import { useOfflineStore } from './stores/offline.ts';
import './styles/tailwind.css';

/**
 * Client entry point. The theme is applied before the first paint, the Pinia stores are
 * installed, and the service worker plus cache version are registered after mount.
 */
const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(vuetify);
installMotion(app);

const settings = useSettingsStore(pinia);
settings.apply(settings.themeChoice);

const offline = useOfflineStore(pinia);

app.mount('#app');

void offline.registerServiceWorker();
void offline.loadCacheVersion();
router.isReady().then(() => {
  document.body.dataset.mode = String(router.currentRoute.value.meta.layout ?? 'auth');
});
