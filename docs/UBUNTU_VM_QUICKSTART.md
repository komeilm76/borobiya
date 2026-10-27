# Ubuntu VM: launch and operate Borobiya

**Ubuntu 24.04; run from the repository root as a normal login user (not `sudo`).** This is the supported first-run and day-two path. [Diagnostics](./UBUNTU_VM_DIAGNOSTICS.md) starts with the first failing check; the [full runbook](./UBUNTU_VM_RUNBOOK.md) is a manual map-pipeline and recovery reference, not a second credential-setup recipe. First map build can take **hours**, needs Internet and ample disk/RAM; it is not a one-minute installation. Keep an SSH session alive with `tmux`.

**Safety defaults:** Do not run `docker compose down -v`, delete volume names by guess, hand-regenerate `.env` passwords, or share `.env`/rendered Compose config. Existing DB and SOS photos are not map caches. `vm.py doctor` checks configuration, local HTTP, and application Postgres authentication with a read-only `SELECT 1` over the Compose network. A green result does **not** prove migrations, application data operations, HTTPS from outside the VM, or browser/GPS functionality.

## Before you launch: what you must provide

`vm-env.py` asks for **development or production**, an initial admin password (or generates one), and, in production, your **public HTTPS DNS origin**. It generates and saves the PostgreSQL and Nominatim passwords and separate JWT secrets if unset, and preserves existing credentials; it does **not** ask you to send secrets to anyone. `vm-map.py` separately asks for area IDs, snapshot, source policy (`cache-first` downloads and saves verified sources; `offline` uses existing files only), and an external map-library directory. Review `.env.example` for defaults such as ports and memory limits; override them in `.env` if your VM differs. These two prompts do **not** collect every optional `.env` setting or confirm your VM's DNS, firewall, storage, or Internet access.

Before a first build, verify Ubuntu 24.04, Docker access, enough **free disk and inodes on both the checkout and Docker storage**, and access to the map/image download hosts; whole countries need substantially more than a city. The default `pinned` Geofabrik date is not permanent: if its dated extract returns 404, check the exact URL versus a current extract from the same proxied shell ([diagnostics](./UBUNTU_VM_DIAGNOSTICS.md)). If the pin expired, use `python3 scripts/vm-map.py --snapshot latest --policy cache-first` and rerun `launch`; changing only `.env` does not override the saved `.vm-map.json` selection. Once setup verifies the new dataset, `launch` saves the concrete resolved date back to `.vm-map.json` as well as `.env`, so a normal rerun does not silently download tomorrow's snapshot. If setup fails first, `latest` remains pending for a later retry, and `doctor` warns that it is not yet active. For production, you must own the DNS name and make TCP 80/443 publicly reachable for Caddy's certificate challenges. The [runbook §3.4](./UBUNTU_VM_RUNBOOK.md#34-water-polygons-the-current-outage-and-what-the-pipeline-does-about-it) documents a water-polygons source outage: if the real archive is not already cached and the canonical host is still unavailable, the first tile build **will fail** until you stage the real archive in the selected map library or configure a trusted `MAP_WATER_POLYGONS_URL` in `.env`. Do not substitute Planetiler's small test fixtures for production maps. Verify this source on **your** VM; this workspace cannot verify its availability for you.

## First launch

```bash
./scripts/vm-install.sh --check          # installed / missing / incompatible versions AND current Docker access
# For missing tools only: ./scripts/vm-install.sh --install  # explicit package-install opt-in
# If Engine works but ONLY Compose is missing: ./scripts/vm-install.sh --install-compose
# If ONLY Docker socket access fails: ./scripts/vm-install.sh --enable-docker-access
#   The last command asks before granting root-equivalent Docker group access; it does not install packages.
#   Reconnect SSH (start a NEW tmux session) or run 'newgrp docker' in THIS terminal;
#   scripts cannot update their parent shell's groups. Do not use sudo for vm-env.py or launch.
./scripts/vm-install.sh --check          # daemon AND volume-list access must be OK before passwords.
python3 scripts/vm-env.py               # development or production; secrets + admin password, .env mode 0600
python3 scripts/vm-map.py               # choose countries/cities, snapshot and cache policy; writes no map data
# If you enabled the optional proxy in THIS terminal, first run: source ~/.bashrc
# Or open a new SSH terminal; see the Proxy section below before any large download.
python3 scripts/vm.py launch            # resume/build maps + images, migrate/seed DB, verify, build web UI, start Compose
python3 scripts/vm.py doctor            # read-only status/HTTP + app DB authentication probe
```

Open **`http://localhost:8080/`** (or your `NGINX_PORT`) on the VM. From a workstation, forward it with `ssh -N -L 8080:127.0.0.1:8080 USER@VM`. The VM-specific Compose override mounts the compiled SPA into Nginx: `/`, `/api`, `/map` and sockets share one origin. The base `docker-compose.yml` remains the gateway-only development stack. For HMR, after launch use `bun --filter @borobiya/client dev` in another terminal and forward port 5173; do **not** run `bun run dev` alongside the already-running Compose API on port 3000.

For production, set a **real public DNS name** pointing to this VM and allow inbound TCP **80/443**, then run `python3 scripts/vm-env.py --mode production --origin https://maps.your-domain.org` **before** launch. The production Compose profile starts Caddy: it obtains/renews a public TLS certificate, forwards WebSockets and verified HTTPS scheme to loopback-only Nginx, and persists ACME state in project volumes. Certificate issuance needs Internet, a reachable DNS name and open ports; `doctor` checks both the edge container and public HTTPS (a VM without NAT hairpin may need an external browser check). No TLS keys go in `.env`. To switch back, run `python3 scripts/vm-env.py --mode development` followed by `python3 scripts/vm.py launch`; this restores local CORS origins and shuts down/removes the old public Caddy listener (also on `--serve-only`). Do not expose Nginx's plain HTTP port remotely; geolocation needs a secure origin. Secure the VM, backups and access logs before real use.

## Map changes and offline reuse

```bash
python3 scripts/vm-map.py --list                              # IDs from the checked-in catalog
python3 scripts/vm-map.py --set ir-tehran,de-Frankfurt --policy cache-first
python3 scripts/vm-map.py --add de-berlin                     # example only: use --list for real IDs
python3 scripts/vm-map.py --remove ir-tehran
python3 scripts/vm-map.py --snapshot latest --policy refresh  # update active selection online
python3 scripts/vm.py launch                                 # verify/rebuild then activate
python3 scripts/vm-map.py --policy offline                    # reuse downloaded sources, no online map fetch
python3 scripts/vm.py launch --offline                        # may still need cached Docker/Bun artifacts
python3 scripts/vm.py stop
python3 scripts/vm.py launch --serve-only                     # strict offline relaunch; prebuilt images/UI/data only
```

The `--serve-only` path refuses missing artifacts and uses Compose `--no-build --pull never`; it does not fetch anything or silently create a new application database or uploads volume (Nominatim's import-only profile is not started). **Prepare and test it while online first** (images, application DB/uploads volumes, browser build, map sources/reference layers, routes and Photon index must already exist; production also needs a cached Caddy image and existing certificate/ACME volumes; the script checks volume existence, **not** certificate validity). Area selection is a local ignored `.vm-map.json`; live data changes only after a successful launch. `cache-first` reuses verified source bytes; `refresh` asks for a new snapshot; `offline` refuses missing source bytes. Whole countries can be multi-GB. A changed selection may rebuild Photon and reset its **rebuildable Nominatim** import volume; the application database and uploaded photos are not map caches. The map-cache cleaner intentionally retains `$MAP_PLANETILER_SOURCES_DIR` (normally inside the library), so a later rebuild can reuse verified large reference archives.

## Day-two commands (safe defaults)

| Goal | Command |
| --- | --- |
| Diagnose after launch | `python3 scripts/vm.py doctor` — see [diagnostics](./UBUNTU_VM_DIAGNOSTICS.md) |
| Stop, keep DB/uploads/maps | `python3 scripts/vm.py stop` |
| Back up app DB (new 0600 custom-format archive) | `python3 scripts/vm.py backup /safe/place/borobiya.dump` (move a copy off-VM) |
| Stop and **remove app database only** | `python3 scripts/vm.py stop --clear-db --backup /safe/place/new.dump` (typed confirmation; `--no-backup` explicitly discards) |
| Clear generated map data/OSM downloads + browser build | `python3 scripts/vm.py clear-caches` previews; `python3 scripts/vm.py clear-caches --apply` stops and confirms. Verified Planetiler reference layers and tool JARs remain; offline serving needs a rebuild afterwards. |
| Clear only map caches | `./scripts/clear-map-cache.sh` previews; `./scripts/clear-map-cache.sh --apply` confirms. |
| Clear downloaded project tool JARs | `python3 scripts/vm.py clear-tools` previews; `python3 scripts/vm.py clear-tools --apply` confirms |
| Delete project DB, SOS photos, Nominatim DB, TLS certs **and** map caches | `python3 scripts/vm.py destroy --backup /safe/place/new.dump` (typed confirmation). Back up photo evidence separately first. |
| Reset admin password | `python3 scripts/vm.py admin-password` (hidden double prompt, revokes admin sessions; `--generate` prints only on a TTY) |

**Recovery order:** run `doctor` → use [diagnostics](./UBUNTU_VM_DIAGNOSTICS.md) → rerun `launch` to resume verified stages. Before any reset, preview the target, back up the DB to a *new* path, and copy uploads off-VM separately. `clear-caches` and `destroy` do not mean the same thing: the former preserves all data volumes, while the latter deletes the only on-VM copies of accounts and photos. Nothing here runs `docker system prune` or `docker compose down -v`: project-scoped volumes are identified by Compose labels; other projects' data, OS packages, global Docker image cache, Bun and `.env` are preserved. `vm.py` destructive commands require a typed terminal confirmation and do not accept `--yes`. A database volume with a lost password must be recovered **before** backup/removal; do not reset volumes to fix authentication. The initial admin secret is saved as base64 in `.env` (not encryption); restrict access and use a password manager.

## Proxy (optional; not stored in `.env`)

```bash
./scripts/enable-proxy.sh --status
./scripts/enable-proxy.sh --dry-run             # preview changes to shell, apt and Docker
./scripts/enable-proxy.sh                       # prompts for host and port, verifies reachability
```

**After that command finishes**, open a new SSH terminal **or**, in the current interactive Bash shell, run the following *before* `vm.py launch` (a child script cannot reset its parent shell's environment):

```bash
source ~/.bashrc                                 # reload the proxy exports in THIS shell
curl -sSI --connect-timeout 8 --max-time 20 -o /dev/null \
  -w 'Geofabrik: HTTP=%{http_code} remote=%{remote_ip}\n' https://download.geofabrik.de/
```

If the check reports HTTP=000, do not start the long map download; see [diagnostics](./UBUNTU_VM_DIAGNOSTICS.md). A successful site-root check does not prove that the selected extract exists; if the download fails, test its exact URL from `map-server/regions.json` before retrying. To **disable** the proxy later, separately:

```bash
./scripts/disable-proxy.sh --status
./scripts/disable-proxy.sh --dry-run
./scripts/disable-proxy.sh                      # confirm; then open a fresh terminal
```

The VM cannot make a remote proxy secure. Follow [runbook §5](./UBUNTU_VM_RUNBOOK.md#5-network-proxy-only-if-downloads-fail) for host/VM networking and connectivity checks. Never paste proxy credentials, `.env`, full `docker compose config`, or raw logs into issue reports.
