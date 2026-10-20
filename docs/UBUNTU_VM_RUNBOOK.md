# Ubuntu 24.04 VMware Runbook — Offline Tehran Map Pipeline

This guide builds and verifies T1.4.2 (Martin vector tiles), T1.4.4 (OSRM routes), and T1.4.5 (Photon geocoding) on the requested VM: **Ubuntu 24.04 LTS, 4 vCPU, 6 GiB RAM, 50 GB disk**. It deliberately builds Planetiler, OSRM, and Photon one after another; only the final acceptance phase starts Martin, all three OSRM services, and Photon together. Nominatim has to stay up during the Photon import, then is stopped to free memory.

> **Resource warning:** 6 GiB is tight for five live map services. The defaults below reduce Java heaps, database memory, and thread counts, but they cannot guarantee the complete stack fits on every dataset/runtime. Check `free -h` and `df -h /` first. If services are killed by the OOM killer, run the live route profiles one at a time or increase the VM to 8 GiB. Keep at least 15–20 GiB free on the filesystem before starting imports.

## Before you begin: two version/data details

- The repository's normal, reproducible source is the immutable `iran-261018.osm.pbf`. This guide follows the requested `iran-latest.osm.pbf` URL instead. **As of 2026-10-19**, Geofabrik's latest file reports data timestamp `2026-10-18T20:25:06Z`, is 229,852,435 bytes, and its official sidecar reports MD5 `a23eb2f21e426677bd243b2712ec1bc8`—the same bytes as the dated archive. `latest` is mutable. If you run this later and the official sidecar, timestamp, or size has changed, stop and update the `.env` source URL/date/timestamp/MD5/bytes together; do not bypass the preparation script's checksum failure. [Geofabrik Iran page](https://download.geofabrik.de/asia/iran.html) · [current MD5 sidecar](https://download.geofabrik.de/asia/iran-latest.osm.pbf.md5).
- Ubuntu 24.04's standard `osmium-tool` package is **1.16.0**, and the project pins that exact version everywhere (`MAP_OSMIUM_VERSION=1.16.0` in `.env.example`, the `prepare-tehran-pbf.sh` default, and this runbook), so no override is needed on this VM. Install the Ubuntu package and keep the pinned value; the preparation script requires an exact match with `osmium --version` and writes it into the crop manifest. Reload `.env` in every new terminal (`set -a; source .env; set +a`), or step 8 sees a stale/empty value. [Ubuntu Noble package](https://packages.ubuntu.com/noble/utils/osmium-tool).
- If the VM has no direct internet, use the **Proxy** section below before Phase A.
- `--max-table-size 100` is an OSRM `/table` query-size limit, **not** a general RAM limit. We keep the default cap and set OSRM runtime workers to one. [OSRM command-line options](https://project-osrm.org/docs/v26.4.0/tools).

---

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

The Ubuntu 24.04 `osmium-tool` package reports version 1.16.0, which is exactly the version pinned by `.env.example` and `prepare-tehran-pbf.sh`; keep `MAP_OSMIUM_VERSION=1.16.0` in `.env` below—no override is needed. The preparation script verifies the installed version and records it in the crop manifest. [Ubuntu Noble package](https://packages.ubuntu.com/noble/utils/osmium-tool).

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
```

Expected key results: Java reports version 21; `osmium --version` reports 1.16.0; Docker Compose reports v2; `nproc` reports 4. If `df -h /` shows less than about 15 GiB free, expand the VM disk before proceeding.

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

In `.env`, keep the project bbox as `MAP_BBOX=51.0,35.5,51.7,35.9` and use these values for the current Geofabrik `latest` snapshot and this Ubuntu release:

```env
MAP_SOURCE_URL=https://download.geofabrik.de/asia/iran-latest.osm.pbf
MAP_SOURCE_DATE=2026-10-18
MAP_SOURCE_DATA_TIMESTAMP=2026-10-18T20:25:06Z
MAP_SOURCE_MD5=a23eb2f21e426677bd243b2712ec1bc8
MAP_SOURCE_BYTES=229852435
MAP_SOURCE_PBF=./map-server/data/source/iran-latest.osm.pbf
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

Load the file into this terminal. Do not share `.env` or the password:

```bash
set -a
source .env
set +a
```

Every new terminal starts *without* these values. If you open a new terminal or reboot, repeat the three lines above before running any map script—several step 8 failures (including the Osmium version error) are just a terminal that never loaded `.env`, or that still holds an old value after `.env` was edited.

---

## Phase B — Data and pipeline

### 7. Download and verify Geofabrik `iran-latest.osm.pbf`

```bash
mkdir -p map-server/data/source
cd map-server/data/source
wget --continue https://download.geofabrik.de/asia/iran-latest.osm.pbf
wget -O iran-latest.osm.pbf.md5 \
  https://download.geofabrik.de/asia/iran-latest.osm.pbf.md5
cat iran-latest.osm.pbf.md5
md5sum -c iran-latest.osm.pbf.md5
wc -c iran-latest.osm.pbf
cd ../../..
```

For the snapshot reviewed on 2026-10-19, expect `iran-latest.osm.pbf: OK`, MD5 `a23eb2f21e426677bd243b2712ec1bc8`, and 229,852,435 bytes. The sidecar is the source of truth: if these differ, stop and update the source metadata in `.env` before preparing anything.

### 8. Crop Tehran once with the configured `MAP_BBOX`

Confirm the terminal still has `.env` loaded *and* that the pinned Osmium version matches the installed one, then crop. Run these as separate commands and stop at the first error—do not paste the whole block and continue past a failure:

```bash
cd ~/borobiya
set -a
source .env
set +a
osmium --version | head -n 1
echo "MAP_OSMIUM_VERSION=$MAP_OSMIUM_VERSION"
./map-server/scripts/prepare-tehran-pbf.sh
```

The first command prints `osmium version 1.16.0` on Ubuntu 24.04; the next line must print the same number (`MAP_OSMIUM_VERSION=1.16.0`). Only after `prepare-tehran-pbf.sh` finishes with `Prepared shared cropped PBF: ...` and prints the source/crop SHA-256 values, verify its output:

```bash
./map-server/scripts/verify-map-pbf.sh "$MAP_PBF"
```

Expect `OK: .../tehran.osm.pbf matches tehran crop [...] (SHA-256 ...)`. The preparation script rechecks the source MD5 and size, uses Osmium smart extraction with the configured WGS84 bbox, and records source and crop SHA-256 values in `map-server/data/tehran.source.json`. Copy those SHA-256 values from its output for the acceptance report. `Planetiler`, OSRM, and Nominatim must all use this exact crop; Photon imports the resulting Nominatim database.

If you intentionally need to repeat a crop, first inspect the generated data. Only then run `MAP_CROP_OVERWRITE=1 ./map-server/scripts/prepare-tehran-pbf.sh`.

#### If step 8 fails

**`osmium-tool ... is required (found 1.16.0)`** — `.env` still contains an old `MAP_OSMIUM_VERSION`, or this terminal never reloaded `.env` after you edited it. Do not install another Osmium; fix `.env`, reload it, and rerun:

```bash
cd ~/borobiya
sed -i 's/^MAP_OSMIUM_VERSION=.*/MAP_OSMIUM_VERSION=1.16.0/' .env
set -a; source .env; set +a
./map-server/scripts/prepare-tehran-pbf.sh
```

**`verify-map-pbf: cropped PBF is missing or empty: .../map-server/data/tehran.osm.pbf`** — this is a knock-on effect, not a second bug. `verify-map-pbf.sh` only checks the crop that `prepare-tehran-pbf.sh` creates; if preparation failed (for example with the version error above) or has not yet succeeded in this checkout, there is nothing to verify. Fix the preparation error first, rerun `prepare-tehran-pbf.sh` until it prints `Prepared shared cropped PBF: ...`, and only then run `./map-server/scripts/verify-map-pbf.sh "$MAP_PBF"`.

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

The script completes `car`, then `bicycle`, then `foot`; each profile's extract/partition/customize commands run in temporary `docker run --rm` containers. It never launches the three graph builds concurrently. Each build uses two threads and records the shared crop hash. Allow enough disk for all three generated graphs before beginning.

### 11. Build the Photon index from Nominatim

Download the pinned Photon JAR and start only the Nominatim import service:

```bash
./map-server/scripts/download-photon.sh
docker compose --profile geocoding-import up -d nominatim
docker compose --profile geocoding-import ps nominatim
docker compose --profile geocoding-import logs --tail=100 nominatim
```

Wait until `ps` reports Nominatim as `healthy`. First startup imports the shared Tehran crop and may take a while; `health: starting` during the import is expected—do not restart it. Once healthy, run the Photon import from the host. Keep Nominatim running during this step; Photon reads its local PostgreSQL database.

If `ps` instead shows `Restarting`, read the first real error in the logs above. `chown: ... Read-only file system` means an old checkout whose Compose file mounted the PBF read-only inside `/nominatim`—`git pull --ff-only`, then `docker compose --profile geocoding-import up -d --force-recreate nominatim`. The half-initialized database volume can stay; the entrypoint drops and re-imports the database from scratch on the next start.

```bash
cd map-server/photon/data
java -Xms512m -Xmx2g -jar ../photon-1.3.0.jar import \
  -host 127.0.0.1 -port "$NOMINATIM_DB_PORT" \
  -database nominatim -user nominatim -password "$NOMINATIM_PASSWORD" \
  -languages fa,en
cd ../../..
```

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

Expect seven services `Up`: `postgres`, `map-server`, and `routing-gateway` reporting `(healthy)`, plus `osrm-car`, `osrm-bicycle`, `osrm-foot`, and `photon`. This step does not start `api` or `nginx`; an `api` container left over from an earlier attempt may still appear in the list—if it shows `Restarting`, see the fixes below.

#### If step 12 fails

`Interrupted` / `No such image` for several images means **one** pull failed and Compose cancelled the rest—fix only the first `Error response from daemon: ...` line, then rerun the `up -d` command. Known cases:

- `osrm-backend:v26.10.0: not found` — old checkout; upstream has no bare `v26.10.0` tag. The correct tag is `v26.10.0-debian` (already fixed in this repo): `git pull --ff-only`, then rerun. If step 10 never finished (check `ls map-server/osrm/data/car`), rerun step 10 first—it uses the same image.
- `borobiya/photon:1.3.0: No such image` — Photon is built locally, not pulled. Build it once, then rerun `up -d`:

```bash
docker compose --profile geocoding build photon
```

- `borobiya-api-1` keeps `Restarting` with `Replace the example placeholder secret` — `.env` still has the example JWT secrets. The step 12 `up -d` command does not include `api`, so a crash-looping container from an earlier attempt is left untouched until you recreate it explicitly. The map services are unaffected (step 13 can still run), but fix the API before using the full app. Generate two different secrets, reload `.env` into this terminal (Compose prefers variables already in your shell over the edited file), and recreate only the API. Do **not** change `POSTGRES_PASSWORD`/`NOMINATIM_PASSWORD` now; their volumes already store the first password.

```bash
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
set -a; source .env; set +a
docker compose up -d --build --force-recreate api
docker compose logs --tail=20 api
```

- `borobiya-map-server-1` keeps `Restarting` and its logs end with `password authentication failed` — `POSTGRES_PASSWORD` in this terminal/`.env` no longer matches the password the existing `postgres-data` volume was initialized with (Postgres still shows `healthy`; its healthcheck does not log in). Either set `.env` back to the original password, or—at this stage the app database is still empty—reset only that one volume so it initializes with the current `.env` password, then rerun the step 12 `up -d` command. Map tiles, OSRM graphs, the Photon index, and the Nominatim volume are stored elsewhere and are not touched.

```bash
docker compose down
docker volume rm borobiya_postgres-data
set -a; source .env; set +a
```

### 13. Verify tiles, all route profiles, forward geocoding, and reverse geocoding

Run the scripted acceptance checks first:

```bash
./map-server/scripts/verify-tehran-tiles.sh
./map-server/scripts/verify-routing.sh
./map-server/scripts/verify-geocoding.sh
```

These scripts issue real HTTP requests to Martin (`localhost:8000`) and the local gateway (`localhost:8001`) and validate non-empty MVT/GeoJSON/routes. To inspect the raw responses with `curl`:

```bash
# Martin MVT tile — should be HTTP 200 and non-empty protobuf bytes.
curl -fS -o /tmp/tehran-z12-x2632-y1612.pbf \
  -w 'tile HTTP %{http_code}; %{size_download} bytes\n' \
  http://localhost:8000/tehran/12/2632/1612

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

The three task checkboxes remain open until all three scripted checks pass on this VM. Keep the output from the preparation script (source/crop SHA-256) and the three smoke tests; share those outputs without `.env`, passwords, or private credentials.

To stop services without deleting built data or named volumes:

```bash
docker compose --profile routing --profile geocoding down
docker compose --profile geocoding-import down
```

Do **not** add `-v`; that would delete persistent Compose volumes.
