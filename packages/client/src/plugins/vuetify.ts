import { createVuetify } from "vuetify";
import { fa } from "vuetify/locale";
import "vuetify/styles";

export const vuetify = createVuetify({
  locale: {
    locale: "fa",
    fallback: "en",
    messages: { fa },
    rtl: { fa: true }
  },
  theme: {
    defaultTheme: "borobiyaLight",
    themes: {
      borobiyaLight: {
        dark: false,
        colors: {
          background: "#F4F7F6",
          surface: "#FFFFFF",
          primary: "#0E6666",
          secondary: "#E9B35A",
          accent: "#D77A58",
          error: "#B83F42",
          success: "#347C61",
          info: "#4A7C91"
        }
      },
      borobiyaDark: {
        dark: true,
        colors: {
          background: "#111C1D",
          surface: "#1B292A",
          primary: "#71C7BE",
          secondary: "#E9B35A",
          accent: "#F09A75",
          error: "#F37C7C",
          success: "#6BBE93",
          info: "#85B8D0"
        }
      }
    }
  }
});
