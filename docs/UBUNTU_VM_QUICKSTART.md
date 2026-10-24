# Ubuntu VM: launch and operate Borobiya

**Ubuntu 24.04; run from the repository root as a normal login user (not `sudo`).** This is the short path. [Full runbook](./UBUNTU_VM_RUNBOOK.md) explains the long map import, disk sizing, network/proxy and recovery details. First map build can take **hours**, needs Internet and ample disk/RAM; it is not a one-minute installation. Keep an SSH session alive with `tmux`.

## Before you launch: what you must provide

`vm-env.py` asks for **development or production**, an initial admin password (or generates one), and, in production, your **public HTTPS DNS origin**. It generates and saves the PostgreSQL and Nominatim passwords and separate JWT secrets if unset, and preserves existing credentials; it does **not** ask you to send secrets to anyone. `vm-map.py` separately asks for area IDs, snapshot, source policy (`cache-first` downloads and saves verified sources; `offline` uses existing files only), and an external map-library directory. Review `.env.example` for defaults such as ports and memory limits; override them in `.env` if your VM differs. These two prompts do **not** collect every optional `.env` setting or confirm your VM's DNS, firewall, storage, or Internet access.

Before a first build, verify Ubuntu 24.04, Docker access, enough **free disk and inodes on both the checkout and Docker storage**, and access to the map/image download hosts; whole countries need substantially more than a city. For production, you must own the DNS name and make TCP 80/443 publicly reachable for Caddy's certificate challenges. The [runbook §3.4](./UBUNTU_VM_RUNBOOK.md#34-water-polygons-the-current-outage-and-what-the-pipeline-does-about-it) documents a water-polygons source outage: if the real archive is not already cached and the canonical host is still unavailable, the first tile build **will fail** until you stage the real archive in the selected map library or configure a trusted `MAP_WATER_POLYGONS_URL` in `.env`. Do not substitute Planetiler's small test fixtures for production maps. Verify this source on **your** VM; this workspace cannot verify its availability for you.

## First launch

```bash
./scripts/vm-install.sh --check          # installed / missing / incompatible versions
./scripts/vm-install.sh --install        # explicit opt-in: Ubuntu packages, official Docker apt repo, pinned Bun
# Re-login if you accepted membership in the root-equivalent docker group; then rerun --check.
python3 scripts/vm-env.py               # development or production; secrets + admin password, .env mode 0600
python3 scripts/vm-map.py               # choose countries/cities, snapshot and cache policy; writes no map data
python3 scripts/vm.py launch            # resume/build maps + images, migrate/seed DB, verify, build web UI, start Compose
python3 scripts/vm.py doctor            # read-only status/HTTP checks
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

The `--serve-only` path refuses missing artifacts and uses Compose `--no-build --pull never`; it does not fetch anything or silently create a new application database or uploads volume (Nominatim's import-only profile is not started). **Prepare and test it while online first** (images, application DB/uploads volumes, browser build, map sources/reference layers, routes and Photon index must already exist; production also needs a cached Caddy image and existing certificate/ACME volumes; the script checks volume existence, **not** certificate validity). Area selection is a local ignored `.vm-map.json`; live data changes only after a successful launch. `cache-first` reuses verified source bytes; `refresh` asks for a new snapshot; `offline` refuses missing source bytes. Whole countries can be multi-GB. A changed selection may rebuild Photon and reset its **rebuildable Nominatim** import volume; the application database and uploaded photos are not map caches.

## Day-two commands (safe defaults)

| Goal | Command |
| --- | --- |
| Diagnose after launch | `python3 scripts/vm.py doctor` — see [diagnostics](./UBUNTU_VM_DIAGNOSTICS.md) |
| Stop, keep DB/uploads/maps | `python3 scripts/vm.py stop` |
| Back up app DB (new 0600 custom-format archive) | `python3 scripts/vm.py backup /safe/place/borobiya.dump` (move a copy off-VM) |
| Stop and **remove app database only** | `python3 scripts/vm.py stop --clear-db --backup /safe/place/new.dump` (typed confirmation; `--no-backup` explicitly discards) |
| Clear all **project** caches (maps + browser build) | `python3 scripts/vm.py clear-caches` previews; `python3 scripts/vm.py clear-caches --apply` stops and confirms. Offline serving needs a rebuild afterwards. |
| Clear only map caches | `./scripts/clear-map-cache.sh` previews; `./scripts/clear-map-cache.sh --apply` confirms. |
| Clear downloaded project tool JARs | `python3 scripts/vm.py clear-tools` previews; `python3 scripts/vm.py clear-tools --apply` confirms |
| Delete project DB, SOS photos, Nominatim DB, TLS certs **and** map caches | `python3 scripts/vm.py destroy --backup /safe/place/new.dump` (typed confirmation). Back up photo evidence separately first. |
| Reset admin password | `python3 scripts/vm.py admin-password` (hidden double prompt, revokes admin sessions; `--generate` prints only on a TTY) |

Nothing here runs `docker system prune` or `docker compose down -v`: project-scoped volumes are identified by Compose labels; other projects' data, OS packages, global Docker image cache, Bun and `.env` are preserved. Destructive commands cannot be automated with `--yes`. A database volume with a lost password must be recovered **before** backup/removal; do not reset volumes to fix authentication. The initial admin secret is saved as base64 in `.env` (not encryption); restrict access and use a password manager.

## Proxy (optional; not stored in `.env`)

```bash
./scripts/enable-proxy.sh --status
./scripts/enable-proxy.sh --dry-run             # preview changes to shell, apt and Docker
./scripts/enable-proxy.sh                       # prompts for host and port, verifies reachability
./scripts/disable-proxy.sh --status
./scripts/disable-proxy.sh --dry-run
./scripts/disable-proxy.sh                      # confirm; then open a fresh terminal
```

The VM cannot make a remote proxy secure. Follow [runbook §5](./UBUNTU_VM_RUNBOOK.md#5-network-proxy-only-if-downloads-fail) for host/VM networking and connectivity checks. Never paste proxy credentials, `.env`, full `docker compose config`, or raw logs into issue reports.
