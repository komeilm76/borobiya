# Ubuntu 24.04 VM Runbook — Offline Map Stack

Step-by-step build of the Borobiya map stack (tiles, routing, geocoding) on the reference VM:
**Ubuntu Server 24.04 LTS, 4 vCPU, 6 GiB RAM, 50 GB disk, x86_64**, inside the
`borobiya/` clone of this repository.

> **Resource warning.** 6 GiB is tight for five live map services. The defaults below reduce the
> Java heaps, the database memory and the thread counts, but they cannot guarantee the complete
> stack fits on every dataset and runtime. Keep at least **15–20 GiB free** on the filesystem that
> holds the map library before starting any import (the pinned Iran extract plus its crops, tiles,
> three road graphs, the Photon index and the Nominatim database together run to well over 10 GB),
> and check `free -h` / `df -h` again before step 11. If services are killed by the OOM killer, run
> the live routing profiles one at a time or move the VM to 8 GiB (§ 9.4).

This document is written to be read **once, top to bottom**, and then followed. Every command
below exists in this repository or in the Ubuntu/Docker toolchain it documents, and every
command is described in the line above it — what it does, what a good result looks like, and
what to delete if you want to redo just that step.

**Four rules that make the rest of this runbook safe:**

1. **Every step is re-runnable.** Setup and downloads keep their progress and resume. A step is
   skipped when its output already matches the dataset checksum recorded in the manifest, so a
   completed step is never re-imported. Re-running a finished step costs seconds, not hours.
2. **The two big imports are one-time.** Nominatim and Photon run on the already-cropped,
   already-merged dataset file (`$MAP_PBF`, i.e.
   `$MAP_LIBRARY_DIR/datasets/<snapshot>-<fingerprint>/borobiya.osm.pbf`), not on the whole Iran
   extract. Nominatim's state lives in a Docker volume, Photon's in its index directory with a
   stamp file that records which dataset PBF it was built from. Re-running an import without
   clearing that state reuses the existing database and reports success — which is why a changed
   area selection must be followed by a real reset (§ 8.5).
3. **`.env` has to be *loaded*, not just written.** A plain `source .env` only exports variables
   that were already exported, so every `.env`-backed value arrives empty in the shell that runs
   scripts. Each terminal you use for this runbook starts with the loader block in § 2.1. The
   Docker stack reads `.env` from the project directory by itself and does not need it.
4. **`docker compose down` never gets `-v` here** unless § 8 says so. The `-v` flag deletes the
   volumes, which destroys the *only* copies of the PostGIS **and uploaded photo** data
   (`borobiya_postgres-data`, `borobiya_borobiya-uploads` — § 8.4 lists exactly what is inside them).

If you just want the two commands: start everything from scratch is § 1.2, resume after a failure
is § 1.3.

---

## 1. Orientation

### 1.1 The whole build in one table

Phase **A** prepares the machine (one-time). Phase **B** builds the data (repeatable per area or
snapshot). The `Check` column is how you prove to yourself that the step worked before moving on.

| Step | What it does | Command (in `~/borobiya`) | Done when | Re-run cost |
| --- | --- | --- | --- | --- |
| A0 | Reach the VM over SSH; install `openssh-server` | `ssh` + `systemctl is-active ssh` | You have a shell on the VM and its IP | one package |
| A1 | Ubuntu package index up to date | `sudo apt update` | No `Failed to fetch` lines | seconds |
| A2 | Docker Engine + Compose v2 from the official apt repo | Docker's `get.docker.com` script **or** the manual `apt` block | `docker compose version` prints v2.x | seconds |
| A3 | Toolchain: Java 21, **Bun**, Osmium, git, curl, wget, unzip, openssl, Python, `openssh-server` | one `apt install` + the pinned Bun installer | A4 reports every one of them | minutes |
| A4 | Preflight: tool versions vs the pins in this repo, disk, inodes, Docker storage | the § A4 paste block | each pin above matches the value below it; capacity floors met | seconds |
| A5 | Get the code and prove the pipeline files are in it | `git clone` + the § A5 preflight loop | `PREFLIGHT OK` | seconds |
| A6 | `.env`: secrets, area selection, snapshot policy, map-library location | `cp .env.example .env` + the § A6 blocks | `resolve` prints the same selection you chose | seconds |
| — | *(optional)* proxy for downloads, and proof that it works | § 5 | § 5.2's three checks pass | seconds |
| 7 | *(optional)* pre-download the big files: Geofabrik extracts + Planetiler's reference layers (≈230 MB + 1.3 GB) | `./map-server/scripts/fetch-planetiler-sources.sh` (steps 8 and 9 otherwise fetch what they need themselves) | Each line ends `cached` or `verified` | it skips already-verified files |
| 8 | Download + verify + crop + merge the OSM extracts | `./map-server/scripts/prepare-regions-pbf.sh` | `PBF OK` from `verify-map-pbf.sh` | downloads skip, crop+merge re-run |
| 9 | Build the vector tiles (PMTiles) | `PLANETILER_HEAP=3g ./map-server/scripts/generate-tiles.sh` | `verify-tiles.sh` exits 0 | 30–50 min (no re-download of reference layers) |
| 10 | Build the OSRM road graphs | `OSRM_BUILD_THREADS=2 ./map-server/scripts/build-routing.sh` | `car/`, `bicycle/` and `foot/` each full of `*.osrm*` files in `$MAP_OSRM_DATA_DIR` | 25–45 min |
| 11 | Geocoding: Photon JAR+index, Nominatim import, Nominatim→Photon | `./map-server/scripts/download-photon.sh` + the § 6.5 commands | Photon index dir + its dataset stamp exist; `verify-geocoding.sh` in step 13 passes | hours; volumes are reused unless you clear them |
| 12 | Start the serving stack | `docker compose --profile routing --profile geocoding up -d …` | § 7.1's table shows every service `Up (healthy)` | seconds |
| 13 | Acceptance checks + sign-off | three `verify-*.sh` scripts + the § 6.7 curls | All exit 0; notes written down | seconds |

`Steps 1–6` do not exist: the data pipeline is numbered 7–13 because those numbers are used in
`docker-compose.yml`, `map-server/README.md`, `docs/PROGRESS.md` and the setup script's own
messages, and this runbook must stay quotable from all of them.

### 1.2 Start from the first step (a clean VM, or "do it all again")

Two ways. Pick one, then read the step you are at before you run it — the automated path runs the
same steps, it just doesn't stop between them.

**a. Automated (recommended).** Everything from A5 onward — clone check, `.env` + secrets, area
selection, downloads, tiles, routing, geocoding, containers, migrations, seed, verification:

```bash
cd ~/borobiya
./scripts/setup-ubuntu-vm.sh --reselect          # interactive: pick areas, confirm plan
```

| Flag | What it changes |
| --- | --- |
| `--reselect` | Reopens the area-selection menu and rewrites `MAP_REGION_IDS` in `.env` (without it, an existing `.env` selection is reused) |
| `--regions ID[,ID…]` | Skip the menu and select exactly these areas (`./scripts/setup-ubuntu-vm.sh --list-regions` prints the valid IDs) |
| `--list-regions` | Print the selectable areas and exit |
| `--snapshot pinned\|latest\|YYYY-MM-DD` | Which upstream data date to use |
| `--source-policy cache-first\|refresh\|offline` | Use what is on disk, re-download anyway, or never touch the network |
| `--refresh-sources` | Shortcut for `--source-policy refresh` |
| `--offline` | Require every artifact to already exist; never touch the network |
| `--update-map` | Rebuild the map data for a `.env` that already exists |
| `--map-library PATH` | Move the map library (downloads, crops, tiles, indexes) outside the repo |
| `--yes` | Non-interactive: run the whole plan without confirming |
| `--dry-run` | Print the steps, change nothing |

The script needs Phase A (A1–A4) already done — it checks for the tools and stops with that
advice rather than installing system packages itself.

**b. Manual.** Do A0–A6, then steps 7 → 13 in order. Nothing here is backgrounded on purpose: an
SSH session that drops should take its build down with it, so that a resumed step starts from a
known file, not from a half-written one that `kill -0` thinks is still alive. If you must
detach, keep the terminal open (§ 2.1 has the two ways).

### 1.3 Start from the failed step

**First choice — re-run the setup script.** It is the resume mechanism: each stage verifies the
artifact it is about to build and skips itself when the artifact matches the manifest checksum,
so re-running after a failure re-does only what is actually missing or broken.

```bash
cd ~/borobiya
./scripts/setup-ubuntu-vm.sh                  # reuse the area selection in .env
./scripts/setup-ubuntu-vm.sh --update-map     # …and rebuild the map data even if it exists
```

**Second choice — run only the step that failed**, using the "redo this step" line at the end of
that step below. The table version of the same thing, for the case where you don't know which
step failed:

| `verify-map-pbf.sh` says | `verify-tiles.sh` says | Go to |
| --- | --- | --- |
| no dataset file / manifest mismatch | — | step 8 |
| `PBF OK` | PMTiles missing or stale | step 9 |
| `PBF OK` | `PMTILES OK` | step 10 (routing) or 11 (geocoding) |
| `PBF OK` | `PMTILES OK`, containers wrong | step 12 |

**Don't "fix" a failed download by adding `--force`.** The three JAR/script downloaders
(`fetch-planetiler-sources.sh`, `download-photon.sh`) are already skip-if-present, so `--force`
only makes them re-download a file that is fine; it never fixes a server that is down. A
truncated download is detected by checksum and re-fetched on the next run by itself.

---

## 2. Where things live

### 2.1 Paths and the shell you need

| Name | Default | Holds |
| --- | --- | --- |
| `MAP_LIBRARY_DIR` | `~/.local/share/borobiya/map-library` | all generated map data: downloads, crops, tiles, OSRM graphs, Photon index, provenance |
| `$MAP_LIBRARY_DIR/sources/` | | the per-source `.osm.pbf` extracts, each with the Geofabrik `.md5` sidecar and a `source.json` provenance record in the same directory |
| `$MAP_LIBRARY_DIR/crops/` | | the per-area bbox crops (`<area-id>.osm.pbf`), each with a `<area-id>.source.json` record of the source hash, bbox and Osmium version that produced it |
| `$MAP_LIBRARY_DIR/datasets/<date>-<fingerprint>/` | | the merged dataset PBF (`borobiya.osm.pbf`), its provenance manifest (`borobiya.source.json`), `borobiya.pmtiles` + `borobiya.metadata.json`, and the `routing/` + `geocoding/` directories below. `MAP_DATA_DIR` and `MAP_DATASET_DIR` are the same directory |
| `$MAP_LIBRARY_DIR/planetiler-sources/` | | Planetiler's reference layers (Natural Earth, water polygons, lake centerlines) — ≈1.3 GB (step 7) |
| `$MAP_OSRM_DATA_DIR` | | = `<dataset dir>/routing`: `car/`, `bicycle/`, `foot/` graph directories (step 10) |
| `$MAP_PHOTON_DATA_DIR` | | = `<dataset dir>/geocoding`: `photon_data/` index + the `.borobiya-pbf.sha256` stamp (step 11) |
| `map-server/` (in the repo) | | `regions.json` — the area catalog: ids, Geofabrik `url`+`md5` pins, bboxes, languages — plus `styles/`, `sprites/`, `fonts/`, `martin.yaml`, `routing-gateway/`, `photon/Dockerfile`. **Committed inputs, never cache** |
| `map-server/{data,tiles,osrm/data,photon/data}` | | gitignored leftovers from pre-library checkouts (a stray PBF, a Planetiler JAR). § 8.2's script can clear them; nothing in the current pipeline writes here |
| `docker-volume: borobiya_nominatim-data` | | the Nominatim PostGIS database (step 11) |
| `docker-volume: borobiya-uploads` | | SOS photo evidence — **not map data, and the only copy** |

Before any step that runs a script, the terminal has to be loaded (rule 3 above). **The loader
block** below is that step: run it at the start of every terminal, and re-run it after every `.env`
edit. It is the same sequence `setup-ubuntu-vm.sh` runs internally, so copying it is never wrong:

```bash
cd ~/borobiya
set -a                                             # export every assignment made below
source .env                                        # the pins, paths and selection you wrote
if [[ -z "${MAP_LIBRARY_DIR:-}" ]]; then           # blank in .env = the documented default location
  if [[ -n "${XDG_DATA_HOME:-}" ]]; then
    [[ "$XDG_DATA_HOME" == /* ]] || { echo 'XDG_DATA_HOME must be absolute; set MAP_LIBRARY_DIR explicitly.' >&2; exit 1; }
    MAP_LIBRARY_DIR="$XDG_DATA_HOME/borobiya/map-library"
  else
    MAP_LIBRARY_DIR="$HOME/.local/share/borobiya/map-library"
  fi
fi
[[ "$MAP_LIBRARY_DIR" == /* ]] || { echo 'MAP_LIBRARY_DIR must be absolute.' >&2; exit 1; }
eval "$(python3 map-server/scripts/regions.py resolve "$MAP_REGION_IDS" \
  --snapshot "${MAP_SNAPSHOT_DATE:-pinned}" --source-policy "${MAP_SOURCE_POLICY:-cache-first}" \
  --library "$MAP_LIBRARY_DIR")"                   # the selection + every derived path
export MAP_DATA_VERSION="$SNAPSHOT_DATE"
bbox_norm() { awk -F, '{for(i=1;i<=NF;i++) printf "%g%s", $i, (i<NF?",":"\n")}'; }   # 51.0 == 51
[[ "$(printf '%s' "${MAP_BBOX:-}" | bbox_norm)" == "$(printf '%s' "$UNION_BBOX" | bbox_norm)" ]] \
  || echo "note: .env MAP_BBOX (${MAP_BBOX:-unset}) is not this selection's union bbox ($UNION_BBOX); using the computed one — fix .env too"
export MAP_BBOX="$UNION_BBOX"                      # the bbox always follows the selection, never a stale line
set +a
echo "$MAP_REGION_IDS | $SNAPSHOT_DATE | $MAP_LIBRARY_DIR"
```

`regions.py resolve` **requires** the selection as its first argument — `"$MAP_REGION_IDS"`, which
`source .env` just supplied. There is no bare `regions.py resolve`: the resolver never reads `.env`
by itself, because the scripts that call it have already decided what to ask for.

Two details of this shape are load-bearing. `resolve` prints `KEY='value'` lines (not `export
KEY=…`), so `set -a` must still be open while the `eval` runs — otherwise `prepare-regions-pbf.sh`,
`generate-tiles.sh` and the `verify-*.sh` scripts start without the paths and behave as if the
selection were empty. And `MAP_BBOX` is deliberately re-derived from `UNION_BBOX` rather than taken
from `.env`: a bbox left over from the previous selection is the one input that would build tiles
and road graphs for the wrong rectangle, quietly. If your `.env` disagrees, fix it there too —
`docker compose` reads the file, not your shell. The comparison normalizes numbers, so `.env`'s
`51.0,35.5,51.7,35.9` and the resolver's `51,35.5,51.7,35.9` count as the same bbox and no note
prints:

```bash
TMP=$(mktemp); sed "s|^MAP_BBOX=.*|MAP_BBOX=$UNION_BBOX|" .env > "$TMP" && mv "$TMP" .env
```

What the block fills in for steps 7–13: `MAP_PBF`, `MAP_PBF_MANIFEST`, `MAP_LIBRARY_DIR`,
`MAP_DATASET_DIR`/`MAP_DATA_DIR` (the same directory), `MAP_OSRM_DATA_DIR`, `MAP_PHOTON_DATA_DIR`,
`PHOTON_STAMP`, `UNION_BBOX`, `SOURCE_IDS`, `PHOTON_LANGUAGES`, `PHOTON_DEFAULT_LANGUAGE`,
`DATASET_FINGERPRINT`, `SNAPSHOT_MODE`/`SNAPSHOT_DATE`, `SOURCE_POLICY`, `SELECTION_HEAVY` and
`APPROX_DOWNLOAD_MB`. Without it those names are empty and every check fails confusingly
(`cannot open ''`, "dataset PBF is missing"). The final `echo` is your proof of what this terminal is
about to build; if it prints a different selection than you chose, stop and fix `.env` now — not
after forty minutes of import.

Keep the session alive across a dropped network: `tmux` (`sudo apt install -y tmux`, then
`tmux new -s map`, detach with <kbd>Ctrl</kbd>-b then `d`, reattach with `tmux attach -t map`) or
`ssh -M` with a persistent `ControlPath`. Do **not** nohup or background the imports.

### 2.2 Two version/data details you will otherwise be told are bugs

- **Whole-country extracts, not city extracts.** Every source is a Geofabrik country/administrative
  extract (`iran-latest.osm.pbf` ≈ 229 MB for Iran); a city area is then cut out of it with
  `osmium extract --strategy=smart --bbox=<the area's bbox>`, and a whole-country area skips the crop
  entirely (its bbox is the literal `ALL`). No boundary/polygon file is downloaded or trusted: the
  bbox plus the source's own tags decide what is in the crop, which is why the crop is deterministic
  and re-verifiable. This is what keeps tiles, OSRM and Nominatim fed by one identical file and lets
  any area in `map-server/regions.json` be selected. The `pinned`
  snapshot in `.env.example` resolves to `iran-261018.osm.pbf` (229,852,435 bytes, MD5
  `a23eb2f21e426677bd243b2712ec1bc8`), so a re-run verifies against a file that cannot change.
- **Nominatim does not read `.env` from the project directory.** `docker compose exec` does not
  re-read files, so if you change `NOMINATIM_PASSWORD`, recreate that service
  (`docker compose up -d --force-recreate nominatim`) or its import fails on a password mismatch.

---

## 3. Sources, links, and how to tell whether a link is still good

Every URL this runbook uses is listed here with what hosts it and whether it can rot. Nothing
below is a value to copy into a config file: **the pins live in `map-server/regions.json`,
`.env.example` and `docker-compose.yml`**, and this document reads them from those files.

### 3.1 The table

| # | Artifact | Fetched by | URL as the repo uses it | Pinned where | Verified 2026-10-23 |
| --- | --- | --- | --- | --- | --- |
| 1 | Geofabrik extracts (`iran-261018.osm.pbf` and friends) | `prepare-regions-pbf.sh` | `https://download.geofabrik.de/<region>-<YYMMDD>.osm.pbf` (+ its `.md5`) | top-level `snapshot` date and, per source, `url` + `md5` + `bytes` in `map-server/regions.json` | ⚠️ host unreachable from this sandbox; **dates are the rot risk** — see § 3.3 |
| 2 | Planetiler JAR | `generate-tiles.sh` (downloads if absent) | `https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar` | `PLANETILER_VERSION` in `map-server/scripts/generate-tiles.sh` (cached as `map-server/tools/planetiler-0.10.2.jar`) | ✅ live — asset exists, 93,278,824 bytes, tag published 2026-03-29 |
| 3 | Natural Earth | `fetch-planetiler-sources.sh` | `https://naciscdn.org/naturalearth/packages/natural_earth_vector.sqlite.zip` | `SOURCES` table in `fetch-planetiler-sources.sh` | ⚠️ not checked from here; the fallback is `dev.maptiler.download/geodata/omt/…`, which step 9's fetch tries automatically |
| 4 | Lake centerlines | same | `https://github.com/acalcutt/osm-lakelines/releases/download/v12/lake_centerline.shp.zip` | same table | ✅ GitHub release assets are permanent; MapTiler mirror is the fallback |
| 5 | **Water polygons** | same | `https://osmdata.openstreetmap.de/download/water-polygons-split-3857.zip` | `MAP_WATER_POLYGONS_URL` (blank = default) | ❌ **`osmdata.openstreetmap.de` has been down since 2026-10-22 for the whole Internet**, not just your VM. No official mirror. See § 3.4 |
| 6 | Photon JAR | `download-photon.sh` | `https://github.com/komoot/photon/releases/download/1.3.0/photon-1.3.0.jar` (note: tag has **no** `v`) | `PHOTON_VERSION` in `map-server/scripts/download-photon.sh` | ✅ live — 98,219,380 bytes, published 2026-08-07 |
| 7 | Bun (this runbook installs it) | you, § A3 | `https://github.com/oven-sh/bun/releases/download/bun-v1.4.3/bun-linux-x64.zip` | `packageManager` in the root `package.json` | ✅ live — 42,015,139 bytes; upstream latest is newer, which is fine |
| 8 | Martin image | `docker-compose.yml` | `ghcr.io/maplibre/martin:1.16.1` | `docker-compose.yml` | registry not checked from here; an immutable tag, so it does not move |
| 9 | OSRM image | `docker-compose.yml`, `build-routing.sh` | `ghcr.io/project-osrm/osrm-backend:v26.10.0-debian` | both files, identical | ⚠️ the bare `v26.10.0` tag **does not exist** upstream (only suffixed tags + `latest`) — if you see `No such image`, this is why |
| 10 | Nominatim image | `docker-compose.yml` (service `nominatim`, profile `geocoding-import`) | `mediagis/nominatim:5.3-2026-06-23T09-03` | `docker-compose.yml` | date-tagged build, pinned so a re-import reproduces |
| 11 | PostGIS / nginx images | `docker-compose.yml` | `postgis/postgis:16-3.4`, `nginx:1.30.6-alpine` | `docker-compose.yml` | immutable tags |
| 12 | apt: `openjdk-21-jdk-headless`, `osmium-tool`, `git`, `curl`, `wget`, `unzip`, `ca-certificates`, `openssl`, `python3`, `openssh-server`, `docker-ce*` | `apt` | Ubuntu archive + `download.docker.com` | Ubuntu release pockets | ⚠️ `osmium-tool` is **1.16.0** in the Noble archive; see § 6.2 |
| 13 | Photon image | not fetched — `docker-compose.yml` **builds** `borobiya/photon:1.3.0` from `map-server/photon/Dockerfile`: an `eclipse-temurin:21-jre-jammy` base plus the JAR from row 6, whose SHA-256 is re-checked inside the build (`PHOTON_SHA256`). The **index is not baked in** — it is bind-mounted from `$MAP_PHOTON_DATA_DIR` | `map-server/photon/Dockerfile` | no registry involved; `docker compose build photon` needs the base image only |

Legend: ✅ checked from this workspace today · ⚠️ could not be reached from this workspace (the
sandbox is allowed to reach GitHub and the package registries only), so the note is from the
repo's pins and from upstream's published behaviour, not from a live HEAD · ❌ known-broken.

### 3.2 Check a link yourself before you blame the proxy

```bash
# 1. Does the exact URL answer? -I = headers only, --max-time so a black hole can't hang you.
curl -sSI --max-time 15 -o /dev/null -w '%{url_effective} -> %{http_code}\n' \
  https://github.com/komoot/photon/releases/download/1.3.0/photon-1.3.0.jar

# 2. Did the host die, or just that file? A bare HEAD on the site root answers the question.
curl -sS --max-time 15 -o /dev/null -w 'root -> %{http_code}\n' https://osmdata.openstreetmap.de/
# HTTP 000 with no other output = the connection never completed (DNS or host down), which is a
# different problem than 404 (gone/moved) or 403 (blocked).

# 3. For a GitHub release: list the assets and their sizes instead of guessing a file name.
curl -s https://api.github.com/repos/onthegomap/planetiler/releases/tags/v0.10.2 \
  | python3 -c 'import json,sys; [print(a["name"], a["size"], a["browser_download_url"]) for a in json.load(sys.stdin)["assets"]]'
```

Interpreting: `200`/`302` = fine · `404` = the path or tag changed (check the upstream release
list, then update the pin in `map-server/regions.json` / `.env.example`, not in this doc) ·
`000` or a timeout = host or network. A `000` from inside the proxy environment too, with the
proxy itself answering fine (§ 5.2), is the host being down.

### 3.3 Why Geofabrik dates are the one thing that can silently break

Extract URLs are date-stamped: `iran-261018.osm.pbf` means 2026-10-18, it is not a version number.
Geofabrik keeps dated files for a rolling window, so a `pinned` snapshot stops resolving weeks later.
That failure is loud, and the remedy is one `.env` line: `MAP_SNAPSHOT=latest` means "the newest common
dated snapshot for all selected sources" (the resolver's own words) and **requires an online check** —
in offline mode it fails and tells you to use `pinned` or a specific date instead.
`MAP_SNAPSHOT=YYYY-MM-DD` asks for one date you chose. **Do not hand-edit an `md5` in
`map-server/regions.json`, or the `borobiya.source.json` manifest in the dataset directory, to make a
check pass** — the catalog is the reviewed pin and the manifest is the provenance record of what was
actually used; editing either is falsifying the build record.

### 3.4 Water polygons: the current outage and what the pipeline does about it

Step 9 stages these three layers with `fetch-planetiler-sources.sh` *before* it starts Java, so the
failure you see is a sentence and not a stack trace (on an older checkout, before that fetch
existed, it was Planetiler's own
`Could not download … from https://osmdata.openstreetmap.de/download/water-polygons-split-3857.zip`).
Either way **nothing in `borobiya/` is broken**: that host has been unreachable for the whole
Internet since 2026-10-22 (reported on community.openstreetmap.org), which is also why it must not
look like a proxy problem — § 5.2 item 2 answers that in one line.

What is *not* the answer:

- **`--water-polygons-url` pointed at Planetiler's own test fixtures.** Planetiler's README lists
  them, and `fetch-planetiler-sources.sh` will never offer them: they are Monaco-only sample data,
  so tiles for Iran would draw coastlines for a country it isn't in. The real failure mode is
  worse than missing polygons — the build succeeds and the ocean renders as land.
- **`--force` on the fetch script, or a bigger `--http_timeout`.** Neither changes a server that
  isn't answering, and the 10 s HEAD probe that decides "reachable" is hard-coded in Java.

What is:

1. **Retry later with `MAP_SOURCE_POLICY=cache-first`** (the default): a file that already
   verified is never re-fetched. If a previous run downloaded it, this step is a no-op.
2. **Stage the archive yourself**, then re-run step 9. Any readable file of the expected name in the
   source cache dir short-circuits the download — `fetch-planetiler-sources.sh` prints `cached` for it,
   and `generate-tiles.sh` points Java at that directory with `--download-dir`, so Planetiler never
   touches the network:

   ```bash
   mkdir -p "$HOME/.local/share/borobiya/map-library/planetiler-sources"
   curl -fL --retry 3 -C - -o "$HOME/.local/share/borobiya/map-library/planetiler-sources/water-polygons-split-3857.zip" \
     https://github.com/Commander-Cody/frasch-koord/releases/download/tile-sources-2026-09-30/water-polygons-split-3857.zip
   wc -c "$HOME/.local/share/borobiya/map-library/planetiler-sources/water-polygons-split-3857.zip"   # 929162760
   ```

   That release asset is a **third-party copy** (release `tile-sources-2026-09-30`, generated
   2026-09-14, same ODbL licence as upstream) — its size and download link were verified on
   2026-10-23. Nobody in this project maintains it: it is a stopgap for an upstream outage, not a
   source of record, and it is deliberately *not* wired into `fetch-planetiler-sources.sh` as a
   fallback URL. Its archive is unversioned upstream, so unlike the other sources there is no
   checksum of record for it — the only staleness signal is the SHA-256 the script prints.
3. **`MAP_SOURCE_POLICY=refresh`** re-downloads from the canonical URL once osmdata is back,
   replacing the staged copy. `MAP_SOURCE_POLICY=offline` is how you prove the library is
   self-sufficient (and it fails with the § A6 guide instead of touching the network).

---

## 4. Phase A — prepare the VM (one-time)

Run as your normal user; `sudo` only where shown. The only step that must be *first* is A0.

### A0. Reach the VM, and let SSH be installed

Why first: every other step is easier from a real terminal with copy-paste, and a build that
dies because a laptop lid closed is a build you re-run.

On the VM console (or the hypervisor's console window):

```bash
sudo apt update && sudo apt install -y openssh-server    # not in every image: the installer asks
sudo systemctl enable --now ssh                          # installing it does not start it; this does both
ip -4 addr show scope global                              # the VM's address, e.g. 192.168.105.179
```

From your workstation:

```bash
ssh-copy-id <your-user>@192.168.105.179   # optional, but it makes the 40-minute waits painless
ssh <your-user>@192.168.105.179 'echo ok; nproc; free -h | head -2; df -h /home'
```

The remote `echo ok` proves the key and the login work; `nproc` should be **4**, `free -h`
should show ≈**6 Gi** total and ≥**2 Gi** available, `df -h` should show **≥15 GB free** on the
filesystem holding `/home` (that is where the map library lives). If the floor is not met, § A4
tells you what to delete; do not start the imports anyway — a disk that fills mid-import leaves a
truncated archive that the next run must re-download.

If a firewall is on (check with `sudo ufw status`), port 22 needs to be allowed on the VM:
`sudo ufw allow 22/tcp` — and nothing else; the map services in step 12 bind to `127.0.0.1` only.

### A1. Update Ubuntu

```bash
sudo apt update            # refresh the package index only; nothing is installed or upgraded
sudo apt -y upgrade        # security updates (takes a while, but do it)
```

Use `apt update`, not just `apt upgrade`: if A2 needs to *add* a source, `apt update` is where
that source's packages become visible.

### A2. Docker Engine + Compose v2 (from the official Docker repository)

The Ubuntu `docker.io` package works but is older and can lack Compose v2 features, so install
Docker's own repository. One command, from Docker's official docs — use the URL as published
there rather than copying one from a blog:

```bash
curl -fsSL https://get.docker.com -o /tmp/get-docker.sh    # fetch the installer
less /tmp/get-docker.sh                                     # read it (it only adds an apt source + installs)
sudo sh /tmp/get-docker.sh                                  # run it
```

To do the same by hand (identical result, and it is what the script does):

```bash
sudo apt remove -y docker docker-compose docker-compose-plugin docker.io 2>/dev/null || true
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /tmp/docker.gpg   # fetch, don't pipe a key into apt
sudo gpg --dearmor < /tmp/docker.gpg > /etc/apt/keyrings/docker.gpg && rm -f /tmp/docker.gpg   # gpg needs stdin
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(grep VERSION_CODENAME /etc/os-release | cut -d'"' -f2) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker        # or: log out and back in
```

Two traps, both of which look like "the script is broken":

- **Never `curl … | sudo apt-key add -`.** `apt-key` is removed in recent Ubuntu; the `tee` of the
  key file is what the runbook does instead. `gpg` reads from stdin — it has no `--dearmor` flag.
- **Docker's groups don't apply to an existing shell.** If you skipped `newgrp docker` and re-run
  `setup-ubuntu-vm.sh`, it reports `Docker daemon unreachable (is your user in the docker group?)`
  even though `groups` prints `docker`. The group change applies to a *new* login — a new SSH
  session, or (inside a hypervisor console with no login to reopen) `exec sg docker "$SHELL"`
  followed by `exit` + re-login when you can. `docker run --hello-world` printing `permission
  denied … docker.sock` means exactly this and nothing else.

Verify — all three must pass:

```bash
docker --version && docker compose version          # client + the compose v2 plugin
docker info --format '{{.ServerVersion}} {{.NCPU}} CPUs {{.MemTotal}} bytes'   # daemon reachable
docker context ls                                    # should be `default` → unix:///var/run/docker.sock
```

The Compose file also **pins the project to subnet `172.30.0.0/24`** so Fastify can trust
`X-Forwarded-For` from Nginx's exact container address. If that subnet is already taken
(`docker network ls`, `ip route`), a fresh `docker compose up` fails with `Pool overlaps with
other one(s)` and no service starts; change the subnet and `TRUSTED_PROXY_IPS` **together** in
`docker-compose.yml` and `.env`.

### A3. Toolchain: Java 21, Bun, Osmium, git, curl, wget, unzip, openssl, Python, SSH

```bash
sudo apt install -y openjdk-21-jdk-headless osmium-tool git curl wget unzip ca-certificates openssl python3 openssh-server
```

| Package | Why this runbook needs it |
| --- | --- |
| `openjdk-21-jdk-headless` | Planetiler's JAR needs Java **21+** (step 9). Headless = no X dependencies on a server. |
| `osmium-tool` | The boundary crop in step 8. Ubuntu 24.04 provides **1.16.0**, which is what `.env.example` pins (`MAP_OSMIUM_VERSION=1.16.0`). |
| `git` | Clone and update the repo (A5), and every `git log`/`git diff` a developer runs afterwards. |
| `curl` | Every download in steps 7–11 (`fetch-planetiler-sources.sh`, `prepare-regions-pbf.sh`, `download-photon.sh`) and the `verify-*.sh` HTTP checks. |
| `wget` | Kept because `setup-ubuntu-vm.sh` checks for it; the scripts themselves use `curl`. |
| `unzip` | The Bun zip below, and Planetiler's reference-layer archives. |
| `ca-certificates` | TLS for every HTTPS download; missing it turns `curl` failures into certificate errors. |
| `openssl` | Secret generation in A6 (`openssl rand -hex 32`) — the setup script needs it too. |
| `python3` | `map-server/scripts/regions.py` (selection, manifest, provenance) and `scripts/clear-map-cache.py`. |
| `openssh-server` | A0. Install it before you need it; after a 40-minute build you do not want to be back at the hypervisor console. |

Then **Bun**, pinned to the version the repository declares instead of "latest":

```bash
BUN_VERSION="v$(python3 -c 'import json;print(json.load(open("package.json"))["packageManager"].split("@")[1])')"
echo "installing Bun $BUN_VERSION"                       # 1.4.3 today, from package.json's packageManager field
arch=$([ "$(uname -m)" = x86_64 ] && echo x64 || echo aarch64)
grep -q avx2 /proc/cpuinfo || echo "NOTE: no AVX2 on this CPU — use the -baseline zip instead"
curl -fL --retry 3 -o /tmp/bun.zip \
  "https://github.com/oven-sh/bun/releases/download/bun-$BUN_VERSION/bun-linux-$arch.zip"
unzip -o /tmp/bun.zip -d /tmp && sudo install -m 0755 /tmp/bun-linux-$arch/bun /usr/local/bin/bun && rm -rf /tmp/bun.zip /tmp/bun-linux-$arch
bun --version
```

Why Bun is in the list at all: the API container has its own Bun baked into its image, so the map
stack works without it — but every command in `docs/DEVELOPMENT.md` that you will type on the host
(`bun install`, `bun run dev`, `bunx vitest run`, `bunx tsc --noEmit`) needs it, and a missing Bun
on a fresh VM is discovered at the worst possible moment (after the imports). It is **not**
required by `scripts/setup-ubuntu-vm.sh`, whose own prerequisite check looks for
`docker git curl wget python3 openssl java osmium` and stops if any is missing — that list is why
this step exists.

Ubuntu's `curl -fsSL https://bun.sh/install | bash` also works and installs the newest release; the
zip above is documented because it is pinned, auditable (a GitHub release asset), and needs no
shell-pipe-to-bash.

### A4. Preflight: tool versions against *this checkout's* pins, plus capacity

Do not trust this document's version numbers: read them out of the checkout and compare them with
what is installed. Paste the whole block. The first three lines are what the repository demands; the
next seven are what the machine has; the last six are the capacity floors this runbook sets (≥ 15 GiB
free, ≥ 50 000 free inodes, Java ≥ 21, osmium == the pin). Read them as pairs: a pin and a value that
do not match is the thing to fix *now*, not in step 9.

```bash
cd ~/borobiya
# Pins, read from the files that are the source of truth (.env.example carries the data pins; the
# two JAR versions live inside the scripts that fetch them; the images live in the compose file):
grep -E '^(MAP_OSMIUM_VERSION|MAP_SNAPSHOT|MAP_SNAPSHOT_DATE|MAP_SOURCE_POLICY|MAP_REGION_IDS|MAP_BBOX|MAP_SERVER_URL|PLANETILER_HEAP|OSRM_BUILD_THREADS|PHOTON_JAVA_TOOL_OPTIONS)=' .env.example
grep -n 'PLANETILER_VERSION=\|PHOTON_VERSION=' map-server/scripts/generate-tiles.sh map-server/scripts/download-photon.sh
grep -n 'image:' docker-compose.yml
grep -n '"packageManager"' package.json
# What is actually installed:
java -version 2>&1 | head -1            # must be 21 or newer
osmium --version | head -1              # must match MAP_OSMIUM_VERSION above
bun --version; git --version; curl --version | head -1; wget --version | head -1 | cut -d' ' -f1-3
python3 --version; openssl version; unzip -v | head -1 | awk '{print $2}'
docker --version; docker compose version
systemctl is-active ssh                 # active
# Capacity floors for this VM (15 GiB free / 50k inodes on the library filesystem, 6 GiB RAM):
df -h --output=source,size,used,avail,pcent,target "${HOME}"          # Avail must be >= 15G
df -i "${HOME}" | tail -1                                              # IUsed% near 100 (or < 50k free) aborts imports
free -g | awk '/Mem:/ {print "total GiB: "$2"  available GiB: "$7}'
DOCKER_ROOT="$(docker system info --format '{{.DockerRootDir}}' 2>/dev/null)"   # empty = daemon unreachable (A2's docker-group note)
printf 'Docker data-root: %s  storage: %s\n' "${DOCKER_ROOT:-unknown}" "$(docker system info --format '{{.Driver}}' 2>/dev/null)"
df -h "${DOCKER_ROOT:-/var/lib/docker}" | tail -1                       # images: ~2.3 GB before step 12
df -h "$(pwd)" | tail -1                                                # the repo itself is small; downloads land in the library, not here
```

What each answer means:

- **`osmium --version` differs from `MAP_OSMIUM_VERSION`** → edit `.env` to the version you have
  (A6 does this for you only if you ran the setup script). Step 8 refuses to run on a mismatch,
  and `verify-map-pbf.sh` then reports the not-yet-created crop as "missing" — the error chain is
  confusing, the fix is one line in `.env`.
- **Docker's data-root is on a different filesystem than `~`** → the "15 GiB free" number must be
  met on **both**. Images and build layers live under the data-root, datasets under `~`.
- **`docker system df -v` shows hundreds of MB of old build cache** and space is tight →
  `docker builder prune -f` is safe (build layers only, never volumes; a rebuild just re-downloads
  image layers). `docker system prune -a` is **not** safe here: it deletes the pulled images and
  the locally built `borobiya/photon:1.3.0`, which step 11 cannot re-fetch from any registry.
- **Java older than 21** → Planetiler's JAR fails at class loading with an
  `UnsupportedClassVersionError`, not with a helpful message.

### A5. Get the code, and prove the pipeline files are in it

The branch is yours to choose — this runbook deliberately does not name one, because a runbook
that says "check out the feature branch" is wrong the day that branch merges. If you are setting up from a
release/tag/branch someone told you to use, use that; the pipeline files below must exist in
whatever you check out.

```bash
cd ~
git clone <your-repo-url> borobiya && cd borobiya      # first time only
git fetch && git status                                 # afterwards: what is this checkout at?
# Fail fast if this checkout has no map pipeline (a missing script used to surface 40 minutes into an import):
missing=0
for f in map-server/scripts/fetch-planetiler-sources.sh map-server/scripts/prepare-regions-pbf.sh \
         map-server/scripts/generate-tiles.sh map-server/scripts/build-routing.sh \
         map-server/scripts/download-photon.sh map-server/scripts/regions.py \
         map-server/scripts/verify-map-pbf.sh map-server/scripts/verify-tiles.sh \
         docker-compose.yml map-server/regions.json .env.example; do
  [ -f "$f" ] || { echo "MISSING in this checkout: $f"; missing=1; }
done
[ "$missing" = 0 ] && echo "PREFLIGHT OK — $(git rev-parse --short HEAD)"
```

Record that commit in your acceptance notes (§ 6.7). Do **not** `git pull` between steps 9 and 12
of a run: `docker-compose.yml` mounts, image pins and script arguments move together, and a
half-updated pipeline is the classic "it worked ten minutes ago".

### A6. Configure `.env`: secrets, area, snapshot policy, library location

```bash
cd ~/borobiya
cp -n .env.example .env
# Generate every secret once. Never reuse one, and never commit the result.
for KEY in NOMINATIM_PASSWORD POSTGRES_PASSWORD JWT_SECRET JWT_REFRESH_SECRET; do
  grep -q "^$KEY=" .env || printf '%s=\n' "$KEY" >> .env
  NEW=$(openssl rand -hex 32)
  TMP=$(mktemp); sed "s|^$KEY=.*|$KEY=$NEW|" .env > "$TMP" && mv "$TMP" .env
done
# The app database URL must carry the same password as POSTGRES_PASSWORD:
PGPASS=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)
TMP=$(mktemp); sed "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://borobiya:$PGPASS@localhost:5432/borobiya|" .env > "$TMP" && mv "$TMP" .env
# then the loader block (§ 2.1), and a one-line proof that all four secrets are non-empty:
grep -E '^(JWT_SECRET|JWT_REFRESH_SECRET|POSTGRES_PASSWORD|NOMINATIM_PASSWORD)=' .env | awk -F= 'length($2)>20 {n++} END {print n" of 4 secrets look real"}'
```

`POSTGRES_PASSWORD` and `NOMINATIM_PASSWORD` are written **once**: the volumes keep whatever they
were initialized with, so changing them later makes the containers fail authentication while
`.env` still looks correct (see § 9). The same block is what `setup-ubuntu-vm.sh` does
automatically; the `-n` on `cp` and the `grep -q` guards mean running it again never overwrites a
secret you already generated.

Then run the loader block from § 2.1 — it is also the cheapest proof that the file parses and that
the selection you wrote is the selection the pipeline will use.

Area selection is a form, not a guess. `map-server/regions.json` is the catalog; `regions.py` is
the only thing allowed to interpret it:

```bash
python3 map-server/scripts/regions.py list                       # every selectable area, with its id
python3 map-server/scripts/regions.py resolve "$MAP_REGION_IDS"  # what that selection means, as KEY='value' lines
python3 map-server/scripts/regions.py sources "$MAP_REGION_IDS"  # every source file that will be fetched, and from where
```

`resolve` prints the same `KEY='value'` lines the loader block `eval`s; `list` and `sources` are for
reading, not sourcing. To change the areas from the command line (this is what the interactive form
in `setup-ubuntu-vm.sh` writes into `.env` for you):

```bash
TMP=$(mktemp); sed 's|^MAP_REGION_IDS=.*|MAP_REGION_IDS=ir-tehran,ir-qom|' .env > "$TMP" && mv "$TMP" .env
# then the loader block again, and read back what it resolved:
echo "$MAP_REGION_IDS | $UNION_BBOX | $SNAPSHOT_DATE | "$([ "$APPROX_DOWNLOAD_SIZE_UNKNOWN" = 1 ] && echo 'size unknown' || echo "~$APPROX_DOWNLOAD_MB MB to download")
```

Four `.env` keys decide where files go and how much RAM the build uses; they are read by
`fetch-planetiler-sources.sh` and `generate-tiles.sh` in both modes, so they must be exported in
**every** terminal (that's `set -a; source .env; set +a`; the setup script does it itself). Leave
the path keys blank unless you need to move data off the VM disk:

| Key | Default when blank | Set it when |
| --- | --- | --- |
| `MAP_LIBRARY_DIR` | `~/.local/share/borobiya/map-library` | the library must live on a bigger volume |
| `MAP_PLANETILER_SOURCES_DIR` | `$MAP_LIBRARY_DIR/planetiler-sources` | you want to stage the reference layers from a copy (step 7, § 3.4) |
| `MAP_SNAPSHOT` | `pinned` | you want `latest` or a specific `MAP_SNAPSHOT_DATE=YYYY-MM-DD` |
| `MAP_SOURCE_POLICY` | `cache-first` | `refresh` to force re-download, `offline` to prove self-sufficiency |

**Write the resolved paths back into `.env` once, before step 11/12** (the setup script does this for
you). Compose interpolates `${MAP_DATASET_DIR}` and `${MAP_PHOTON_DATA_DIR}` from the *file*, not from
your loaded shell, so a blank value there means Nominatim and Photon are pointed at
`.compose-unconfigured/…` placeholder directories on purpose rather than at the wrong data:

```bash
for K in MAP_LIBRARY_DIR MAP_DATASET_DIR MAP_DATA_DIR MAP_PBF MAP_OSRM_DATA_DIR MAP_PHOTON_DATA_DIR MAP_BBOX MAP_DATA_VERSION; do
  V="${!K-}"
  [[ -n "$V" ]] || { echo "skip $K (empty in this shell — run the loader block first)"; continue; }
  TMP=$(mktemp); grep -v "^$K=" .env > "$TMP"; printf '%s=%s\n' "$K" "$V" >> "$TMP"; mv "$TMP" .env
done
grep -E '^MAP_(LIBRARY_DIR|DATASET_DIR|DATA_DIR|PBF|OSRM_DATA_DIR|PHOTON_DATA_DIR|BBOX|DATA_VERSION)=' .env
```

Those lines are re-derived on every run of the resolver, which is what keeps a changed
`MAP_REGION_IDS` from leaving a stale dataset path behind in the file the containers read.

Also in `.env.example`, and worth knowing before step 9 on a small VM: `PLANETILER_HEAP=3g`,
`OSRM_BUILD_THREADS=2`, `OSRM_RUNTIME_THREADS=1`, `NOMINATIM_THREADS=2`,
`PHOTON_JAVA_TOOL_OPTIONS="-Xms256m -Xmx1536m"`, `MAP_PHOTON_DATA_DIR`, `MAP_OSRM_DATA_DIR`,
`PHOTON_DEFAULT_LANGUAGE=fa`, `MAP_PBF`, `MAP_DATA_VERSION` (the last two normally left to the loader
block, which derives them for the current selection).
`MAP_PBF` is **derived** by `eval "$(python3 map-server/scripts/regions.py resolve)"`; if a step
complains about an empty path, that line is missing from your shell, not from `.env`.

---

## 5. Network proxy (only if downloads fail)

The whole stack runs **offline** once built. The internet is needed only for steps 7–12 (apt,
`docker pull`, and the dataset, JAR and reference-layer downloads). If the VM has no direct
route, the only fix is a proxy — and a wrong proxy is worse than no proxy, because every failure
then looks like a broken link. So: set it, **prove it works**, and remove it afterwards.

The `192.168.x.x` examples below are VMware NAT with the VM inside the host's own NAT block.
Discover the gateway instead of assuming one — on the VM, `ip route show default` prints it in the
`via` field, and your workstation *is* the host:

```bash
PROXY_HOST="$(ip route show default | awk '{print $3; exit}')"
echo "host address: $PROXY_HOST"
```

If `ip route` prints no `via`, the VM has a direct route and you should not configure a proxy. If
your host's IP is not in `ip addr show` (bridged VM, separate LAN), use that host's LAN IP and
open the port in the host firewall — VMware's own NAT device will not forward it. If the proxy
needs authentication, URL-encode the credentials
(`http://user%40corp:p%40ss@$PROXY_HOST:3128` — `@` and `:` both become `%40`/`%3A`).

### 5.1 Set it for the terminal (covers `apt`, `curl`, `wget`, `git` and the download scripts)

```bash
export http_proxy="http://$PROXY_HOST:3128" https_proxy="http://$PROXY_HOST:3128" no_proxy="localhost,127.0.0.1,::1,172.30.0.0/24"
export HTTP_PROXY="$http_proxy" HTTPS_PROXY="$https_proxy" NO_PROXY="$no_proxy"
printf 'export http_proxy="http://%s:3128" https_proxy="http://%s:3128" no_proxy="localhost,127.0.0.1,::1,172.30.0.0/24"\n' "$PROXY_HOST" "$PROXY_HOST" >> ~/.bashrc
printf 'export HTTP_PROXY="$http_proxy" HTTPS_PROXY="$https_proxy" NO_PROXY="$no_proxy"\n' >> ~/.bashrc
```

`no_proxy` must cover the pinned `172.30.0.0/24` Docker subnet and loopback, or every local
`curl` health check and verification in steps 12–13 goes out to the proxy and comes back refused.
Note that the exported values only affect **new** processes you start; an already-running
`setup-ubuntu-vm.sh` will not pick them up.

### 5.2 Verify that the proxy itself works

```bash
# 1. What does this shell think its proxy is? (empty = exports not loaded in THIS terminal)
env | grep -iE '^(http|https|no)_proxy=' || echo "no proxy in this shell"
# 2. Direct egress: does the VM reach the internet without the proxy? (000/timeout = needs it)
curl --noproxy '*' -sS --max-time 10 -o /dev/null -w 'direct: %{http_code}\n' https://github.com/ || echo "direct: failed"
# 3. Through the proxy: the proxy must answer, and curl must name the proxy it used (curl >= 8.3)
curl -sS --max-time 15 -o /dev/null -w 'proxied: %{http_code} via %{proxy_addrs}\n' https://github.com/
# 4. The real targets, in order: apt, GitHub releases, Geofabrik
curl -sS --max-time 15 -o /dev/null -w 'docker apt repo: %{http_code}\n' https://download.docker.com/linux/ubuntu/dists/noble/Release
curl -sS --max-time 15 -o /dev/null -w 'planetiler jar: %{http_code}\n' -L https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar
curl -sS --max-time 15 -o /dev/null -w 'geofabrik: %{http_code}\n' -I https://download.geofabrik.de/
# 5. Do apt and Docker agree with the shell? (these are three separate proxy settings)
sudo apt-get -o Debug::Acquire::http=true download ca-certificates 2>&1 | grep -i proxy | head -3
apt-config dump | grep -iE 'Acquire::.*Proxy' || echo "apt: no proxy configured (uses the shell env only when sudo passes it)"
docker info 2>/dev/null | grep -i -A2 proxy || echo "docker daemon: no proxy"
systemctl show docker --property=Environment | tr ' ' '\n' | grep -i proxy || echo "docker systemd env: no proxy"
# 6. Does a *container* have egress? Images are pulled by the daemon, not by curl.
docker run --rm alpine:3 sh -c 'apk update >/dev/null 2>&1 && echo "container: ok" || echo "container: FAILED (daemon needs its own proxy)"'
```

Read it as a decision table: **200** = the path works. **`000`** with the same result through and
around the proxy = that host is down or unreachable from here (try § 3.2's site-root check before
touching proxy settings). **407** = proxy needs credentials. **502/504** = the proxy could not
reach the target — usually the target is gone (a moved release tag) or the proxy blocks that
port. `no proxy in this shell` while your curl calls still work = the exports live in a different
session; re-source `~/.bashrc` (`set -a; source .env; set +a` does **not** restore proxy vars).
Item 6 is the one that surprises people: `docker pull` failing while `curl` is fine means the
**daemon** has no proxy (§ 5.3).

### 5.3 apt and Docker (only if step 2/6 above failed)

```bash
# apt (system-wide; a per-command -o Acquire::http::Proxy="…" also works):
printf 'Acquire::http::Proxy "http://%s:3128";\nAcquire::https::Proxy "http://%s:3128";\n' "$PROXY_HOST" "$PROXY_HOST" | sudo tee /etc/apt/apt.conf.d/95proxy
# Docker daemon — systemd does not read your shell environment, so it needs a drop-in:
sudo mkdir -p /etc/systemd/system/docker.service.d
printf '[Service]\nEnvironment="HTTP_PROXY=http://%s:3128"\nEnvironment="HTTPS_PROXY=http://%s:3128"\nEnvironment="NO_PROXY=localhost,127.0.0.1,172.30.0.0/24"\n' "$PROXY_HOST" "$PROXY_HOST" | sudo tee /etc/systemd/system/docker.service.d/proxy.conf
sudo systemctl daemon-reload && sudo systemctl restart docker
```

A **restart of Docker takes the running stack with it** — do it before step 12, or re-run
`docker compose up -d` afterwards. If a pull still fails, also check for a stale
`~/.docker/config.json` proxy block and `~/.wgetrc`.

**No JVM proxy flags are needed.** Step 9 fetches the reference layers with `curl` (the fetch
script) and hands Java a `--download-dir` that is already populated, so Planetiler issues no request
at all. A future Planetiler bump that adds a fourth source changes that, and then the Java
downloader's own `-Dhttps.proxyHost=… -Dhttps.proxyPort=…` (plus the `http.` pair) is what applies.

### 5.4 Remove it

```bash
sed -i '/PROXY_HOST\|_proxy\|_PROXY/d' ~/.bashrc      # drop the two lines added above
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY
sudo rm -f /etc/apt/apt.conf.d/95proxy /etc/systemd/system/docker.service.d/proxy.conf
sudo systemctl daemon-reload && sudo systemctl restart docker
```

The removal of the apt/systemd files is only safe if the system-wide proxy was **not** set
elsewhere — check `systemctl show docker --property=Environment` before you delete the drop-in, or
you will break the daemon's real configuration. Verify the removal with § 5.2 item 2 (`direct: 200`).

---

## 6. Phase B — the data pipeline

Every step here assumes: the code is in `~/borobiya` (A5), `.env` is written (A6), and **this
terminal has run the loader block (§ 2.1)**. Step 7 is optional (step 9 runs it for you); steps
8 → 13 are the order.

### 6.1 Step 7 — Pre-download the big files (optional, but the friendliest way to meet a broken link)

Steps 8 and 9 download what they need, verify it, and cache it. Doing it one step earlier is only
worth it on a slow or proxyed link, or when you want the failure to be a single sentence before any
long build starts. Both parts below are skip-if-verified: re-running them after a successful build
fetches nothing.

**7a. The Geofabrik extracts your selection needs.** Get the exact URLs and library paths from the
resolver — never from this document:

```bash
python3 map-server/scripts/regions.py sources "$MAP_REGION_IDS" \
  --snapshot "${MAP_SNAPSHOT_DATE:-pinned}" --library "$MAP_LIBRARY_DIR"
```

For the default pinned selection that is `iran-261018.osm.pbf` (229,852,435 bytes, MD5
`a23eb2f21e426677bd243b2712ec1bc8`). With `wget` a stalled transfer is resumable, which the scripts'
`curl` handles only with retries:

```bash
SOURCE_PATH="$MAP_LIBRARY_DIR/sources/asia/ir/iran/2026-10-18/iran-261018.osm.pbf"
mkdir -p "$(dirname "$SOURCE_PATH")"
(cd "$(dirname "$SOURCE_PATH")" && wget --continue https://download.geofabrik.de/asia/iran-261018.osm.pbf)
wget -O "$SOURCE_PATH.md5" https://download.geofabrik.de/asia/iran-261018.osm.pbf.md5
(cd "$(dirname "$SOURCE_PATH")" && md5sum -c "$(basename "$SOURCE_PATH").md5")   # expect `…osm.pbf: OK`
```

A pre-downloaded file whose MD5 differs from the catalog pin or the official sidecar is **rejected
by step 8** — delete it and re-download; never edit a checksum to accept unverified bytes. Source
sizes the catalog does not know are reported as *unknown* rather than as zero, so the setup plan
cannot hide a huge download from you.

**7b. The three global reference layers (≈1.3 GB, once per library).** `fetch-planetiler-sources.sh`
downloads and SHA-256-verifies Natural Earth, the lake centerlines and the water-polygons split —
the layers Planetiler needs next to your dataset — into `$MAP_PLANETILER_SOURCES_DIR`:

```bash
cd ~/borobiya
./map-server/scripts/fetch-planetiler-sources.sh
```

**Good output (7b).** one line per source, each ending `cached` (already present, nothing fetched)
or `verified` (downloaded now, with its SHA-256 and byte count); `ls -l` of the directory then shows
`natural_earth_vector.sqlite.zip`, `lake_centerline.shp.zip` and
`water-polygons-split-3857.zip`. An **exit 1 with a guide** names which source could not be fetched
and the override variable that fixes it (`MAP_NATURAL_EARTH_URL`, `MAP_LAKE_CENTERLINES_URL`,
`MAP_WATER_POLYGONS_URL` — all three also in `.env.example`, blank by default).

**Redo just this step.** 7a: delete the named file and step 8 re-downloads and re-verifies it. 7b:
`rm` the one file, or `MAP_SOURCE_POLICY=refresh ./map-server/scripts/fetch-planetiler-sources.sh`
for all three. Both are cheap; nothing downstream is invalidated.

### 6.2 Step 8 — Crop and merge the selected areas into one dataset PBF

`$MAP_LIBRARY_DIR`, verifying each file's MD5 against `map-server/regions.json`); crops every city
area with `osmium extract --strategy=smart --bbox=…` (a whole-country area is used as-is); merges the
selection into one shared dataset PBF at `$MAP_PBF`; and writes the full provenance chain — source,
crop and merged SHA-256s plus library-relative paths — to `borobiya.source.json`. Planetiler, all
three OSRM profiles and Nominatim must later be fed **this exact file**, which is why re-cropping is
a cheap, checkable operation and picking a *different* file for one of them is a silent mismatch.

```bash
cd ~/borobiya
# (the loader block, § 2.1) then prove the pinned and installed Osmium agree before a long job:
osmium --version | head -n1
echo "pinned: MAP_OSMIUM_VERSION=$MAP_OSMIUM_VERSION"
./map-server/scripts/prepare-regions-pbf.sh
```

If the two version lines disagree, fix `.env` (`MAP_OSMIUM_VERSION=<installed>`) and reload before
continuing — the script refuses to run otherwise, and the failure shows up later as a confusing
"dataset PBF is missing" from the verifier (§ 9.1).

**Check.** After it prints `Prepared shared dataset PBF: …`:

```bash
./map-server/scripts/verify-map-pbf.sh "$MAP_PBF"
```

Expect e.g. `OK: …/borobiya.osm.pbf matches areas ir-tehran bbox [51.0, 35.5, 51.7, 35.9] snapshot
2026-10-18 (SHA-256 …)` — areas, bbox and snapshot follow your selection.

**Redo just this step.** Re-running is a fast no-op (`Dataset already prepared`). Changing
`MAP_REGION_IDS` re-merges from cached downloads/crops. `MAP_CROP_OVERWRITE=1` is only for
replacing a stray dataset PBF that has no provenance manifest — inspect `$MAP_DATASET_DIR` first.

### 6.3 Step 9 — Generate the vector tiles (PMTiles)

**What it does.** `generate-tiles.sh` verifies/downloads Planetiler `0.10.2`, runs the fetch script
from step 7 itself (so a source-host failure is a sentence, not a stack trace), then builds
`$MAP_DATA_DIR/borobiya.pmtiles` plus its build metadata over `MAP_BBOX` (derived from the selection
by the loader block) at zoom 0–14.

```bash
PLANETILER_HEAP=3g ./map-server/scripts/generate-tiles.sh
```

`PLANETILER_HEAP` becomes `-Xmx`; `3g` is the tuned default for a 6 GiB VM (also in
`.env.example`, so you can omit the prefix). **Do not raise it after an OOM kill** — stop, and look
at `free -h` and the last log lines first; on this machine the heap has to share RAM with the page
cache and the Docker daemon.

**Expected output.** `Generating <…>/borobiya.pmtiles (version <snapshot date>, zoom 0-14, bbox
<union bbox>) from <…>/borobiya.osm.pbf`, then Planetiler's per-stage progress, then `Wrote build
metadata …`. 30–50 minutes for the default Tehran selection (longer for a whole country).

**Check.**

```bash
./map-server/scripts/verify-tiles.sh            # exit 0 = archive readable + metadata matches this selection
ls -lh "$MAP_DATA_DIR/borobiya.pmtiles" "$MAP_DATA_DIR/borobiya.metadata.json"
```

**Redo just this step** — the PMTiles file and its metadata are the only outputs; the dataset PBF
and the reference layers are untouched, so a re-run costs build time only:

```bash
rm -f -- "$MAP_DATA_DIR/borobiya.pmtiles" "$MAP_DATA_DIR/borobiya.metadata.json"
PLANETILER_HEAP=3g ./map-server/scripts/generate-tiles.sh
```

**If it fails.** `Could not download …`/`Could not HEAD …` for a reference layer → § 3.4.
`UnsupportedClassVersionError` → Java < 21 (A3). `OutOfMemoryError` or the process simply vanishing
→ heap vs free RAM (`free -h`); re-run, it resumes from its own `.pmtiles` temp dir being discarded.
`Map data file … does not exist` → step 8 never succeeded.

### 6.4 Step 10 — Build the OSRM road graphs (car, bicycle, foot)

**What it does.** `build-routing.sh` runs, **sequentially**, each profile's `extract →
partition → customize` inside disposable `docker run --rm` containers using the pinned
`ghcr.io/project-osrm/osrm-backend:v26.10.0-debian` image, and records the dataset PBF hash with
the result. Never concurrent by design: three graph builders on 4 vCPU/6 GiB swap each other to
death.

```bash
OSRM_BUILD_THREADS=2 ./map-server/scripts/build-routing.sh
```

**Expected output.** for each of `car`, `bicycle`, `foot`: `extracting` → `partitioning` →
`customizing`, then the graph files. 25–45 minutes total for the default selection.

**Check.**

```bash
ls -lh "$MAP_OSRM_DATA_DIR"/{car,bicycle,foot}/*.osrm*      # four+ files each profile
```

**Redo just this step.** `rm -rf -- "$MAP_OSRM_DATA_DIR"/{car,bicycle,foot}` then re-run the
command (each profile is ~30–60% of the dataset size — that is the disk to reclaim if you only
need `car`). If you changed the area selection since a previous build, the script **refuses** to
reuse non-empty profile directories: move `$MAP_OSRM_DATA_DIR/{car,bicycle,foot}` aside first (the
setup script does this for you, and prunes them after acceptance).

### 6.5 Step 11 — Geocoding: Photon JAR, Nominatim import, Nominatim → Photon

Three sub-parts, in this order, and the two imports are the slowest thing in this runbook (hours
for a country; the setup script prints the same warning).

**11a. The Photon JAR** (pinned in `.env.example`, from a GitHub release asset — § 3.1 row 6):

```bash
./map-server/scripts/download-photon.sh      # -> map-server/photon/photon-1.3.0.jar + .sha256 verify
```

Skip-if-present; it prints the path it kept. Redo: `rm map-server/photon/photon-1.3.0.jar`.

**11b. Nominatim import** (starts only the one-shot import service, profile `geocoding-import`):

```bash
docker compose --profile geocoding-import up -d nominatim
docker compose --profile geocoding-import ps nominatim                  # poll this, don't restart it
docker compose --profile geocoding-import logs --tail=100 nominatim     # the first real error, if any
```

Wait for `healthy`. The first start imports the shared dataset PBF into the `nominatim-data` volume,
and the service's healthcheck (`curl …/status?format=json`, `start_period: 60m`, 40 retries) gives it an
hour before it starts complaining — expect a long `health: starting` phase, and treat that as progress,
not as a hang. What actually decides "done" is Nominatim's own `import finished` marker in the volume;
the healthcheck only reflects it. **Do not restart it** while it is importing, and do not read a
`Restarting` state as "still working": that is a crash loop, and § 9.2 covers the one known cause in old
checkouts (`chown: Read-only file system`).

Two Compose details decide whether this import can even see your data, and both read **`.env`, not your
shell**: the dataset directory is mounted read-only at `/osm` from `${MAP_DATASET_DIR}` with
`PBF_PATH=/osm/${MAP_REGION}.osm.pbf` (so a blank `MAP_DATASET_DIR` in `.env` falls back to the
`.compose-unconfigured/dataset` placeholder and the import finds no file), and
`NOMINATIM_PASSWORD` is what the database is created with (§ A6's write-back). The tunables are
`NOMINATIM_IMPORT_STYLE` (default `full`), `NOMINATIM_THREADS=2`, `NOMINATIM_SHM_SIZE=1g` and the four
`NOMINATIM_POSTGRES_*` memory values in `.env.example` — they exist because this import is the single
heaviest thing in the runbook on a 6 GiB VM.

**11c. Photon index**, run on the host against Nominatim's database while Nominatim keeps running.
`-languages` must cover every selected country plus `en`, and `regions.py resolve "$MAP_REGION_IDS"` is
what prints the exact value (as `PHOTON_LANGUAGES`: Tehran-only `fa,en`, Tehran+Frankfurt `fa,de,en`).
The line below keeps a `fa,en` fallback only so a terminal that skipped the loader block cannot import
*every* language Photon knows about — a far bigger index for the same streets:

```bash
cd ~/borobiya
# the loader block (§ 2.1) — MAP_PHOTON_DATA_DIR, MAP_PBF and PHOTON_LANGUAGES come from it
[[ -n "${NOMINATIM_PASSWORD:-}" ]] || { echo 'NOMINATIM_PASSWORD is empty in .env' >&2; exit 1; }
mkdir -p "$MAP_PHOTON_DATA_DIR"
( cd "$MAP_PHOTON_DATA_DIR" && java -Xms512m -Xmx2g -jar "$OLDPWD/map-server/photon/photon-1.3.0.jar" import \
    -host 127.0.0.1 -port "${NOMINATIM_DB_PORT:-5433}" \
    -database nominatim -user nominatim -password "$NOMINATIM_PASSWORD" \
    -languages "${PHOTON_LANGUAGES:-fa,en}" )
sha256sum "$MAP_PBF" | awk '{print $1}' > "$MAP_PHOTON_DATA_DIR/.borobiya-pbf.sha256"
```

The password guard is not decoration: Photon reads the *persistent* Nominatim database, and a
`.env` that drifted from the password stored in that volume fails with
`FATAL: password authentication failed for user "nominatim"` (§ 9.2). The final `sha256sum` line is
what makes later runs skip a re-import for the same dataset — the setup script compares the same
stamp.

**Check + finish.** Then free the RAM Nominatim was using; its volume and the index stay:

```bash
ls -d "$MAP_PHOTON_DATA_DIR/photon_data" && echo "index present"
du -sh "$MAP_PHOTON_DATA_DIR" "$MAP_DATASET_DIR"          # what the index and dataset cost on disk
docker volume ls --filter 'label=com.docker.compose.volume=nominatim-data'   # the DB volume Compose created
./map-server/scripts/verify-geocoding.sh                  # run after step 12, which is when it can pass
docker compose --profile geocoding-import stop nominatim
```

`docker compose stop` (not `down`) keeps the volume; the service is a one-shot importer and must not
run alongside the serving stack on a 6 GiB VM. Two facts about the *serving* side worth knowing now,
because both look like failures later: the Photon container mounts `$MAP_PHOTON_DATA_DIR` and starts
with `-default-language $PHOTON_DEFAULT_LANGUAGE` (`fa`), and its healthcheck probes `/status` over
`/dev/tcp` with `start_period: 30s` and 12 retries — an index that needs a minute to open is normal.
An `unhealthy` Photon after two minutes usually means the mount is not what you think: with
`MAP_PHOTON_DATA_DIR` blank and no library default, Compose aims it at the
`.compose-unconfigured/photon` placeholder, which is deliberately empty rather than silently wrong.

### 6.6 Step 12 — Start the serving stack

**What it does.** brings up the offline services that read the built files: PostGIS (`postgres`),
Martin tiles (`map-server`), the routing gateway plus three OSRM backends, and Photon. Nominatim's
import service is not part of serving and stays stopped.

```bash
cd ~/borobiya
docker compose --profile routing --profile geocoding up -d \
  map-server routing-gateway osrm-car osrm-bicycle osrm-foot photon
docker compose --profile routing --profile geocoding ps      # summary; § 7 has the full set
```

**Expected output.** seven services `Up`, all eventually `(healthy)`: `postgres`, `map-server`,
`routing-gateway`, `osrm-car`, `osrm-bicycle`, `osrm-foot`, `photon`. The OSRMs turn healthy once
their graphs are loaded and Photon after its index opens — give it a minute. This command does not
start `api` or `nginx`; a crash-looping `api` container from an earlier attempt may still be in the
list (§ 9.3). Martin serves tiles from files and does not need Postgres at all.

Add the app gateway and API when you want the whole product, not just the map stack:

```bash
docker compose up -d --build api nginx
docker compose ps
```

**Redo just this step:** `docker compose --profile routing --profile geocoding down` (never `-v`!)
then the `up -d` command again. Nothing built is lost — see § 8.3 for what each reset actually costs.

### 6.7 Step 13 — Acceptance checks and sign-off

**What it does.** proves the running services answer for the area you selected, using the test points
in `map-server/regions.json`.

```bash
./map-server/scripts/verify-tiles.sh
./map-server/scripts/verify-routing.sh
./map-server/scripts/verify-geocoding.sh
```

Each script checks one area — the first of `MAP_REGION_IDS` unless you pass an ID
(`./map-server/scripts/verify-routing.sh de-Frankfurt`) — issuing real HTTP requests to Martin
(`localhost:8000`) and the local gateway (`localhost:8001`), and validating non-empty
MVT/GeoJSON/route geometry. For a multi-area selection, run the trio once per area.

| Script | Proves | Fails when |
| --- | --- | --- |
| `verify-tiles.sh` | step 9 + Martin: a real z12 tile exists at the area's test point | PMTiles missing/stale, Martin not up, bbox/selection mismatch |
| `verify-routing.sh` | step 10 + `osrm-*` + gateway: a route with distance/geometry for `car`, `bicycle`, `foot` | a graph dir empty, gateway can't reach a profile |
| `verify-geocoding.sh` | step 11 + Photon: forward and reverse geocoding return named features | index absent, `PHOTON_LANGUAGES` didn't cover the area, Photon still opening |

Raw spot checks, when a script fails and you need to see the response itself
(`python3 map-server/scripts/regions.py verify-point <area-id>` prints the coordinates for any area):

```bash
curl -fS -o /tmp/tile.pbf -w 'tile HTTP %{http_code}; %{size_download} bytes\n' \
  http://localhost:8000/borobiya/12/2632/1612                     # 200 + non-empty protobuf
curl -fsS -H 'Content-Type: application/json' \
  -d '{"from":{"lat":35.68,"lon":51.38},"to":{"lat":35.70,"lon":51.41},"profile":"car","alternatives":true}' \
  http://localhost:8001/route | python3 -m json.tool               # swap car → bicycle → foot
curl -fsS -G --data-urlencode 'q=Azadi Square' --data-urlencode 'limit=5' \
  http://localhost:8001/geocode | python3 -m json.tool             # non-empty FeatureCollection
curl -fsS -G --data-urlencode 'lat=35.70' --data-urlencode 'lon=51.40' \
  http://localhost:8001/reverse | python3 -m json.tool             # a FeatureCollection with a name
curl -fsS http://localhost:8080/health                             # gateway liveness ("ok", answered by nginx itself)
curl -fsS http://localhost:8080/api/_public/health                   # the API's own health, through the gateway
```

**Sign-off note to keep** (paste it into your own notes and fill it in — nothing here goes into the
repo, and never attach `.env` or passwords):

```
date / checkout:            $(date -Is) / $(cd ~/borobiya && git rev-parse --short HEAD)
selection / snapshot:       $MAP_REGION_IDS / $SNAPSHOT_MODE $SNAPSHOT_DATE
source policy:              $MAP_SOURCE_POLICY
dataset PBF verify:         ./map-server/scripts/verify-map-pbf.sh "$MAP_PBF"  ->
tiles / routing / geocoding: 0 (pass) / 0 / 0
VM:                         $(nproc) vCPU, $(free -g | awk '/Mem:/{print $2}') GiB, $(df -BG --output=avail . | tail -1) free
not verified:               (list whatever you skipped, e.g. "opened in a browser", "second area")
```

Then, to stop everything without losing built data:

```bash
docker compose --profile routing --profile geocoding down
docker compose --profile geocoding-import down
docker compose down            # api/nginx;  NEVER add -v here — see § 8.4
```

---

## 7. Checking what is running

### 7.1 Compose status (the five commands worth knowing)

```bash
cd ~/borobiya
docker compose ps -a                                   # everything this project has containers for, incl. stopped/profile ones
docker compose --profile routing --profile geocoding --profile geocoding-import ps -a   # the full map picture
docker compose config --services                       # which services this compose file DEFINES (vs what is running)
grep -n -A1 'profiles:' docker-compose.yml              # which services sit behind an optional profile
docker compose top map-server                      # processes inside one service (any name from `config --services`)
docker compose logs --tail=50 map-server           # the first real error if it died or restarted
```

A one-glance health table, derived from the running containers instead of a hand-typed list — it
prints name, state, Compose health, restart count and OOM flag for every container of this project:

```bash
docker compose ps -a --format json | python3 -c '
import json, sys
raw = sys.stdin.read().strip()
if not raw:
    raise SystemExit("no containers in this Compose project")
try:
    rows = json.loads(raw)                                     # Compose >= 2.21 prints one JSON array
except json.JSONDecodeError:
    rows = [json.loads(line) for line in raw.splitlines()]      # older Compose: one object per line
for c in rows:
    print("%-20s %-10s %-9s %s" % (c.get("Service", c.get("Name", "?")), c.get("State", "?"),
                                   c.get("Health") or "-", c.get("Status") or ""))
'
```

That snippet reads `docker compose ps` output rather than a hand-typed service list on purpose:
this project has ten services and three profiles, so a hardcoded table goes stale the day a service
is added. Then the four things that explain almost every "it's unhealthy":

```bash
docker stats --no-stream                                  # RAM/CPU right now; a service near its limit is about to be killed
docker inspect $(docker compose ps -q) --format \
  '{{.Name}}: running={{.State.Running}} oom={{.State.OOMKilled}} exit={{.State.ExitCode}} restarts={{.RestartCount}}'
ss -ltnp 2>/dev/null | grep -E ':(5432|5433|8000|8001|8080|8081|2322|3000)\b'   # which ports are actually listening on 127.0.0.1
docker volume ls --filter "label=com.docker.compose.project=$(basename "$PWD")"   # the data that must survive
```

Reading it: `oom=true` → the VM is out of RAM, see § 9.4 · `exit=1` with a rising `restarts` → a
config mismatch, read the service's `logs` · a port missing from `ss` while the container is `Up` →
the service is still warming up (graphs/index) or publishing to a different port than you assumed
(the published ports and their `*_PORT` overrides come from `docker-compose.yml`, printed by
`docker compose config | grep -A1 published`).

### 7.2 The app side, if you started `api`

```bash
docker compose run --rm --build api bun src/db/migrate.ts   # one-off migrator (never run at container start)
docker compose run --rm api bun src/db/seed.ts              # explicit seed: the question catalog and friends
curl -fsS http://localhost:8080/health && echo              # gateway liveness ("ok", answered by nginx itself)
curl -fsS http://localhost:8080/api/_public/health && echo  # the API's health, through the gateway
curl -fsS http://localhost:3000/_public/health && echo      # direct (API_PORT), bypassing the gateway
```

`run --build` on the migrator is deliberate: the image is rebuilt from the current checkout, so the
migrations that match *this* code are the ones applied. Migrations and seed are never run at
startup, so a VM that has been sitting for a month needs those two lines before accounts, SOS rows
or the catalog behave. If the migrator stops with a database error, keep its sanitized
cause/SQLSTATE line, then clear stale exports and retry — do **not** delete a Postgres volume to
make an error disappear:

```bash
unset POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL
set -a; source .env; set +a
docker compose run --rm --build api bun src/db/migrate.ts
```

`reset-admin-password` is the documented way back into an account. The setup script prints the
generated admin login once, at the end of a run; the password is kept only as
`ADMIN_SEED_PASSWORD_B64` in the local `.env` and decoded for the seed process, never committed:

```bash
docker compose run --rm -e ADMIN_SEED_PASSWORD api bun src/db/reset-admin-password.ts '<new-password>'
```

---

## 8. Reset, clear caches, start over

Three levels. Start at the top; each is stated in terms of what you lose.

### 8.1 Level 1 — rebuild one artifact (no downloads)

Delete only that artifact and re-run its step (§ 6). Costs: minutes to an hour, no network.

| Lose | Command | Forces |
| --- | --- | --- |
| tiles | `rm -f -- "$MAP_DATA_DIR/borobiya.pmtiles" "$MAP_DATA_DIR/borobiya.metadata.json"` | step 9 |
| road graphs | `rm -rf -- "$MAP_OSRM_DATA_DIR"/{car,bicycle,foot}` | step 10 |
| Photon index | `rm -rf -- "$MAP_PHOTON_DATA_DIR/photon_data" && rm -f -- "$MAP_PHOTON_DATA_DIR/.borobiya-pbf.sha256"` | step 11c |
| dataset PBF (not the downloads) | `rm -f -- "$MAP_PBF" "$MAP_PBF_MANIFEST"` | step 8 (re-crops from cache) |
| a Planetiler reference layer | `rm -f -- "$MAP_PLANETILER_SOURCES_DIR"/<that file>` | step 7 for that one file |
| build cache (Docker) | `docker builder prune -f` | image rebuilds |

### 8.2 Level 2 — clear the map caches and downloaded files

This is the script the repo ships for exactly this, **dry-run by default**: it prints what it would
remove and stops.

```bash
cd ~/borobiya
./scripts/clear-map-cache.sh                    # same as --dry-run: print the plan only
./scripts/clear-map-cache.sh --apply            # ask for the word CLEAR, then remove
./scripts/clear-map-cache.sh --yes              # remove without a prompt (only after you read the plan)
./scripts/clear-map-cache.sh --dry-run --include-nominatim-volume   # preview the one option that touches a volume
```

| Flag | Meaning |
| --- | --- |
| `--dry-run` | print only — **the default**, so an accidental invocation destroys nothing |
| `--apply` | remove, after you type `CLEAR` (needs a terminal) |
| `--yes` | remove without the prompt |
| `--include-nominatim-volume` | also drop the Nominatim database volume — only if that import can be rebuilt (hours) |
| `--library PATH` | point at a library other than `MAP_LIBRARY_DIR` in `.env` |

What it removes, by the label it prints for each: `library sources`, `library crops`,
`library generated datasets (PBF, PMTiles, OSRM, Photon)`, the `active library pointer`
(`current.json`), unconfigured Compose placeholders, and the legacy project-local equivalents
(`map-server/data/source`, `map-server/data/crops`, `map-server/osrm/data`,
`map-server/photon/data`, `map-server/data/{tehran,borobiya}.{osm.pbf,source.json,pmtiles,metadata.json}`).
Everything it names is re-derivable from the network plus the pipeline. What it keeps: **Docker
images and build cache**, every named volume, and the committed inputs: `map-server/data` and
`map-server/tools` themselves are left alone (only the generated files inside them are cleared), because
`map-server/regions.json`, the styles, sprites and fonts live in that tree and an older checkout may
keep its Planetiler JAR in `map-server/tools/`. Two protections are worth knowing, because each looks like a bug
otherwise: it refuses to clear **through a symlink** or outside the configured root (so a bad
`MAP_LIBRARY_DIR` cannot be aimed at `/`), and if the configured library carries none of its marker
paths it prints `no Borobiya cache markers; preserving it and its unknown contents` and removes
nothing there.

Cost after Level 2: steps 7–11 in full (≈1.3 GB + 230 MB of downloads, then the builds).

### 8.3 Level 3 — full reset of the VM's map + app state

Order matters; run each line and read it before the next:

```bash
cd ~/borobiya
docker compose --profile routing --profile geocoding down          # 1. stop containers (no -v)
./scripts/clear-map-cache.sh --yes                                  # 2. map library (L2 above)
./scripts/clear-map-cache.sh --yes --include-nominatim-volume       # 3. only if you want the Nominatim import gone too
docker builder prune -f                                            # 4. reclaimable build cache
docker volume ls --filter "label=com.docker.compose.project=$(basename "$PWD")"   # 5. what is left, by name
# 6. only if you deliberately want the APPLICATION database gone (users, SOS rows, sessions):
docker volume rm <project>_postgres-data
```

Then rebuild from the top: the loader block (§ 2.1), steps 7 → 13, or `./scripts/setup-ubuntu-vm.sh`
which does all of them and re-migrates/re-seeds the database (§ 1.2a). `.env` survives, so your
secrets, selection and pins are already in place; nothing in this document's flow re-creates them.

### 8.4 Never as a shortcut

| Don't | Because |
| --- | --- |
| `docker compose down -v` | deletes **all** named volumes of this project: `postgres-data` (the only copy of accounts/SOS data), `nominatim-data` (hours of import), and `borobiya-uploads` (the only copy of every SOS photo). Tiles, OSRM graphs and the Photon index are *not* volumes — `-v` doesn't even free that space |
| `docker system prune --volumes` | the same, machine-wide, for every project in `/var/lib/docker` |
| `docker system prune -a` | also deletes the locally built `borobiya/photon:1.3.0`, which no registry can give back |
| `rm -rf ~/.local/share/borobiya` to "clear the cache" | `MAP_LIBRARY_DIR` may be elsewhere (§ 2.1); use § 8.2's script so you see the plan first |
| editing an `md5` in `map-server/regions.json`, or a `.sha256` in a dataset's `borobiya.source.json` | the catalog pin is reviewed input; the manifest is the provenance record of what was actually verified |
| `rm -rf map-server/…` to "clear the cache" | `regions.json`, the styles, sprites and fonts are **committed inputs**, not cache, and the pipeline no longer writes generated data inside the repo |

---

### 8.5 Remove one Compose volume — the only safe way

Never by name-prefix guessing, and never globally: find the volume by the labels Compose puts on it,
require exactly one match, then remove that one name. This is what the Nominatim reset in § 9.2 means;
the same lines work for any service's volume — change the `com.docker.compose.volume=` filter.

```bash
cd ~/borobiya
PROJECT="$(docker compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("name", ""))')"
[[ -n "$PROJECT" ]] || { echo 'Could not determine the Compose project; stop and inspect manually.' >&2; exit 1; }
VOL="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" \
        --filter 'label=com.docker.compose.volume=nominatim-data')"
[[ -n "$VOL" ]] || { echo 'No labeled Nominatim volume in this project; nothing to remove.' >&2; exit 1; }
[[ "$(printf '%s\n' "$VOL" | wc -l)" -eq 1 ]] || { echo 'More than one match — inspect the list and stop.' >&2; exit 1; }
docker compose --profile geocoding-import rm -f nominatim     # drop the container, not the data
docker volume rm "$VOL"
```

An empty result means there is nothing to remove (no import ever completed, or it was already reset).
More than one match means a second project or an orphan — look at
`docker volume ls --filter "label=com.docker.compose.project=$PROJECT"` before choosing anything.
Then re-run step 11b and 11c. The half-initialized database volume can also be left alone when the
failure was an old read-only mount: without its `import finished` marker Nominatim drops and
re-imports from scratch on the next start (§ 9.2).

## 9. Troubleshooting index

Symptom first, always — grep this section for the error text.

### 9.1 Build/verify stage

1. **`osmium-tool … is required (found 1.16.0)`** (step 8) — `.env` carries an old
   `MAP_OSMIUM_VERSION`, or this terminal never reloaded `.env` after you edited it. Do not install
   another Osmium; fix the pin and reload:
   `sed -i 's/^MAP_OSMIUM_VERSION=.*/MAP_OSMIUM_VERSION=1.16.0/' .env && set -a; source .env; set +a`
2. **`verify-map-pbf: dataset PBF is missing or empty`** — a knock-on of a failed step 8, not a
   second bug. Fix the preparation error, re-run step 8 until it prints
   `Prepared shared dataset PBF: …`, then verify.
3. **`Could not download … water-polygons-split-3857.zip` / `Could not HEAD …`** — upstream host
   outage, § 3.4. Nothing in this repo is broken, and `--force` is not a re-download fix.
4. **`Geofabrik … 404`** (step 8) — the pinned dated extract aged out of the mirror's window;
   § 3.3.
5. **A step says everything is fine but the tiles look wrong (ocean drawn as land)** — the reference
   layers are placeholder/stale data; re-fetch with `MAP_SOURCE_POLICY=refresh` and rebuild step 9.
6. **Planetiler "insufficient disk/RAM" warnings** — `--force` in `generate-tiles.sh` already means
   "overwrite the output and ignore those warnings"; it does not re-download anything, and
   `--refresh_sources` is deliberately never passed because it is the flag that makes Planetiler
   HEAD every source on every run.

### 9.2 Step 11 (Nominatim / Photon)

- **`chown: … Read-only file system` then a restart loop** — an old checkout whose Compose file
  mounted `./map-server/data` read-only inside `/nominatim`. `git pull --ff-only`, then
  `docker compose --profile geocoding-import up -d --force-recreate nominatim`. The
  half-initialized volume can stay: without its `import finished` marker the entrypoint drops and
  re-imports from scratch.
- **`FATAL: password authentication failed for user "nominatim"`** — `.env`'s `NOMINATIM_PASSWORD`
  no longer matches the password stored in the volume. Reload `.env` first (a new terminal is the
  usual cause) and re-run 11c; otherwise restore the old value in `.env`, or reset **only** the
  project's Nominatim volume with § 8.5's labeled removal (never `down -v`), then re-run 11b and 11c.
- **Changed the area selection after 11b/11c ran** — the Nominatim database and the Photon index
  still describe the old areas, and nothing will warn you. Redo them from scratch: stop both
  services, remove only this project's Nominatim volume via § 8.5, delete `photon_data` and the
  `.borobiya-pbf.sha256` stamp (§ 8.1 rows 3–4), then re-run 11b and 11c.

### 9.3 Step 12 (containers)

- **`Interrupted` / `No such image` for several images** — one pull failed and Compose cancelled
  the rest. Fix only the first `Error response from daemon: …` line, then re-run `up -d`.
- **`osrm-backend:v26.10.0: not found`** — old checkout; upstream has no bare tag. The repo pins
  `v26.10.0-debian` (§ 3.1 row 9). After `git pull --ff-only`, if step 10 never finished
  (`ls "$MAP_OSRM_DATA_DIR/car"` is empty), re-run step 10 — it uses the same image.
- **`borobiya/photon:1.3.0: No such image`** — Photon is **built locally**, not pulled:
  `docker compose --profile geocoding build photon`, then `up -d`.
- **`failed to extract layer … no space left on device`** — Docker/containerd storage is full, not
  a bad JAR (the checksum step passed). `docker system df -v`, `df -h/-i` on
  `$(docker info --format '{{.DockerRootDir}}')` **and** `/var/lib/containerd` if it exists, then
  § 8.1's `docker builder prune -f`. If the space is inside a database volume, expand or move Docker
  storage instead of deleting data. The setup script re-checks capacity before the long stages, and
  builds the Photon image *before* the disk-heavy Nominatim import for exactly this reason.
- **`borobiya-api-1` restart-looping with `Replace the example placeholder secret`** — the example
  JWT secrets are still in `.env`; step 12's command excludes `api`, so an old container survives
  untouched. Generate two different secrets, reload `.env` (Compose prefers values already in your
  shell over the edited file), recreate only the API. Do **not** touch `POSTGRES_PASSWORD` /
  `NOMINATIM_PASSWORD` now — their volumes hold the first password:

  ```bash
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
  set -a; source .env; set +a
  docker compose up -d --build --force-recreate api && docker compose logs --tail=20 api
  ```
- **`postgres` `unhealthy`, dependents report `dependency failed to start`** (on older checkouts:
  `map-server` restart-looping with `password authentication failed`) — the current
  `POSTGRES_PASSWORD` doesn't match the one `postgres-data` was initialized with, and
  `pg_isready`-style checks cannot see that. Either put the original password back in `.env`, or —
  while the app database is still empty — reset **only** that volume:
  `docker compose down && docker volume rm <project>_postgres-data`, reload `.env`, re-run step 12.
  Tiles, graphs, index and the Nominatim volume live elsewhere and are untouched.
- **Migration `28P01: password authentication failed for user "borobiya"` while Postgres is
  `healthy`** — the one-off container got a different password than the volume holds. Unset stale
  exports, reload `.env`, re-run § 7.2's migrate command. If it still fails, restore the original
  `POSTGRES_PASSWORD`; do not rotate it unless you have confirmed the database is new and empty.
- **Compose says the network must be recreated after a `git pull`** (the project subnet is pinned to
  `172.30.0.0/24`) — `docker compose down` once, **without** `-v`, then `up -d` again. Containers
  are recreated; volumes and built data stay.
- **`Pool overlaps with other one(s)`** — something already uses `172.30.0.0/24`; change the subnet
  and `TRUSTED_PROXY_IPS` together (§ A2's note).

### 9.4 Everything else

- **Services killed shortly after `up -d`, or `oom=true` in § 7.1** — 6 GiB is tight for five live
  map services. Keep Nominatim stopped, run one OSRM profile at a time, or move the VM to 8 GiB.
  `docker compose restart` is not a fix; `free -h` before and after is the evidence.
- **A script fails with an empty-looking path** (`cannot open '' `, `/borobiya.pmtiles`) — this
  terminal never ran the loader block, § 2.1.
- **`bun: command not found`** on a host where you expected it — A3 installs it into
  `/usr/local/bin`; `/usr/local/bin/bun --version` proves the binary is there and your `PATH` is not.
- **The setup script says `prerequisites missing`** — it lists exactly which (run A3), or which
  service is unreachable (`Docker daemon unreachable` → § A2's group note). Re-run it after fixing;
  completed stages are skipped.
- **Something is stale but every check passes** — the artifact matches the manifest for a *different*
  selection than you think. `./map-server/scripts/verify-map-pbf.sh "$MAP_PBF"` prints the areas and
  bbox it verified; compare with `python3 map-server/scripts/regions.py resolve "$MAP_REGION_IDS"`.

---

## 10. Known gaps in this document

- The status column of § 3.1 was checked on 2026-10-23 from the agent workspace, which can reach
  GitHub and the package registries but **not** `download.geofabrik.de`, `naciscdn.org`,
  `dev.maptiler.download`, `osmdata.openstreetmap.de` or any image registry; those rows are pinned-by
  the repository, not proven-live. Re-check them with § 3.2 on the VM, where the proxy (if any) is
  the real path.
- The water-polygons mirror in § 3.4 is a third-party copy for a known upstream outage and is
  intentionally not a fallback URL in the scripts. If osmdata returns, `MAP_SOURCE_POLICY=refresh`
  moves you back; nobody has to edit this file.
- Time estimates (30–50 min, 25–45 min, "hours" for the geocoding imports) are from the reference VM
  at 4 vCPU / 6 GiB with the default pinned Tehran selection. A whole country with
  `MAP_SNAPSHOT=latest` is slower on every line.
- This runbook covers the reference Ubuntu VM. It is not the containerized `bun run dev` loop in
  `docs/DEVELOPMENT.md`, and it does not open the app in a browser: a green step 13 means the map
  services answer, not that the UI was exercised.
