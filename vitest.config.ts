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
        // The preview bundle entry mirrors main.ts and is exercised by `bun run preview`, not by unit tests.
        'src/client/preview-main.ts',
        'src/client/env.d.ts',
        'src/server/index.ts',
        'src/client/service-worker/**'
      ],
      // Raised after the core-primitive edge suite (cache, crypto, validate, state, geo, repository
      // corruption tolerance, lifecycle, static fallbacks) landed — the suite now sits at ~97%
      // statements/lines and ~97%/87% functions/branches. The guard stays a few points below the
      // measured figures so an unrelated small change cannot fail it by rounding alone, while a
      // genuine coverage loss still does.
      thresholds: {
        // The guards still sit a few points below the *lowest* figures measured in this workspace
        // (97.1 / 97.7 / 98.3 / 87.4 at the time they were raised) rather than at them, because a
        // minority of runs report one of the SFC-instrumented records instead of their union —
        // `MissionView.vue` in particular flips whole functions in and out between runs, and a
        // frozen install measured slightly lower than a symlinked one. Disabling
        // `fileParallelism`, enabling `experimentalAstAwareRemapping` and static SFC imports were
        // each measured and none removed the variance. The margin here keeps an unlucky merge from
        // failing CI while a genuine coverage loss still does.
        lines: 95,
        functions: 94,
        statements: 94,
        branches: 83

      }
    }
  }
});
