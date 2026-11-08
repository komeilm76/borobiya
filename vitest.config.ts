import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { fileURLToPath, URL } from 'node:url';

/**
 * Vitest configuration: happy-dom for component tests, node for server/runtime tests,
 * Vue SFC compilation with the same plugins as the production build, and coverage thresholds
 * that keep the previous gate's intent (no silent coverage deletion).
 */
export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true, styles: { configFile: 'styles/vuetify-settings.scss' } })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/client', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url))
    }
  },
  test: {
    globals: false,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    server: {
      deps: {
        inline: ['vuetify']
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/shared/**/*.ts', 'src/server/**/*.ts', 'src/client/**/*.ts', 'src/client/**/*.vue'],
      exclude: [
        'src/client/main.ts',
        'src/client/env.d.ts',
        'src/server/index.ts',
        'src/client/service-worker/**'
      ],
      // Raised after the view, layout, route-guard, browser-transport, push-to-talk and mobile-shell
      // command-palette, SOS-store, recovery, device-list, API-contract, mission, composer, registration push-to-talk and sign-in suites landed (59% → 84% statements, 88% lines); the guard sits a few points below the
      // measured figures so an unrelated small change cannot fail it by rounding alone, while a
      // genuine coverage loss still does.
      thresholds: {
        lines: 87,
        functions: 79,
        statements: 83,
        branches: 70
      }
    }
  }
});
