# Borobiya — Workflows & CI/CD

> TL;DR: Lefthook local gates, the main-branch deploy Action, and the release-tag Android Action are implemented in code. They require a prepared VM, protected GitHub settings and live acceptance; the separate Ubuntu VM runbook documents the production TLS edge. A local Compose stack and root `bun run dev` command are available.

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
5. Review → merge (squash or merge); the standalone GitHub `ci.yml` check is still planned.
6. A push to `main` triggers `deploy.yml`. It **fails closed** until the protected production environment and prepared VM are configured; no deploy runs from feature branches.

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

No standalone `.github/workflows/ci.yml` is committed yet; the deployed `deploy.yml` runs lint, typecheck, full tests and build before publication on `main` only. The illustrative future PR CI workflow below would pair those same gates with a PostGIS service container.

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

## 5. Production deploy (`deploy.yml` — implemented in code)

The committed [workflow](../.github/workflows/deploy.yml) runs on `main` only, with a
non-interrupting production concurrency group and the protected `production`
environment. It runs lint, typechecks, all Vitest suites, the routing gateway's
Node tests and a client build before publishing SHA-tagged amd64 **API, routing
gateway and Photon runtime** images to GHCR. The Photon JAR is independently
checksum-checked by `download-photon.sh` and its Dockerfile. The map tiles,
OSRM graphs and Photon *index* are not images and are **never** shipped from CI.
The built browser `dist` travels over host-key-pinned SSH and is swapped on the
VM; a bind-mounted static directory cannot be updated by publishing an API image.

### 5.1 One-time operator preparation

Follow [UBUNTU_VM_RUNBOOK.md](./UBUNTU_VM_RUNBOOK.md) to prepare a **production**
Ubuntu VM with Docker Compose v2 (`up --wait` support), Bun, Python, a committed
`main` checkout at `/opt/borobiya` writable by the SSH user, `.vm-map.json`,
`.env` generated by the VM helper, a verified local map dataset/OSRM graphs,
Photon index, built browser client, migrated/seeded PostGIS and existing uploads.
Enable the production Caddy edge (`NODE_ENV=production`, `PUBLIC_DOMAIN`, matching
HTTPS `CORS_ORIGINS`) and verify HTTPS/certificate DNS and port 80/443 manually.
The operator must provision GHCR **read** credentials for the VM's Docker user if
packages are private. Grant the Action `packages: write` via `GITHUB_TOKEN` on
`main` (repository workflow permission); no registry password is placed in git.
No VM setup, initial imports, automatic migrations or `.env` overwrite are part
of this Action. Configure a GitHub `production` environment with approval rules
and these secrets:

- `VM_HOST`: the VM's DNS name or IP (SSH port 22);
- `VM_USER`: non-root user authorized to run Docker, read that prepared checkout,
  and write `/opt/borobiya/.deploy` and `packages/client/dist`;
- `VM_SSH_PRIVATE_KEY`: SSH deployment key (store **only** in GitHub secrets);
- `VM_SSH_KNOWN_HOSTS`: SSH host public-key line verified out of band by the
  operator, **not** obtained by unauthenticated `ssh-keyscan` in the Action.

If any secret, the checkout, map selection, active database schema, static
client or pull credential is missing, deployment exits nonzero before cutover.
The workflow never prints secrets, passes access tokens in a URL, disables host
key verification or writes `.env` from CI.

### 5.2 Safe cutover and rollback

The [VM script](../scripts/deploy-vm.sh) verifies that `main` still points to the
SHA that triggered the workflow (no stale rollout), fast-forwards the checkout,
checks production environment and existing map artifacts, and refuses a staged
client archive whose HTML entry, directly referenced local assets or worker are
missing/empty (this does not validate lazy chunks or a rendered page). It then
pulls only the new application images with [the registry overlay](../docker-compose.deploy.yml),
and runs `bun src/db/check-schema.ts` in the new image **before** cutover. If a
schema migration is needed, back up and review/apply it using the VM runbook;
**do not** disable the check or let a deployment silently migrate live data.
It starts only the three changed app services with `--no-deps --no-build --pull
never`, exchanges the static `dist` atomically, recreates only Nginx to rebind
the directory, ensures the edge is up and checks local gateway health. No
`down`, `down -v`, system prune, map import, Postgres recreation, upload/cert
volume deletion or Android build occurs. A failed cutover restores the previous
static client and attempts to relaunch the previous SHA-tagged images if
`.deploy/active-sha` exists; **this is a best-effort runtime rollback**, not a
database or git rollback. Before the first tagged deploy, manual intervention
may be needed after a failure. Previous client bundles remain in `.deploy` for
operator inspection; remove old bundles only after confirming a healthy release.
A failed preflight can leave `.deploy/client-<SHA>` behind; inspect/remove that
staging slot before retrying, since overlaying it could conceal a missing file
in the newly uploaded archive.

A green workflow proves code/build checks and SSH script exit, **not** a live
browser/physical-device/security or real map-library acceptance. The Action
is unrun until merged into `main` with secrets and VM readiness; production
rollout, HTTPS, real PostGIS and map smoke tests remain operator gates.

---

## 6. Android Build (`android.yml` — signed APK on a release tag)

### 6.1 Tag-triggered Action

[The workflow](../.github/workflows/android.yml) runs on a `vMAJOR.MINOR.PATCH`
tag whose commit is on `main`. It uses the protected `production` environment,
checks the same repository gates as deploy, pins Capacitor CLI/Android 8.5.3 in
`bun.lock`, builds the web client, generates the ignored native Android project
under `packages/client/android/`, runs `cap sync android` and then
`./gradlew assembleRelease`. [The preparation script](../scripts/prepare_android_release.py)
sets a monotonic `versionCode` from `GITHUB_RUN_NUMBER`, the tag's `versionName`,
coarse/fine location permissions, disables Android backup/cleartext, and wires
Gradle release signing to **environment variables**, not inline passwords.
`apksigner verify` must succeed before the signed APK is uploaded as a private
Actions artifact (14-day retention, no automatic public release). Missing
variables/keystore, malformed tags or changes to the expected Capacitor 8
Android template fail closed. There is no committed native project or keystore.

**Important runtime boundary:** The browser code uses same-origin `/api`,
`/map`, `/route`, `/socket.io`, tile and worker paths. The release config
therefore loads the existing **public production HTTPS origin** in the WebView
rather than pretending bundled `https://localhost` has a native API/map server.
The APK requires the production site and network; it is **not** an offline
Android app/map pack. Capacitor still copies web assets into the APK, but with
`server.url` set they do **not** automatically rescue a production-site outage.
Provide `ANDROID_PUBLIC_ORIGIN` as a GitHub **production environment variable**,
e.g. `https://example.org` (exact public HTTPS origin, no path or port, not a
private/LAN IP). The app does not trust private CAs or allow HTTP in release.
The server must serve a valid publicly trusted cert and have the same-origin
API/map proxy working first. No production domain is shipped as a default.

**Before a release:** configure the protected `production` environment and its
variable `ANDROID_PUBLIC_ORIGIN`; add the four environment secrets below; run
or review the production site deployment; create and protect the tag on `main`.
The Action is code-complete but has **not** run on GitHub or built an APK here:
no Android SDK/Gradle, physical install, TLS, login, GPS or location-sharing
acceptance is claimed. Install the resulting APK on a test device, check the
certificate and origin, grant *while-using-app* location, confirm a real fix and
share/revoke against the running production server before distributing it.

### 6.2 Signing and key custody

Generate a release key on a secure operator machine using `keytool`; protect the
keystore and both passwords outside GitHub with offline backups. Losing the key
prevents updates to the same installed app. Set these **GitHub environment
secrets** (never print, commit or send the values in chat):

| Secret | Purpose |
|--------|---------|
| `ANDROID_KEYSTORE_BASE64` | Base64 encoding of the release keystore file (decoded into `RUNNER_TEMP`, mode 0600, deleted at step exit) |
| `ANDROID_STORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Alias of the signing key inside that keystore |
| `ANDROID_KEY_PASSWORD` | Signing key password |

The workflow uses `apksigner verify`, but only a device install and a signature
comparison with the previous release can establish update compatibility. Keep
an operator copy of the keystore fingerprint and verify it before distributing
an artifact; GitHub Actions artifacts are private to accounts with repository
access, not an app store.

### 6.3 Local development and LAN certificates

**Chrome on a phone needs no APK:** use [`MOBILE_LAN_HTTPS.md`](./MOBILE_LAN_HTTPS.md)
with `172.16.20.70`, the HTTP/HTTPS switch and Android's user CA installation
instructions. Do not put this CA or its key in a release APK. For a *generated
local debug Android project*, use the guide's `android-debug` step to place only
the public CA under the **debug** source set, set a debug-only Capacitor server
URL to `https://172.16.20.70:5173`, then rebuild/install a **debug** APK. The
release Action never runs that step and fails if no real public HTTPS origin is
configured. Android WebView CA trust is separate from Chrome's user-CA trust.

The included `capacitor.config.ts` defaults to local `https://localhost` for
non-CI debug builds; that origin cannot access the production API/map without
additional native networking work. For mobile app tests, supply an explicitly
trusted origin and request runtime location permission. Bundled offline maps,
secure native refresh-token storage and background GPS remain separate tasks.

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
# → triggers deploy.yml on the main push and android.yml on the tag push;
#   neither is an acceptance test: protect environment secrets and verify VM + APK first
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

## 9. GitHub production settings

| Setting | Used by | Notes |
|---------|---------|-------|
| `VM_HOST`, `VM_USER`, `VM_SSH_PRIVATE_KEY`, `VM_SSH_KNOWN_HOSTS` (secrets) | deploy.yml | See §5 for prepared VM and pinned host key |
| `ANDROID_PUBLIC_ORIGIN` (variable, **not a secret**) | android.yml | Exact publicly trusted HTTPS origin, no LAN address or path |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (secrets) | android.yml | See §6.2; keep key backups off the runner |
| `GITHUB_TOKEN` | deploy.yml | GitHub-provided, registry publishing from main only; Android needs read-only contents |

---

## 10. Troubleshooting CI/CD

| Issue | Check |
|-------|-------|
| `ci` fails on PG connect | `services.postgres` health — wait `sleep 5` before tests |
| Deploy SSH `permission denied` | Verify the `VM_SSH_PRIVATE_KEY`, pinned known-host key and `VM_USER` are correct |
| Map tiles 404 in prod | `map-data` volume missing — `docker volume ls`, copy `*.pmtiles` |
| APK too large | Inspect the signed artifact and bundled assets; R8/proguard is not enabled by default in the generated project |

