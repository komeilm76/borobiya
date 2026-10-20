import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, type Plugin } from "vite";
import { parseMapConfig } from "../../map-server/routing-gateway/map-config.mjs";
import { defineConfig } from "vitest/config";
import vuetify from "vite-plugin-vuetify";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(packageRoot, "../..");

function proxyPrefix(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().replace(/\/+$/, "");
  return normalized?.startsWith("/") && normalized !== "/" ? normalized : fallback;
}

function stripPrefix(prefix: string) {
  return (requestPath: string) => requestPath.slice(prefix.length) || "/";
}

// MapLibre GL JS v6 locates its worker as a sibling of its (pre)bundled chunk,
// where Vite never emits it ("Worker failed to load"). Serve the package's
// self-contained worker file verbatim at a stable path in dev and build;
// MapCanvas points MapLibre at it via setWorkerUrl("/maplibre-gl-worker.mjs").
const maplibreWorkerPath = createRequire(import.meta.url).resolve(
  "maplibre-gl/dist/maplibre-gl-worker.mjs"
);

function maplibreWorkerPlugin(): Plugin {
  const readWorker = () => readFileSync(maplibreWorkerPath);
  return {
    name: "borobiya-maplibre-worker",
    configureServer(server) {
      server.middlewares.use("/maplibre-gl-worker.mjs", (_request, response) => {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.end(readWorker());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "maplibre-gl-worker.mjs", source: readWorker() });
    }
  };
}

export default defineConfig(({ mode }) => {
  // Only the proxy process reads service targets; browser code uses same-origin /api, /map, /map-config, /route, /geocode, /reverse, and Martin resource paths.
  const env = loadEnv(mode, repositoryRoot, "");
  // Validate the same public MAP_* settings that the routing gateway exposes at /map-config.
  parseMapConfig(env);
  const apiPrefix = proxyPrefix(env.VITE_API_URL, "/api");
  const mapPrefix = proxyPrefix(env.VITE_MAP_URL, "/map");
  const mapServerTarget = env.MAP_SERVER_URL || "http://127.0.0.1:8000";
  const routingTarget = new URL(env.MAP_ROUTING_URL || "http://127.0.0.1:8001/route").origin;
  // Martin expands the relative sprite/glyph/tile URLs in served styles to
  // absolute URLs built from the request Host. changeOrigin must therefore
  // stay false for every Martin-bound proxy: rewriting Host to the target
  // (e.g. localhost:8000) poisons the generated URLs for any browser that
  // reaches the dev server through another name/IP, and the map then fails
  // to load. Nginx already preserves the public Host the same way.
  const mapResourceProxy = Object.fromEntries(
    ["/tehran/", "/sprite/", "/font/"].map((prefix) => [
      prefix,
      { target: mapServerTarget, changeOrigin: false }
    ])
  );

  return {
    root: packageRoot,
    envDir: repositoryRoot,
    plugins: [vue(), vuetify({ autoImport: true }), tailwindcss(), maplibreWorkerPlugin()],
    resolve: {
      alias: {
        "@": resolve(packageRoot, "src"),
        "@client": resolve(packageRoot, "src"),
        "@shared": resolve(packageRoot, "../shared/src")
      }
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["localhost", "127.0.0.1", ".e2b.app"],
      proxy: {
        "/map-config": {
          target: routingTarget,
          changeOrigin: true,
          rewrite: () => "/config"
        },
        "/route": {
          target: routingTarget,
          changeOrigin: true
        },
        "/geocode": {
          target: routingTarget,
          changeOrigin: true
        },
        "/reverse": {
          target: routingTarget,
          changeOrigin: true
        },
        [apiPrefix]: {
          target: env.API_PROXY_TARGET || "http://127.0.0.1:3000",
          changeOrigin: true,
          rewrite: stripPrefix(apiPrefix)
        },
        [mapPrefix]: {
          target: mapServerTarget,
          changeOrigin: false,
          rewrite: stripPrefix(mapPrefix)
        },
        ...mapResourceProxy
      }
    },
    preview: {
      host: "0.0.0.0",
      allowedHosts: ["localhost", "127.0.0.1", ".e2b.app"]
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"]
    }
  };
});
