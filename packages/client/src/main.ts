import { createApp, watch } from "vue";
import App from "./App.vue";
import { createAppRouter } from "./router";
import { pinia } from "./stores";
import { useThemeStore } from "./stores/theme";
import { vuetify } from "./plugins/vuetify";
import { installDesignTokenStyles } from "./styles/tokens";
import { registerMapCacheWorker } from "./services/map-cache";
import "@mdi/font/css/materialdesignicons.css";
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
