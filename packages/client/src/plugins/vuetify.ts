import { createVuetify } from "vuetify";
import { fa } from "vuetify/locale";
import { vuetifyThemeColors } from "@/styles/tokens";
import "vuetify/styles";

function getInitialThemeName(): "borobiyaLight" | "borobiyaDark" {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark"
    ? "borobiyaDark"
    : "borobiyaLight";
}

export const vuetify = createVuetify({
  locale: {
    locale: "fa",
    fallback: "en",
    messages: { fa },
    rtl: { fa: true }
  },
  theme: {
    defaultTheme: getInitialThemeName(),
    themes: {
      borobiyaLight: {
        dark: false,
        colors: vuetifyThemeColors("light")
      },
      borobiyaDark: {
        dark: true,
        colors: vuetifyThemeColors("dark")
      }
    }
  }
});
