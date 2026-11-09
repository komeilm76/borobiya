import { createApp, watch } from "vue";
import App from "./App.vue";
import { createAppRouter } from "./router";
import { pinia } from "./stores";
import { useThemeStore } from "./stores/theme";
import { vuetify } from "./plugins/vuetify";
import { installDesignTokenStyles } from "./styles/tokens";
import { registerMapCacheWorker } from "./services/map-cache";
import "@mdi/font/css/materialdesignicons.css";
// Bundle the OFL-licensed Persian font locally; CSS includes WOFF2 and WOFF
// fallback per weight/subset, so iOS Safari needs no OS font or external CDN.
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import "@fontsource/vazirmatn/800.css";
import "@fontsource/vazirmatn/900.css";
import "./styles/tailwind.css";
import "./styles/auth.css";
import "./styles/public.css";

installDesignTokenStyles(document);
const theme = useThemeStore(pinia);
watch(
  () => theme.vuetifyThemeName,
  (name) => { vuetify.theme.global.name.value = name; },
  { immediate: true, flush: "sync" }
);

void registerMapCacheWorker();

const router = createAppRouter();
createApp(App).use(pinia).use(router).use(vuetify).mount("#app");
