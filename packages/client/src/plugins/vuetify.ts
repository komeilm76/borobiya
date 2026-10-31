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
  // The bundled native date adapter computes Gregorian months. Its default fa-IR labels
  // would otherwise show Persian month names on Gregorian day grids (wrong dates).
  date: { locale: { fa: "fa-IR-u-ca-gregory" } },
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
