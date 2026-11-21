/**
 * Build for the visual preview bundle. Produces `build/preview-app/` from `preview.html`,
 * with `import.meta.env.VITE_PREVIEW_DEMO=true` so the demo fetch mock and demo persona
 * are compiled in and production builds are unaffected.
 */
import { defineConfig, mergeConfig } from 'vite';
import baseConfig from './vite.config.ts';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig((env) =>
  mergeConfig(
    typeof baseConfig === 'function' ? baseConfig(env) : baseConfig,
    defineConfig({
      base: '/app/',
      // The Vite root for this build is src/client (inherited from the base config), so the
      // repo-root `.env.preview` (VITE_PREVIEW_DEMO=true) would not be picked up; point envDir
      // at the repo root so the router compiles its `/app/` base and the demo bundle is honest.
      envDir: fileURLToPath(new URL('.', import.meta.url)),
      build: {
        outDir: fileURLToPath(new URL('./build/preview-app', import.meta.url)),
        emptyOutDir: true,
        rollupOptions: {
          input: fileURLToPath(new URL('./src/client/preview.html', import.meta.url)),
          output: {
            entryFileNames: 'js/[name].js',
            chunkFileNames: 'js/[name]-[hash].js'
          }
        }
      }
    })
  )
);
