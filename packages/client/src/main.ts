import { createApp } from "vue";
import App from "./App.vue";
import { createAppRouter } from "./router";
import { pinia } from "./stores";
import { vuetify } from "./plugins/vuetify";
import "@mdi/font/css/materialdesignicons.css";
import "./styles/tailwind.css";

const router = createAppRouter();
createApp(App).use(pinia).use(router).use(vuetify).mount("#app");
