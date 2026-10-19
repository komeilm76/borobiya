# Ubuntu 24.04 VMware Runbook — Offline Tehran Map Pipeline

This guide builds and verifies T1.4.2 (Martin vector tiles), T1.4.4 (OSRM routes), and T1.4.5 (Photon geocoding) on the requested VM: **Ubuntu 24.04 LTS, 4 vCPU, 6 GiB RAM, 40 GB disk**. It deliberately builds Planetiler, OSRM, and Photon one after another; only the final acceptance phase starts Martin, all three OSRM services, and Photon together. Nominatim has to stay up during the Photon import, then is stopped to free memory.

> **Resource warning:** 6 GiB is tight for five live map services. The defaults below reduce Java heaps, database memory, and thread counts, but they cannot guarantee the complete stack fits on every dataset/runtime. Check `free -h` and `df -h /` first. If services are killed by the OOM killer, run the live route profiles one at a time or increase the VM to 8 GiB. Keep at least 15–20 GiB free on the filesystem before starting imports.

## Before you begin: two version/data details

- The repository's normal, reproducible source is the immutable `iran-261018.osm.pbf`. This guide follows the requested `iran-latest.osm.pbf` URL instead. **As of 2026-10-19**, Geofabrik's latest file reports data timestamp `2026-10-18T20:25:06Z`, is 229,852,435 bytes, and its official sidecar reports MD5 `a23eb2f21e426677bd243b2712ec1bc8`—the same bytes as the dated archive. `latest` is mutable. If you run this later and the official sidecar, timestamp, or size has changed, stop and update the `.env` source URL/date/timestamp/MD5/bytes together; do not bypass the preparation script's checksum failure. [Geofabrik Iran page](https://download.geofabrik.de/asia/iran.html) · [current MD5 sidecar](https://download.geofabrik.de/asia/iran-latest.osm.pbf.md5).
- Ubuntu 24.04's standard `osmium-tool` package is **1.16.0**, and the project pins that exact version everywhere (`MAP_OSMIUM_VERSION=1.16.0` in `.env.example`, the `prepare-tehran-pbf.sh` default, and this runbook), so no override is needed on this VM. Install the Ubuntu package and keep the pinned value; the preparation script requires an exact match with `osmium --version` and writes it into the crop manifest. Reload `.env` in every new terminal (`set -a; source .env; set +a`), or step 8 sees a stale/empty value. [Ubuntu Noble package](https://packages.ubuntu.com/noble/utils/osmium-tool).
- If the VM cannot reach the internet directly (for example, downloads must go through a proxy app on the host), work through the **Proxy** section below *before* Phase A. It sets a dynamically detected host proxy for the terminal, `apt`, Docker image pulls, and Java—and shows how to remove it again.
- `--max-table-size 100` is an OSRM `/table` query-size limit, **not** a general RAM limit. We keep the default cap and set OSRM runtime workers to one. [OSRM command-line options](https://project-osrm.org/docs/v26.4.0/tools).

---

## Proxy: set, verify, and remove (only if the VM has no direct internet)

Some steps download from the internet: `apt` (A1–A3), `git` (A5), `wget` (step 7), `curl` inside the map scripts (steps 8, 9, and 11), Docker image pulls (A4, steps 10–12), and Planetiler's Java `--download` (step 9). If those time out but a proxy app is running on your host (for example on port `2080`), route the VM through it as below. Skip this whole section if downloads already work directly.

> The proxy address is **dynamic**: in VMware NAT mode the host is reachable at the VM's default gateway (usually `192.168.x.2`), so the commands below read that gateway automatically instead of hard-coding one machine's address. If the VM uses **bridged** networking, the gateway is your router, not the host: set `PROXY_HOST` manually to the host's LAN IP (on Windows, `ipconfig`), and make sure the host proxy app allows connections from the LAN/VM.

### P1. Set the proxy for the current terminal (curl, wget, git)

```bash
PROXY_HOST="$(ip route show default | awk '{print $3; exit}')"
PROXY_PORT=2080
echo "Proxy: http://${PROXY_HOST}:${PROXY_PORT}"

export http_proxy="http://${PROXY_HOST}:${PROXY_PORT}"
export https_proxy="http://${PROXY_HOST}:${PROXY_PORT}"
export HTTP_PROXY="$http_proxy"
export HTTPS_PROXY="$https_proxy"
export no_proxy="localhost,127.0.0.1"
export NO_PROXY="$no_proxy"
```

If auto-detection picks the wrong address, override the first two lines with your known values (for example `PROXY_HOST=192.168.136.2` and `PROXY_PORT=2080`) and run the exports again. That is exactly equivalent to:

```bash
export http_proxy="http://192.168.136.2:2080"
export https_proxy="http://192.168.136.2:2080"
```

Do not omit `no_proxy`: it keeps the step 13 checks (`localhost:8000`/`8001`) off the proxy. These exports affect only this terminal session—repeat P1 in every new terminal, and never write proxy values into `.env` or commit them.

### P2. Verify the terminal proxy

```bash
env | grep -i proxy
curl -fsSI https://download.geofabrik.de/asia/iran.html | head -n 1
curl -fsSI https://github.com | head -n 1
```

Expect the six variables from P1 and an `HTTP/... 200` (or redirect) status line from both requests. If `curl` reports a proxy/connect error, the host address or port is wrong, the proxy app is not running, or it refuses VM/LAN connections; fix that before continuing.

### P3. Set the proxy for apt

`sudo` does not keep your terminal exports, so give `apt` its own config. Run P1 first (same terminal) so `$PROXY_HOST`/`$PROXY_PORT` are set:

```bash
: "${PROXY_HOST:?Run P1 first in this terminal}" "${PROXY_PORT:?Run P1 first in this terminal}"
sudo tee /etc/apt/apt.conf.d/95proxy >/dev/null <<EOF
Acquire::http::Proxy "http://${PROXY_HOST}:${PROXY_PORT}";
Acquire::https::Proxy "http://${PROXY_HOST}:${PROXY_PORT}";
EOF
sudo apt update
```

Unlike the P1 exports, this file persists across terminals/reboots until removed in P6.

### P4. Set the proxy for Docker image pulls

The Docker daemon pulls images itself and ignores terminal exports. Add a systemd drop-in (run P1 first, same terminal), then restart Docker:

```bash
: "${PROXY_HOST:?Run P1 first in this terminal}" "${PROXY_PORT:?Run P1 first in this terminal}"
sudo install -m 0755 -d /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/http-proxy.conf >/dev/null <<EOF
[Service]
Environment="HTTP_PROXY=http://${PROXY_HOST}:${PROXY_PORT}"
Environment="HTTPS_PROXY=http://${PROXY_HOST}:${PROXY_PORT}"
Environment="NO_PROXY=localhost,127.0.0.1"
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
systemctl show --property=Environment docker
docker run --rm hello-world
```

Do this *before* the first image pulls (A4, steps 10–12): restarting Docker stops running containers. This configures only image pulls. The offline map services themselves need no internet and no proxy; do not add proxy values to `docker-compose.yml`, container environments, or `.env`. Like P3, this file persists until removed in P6.

### P5. Set the proxy for Java (needed before step 9)

Java ignores `http_proxy`, but step 9 runs Planetiler with `--download` (Natural Earth/water data). In the same terminal as P1:

```bash
: "${PROXY_HOST:?Run P1 first in this terminal}" "${PROXY_PORT:?Run P1 first in this terminal}"
export JAVA_TOOL_OPTIONS="-Dhttp.proxyHost=${PROXY_HOST} -Dhttp.proxyPort=${PROXY_PORT} -Dhttps.proxyHost=${PROXY_HOST} -Dhttps.proxyPort=${PROXY_PORT} -Dhttp.nonProxyHosts=localhost|127.0.0.1"
```

Java then prints a harmless `Picked up JAVA_TOOL_OPTIONS: ...` line at startup. Do not confuse this with `PHOTON_JAVA_TOOL_OPTIONS` in `.env`, which only sizes the Photon container heap; leave that entry unchanged.

### P6. Remove the proxy everywhere

Terminal exports (current terminal only). Closing the terminal discards them too:

```bash
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY
unset JAVA_TOOL_OPTIONS PROXY_HOST PROXY_PORT
env | grep -i proxy || echo "no proxy variables set"
```

`apt` and Docker (the persistent files from P3/P4; remove them when the host proxy is gone, its address changed, or direct internet works):

```bash
sudo rm -f /etc/apt/apt.conf.d/95proxy
sudo apt update

sudo rm -f /etc/systemd/system/docker.service.d/http-proxy.conf
sudo systemctl daemon-reload
sudo systemctl restart docker
```

The Docker restart stops running containers; if the map stack was already up, restart it with step 12's `docker compose ... up -d` command. If you additionally saved a proxy in Git config (`git config --global http.proxy ...`), remove it with `git config --global --unset http.proxy` and `git config --global --unset https.proxy`.

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
git clone --single-branch --branch arena/91f87b17-borobiya \
  https://github.com/komeilm76/borobiya.git
cd ~/borobiya
git log -1 --oneline
```

The latest implementation should show commit `f32191e` or a newer commit on that same branch. If you already cloned the repository, update that checkout instead:

```bash
cd ~/borobiya
git fetch origin arena/91f87b17-borobiya
git switch arena/91f87b17-borobiya
git pull --ff-only origin arena/91f87b17-borobiya
```

If `git switch` says that branch does not exist locally, create its tracking branch once:

```bash
git switch --track -c arena/91f87b17-borobiya origin/arena/91f87b17-borobiya
```

### A6. Configure the VM-friendly environment

```bash
cd ~/borobiya
cp .env.example .env
nano .env
```

In `.env`, keep the project bbox as `MAP_BBOX=51.0,35.5,51.7,35.9`, set a private `NOMINATIM_PASSWORD`, and use these values for the current Geofabrik `latest` snapshot and this Ubuntu release:

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

The `.env.example` already contains the resource-tuning values; edit the existing entries rather than appending duplicate keys. Generate a password locally if needed, then paste it only into `.env`:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
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

This step needs internet. If `wget` times out or cannot resolve/connect, set the terminal proxy first (Proxy section, P1–P2) and rerun; `--continue` resumes a partial file.

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

**`osmium-tool ... is required (found 1.16.0)`** — `.env` still contains an old `MAP_OSMIUM_VERSION` (for example from a checkout made before the pin was aligned to Ubuntu 24.04), or this terminal never reloaded `.env` after you edited it. Installing a different Osmium is *not* required: 1.16.0 supports the `smart` extract strategy used here. Sync `.env` to the installed version (detected dynamically, the same way the script reads it), reload it, confirm, and rerun the preparation script:

```bash
cd ~/borobiya
osmium --version | head -n 1
sed -i "s/^MAP_OSMIUM_VERSION=.*/MAP_OSMIUM_VERSION=$(osmium --version 2>&1 | awk '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+[.][0-9]+[.][0-9]+$/){print $i; exit}}')/" .env
grep '^MAP_OSMIUM_VERSION=' .env
set -a
source .env
set +a
./map-server/scripts/prepare-tehran-pbf.sh
```

**`verify-map-pbf: cropped PBF is missing or empty: .../map-server/data/tehran.osm.pbf`** — this is a knock-on effect, not a second bug. `verify-map-pbf.sh` only checks the crop that `prepare-tehran-pbf.sh` creates; if preparation failed (for example with the version error above) or has not yet succeeded in this checkout, there is nothing to verify. Fix the preparation error first, rerun `prepare-tehran-pbf.sh` until it prints `Prepared shared cropped PBF: ...`, and only then run `./map-server/scripts/verify-map-pbf.sh "$MAP_PBF"`.

### 9. Generate PMTiles with Planetiler

Run this alone; do not start the map stack yet:

```bash
PLANETILER_HEAP=3g ./map-server/scripts/generate-tiles.sh
```

The script uses `-Xmx3g` by default, checks Java 21+, downloads/verifies Planetiler 0.10.2, and writes the PMTiles archive plus build metadata. If the Java process is killed for memory, stop and share the final log and `free -h`; do not immediately raise the heap on a 6 GiB VM.

This step needs internet twice: `curl` downloads the Planetiler JAR, then Planetiler's Java `--download` fetches Natural Earth/water data. Behind a host proxy, run Proxy **P1 and P5** in this terminal first—shell exports alone are not enough for Java.

### 10. Build OSRM car, bicycle, and foot graphs sequentially

```bash
OSRM_BUILD_THREADS=2 ./map-server/scripts/build-routing.sh
```

The script completes `car`, then `bicycle`, then `foot`; each profile's extract/partition/customize commands run in temporary `docker run --rm` containers. It never launches the three graph builds concurrently. Each build uses two threads and records the shared crop hash. Allow enough disk for all three generated graphs before beginning.

### 11. Build the Photon index from Nominatim

Download the pinned Photon JAR and start only the Nominatim import service. Behind a host proxy, `download-photon.sh`'s `curl` uses the terminal proxy (P1), while the Nominatim image pull uses the Docker daemon proxy (P4)—set both before this step if direct downloads fail. The same applies to the OSRM image pulls in step 10 and the service image pulls in step 12.

```bash
./map-server/scripts/download-photon.sh
docker compose --profile geocoding-import up -d nominatim
docker compose --profile geocoding-import ps nominatim
docker compose --profile geocoding-import logs --tail=100 nominatim
```

Wait until `ps` reports Nominatim as `healthy`. First startup imports the shared Tehran crop and may take a while. Once healthy, run the Photon import from the host. Keep Nominatim running during this step; Photon reads its local PostgreSQL database.

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

### 13. Verify tiles, all route profiles, forward geocoding, and reverse geocoding

Run the scripted acceptance checks first:

```bash
./map-server/scripts/verify-tehran-tiles.sh
./map-server/scripts/verify-routing.sh
./map-server/scripts/verify-geocoding.sh
```

These scripts issue real HTTP requests to Martin (`localhost:8000`) and the local gateway (`localhost:8001`) and validate non-empty MVT/GeoJSON/routes. They must stay local: if a terminal proxy is set, `no_proxy=localhost,127.0.0.1` (P1) already bypasses it; if you see proxy errors in this step, remove the terminal proxy (P6) and rerun. To inspect the raw responses with `curl`:

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
