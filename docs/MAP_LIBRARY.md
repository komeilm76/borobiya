# Borobiya Map Library

> TL;DR: map content lives in a project-independent, standardized library at
> `${XDG_DATA_HOME:-$HOME/.local/share}/borobiya/map-library` unless
> `MAP_LIBRARY_DIR` says otherwise. It contains one active Geofabrik release
> per country, the city crops for that release, and one complete generated
> dataset bundle (merged PBF, PMTiles, OSRM graphs, and Photon index) so the
> map stack can launch offline. Docker images, OS packages, Java, Osmium,
> and tool JARs are managed separately and are not part of this library.

## 1. Concepts

### Snapshot

A **snapshot** is one dated Geofabrik/OpenStreetMap release used by every
source in the active dataset. Keeping one date across all selected countries
avoids mixing object versions in the merged PBF.

`MAP_SNAPSHOT` accepts:

| Value | Meaning |
|---|---|
| `pinned` | The repository-reviewed date in `map-server/regions.json` (default). Sources with committed MD5s use those pins; sidecar-backed sources resolve the official MD5 on first online use and cache it in the library. |
| `latest` | Resolve the newest common dated snapshot available for every selected source. Setup searches back up to 32 UTC days and then persists the concrete resolved date. |
| `YYYY-MM-DD` | A specific dated Geofabrik snapshot. `cache-first` setup verifies existing sources or retrieves the official `.md5` and dated PBF; if either has expired (HTTP 404/410), it searches for a newer available date. Offline mode requires previously trusted library metadata. |

The concrete installed date is stored separately as `MAP_SNAPSHOT_DATE` and
mirrored to `MAP_DATA_VERSION`. Before strict offline serving, `vm.py` checks
both fields against the saved selection (`pinned` means the repository's
reviewed date), `.env`'s `MAP_SNAPSHOT`, and the active map pointer. It also
compares `.env`'s `MAP_BBOX` numerically with the active pointer's union bbox;
otherwise the gateway could advertise bounds for a different area. It refuses
symlinked library paths/artifacts rather than serving outside the selected
library. When `vm.py launch` completes the setup pipeline
for a saved `latest` selection, it also atomically saves that verified date to
`.vm-map.json`; a failed setup leaves `latest` pending for retry. Ordinary
re-runs keep the installed date **while its sources remain cached**. To request a
new release deliberately, use `vm-map.py --snapshot latest` or the setup
script's `--update-map`.

With `cache-first` VM setup, the requested date is tried in this order: reuse
the matching verified dataset/source extracts; fetch missing dated extracts
from Geofabrik and check their official MD5; if a required dated PBF or MD5
sidecar returns HTTP 404/410, try the newest common **dated** snapshot in the
last 32 UTC days (skipping dates whose PBF/sidecar already failed), verifying
every source before building. A successful fallback is saved as the concrete
date in `.env` and, through `vm.py launch`, `.vm-map.json`; a failed build does
not pin `.vm-map.json`. No fallback occurs on a timeout/HTTP 403/checksum
mismatch: those require investigation, not a different map. A proxy can itself
return 404, so inspect its behavior if repeated candidates fail. `--offline`
never contacts Geofabrik; `refresh` keeps its explicit-date semantics. Direct
`prepare-regions-pbf.sh` runs do not change the VM selection; use `vm.py launch`
for automatic fallback and persistence.

### Source policy

`MAP_SOURCE_POLICY` controls downloads only:

| Value | Behavior |
|---|---|
| `cache-first` | Default. Reuse verified cache; download missing sources. VM setup automatically tries another dated snapshot only on source/sidecar HTTP 404/410, as described above. |
| `refresh` | Download the selected dated file again, verify it in staging, then atomically replace the library copy. |
| `offline` | Never download map sources. Fail with the exact missing library path instead. `latest` cannot be resolved in this mode. |

Checksums are verified in every mode. A corrupt library file is never used
just because it exists. If a cached source's MD5 or size differs from its
trusted metadata, `cache-first` downloads a **same-date** replacement into a
temporary file and swaps it in only after verification. A failed download leaves
the original file untouched; a downloaded checksum mismatch stops without
switching dates. `offline` still refuses a corrupt cache without contacting the
network.

## 2. Standard layout

```text
<map-library>/
  current.json
  sources/
    <continent>/<country>/<source>/<YYYY-MM-DD>/
      <source>-<YYMMDD>.osm.pbf
      <source>-<YYMMDD>.osm.pbf.md5
      source.json
  crops/
    <continent>/<country>/<city>/<YYYY-MM-DD>/
      <country>-<city>.osm.pbf
      <country>-<city>.source.json
  planetiler-sources/
    natural_earth_vector.sqlite.zip
    natural_earth_vector.sqlite.zip.sha256
    lake_centerline.shp.zip
    water-polygons-split-3857.zip
  datasets/
    current -> <YYYY-MM-DD>/<fingerprint>
    <YYYY-MM-DD>/<fingerprint>/
      borobiya.osm.pbf
      borobiya.source.json
      borobiya.pmtiles
      borobiya.metadata.json
      routing/{car,bicycle,foot}/
      geocoding/photon_data/
      geocoding/.borobiya-pbf.sha256
```

Examples:

```text
sources/asia/ir/iran/2026-10-18/iran-261018.osm.pbf
sources/europe/de/hessen/2026-10-18/hessen-261018.osm.pbf
crops/asia/ir/tehran/2026-10-18/ir-tehran.osm.pbf
crops/europe/de/frankfurt/2026-10-18/de-frankfurt.osm.pbf
```

The catalog's continent assignment is explicit in `map-server/regions.json`.
Regional Geofabrik extracts remain regional files: “one version per country”
means one release date for that country, not an inefficient requirement to
download a whole-country PBF when a smaller official regional extract covers
the selected city. The library root must be outside the repository checkout;
the setup form also requires an absolute, whitespace-free path using safe
`.env`/Compose characters (`A-Z`, `a-z`, digits, `/`, `.`, `_`, `@`, `+`, `-`).


The dataset fingerprint is derived from the snapshot date and canonical area
selection. Runtime paths are persisted in `.env`:

```env
MAP_LIBRARY_DIR=/home/<user>/.local/share/borobiya/map-library
MAP_SNAPSHOT=pinned
MAP_SNAPSHOT_DATE=2026-10-18
MAP_SOURCE_POLICY=cache-first
MAP_DATASET_DIR=/home/<user>/.local/share/borobiya/map-library/datasets/2026-10-18/<fingerprint>
MAP_DATA_DIR=<same as MAP_DATASET_DIR>
MAP_OSRM_DATA_DIR=<MAP_DATASET_DIR>/routing
MAP_PHOTON_DATA_DIR=<MAP_DATASET_DIR>/geocoding
MAP_PBF=<MAP_DATASET_DIR>/borobiya.osm.pbf
MAP_DATA_VERSION=2026-10-18
```

Compose mounts `MAP_DATASET_DIR` for Martin/Nominatim,
`MAP_OSRM_DATA_DIR` for OSRM, and `MAP_PHOTON_DATA_DIR` for Photon. Before setup
writes those paths, Compose uses isolated empty placeholders under the external
library's `.compose-unconfigured/` directory. This avoids creating project-local
map data or occupying `datasets/current` and the standard routing/geocoding
paths before the library is initialized.

## 3. Normal setup and updates

The automated setup form asks for the library path, snapshot, source policy,
countries, and cities on a first/interactive (re)selection:

```bash
./scripts/setup-ubuntu-vm.sh
```

Equivalent non-interactive examples:

```bash
# Repository-pinned snapshot, cache-first (defaults)
./scripts/setup-ubuntu-vm.sh --yes --regions ir-tehran

# Tehran + Frankfurt from one specific dated snapshot
./scripts/setup-ubuntu-vm.sh --regions ir-tehran,de-frankfurt --snapshot 2026-10-18

# Deliberately update the saved selection to the newest common snapshot
./scripts/setup-ubuntu-vm.sh --update-map

# Force source files for the selected date to be downloaded again
./scripts/setup-ubuntu-vm.sh --refresh-sources

# Use only verified content already in the library
./scripts/setup-ubuntu-vm.sh --offline

# Print the plan without writing or downloading map data
./scripts/setup-ubuntu-vm.sh --dry-run --regions ir-tehran,de-frankfurt
```

Equivalent environment inputs are `SETUP_SNAPSHOT`,
`SETUP_SOURCE_POLICY`, and `SETUP_MAP_LIBRARY`.

After all per-area acceptance checks pass, setup:

1. Writes `current.json` and updates `datasets/current`.
2. Prunes other snapshot-date directories for the selected countries.
3. Prunes inactive generated dataset bundles.
4. Removes a verified-replaced stale OSRM backup inside the active dataset.

Unselected countries keep their last single release until they are selected
for a later build/update. During an update, new files are staged and verified
before replacement, so a second release can exist temporarily; at steady
state the retention rule is one release per country and one active dataset.

## 4. Manual pipeline commands

Load the setup-managed paths in every new terminal:

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
```

Then the normal pipeline uses the library paths:

```bash
./map-server/scripts/prepare-regions-pbf.sh
./map-server/scripts/verify-map-pbf.sh "$MAP_PBF"
./map-server/scripts/generate-tiles.sh
./map-server/scripts/build-routing.sh
```

Inspect or dry-run library maintenance directly:

```bash
cat "$MAP_LIBRARY_DIR/current.json"

eval "$(python3 map-server/scripts/map_library.py current --library "$MAP_LIBRARY_DIR")"
python3 map-server/scripts/map_library.py prune \
  --library "$MAP_LIBRARY_DIR" \
  --selection "$ACTIVE_REGION_IDS" \
  --snapshot-date "$ACTIVE_SNAPSHOT_DATE" \
  --dataset-dir "$ACTIVE_DATASET_DIR" \
  --dry-run
```

## 5. Migration from project-local storage

On its first real run after upgrading, setup looks for verified artifacts in
the old locations:

```text
map-server/data/
map-server/osrm/data/
map-server/photon/data/
```

For a pinned Tehran-only or catalog-era `borobiya` dataset, migration checks
the manifest's selection, snapshot, bounds, crop strategy, and content hashes
before moving anything. In particular, a Tehran v1 manifest must prove the
catalog Tehran bbox and `smart` crop strategy; its crop hash alone is not
accepted as provenance. Sources, crops, merged PBF, PMTiles, OSRM graphs,
Photon index, and stamps are moved into the standardized library; a version-3
provenance manifest is generated there. The historical Iran `iran-latest`
filename is accepted only when its MD5, byte count, data date, and timestamp
prove it is exactly the pinned dated snapshot.

If legacy hashes do not prove the dataset, migration is skipped without
deleting the old files and the normal library build proceeds.

## 6. Integrity and provenance

- Pinned sources use committed catalog MD5s where available; sidecar-backed pinned sources use Geofabrik's official `.md5` sidecars and cache the verified checksum in library metadata.
- Specific/latest snapshots use Geofabrik's official `.md5` sidecars.
- Each source directory also contains `source.json` with URL, snapshot date,
  data timestamp (when present in the PBF header), byte count, MD5, SHA-256,
  continent/country, and library-relative path.
- City crop metadata records the source SHA-256, bbox, Osmium version, and
  snapshot date.
- Dataset manifests are version 3 and record the snapshot block, storage
  fingerprint, source/crop library paths, and merged SHA-256.
- PMTiles and OSRM metadata record the dataset PBF SHA-256 and snapshot date.
- The Photon stamp records the exact dataset SHA-256 used for its index.
- A setup fast-path re-hashes library sources/crops, checks source MD5/size and metadata, and requires city-crop metadata to match the installed Osmium version; missing or altered cache files are rebuilt instead of being accepted by existence alone.

Do not edit catalog checksums to accept a mismatched download. Delete or
replace the bad library file and download the official dated file again.

## 7. Clear map-data caches

`scripts/clear-map-cache.sh` previews a cleanup by default. It clears the
standard library's source PBFs, city crops, active/generated dataset bundles,
and known legacy project-local map artifacts. It preserves `.env`, unrelated
files in the library, and Planetiler/Photon tool JARs. It stops only the map
services before an applied cleanup when Docker is available. The Nominatim
volume is excluded unless explicitly requested; if you preserve it, keep the
same area selection for the next setup run. Before changing areas, include the
old Nominatim import volume too so it cannot be reused for a different selection.

```bash
# Review exactly what would be removed (default behavior)
./scripts/clear-map-cache.sh --dry-run

# Apply after typing CLEAR
./scripts/clear-map-cache.sh --apply

# Also delete this Compose project's Nominatim import database volume
# (it must be imported again); the app's Postgres volume is never targeted.
./scripts/clear-map-cache.sh --include-nominatim-volume --apply
```

`--yes` applies without the confirmation prompt and should be used only after
reviewing the dry-run. Clearing these caches removes the offline map content;
setup must download/rebuild it before the map stack can serve that selection
again. Docker images/build cache, the application database volume, OS packages,
Java, Osmium, and tool JARs are deliberately **not** removed. If recovering
from a Docker `no space left on device` error, first check whether the Docker
and containerd storage filesystems are the same filesystem as the map library;
this script does not prune Docker's image/build cache.

## 8. Offline boundary

The library saves all **map content** needed by the runtime dataset. It does
not contain Docker images, Docker volumes, PostgreSQL application data, apt
packages, Java, Osmium, Bun dependencies, Planetiler/Photon tool JARs, or the
Nominatim database volume. Those remain separate installation/runtime
concerns.

The three global reference layers Planetiler's OpenMapTiles profile wants on
top of the dataset PBF (Natural Earth, OSM lake centerlines, OSM water polygons)
**are** map content, and they live in `planetiler-sources/` rather than inside a
dataset bundle: they do not vary with the selected areas or snapshot, so caching
them per dataset would re-download roughly 1.3 GB for every selection. Their
third-party hosts fail independently of Geofabrik, which is why
`map-server/scripts/fetch-planetiler-sources.sh` owns that fetch (resume, retry,
archive validation, mirror overrides, SHA-256 stamps) and `generate-tiles.sh`
points Planetiler's `--download-dir` at the same directory — with the files
present, Planetiler issues no request for them and a build needs no internet.

Once those prerequisites and service images are installed, a complete active
dataset in the library can be launched and verified without downloading map
data again.
