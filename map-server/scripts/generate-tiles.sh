#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-$REPO_ROOT/map-server/data}"
# MAP_REGION is the stable dataset slug (PMTiles/Martin source name);
# MAP_REGION_IDS carries the selected areas from regions.json.
MAP_REGION="${MAP_REGION:-borobiya}"
MAP_REGION_IDS="${MAP_REGION_IDS:-ir-tehran}"
MAP_BBOX="${MAP_BBOX:-51.0,35.5,51.7,35.9}"
MAP_DATA_VERSION="${MAP_DATA_VERSION:-2026-10-18}"
MAP_MIN_ZOOM="${MAP_MIN_ZOOM:-0}"
MAP_MAX_ZOOM="${MAP_MAX_ZOOM:-14}"
# The canonical merged dataset PBF is the default; explicit paths remain available for audited local setups.
MAP_PBF="${MAP_PBF:-$MAP_DATA_DIR/$MAP_REGION.osm.pbf}"
PLANETILER_VERSION="0.10.2"
PLANETILER_SHA256="f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d"
PLANETILER_JAR="$MAP_DATA_DIR/planetiler-$PLANETILER_VERSION.jar"
PLANETILER_URL="https://github.com/onthegomap/planetiler/releases/download/v$PLANETILER_VERSION/planetiler.jar"

fail() {
  printf 'generate-tiles: %s\n' "$*" >&2
  exit 1
}

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
MAP_DATA_DIR="$MAP_DATA_DIR" MAP_REGION="$MAP_REGION" MAP_REGION_IDS="$MAP_REGION_IDS" MAP_BBOX="$MAP_BBOX" \
  "$SCRIPT_DIR/verify-map-pbf.sh" "$MAP_PBF"
PLANETILER_JAR="$MAP_DATA_DIR/planetiler-$PLANETILER_VERSION.jar"
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

# Fetch the pinned JAR only if it is absent or fails the published checksum.
if [[ ! -f "$PLANETILER_JAR" ]] || [[ "$(sha256_file "$PLANETILER_JAR")" != "$PLANETILER_SHA256" ]]; then
  jar_tmp="$PLANETILER_JAR.part"
  trap 'rm -f "${jar_tmp:-}"' EXIT
  printf 'Downloading Planetiler %s...\n' "$PLANETILER_VERSION"
  curl -fL --retry 2 "$PLANETILER_URL" -o "$jar_tmp"
  actual_sha256="$(sha256_file "$jar_tmp")"
  [[ "$actual_sha256" == "$PLANETILER_SHA256" ]] || fail "Planetiler JAR checksum mismatch: $actual_sha256"
  mv "$jar_tmp" "$PLANETILER_JAR"
  trap - EXIT
fi

[[ "$(sha256_file "$PLANETILER_JAR")" == "$PLANETILER_SHA256" ]] || fail 'Planetiler JAR checksum verification failed'

# Keep temporary artifacts outside Martin's source directory until a complete build is ready.
temp_output="$(dirname -- "$MAP_DATA_DIR")/.$MAP_REGION.$$.pmtiles"
metadata_tmp="$(dirname -- "$MAP_DATA_DIR")/.$MAP_REGION.$$.metadata.json"
trap 'rm -f "${temp_output:-}" "${metadata_tmp:-}"' EXIT
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
    --download --force
)
[[ -s "$temp_output" ]] || fail 'Planetiler did not produce a non-empty PMTiles archive'

python3 - "$metadata_tmp" "$MAP_REGION" "$MAP_REGION_IDS" "$MAP_DATA_VERSION" \
  "$west" "$south" "$east" "$north" "$map_min_zoom" "$map_max_zoom" \
  "$(sha256_file "$MAP_PBF")" "$(sha256_file "$MAP_DATA_DIR/$MAP_REGION.source.json")" \
  "$(sha256_file "$temp_output")" <<'PYEOF'
import json
import sys

(output, region, region_ids, data_version, west, south, east, north,
 min_zoom, max_zoom, pbf_sha256, manifest_sha256, pmtiles_sha256) = sys.argv[1:]
metadata = {
    "region": region,
    "areas": [area for area in region_ids.split(",") if area],
    "dataVersion": data_version,
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
trap - EXIT
printf 'Created %s (%s bytes)\n' "$OUTPUT" "$(wc -c < "$OUTPUT" | tr -d ' ')"
printf 'Wrote build metadata %s\n' "$METADATA"
