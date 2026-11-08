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
      // command-palette, SOS-store, recovery, device-list, API-contract, mission, composer, registration push-to-talk and sign-in suites landed (59% → 84% statements, 88% lines, 81% functions); the guard sits a few points below the
      // measured figures so an unrelated small change cannot fail it by rounding alone, while a
      // genuine coverage loss still does.
      thresholds: {
        // Set from the *worst* observed run, not a single measurement: two views were previously
        // only exercised by the generic mount sweep, so how much of them executed depended on
        // timing and the suite's statement total moved between identical runs (87.06-87.32%).
        // Each of those views now has its own deterministic suite. Later suites then raised the
        // floor again — the push-to-talk floor, and the map canvas, whose duplicate projection was
        // deleted when the canvas was given one.
        //
        // The figure is still not perfectly reproducible, and the cause is understood: several spec
        // files import the same single-file component, so it is instrumented more than once with
        // different statement ids, and the v8 remap then reports one record or the other rather
        // than their union. The result is a whole-file difference that appears in a minority of
        // runs — `MissionView.vue` reports 45 or 43 covered lines, which moves the total between
        // 92.05% and 92.00%. Disabling `fileParallelism`, enabling `experimentalAstAwareRemapping`,
        // and importing the components statically instead of through a computed specifier were each
        // measured and none removed it. So the guards sit below the *lowest* figure seen in a clean
        // checkout (88.17 / 91.83 / 89.12 / 76.19) rather than below the typical one. A threshold
        // between the two would be a coin flip, which is how this cost a red build once already.
        lines: 91,
        functions: 89,
        statements: 88,
        branches: 76

      }
    }
  }
});
