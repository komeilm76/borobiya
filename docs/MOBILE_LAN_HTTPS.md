# Mobile GPS on the LAN development server (HTTP ↔ HTTPS)

A phone opening `http://172.16.20.70:5173` cannot normally use `navigator.geolocation` (or the map service worker): a private-IP HTTP page is **not a secure context**. `localhost` is an exception only on the **same device**; your phone's `localhost` is not the computer's. To test on mobile Chrome at the required IP, use **trusted HTTPS with an IP subjectAltName**. Clicking through a certificate warning is not a replacement for installing the CA. This is a **local development** workflow, not a public TLS deployment.

## 1. Start the chosen mode

From the checkout on the machine owning the LAN IP (Linux/macOS/WSL with OpenSSL 3, Python 3 and Bun). Vite's HTTPS WebSocket HMR uses Node.js 20.19+ or 22.12+; on **Ubuntu x64** the launcher can install a private pinned copy automatically when `node` is missing:

```bash
# First, generate the private development CA and IP-specific server certificate:
./scripts/dev-lan.sh cert 172.16.20.70
# HTTPS, API + Vite as with `bun run dev` (Vite remains on port 5173):
./scripts/dev-lan.sh https 172.16.20.70
# Stop it with Ctrl-C; to return to the original HTTP behavior:
./scripts/dev-lan.sh http 172.16.20.70
# Or just: bun run dev
```

The script prints the public `ca.crt` path and SHA-256 fingerprint. By default certificates are under `${XDG_DATA_HOME:-$HOME/.local/share}/borobiya/dev-tls/` on the development machine; `BOROBIYA_DEV_TLS_DIR` can override the directory. `ca.key` and `172.16.20.70.key` are **private**: never put them on a phone, in an APK, in Git, in a message, or on a public server. Share **only `ca.crt`** (the public CA) with the phone, using a private transfer method such as USB. The script reuses the same CA and valid IP-specific leaf certificate on subsequent runs; keep the CA private key safe. If the machine IP changes, run `cert` or `https` again with the new IP, then visit that new IP on the phone. A publicly trusted CA normally will not issue a certificate for a private LAN IP.

The phone and computer must be on the same reachable LAN/VPN, with TCP 5173 allowed through the firewall and without Wi-Fi client isolation. Vite already binds `0.0.0.0`; the backends stay on their existing server-side HTTP proxy targets. Browser requests for `/api`, `/map`, `/route`, `/socket.io` (via `/api/socket.io`) and HMR remain on the **HTTPS origin**; the browser must not call a backend's `http://localhost`. Vite forwards the browser-facing scheme to the proxies for services that honor forwarded headers. Restart the server after changing the transport.

**Runtime note:** `bun run dev` and the `http` switch retain the usual Bun dev runner. With Bun 1.4.3, Vite's **HTTPS HMR WebSocket** upgrade can crash inside Bun's `ws` implementation (`TypeError: undefined is not an object (evaluating 'socket')`). The `https` switch keeps the API watcher on Bun but runs **Vite on Node.js**, including its `wss://` HMR server. If no supported system Node is found on Linux x64, Bun installs the exact `node-linux-x64@22.16.0` npm package in `${XDG_DATA_HOME:-$HOME/.local/share}/borobiya/dev-node/` (override with `BOROBIYA_DEV_NODE_DIR`); **no `sudo`, system package, or repo dependency is changed**. The one-time download needs the npm registry available through your existing Bun network/proxy settings; subsequent launches reuse this private binary offline. Do not run `sudo apt install nodejs` blindly: Ubuntu 24.04's default package can be Node 18, too old for Vite 7. On other platforms, install a supported Node version yourself. This does not affect the certificate or require an APK. The regression test `python3 -m unittest scripts/test_dev_lan.py` includes a real trusted HTTPS + WSS handshake when Node and dependencies are installed.

If using the project's API/Socket.IO from that origin, add `https://172.16.20.70:5173` to the comma-separated `CORS_ORIGINS` in the **local `.env`** (retain the existing entries), then restart the API. Do not use `*`. Vite's proxy itself does not eliminate the Socket.IO server's origin allowlist. If you need the backend to mark refresh cookies `Secure` behind the HTTPS Vite proxy, configure `TRUSTED_PROXY_IPS` for **only the actual local Vite proxy IP**, not a world-wide range; the API trusts `X-Forwarded-Proto` only from listed proxies. This is not required just to get GPS working.

## 2. Trust the CA on Android Chrome

1. Copy the script's **`ca.crt` only** to the phone. Compare its SHA-256 fingerprint to the one printed on the computer before installing it. Do **not** install `172.16.20.70.pem` as a CA and never transfer a `.key` file.
2. On Android, use **Settings → Security / Security & privacy → Encryption & credentials → Install a certificate → CA certificate** (menu names vary). Confirm the warning and select `ca.crt`. This installs a user CA on **that phone**, not on the server. Some managed devices block user CAs.
3. Restart Chrome and visit **`https://172.16.20.70:5173`**. Confirm that Chrome shows a valid secure connection, with no certificate/interstitial error. In DevTools on the page, `window.isSecureContext` must be `true`, and `navigator.geolocation` must exist. Then grant Chrome's site-location permission and enable device location services. Test the app's GPS action and Socket.IO/map requests. If the CA or IP changes, redo the relevant trust/certificate steps.
4. After testing, remove the development CA from Android's **user credentials** and from any debug builds that bundled it. A trusted CA can authenticate other names if its private key is stolen, so use it only on test devices.

For a laptop browser, import/trust `ca.crt` in that OS/browser trust store as needed. Do not disable Chrome certificate checks, mark arbitrary insecure origins as secure, or use a self-signed leaf with a click-through warning as an acceptance test.

## 3. Android APK / WebView is a different trust store

**Mobile Chrome does not need any APK.** The release workflow can generate a native Android project, but no native project is committed; `capacitor.config.ts` lives under `packages/client`. A WebView targeting Android 7+ generally does not trust user-installed CAs by default. To test a **debug APK only**, after generating the Capacitor Android project locally:

```bash
cd packages/client && bunx cap add android && cd ../.. # once, after bun run build
./scripts/dev-lan.sh android-debug 172.16.20.70
# Configure the *debug-only* Capacitor server URL to https://172.16.20.70:5173,
# and allow navigation to that IP; request Android location permissions.
# Then build/install a NEW debug APK, e.g. cd packages/client/android && ./gradlew assembleDebug
```

`android-debug` puts the **public CA only** into `packages/client/android/app/src/debug/res/raw/` and creates a debug-only `network_security_config.xml` and merged `AndroidManifest.xml` overlay. Android's debug build merges these resources and trusts this CA in the WebView (alongside system roots); release builds do **not** contain this overlay. The generated `packages/client/android/` directory is Git-ignored. The script does **not** create a Capacitor app, edit `capacitor.config.ts`, request location permissions, sign an APK, or verify that an APK was built. The release workflow prepares those permissions for its **generated release** project only; the local debug shell still needs its own permission configuration. A debug APK with bundled static files at `https://localhost` is not automatically connected to the computer: point its **debug server URL** at the exact LAN HTTPS IP for live Vite testing, then rebuild/reinstall the debug APK. Do not bundle the CA private key or development CA in a release APK; for a release, use a proper production HTTPS trust strategy and separately review network security configuration.

## Troubleshooting

| Symptom | Check |
|---|---|
| `isSecureContext === false`, GPS missing | Correct `https://` URL, user CA installation and Chrome's certificate status; HTTP on the LAN IP will not work. |
| Certificate warning | Compare CA fingerprint, check the current IP appears as an **IP SAN** on the server certificate, and check phone clock. Do not click through. |
| HTTPS page loads but login/live location fails | Include the HTTPS origin in `CORS_ORIGINS`, restart API, check `/api` and WSS in network tools. Do not point browser APIs at `localhost`. |
| HTTPS works but map tiles fail | Check DevTools for mixed-content `http://` URLs and whether the Martin proxy honors `X-Forwarded-Proto`; Vite keeps map requests same-origin. |
| Browser works but APK fails | Chrome's user CA trust is separate from Android WebView trust. Rebuild a **debug** APK with `android-debug` and verify the Capacitor debug server URL and native location permissions. |

## 4. Diagnose place search from Android Chrome

Even before that build is installed, you can test the **gateway** using only Chrome on the phone: open `https://172.16.20.70:5173/geocode?q=%DA%A9%D8%A7%D9%81%D9%87&limit=5` and then the same URL with `limit=30` (use `http://` instead if you selected the HTTP dev switch). On a deployed site use its own origin instead of the LAN address. A working route answers JSON beginning `{"type":"FeatureCollection","features":...}`; a JSON `error` code or a browser error is evidence of a gateway/Photon/proxy problem. If 5 succeeds but 30 fails, check that the routing gateway was upgraded along with the browser client, since older versions rejected limits above 20. This test deliberately omits `bbox` and **cannot** prove that the map's viewport request is valid. Share only the short JSON `error` code, not the entire response or URL if you used another private query.

After installing a build containing the search diagnostic, open **Map → Search**, enter a public test term (for example «کافه») and let the request finish. If Retry appears, the panel displays a selectable **گزارش امن خطا** and **کپی گزارش**. Copy *only* that line, e.g. `GET /geocode · HTTP_ERROR · HTTP 503 · geocoding_unavailable`. It contains no search text, bbox coordinates, credentials or raw response. On HTTP LAN Chrome the Clipboard API may be unavailable: long-press the report text and use Android's Copy action. For `HTTP 400 · invalid_geocode_query`, the updated app makes **one diagnostic same-origin request with exactly the same term and bbox but `limit=5`**; it never substitutes five results for the requested thirty. `LIMIT_5_ACCEPTED` means that only the limit change caused the rejection — the deployed routing gateway is very likely older than the 30-result client; deploy the matching gateway and client together. `LIMIT_5_REJECTED` means even five was refused, so an invalid bbox/other parameter is possible. `LIMIT_5_UNAVAILABLE` means the probe could not establish either cause. The report itself contains no term or bbox. A `MAP_BOUNDS_UNAVAILABLE` line means no query was sent; `NETWORK_ERROR` means the browser received no HTTP response; `HTTP_ERROR · HTTP 400/502/503` identifies a rejected/broken gateway or Photon request; `INVALID_RESPONSE · HTTP 200` means the reply could not be parsed as Photon GeoJSON. Retry only resends the same bounded request; it cannot start a stopped Photon container.

If you can borrow a computer for **Chrome remote debugging** (not required for the in-app report): connect your phone by USB, enable Android **Developer options → USB debugging**, accept the phone's authorization prompt, then open `chrome://inspect/#devices` in desktop Chrome and select **inspect** for the phone's map tab. In DevTools **Network**, enable **Preserve log**, filter to `/geocode`, search again, and note the **HTTP status and JSON `error` code** (or whether there is no request). Do not send a HAR, full search URL, query text, bbox/GPS coordinates, Authorization header, cookies, or user account data. Disable USB debugging after troubleshooting. If using the LAN dev server, the phone connects to the dev host at `https://172.16.20.70:5173` (or its HTTP switch); the browser never calls `localhost` for this API.

For the server operator, `./map-server/scripts/verify-geocoding.sh` now tests both `limit=5` and `limit=30` against the same installed-area bbox, then reverse geocoding. The production deployment script probes `limit=30` against the new local gateway *before* switching the static browser bundle; a failed probe triggers its existing rollback. Do not rebuild an immutable production image by hand: use the supported same-commit deployment pipeline after the code is merged. For a local development Compose stack only, rebuilding `routing-gateway` from this branch and rerunning the verifier updates the old 20-result validator without touching map datasets or the Photon index. A gateway `503 geocoding_unavailable` points to Photon connectivity/readiness; inspect the `photon` and `routing-gateway` services and their safe logs on the VM without sharing request URLs. The local gateway tests use a synthetic Photon fixture and **do not** prove that the user's VM has a ready index.
