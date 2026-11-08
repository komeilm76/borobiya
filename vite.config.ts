import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * Vite build for the Borobiya Vue 3 client.
 * The Bun server in `src/server` serves `public/` at runtime, so Vite writes its bundle there.
 * Vite and Vitest are the only tools with Node-compatible internals; every command is
 * launched through Bun (`bun run build`, `bunx vitest`, `bun run dev`).
 */
export default defineConfig({
  root: fileURLToPath(new URL('./src/client', import.meta.url)),
  base: '/',
  publicDir: false,
  plugins: [
    vue(),
    // Tree-shaken Vuetify component and directive imports; the full SASS build is disabled so
    // the canonical design tokens in app.css remain the single source of visual truth.
    vuetify({ autoImport: true, styles: { configFile: 'styles/vuetify-settings.scss' } }),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/client', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url))
    }
  },
  define: {
    __VUE_OPTIONS_API__: 'false',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
  },
  build: {
    outDir: fileURLToPath(new URL('./public', import.meta.url)),
    emptyOutDir: false,
    manifest: false,
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: (asset) => {
          if (asset.names?.some((name) => name.endsWith('.css'))) return 'app.css';
          return 'assets/[name][extname]';
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false
  }
});
