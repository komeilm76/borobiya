import { createApp, watch } from "vue";
import App from "./App.vue";
import { createAppRouter } from "./router";
import { pinia } from "./stores";
import { useThemeStore } from "./stores/theme";
import { vuetify } from "./plugins/vuetify";
import { installDesignTokenStyles } from "./styles/tokens";
import "@mdi/font/css/materialdesignicons.css";
// One self-hosted variable WOFF2 per script covers every UI weight (100–900),
// instead of downloading separate Persian/Latin files for each weight.
import "@fontsource-variable/vazirmatn/wght.css";
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

// MapCanvas registers the tile cache only when a map is actually opened;
// public and auth screens need no competing service-worker request.
const router = createAppRouter();
createApp(App).use(pinia).use(router).use(vuetify).mount("#app");
