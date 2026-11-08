import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi';

/**
 * Vuetify instance configured with the Borobiya design tokens.
 * Tailwind's preflight is disabled in `styles/tailwind.css`, so Vuetify's own reset stays
 * authoritative and neither library overrides the other.
 */
export const vuetify = createVuetify({
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  theme: {
    defaultTheme: 'borobiyaLight',
    themes: {
      borobiyaLight: {
        dark: false,
        colors: {
          background: '#F6F9F8',
          surface: '#FFFFFF',
          primary: '#0E6666',
          'primary-darken-1': '#0A4B4B',
          secondary: '#316D86',
          error: '#AF3438',
          info: '#316D86',
          success: '#28724F',
          warning: '#8C5609'
        }
      },
      borobiyaDark: {
        dark: true,
        colors: {
          background: '#0B1A1A',
          surface: '#122A2A',
          primary: '#71C7BE',
          'primary-darken-1': '#0E6666',
          secondary: '#7FB6C9',
          error: '#E3797C',
          info: '#7FB6C9',
          success: '#6FC49A',
          warning: '#D9A94E'
        }
      }
    }
  },
  defaults: {
    VBtn: { rounded: 'lg', height: 44, class: 'text-none' },
    VTextField: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VSelect: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VTextarea: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VDialog: { scrim: 'rgba(10, 30, 30, 0.45)' },
    VCard: { rounded: 'xl', elevation: 0 },
    VChip: { rounded: 'lg' }
  }
});
