import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Deployment/entry regressions without mounting a browser-only map or auth store.
const app = readFileSync(new URL("../App.vue", import.meta.url), "utf8");
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const nginx = readFileSync(new URL("../../../../nginx.vm.conf", import.meta.url), "utf8");
const viteConfig = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");

describe("slow-network first load", () => {
  it("keeps map-only shell components out of public and login entry chunks", () => {
    for (const component of ["MapSidebar", "MapProposalSidebar", "SosRequestSheet"]) {
      expect(app).toContain(`const ${component} = defineAsyncComponent(() => import("./components/`);
      expect(app).toContain(`<${component}`);
      expect(app).not.toContain(`import ${component} from`);
    }
    // SOS is still mounted as soon as a session arrives, not on its first click.
    expect(app).toContain('<SosRequestSheet v-if="showSosButton"');
    expect(main).toContain('import "@fontsource-variable/vazirmatn/wght.css";');
    expect(main).not.toContain('void registerMapCacheWorker()');
    const canvas = readFileSync(new URL("../components/map/MapCanvas.vue", import.meta.url), "utf8");
    expect(canvas).toContain('prepareMapRuntime(registerMapCacheWorker, () => import("maplibre-gl"))');
  });

  it("shows a readable status before JavaScript and while a protected route verifies its session", () => {
    expect(html).toContain('<div id="app"><div id="startup-status" role="status" aria-live="polite">');
    expect(html).toContain('html[data-theme="dark"] #startup-status');
    expect(viteConfig).toContain('plugins: [inlineThemeBootstrap(), vue()');
    expect(viteConfig).toContain('return html.replace(tag, `<script>${script}</script>`);');
    expect(app).toContain('<div v-if="!Component" class="app-route-pending" role="status" aria-live="polite">');
  });

  it("compresses VM assets, caches fingerprinted chunks, and revalidates the entry HTML", () => {
    expect(nginx).toContain("gzip on;");
    expect(nginx).toContain("gzip_types text/css application/javascript application/json image/svg+xml;");
    expect(nginx).toMatch(/location \^~ \/assets\/ \{\s*try_files \$uri =404;\s*add_header Cache-Control "public, max-age=31536000, immutable";/);
    expect(nginx).toMatch(/location = \/maplibre-gl-worker\.mjs \{\s*try_files \$uri =404;\s*add_header Cache-Control "public, max-age=300, must-revalidate";/);
    expect(nginx).toMatch(/location = \/index\.html \{\s*add_header Cache-Control "no-cache";/);
    expect(nginx).toContain("try_files $uri $uri/ /index.html;");
  });
});
