// Real TLS + Vite HMR upgrade smoke test. Run with Node, not Bun:
// NODE_EXTRA_CA_CERTS=<ca.pem> BOROBIYA_DEV_TLS_CERT=<IP.pem> BOROBIYA_DEV_TLS_KEY=<IP.key> \
//   node packages/client/scripts/test-dev-https-hmr.mjs
import assert from "node:assert/strict";
import https from "node:https";
import { createServer, loadConfigFromFile } from "vite";

assert.ok(!process.versions.bun, "Vite's HTTPS HMR smoke test must run on Node, not Bun");
assert.ok(process.env.BOROBIYA_DEV_TLS_CERT && process.env.BOROBIYA_DEV_TLS_KEY && process.env.NODE_EXTRA_CA_CERTS);

const configFile = new URL("../vite.config.ts", import.meta.url).pathname;
const loaded = await loadConfigFromFile({ command: "serve", mode: "development" }, configFile);
assert.ok(loaded, "Project Vite config must load");
// Use the actual HTTPS/proxy/plugin configuration but explicitly disable the
// watcher for this one-shot handshake. Passing watch:null alongside configFile
// does not work: Vite merges the file afterward and loses the null override.
// A generated Capacitor android/ tree otherwise leaves hundreds of native file
// watchers alive after close(), making a successful WSS smoke time out.
const vite = await createServer({
  ...loaded.config,
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { ...loaded.config.server, host: "127.0.0.1", port: 0, watch: null }
});
let socket;
try {
  await vite.listen();
  const port = vite.httpServer?.address()?.port;
  assert.ok(Number.isInteger(port));
  const html = await new Promise((resolve, reject) => {
    https.get(`https://127.0.0.1:${port}/`, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => response.statusCode === 200 ? resolve(body) : reject(new Error(`HTTPS ${response.statusCode}`)));
    }).on("error", reject);
  });
  assert.match(html, /<html/);

  socket = new WebSocket(`wss://127.0.0.1:${port}/`, "vite-hmr");
  const message = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for Vite WSS HMR")), 5000);
    socket.addEventListener("message", (event) => { clearTimeout(timer); resolve(event.data); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Vite WSS upgrade failed")); }, { once: true });
  });
  assert.deepEqual(JSON.parse(message), { type: "connected" });
  console.log("Trusted HTTPS response and WSS HMR handshake passed under Node.");
} finally {
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    // Node's WebSocket close is asynchronous. Closing Vite in the same tick can
    // strand its HMR shutdown waiting for this client (the WSS handshake passed,
    // but the smoke test timed out in teardown). Drain the close handshake first.
    const closed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out closing Vite WSS HMR client")), 5000);
      socket.addEventListener("close", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    socket.close();
    await closed;
  }
  await vite.close();
}
