import type { CapacitorConfig } from "@capacitor/cli";

// Static local builds may use Capacitor's default https://localhost for debug.
// Release builds intentionally load the existing production same-origin web app:
// /api, /map, /route, Socket.IO and auth cookies do not work from an isolated
// bundled https://localhost origin without a separately designed native gateway.
const publicOrigin = process.env.BOROBIYA_ANDROID_ORIGIN;
let server: CapacitorConfig["server"] = { androidScheme: "https" };
if (publicOrigin) {
  const url = new URL(publicOrigin);
  if (url.protocol !== "https:" || url.origin !== publicOrigin || url.port || url.username || url.password ||
      !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(url.hostname)) {
    throw new Error("BOROBIYA_ANDROID_ORIGIN must be an exact public HTTPS origin without a port or path.");
  }
  server = { androidScheme: "https", url: url.origin, allowNavigation: [url.hostname], cleartext: false };
} else if (process.env.CI === "true") {
  throw new Error("BOROBIYA_ANDROID_ORIGIN is required to build a release APK in CI.");
}

const config: CapacitorConfig = {
  appId: "com.borobiya.app",
  appName: "Borobiya",
  webDir: "dist",
  server
};

export default config;
