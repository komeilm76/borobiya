#!/usr/bin/env bash
# Prepare the shared Borobiya dataset PBF for the selected areas.
#
# Selection comes from MAP_REGION_IDS (comma-separated area IDs from
# map-server/regions.json, e.g. "ir-tehran" or "ir-tehran,de-Frankfurt,gb";
# list them with: python3 map-server/scripts/regions.py list). For every
# selected area this script downloads its pinned, MD5-verified Geofabrik
# snapshot extract (cached under data/source/), crops city bounding boxes
# with Osmium (cached under data/crops/), merges everything into one
# dataset PBF, and writes a version-2 provenance manifest next to it.
# Planetiler, OSRM, and the Nominatim -> Photon import all consume that
# single merged PBF, exactly as the historical Tehran-only crop was shared.
#
# Re-running is safe: a dataset that already verifies for the requested
# selection is left untouched, verified crops are reused, and changing the
# selection rebuilds only the merge (plus any missing crops/downloads).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-$REPO_ROOT/map-server/data}"
# MAP_REGION is the dataset slug: it names the merged PBF, the PMTiles
# archive (Martin source), and the OSRM graphs. Keep it stable ("borobiya")
# regardless of which areas are selected.
MAP_REGION="${MAP_REGION:-borobiya}"
MAP_REGION_IDS="${MAP_REGION_IDS:-ir-tehran}"
# Pinned to Ubuntu 24.04's apt osmium-tool release (the target VM); keep in
# sync with .env.example and docs/MAP_SERVER.md. Override only after
# reviewing `osmium --version` on the machine that produces the crops.
MAP_OSMIUM_VERSION="${MAP_OSMIUM_VERSION:-1.16.0}"
MAP_CROPPED_PBF="${MAP_CROPPED_PBF:-}"

fail() {
  printf 'prepare-regions-pbf: %s\n' "$*" >&2
  exit 1
}

md5_file() {
  if command -v md5sum >/dev/null 2>&1; then
    md5sum "$1" | awk '{print tolower($1)}'
  elif command -v md5 >/dev/null 2>&1; then
    md5 -q "$1" | tr '[:upper:]' '[:lower:]'
  else
    fail 'md5sum (Linux) or md5 (macOS) is required to verify the Geofabrik checksums'
  fi
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print tolower($1)}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print tolower($1)}'
  else
    fail 'sha256sum or shasum is required to record the source checksums'
  fi
}

[[ "$MAP_REGION" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail 'MAP_REGION (dataset slug) must be a lowercase slug'
[[ "$MAP_OSMIUM_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'MAP_OSMIUM_VERSION must use a three-part version'
command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required to resolve the region catalog'

# Resolve + canonicalize the selection first, so typos fail before any
# download or crop work starts.
if ! resolved_selection="$(python3 "$SCRIPT_DIR/regions.py" resolve "$MAP_REGION_IDS")"; then
  fail "invalid MAP_REGION_IDS '$MAP_REGION_IDS' (see above; list areas with: python3 $SCRIPT_DIR/regions.py list)"
fi
eval "$resolved_selection"
MAP_REGION_IDS="$REGION_IDS"
export MAP_REGION_IDS

command -v curl >/dev/null 2>&1 || fail 'curl is required to download the pinned PBFs'
command -v osmium >/dev/null 2>&1 || fail 'osmium-tool is required to crop and merge the PBFs'
osmium_version="$(osmium --version 2>&1 | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+[.][0-9]+[.][0-9]+$/) { print $i; exit } }')"
[[ -n "$osmium_version" ]] || fail 'could not read a three-part osmium-tool version from `osmium --version`'
[[ "$osmium_version" == "$MAP_OSMIUM_VERSION" ]] || \
  fail "osmium-tool $MAP_OSMIUM_VERSION is required (found $osmium_version); if the installed version is the reviewed one, set MAP_OSMIUM_VERSION=$osmium_version in .env and reload it (set -a; source .env; set +a), or run once with: MAP_OSMIUM_VERSION=$osmium_version $0"

mkdir -p "$MAP_DATA_DIR/source" "$MAP_DATA_DIR/crops"
MAP_DATA_DIR="$(cd -- "$MAP_DATA_DIR" && pwd)"
merged_pbf="${MAP_CROPPED_PBF:-$MAP_DATA_DIR/$MAP_REGION.osm.pbf}"
manifest="$MAP_DATA_DIR/$MAP_REGION.source.json"
mkdir -p "$(dirname -- "$merged_pbf")"

# Fast path: the requested selection is already built and verified.
if [[ -s "$merged_pbf" && -s "$manifest" ]]; then
  if MAP_BBOX="$UNION_BBOX" "$SCRIPT_DIR/verify-map-pbf.sh" "$merged_pbf" >/dev/null 2>&1; then
    printf 'Dataset already prepared for areas: %s\n' "$MAP_REGION_IDS"
    MAP_BBOX="$UNION_BBOX" "$SCRIPT_DIR/verify-map-pbf.sh" "$merged_pbf"
    exit 0
  fi
  printf 'Existing dataset does not match the requested selection; rebuilding the merge.\n'
elif [[ -e "$merged_pbf" && "${MAP_CROP_OVERWRITE:-0}" != '1' ]]; then
  fail "a dataset PBF without a provenance manifest already exists; inspect it, or set MAP_CROP_OVERWRITE=1 to replace it: $merged_pbf"
fi

printf 'Selected areas: %s (union bbox %s, ~%s MB of source downloads)\n' \
  "$MAP_REGION_IDS" "$UNION_BBOX" "$APPROX_DOWNLOAD_MB"

# ---- 1. Source extracts: download once, verify the pinned MD5 every run ----
declare -A source_path_by_id=()
declare -A source_sha_by_id=()
while IFS=$'\t' read -r source_id source_url source_file_name source_md5 source_bytes _approx_mb; do
  source_pbf="$MAP_DATA_DIR/source/$source_file_name"
  if [[ ! -s "$source_pbf" ]]; then
    source_tmp="$source_pbf.part"
    trap 'rm -f "${source_tmp:-}"' EXIT
    printf 'Downloading Geofabrik snapshot extract %s...\n' "$source_file_name"
    curl -fL --retry 3 --retry-delay 2 "$source_url" -o "$source_tmp"
    mv -- "$source_tmp" "$source_pbf"
    trap - EXIT
  fi
  actual_md5="$(md5_file "$source_pbf")"
  [[ "$actual_md5" == "$source_md5" ]] || \
    fail "source PBF MD5 mismatch for $source_id: expected $source_md5, received $actual_md5; refusing to crop (delete $source_pbf to re-download)"
  if [[ -n "$source_bytes" ]]; then
    actual_bytes="$(wc -c < "$source_pbf" | tr -d '[:space:]')"
    [[ "$actual_bytes" == "$source_bytes" ]] || \
      fail "source PBF size mismatch for $source_id: expected $source_bytes bytes, received $actual_bytes"
  fi
  source_path_by_id["$source_id"]="$source_pbf"
  source_sha_by_id["$source_id"]="$(sha256_file "$source_pbf")"
done < <(python3 "$SCRIPT_DIR/regions.py" sources "$MAP_REGION_IDS")

# ---- 2. Per-area crops (whole countries merge straight from the source) ----
merge_inputs=()
while IFS=$'\t' read -r area_id _country_id source_id area_bbox area_name; do
  source_pbf="${source_path_by_id[$source_id]}"
  if [[ "$area_bbox" == 'ALL' ]]; then
    printf 'Area %s: whole %s extract (no crop)\n' "$area_id" "$source_id"
    merge_inputs+=("$source_pbf")
    continue
  fi
  crop_pbf="$MAP_DATA_DIR/crops/$area_id.osm.pbf"
  crop_meta="$MAP_DATA_DIR/crops/$area_id.source.json"
  if python3 "$SCRIPT_DIR/regions.py" verify-crop \
      --meta "$crop_meta" --crop "$crop_pbf" --area "$area_id" \
      --source-sha256 "${source_sha_by_id[$source_id]}" >/dev/null 2>&1; then
    printf 'Area %s (%s): reusing verified crop\n' "$area_id" "$area_name"
  else
    crop_tmp="$MAP_DATA_DIR/crops/.$area_id.$$.osm.pbf"
    trap 'rm -f "${crop_tmp:-}"' EXIT
    printf 'Area %s (%s): cropping bbox %s from %s...\n' "$area_id" "$area_name" "$area_bbox" "$(basename -- "$source_pbf")"
    osmium extract --strategy=smart --bbox="$area_bbox" --set-bounds \
      --output="$crop_tmp" "$source_pbf"
    [[ -s "$crop_tmp" ]] || fail "osmium extract did not produce a non-empty crop for $area_id"
    osmium fileinfo "$crop_tmp" >/dev/null
    mv -- "$crop_tmp" "$crop_pbf"
    trap - EXIT
    python3 "$SCRIPT_DIR/regions.py" write-crop-meta \
      --meta "$crop_meta" --crop "$crop_pbf" --area "$area_id" \
      --source-sha256 "${source_sha_by_id[$source_id]}" \
      --osmium-version "$osmium_version" >/dev/null
  fi
  merge_inputs+=("$crop_pbf")
done < <(python3 "$SCRIPT_DIR/regions.py" areas "$MAP_REGION_IDS")

# ---- 3. Merge into the single shared dataset PBF + provenance manifest ----
merged_tmp="$(dirname -- "$merged_pbf")/.$MAP_REGION.$$.osm.pbf"
trap 'rm -f "${merged_tmp:-}"' EXIT
printf 'Merging %d area input(s) into %s...\n' "${#merge_inputs[@]}" "$merged_pbf"
osmium merge --output="$merged_tmp" "${merge_inputs[@]}"
[[ -s "$merged_tmp" ]] || fail 'osmium merge did not produce a non-empty dataset PBF'
osmium fileinfo "$merged_tmp" >/dev/null
mv -- "$merged_tmp" "$merged_pbf"
trap - EXIT

python3 "$SCRIPT_DIR/regions.py" write-manifest \
  --data-dir "$MAP_DATA_DIR" --dataset "$MAP_REGION" \
  --selection "$MAP_REGION_IDS" --merged "$merged_pbf" \
  --osmium-version "$osmium_version"

printf 'Prepared shared dataset PBF: %s (%s bytes)\n' "$merged_pbf" "$(wc -c < "$merged_pbf" | tr -d '[:space:]')"
printf 'Areas: %s\nUnion bbox (MAP_BBOX): %s\n' "$MAP_REGION_IDS" "$UNION_BBOX"
printf 'Use this exact input for Planetiler, OSRM, and the Nominatim → Photon import: MAP_PBF=%s\n' "$merged_pbf"
