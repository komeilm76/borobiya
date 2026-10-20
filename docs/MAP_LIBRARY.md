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
| `pinned` | The repository-reviewed date and MD5 checksums in `map-server/regions.json` (default). |
| `latest` | Resolve the newest common dated snapshot available for every selected source. Setup searches back up to 32 UTC days and then persists the concrete resolved date. |
| `YYYY-MM-DD` | A specific dated Geofabrik snapshot. It is accepted only when the official `.md5` sidecar exists for every selected source, or when trusted library metadata already proves that date in offline mode. |

The concrete installed date is stored separately as `MAP_SNAPSHOT_DATE` and
mirrored to `MAP_DATA_VERSION`. After `latest` resolves, ordinary re-runs do
not silently move to a newer release; update deliberately with
`--update-map` or `--snapshot latest`.

Geofabrik does not guarantee that every historical calendar date remains
downloadable forever. A date is usable only while its dated PBF and official
MD5 sidecar are available for all selected sources, or after it has already
been downloaded and verified into the library.

### Source policy

`MAP_SOURCE_POLICY` controls downloads only:

| Value | Behavior |
|---|---|
| `cache-first` | Default. Reuse a verified library file; download only when missing. |
| `refresh` | Download the selected dated file again, verify it in staging, then atomically replace the library copy. |
| `offline` | Never download map sources. Fail with the exact missing library path instead. `latest` cannot be resolved in this mode. |

Checksums are verified in every mode. A corrupt library file is never used
just because it exists.

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
the selected city.

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
`MAP_OSRM_DATA_DIR` for OSRM, and `MAP_PHOTON_DATA_DIR` for Photon. The old
project-local paths remain only as Compose fallbacks for a checkout that has
not run the new setup yet.

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
export MAP_LIBRARY_DIR="${MAP_LIBRARY_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/borobiya/map-library}"
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

For a pinned Tehran-only or catalog-era `borobiya` dataset, it checks the
manifest hashes before moving anything. Sources, crops, merged PBF, PMTiles,
OSRM graphs, Photon index, and stamps are moved into the standardized
library; a version-3 provenance manifest is generated there. The historical
Iran `iran-latest` filename is accepted only when its MD5, byte count, data
date, and timestamp prove it is exactly the pinned dated snapshot.

If legacy hashes do not prove the dataset, migration is skipped without
deleting the old files and the normal library build proceeds.

## 6. Integrity and provenance

- Pinned sources use MD5 values committed in `regions.json`.
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

Do not edit catalog checksums to accept a mismatched download. Delete or
replace the bad library file and download the official dated file again.

## 7. Offline boundary

The library saves all **map content** needed by the runtime dataset. It does
not contain Docker images, Docker volumes, PostgreSQL application data, apt
packages, Java, Osmium, Bun dependencies, Planetiler/Photon tool JARs, or the
Nominatim database volume. Those remain separate installation/runtime
concerns.

Once those prerequisites and service images are installed, a complete active
dataset in the library can be launched and verified without downloading map
data again.
