import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
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

export default defineConfig(({ mode }) => {
  // Only the proxy process reads these targets; browser code uses same-origin /api, /map, and Martin resource paths.
  const env = loadEnv(mode, repositoryRoot, "");
  const apiPrefix = proxyPrefix(env.VITE_API_URL, "/api");
  const mapPrefix = proxyPrefix(env.VITE_MAP_URL, "/map");
  const mapServerTarget = env.MAP_SERVER_URL || "http://127.0.0.1:8000";
  const mapResourceProxy = Object.fromEntries(
    ["/tehran/", "/sprite/", "/font/"].map((prefix) => [
      prefix,
      { target: mapServerTarget, changeOrigin: true }
    ])
  );

  return {
    root: packageRoot,
    envDir: repositoryRoot,
    plugins: [vue(), vuetify({ autoImport: true }), tailwindcss()],
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
        [apiPrefix]: {
          target: env.API_PROXY_TARGET || "http://127.0.0.1:3000",
          changeOrigin: true,
          rewrite: stripPrefix(apiPrefix)
        },
        [mapPrefix]: {
          target: mapServerTarget,
          changeOrigin: true,
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
