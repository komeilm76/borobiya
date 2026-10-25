# VM diagnostics (launch and after launch)

Start with **`python3 scripts/vm.py doctor`** from the repo root. It changes nothing, prints no secrets and checks configuration, Docker, browser build and local HTTP paths. If it fails, use the first failing row below. Repeat after any repair. The full [runbook §9](./UBUNTU_VM_RUNBOOK.md#9-troubleshooting-index) covers stage-specific recovery.

| Symptom / failing check | Safe next action |
| --- | --- |
| Tool missing/incompatible | `./scripts/vm-install.sh --check`; use `--install` on Ubuntu 24.04. Java ≥21, Osmium **exactly** the `.env` pin, Compose v2, Bun exactly `package.json`. Docker group changes need a **new login**. |
| `vm-env.py` stops after the mode prompt with `could not identify Compose project` / exit 125 | **This failed run did not write new credentials to `.env`.** The script must identify this project's existing DB volumes before generating passwords; it cannot safely guess. Run `./scripts/vm-install.sh --check`, then `docker compose version`, `docker info` and `docker compose config --quiet` **locally**. `config --quiet` returning zero but `config --format json` failing suggests an incompatible Compose plugin. Fix the failing check, then rerun `vm-env.py`; never delete volumes to make the error disappear. Do not share rendered Compose config or `.env`. |
| Docker unreachable | `docker info`, `systemctl status docker`, `id -nG`; check storage via `df -h` / `df -i`. Do not prune other projects' volumes. |
| Compose invalid or subnet conflict | `docker compose -f docker-compose.yml -f docker-compose.vm.yml -f docker-compose.production.yml --profile production config --quiet`; inspect port/subnet conflicts. If changing the pinned network `172.30.0.0/24`, also change `TRUSTED_PROXY_IPS` (see long runbook). Do not post full `compose config` (it includes credentials). |
| Database unhealthy / auth error `28P01` | `docker compose ps postgres`; `.env` password, container environment and volume role must agree. Restore the *original* volume password or use [runbook §9.3](./UBUNTU_VM_RUNBOOK.md#93-step-12-containers) to repair the role; never `down -v`. Before any deliberate deletion, back up with `python3 scripts/vm.py backup /safe/place/new.dump`. |
| `GET /health` succeeds but `GET /api/_public/health` fails | `/health` only tests Nginx; API health proves the API process, **not database queries**. Check `docker compose ps api postgres`; then `docker compose logs --tail 40 api postgres` **locally** (logs might contain sensitive data). Re-run launch for migration/seed; do not truncate the database. |
| `/map-config` fails, tiles/routing/geocoding missing | `docker compose --profile routing --profile geocoding ps`; verify `.env` map selection and library paths. `./map-server/scripts/verify-tiles.sh AREA`, `verify-routing.sh AREA`, `verify-geocoding.sh AREA`; rerun `python3 scripts/vm.py launch` to rebuild missing artifacts. `.env` + `current.json` must describe the same selection. |
| Photon import failed or ran out of disk | Check `df -h` **both** Docker storage and map library; `docker compose --profile geocoding-import logs --tail 40 nominatim`. Initial import can take about an hour. A failed Photon index is **not** a reason to remove the application `postgres-data` volume. |
| Browser `/` gives gateway text/404, or no MapLibre worker | Run `python3 scripts/vm.py launch` (builds web UI and applies VM Nginx override), then `python3 scripts/vm.py doctor`. `--serve-only` refuses an absent browser build. |
| TLS edge / public HTTPS fails | Confirm `PUBLIC_DOMAIN`, A/AAAA records point to this VM, public TCP 80/443 reach Caddy, no other service owns those ports, and certificate issuance has Internet access. `docker compose -f docker-compose.yml -f docker-compose.vm.yml -f docker-compose.production.yml --profile production logs --tail 40 edge` locally; redact before sharing. The VM's own HTTPS probe may warn due to NAT hairpin; check from an external browser. |
| Login works but browser location is blocked | Production must be visited over Caddy's HTTPS origin; remote plain HTTP is not a secure browser context. Development: SSH-tunnel `5173` (HMR) or `8080` (built UI) to localhost. |
| Offline restart fails | Pre-cache all Docker images, source/reference files, Photon/Planetiler JARs, compiled UI and active dataset online. Use `python3 scripts/vm.py launch --serve-only` after `stop`; this command never pulls or builds. The full `--offline` build forbids online map sources but can still need Docker/npm build dependencies. |
| Port 8080 not responding | `docker compose -f docker-compose.yml -f docker-compose.vm.yml --profile routing --profile geocoding ps`; check `NGINX_PORT`, `ss -ltn`, and container health. The development gateway binds loopback; use an SSH tunnel or production Caddy HTTPS. |

For a focused status snapshot (inspect/redact before sharing):

```bash
./scripts/vm-install.sh --check
python3 scripts/vm-map.py --show
docker compose -f docker-compose.yml -f docker-compose.vm.yml -f docker-compose.production.yml --profile routing --profile geocoding --profile production ps
python3 scripts/vm.py doctor
```

Do **not** send `.env`, `docker compose config` output, password values, raw dumps, tokens, or unsanitized logs to anyone. A diagnostic failure never authorizes deleting the database, upload evidence or map library. [Quickstart](./UBUNTU_VM_QUICKSTART.md) has exact operational commands; the long [VM runbook](./UBUNTU_VM_RUNBOOK.md) has manual recovery steps.
