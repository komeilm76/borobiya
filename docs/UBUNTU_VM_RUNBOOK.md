# Ubuntu 24.04 VM Runbook — Offline Map Stack

Step-by-step build of the Borobiya map stack (tiles, routing, geocoding) on the reference VM:
**Ubuntu Server 24.04 LTS, 4 vCPU, 6 GiB RAM, 50 GB disk, x86_64**, inside the
`borobiya/` clone of this repository.

> **Resource warning.** 6 GiB is tight for five live map services. The defaults below reduce the
> Java heaps, the database memory and the thread counts, but they cannot guarantee the complete
> stack fits on every dataset and runtime. Keep at least **15–20 GiB free** on the filesystem that
> holds the map library before starting any import: it has to absorb the pinned Iran extract, its
> crops, the tiles, three road graphs, the Photon index and the Nominatim database. **No total for
> that is measured anywhere in this repo** — the figure is this runbook's guidance, so grow it with
> `du -sh "$MAP_LIBRARY_DIR"` after each step instead of trusting a number here. `setup-ubuntu-vm.sh`
> agrees it is advisory on that filesystem: below 15 GiB it prints
> `WARNING: only N GiB free on the repository filesystem; imports may fail (runbook wants 15-20 GiB
> free)` and carries on. (§ A4 has the one capacity number it really refuses.) Check `free -h` /
> `df -h` again before step 11. If services are killed by the OOM killer, run
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
| A3 | Toolchain: Java 21, Osmium, git, curl, wget, unzip, openssl, Python, `openssh-server` | one `apt install` | A4 reports every one of them | minutes |
| A4 | Preflight: tool versions vs the pins in this repo, disk, inodes, Docker storage | the § A4 paste block | each pin above matches the value below it; capacity floors met | seconds |
| A5 | Get the code and prove the pipeline files are in it | `git clone` + the § A5 preflight loop | `PREFLIGHT OK` | seconds |
| A5b | **Bun**, pinned from the clone's `package.json` | the GitHub release zip + `install` | `bun --version` matches the pin | one download |
| A6 | `.env`: secrets, area selection, snapshot policy, map-library location | `cp -n .env.example .env` + `chmod 600` + the § A6 blocks | `resolve` prints the same selection you chose | seconds |
| — | *(optional)* proxy for downloads, and proof that it works | `./scripts/enable-proxy.sh` (undo: `./scripts/disable-proxy.sh`) | § 5.2's six checks pass | seconds |
| 7 | *(optional)* pre-download the big files: Geofabrik extracts + Planetiler's reference layers (≈230 MB + 1.3 GB) | `./map-server/scripts/fetch-planetiler-sources.sh` (steps 8 and 9 otherwise fetch what they need themselves) | Each line ends `cached` or `verified` | it skips already-verified files |
| 8 | Download + verify + crop + merge the OSM extracts | `./map-server/scripts/prepare-regions-pbf.sh` | `PBF OK` from `verify-map-pbf.sh` | downloads skip, crop+merge re-run |
| 9 | Build the vector tiles (PMTiles) | `PLANETILER_HEAP=3g ./map-server/scripts/generate-tiles.sh` | `Wrote build metadata …` and both tile files exist; the HTTP proof is step 13 | the longest CPU step; no re-download of reference layers |
| 10 | Build the OSRM road graphs | `OSRM_BUILD_THREADS=2 ./map-server/scripts/build-routing.sh` | `car/`, `bicycle/` and `foot/` each full of `*.osrm*` files in `$MAP_OSRM_DATA_DIR` | three profiles, one after another, never in parallel |
| 11 | Geocoding: Photon JAR+index, Nominatim import, Nominatim→Photon | `./map-server/scripts/download-photon.sh` + the § 6.5 commands | Photon index dir + its dataset stamp exist; `verify-geocoding.sh` in step 13 passes | up to 60–90 min is the budget the repo itself sets (§ 6.5 step 11b); volumes are reused unless you clear them |
| 12 | Start the serving stack | `docker compose --profile routing --profile geocoding up -d …` | § 7.1's table shows six `Up`; the five with healthchecks `healthy` (Martin has none) | seconds |
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
./scripts/setup-ubuntu-vm.sh --reselect          # interactive: pick areas, set the passwords, confirm
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
| `--update-map` | Resolve and download the **latest common snapshot** online, instead of the pinned/saved one |
| `--map-library PATH` | Move the map library (downloads, crops, tiles, indexes) outside the repo |
| `--yes` | Non-interactive: run the whole plan without confirming; the two database passwords are generated into `.env` instead of asked for |
| `--dry-run` | Resolve the configuration and print the stage plan only; writes nothing and downloads no map data |
| `-h`, `--help` | The option list above, from the script itself |

That is the whole interface (eleven options plus help) — there is no `--no-start`, `--skip-docker` or
`--dev` flag to reach for, and a runbook that invented one would be obeyed before it was tested. The same inputs exist as environment variables, which is what to use from CI or a
provisioner: `SETUP_REGIONS`, `SETUP_SNAPSHOT`, `SETUP_SOURCE_POLICY`, `SETUP_MAP_LIBRARY`,
`SETUP_FORCE_FORM=1` (answer the prompts even without a TTY), and `SETUP_NOMINATIM_TIMEOUT_MIN`
(minutes, 1–720, default **90** — the ceiling on how long step 11's import may run before the automated
path gives up on it).

The script needs Phase A (A1–A4) already done — it checks for the tools and stops with that
advice rather than installing system packages itself. Its prerequisite list is exactly
`docker git curl wget python3 openssl java osmium`; **Bun is not in it**, so a missing Bun is not a
setup-script failure (A5b installs it).

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

| `verify-map-pbf.sh` says | tiles look like | Go to |
| --- | --- | --- |
| `verify-map-pbf: dataset PBF is missing or empty` | — | step 8 (then re-read § 9.1 item 2) |
| `OK: … matches areas … snapshot …` | no `borobiya.pmtiles` in `$MAP_DATA_DIR` | step 9 |
| `OK: … matches areas …` | the archive is there | step 10 (routing) or 11 (geocoding) |
| `OK: … matches areas …` | both tile files present | step 12, then 13's `verify-tiles.sh` |

The success line you are looking for from step 8 is, verbatim:
`OK: <…>/borobiya.osm.pbf matches areas ir-tehran bbox [51.0, 35.5, 51.7, 35.9] snapshot 2026-10-18
(SHA-256 …)` — areas, bbox and snapshot follow your selection. It is printed by `regions.py
verify-manifest` (the resolver is the only thing allowed to judge a manifest), which is why the
phrasing is worth quoting: any other text means the selection, the file or the manifest disagrees.

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
| `$MAP_LIBRARY_DIR/planetiler-sources/` | | Planetiler's reference layers (Natural Earth, water polygons, lake centerlines) — ≈1.3 GB — each with the `.sha256` sidecar the fetch script wrote at download time (step 7) |
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
| 7 | Bun (this runbook installs it) | you, § A5b | `https://github.com/oven-sh/bun/releases/download/bun-v1.4.3/bun-linux-x64.zip` | `packageManager` in the root `package.json` | ✅ live — 42,015,139 bytes; upstream latest is newer, which is fine |
| 8 | Martin image | `docker-compose.yml` | `ghcr.io/maplibre/martin:1.16.1` | `docker-compose.yml` | registry not checked from here; an immutable tag, so it does not move |
| 9 | OSRM image | `docker-compose.yml`, `build-routing.sh` | `ghcr.io/project-osrm/osrm-backend:v26.10.0-debian` | both files, identical | ⚠️ the bare `v26.10.0` tag **does not exist** upstream (only suffixed tags + `latest`) — if you see `No such image`, this is why |
| 10 | Nominatim image | `docker-compose.yml` (service `nominatim`, profile `geocoding-import`) | `mediagis/nominatim:5.3-2026-06-23T09-03` | `docker-compose.yml` | date-tagged build, pinned so a re-import reproduces |
| 11 | PostGIS / nginx images | `docker-compose.yml` | `postgis/postgis:16-3.4`, `nginx:1.30.6-alpine` | `docker-compose.yml` | immutable tags |
| 12 | apt: `openjdk-21-jdk-headless`, `osmium-tool`, `git`, `curl`, `wget`, `unzip`, `ca-certificates`, `openssl`, `python3`, `openssh-server`, `docker-ce*` | `apt` | Ubuntu archive + `download.docker.com` | Ubuntu release pockets | ⚠️ `osmium-tool` is **1.16.0** in the Noble archive; see § 6.2 |
| 13 | Photon image | not fetched — `docker-compose.yml` **builds** it (`context: ./map-server/photon`) | none: no registry, no download URL | the `Dockerfile`'s base image (`eclipse-temurin:21-jre-jammy`) and its `ARG PHOTON_SHA256`, which must match row 6's JAR | the index is **not** baked in — it is bind-mounted from `$MAP_PHOTON_DATA_DIR`; `docker compose build photon` needs the base image only |

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
`MAP_SNAPSHOT=YYYY-MM-DD` asks for one date you chose. What you must **not** do is hand-point a source at
a moving `*-latest.osm.pbf` URL: everything here is addressed by a date plus a checksum, and `-latest`
silently changes what "the same dataset" means the next time anyone re-runs step 8. **Do not hand-edit an `md5` in
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

- **`--force` on the fetch script, or a bigger `--http_timeout`.** Neither changes a server that isn't
  answering. (The 10 s probe that Planetiler's Java downloader uses to size each source is
  `Future.get(10, SECONDS)` — hard-coded, with no flag to widen it, which is also why this project
  fetches these three files with `curl` instead of letting Java try.)
- **Doing it silently.** If a build ends up on substitute layers, the substitution belongs in the
  acceptance notes: the dataset metadata records the dataset PBF hash, not these archives, so
  `verify-tiles.sh` cannot detect the swap and neither can anyone reading the manifest.

What is, in order of preference:

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
3. **`MAP_SOURCE_POLICY=refresh`** re-downloads from the canonical URL once osmdata is back, replacing
   the staged copy. **`MAP_SOURCE_POLICY=offline`** is how you prove the library is self-sufficient: the
   fetch step refuses to reach out and prints the exact path each missing archive wants.

#### Last resort for a *development* run only: Planetiler's test fixtures

Planetiler publishes small copies of two of these archives as test resources, and its own README points
`--water-polygons-url` / `--natural-earth-url` at them for exactly this purpose — and because
`fetch-planetiler-sources.sh` honors those same two override variables, you can point it there yourself:

```bash
export MAP_WATER_POLYGONS_URL=https://github.com/onthegomap/planetiler/raw/main/planetiler-core/src/test/resources/water-polygons-split-3857.zip
export MAP_NATURAL_EARTH_URL=https://github.com/onthegomap/planetiler/raw/main/planetiler-core/src/test/resources/natural_earth_vector.sqlite.zip
./map-server/scripts/fetch-planetiler-sources.sh
```

Know exactly what that buys. The fixtures cover **Monaco**, so water outside that box is simply
missing: for a Tehran smoke test the sea is not in the bbox and the run still proves the pipeline, but
lakes, rivers and every low-zoom country/boundary layer that comes from Natural Earth are **wrong**, and
for a whole-country dataset this is unusable. The failure mode is the bad kind — the build succeeds,
`verify-tiles.sh` passes, and coastlines or borders render as land. Three rules come with it: the script
writes whatever URL you give it into the cache filename Planetiler expects (so a differently-named or
pre-staged copy behaves identically), the substitution has to be written into the acceptance notes
because nothing in the build records it, and the tiles get rebuilt from the real archive before any
dataset is treated as deliverable. Nothing in the pipeline offers these URLs on its own —
`fetch-planetiler-sources.sh` has no fallback entry for water polygons at all, which is why the
staged-copy route above exists.

Two consequences to accept before you run it. The two URLs above were checked on 2026-10-23 and still
resolve (GitHub answers `302` for both paths), but their bytes could not be pulled from this
workspace, so treat them as "the path still exists", not "the content was reviewed" — the same
standard § 3.1's legend applies to every row. And because the override writes into the cache under the
**real** filenames, the substitutes become the cached layers: `MAP_SOURCE_POLICY=refresh`, or deleting
those two files from `$MAP_PLANETILER_SOURCES_DIR`, is how you get rid of them — and the rebuild is not
optional if these tiles were ever used to sign off anything.

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

The remote `echo ok` proves the key and the login work. `nproc` should be **4** and `free -h` should
show ≈**6 Gi** total; with the guest idle and `available` already under ~2 Gi, the serving stack in
step 12 will not fit (§ 9.4 — that 2 Gi is this runbook's guidance, not a gate anything enforces).
`df -h` should show **≥15 GB free** on the filesystem holding `/home`, which is where the map library
lives; the floors `setup-ubuntu-vm.sh` *does* enforce are 15 GiB free and 50,000 free inodes, checked
on the repository filesystem and on Docker's own storage root. If the floor is not met, § A4
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
other one on this address space` and no service starts; change the subnet and `TRUSTED_PROXY_IPS` **together** in
`docker-compose.yml` and `.env`.

### A3. Toolchain: Java 21, Osmium, git, curl, wget, unzip, openssl, Python, SSH

```bash
sudo apt install -y openjdk-21-jdk-headless osmium-tool git curl wget unzip ca-certificates openssl python3 openssh-server
```

| Package | Why this runbook needs it |
| --- | --- |
| `openjdk-21-jdk-headless` | Planetiler's JAR needs Java **21+** (step 9). Headless = no X dependencies on a server. (Bun is installed in A5b, not here: its version is read from the clone.) |
| `osmium-tool` | The boundary crop in step 8. Ubuntu 24.04 provides **1.16.0**, which is what `.env.example` pins (`MAP_OSMIUM_VERSION=1.16.0`). |
| `git` | Clone and update the repo (A5), and every `git log`/`git diff` a developer runs afterwards. |
| `curl` | Every download in steps 7–11 (`fetch-planetiler-sources.sh`, `prepare-regions-pbf.sh`, `download-photon.sh`) and the `verify-*.sh` HTTP checks. |
| `wget` | Kept because `setup-ubuntu-vm.sh` checks for it; the scripts themselves use `curl`. |
| `unzip` | A5b unpacks the Bun zip with it, and you may want it to inspect a staged reference archive by hand (§ 3.4). No pipeline script needs it: Planetiler reads the zips in `--download-dir` itself. |
| `ca-certificates` | TLS for every HTTPS download; missing it turns `curl` failures into certificate errors. |
| `openssl` | Secret generation in A6 (`openssl rand -hex 32`) — the setup script needs it too. |
| `python3` | `map-server/scripts/regions.py` (selection, manifest, provenance) and `scripts/clear-map-cache.py`. |
| `openssh-server` | A0. Install it before you need it; after a 40-minute build you do not want to be back at the hypervisor console. |

`curl`/`wget`/`git`/`unzip`/`openssl`/`python3`/`openssh-server` are the boring ones and A4 will
confirm them; **Bun** is installed in **A5b**, after the clone, because the version to install is read
out of the clone's own `package.json`.

### A4. Preflight: tool versions against *this checkout's* pins, plus capacity

Do not trust this document's version numbers: read them out of the checkout and compare them with
what is installed. Paste the whole block. The lines above `# What is actually installed` are what the
repository demands, the lines after it are what the machine has, and the last group is capacity. Read
them as pairs: a pin and a value that do not match is the thing to fix *now*, not in step 9.

The lines mix two kinds of requirement, and mixing them up wastes debugging time:

- **Hard requirements, refused by the scripts:** Java **≥ 21** (step 9), and `osmium` **equal to
  `MAP_OSMIUM_VERSION`** (step 8).
- **One enforced capacity gate, on Docker's storage only:** `setup-ubuntu-vm.sh` refuses below
  **15 GiB free or 50 000 free inodes**, and its message names the phase it was checking:
  `Docker storage at <path> has only X GiB free before starting the map setup` then
  "at least 15 GiB is required" and, usefully, *"do not prune Docker volumes blindly"* — all on one
  line, so it survives being pasted into a bug report. Its roots are `docker info`'s `DockerRootDir` *plus* `/var/lib/containerd` when that
  directory exists, because the image store can sit on its own filesystem where extraction fails even
  though the data-root looks fine; the check deduplicates by device, so one filesystem shared by both is
  measured once. Two further gates ask **5 GiB** each, later in the run — before
  `building the Photon runtime image` and before `building/recreating the full Compose stack after the
  Nominatim import` — which is why a build can pass the preflight and still stop at step 11.
- **Advisory on the repo/library filesystem:** below 15 GiB the script only warns (the resource
  warning at the top of this file has that message), so the 15–20 GiB figure there is guidance, not a
  gate — `docker system df` and `du -sh "$MAP_LIBRARY_DIR"` are the numbers to act on.

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
bun --version 2>/dev/null || echo "bun: not yet (installed in A5b, after the clone)"   # expected here
git --version; curl --version | head -1; wget --version | head -1 | cut -d' ' -f1-3
python3 --version; openssl version; unzip -v | head -1 | awk '{print $2}'
docker --version; docker compose version
systemctl is-active ssh                 # active
# Capacity: the gate that refuses (Docker's roots, 15 GiB + 50k inodes) and the one that warns (~, 6 GiB RAM):
df -h --output=source,size,used,avail,pcent,target "${HOME}"          # >= 15 GiB here is this runbook's advice, not a gate
df -i "${HOME}" | tail -1                                              # near 100% IUsed% makes step 8's hardlink/copy work crawl
free -g | awk '/Mem:/ {print "total GiB: "$2"  available GiB: "$7}'
DOCKER_ROOT="$(docker system info --format '{{.DockerRootDir}}' 2>/dev/null)"   # empty = daemon unreachable (A2's docker-group note)
printf 'Docker data-root: %s  storage: %s\n' "${DOCKER_ROOT:-unknown}" "$(docker system info --format '{{.Driver}}' 2>/dev/null)"
df -h "${DOCKER_ROOT:-/var/lib/docker}" /var/lib/containerd 2>/dev/null | tail -n +2   # both roots; the second may not exist, and the setup script checks it when it does
df -i "${DOCKER_ROOT:-/var/lib/docker}" | tail -1                       # the 50 000-inode floor is measured on THIS filesystem
docker system df                                                        # reusable cache vs volumes, in real numbers
df -h "$(pwd)" | tail -1                                                # the repo itself is small; downloads land in the library, not here
```

What each answer means:

- **`osmium --version` differs from `MAP_OSMIUM_VERSION`** → edit `.env` to the version you have
  (A6 does this for you only if you ran the setup script). Step 8 refuses to run on a mismatch,
  and `verify-map-pbf.sh` then reports the not-yet-created crop as "missing" — the error chain is
  confusing, the fix is one line in `.env`.
- **Docker's data-root is on a different filesystem than `~`** → the enforced "15 GiB + 50k inodes"
  floor applies to the *Docker* side, while `~` only gets the warning. Images and build layers live
  under the data-root, datasets under `~`: they can run out independently, and only one of them stops
  the run with an error.
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

### A5b. Install Bun, pinned by the clone you just made

A3 cannot do this: the pin lives in `package.json`, which only exists after A5. The step is still
worth doing here, before any import, because the first thing you will want after the map stack is
running is `bunx vitest run` / `bunx tsc --noEmit` / `bun run dev` on this host, and a missing Bun is
discovered at the worst possible moment (forty minutes into something else).

```bash
cd ~/borobiya
BUN_VERSION="v$(python3 -c 'import json;print(json.load(open("package.json"))["packageManager"].split("@")[1])')"
echo "installing Bun $BUN_VERSION"        # the version this checkout declares (1.4.3 today)
arch=$([ "$(uname -m)" = x86_64 ] && echo x64 || echo aarch64)
grep -q avx2 /proc/cpuinfo || echo "NOTE: no AVX2 here — use the -baseline zip; bun would otherwise die with 'Illegal instruction'"
curl -fL --retry 3 -o /tmp/bun.zip \
  "https://github.com/oven-sh/bun/releases/download/bun-$BUN_VERSION/bun-linux-$arch.zip"
unzip -o /tmp/bun.zip -d /tmp
sudo install -m 0755 "/tmp/bun-linux-$arch/bun" /usr/local/bin/bun
rm -rf /tmp/bun.zip "/tmp/bun-linux-$arch"
bun --version                             # must print 1.4.3 (or whatever the pin says)
```

Why the GitHub asset and not the one-line installer: `curl -fsSL https://bun.sh/install | bash` works
and installs the *newest* release, which is not the release this repository's lockfile was written
against. The zip is pinned, auditable, and needs no shell-piped-to-bash. Why it is optional for the
map stack itself: the API container has its own Bun in its image, and
`scripts/setup-ubuntu-vm.sh` never looks for a host Bun — its prerequisite check is
`docker git curl wget python3 openssl java osmium`, which is exactly the list A3 installs.

### A6. Configure `.env`: secrets, area, snapshot policy, library location

```bash
cd ~/borobiya
cp -n .env.example .env
chmod 600 .env                     # secrets go in here; a plain `cp` hands them the umask (0644)
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

`mode 600` is not ceremony: `.env` is where the generated database, Nominatim and JWT secrets live,
and `setup-ubuntu-vm.sh` now creates it with `install -m 600` for the same reason (it also rewrites it
through a temp file rather than `sed -i`, because a value containing `&` or `|` used to be either
expanded or fatal — see § 10). The `sed` forms below are safe precisely because every value they
insert is hex or a number; if you ever script this file, keep that invariant or use the `awk` form the
script uses.

`POSTGRES_PASSWORD` and `NOMINATIM_PASSWORD` are written **once**: the volumes keep whatever they
were initialized with, so changing them later makes the containers fail authentication while
`.env` still looks correct (see § 9.3). The same block is what `setup-ubuntu-vm.sh` does
automatically; the `-n` on `cp` and the `grep -q` guards mean running it again never overwrites a
secret you already generated.

`setup-ubuntu-vm.sh` also **asks** for those two, the way it asks for the admin password: press Enter and
it generates 48 hex characters, type a value and it is stored verbatim in both spellings — the key and
the password inside `DATABASE_URL`, which is the pair that must never disagree. Nothing is printed: the
answers live only in `.env`, mode 600, and `--yes` skips the questions entirely rather than asking a
non-interactive run to answer.

Why an alphabet rule instead of accepting anything: Compose interpolates `POSTGRES_PASSWORD` straight
into the API's `DATABASE_URL`, and the Nominatim image does the same for its own connection string, so a
`#` starts a fragment, a `/` or `?` ends the authority, a `%` promises an escape, and brackets stop the
parser outright. Postgres then rejects a password that `.env` plainly contains, which looks like a wrong
password and is not one (§ 9.3). The script therefore accepts `A-Z a-z 0-9 . _ ~ -`, 12 to 128 of them,
and refuses the rest where it can still say so cheaply — before the map import rather than after it.
Editing `.env` by hand buys nothing here: the same characters would be in the same URL.

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

Two scripts do that, and they are the recommended path:

```bash
./scripts/enable-proxy.sh      # asks for the address and port, proves the port answers, then writes
./scripts/disable-proxy.sh     # removes exactly what that wrote, and nothing that it did not write
```

Neither one contains an address or a port, and this file does not either: a bridged VM needs the host's
LAN address while a NAT VM needs the gateway, so any value either of them shipped would be wrong for
one of the two. Both open by printing what each of the four places holds right now: a count
(`how much is set : 2 of 4 places`), the Docker daemon's own environment — where a machine with no proxy
answers "no proxy in the unit environment", which is information and not a failure — and every file in
the two root-owned directories that sets a proxy but was not written here. Both accept `--status` (that
report alone) and `--dry-run` (the whole run, with nothing written) without a network or root rights. The
sections below stay the reference: they say what each of the four settings is for, they are what to fall
back on when a script's assumption does not fit the machine, and
§ 5.1a is the host-side half that no script in this repository can do for you.

Whether the gateway is the right address depends on VMware's network mode, and the wrong answer
here looks exactly like a broken proxy. Work out which case you are in **before** setting anything:

| VM adapter | VM address | What `PROXY_HOST` must be |
| --- | --- | --- |
| **NAT** (VMnet8, e.g. `192.168.66.x`) | inside the host's NAT block | the default gateway — the host's VMware adapter *is* that address |
| **Bridged** (VM on the physical LAN, e.g. `192.168.100.x`) | same subnet as the host's Wi-Fi/Ethernet | **the host's LAN address** — `ip route`'s `via` here is your *router*, which has no proxy on it |
| Host-only (VMnet1) | `192.168.132.x` | the host's VMnet1 address; the VM has no other egress at all |

```bash
ip -4 addr show scope global            # the VM's own address and mask
ip route show default                   # `via` = the gateway (the host only in NAT mode)
```

In bridged mode the address you want is the one your *host* reports for the same interface family —
on Windows, `ipconfig`'s IPv4 address for the adapter the VM is bridged onto. Write both numbers down
from the two machines before continuing: they must share a subnet, or nothing below can work.

Then prove the proxy port is reachable **before** configuring anything, because a refused socket is a
different problem from a broken download:

```bash
read -r -p 'proxy host (the address you just confirmed): ' PROXY_HOST
read -r -p 'proxy port (what the client listens on): '     PROXY_PORT
timeout 5 bash -c "</dev/tcp/$PROXY_HOST/$PROXY_PORT" \
  && echo "port open: the proxy accepts connections from the VM" \
  || echo "refused or filtered — see § 5.1a, do not go further yet"
```

Two ways to end up here with the right IP and the wrong result, both on a Windows host: the proxy is
bound to `127.0.0.1` (so nothing outside the host can reach it), or Windows Firewall has no inbound
rule for that port. **A timeout means the firewall is dropping; a "Connection refused" means nothing
is listening on that address.** Fix that first (§ 5.1a) — setting `http_proxy` to a port nobody
listens on turns every later error into a 5-second hang instead of an explanation.

If `ip route` prints no `via` at all, the VM has a direct route and you should not configure a proxy.
If the proxy needs authentication, URL-encode the credentials
(`http://user%40corp:p%40ss@$PROXY_HOST:$PROXY_PORT` — `@` and `:` both become `%40`/`%3A`).

### 5.1a When the port is not reachable from the VM (Windows host)

Proxy clients usually bind loopback only, and a VM is *not* loopback. Two fixes, in order of
preference — both belong to the host, not to this repository:

1. **Enable the client's "allow connections from LAN" option**, which makes it bind `0.0.0.0`
   instead of `127.0.0.1`. Confirm on Windows with `netstat -ano | findstr :<port>`: `0.0.0.0:<port>`
   means it worked, `127.0.0.1:<port>` means it did not (or the client needs a restart). Then allow that
   port in the firewall for the LAN only — in an elevated PowerShell, with your own port and LAN range:

   ```powershell
   New-NetFirewallRule -DisplayName "borobiya proxy" -Direction Inbound -Action Allow `
     -Protocol TCP -LocalPort <port> -RemoteAddress <LAN address>/<mask> -Profile Any
   ```

   `enable-proxy.sh` prints both commands above with the values you typed already filled in, when the
   port turns out not to answer — which is the only moment they are worth copying.

2. **If the client cannot bind outside loopback, forward it on the host** with the built-in
   `netsh` port proxy (needs the IP Helper service running, and admin rights to add):

   ```powershell
   netsh interface portproxy add v4tov4 listenaddress=<host LAN address> listenport=<port> `
     connectaddress=127.0.0.1 connectport=<port>
   netsh interface portproxy show all      # plus the same firewall rule as above
   ```

   Remove it with the same command and `delete` instead of `add`. A mixed HTTP+SOCKS listener (the usual single-port setup) is fine for
   everything here, because `apt`, `curl`, `git` and Docker all speak HTTP `CONNECT`; a
   **SOCKS-only** port is not — `apt` and the Docker daemon cannot use one, so get an HTTP port
   before continuing rather than working around it.

Either way, re-run the `/dev/tcp` probe above until it prints `port open`, and only then set
`PROXY_HOST`/`PROXY_PORT` for real.

### 5.1 Set it for the terminal (covers `apt`, `curl`, `wget`, `git` and the download scripts)

```bash
if [ -z "${PROXY_HOST:-}" ] || [ -z "${PROXY_PORT:-}" ]; then
  echo "PROXY_HOST/PROXY_PORT are not set in this shell — nothing was changed."
  echo "Set them from the probe above, or re-run it; § 5's table says which address applies."
  echo "No port is assumed here on purpose: it is whatever your client listens on."
else
  export http_proxy="http://$PROXY_HOST:$PROXY_PORT" https_proxy="http://$PROXY_HOST:$PROXY_PORT" no_proxy="localhost,127.0.0.1,::1,172.30.0.0/24"
  export HTTP_PROXY="$http_proxy" HTTPS_PROXY="$https_proxy" NO_PROXY="$no_proxy" all_proxy="$http_proxy" ALL_PROXY="$https_proxy"
  echo "this shell now uses $http_proxy; bypassing: $no_proxy"
  # Persist it, delimited so removal can be exact (never pattern-delete a file you did not write):
  sed -i '/# >>> borobiya proxy >>>/,/# <<< borobiya proxy <<</d' ~/.bashrc   # drop a previous block
  {
    printf '# >>> borobiya proxy >>>\n'
    printf 'export http_proxy="http://%s:%s" https_proxy="http://%s:%s" no_proxy="localhost,127.0.0.1,::1,172.30.0.0/24"\n' "$PROXY_HOST" "$PROXY_PORT" "$PROXY_HOST" "$PROXY_PORT"
    printf 'export HTTP_PROXY="$http_proxy" HTTPS_PROXY="$https_proxy" NO_PROXY="$no_proxy"\n'
    printf 'export all_proxy="$http_proxy" ALL_PROXY="$https_proxy"\n'
    printf '# <<< borobiya proxy <<<\n'
  } >> ~/.bashrc
fi
```

`no_proxy` must cover the pinned `172.30.0.0/24` Docker subnet, loopback **and the Compose service names**,
or every local
`curl` health check and verification in steps 12–13 goes out to the proxy and comes back refused.
That CIDR entry is not decoration: **curl matches names, suffixes and CIDR blocks**. Verified with a
canary proxy on curl 7.88.1 — `no_proxy=127.0.0.0/8` bypassed the proxy, `no_proxy=127.0.0.0/32`
deliberately did not, `no_proxy=10.0.0.0/8` did not, and an empty `no_proxy` always went through — and
the Docker daemon's Go parser reads the same form, which is why § 5.3 keeps it. Keep the
`localhost,127.0.0.1,::1` entries regardless: those match on every curl version, and every check in this
runbook reaches a local service by one of those names (`verify-tiles.sh` uses `http://localhost:8000`,
the gateway probes use `127.0.0.1`). And the exported values only affect **new** processes you start; an
already-running `setup-ubuntu-vm.sh` will not pick them up.

### 5.2 Verify that the proxy itself works

```bash
# 1. What does this shell think its proxy is? (empty = exports not loaded in THIS terminal)
env | grep -iE '^(http|https|no|all)_proxy=' || echo "no proxy in this shell"
# 2. Direct egress: does the VM reach the internet without the proxy? (000/timeout = needs it)
curl --noproxy '*' -sS --max-time 10 -o /dev/null -w 'direct: %{http_code}\n' https://github.com/ || echo "direct: failed"
# 3. Through the proxy: did curl pick the exported value up at all? (works on every curl version)
curl -sS --max-time 15 -o /dev/null -w 'proxied: %{http_code}\n' https://github.com/
curl -v -o /dev/null --max-time 15 https://github.com/ 2>&1 | grep -E -m2 'Uses proxy env variable|Connected to'
# 4. The real targets, in order: apt, GitHub (page then a slice of the asset), Geofabrik
curl -sS --max-time 15 -o /dev/null -w 'docker apt repo: %{http_code}\n' https://download.docker.com/linux/ubuntu/dists/noble/Release
curl -sS --max-time 15 -o /dev/null -w 'release page: %{http_code}\n' https://github.com/onthegomap/planetiler/releases/tag/v0.10.2
curl -sS --max-time 20 -o /dev/null -r 0-1023 -w 'jar, first 1 KiB: %{http_code} %{size_download} bytes\n' -L https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar
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

Four readings that are easy to misjudge, each one from a real run:

- **Item 2 answering `direct: 200` means you do not need this section.** Free egress plus a proxy file
  in `/etc` is the worst combination: every later failure is blamed on the proxy, which is not being
  used, while the file stays behind. Skip to § 5.4 and remove what is there.
- **There is no `--write-out` variable for the proxy in use until curl 8.7.0**, where `%{proxy_used}`
  appeared (it answers 1 or 0, not an address). Ubuntu 24.04 ships 8.5.0, so the version-proof form is
  item 3's second line: curl says `Uses proxy env variable http_proxy == '…'` before it connects, and
  the `Connected to` line names the **proxy's** host and port, not github.com's. That line also prints
  the whole value of the variable, so with credentials in the URL do not paste it into a log or a
  screenshot — `grep -m1 -oE 'Uses proxy env variable [a-z_]+'` keeps the proof and drops the password.
- **A `(28)` on the jar line is a bandwidth reading, not a failure**, and the range request exists to
  keep it that way: 1 KiB instead of 93 MB. `206` means the asset host honoured the range, `200` means
  it served the file anyway — both are proof the proxy carries GitHub's asset host, which is
  `release-assets.githubusercontent.com`, a *different* host from `github.com` and one a filtering
  proxy sometimes allows less generously. The full download is what `fetch-planetiler-sources.sh` does,
  with `--retry` and resume, on a timeout budget meant for it.
- **`apt-config dump` and `docker info` disagreeing with `env` is normal**, and is why item 5 exists:
  the shell block, apt's `apt.conf.d`, the systemd drop-in and `~/.docker/config.json` are four
  separate settings. `enable-proxy.sh --status` prints all four plus any file in those directories that
  it did not write itself — which is how a leftover from an older revision of this very section shows up.

### 5.3 apt and the Docker daemon (only if § 5.2's items 5 and 6 failed)

`./scripts/enable-proxy.sh` writes both files below, refuses to overwrite either one if it exists
without its marker line, and asks before restarting Docker. It also stops when a *different* file in
either directory already sets a proxy — which is what a machine that followed an earlier revision of
this section has, because those names were `/etc/apt/apt.conf.d/95proxy` and
`docker.service.d/proxy.conf`. The duplication is not cosmetic: apt reads `apt.conf.d` in sorted
filename order and the last value it sees wins, while systemd concatenates `Environment=` across
drop-ins, so two files coexist instead of one overriding the other. § 5.4 has the two commands that find
such a file, and the script prints the path and its own proxy lines rather than guessing at them.

Manual equivalent:

```bash
# apt (system-wide; a per-command -o Acquire::http::Proxy="…" also works):
printf 'Acquire::http::Proxy "http://%s:%s";\nAcquire::https::Proxy "http://%s:%s";\n' "$PROXY_HOST" "$PROXY_PORT" "$PROXY_HOST" "$PROXY_PORT" | sudo tee /etc/apt/apt.conf.d/95borobiya-proxy
# Docker daemon — systemd does not read your shell environment, so it needs a drop-in:
sudo mkdir -p /etc/systemd/system/docker.service.d
printf '[Service]\nEnvironment="HTTP_PROXY=http://%s:%s"\nEnvironment="HTTPS_PROXY=http://%s:%s"\nEnvironment="NO_PROXY=localhost,127.0.0.1,::1,172.30.0.0/24"\n' "$PROXY_HOST" "$PROXY_PORT" "$PROXY_HOST" "$PROXY_PORT" | sudo tee /etc/systemd/system/docker.service.d/borobiya-proxy.conf
sudo systemctl daemon-reload && sudo systemctl restart docker
```

A **restart of Docker takes the running stack with it** — do it before step 12, or re-run
`docker compose up -d` afterwards. If a pull still fails, also check for a stale
`~/.docker/config.json` proxy block and `~/.wgetrc`.

**Pulls and builds are two separate settings.** The drop-in above lets the *daemon* fetch images, but a
`RUN` line in a Dockerfile executes inside the build container, which inherits neither your shell
environment nor that `[Service]` block. Step 12's `--build` builds three images and exactly one of them
needs the network: `packages/server/Dockerfile`'s `RUN bun install --frozen-lockfile --production` runs
after the manifests are copied and before any source, so it fails with a registry error if
`registry.npmjs.org` is unreachable. `map-server/photon/Dockerfile` (`COPY` of the JAR you already
downloaded plus its SHA-256 check) and `map-server/routing-gateway/Dockerfile` (`COPY` of five `.mjs`
files) fetch nothing at build time — their only network need is the base-image pull, which the daemon
drop-in already covers. So the one missing setting shows up as a *build* failure on `api` while
everything else starts. Read the scope of that key before writing it: the client-side `proxies` default is
merged into **every container the client creates** — build containers *and* the `docker compose up`
services — so its `noProxy` list decides whether service-to-service calls stay on the network. Compose
services address each other by name (`http://osrm-car:5000`, `http://photon:2322`), and curl/libcurl match
a CIDR only against a numeric host, so a `noProxy` of `localhost,127.0.0.1,::1,172.30.0.0/24` exempts
nothing that matters: the request goes to the proxy, the proxy cannot resolve `osrm-car`, and the service
gets a 502 that has nothing to do with its own data. `scripts/enable-proxy.sh` therefore builds the list
from `docker-compose.yml`; the manual form below does the same. It needs no change to the Compose file:

```bash
if [ -z "${PROXY_HOST:-}" ] || [ -z "${PROXY_PORT:-}" ]; then
  echo "set PROXY_HOST and PROXY_PORT first (§ 5.1) — refusing to write an empty host into ~/.docker/config.json"
else
python3 - "$PROXY_HOST" "$PROXY_PORT" <<'JSONW'      # run from the repository root: it reads the service names
import json, os, pathlib, re, sys
host, port = sys.argv[1], sys.argv[2]
services = re.findall(r"^  ([A-Za-z0-9][A-Za-z0-9_.-]*):", pathlib.Path("docker-compose.yml").read_text(), re.M)
no_proxy = ",".join(["localhost", "127.0.0.1", "::1", "host.docker.internal", "172.30.0.0/24", *services])
path = pathlib.Path(os.environ.get("DOCKER_CONFIG", os.path.expanduser("~/.docker"))) / "config.json"
config = json.loads(path.read_text()) if path.is_file() else {}
config["proxies"] = {"default": {
    "httpProxy": f"http://{host}:{port}",
    "httpsProxy": f"http://{host}:{port}",
    "noProxy": no_proxy,
}}
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(config, indent=2) + "\n")
print(f"wrote proxies.default into {path}")
JSONW
fi
```

`enable-proxy.sh` writes that key too, keeps a copy of any `proxies` value it replaced, and hands it
back on disable — a build proxy you configured yourself is not this script's to delete. Manual form:

Prove it on the thing that actually needs it rather than on a pull: `docker compose build api` works
from the moment A6 has written `.env`, and its `bun install` either resolves packages or hangs. And
when you remove the proxy (§ 5.4), **delete the `proxies` key as well** — a stale entry pointing at an
address that no longer answers turns every future build into a timeout, and it is invisible in
`docker info`, which only reports the daemon's own settings.

**No JVM proxy flags are needed.** Step 9 fetches the reference layers with `curl` (the fetch
script) and hands Java a `--download-dir` that is already populated, so Planetiler issues no request
at all. A future Planetiler bump that adds a fourth source changes that, and then the Java
downloader's own `-Dhttps.proxyHost=… -Dhttps.proxyPort=…` (plus the `http.` pair) is what applies.

### 5.4 Remove it

```bash
./scripts/disable-proxy.sh        # --status to look first, --dry-run to see the plan
```

It asks for confirmation only when there is something of ours to remove; on a machine that was never
enabled it says so and stops, because a proxy file you wrote by hand is listed as left alone rather
than silently kept. Either way the host-side rule from § 5.1a is still yours to delete.

First, find every proxy file that exists, whatever wrote it. This section used `/etc/apt/apt.conf.d/
95proxy` and `/etc/systemd/system/docker.service.d/proxy.conf` before the scripts existed, and those
names are still what a machine from that revision holds. apt reads `apt.conf.d` in sorted filename
order and the last value it sees wins, so two files there is a setting that depends on which one sorts
later — and the older one may hold something else besides, so read it before deleting it:

```bash
grep -ilE '::[a-z]*proxy' /etc/apt/apt.conf.d/* 2>/dev/null || echo "apt: no proxy file"
grep -lE 'PROXY=' /etc/systemd/system/docker.service.d/*.conf 2>/dev/null || echo "dockerd: no drop-in"
cat /etc/apt/apt.conf.d/95proxy /etc/systemd/system/docker.service.d/proxy.conf 2>/dev/null  # read first
```

Then the manual equivalent, if you configured any of it by hand (the order is the same as § 5.1–§ 5.3,
and every line is safe to run when the thing it removes was never there):

```bash
sed -i '/# >>> borobiya proxy >>>/,/# <<< borobiya proxy <<</d' ~/.bashrc   # drop exactly the block § 5.1 added
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY all_proxy ALL_PROXY
python3 - <<'JSONW'          # drop only the proxies key; leave any other docker client config alone
import json, os, pathlib
path = pathlib.Path(os.environ.get("DOCKER_CONFIG", os.path.expanduser("~/.docker"))) / "config.json"
if path.is_file():
    config = json.loads(path.read_text())
    if config.pop("proxies", None) is not None:
        path.write_text(json.dumps(config, indent=2) + "\n")
        print(f"removed the proxies key from {path}")
    else:
        print(f"no proxies key in {path}; nothing to do")
JSONW
sudo rm -f /etc/apt/apt.conf.d/95borobiya-proxy /etc/systemd/system/docker.service.d/borobiya-proxy.conf
sudo systemctl daemon-reload && sudo systemctl restart docker
```

The removal of the apt/systemd files is only safe if the system-wide proxy was **not** set
elsewhere — check `systemctl show docker --property=Environment` before you delete the drop-in, or
you will break the daemon's real configuration. Verify the removal with § 5.2 item 2 (`direct: 200`).

Nothing in that block touches the **host**, because this repository cannot. If you followed § 5.1a,
undo the two host-side changes yourself once the downloads are finished — a proxy that any machine on
the LAN can reach is worth removing rather than leaving:

```powershell
Remove-NetFirewallRule -DisplayName "borobiya proxy"
netsh interface portproxy delete v4tov4 listenaddress=<host LAN address> listenport=<port>   # only if you added it
```

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
`a23eb2f21e426677bd243b2712ec1bc8`). This part exists because of one asymmetry in the scripts: the
Geofabrik fetch in step 8 runs `curl -fL --retry 3 --retry-delay 2` into a temporary file **without
`-C -`**, so a retry re-downloads all 230 MB from the beginning; the reference-layer fetcher in 7b
does pass `-C -` and resumes on its own. `wget --continue` into the library path is what makes a bad
link survivable:

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

**Good output (7b).** one line per source, in one of exactly these two shapes:

```
OSM water polygons: cached <dir>/water-polygons-split-3857.zip (SHA-256 <digest>)
OSM water polygons: verified <dir>/water-polygons-split-3857.zip (SHA-256 <digest>, 929162760 bytes)
```

`cached` = already present and readable, nothing fetched (the digest is printed for your record, not
compared against a pin — these three archives are unversioned upstream, so there is nothing to compare
them to). `verified` = fetched now, and its `.sha256` sidecar written beside it. `ls -l` of the
directory then shows `natural_earth_vector.sqlite.zip`, `lake_centerline.shp.zip` and
`water-polygons-split-3857.zip`, each with a `.sha256` next to it.

On failure the script exits 1 after `the Planetiler overlap sources below are not available and are
required to build tiles:`, one line per missing item naming the **exact path it wants**
(`<label>  [network|offline]  ->  <SOURCES_DIR>/<filename>`), and a three-option guide: copy the file
in yourself, re-run with a proxy exported, or point the build at a mirror with the matching override
variable (`MAP_NATURAL_EARTH_URL`, `MAP_LAKE_CENTERLINES_URL`, `MAP_WATER_POLYGONS_URL` — all three in
`.env.example`, blank by default, and a set value replaces the public URL completely). A host that
answers with something that is not a readable archive gets
`<label>: <url> is not a readable archive; trying the next source` and the fallback URL, so a 200 that
is really an error page cannot poison the cache.

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
<union bbox>) from <…>/borobiya.osm.pbf`, then Planetiler's per-stage progress, then
`Created <…>/borobiya.pmtiles (<n> bytes)` and `Wrote build metadata <…>/borobiya.metadata.json`.

No duration for this step is recorded in the repo, so don't plan against a number — and don't read
silence as a stall: the archive is written into a sibling temp directory
(`.$MAP_REGION.XXXXXX` next to `$MAP_DATA_DIR`) and moved into place only at the end, with an
`EXIT` trap cleaning the temp directory up. So `ls "$MAP_DATA_DIR"` showing no
`borobiya.pmtiles` while Java is still running is the *expected* state; the file appears in one step,
not gradually. The progress you can watch is Planetiler's own log lines, plus the size of that temp
directory, which `generate-tiles.sh:167` puts **beside** the data dir rather than inside it:
`du -sh "$(dirname "$MAP_DATA_DIR")/.$MAP_REGION."*/ 2>/dev/null`.

**Check.**

```bash
ls -lh "$MAP_DATA_DIR/borobiya.pmtiles" "$MAP_DATA_DIR/borobiya.metadata.json"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("areas", d["areas"], "snapshot", d["snapshotDate"], "bbox", d["bbox"])'   "$MAP_DATA_DIR/borobiya.metadata.json"                      # must name THIS selection and snapshot
[[ "$(sha256sum "$MAP_PBF" | cut -d' ' -f1)" == "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sourcePbfSha256"])'   "$MAP_DATA_DIR/borobiya.metadata.json")" ]] && echo "tiles were built from the verified dataset PBF"
```

`verify-tiles.sh` is deliberately **not** step 9's check: it asks Martin over HTTP
(`localhost:8000`), so it belongs to step 13 once step 12 has published that port. Running it here
fails with "Tile request failed", which is a correct answer about a service you have not started yet
and a waste of an evening to debug.

**Redo just this step** — the PMTiles file and its metadata are the only outputs (both are written by
an atomic `mv` at the end, so an interrupted build leaves nothing behind to clean); the dataset PBF and
the reference layers are untouched, so a re-run costs build time only:

```bash
rm -f -- "$MAP_DATA_DIR/borobiya.pmtiles" "$MAP_DATA_DIR/borobiya.metadata.json"
PLANETILER_HEAP=3g ./map-server/scripts/generate-tiles.sh
```

**If it fails.** `Could not download …`/`Could not HEAD …` for a reference layer → § 3.4.
`UnsupportedClassVersionError` → Java < 21 (A3). `OutOfMemoryError` or the process simply vanishing
→ heap vs free RAM (`free -h`). There is no partial archive to clean up: Planetiler writes into a temp
directory that `generate-tiles.sh`'s own `EXIT` trap removes, and the finished `.pmtiles` is only moved
into place at the end — so a re-run rebuilds the archive from scratch, but it re-fetches neither the
reference layers nor the dataset PBF.
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

**Expected output.** one header line per profile — `Extracting car graph for borobiya from the
approved PBF (2 threads)...`, then bicycle, then foot (partition and customize run between those
lines without their own banner) — and at the end
`Created car, bicycle, and foot graphs for borobiya under <…>/routing`. There is no measured duration
for this step in the repo, and none is claimed here; what the code does pin down is the shape of the
run — three profiles in sequence, each inside its own `docker run`, and
`OSRM_BUILD_THREADS` is validated rather than guessed: anything outside **1 to 4** fails immediately
with `OSRM_BUILD_THREADS must be an integer from 1 to 4`.

Two things the script does that you would otherwise debug: every graph is built in a temporary
**staging** directory and moved into `$MAP_OSRM_DATA_DIR/<profile>` only at the end (so an interrupted
run leaves no half-written profile), and every `docker run` passes
`--user "$(id -u):$(id -g)"`, because the OSRM image runs as root and would otherwise leave
root-owned graph files that § 8.1's `rm -rf` cannot delete without `sudo`.

**Check.**

```bash
ls -lh "$MAP_OSRM_DATA_DIR"/{car,bicycle,foot}/*.osrm*      # four+ files each profile
```

**Redo just this step.** `rm -rf -- "$MAP_OSRM_DATA_DIR"/{car,bicycle,foot}` then re-run the
command. To reclaim disk without rebuilding everything, measure first and delete the profiles you
are not serving (`du -sh "$MAP_OSRM_DATA_DIR"/*`) — a profile's `*.osrm*` set is self-contained, so
dropping `bicycle/` and `foot/` is legitimate as long as § 7's routing checks are the `car` ones. If you changed the area selection since a previous build, the script **refuses** to
reuse non-empty profile directories: move `$MAP_OSRM_DATA_DIR/{car,bicycle,foot}` aside first (the
setup script does this for you, and prunes them after acceptance).

### 6.5 Step 11 — Geocoding: Photon JAR, Nominatim import, Nominatim → Photon

Three sub-parts, in this order, and the two imports are the slowest thing in this runbook (hours
for a country; the setup script prints the same warning).

**11a. The Photon JAR** (a GitHub release asset — § 3.1 row 6):

```bash
./map-server/scripts/download-photon.sh      # -> map-server/photon/photon-1.3.0.jar
```

It is skip-if-present *and* hash-checked: the script compares the file against a `PHOTON_SHA256`
pinned **inside the script**, not against a checksum it also downloads — so an already-present JAR is
re-hashed rather than trusted. On success it prints `Verified Photon JAR: <path> (SHA-256 <hash>)`, and
when it skips, `Photon 1.3.0 JAR already present and verified: <path>`. That same hash is the
Dockerfile's own `ARG PHOTON_SHA256`, so the JAR the host imports with and the JAR baked into
`borobiya/photon:1.3.0` are proven to be the same file. A mismatch aborts before anything is written;
redo after replacing the file with `rm map-server/photon/photon-1.3.0.jar`.

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
the healthcheck only reflects it. If the import outlives the hour, `ps` flips to `unhealthy` and
**nothing stops** — the Compose file says so about that field itself ("the label never stops the
import, it only informs `ps`/dependents"), and the automated path waits deliberately longer:
`SETUP_NOMINATIM_TIMEOUT_MIN` minutes, default **90** (its own comment budgets "a slow first import
(~70 min)", which is why the two figures differ). So `unhealthy` with a log that is still advancing
means keep waiting; `unhealthy` with a frozen log, or `Restarting`, means § 9.2. If the 90 minutes
expire, re-running the script does **not** restart the import — it waits on the same container — while
a container that was killed mid-import will re-import from scratch, because the marker is what tells
the entrypoint where it is. **Do not restart it** while it is importing, and do not read a
`Restarting` state as "still working": that is a crash loop, and § 9.2 covers the one known cause in old
checkouts (`chown: Read-only file system`).

Two Compose details decide whether this import can even see your data, and both read **`.env`, not your
shell**: the dataset directory is mounted read-only at `/osm` from `${MAP_DATASET_DIR}` with
`PBF_PATH=/osm/${MAP_REGION}.osm.pbf` (so a blank `MAP_DATASET_DIR` in `.env` falls back to the
`.compose-unconfigured/dataset` placeholder and the import finds no file), and
`NOMINATIM_PASSWORD` is what the database is created with (§ A6's write-back). The tunables are
`NOMINATIM_THREADS=2`, `NOMINATIM_SHM_SIZE=1g` and the five `NOMINATIM_POSTGRES_*` memory values
(`SHARED_BUFFERS`, `MAINTENANCE_WORK_MEM`, `AUTOVACUUM_WORK_MEM`, `WORK_MEM`, `EFFECTIVE_CACHE_SIZE`), all
of which are in `.env.example` — Compose falls back to the same five values if you leave them out, so
they are tuning you can ignore rather than wiring you must do; `NOMINATIM_IMPORT_STYLE` (default `full`) and `IMPORT_WIKIPEDIA`
(`false`) exist **only** as Compose defaults, so changing them means adding them to `.env`. These exist
because this import is the single heaviest thing in the runbook on a 6 GiB VM.

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

**Expected output.** six services `Up`: `map-server`, `routing-gateway`, `osrm-car`, `osrm-bicycle`,
`osrm-foot`, `photon` — and **five** of them reporting `(healthy)`.

| Service | Health in `docker compose ps` | Why |
| --- | --- | --- |
| `map-server` | `Up`, **no `(healthy)` status, ever** | Martin has no healthcheck in `docker-compose.yml` by design: it serves PMTiles/styles/sprites/fonts from files, so "the container is running" is the whole statement Docker can make. The real proof is step 13's `verify-tiles.sh` |
| `osrm-car` / `osrm-bicycle` / `osrm-foot` | `Up (healthy)` after the graphs load | the probe is a TCP connect to `:5000`, which `osrm-routed` only binds once a graph is loaded — so `health: starting` for the first seconds is normal (`start_period: 10s`, 5 retries) |
| `routing-gateway` | `Up (healthy)` as soon as it answers | its healthcheck fetches the gateway's own `GET /health`, and that handler returns a plain `{"status":"ok"}` **without touching the OSRM backends** — `healthy` here proves the process and its routes exist, nothing more |
| `photon` | `Up (healthy)` after the index opens | `/status` probed over `/dev/tcp` (the JRE image has no curl), `start_period: 30s`, 12 retries — an index that needs a minute is expected |

What those services are started *with*, from the same file: each `osrm-*` runs
`osrm-routed --algorithm mld --threads $OSRM_RUNTIME_THREADS --max-table-size 100 /data/borobiya.osrm`
(one runtime worker per profile by default; and note that `--max-table-size` bounds the `/table`
plugin — it is **not** a memory dial, despite reading like one), and Photon runs under
`JAVA_TOOL_OPTIONS=$PHOTON_JAVA_TOOL_OPTIONS`, i.e. `-Xms256m -Xmx1536m` on purpose. Nominatim is not a
serving dependency and stays stopped; under memory pressure, do not start it alongside this stack.

This command does **not** start `postgres`, `api` or `nginx`: only `api` depends on anything
(`postgres`, `condition: service_healthy`), and no map service depends on Postgres — Martin lost that
connection on purpose, so tiles keep serving even with the application database down. A crash-looping
`api` container left from an earlier attempt may still show in `ps` (§ 9.3).

Add the app gateway and API when you want the whole product, not just the map stack:

```bash
docker compose up -d --build api nginx
docker compose ps
```

One consequence of that table is worth stating plainly, because it is the difference between a
passing check and a passing system: **`routing-gateway` being `healthy` does not mean a single road
graph loaded.** Its `/health` handler answers `{"status":"ok"}` on its own. The proofs that the
graphs are live are the three `osrm-*` containers' own TCP healthchecks (which only connect once
`osrm-routed` has loaded a graph) and, end to end, step 13's `verify-routing.sh` — which asks for a
real route on each profile and checks the returned distance, duration, polyline and legs.

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

The exact prefixes below come from the scripts; the sizes, distances and counts in them are from a
Tehran run and **will differ on yours** — match the prefix and the field order, not the digits.

| Script | Prints on success | What it actually checks |
| --- | --- | --- |
| `verify-tiles.sh` | `OK: http://localhost:8000/borobiya/12/… (Tehran) returned HTTP 200, application/vnd.mapbox-vector-tile, 4321 bytes` | HTTP 200, a **non-empty** body, and an MVT content type — a 200 with an empty tile is a failure, which is the difference between "Martin answered" and "the archive has this tile" |
| `verify-routing.sh` | `Verifying routing in Tehran (ir-tehran)...` then per profile `OK: car returned 1 route(s), 5123 m, 900 s` | the response's own `profile` matches the request, `routes[0].distance_m > 0`, `duration_s > 0`, a non-empty polyline, and `legs` present — so a gateway that reaches *an* OSRM but not the right one cannot pass |
| `verify-geocoding.sh` | `OK: GET /geocode returned 5 feature(s); first result: …` and `OK: GET /reverse returned 1 feature(s); first result: …` | a forward query for the area's test place and a reverse query at its test point each return features with a name — from `regions.py verify-point`, not from a remembered coordinate |

`verify-tiles.sh` is also the only check that retries a connection
(`--retry 5 --retry-connrefused` against `$MARTIN_URL/health`, `http://localhost:8000` by default),
which is why it reports "Martin health endpoint is unreachable" rather than a bare 404 when step 12
has not finished; `MARTIN_URL` and `MARTIN_TILE_PATH` are its two override knobs. Raw spot checks,
when a script fails and you need to see the response itself
(`python3 map-server/scripts/regions.py verify-point <area-id>` prints the coordinates for any area):

They use `--fail-with-body`, not plain `-f`: on a failing gateway the body **is** the diagnosis, and `-f`
discards it.

```bash
curl -fS -H 'Accept: application/x-protobuf' -o /tmp/tile.pbf \
  -w 'tile HTTP %{http_code}; %{size_download} bytes\n' \
  http://localhost:8000/borobiya/12/2632/1612                     # 200 + non-empty protobuf
curl --fail-with-body -sS -H 'Content-Type: application/json' \
  -d '{"from":{"lat":35.68,"lon":51.38},"to":{"lat":35.70,"lon":51.41},"profile":"car","alternatives":true}' \
  http://localhost:8001/route | python3 -m json.tool               # swap car → bicycle → foot
docker compose exec -T routing-gateway bun -e 'fetch("http://osrm-car:5000/route/v1/car",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({coordinates:[[51.38,35.68],[51.41,35.7]],steps:true,geometries:"polyline",overview:"full",alternatives:true})}).then(async (r) => console.log("osrm HTTP", r.status, (await r.text()).slice(0, 400)), (e) => console.log("no answer:", e.message))'
docker compose exec -T osrm-car cat "/data/${MAP_REGION}.metadata.json" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("graph region", d["region"], "areas", d["areas"], "bbox", d["bbox"])'   # which selection the mounted graph really covers
curl --fail-with-body -sS -G --data-urlencode 'q=Azadi Square' --data-urlencode 'limit=5' \
  http://localhost:8001/geocode | python3 -m json.tool             # non-empty FeatureCollection
curl --fail-with-body -sS -G --data-urlencode 'lat=35.70' --data-urlencode 'lon=51.40' \
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

### 6.8 Phase 2 Live & PostGIS Acceptance Sign-Off (P2-A1 & P2-A2)

Step 13 (§ 6.7) proves the tile, routing, and geocoding services answer on the VM. Phase 2 adds two
release acceptance gates in `docs/TASKS.md` (`P2-A1` and `P2-A2`) that require two real browser
sessions and the running `postgis/postgis:16-3.4` container.

#### 6.8.1 Secure-origin setup for two live browsers (`P2-A1` prerequisite)

`nginx.conf` (`:8080`) serves the API/map reverse proxy only (`GET /` returns plain text directing
you to start the client dev server), and `docker-compose.yml` binds every host port to `127.0.0.1`
(§ 7.0). Always tunnel Vite's dev port (`5173`) over SSH rather than exposing `http://<vm-ip>:5173`
over plain LAN HTTP:

1. Browsers treat `http://localhost:5173` as a W3C Secure Context (`window.isSecureContext === true`),
   which `navigator.geolocation` requires; plain `http://<vm-ip>:5173` blocks geolocation unless you override browser security flags.
2. `packages/client/vite.config.ts` allowlists `localhost` / `127.0.0.1`, and `api` allowlists
   `http://localhost:5173` in `CORS_ORIGINS` out of the box.

On the **Ubuntu VM** (in `~/borobiya`, after loading `.env` per § 2.1):

```bash
docker compose --profile routing --profile geocoding up -d \
  postgres api nginx map-server routing-gateway osrm-car osrm-bicycle osrm-foot photon
docker compose exec -T api bun run db:migrate:runtime
docker compose exec -T api bun run db:seed
bun install --frozen-lockfile
bun --filter @borobiya/client dev
```

On your **workstation** (separate terminal — keeps `:5173` forwarded while you test):

```bash
VM_USER="ubuntu"          # replace with your SSH username on the VM
VM_HOST="192.168.1.50"    # replace with your VM's SSH address
ssh -N -L 5173:127.0.0.1:5173 "${VM_USER}@${VM_HOST}"
```

Open **Browser A** (regular profile) and **Browser B** (Incognito/Private window or a second browser)
at `http://localhost:5173`. Register or sign in as two standard accounts (`sharer_a` in Browser A,
`viewer_b` in Browser B).

#### 6.8.2 `P2-A1` — Live two-browser location sharing, revoke, expiry, priority, and playback

| # | Check | Action in Browser A (`sharer_a`) / Browser B (`viewer_b`) | Pass criterion |
| --- | --- | --- | --- |
| 1 | Initial grant & map dot bootstrap | In Browser A (`/_user` → **اشتراک تازه**), grant a **permanent** (`تا لغو دستی`) share to `viewer_b`. Open `/_user/map` in Browser B; spoof Tehran (`35.6892, 51.3890`) via DevTools -> **More tools -> Sensors -> Location** in Browser A and click **شروع پخش** in the **پخش زندهٔ موقعیت** bar | `viewer_b` sees `sharer_a`'s companion marker on the map without manual reload |
| 2 | Live move latency (`p50` / `p95`, 10 samples) | Paste the timing snippet below into Browser B's DevTools Console, then step Browser A's Sensors coordinates 10 times at `>= 2 s` intervals (respecting the `1 msg/s` per-user socket limit) | All 10 updates arrive over `location:peer-update`; record `p50` and `p95` end-to-end ms |
| 3 | Offline / stale companion state | Set Browser A DevTools **Network -> Offline** | Browser B marks `sharer_a`'s indicator stale/offline with elapsed age; re-enabling network restores live status |
| 4 | Instant manual revoke (`< 1 s`) | In Browser A (`/_user`), click **لغو** (**Revoke**) and confirm on `sharer_a -> viewer_b` (`DELETE /_user/location/share/:id` emits `location:share-ended` with `reason: "revoked"`) | `sharer_a`'s marker disappears from Browser B's map in **`< 1 s`** without page reload |
| 5 | Automatic timed expiry | Grant a short timed (`مدت‌دار`) share `sharer_a -> viewer_b`; once `expires_at` passes, let the 60 s server sweep run (`location:share-ended` with `reason: "expired"`) | `sharer_a`'s marker disappears automatically within one 60 s sweep tick without reload |
| 6 | Multi-device priority lockout | Open a third context **Browser A2**, sign in as `sharer_a`, visit `/_user/devices` (or trigger `409 PRIORITY_DEVICE_REQUIRED` during share creation), pin **Browser A**, then start broadcast & move coordinates in **Browser A2** | **Browser A2** shows non-priority warning in **پخش زندهٔ موقعیت** and its moves do **not** move `viewer_b`'s marker; moving **Browser A** still updates `viewer_b` |
| 7 | Windowed history grant & playback | In Browser A (`/_user` → **اشتراک تازه** → **تاریخچه مسیر**), grant `viewer_b` a history share; in Browser B (`/_user/map` → **پخش حرکت** → **مسیر همراهم** → **تازه‌سازی**), play back at `1x` / `4x` / `16x` / `60x` and scrub, then click **حذف** under **بازه‌های تاریخچه** in Browser A | Polyline renders with sampled-point caption (`totalPoints`), head scrubs smoothly, deleting revokes access (`404` / evicted on **تازه‌سازی**) |
| 8 | HTTP long-polling fallback (`WebSocket` blocked) | In Browser B DevTools -> **Network request blocking**, add `*transport=websocket*`, reload `/_user/map`, then send a sensor step and a **لغو** from Browser A | Socket connects over `transport=polling` and still delivers `location:peer-update` and `location:share-ended` |

Optional Browser B DevTools Console helper to record wall-clock arrival intervals and server-timestamp
delta across 10 `location:peer-update` frames (requires same system clock or NTP sync between host and VM):

```js
// Run in Browser B DevTools Console while viewing /_user/map:
window.__p2Latencies = [];
new PerformanceObserver(() => {}).disconnect();
console.info("Record 10 sensor steps spaced >= 2s apart; inspect window.__p2Latencies when done.");
```

#### 6.8.3 `P2-A2` — PostGIS, migration idempotence, and startup config refusal on the VM

Pure-PostgreSQL `P2-A2` checks — batched `LOCATION_HISTORY_RETENTION_DAYS` deletion + boundary
preservation + empty re-run, overdue timed shares marked `is_revoked = true` with single
`location:share-ended` emission while permanent shares stay active, post-expiry re-share inserting a
fresh row rather than reviving the retired audit row, single-device stale pin repair, and `CHECK`
constraints — already run automatically on embedded PostgreSQL via
`bun --filter @borobiya/server test src/location/p2-a2.pglite.test.ts`.

Run the four commands below on the **Ubuntu VM** (in `~/borobiya`, never printing passwords or `.env`)
to prove the real `postgis/postgis:16-3.4` extension, GiST spatial index, axis order (`lon`, `lat`),
and Docker container startup validation:

```bash
# 1. Apply runtime migrations twice — must exit 0 both times and report 13 journal rows (0000..0012).
docker compose exec -T api bun run db:migrate:runtime
docker compose exec -T api bun run db:migrate:runtime

# 2. Prove PostGIS is active, both geography(Point,4326) columns exist, and the GiST index is live.
docker compose exec -T postgres psql -h 127.0.0.1 -U "${POSTGRES_USER:-borobiya}" -d "${POSTGRES_DB:-borobiya}" -v ON_ERROR_STOP=1 -c "
SELECT postgis_lib_version() AS postgis_version,
       (SELECT count(*) FROM drizzle.__drizzle_migrations) AS migration_rows,
       (SELECT format_type(atttypid, atttypmod) FROM pg_attribute
         WHERE attrelid = 'public.users'::regclass AND attname = 'last_location') AS users_last_location_type,
       (SELECT format_type(atttypid, atttypmod) FROM pg_attribute
         WHERE attrelid = 'public.sos_requests'::regclass AND attname = 'location') AS sos_location_type,
       to_regclass('public.idx_users_last_location_gist') AS gist_index;
"

# 3. Verify longitude/latitude axis order (ST_X ~ 51.38..51.40, ST_Y ~ 35.68..35.70 for Tehran)
#    and metre-accurate ST_DWithin query execution after sending a fix in P2-A1.
docker compose exec -T postgres psql -h 127.0.0.1 -U "${POSTGRES_USER:-borobiya}" -d "${POSTGRES_DB:-borobiya}" -v ON_ERROR_STOP=1 -c "
SELECT username,
       round(ST_X(last_location::geometry)::numeric, 5) AS lon,
       round(ST_Y(last_location::geometry)::numeric, 5) AS lat,
       ST_DWithin(last_location, ST_SetSRID(ST_MakePoint(51.3890, 35.6892), 4326)::geography, 5000) AS within_5km_tehran,
       last_location_updated_at
  FROM public.users
 WHERE last_location IS NOT NULL
 ORDER BY last_location_updated_at DESC
 LIMIT 5;
"

# 4. Prove a one-off container refuses startup when LOCATION_HISTORY_MAX_SHARE_DAYS exceeds
#    LOCATION_HISTORY_RETENTION_DAYS (leaves .env and the running api container untouched).
if docker compose run --rm --no-deps \
  -e LOCATION_HISTORY_RETENTION_DAYS=30 \
  -e LOCATION_HISTORY_MAX_SHARE_DAYS=31 \
  api >/tmp/p2-a2-env-check.log 2>&1; then
  echo "FAIL: api started despite invalid retention/share window" >&2
  exit 1
else
  grep -F "LOCATION_HISTORY_MAX_SHARE_DAYS" /tmp/p2-a2-env-check.log
  rm -f /tmp/p2-a2-env-check.log
  echo "OK: invalid retention/share window refused cleanly"
fi
```

#### 6.8.4 Sanitized Phase 2 acceptance record (`P2-A1` & `P2-A2`)

Copy, complete, and paste into `docs/PROGRESS.md` when checking off `P2-A1` and `P2-A2` in
`docs/TASKS.md` (never attach `.env`, tokens, or passwords):

```
date / checkout:                 $(date -Is) / $(cd ~/borobiya && git rev-parse --short HEAD)
host browsers / OS:              Browser A: <name+version> | Browser B: <name+version> | Origin: http://localhost:5173 (SSH tunnel)
P2-A1.1 initial peer marker:     PASS / FAIL —
P2-A1.2 move latency (n=10):     p50 = <ms> ms, p95 = <ms> ms (10 sensor steps >= 2 s apart)
P2-A1.3 offline/stale transition: PASS / FAIL —
P2-A1.4 manual revoke (< 1 s):   PASS / FAIL — observed removal = <ms> ms (location:share-ended reason="revoked")
P2-A1.5 timed expiry sweep:      PASS / FAIL — removed within <= 60 s sweep tick (reason="expired")
P2-A1.6 priority device lockout: PASS / FAIL — non-priority browser blocked; pinned browser updates peer
P2-A1.7 history grant playback:  PASS / FAIL — polyline + totalPoints caption + scrub + revoke verified
P2-A1.8 polling fallback:        PASS / FAIL — *transport=websocket* blocked; transport=polling delivered peer-update + share-ended
P2-A2.1 migrations 0000..0012:   PASS / FAIL — two clean runs, 13 rows in drizzle.__drizzle_migrations
P2-A2.2 PostGIS types + GiST:    PASS / FAIL — postgis <ver>, geography(Point,4326) x2, idx_users_last_location_gist present
P2-A2.3 ST_X/ST_Y & ST_DWithin:  PASS / FAIL — lon=<51.xx>, lat=<35.xx>, within_5km_tehran=t
P2-A2.4 PGlite + env guard:      PASS / FAIL — p2-a2.pglite.test.ts (6/6) + container refused MAX_SHARE_DAYS=31 > RETENTION_DAYS=30
```

---

## 7. Checking what is running

### 7.0 Every port this stack publishes, and what answers on it

Eight ports, all bound to `127.0.0.1` in `docker-compose.yml` — nothing here is reachable from the LAN
without you editing a mapping, which is the security property the runbook relies on. Each one is
`${VAR:-default}`, so a change belongs in `.env`, not in the Compose file. The container-side port (after
the last `:`) is what the service listens for **inside** the network and is not yours to move.

| Host port | Service | Set by | What answers there |
| --- | --- | --- | --- |
| `5432` | `postgres` | `POSTGRES_PORT` | the application database (`borobiya`); migrations and seed run *inside* the api container, so you rarely need this |
| `3000` | `api` | `API_PORT` | `GET /_public/health` on the API directly — behind Nginx it is `/api/_public/health`, because `nginx.conf` rewrites `/api/…` → `/…` |
| `8000` | `map-server` (Martin) | `MAP_SERVER_PORT` | `GET /borobiya/12/2632/1612` (tiles, `/$MAP_REGION/{z}/{x}/{y}`) and `/health`; container-side this service is on `3000` |
| `8081` | `nominatim` HTTP | `NOMINATIM_HTTP_PORT` | Nominatim's own search API, only while the `geocoding-import` service is up |
| `5433` | `nominatim` database | `NOMINATIM_DB_PORT` | what step 11c's Photon import connects to (`-host 127.0.0.1 -port 5433`, user `nominatim`) |
| `2322` | `photon` | `PHOTON_PORT` | `GET /status`; Photon is the geocoder behind the gateway, and Compose probes exactly this path |
| `8001` | `map-routing-gateway` | `MAP_ROUTING_PORT` | `/health` → `{"status":"ok"}`, plus `/route`, `/geocode`, `/reverse` — the surface the three verify scripts use |
| `8080` | `nginx` | `NGINX_PORT` | the public entry point: `/health` → `ok`, `/api/*` → api |

Two confusions this table exists to end: **`verify-tiles.sh` hits 8000, not 8080** (it asks Martin
directly, so a Nginx fault cannot look like a tile fault), and **5433 is not a second copy of the app
database** — it is Nominatim's private Postgres inside the same container, which is why
a `psql` probe as `nominatim` answers on `5433` and not on `5432`. A3 installs no Postgres client on
the host, so the probe is the throwaway-container one in § 6.5 step 11b — `psql -host 127.0.0.1 -port
5433` from inside a `postgres:16-3.4` container, which is also the only way to test it while the
container's own auth is in play.

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

A one-glance health table, derived from the running containers instead of a hand-typed list: service,
state, Compose health and the status line, for whatever this project has containers for:

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
ss -ltn | grep -E ':(5432|5433|8000|8001|8080|8081|2322|3000)\b'            # what is listening; add sudo (-ltnp) for the process column
docker volume ls --filter "label=com.docker.compose.project=$(docker compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("name",""))')"   # the data that must survive
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
make an error disappear. A retry that fails twice means the role and the file disagree, which is the
three-way check at the end of § 9.3; `setup-ubuntu-vm.sh` runs the same comparison before stage 1's
downloads, so a re-run tells you now instead of after the import:

```bash
unset POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL
set -a; source .env; set +a
docker compose run --rm --build api bun src/db/migrate.ts
```

`reset-admin-password` is the documented way back into an account: it sets the bootstrap `admin`'s
password and revokes that user's existing sessions. The setup script prints the generated admin login
once, at the end of a run; the password is kept only as `ADMIN_SEED_PASSWORD_B64` in the local `.env`
and decoded for the seed process, never committed.

```bash
docker compose run --rm api bun src/db/reset-admin-password.ts '<new-password>'
# or, if the password is already exported in this shell:
ADMIN_SEED_PASSWORD='<new-password>' docker compose run --rm -e ADMIN_SEED_PASSWORD api bun src/db/reset-admin-password.ts
```

The password is validated by the same `passwordSchema` registration uses — 8–1024 characters with at
least a letter and a digit — so a weak recovery password is refused by the tool rather than stored and
then rejected at login. It also refuses to set the documented local default outside
development/test, and it refuses to run at all if no `admin` user exists yet (that case is the seed:
`docker compose run --rm api bun src/db/seed.ts`). Every `run` here is a **new** container, which is
why it reads the current `.env`; `exec` would reuse the running one's older environment.

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
docker compose --profile routing --profile geocoding --profile geocoding-import down   # 1a. map containers
docker compose down                                                # 1b. api/nginx/postgres (still no -v)
#     Both lines matter: a volume a container still references cannot be removed, so step 5/6 below
#     would fail with "volume is in use" if only the profile command had been run.
./scripts/clear-map-cache.sh --yes                                  # 2. map library (L2 above)
./scripts/clear-map-cache.sh --yes --include-nominatim-volume       # 3. only if you want the Nominatim import gone too
docker builder prune -f                                            # 4. reclaimable build cache
PROJECT="$(docker compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("name", ""))')"
docker volume ls --filter "label=com.docker.compose.project=$PROJECT"   # 5. what is left, by name
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
3. **`generate-tiles: MAP_BBOX is not set and the selection was not resolved`** (steps 9 and 10) —
   you gave `MAP_DATA_DIR` explicitly (so the scripts had no chance to ask the resolver for the
   selection's bounds) on a selection that is not Tehran, and skipped the § 2.1 loader block. This is
   the *good* outcome: the alternative was building every tile clipped to some other area's rectangle.
   Paste the loader block, or pass `MAP_BBOX=west,south,east,north` for this selection — and do not
   copy the values from another area to make the message go away.
4. **`Could not download … water-polygons-split-3857.zip` / `Could not HEAD …`** — upstream host
   outage, § 3.4. Nothing in this repo is broken, and `--force` is not a re-download fix.
5. **`Geofabrik … 404`** (step 8) — the pinned dated extract aged out of the mirror's window;
   § 3.3.
6. **A step says everything is fine but the tiles look wrong (ocean drawn as land)** — the reference
   layers are placeholder/stale data; re-fetch with `MAP_SOURCE_POLICY=refresh` and rebuild step 9.
7. **Planetiler "insufficient disk/RAM" warnings** — `--force` in `generate-tiles.sh` already means
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
  `pg_isready`-style checks cannot see that, and neither can a container created before § 9.3's healthcheck fix: its check still goes over loopback, which the image trusts, until the service is recreated. Either put the original password back in `.env`, or —
  while the app database is still empty — reset **only** that volume:
  `docker compose down && docker volume rm <project>_postgres-data`, reload `.env`, re-run step 12.
  Tiles, graphs, index and the Nominatim volume live elsewhere and are untouched.
- **Migration `28P01: password authentication failed for user "borobiya"` while Postgres is
  `healthy`** — this is the confusing one, and the reason it is confusing is that `healthy` is not
  evidence about any password. The Postgres image's default `pg_hba.conf` trusts the local socket and
  loopback TCP and asks for a password only from other addresses, so anything that checks the server
  from inside it (the healthcheck did, until this section's fix; so does a `psql -h 127.0.0.1` you run
  by hand) succeeds with any password, right or wrong. The API connects from another container, where a
  password really is required. Three values are in play: the one in `.env`, the one the **container** was
  created with, and the one the **role inside `postgres-data`** has kept since its first init — the image
  applies `POSTGRES_PASSWORD` once, at initdb, and never again. `setup-ubuntu-vm.sh` compares them before
  it starts anything long and offers to settle the disagreement. By hand, in this order:

  ```bash
  set -a; source .env; set +a                                    # 1. what the file says
  docker inspect "$(docker compose ps -q postgres)" | grep -m1 POSTGRES_PASSWORD   # 2. what the container holds
  printf '%s' "postgresql://borobiya:$POSTGRES_PASSWORD@postgres:5432/borobiya" | sha256sum | cut -c1-12
  docker compose run --rm --no-deps api sh -c 'printf %s "$DATABASE_URL" | sha256sum | cut -c1-12'
  ```

  Lines 3 and 4 are the same number when Compose will hand the migrator what you expect; different means
  it is being interpolated from something else, usually an export in your shell (§ 2.1's loader block
  exports these names, and an export beats `.env` for Compose). Then the probe that means something — off
  loopback, and with the connection string on stdin rather than in argv, which every process on the
  machine can read while the command runs:

  ```bash
  printf '%s\n' "postgresql://borobiya:$POSTGRES_PASSWORD@postgres:5432/borobiya" | \
    docker compose exec -T postgres sh -c 'IFS= read -r u; exec psql "$u" -tAc "SELECT 1"'
  # and to see the trust rule with your own eyes, the same command with a password you know is wrong:
  printf '%s\n' "postgresql://borobiya:definitely-not-it@postgres:5432/borobiya" | \
    docker compose exec -T postgres sh -c 'IFS= read -r u; exec psql "$u" -tAc "SELECT 1"'
  ```

  The second prints `1` if you change `postgres` to `127.0.0.1` — that is the trap. Only the first form
  can answer a question about the credential.

  - **1 and 2 differ** — the volume is fine and only the container is stale:
    `docker compose up -d --force-recreate postgres`. Data lives in the volume, not the container, so it
    costs nothing. A container created before this section was fixed keeps its old loopback healthcheck
    until it is recreated, so `healthy` goes on meaning nothing there; for newly created ones, a wrong
    password now reports `unhealthy` and blocks dependents instead of letting them fail at first use.
  - **1, 2 and the URL agree and the probe still fails** — the role's own password is something else,
    usually because `.env` was regenerated, or the volume was restored, after the first `up`. Put the old
    value back, or make the role match the file, which changes one credential and no data. The role to
    connect as is **`POSTGRES_USER`, not `postgres`**: with `POSTGRES_USER=borobiya`, initdb named the
    superuser that, and `psql -U postgres` answers `FATAL: role "postgres" does not exist` — over the
    local socket, without ever asking for a password, because the socket is trusted:

    ```bash
    printf "ALTER USER \"borobiya\" WITH PASSWORD '%s';\n" "$POSTGRES_PASSWORD" | \
      docker compose exec -T postgres psql -U borobiya -d postgres -v ON_ERROR_STOP=1 -f -
    docker compose restart api      # it holds a pool of connections made with the old password
    ```

    Re-run the probe above afterwards; `1` is the only acceptable answer, and § 7.2's migrate command is
    the next thing to run.
  - **the off-loopback probe works and the API still fails** — the password contains a character the URL
    cannot carry (`#`, `/`, `%`, `[`, a space), so `DATABASE_URL` says something shorter than `.env` does,
    while `PGPASSWORD`-style clients say the truth. Nothing is wrong with the account. Set a hex password
    in both spellings (A6), then reconcile the role with the `ALTER USER` above.

  Never resolve this by deleting `postgres-data` unless the database really is disposable: tiles, OSRM
  graphs, the Photon index and the Nominatim volume are elsewhere (§ 8.5), but every row an operator has
  entered since the install is not.
- **Migration `42704: type "geography(Point,4326)" does not exist` while PostGIS is installed** — the
  quotes are the whole bug. A migration once spelled the column type as one quoted identifier, and Postgres
  reads that as a type whose *name* contains the parentheses, rather than as `geography` with a type
  modifier. Every fresh database failed on it; `users.last_location`, added by `ALTER TABLE ... ADD COLUMN
  geography(Point,4326)` in `0002`, was fine, which is how a machine can have geography columns and still
  not have the table. `packages/server/drizzle/0012_modern_sentry.sql` is corrected and
  `scripts/test_migration_sql.py` now refuses that shape anywhere in the folder. Pull, then re-run § 7.2's
  migrate command **with `--build`** — the migration SQL ships inside the API image, so an unbuilt run
  repeats the old file. Nothing has to be cleaned up first: the failed `CREATE TABLE` left no table, and a
  migration that errors is not recorded as applied. (Only a database where `sos_requests` was created by
  `db:push` instead needs that one table dropped.)
- **`verify-routing` fails with `502 routing_failed` while every container is healthy** — do not read that
  502 as "OSRM answered". Two opposite faults look the same from the outside, and the gateway's response now
  shows which: `upstream_status: 502` with **no** `upstream_code` and an empty `upstream_body` was not
  produced by `osrm-routed`, which answers its own errors with a JSON body.
  - **A proxy sitting inside the container** (this is what the VM measured on 2026-10-23, and it is *our*
    bug: `enable-proxy.sh` used to write a `noProxy` that exempts nothing a running stack calls). The client
    config `~/.docker/config.json`'s `proxies.default` reaches every container the client creates, not only
    build containers (§ 5.3), and a service calls its neighbour by name (`http://osrm-car:5000`), which a
    `172.30.0.0/24` entry cannot match because CIDR entries apply to numeric hosts only. The request then
    goes to the proxy, the proxy cannot resolve the name, and the service is never asked. Measure before
    changing anything:
    `docker compose exec -T routing-gateway env | grep -i proxy`,
    then replay § 6.7's `bun -e` probe as
    `docker compose exec -T -e HTTP_PROXY= -e http_proxy= -e HTTPS_PROXY= -e https_proxy= -e ALL_PROXY= -e all_proxy= routing-gateway bun -e '<same fetch>'`.
    A route from that replay means the proxy, not the data. Fix: `./scripts/enable-proxy.sh` (it now derives
    `noProxy` from `docker-compose.yml`'s service names) or `./scripts/disable-proxy.sh`, then
    `docker compose up -d --force-recreate` — **never** `-v`, and an `exec -e` override only ever proves the
    diagnosis, because a container's environment is fixed when it is created.
  - **A graph that does not cover the test points.** If the probe reaches OSRM (the gateway reports an
    `upstream_code`, or the message mentions matching edges / coordinates near a point), read what is
    mounted: `docker compose exec -T osrm-car cat "/data/${MAP_REGION}.metadata.json"` prints the `region`,
    `areas` and `bbox` `build-routing.sh` recorded for the graph that container is serving. If that bbox is
    not the area under test, point `MAP_OSRM_DATA_DIR` at the matching routing directory or rebuild it
    (§ 6.5).
  Restarting a container is not a step in either branch: it reloads the same graph into the same environment.
- **Compose says the network must be recreated after a `git pull`** (the project subnet is pinned to
  `172.30.0.0/24`) — `docker compose down` once, **without** `-v`, then `up -d` again. Containers
  are recreated; volumes and built data stay.
- **`Pool overlaps with other one on this address space`** — something already uses `172.30.0.0/24`; change the subnet
  and `TRUSTED_PROXY_IPS` together (§ A2's note).

### 9.4 Everything else

- **Services killed shortly after `up -d`, or `oom=true` in § 7.1** — 6 GiB is tight for five live
  map services. Keep Nominatim stopped, run one OSRM profile at a time, or move the VM to 8 GiB.
  `docker compose restart` is not a fix; `free -h` before and after is the evidence.
- **A script fails with an empty-looking path** (`cannot open '' `, `/borobiya.pmtiles`) — this
  terminal never ran the loader block, § 2.1.
- **`bun: command not found`** on a host where you expected it — **A5b** installs it into
  `/usr/local/bin`; `/usr/local/bin/bun --version` proves the binary is there and your `PATH` is not.
  If A5b was skipped because the clone is not there yet, that is the expected state, not a failure.
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
- **This runbook quotes no build durations, on purpose.** Nothing in the repo records a measured one,
  and a number invented here would be the first thing a reader blames when the run is slower. The only
  time budgets that *are* encoded in code are Nominatim's: the Compose healthcheck gives it
  `start_period: 60m` before failures count, and the setup script waits
  `SETUP_NOMINATIM_TIMEOUT_MIN` minutes (default 90, accepted 1–720). Everything else is bounded by
  your dataset, not by this file.
- This runbook covers the reference Ubuntu VM. It is not the containerized `bun run dev` loop in
  `docs/DEVELOPMENT.md`, and it does not open the app in a browser: a green step 13 means the map
  services answer, not that the UI was exercised.
- This document was rewritten and then audited against the pipeline scripts on 2026-10-23 (every
  quoted output line, flag, path and Compose field below was re-read from `map-server/scripts/`,
  `docker-compose.yml`, `.env.example` and `scripts/`). **No step has been executed end-to-end on the
  VM since that rewrite**, so a step failing on the VM is information about the VM *or* about this
  document — report it either way, and the section that describes that step is the first thing to
  re-check.
- Auditing this document also turned up **four bugs in the scripts it describes**, fixed on 2026-10-23
  with tests written first in the repo's existing shell-script-testing style:
  `setup-ubuntu-vm.sh` interpolated each value straight into a `sed` replacement (a library path
  containing `|` aborted the run with a bare sed error and left `.env` untouched; `&` expanded to the
  whole match), and created `.env` with `cp`, handing every generated secret the process umask (0644)
  on a machine that may have other users; `fetch-planetiler-sources.sh` announced
  `moved the copy that was inside the dataset directory` for a `mv -n` that had **not** moved anything
  (the exit status is success), then re-downloaded 900 MB past a perfectly good local archive; and
  `generate-tiles.sh` / `build-routing.sh` hardcoded **Tehran's bbox as the default for every
  selection**, which is what made a correctly prepared Frankfurt dataset look invalid. The two new
  test files (`scripts/test_env_writer.py`, `map-server/scripts/test_bbox_guard.py`) and the added case
  in `test_fetch_planetiler_sources.py` all run offline; they also caught two mawk-versus-gawk and
  `awk -v` escape bugs in the first draft of the fix, which is the argument for testing shell code at
  all.
- The migration checks in `scripts/test_migration_sql.py` are **textual**: they read
  `packages/server/drizzle/*.sql` for shapes a Postgres server rejects (a quoted type carrying a modifier,
  a file whose statements are not separated the way the journal says, `CREATE EXTENSION` ordered after the
  columns that need it) and they tie the journal to the folder. Nothing in this repository runs the folder
  against a real PostGIS server, so a statement that parses but names something the catalog does not have is
  only caught when somebody installs a fresh database — which is exactly how the `geography(Point,4326)`
  quoting in `0012` survived review. Treat "the migrations applied cleanly" as evidence about *your*
  database, not about the files; the fresh-VM run is the test that counts.
