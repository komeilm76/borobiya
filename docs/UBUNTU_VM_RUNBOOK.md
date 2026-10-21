# Ubuntu 24.04 VMware Runbook — Offline Map Pipeline

This guide builds and verifies T1.4.2 (Martin vector tiles), T1.4.4 (OSRM routes), and T1.4.5 (Photon geocoding) on the requested VM: **Ubuntu 24.04 LTS, 4 vCPU, 6 GiB RAM, 50 GB disk**. The map areas are selectable — whole countries and/or cities from `map-server/regions.json` (the default selection is Tehran, `ir-tehran`); every command below works off that selection and the standardized external map library (see [`MAP_LIBRARY.md`](./MAP_LIBRARY.md)), so the same steps produce a Frankfurt, Berlin + Isfahan, or whole-Iran dataset by changing the saved setup configuration. It deliberately builds Planetiler, OSRM, and Photon one after another; only the final acceptance phase starts Martin, all three OSRM services, and Photon together. Nominatim has to stay up during the Photon import, then is stopped to free memory.

> **Resource warning:** 6 GiB is tight for five live map services. The defaults below reduce Java heaps, database memory, and thread counts, but they cannot guarantee the complete stack fits on every dataset/runtime. Check `free -h` and `df -h /` first. If services are killed by the OOM killer, run the live route profiles one at a time or increase the VM to 8 GiB. Keep at least 15–20 GiB free on the filesystem before starting imports.

## Before you begin: two version/data details

- The default snapshot is the repository-pinned Geofabrik **2026-10-18 snapshot** in `map-server/regions.json` (dated `*-261018.osm.pbf` files with committed official MD5 checksums, e.g. Iran: 229,852,435 bytes, MD5 `a23eb2f21e426677bd243b2712ec1bc8`, data timestamp `2026-10-18T20:25:06Z`). Setup can instead deliberately resolve the newest common dated snapshot or a specific `YYYY-MM-DD`; non-pinned dates are verified against Geofabrik's official `.md5` sidecars and then stored by concrete date in the map library. Never hand-substitute a moving `*-latest` URL. [Geofabrik Iran page](https://download.geofabrik.de/asia/iran.html) · [dated MD5 sidecar](https://download.geofabrik.de/asia/iran-261018.osm.pbf.md5) · [`MAP_LIBRARY.md`](./MAP_LIBRARY.md).
- Ubuntu 24.04's standard `osmium-tool` package is **1.16.0**, and the project pins that exact version everywhere (`MAP_OSMIUM_VERSION=1.16.0` in `.env.example`, the `prepare-regions-pbf.sh` default, and this runbook), so no override is needed on this VM. Install the Ubuntu package and keep the pinned value; the preparation script requires an exact match with `osmium --version` and writes it into the crop manifest. Reload `.env` in every new terminal (`set -a; source .env; set +a`), or step 8 sees a stale/empty value. [Ubuntu Noble package](https://packages.ubuntu.com/noble/utils/osmium-tool).
- If the VM has no direct internet, use the **Proxy** section below before Phase A.
- `--max-table-size 100` is an OSRM `/table` query-size limit, **not** a general RAM limit. We keep the default cap and set OSRM runtime workers to one. [OSRM command-line options](https://project-osrm.org/docs/v26.4.0/tools).

---

## Automated setup (alternative to the manual steps)

After Phase A below (apt packages, Docker, Java, Osmium — the parts needing `sudo`), one script runs everything else in this runbook — steps A6 and 7–13 plus database migrations and the seed — and is safe to re-run (stages whose output still matches the dataset checksum are skipped; existing `.env` secrets and database passwords are never rotated):

```bash
./scripts/setup-ubuntu-vm.sh
```

**Choosing your map areas and library.** On the first interactive run the script opens a short form: map-library path, snapshot (**pinned** default, latest, or a specific date), source policy (**cache-first** default, refresh, or offline), one or more **countries**, then for each country **the entire country or one or more cities**. It shows a summary (areas, snapshot, library/dataset paths, combined bounds, ≈download size, geocoding languages) and asks for confirmation before doing any long work; whole large countries (Germany, France, UK) are flagged HEAVY because their multi-GB builds can exceed this 6 GiB VM. Equivalent non-interactive forms:

```bash
./scripts/setup-ubuntu-vm.sh --list-regions                  # show the area catalog
./scripts/setup-ubuntu-vm.sh --regions ir-tehran,de-Frankfurt # skip the form
./scripts/setup-ubuntu-vm.sh --regions ir                     # a whole country
./scripts/setup-ubuntu-vm.sh --snapshot 2026-10-18            # a specific dated snapshot
./scripts/setup-ubuntu-vm.sh --update-map                     # newest common snapshot online
./scripts/setup-ubuntu-vm.sh --offline                        # use only verified library content
./scripts/setup-ubuntu-vm.sh --dry-run                        # resolve + print the plan only
./scripts/setup-ubuntu-vm.sh --reselect                       # change areas/snapshot/policy later
```

The configuration is saved in `.env` (`MAP_REGION_IDS`, snapshot date/policy, `MAP_BBOX`, and absolute map-library paths), so plain re-runs keep it; if `.env` has no selection yet (e.g. first run after upgrading an older checkout), setup recovers it from the library's `current.json` or the existing dataset manifest instead of asking again. All map content is stored under `MAP_LIBRARY_DIR` (default `~/.local/share/borobiya/map-library`) by continent/country/source-or-city/snapshot date, with one complete active dataset bundle for offline launch. Changing the selection or snapshot later is supported: setup detects by checksum which of tiles/OSRM/Photon are stale and rebuilds only those, then—after acceptance—updates the library current pointer and prunes replaced releases/datasets. Existing project-local Tehran/catalog-era artifacts are hash-checked and migrated into the library instead of rebuilt when their provenance proves the pinned snapshot.

It prints the admin login (`admin` + the password you entered at its prompt, or the generated `ADMIN_SEED_PASSWORD`) when it finishes. A password entered or generated by setup is stored base64-encoded in the local-only `.env` as `ADMIN_SEED_PASSWORD_B64`, then decoded only for the seed process. If admin login ever fails because the admin was seeded with a different password, reset it with `docker compose run --rm -e ADMIN_SEED_PASSWORD api bun src/db/reset-admin-password.ts '<new-password>'`. If setup stops at database migration, the latest runtime migrator prints a sanitized cause/SQLSTATE; after pulling the latest branch, rerun `docker compose run --rm --build api bun src/db/migrate.ts` to reproduce it. Share that cause line only—never `.env` or `DATABASE_URL`—and do not delete the Postgres volume until the actual cause is known. The manual steps below remain the reference for what the script does and how to debug each stage.

## Proxy (optional)

Only if the VM has no direct internet and downloads fail or time out. Otherwise skip this section.

The host address is dynamic: the VMware NAT gateway (usually `192.168.x.2`). Port is `2080`; change it if your proxy app uses another port. (On the current VM this gives `192.168.136.2:2080`. With bridged networking, set `PROXY_HOST` to the host IP manually.)

### Set proxy

For this terminal (`curl`, `wget`, `git`). Run again in each new terminal:

```bash
PROXY_HOST="$(ip route show default | awk '{print $3; exit}')"
PROXY_PORT=2080
export http_proxy="http://${PROXY_HOST}:${PROXY_PORT}"
export https_proxy="http://${PROXY_HOST}:${PROXY_PORT}"
export HTTP_PROXY="$http_proxy" HTTPS_PROXY="$https_proxy"
export no_proxy="localhost,127.0.0.1" NO_PROXY="localhost,127.0.0.1"
curl -I https://download.geofabrik.de/asia/iran.html
```

The last line must show `HTTP/... 200`. (`no_proxy` keeps the Step 13 `localhost` checks direct.)

`sudo apt` and `docker pull` do not use the terminal proxy. Only if they still fail, also run:

```bash
# apt
printf 'Acquire::http::Proxy "%s";\nAcquire::https::Proxy "%s";\n' "$http_proxy" "$https_proxy" \
  | sudo tee /etc/apt/apt.conf.d/95proxy >/dev/null

# Docker pulls (restart stops containers; run before Step 12)
sudo mkdir -p /etc/systemd/system/docker.service.d
printf '[Service]\nEnvironment="HTTP_PROXY=%s"\nEnvironment="HTTPS_PROXY=%s"\nEnvironment="NO_PROXY=localhost,127.0.0.1"\n' "$http_proxy" "$https_proxy" \
  | sudo tee /etc/systemd/system/docker.service.d/http-proxy.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl restart docker

# Java (only before Step 9, for Planetiler's download)
export JAVA_TOOL_OPTIONS="-Dhttp.proxyHost=${PROXY_HOST} -Dhttp.proxyPort=${PROXY_PORT} -Dhttps.proxyHost=${PROXY_HOST} -Dhttps.proxyPort=${PROXY_PORT}"
```

Do not write proxy values into `.env`.

### Remove proxy

```bash
# Terminal (closing the terminal also removes these)
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY
unset JAVA_TOOL_OPTIONS PROXY_HOST PROXY_PORT

# apt + Docker (only if you set them above)
sudo rm -f /etc/apt/apt.conf.d/95proxy
sudo rm -f /etc/systemd/system/docker.service.d/http-proxy.conf
sudo systemctl daemon-reload
sudo systemctl restart docker

# Check
env | grep -i proxy || echo "proxy removed"
```
---

## Phase A — Install prerequisites

### A1. Update Ubuntu

Open a terminal in the VM:

```bash
sudo apt update
sudo apt upgrade -y
```

If the upgrade installs a new kernel, reboot and reopen a terminal before continuing:

```bash
sudo reboot
```

### A2. Install Docker Engine and Compose v2 from Docker's official apt repository

These are Docker's official Ubuntu repository steps. [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Allow your normal account to use Docker without `sudo` (the Docker group grants root-equivalent access):

```bash
sudo usermod -aG docker "$USER"
newgrp docker
```

If the group is still not recognized, log out of Ubuntu and back in, then reopen the terminal.

### A3. Install Java 21, Osmium, Git, wget, and Python

Ubuntu 24.04 provides OpenJDK 21 from its standard repositories; no PPA is needed. [Ubuntu OpenJDK availability](https://documentation.ubuntu.com/ubuntu-for-developers/reference/availability/java/).

```bash
sudo apt install -y openjdk-21-jdk software-properties-common
sudo add-apt-repository -y universe
sudo apt update
sudo apt install -y osmium-tool git wget python3
```

The Ubuntu 24.04 `osmium-tool` package reports version 1.16.0, which is exactly the version pinned by `.env.example` and `prepare-regions-pbf.sh`; keep `MAP_OSMIUM_VERSION=1.16.0` in `.env` below—no override is needed. The preparation script verifies the installed version and records it in the dataset manifest. [Ubuntu Noble package](https://packages.ubuntu.com/noble/utils/osmium-tool).

### A4. Verify all prerequisites and VM capacity

```bash
docker --version
docker compose version
java --version
javac --version
git --version
curl --version | head -n 1
wget --version | head -n 1
osmium --version
nproc
free -h
df -h /
docker run --rm hello-world
DOCKER_ROOT="$(docker info --format '{{.DockerRootDir}}')"
printf 'Docker root: %s\n' "$DOCKER_ROOT"
df -h "$DOCKER_ROOT"
df -i "$DOCKER_ROOT"
if [[ -d /var/lib/containerd ]]; then
  df -h /var/lib/containerd
  df -i /var/lib/containerd
fi
docker system df -v
```

Expected key results: Java reports version 21; `osmium --version` reports 1.16.0; Docker Compose reports v2; `nproc` reports 4. Keep at least 15–20 GiB free on the filesystem used by Docker/containerd before imports. The setup checks Docker's reported root and `/var/lib/containerd` (when present), and refuses to start below 15 GiB or 50,000 free inodes; it checks for at least 5 GiB again before building the final images. If the Docker/containerd filesystem is smaller, full, or nearly out of inodes, expand it or inspect/recover space before starting.

### A5. Clone the implementation branch

If this is a fresh VM:

```bash
cd ~
git clone --single-branch --branch arena/ec9ffc7e-borobiya \
  https://github.com/komeilm76/borobiya.git
cd ~/borobiya
git log -1 --oneline
```

The latest implementation should show commit `7afe63d` or a newer commit on that same branch. If you already cloned the repository, update that checkout instead:

```bash
cd ~/borobiya
git fetch origin arena/ec9ffc7e-borobiya
git switch arena/ec9ffc7e-borobiya
git pull --ff-only origin arena/ec9ffc7e-borobiya
```

If `git switch` says that branch does not exist locally, create its tracking branch once:

```bash
git switch --track -c arena/ec9ffc7e-borobiya origin/arena/ec9ffc7e-borobiya
```

### A6. Configure the VM-friendly environment

```bash
cd ~/borobiya
cp .env.example .env
nano .env
```

Choose the map areas in `MAP_REGION_IDS` — comma-separated IDs from the catalog (`python3 map-server/scripts/regions.py list`; whole countries like `ir`, cities like `ir-tehran,de-Frankfurt`). `MAP_BBOX` must be the union of the chosen areas' bounds; the values below are the Tehran-only default. Setup maintains the bbox and writes the resolved absolute library paths on every run, so the blank path values in `.env.example` are intentional. Keep `MAP_REGION=borobiya` (the fixed dataset slug the styles/Martin use). `MAP_SNAPSHOT=pinned` + `MAP_SOURCE_POLICY=cache-first` are the safe defaults; see [`MAP_LIBRARY.md`](./MAP_LIBRARY.md) for latest/specific-date and refresh/offline behavior:

```env
MAP_LIBRARY_DIR=
MAP_DATASET_DIR=
MAP_DATA_DIR=
MAP_OSRM_DATA_DIR=
MAP_PHOTON_DATA_DIR=
MAP_SNAPSHOT=pinned
MAP_SNAPSHOT_DATE=2026-10-18
MAP_SOURCE_POLICY=cache-first
MAP_REGION_IDS=ir-tehran
MAP_REGION=borobiya
MAP_BBOX=51.0,35.5,51.7,35.9
MAP_OSMIUM_VERSION=1.16.0
PLANETILER_HEAP=3g
OSRM_BUILD_THREADS=2
OSRM_RUNTIME_THREADS=1
NOMINATIM_THREADS=2
NOMINATIM_SHM_SIZE=1g
NOMINATIM_POSTGRES_SHARED_BUFFERS=512MB
NOMINATIM_POSTGRES_MAINTENANCE_WORK_MEM=1GB
NOMINATIM_POSTGRES_AUTOVACUUM_WORK_MEM=128MB
NOMINATIM_POSTGRES_WORK_MEM=32MB
NOMINATIM_POSTGRES_EFFECTIVE_CACHE_SIZE=3GB
PHOTON_JAVA_TOOL_OPTIONS="-Xms256m -Xmx1536m"
```

The `.env.example` already contains the resource-tuning values; edit the existing entries rather than appending duplicate keys.

Then generate real secrets—the API refuses to start while `.env` contains the example placeholders (`Replace the example placeholder secret`). Run this **before** the first `docker compose up`, and do not change the database passwords afterwards: PostgreSQL and Nominatim keep the first password inside their data volumes.

```bash
DB_PASS="$(openssl rand -hex 24)"
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^NOMINATIM_PASSWORD=.*|NOMINATIM_PASSWORD=$(openssl rand -hex 24)|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DB_PASS}|" .env
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://borobiya:${DB_PASS}@localhost:5432/borobiya|" .env
unset DB_PASS
```

Load the file and standardized library paths into this terminal. Do not share `.env` or the password:

```bash
set -a
source .env
set +a
if [[ -z "${MAP_LIBRARY_DIR:-}" ]]; then
  if [[ -n "${XDG_DATA_HOME:-}" ]]; then
    [[ "$XDG_DATA_HOME" == /* ]] || { echo 'XDG_DATA_HOME must be absolute; set MAP_LIBRARY_DIR explicitly.' >&2; exit 1; }
    MAP_LIBRARY_DIR="$XDG_DATA_HOME/borobiya/map-library"
  elif [[ -n "${HOME:-}" && "$HOME" == /* ]]; then
    MAP_LIBRARY_DIR="$HOME/.local/share/borobiya/map-library"
  else
    echo 'Set MAP_LIBRARY_DIR to an external absolute path (or set absolute HOME/XDG_DATA_HOME).' >&2
    exit 1
  fi
fi
[[ "$MAP_LIBRARY_DIR" == /* ]] || { echo 'MAP_LIBRARY_DIR must be absolute.' >&2; exit 1; }
export MAP_LIBRARY_DIR
eval "$(python3 map-server/scripts/regions.py resolve "$MAP_REGION_IDS" \
  --snapshot "${MAP_SNAPSHOT_DATE:-pinned}" \
  --source-policy "${MAP_SOURCE_POLICY:-cache-first}" \
  --library "$MAP_LIBRARY_DIR")"
export MAP_DATA_VERSION="$SNAPSHOT_DATE"
```

Every new terminal starts *without* these values. If you open a new terminal or reboot, repeat the block above before running any map script or Compose command—several step 8/12 failures are just a terminal that never loaded `.env`, or that still holds an old path/value after `.env` was edited. (After the automated setup has run once, `.env` already contains the absolute library paths; the resolver block is still safe to repeat.)

---

## Phase B — Data and pipeline

### 7. (Optional) Pre-download the Geofabrik source extracts

Step 8 downloads every source your selection needs into the standardized library path and verifies its MD5 automatically, so this step is only for slow/unreliable links where resumable `wget` is more comfortable. The exact URLs/MD5s and library paths come from the resolver (`python3 map-server/scripts/regions.py sources "$MAP_REGION_IDS" --snapshot "$MAP_SNAPSHOT_DATE" --library "$MAP_LIBRARY_DIR"`). Example for the default pinned Tehran selection (run the A6 resolver block first):

```bash
SOURCE_PATH="$MAP_LIBRARY_DIR/sources/asia/ir/iran/2026-10-18/iran-261018.osm.pbf"
mkdir -p "$(dirname "$SOURCE_PATH")"
(cd "$(dirname "$SOURCE_PATH")" && wget --continue https://download.geofabrik.de/asia/iran-261018.osm.pbf)
wget -O "$SOURCE_PATH.md5" https://download.geofabrik.de/asia/iran-261018.osm.pbf.md5
(cd "$(dirname "$SOURCE_PATH")" && md5sum -c "$(basename "$SOURCE_PATH").md5")
wc -c "$SOURCE_PATH"
```

Expect `iran-261018.osm.pbf: OK`, MD5 `a23eb2f21e426677bd243b2712ec1bc8`, and 229,852,435 bytes. A pre-downloaded file whose MD5 differs from the catalog pin (or official sidecar for a chosen non-pinned date) is rejected by step 8 — delete it and re-download; never edit checksums to accept unverified bytes.

### 8. Crop and merge the selected areas once

Confirm the terminal still has `.env` loaded *and* that the pinned Osmium version matches the installed one, then crop. Run these as separate commands and stop at the first error—do not paste the whole block and continue past a failure:

```bash
cd ~/borobiya
set -a
source .env
set +a
if [[ -z "${MAP_LIBRARY_DIR:-}" ]]; then
  if [[ -n "${XDG_DATA_HOME:-}" ]]; then
    [[ "$XDG_DATA_HOME" == /* ]] || { echo 'XDG_DATA_HOME must be absolute; set MAP_LIBRARY_DIR explicitly.' >&2; exit 1; }
    MAP_LIBRARY_DIR="$XDG_DATA_HOME/borobiya/map-library"
  elif [[ -n "${HOME:-}" && "$HOME" == /* ]]; then
    MAP_LIBRARY_DIR="$HOME/.local/share/borobiya/map-library"
  else
    echo 'Set MAP_LIBRARY_DIR to an external absolute path (or set absolute HOME/XDG_DATA_HOME).' >&2
    exit 1
  fi
fi
[[ "$MAP_LIBRARY_DIR" == /* ]] || { echo 'MAP_LIBRARY_DIR must be absolute.' >&2; exit 1; }
export MAP_LIBRARY_DIR
eval "$(python3 map-server/scripts/regions.py resolve "$MAP_REGION_IDS" \
  --snapshot "${MAP_SNAPSHOT_DATE:-pinned}" \
  --source-policy "${MAP_SOURCE_POLICY:-cache-first}" \
  --library "$MAP_LIBRARY_DIR")"
export MAP_DATA_VERSION="$SNAPSHOT_DATE"
osmium --version | head -n 1
echo "MAP_OSMIUM_VERSION=$MAP_OSMIUM_VERSION"
./map-server/scripts/prepare-regions-pbf.sh
```

The first command prints `osmium version 1.16.0` on Ubuntu 24.04; the next line must print the same number (`MAP_OSMIUM_VERSION=1.16.0`). Only after `prepare-regions-pbf.sh` finishes with `Prepared shared dataset PBF: ...`, verify its output:

```bash
./map-server/scripts/verify-map-pbf.sh "$MAP_PBF"
```

Expect e.g. `OK: .../borobiya.osm.pbf matches areas ir-tehran bbox [51.0, 35.5, 51.7, 35.9] snapshot 2026-10-18 (SHA-256 ...)` (areas/bbox/snapshot follow your selection). The preparation script rechecks every source MD5, crops each city with Osmium smart extraction (cached under `$MAP_LIBRARY_DIR/crops/<continent>/<country>/<city>/<date>/`), merges all areas into the one shared `$MAP_DATASET_DIR/borobiya.osm.pbf`, and records full provenance (source/crop/merged SHA-256 and library-relative paths) in `$MAP_DATASET_DIR/borobiya.source.json`. Planetiler, OSRM, and Nominatim must all use this exact merged PBF; Photon imports the resulting Nominatim database.

Re-running step 8 with the same selection is a fast no-op ("Dataset already prepared"). Changing `MAP_REGION_IDS` (and `MAP_BBOX`) rebuilds only the merge from cached library downloads/crops. `MAP_CROP_OVERWRITE=1` is now only needed to replace a stray dataset PBF that has no provenance manifest — inspect `$MAP_DATASET_DIR` first.

#### If step 8 fails

**`osmium-tool ... is required (found 1.16.0)`** — `.env` still contains an old `MAP_OSMIUM_VERSION`, or this terminal never reloaded `.env` after you edited it. Do not install another Osmium; fix `.env`, reload it, and rerun:

```bash
cd ~/borobiya
sed -i 's/^MAP_OSMIUM_VERSION=.*/MAP_OSMIUM_VERSION=1.16.0/' .env
set -a; source .env; set +a
./map-server/scripts/prepare-regions-pbf.sh
```

**`verify-map-pbf: dataset PBF is missing or empty: .../<map-library>/datasets/.../borobiya.osm.pbf`** — this is a knock-on effect, not a second bug. `verify-map-pbf.sh` only checks the dataset that `prepare-regions-pbf.sh` creates; if preparation failed (for example with the version error above) or has not yet succeeded in this checkout, there is nothing to verify. Fix the preparation error first, rerun `prepare-regions-pbf.sh` until it prints `Prepared shared dataset PBF: ...`, and only then run `./map-server/scripts/verify-map-pbf.sh "$MAP_PBF"`.

### 9. Generate PMTiles with Planetiler

Run this alone; do not start the map stack yet:

```bash
PLANETILER_HEAP=3g ./map-server/scripts/generate-tiles.sh
```

The script uses `-Xmx3g` by default, checks Java 21+, downloads/verifies Planetiler 0.10.2, and writes the PMTiles archive plus build metadata. If the Java process is killed for memory, stop and share the final log and `free -h`; do not immediately raise the heap on a 6 GiB VM.

### 10. Build OSRM car, bicycle, and foot graphs sequentially

```bash
OSRM_BUILD_THREADS=2 ./map-server/scripts/build-routing.sh
```

The script completes `car`, then `bicycle`, then `foot`; each profile's extract/partition/customize commands run in temporary `docker run --rm` containers. It never launches the three graph builds concurrently. Each build uses two threads and records the dataset PBF hash. Allow enough disk for all three generated graphs before beginning. If you changed the area selection after a previous build, `generate-tiles.sh` simply overwrites the archive, but `build-routing.sh` refuses to reuse non-empty profile directories — move `$MAP_OSRM_DATA_DIR/{car,bicycle,foot}` aside first (the automated setup script does this for you and prunes them after acceptance).

### 11. Build the Photon index from Nominatim

Download the pinned Photon JAR and start only the Nominatim import service:

```bash
./map-server/scripts/download-photon.sh
docker compose --profile geocoding-import up -d nominatim
docker compose --profile geocoding-import ps nominatim
docker compose --profile geocoding-import logs --tail=100 nominatim
```

Wait until `ps` reports Nominatim as `healthy`. First startup imports the shared dataset PBF and may take a while (much longer for whole countries); `health: starting` during the import is expected—do not restart it. Once healthy, run the Photon import from the host. Keep Nominatim running during this step; Photon reads its local PostgreSQL database. If you opened a new terminal, repeat the environment/resolver block from A6, then reload `.env` so the host-side Photon command uses the same password Compose uses:

```bash
cd ~/borobiya
set -a; source .env; set +a
[[ -n "${NOMINATIM_PASSWORD:-}" ]] || { echo 'NOMINATIM_PASSWORD is empty in .env' >&2; exit 1; }
```

The automated setup script performs this credential check before launching Photon and stops with a targeted message if the existing database volume rejects the configured password.

If `ps` instead shows `Restarting`, read the first real error in the logs above. `chown: ... Read-only file system` means an old checkout whose Compose file mounted the PBF read-only inside `/nominatim`—`git pull --ff-only`, then `docker compose --profile geocoding-import up -d --force-recreate nominatim`. The half-initialized database volume can stay; the entrypoint drops and re-imports the database from scratch on the next start.

If Photon reports `FATAL: password authentication failed for user "nominatim"`, its host-side password does not match the password stored in the persistent Nominatim database. First reload `.env` as shown above and retry if the new terminal had not loaded it. If the database volume was initialized with an older `NOMINATIM_PASSWORD`, restore that exact value in `.env`; otherwise reset only the project-scoped Nominatim volume below. This re-imports the selected PBF but does not touch the application `postgres-data` volume, map sources, or generated tiles/routes:

```bash
cd ~/borobiya
set -a; source .env; set +a
# If this is a new terminal, repeat the region resolver block from A6
# so MAP_PHOTON_DATA_DIR matches the selected areas.
docker compose --profile geocoding stop photon
docker compose --profile geocoding-import stop nominatim
docker compose --profile geocoding-import rm -f nominatim
COMPOSE_PROJECT="$(docker compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("name", ""))')"
[[ -n "$COMPOSE_PROJECT" ]] || { echo 'Could not determine Compose project; stop and inspect manually.' >&2; exit 1; }
VOLUME_LIST="$(docker volume ls -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter 'label=com.docker.compose.volume=nominatim-data')"
[[ -n "$VOLUME_LIST" ]] || { echo 'No labeled Nominatim volume found; stop and inspect manually.' >&2; exit 1; }
mapfile -t NOMINATIM_VOLUMES <<< "$VOLUME_LIST"
(( ${#NOMINATIM_VOLUMES[@]} == 1 )) || { echo 'Expected exactly one project Nominatim volume; inspect the list and stop.' >&2; exit 1; }
docker volume rm "${NOMINATIM_VOLUMES[0]}"
rm -rf -- "$MAP_PHOTON_DATA_DIR/photon_data"
rm -f -- "$MAP_PHOTON_DATA_DIR/.borobiya-pbf.sha256"
```

Then repeat the Nominatim start/wait/Photon import in this step. Never use `docker compose down -v` for this repair.

```bash
# -languages must cover every selected country plus en.
# `python3 map-server/scripts/regions.py resolve "$MAP_REGION_IDS"` prints
# the exact PHOTON_LANGUAGES value (Tehran-only: fa,en; Tehran+Frankfurt: fa,de,en).
mkdir -p "$MAP_PHOTON_DATA_DIR"
cd "$MAP_PHOTON_DATA_DIR"
java -Xms512m -Xmx2g -jar "$OLDPWD/map-server/photon/photon-1.3.0.jar" import \
  -host 127.0.0.1 -port "$NOMINATIM_DB_PORT" \
  -database nominatim -user nominatim -password "$NOMINATIM_PASSWORD" \
  -languages fa,en
sha256sum "$MAP_PBF" | awk '{print $1}' > "$MAP_PHOTON_DATA_DIR/.borobiya-pbf.sha256"
cd "$OLDPWD"
```

If you change the area selection after this step has run once, the existing Nominatim database and Photon index still describe the old areas. Redo them from scratch (the automated setup script handles this automatically): stop `photon` and `nominatim`, then list only this Compose project's Nominatim volume—do not search/remove volumes by name globally:

```bash
docker compose --profile geocoding stop photon
docker compose --profile geocoding-import stop nominatim
COMPOSE_PROJECT="$(docker compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("name", ""))')"
[[ -n "$COMPOSE_PROJECT" ]] || { echo 'Could not determine Compose project name; stop and inspect manually.' >&2; exit 1; }
docker volume ls --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" \
  --filter 'label=com.docker.compose.volume=nominatim-data'
# Inspect the project-scoped result, then remove only its exact volume name:
docker volume rm <exact-project-volume-name>
rm -rf -- "$MAP_PHOTON_DATA_DIR/photon_data"
rm -f -- "$MAP_PHOTON_DATA_DIR/.borobiya-pbf.sha256"
```

If the filtered list is empty, there is no labeled Nominatim volume to remove; if it has multiple entries, inspect before choosing. Then repeat this step.

After a successful import, stop Nominatim to free RAM. Its database volume and the Photon index are preserved:

```bash
docker compose --profile geocoding-import stop nominatim
```

### 12. Start the live map services together

Only after the tile archive, three OSRM graphs, and Photon index have been built:

```bash
docker compose --profile routing --profile geocoding up -d \
  map-server routing-gateway osrm-car osrm-bicycle osrm-foot photon
docker compose --profile routing --profile geocoding ps
docker stats --no-stream
```

OSRM runs with one runtime worker per profile and `--max-table-size 100`; Photon is capped at a 1.5 GiB heap. Nominatim is not a serving dependency and should stay stopped. If the VM becomes memory pressured, do not start Nominatim alongside this serving stack.

Expect seven services `Up`, all of them eventually reporting `(healthy)`: `postgres`, `map-server`, `routing-gateway`, `osrm-car`, `osrm-bicycle`, `osrm-foot`, and `photon` (the OSRMs turn healthy once their graphs load, Photon after its index opens—give it a minute). This step does not start `api` or `nginx`; an `api` container left over from an earlier attempt may still appear in the list—if it shows `Restarting`, see the fixes below. Map serving no longer needs the application database: Martin serves tiles from files even if Postgres is down.

#### If step 12 fails

`Interrupted` / `No such image` for several images means **one** pull failed and Compose cancelled the rest—fix only the first `Error response from daemon: ...` line, then rerun the `up -d` command. Known cases:

- `osrm-backend:v26.10.0: not found` — old checkout; upstream has no bare `v26.10.0` tag. The correct tag is `v26.10.0-debian` (already fixed in this repo): `git pull --ff-only`, then rerun. If step 10 never finished (check `ls "$MAP_OSRM_DATA_DIR/car"`), rerun step 10 first—it uses the same image.
- `borobiya/photon:1.3.0: No such image` — Photon is built locally, not pulled. Build it once, then rerun `up -d`:

```bash
docker compose --profile geocoding build photon
```

- `failed to extract layer ... /var/lib/containerd/.../no space left on device` while exporting the Photon image — this is a full Docker/containerd storage filesystem, not a bad Photon JAR (the checksum step completed). Check both the configured Docker root and the containerd snapshot filesystem, plus image/cache/volume usage:

```bash
DOCKER_ROOT="$(docker info --format '{{.DockerRootDir}}')"
df -h "$DOCKER_ROOT" && df -i "$DOCKER_ROOT"
if [[ -d /var/lib/containerd ]]; then
  df -h /var/lib/containerd
  df -i /var/lib/containerd
fi
docker system df -v
sudo du -xhd1 "$DOCKER_ROOT" /var/lib/containerd 2>/dev/null | sort -h
```

The setup now checks Docker/containerd free space and inodes before long work, builds the Photon runtime image before the disk-heavy Nominatim import, and checks storage again before the full-stack image build. If a retry is needed, first inspect `docker system df -v`; only prune reclaimable build cache/images when you are sure they can be rebuilt or downloaded again (`docker builder prune` does not remove volumes). **Do not** use `docker system prune --volumes` or `docker compose down -v` as a generic fix: named volumes contain the Nominatim and application databases. If space is held by a database volume or the Docker filesystem is too small, expand/move Docker storage instead. If you deliberately want to discard map-data caches on the same filesystem, preview `./scripts/clear-map-cache.sh --dry-run`; the script preserves Docker images/build cache, and removes the Nominatim volume only when `--include-nominatim-volume` is explicitly selected. Clearing the library means the offline map must be downloaded/rebuilt. Rerun setup after resolving capacity; verified map stages are reused.

- `borobiya-api-1` keeps `Restarting` with `Replace the example placeholder secret` — `.env` still has the example JWT secrets. The step 12 `up -d` command does not include `api`, so a crash-looping container from an earlier attempt is left untouched until you recreate it explicitly. The map services are unaffected (step 13 can still run), but fix the API before using the full app. Generate two different secrets, reload `.env` into this terminal (Compose prefers variables already in your shell over the edited file), and recreate only the API. Do **not** change `POSTGRES_PASSWORD`/`NOMINATIM_PASSWORD` now; their volumes already store the first password.

```bash
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
set -a; source .env; set +a
docker compose up -d --build --force-recreate api
docker compose logs --tail=20 api
```

- `borobiya-postgres-1` shows `unhealthy` and dependents refuse to start (`dependency failed to start`)—on old checkouts this appeared as `map-server` restart-looping with `password authentication failed`. `POSTGRES_PASSWORD` in this terminal/`.env` no longer matches the password the existing `postgres-data` volume was initialized with; the healthcheck now logs in for real, so Postgres itself reports the problem. Either set `.env` back to the original password, or—at this stage the app database is still empty—reset only that one volume so it initializes with the current `.env` password, then rerun the step 12 `up -d` command. Map tiles, OSRM graphs, the Photon index, and the Nominatim volume are stored elsewhere and are not touched.

```bash
docker compose down
docker volume rm borobiya_postgres-data
set -a; source .env; set +a
```

- Compose complains the network needs to be recreated after a `git pull` (the project subnet is now pinned to `172.30.0.0/24`): run `docker compose down` once—without `-v`—then rerun the step 12 `up -d` command. Containers are recreated; volumes and built map data stay intact.

### 13. Verify tiles, all route profiles, forward geocoding, and reverse geocoding

Run the scripted acceptance checks first:

```bash
./map-server/scripts/verify-tiles.sh
./map-server/scripts/verify-routing.sh
./map-server/scripts/verify-geocoding.sh
```

Each script checks one area (the first of `MAP_REGION_IDS` by default; pass an area ID to check another, e.g. `./map-server/scripts/verify-routing.sh de-Frankfurt`) using the test points from `regions.json`, issuing real HTTP requests to Martin (`localhost:8000`) and the local gateway (`localhost:8001`) and validating non-empty MVT/GeoJSON/routes. For multi-area selections, run the trio once per area. To inspect the raw responses with `curl` (Tehran examples for the default selection; `python3 map-server/scripts/regions.py verify-point <area-id>` prints the equivalents for any area):

```bash
# Martin MVT tile — should be HTTP 200 and non-empty protobuf bytes.
curl -fS -o /tmp/borobiya-z12-x2632-y1612.pbf \
  -w 'tile HTTP %{http_code}; %{size_download} bytes\n' \
  http://localhost:8000/borobiya/12/2632/1612

# Routing — change profile to car, bicycle, then foot.
curl -fsS -H 'Content-Type: application/json' \
  -d '{"from":{"lat":35.68,"lon":51.38},"to":{"lat":35.70,"lon":51.41},"profile":"car","alternatives":true}' \
  http://localhost:8001/route | python3 -m json.tool

# Forward geocoding — expect a non-empty FeatureCollection.
curl -fsS -G --data-urlencode 'q=Azadi Square' --data-urlencode 'limit=5' \
  http://localhost:8001/geocode | python3 -m json.tool

# Reverse geocoding near central Tehran — expect a FeatureCollection.
curl -fsS -G --data-urlencode 'lat=35.70' --data-urlencode 'lon=51.40' \
  http://localhost:8001/reverse | python3 -m json.tool
```

The three task checkboxes remain open until all three scripted checks pass on this VM. Keep the output from the preparation script and the smoke tests; share those outputs without `.env`, passwords, or private credentials.

To stop services without deleting built data or named volumes:

```bash
docker compose --profile routing --profile geocoding down
docker compose --profile geocoding-import down
```

Do **not** add `-v`; that would delete persistent Compose volumes.
