# Borobiya — Workflows & CI/CD

> TL;DR: Lefthook local commit/push gates are configured. GitHub Actions CI/deployment and Android packaging are still planned; the separate Ubuntu VM runbook documents the existing production TLS edge. A local Compose stack and root `bun run dev` command are available.

---

## 1. Branching & Commit

### 1.1 Branches

| Branch | Purpose | Protection |
|--------|---------|------------|
| `main` | Production source — deploys on push | Require PR + passing CI, no direct push (if team>1) |
| `feat/*`, `fix/*`, `docs/*` | Feature work | PR to `main` |
| `arena/<id>-borobiya` | Arena session branch (this branch) | Auto-created, PR to `main` after docs PR |

### 1.2 Commit Convention

```
feat: add SOS dispatch endpoint
fix: reject location update from non-priority device
docs: update map setup with photon version
chore: bump Martin to 1.16.1
refactor: extract priority device composable
test: add register 5Q uniqueness test
```

Prefix `feat/fix/docs/chore/refactor/test`. Keep scope narrow.

### 1.3 PR Flow

1. Create `feat/<task>` from `main`.
2. Implement + tests + docs (`PROGRESS.md`).
3. Ensure local gates pass (see §2).
4. Push → open PR via `gh pr create --base main`.
5. Review → merge (squash or merge); GitHub CI is planned, not running yet.
6. A `main` deploy workflow is planned; merge does not automatically deploy today.

---

## 2. Git Hooks — Gates (Local)

The project uses **Lefthook 2.2.2** (devDependency) with the committed
[`lefthook.yml`](../lefthook.yml). From a developer checkout with Git, Bun,
ShellCheck and Ruff on PATH:

```bash
bun install --frozen-lockfile
bunx lefthook install
```

The explicit install works even if a package manager suppresses postinstall
scripts. Hooks are generated locally inside `.git/hooks` and are **not** tracked;
container builds without `.git` do not need them. Re-run the install when the
config changes. Do not install both Husky and Lefthook. Both gates run against the
**full repository**, because a shared schema, migration or CSS change can affect
another workspace or a source-pinned view test. They do not publish artifacts:

| Hook | Checks (both must succeed) |
|------|----------------------------|
| `pre-commit` | `bun run lint` (Bash, ShellCheck, Ruff, Markdown, env-reference parity) then `bun run typecheck` (shared/server/client) |
| `pre-push` | `bun run test` (Vitest, all three workspaces) then `bun run build` (client Vue typecheck + Vite dry-run; output is gitignored) |

Use `bun run lint`, `bun run typecheck`, `bun run test`, and `bun run build`
to reproduce failures. The root Vitest command does **not** include the separate
Node-based routing-gateway tests: run
`node --test map-server/routing-gateway/*.test.mjs` when editing that gateway.
A local hook is a contributor safeguard, not a substitute for reviewed CI or
VM/browser acceptance. Never bypass a failing gate merely to push; if the
platform lacks ShellCheck/Ruff, install them before claiming local lint passed.

### Branch Protection (GitHub)

Settings → Branches → `main`:

- Require pull request before merging
- Require status checks: `ci` (lint+typecheck+test)
- Require branches to be up to date
- Do not allow deletions

Single-dev mode: protection may be relaxed, but CI still mandatory.

---

## 3. Local Launch

### 3.1 Compose service scaffold

```bash
cp .env.example .env              # replace JWT placeholders and Postgres password
docker compose up --build -d
open http://localhost:3000/docs   # Swagger through the API port
open http://localhost:8080/docs   # Swagger through Nginx
bun install
bun --filter @borobiya/client dev # Vite client with HMR at :5173
# Tear down
docker compose down               # keep the Postgres volume
docker compose down -v             # destructive: remove database volume
```

This is a local scaffold, not production deployment configuration: Nginx is HTTP-only and loopback-bound. Registration uses the configured PostgreSQL database after migrations and seed data are applied; the API does not apply migrations automatically. Martin has no project tile/style/routing/geocoding assets yet.

### 3.2 Dev (Bun, with watch)

```bash
cp .env.example .env              # replace both JWT placeholders
bun install
bun run dev                       # API + Vite concurrently
# or separately
bun --filter @borobiya/server dev
bun --filter @borobiya/client dev
```

Do not run the root `bun run dev` at the same time as the Compose API: both use host port `3000`.

---

## 4. CI — planned GitHub Actions `ci.yml`

No `.github/workflows` file is committed yet; the workflow below pairs the root `lint`, `typecheck`, `test`, and `build` scripts with a PostGIS service container.

```yaml
name: CI
on: [pull_request, push]
jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env: { POSTGRES_USER: borobiya, POSTGRES_PASSWORD: secret, POSTGRES_DB: borobiya_test }
        ports: ["5432:5432"]
        options: --health-cmd="pg_isready" --health-interval=10s
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: "1.4.3" }
      - run: bun install
      - run: bun run lint
      - run: bun run typecheck
      - run: bun test
        env: { DATABASE_URL: postgresql://borobiya:secret@localhost:5432/borobiya_test }
      - run: bun run build
```

---

## 5. Planned production deploy (`deploy.yml` — not implemented)

### 5.1 Target

- **Host:** Ubuntu 22.04/24.04 LTS VPS (4GB RAM for 1k users goal).
- **Current local stack:** `docker-compose.yml` with `api`, `postgres`, `map-server`, `routing-gateway`, optional OSRM profile services (`--profile routing`), and `nginx`; loopback-only HTTP. Production TLS/domain routing via Let's Encrypt remains a future deployment task.

### 5.2 Workflow

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Login to Registry
        uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - name: Build & Push images
        run: |
          docker build -t ghcr.io/${{ github.repository }}/api:${{ github.sha }} -f packages/server/Dockerfile .
          docker push ghcr.io/${{ github.repository }}/api:${{ github.sha }}
          docker build -t ghcr.io/${{ github.repository }}/map:${{ github.sha }} -f map-server/Dockerfile .
          docker push ghcr.io/${{ github.repository }}/map:${{ github.sha }}
      - name: SSH Deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /opt/borobiya
            git pull origin main
            echo ${{ secrets.ENV_FILE }} | base64 -d > .env
            docker compose pull
            docker compose up -d --remove-orphans
            docker system prune -f
```

### 5.3 VPS Setup (run once)

```bash
# On VPS
sudo apt update && sudo apt install docker.io docker-compose-plugin git
mkdir /opt/borobiya && cd /opt/borobiya
git clone https://github.com/komeilm76/borobiya.git .
# Env from GitHub secret ENV_FILE (base64 .env)
cp .env.example .env && nano .env
# TLS
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d borobiya.yourdomain.com -d map.borobiya.yourdomain.com
# The committed nginx.conf is a local HTTP gateway (/api/ and /map/); it has no TLS/domain config.
docker compose up --build -d
```

### 5.4 Env Secrets Handling

- Local: `.env` gitignored.
- CI: `ENV_FILE` is base64-encoded `.env` stored as GitHub Secret; workflow decodes to VPS `.env` (never print).
- Never commit `JWT_SECRET` etc.

### 5.5 Rollback

```bash
# On VPS
docker compose down
git checkout "<prev-sha>"  # quoted, because <prev-sha> alone is a shell redirection
docker compose up -d
# Or GHCR tags: docker pull ghcr.io/...:prev-sha
```

---

## 6. Android Build (`android.yml` — on tag `v*`)

### 6.1 Workflow

```yaml
name: Android
on:
  push:
    tags: ["v*"]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 17 }
      - uses: android-actions/setup-android@v3
      - run: bun install
      - run: bun run build
      - run: bun --filter client build           # vite build → dist/
      - run: npx cap copy android && npx cap sync android
      - run: cd android && ./gradlew assembleRelease
        env:
          KEYSTORE_BASE64: ${{ secrets.KEYSTORE_BASE64 }}
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
      - uses: actions/upload-artifact@v4
        with: { name: borobiya-apk, path: android/app/build/outputs/apk/release/app-release.apk }
      - uses: softprops/action-gh-release@v2
        with: { files: android/app/build/outputs/apk/release/app-release.apk }
```

### 6.2 Local Android

For GPS testing in **mobile Chrome** on a LAN IP, no APK is involved; follow
[`MOBILE_LAN_HTTPS.md`](./MOBILE_LAN_HTTPS.md) to trust a development CA and
run Vite at `https://<LAN-IP>:5173`. The Android steps below describe a future
Capacitor project; `android/` is generated/ignored, not committed. For a
WebView debug APK, the same guide's `android-debug` command bundles **only the
public CA**, adds a debug-only trust overlay, and explains the required debug
server URL and native location permissions. Never bundle the CA private key
or ship that trust overlay in a release build.

```bash
bun run build
npx cap add android                  # once
npx cap copy android                # after each build
npx cap open android                # open in Android Studio → Run
# Or CLI
cd android && ./gradlew assembleDebug && adb install app/build/outputs/apk/debug/app-debug.apk
```

### 6.3 Signing (release)

- Generate: `keytool -genkey -v -keystore release.keystore -alias borobiya -keyalg RSA -keysize 2048 -validity 10000`
- Store `release.keystore` base64 as `KEYSTORE_BASE64` secret; set `android/gradle.properties` signingConfigs from env.
- Document keystore backup — lost key = cannot update Play Store.

### 6.4 Capacitor Config

`capacitor.config.ts`:

```ts
export default {
  appId: "com.borobiya.app",
  appName: "Borobiya",
  webDir: "dist",
  server: { androidScheme: "https", allowNavigation: ["borobiya.local", "map.borobiya.local"] },
  plugins: {
    Geolocation: { },
    Camera: { }
  }
} as CapacitorConfig;
```

Permissions in `AndroidManifest.xml`: `ACCESS_FINE_LOCATION`, `CAMERA`, `INTERNET`.

---

## 7. Release Process

```bash
# Ensure main green via the wired root verification scripts plus Python/Node map suites:
git checkout main && git pull
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run build
python3 -m unittest discover -s scripts
python3 -m unittest discover -s map-server/scripts
node --test map-server/routing-gateway/*.test.mjs
# Bump version in package.json + docs/PROGRESS.md BEFORE merging the release PR so the cut record lands on main
git add . && git commit -m "chore: v1.0.0 prep"
git tag -a v1.0.0 -m "v1.0.0" && git push origin main --tags
# → would trigger deploy.yml (to VPS) + android.yml (APK): neither workflow file exists in
#   .github/workflows yet, so tagging publishes nothing on its own (see README §19)
# Write concise curated release notes summarizing changes since the previous tag
# (do NOT pass the multi-thousand-line docs/PROGRESS.md running log verbatim to --notes-file)
gh release create v1.0.0 --title "v1.0.0" --notes-file release-notes.md
```

---

## 8. Docs Workflow

- Docs commits use `docs:` prefix.
- No code PR without `PROGRESS.md` update.
- Diagrams (Mermaid) must render on GitHub — test via `gh` markdown preview or push to draft.

---

## 9. Secrets Inventory (GitHub Secrets needed)

| Secret | Used by | How to set |
|--------|---------|------------|
| `SSH_HOST` | deploy.yml | VPS IP/domain |
| `SSH_USER` | deploy.yml | `ubuntu` / `deploy` |
| `SSH_KEY` | deploy.yml | `cat ~/.ssh/id_rsa \| base64 -w0` |
| `ENV_FILE` | deploy.yml | `cat .env \| base64 -w0` |
| `KEYSTORE_BASE64` | android.yml | `cat release.keystore \| base64 -w0` |
| `KEYSTORE_PASSWORD` | android.yml | keystore pass |
| `GITHUB_TOKEN` | both | auto |

---

## 10. Troubleshooting CI/CD

| Issue | Check |
|-------|-------|
| `ci` fails on PG connect | `services.postgres` health — wait `sleep 5` before tests |
| Deploy SSH `permission denied` | `SSH_KEY` is private key, not pub; `SSH_USER` exists on VPS |
| Map tiles 404 in prod | `map-data` volume missing — `docker volume ls`, copy `*.pmtiles` |
| APK too large | Enable R8/proguard in `android/app/build.gradle` |

