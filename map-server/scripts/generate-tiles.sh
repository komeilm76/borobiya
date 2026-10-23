#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
fail() {
  printf 'generate-tiles: %s\n' "$*" >&2
  exit 1
}

# MAP_REGION is the stable dataset slug (PMTiles/Martin source name);
# MAP_REGION_IDS carries the selected areas from regions.json.
MAP_REGION="${MAP_REGION:-borobiya}"
MAP_REGION_IDS="${MAP_REGION_IDS:-ir-tehran}"
# The bounds must describe THIS selection. The historical Tehran default is kept only for the
# default selection: as an unconditional fallback it made every other area look invalid to
# verify-map-pbf.sh, which then blamed the dataset for a value this script had invented.
MAP_BBOX="${MAP_BBOX:-}"
MAP_BBOX_WAS_SET="${MAP_BBOX:-}"
MAP_DATA_VERSION="${MAP_DATA_VERSION:-}"
MAP_SNAPSHOT_DATE="${MAP_SNAPSHOT_DATE:-$MAP_DATA_VERSION}"
if [[ -n "${MAP_LIBRARY_DIR:-}" ]]; then
  DEFAULT_MAP_LIBRARY_DIR="$MAP_LIBRARY_DIR"
elif [[ -n "${XDG_DATA_HOME:-}" ]]; then
  if [[ "$XDG_DATA_HOME" != /* ]]; then
    printf 'generate-tiles: XDG_DATA_HOME must be absolute; set MAP_LIBRARY_DIR explicitly or correct XDG_DATA_HOME\n' >&2
    exit 1
  fi
  DEFAULT_MAP_LIBRARY_DIR="$XDG_DATA_HOME/borobiya/map-library"
elif [[ -n "${HOME:-}" ]]; then
  if [[ "$HOME" != /* ]]; then
    printf 'generate-tiles: HOME must be absolute to derive the external map library; set MAP_LIBRARY_DIR explicitly\n' >&2
    exit 1
  fi
  DEFAULT_MAP_LIBRARY_DIR="$HOME/.local/share/borobiya/map-library"
else
  printf 'generate-tiles: HOME and XDG_DATA_HOME are unset; set MAP_LIBRARY_DIR to an external absolute path\n' >&2
  exit 1
fi
MAP_LIBRARY_DIR="$DEFAULT_MAP_LIBRARY_DIR"
# shellcheck disable=SC2088 # Match a literal user-supplied ~/ path, then expand it manually.
case "$MAP_LIBRARY_DIR" in
  "~") MAP_LIBRARY_DIR="${HOME:-}" ;;
  "~/"*) MAP_LIBRARY_DIR="${HOME:-}/${MAP_LIBRARY_DIR#~/}" ;;
esac
MAP_DATA_DIR="${MAP_DATA_DIR:-${MAP_DATASET_DIR:-}}"
if [[ -z "$MAP_DATA_DIR" ]]; then
  command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required to resolve the map library dataset'
  if ! library_paths="$(python3 "$SCRIPT_DIR/regions.py" resolve "$MAP_REGION_IDS" \
      --snapshot "${MAP_SNAPSHOT_DATE:-pinned}" --library "$MAP_LIBRARY_DIR" \
      --dataset "$MAP_REGION")"; then
    fail 'could not resolve the standardized map library dataset (see above)'
  fi
  eval "$library_paths"
  MAP_SNAPSHOT_DATE="$SNAPSHOT_DATE"
  # The resolver already computed the selection's real union bounds; use them instead of a default.
  [[ -n "$MAP_BBOX_WAS_SET" ]] || MAP_BBOX="${UNION_BBOX:-}"
fi
if [[ -z "$MAP_BBOX" && "$MAP_REGION_IDS" == "ir-tehran" ]]; then
  MAP_BBOX="51.0,35.5,51.7,35.9"
fi
if [[ -z "$MAP_BBOX" ]]; then
  fail 'MAP_BBOX is not set and the selection was not resolved (MAP_DATA_DIR was given explicitly). ' \
       'Run the loader block from docs/UBUNTU_VM_RUNBOOK.md § 2.1, which exports MAP_BBOX from the ' \
       'resolver, or pass MAP_BBOX=west,south,east,north for this selection. ' \
       'A non-default selection must never fall back to another area'"'"'s bounds.'
fi
if [[ -z "$MAP_SNAPSHOT_DATE" ]]; then
  command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required to resolve the pinned snapshot'
  MAP_SNAPSHOT_DATE="$(python3 "$SCRIPT_DIR/regions.py" pinned-snapshot)"
fi
MAP_DATA_VERSION="${MAP_DATA_VERSION:-$MAP_SNAPSHOT_DATE}"
# Planetiler's OpenMapTiles profile wants three global reference layers in addition to the dataset PBF.
# They are not area- or snapshot-specific, so they are cached once per library (see the fetch script for why
# this project fetches them itself instead of letting Planetiler do it) and pointed at with --download-dir.
MAP_PLANETILER_SOURCES_DIR="${MAP_PLANETILER_SOURCES_DIR:-$MAP_LIBRARY_DIR/planetiler-sources}"
[[ "$MAP_PLANETILER_SOURCES_DIR" == /* ]] || fail 'MAP_PLANETILER_SOURCES_DIR must be an absolute path'
MAP_MIN_ZOOM="${MAP_MIN_ZOOM:-0}"
MAP_MAX_ZOOM="${MAP_MAX_ZOOM:-14}"
# The canonical merged dataset PBF is the default; explicit paths remain available for audited local setups.
MAP_PBF="${MAP_PBF:-$MAP_DATA_DIR/$MAP_REGION.osm.pbf}"
PLANETILER_VERSION="0.10.2"
PLANETILER_SHA256="f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d"
# Tool binaries are managed separately from map content and stay with the
# project tooling, not inside the external map library.
PLANETILER_JAR="${PLANETILER_JAR:-$REPO_ROOT/map-server/tools/planetiler-$PLANETILER_VERSION.jar}"
LEGACY_PLANETILER_JAR="$REPO_ROOT/map-server/data/planetiler-$PLANETILER_VERSION.jar"
PLANETILER_URL="https://github.com/onthegomap/planetiler/releases/download/v$PLANETILER_VERSION/planetiler.jar"

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    fail 'sha256sum or shasum is required to verify the pinned Planetiler JAR and input data'
  fi
}

[[ "$MAP_REGION" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail 'MAP_REGION (dataset slug) must be a lowercase slug'
[[ "$MAP_DATA_VERSION" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]] || fail 'MAP_DATA_VERSION must be a 1-64 character version slug'
[[ "$MAP_MIN_ZOOM" =~ ^[0-9]+$ ]] || fail 'MAP_MIN_ZOOM must be an integer from 0 to 16'
[[ "$MAP_MAX_ZOOM" =~ ^[0-9]+$ ]] || fail 'MAP_MAX_ZOOM must be an integer from 0 to 16'
map_min_zoom=$((10#$MAP_MIN_ZOOM))
map_max_zoom=$((10#$MAP_MAX_ZOOM))
(( map_min_zoom <= 16 && map_max_zoom <= 16 )) || fail 'Planetiler 0.10.2 supports zoom levels up to 16'
(( map_min_zoom <= map_max_zoom )) || fail 'MAP_MIN_ZOOM cannot exceed MAP_MAX_ZOOM'

# Normalize and validate west,south,east,north before passing it to Planetiler.
MAP_BBOX="${MAP_BBOX//[[:space:]]/}"
[[ "$MAP_BBOX" != *, ]] || fail 'MAP_BBOX must contain exactly four coordinates'
IFS=',' read -r west south east north extra_bbox_part <<< "$MAP_BBOX"
[[ -n "${west:-}" && -n "${south:-}" && -n "${east:-}" && -n "${north:-}" && -z "${extra_bbox_part:-}" ]] || \
  fail 'MAP_BBOX must contain west,south,east,north coordinates'
for coordinate in "$west" "$south" "$east" "$north"; do
  awk -v value="$coordinate" 'BEGIN { exit !(value ~ /^[-+]?([0-9]+([.][0-9]*)?|[.][0-9]+)$/) }' || \
    fail 'MAP_BBOX coordinates must be finite decimal numbers'
done
awk -v west="$west" -v south="$south" -v east="$east" -v north="$north" \
  'BEGIN { exit !(west >= -180 && west <= 180 && east >= -180 && east <= 180 && south >= -90 && south <= 90 && north >= -90 && north <= 90 && west < east && south < north) }' || \
  fail 'MAP_BBOX must be an ordered WGS84 west,south,east,north box'

if [[ "$MAP_PBF" != /* ]]; then
  MAP_PBF="$PWD/$MAP_PBF"
fi
[[ -s "$MAP_PBF" ]] || fail "dataset PBF is missing or empty: $MAP_PBF; run map-server/scripts/prepare-regions-pbf.sh first"

command -v java >/dev/null 2>&1 || fail 'Java 21+ is required (Planetiler 0.10.2)'
command -v curl >/dev/null 2>&1 || fail 'curl is required'
command -v awk >/dev/null 2>&1 || fail 'awk is required'
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  fail 'sha256sum or shasum is required to verify the pinned Planetiler JAR'
fi
mkdir -p "$MAP_DATA_DIR"
MAP_DATA_DIR="$(cd -- "$MAP_DATA_DIR" && pwd)"
MAP_DATA_DIR="$MAP_DATA_DIR" MAP_LIBRARY_DIR="$MAP_LIBRARY_DIR" \
  MAP_SNAPSHOT_DATE="$MAP_SNAPSHOT_DATE" MAP_REGION="$MAP_REGION" \
  MAP_REGION_IDS="$MAP_REGION_IDS" MAP_BBOX="$MAP_BBOX" \
  "$SCRIPT_DIR/verify-map-pbf.sh" "$MAP_PBF"
OUTPUT="$MAP_DATA_DIR/$MAP_REGION.pmtiles"
METADATA="$MAP_DATA_DIR/$MAP_REGION.metadata.json"

java_version="$(java -version 2>&1 | awk -F '"' '/version/ { print $2; exit }')"
java_major="${java_version%%.*}"
if [[ "$java_major" == '1' ]]; then
  java_major="$(printf '%s' "$java_version" | cut -d. -f2)"
fi
if [[ ! "$java_major" =~ ^[0-9]+$ ]] || (( java_major < 21 )); then
  fail "Java 21+ is required; found '${java_version:-unknown}'"
fi

mkdir -p "$(dirname -- "$PLANETILER_JAR")"
if [[ ! -f "$PLANETILER_JAR" && -s "$LEGACY_PLANETILER_JAR" ]] && \
   [[ "$(sha256_file "$LEGACY_PLANETILER_JAR")" == "$PLANETILER_SHA256" ]]; then
  legacy_tmp_dir="$(mktemp -d "$(dirname -- "$PLANETILER_JAR")/.planetiler-copy.XXXXXX")"
  legacy_tmp="$legacy_tmp_dir/planetiler.jar"
  trap 'rm -rf -- "${legacy_tmp_dir:-}"' EXIT
  cp -- "$LEGACY_PLANETILER_JAR" "$legacy_tmp"
  mv -- "$legacy_tmp" "$PLANETILER_JAR"
  rmdir -- "$legacy_tmp_dir"
  trap - EXIT
  printf 'Copied verified legacy Planetiler JAR to the project tool cache: %s\n' "$PLANETILER_JAR"
fi

# Fetch the pinned JAR only if it is absent or fails the published checksum.
if [[ ! -f "$PLANETILER_JAR" ]] || [[ "$(sha256_file "$PLANETILER_JAR")" != "$PLANETILER_SHA256" ]]; then
  jar_tmp_dir="$(mktemp -d "$(dirname -- "$PLANETILER_JAR")/.planetiler-download.XXXXXX")"
  jar_tmp="$jar_tmp_dir/planetiler.jar"
  trap 'rm -rf -- "${jar_tmp_dir:-}"' EXIT
  printf 'Downloading Planetiler %s...\n' "$PLANETILER_VERSION"
  curl -fL --retry 2 "$PLANETILER_URL" -o "$jar_tmp"
  actual_sha256="$(sha256_file "$jar_tmp")"
  [[ "$actual_sha256" == "$PLANETILER_SHA256" ]] || fail "Planetiler JAR checksum mismatch: $actual_sha256"
  mv -- "$jar_tmp" "$PLANETILER_JAR"
  rmdir -- "$jar_tmp_dir"
  trap - EXIT
fi

[[ "$(sha256_file "$PLANETILER_JAR")" == "$PLANETILER_SHA256" ]] || fail 'Planetiler JAR checksum verification failed'

# Keep temporary artifacts outside Martin's source directory until a complete build is ready.
temp_dir="$(mktemp -d "$(dirname -- "$MAP_DATA_DIR")/.$MAP_REGION.XXXXXX")"
temp_output="$temp_dir/$MAP_REGION.pmtiles"
metadata_tmp="$temp_dir/$MAP_REGION.metadata.json"
trap 'rm -rf -- "${temp_dir:-}"' EXIT
# Overlap sources first, while a failure is still a sentence rather than a Java stack trace: Planetiler gives
# each source 10 hard-coded seconds to answer a size probe, with no retry, and aborts the whole build when a
# host is slow or down. By the time it runs, every one of these files exists on disk, so it issues no request.
MAP_LIBRARY_DIR="$MAP_LIBRARY_DIR" MAP_DATA_DIR="$MAP_DATA_DIR" \
  MAP_PLANETILER_SOURCES_DIR="$MAP_PLANETILER_SOURCES_DIR" MAP_SOURCE_POLICY="${MAP_SOURCE_POLICY:-cache-first}" \
  "$SCRIPT_DIR/fetch-planetiler-sources.sh"

printf 'Generating %s (version %s, zoom %s-%s, bbox %s) from %s...\n' \
  "$OUTPUT" "$MAP_DATA_VERSION" "$map_min_zoom" "$map_max_zoom" "$MAP_BBOX" "$MAP_PBF"
(
  cd -- "$MAP_DATA_DIR"
  java "-Xmx${PLANETILER_HEAP:-3g}" -jar "$PLANETILER_JAR" \
    --osm-path="$MAP_PBF" \
    --output="$temp_output" \
    --bounds="$MAP_BBOX" \
    --minzoom="$map_min_zoom" \
    --maxzoom="$map_max_zoom" \
    --download-dir="$MAP_PLANETILER_SOURCES_DIR" \
    --download-osm-tile-weights=false \
    --download --force
  # `--download` stays so a source added to the profile in a future Planetiler bump still works, and it is
  # harmless for the three we just cached: Planetiler only fetches a source whose file is absent.
  # `--force` is only "overwrite the output file and ignore disk/RAM warnings" (Planetiler 0.10.2) - it does
  # not re-download anything, and the output here is a fresh temp path, so it is kept for the overwrite half.
  # `--refresh_sources` is deliberately NOT passed: it is the flag that makes Planetiler HEAD every source on
  # every run, which is exactly the request whose 10-second timeout kills a build when a host is unreachable.
)
[[ -s "$temp_output" ]] || fail 'Planetiler did not produce a non-empty PMTiles archive'

python3 - "$metadata_tmp" "$MAP_REGION" "$MAP_REGION_IDS" "$MAP_DATA_VERSION" "$MAP_SNAPSHOT_DATE" \
  "$west" "$south" "$east" "$north" "$map_min_zoom" "$map_max_zoom" \
  "$(sha256_file "$MAP_PBF")" "$(sha256_file "$MAP_DATA_DIR/$MAP_REGION.source.json")" \
  "$(sha256_file "$temp_output")" <<'PYEOF'
import json
import sys

(output, region, region_ids, data_version, snapshot_date, west, south, east, north,
 min_zoom, max_zoom, pbf_sha256, manifest_sha256, pmtiles_sha256) = sys.argv[1:]
metadata = {
    "region": region,
    "areas": [area for area in region_ids.split(",") if area],
    "dataVersion": data_version,
    "snapshotDate": snapshot_date,
    "bbox": [float(west), float(south), float(east), float(north)],
    "minZoom": int(min_zoom),
    "maxZoom": int(max_zoom),
    "sourcePbfSha256": pbf_sha256,
    "sourceManifestSha256": manifest_sha256,
    "pmtilesSha256": pmtiles_sha256,
}
with open(output, "w", encoding="utf-8") as metadata_file:
    metadata_file.write(json.dumps(metadata, separators=(",", ":")) + "\n")
PYEOF
mv -f "$temp_output" "$OUTPUT"
mv -f "$metadata_tmp" "$METADATA"
rmdir -- "$temp_dir"
trap - EXIT
printf 'Created %s (%s bytes)\n' "$OUTPUT" "$(wc -c < "$OUTPUT" | tr -d ' ')"
printf 'Wrote build metadata %s\n' "$METADATA"
