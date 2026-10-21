#!/usr/bin/env bash
# Prepare the shared Borobiya dataset PBF for the selected areas.
#
# Selection comes from MAP_REGION_IDS (comma-separated area IDs from
# map-server/regions.json, e.g. "ir-tehran" or "ir-tehran,de-Frankfurt,gb";
# list them with: python3 map-server/scripts/regions.py list).
#
# Map content lives in the project-independent map library
# (MAP_LIBRARY_DIR, default ~/.local/share/borobiya/map-library):
#   sources/<continent>/<country>/<source>/<snapshot-date>/
#   crops/<continent>/<country>/<city>/<snapshot-date>/
#   datasets/<snapshot-date>/<fingerprint>/
#
# MAP_SNAPSHOT selects the Geofabrik snapshot:
#   pinned       repository-pinned snapshot from regions.json (default)
#   latest       newest common dated snapshot for all selected sources
#   YYYY-MM-DD   a specific dated snapshot
# MAP_SOURCE_POLICY controls downloads:
#   cache-first  reuse a verified library file; download only if missing
#   refresh      download again, verify, then atomically replace the copy
#   offline      never download; fail if a verified library copy is missing
#
# Re-running is safe: a version-3 dataset that already verifies for the
# requested selection/snapshot is left untouched, verified crops are reused,
# and changing the selection/date builds the corresponding library dataset.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

fail() {
  printf 'prepare-regions-pbf: %s\n' "$*" >&2
  exit 1
}

expand_home_path() {
  # shellcheck disable=SC2088 # Match a literal user-supplied ~/ path, then expand it manually.
  case "$1" in
    "~") printf '%s' "${HOME:-}" ;;
    "~/"*) printf '%s/%s' "${HOME:-}" "${1#~/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

if [[ -n "${MAP_LIBRARY_DIR:-}" ]]; then
  DEFAULT_MAP_LIBRARY_DIR="$MAP_LIBRARY_DIR"
elif [[ -n "${XDG_DATA_HOME:-}" ]]; then
  [[ "$XDG_DATA_HOME" == /* ]] || fail 'XDG_DATA_HOME must be absolute; set MAP_LIBRARY_DIR explicitly or correct XDG_DATA_HOME'
  DEFAULT_MAP_LIBRARY_DIR="$XDG_DATA_HOME/borobiya/map-library"
elif [[ -n "${HOME:-}" ]]; then
  [[ "$HOME" == /* ]] || fail 'HOME must be absolute to derive the external map library; set MAP_LIBRARY_DIR explicitly'
  DEFAULT_MAP_LIBRARY_DIR="$HOME/.local/share/borobiya/map-library"
else
  fail 'HOME and XDG_DATA_HOME are unset; set MAP_LIBRARY_DIR to an external absolute path'
fi
MAP_LIBRARY_DIR="$(expand_home_path "$DEFAULT_MAP_LIBRARY_DIR")"
if [[ "$MAP_LIBRARY_DIR" != /* ]]; then
  MAP_LIBRARY_DIR="$PWD/$MAP_LIBRARY_DIR"
fi
[[ "$MAP_LIBRARY_DIR" != *$'\t'* && "$MAP_LIBRARY_DIR" != *$'\n'* && "$MAP_LIBRARY_DIR" != *$'\r'* ]] || \
  fail 'MAP_LIBRARY_DIR must not contain tabs or line breaks (library paths are emitted as TSV)'

# MAP_REGION is the dataset slug: it names the merged PBF, the PMTiles
# archive (Martin source), and the OSRM graphs. Keep it stable ("borobiya")
# regardless of which areas are selected.
MAP_REGION="${MAP_REGION:-borobiya}"
MAP_REGION_IDS="${MAP_REGION_IDS:-ir-tehran}"
MAP_SNAPSHOT="${MAP_SNAPSHOT:-${MAP_SNAPSHOT_DATE:-pinned}}"
MAP_SOURCE_POLICY="${MAP_SOURCE_POLICY:-cache-first}"
# Pinned to Ubuntu 24.04's apt osmium-tool release (the target VM); keep in
# sync with .env.example and docs/MAP_SERVER.md. Override only after
# reviewing `osmium --version` on the machine that produces the crops.
MAP_OSMIUM_VERSION="${MAP_OSMIUM_VERSION:-1.16.0}"
MAP_CROPPED_PBF="${MAP_CROPPED_PBF:-}"

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

is_project_local_regular_file() {
  local candidate="$1" resolved=""
  [[ -f "$candidate" && ! -L "$candidate" ]] || return 1
  if ! resolved="$(python3 - "$candidate" <<'PY'
from pathlib import Path
import sys
try:
    print(Path(sys.argv[1]).resolve(strict=True))
except (OSError, RuntimeError):
    raise SystemExit(1)
PY
  )"; then
    return 1
  fi
  [[ "$resolved" == "$REPO_ROOT/"* ]]
}

[[ "$MAP_REGION" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail 'MAP_REGION (dataset slug) must be a lowercase slug'
[[ "$MAP_OSMIUM_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'MAP_OSMIUM_VERSION must use a three-part version'
case "$MAP_SOURCE_POLICY" in
  cache-first|refresh|offline) ;;
  *) fail "MAP_SOURCE_POLICY must be cache-first, refresh, or offline (got $MAP_SOURCE_POLICY)" ;;
esac
command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required to resolve the region catalog'

# Resolve + canonicalize the selection, snapshot, and standardized library
# paths first, so typos fail before any download or crop work starts.
if ! resolved_selection="$(python3 "$SCRIPT_DIR/regions.py" resolve "$MAP_REGION_IDS" \
    --snapshot "$MAP_SNAPSHOT" --source-policy "$MAP_SOURCE_POLICY" \
    --library "$MAP_LIBRARY_DIR" --dataset "$MAP_REGION")"; then
  fail "invalid map selection/snapshot (see above; list areas with: python3 $SCRIPT_DIR/regions.py list)"
fi
eval "$resolved_selection"
MAP_REGION_IDS="$REGION_IDS"
MAP_SNAPSHOT_DATE="$SNAPSHOT_DATE"
MAP_SNAPSHOT_MODE="$SNAPSHOT_MODE"
MAP_SOURCE_POLICY="$SOURCE_POLICY"
export MAP_REGION_IDS MAP_LIBRARY_DIR MAP_DATASET_DIR MAP_DATA_DIR MAP_PBF
export MAP_PBF_MANIFEST MAP_OSRM_DATA_DIR MAP_PHOTON_DATA_DIR
export MAP_SNAPSHOT MAP_SNAPSHOT_DATE MAP_SNAPSHOT_MODE MAP_SOURCE_POLICY

if [[ -n "$MAP_CROPPED_PBF" && "$MAP_CROPPED_PBF" != "$MAP_PBF" ]]; then
  fail "MAP_CROPPED_PBF is no longer a free-form output override; the standardized dataset PBF is $MAP_PBF"
fi
merged_pbf="$MAP_PBF"
manifest="$MAP_PBF_MANIFEST"

if [[ "$MAP_SOURCE_POLICY" != "offline" ]]; then
  command -v curl >/dev/null 2>&1 || fail 'curl is required to download Geofabrik PBFs'
fi
command -v osmium >/dev/null 2>&1 || fail 'osmium-tool is required to crop and merge the PBFs'
osmium_version="$(osmium --version 2>&1 | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+[.][0-9]+[.][0-9]+$/) { print $i; exit } }')"
[[ -n "$osmium_version" ]] || fail 'could not read a three-part osmium-tool version from `osmium --version`'
[[ "$osmium_version" == "$MAP_OSMIUM_VERSION" ]] || \
  fail "osmium-tool $MAP_OSMIUM_VERSION is required (found $osmium_version); if the installed version is the reviewed one, set MAP_OSMIUM_VERSION=$osmium_version in .env and reload it (set -a; source .env; set +a), or run once with: MAP_OSMIUM_VERSION=$osmium_version $0"

mkdir -p "$MAP_DATA_DIR"

manifest_version() {
  python3 - "$1" <<'PY' 2>/dev/null || true
import json, sys
try:
    print(json.load(open(sys.argv[1], encoding="utf-8")).get("version", ""))
except Exception:
    print("")
PY
}

# Fast path: a current version-3 library dataset already verifies.
if [[ "$MAP_SOURCE_POLICY" != "refresh" && -s "$merged_pbf" && -s "$manifest" && "$(manifest_version "$manifest")" == "3" ]]; then
  if MAP_BBOX="$UNION_BBOX" "$SCRIPT_DIR/verify-map-pbf.sh" "$merged_pbf" >/dev/null 2>&1 && \
     python3 "$SCRIPT_DIR/regions.py" manifest-library-ready \
       --manifest "$manifest" --library "$MAP_LIBRARY_DIR" \
       --osmium-version "$osmium_version" >/dev/null 2>&1; then
    printf 'Dataset already prepared for areas: %s (snapshot %s)\n' "$MAP_REGION_IDS" "$MAP_SNAPSHOT_DATE"
    MAP_BBOX="$UNION_BBOX" "$SCRIPT_DIR/verify-map-pbf.sh" "$merged_pbf"
    exit 0
  fi
  printf 'Existing dataset does not match the requested selection/snapshot; rebuilding it.\n'
elif [[ -e "$merged_pbf" && ! -s "$manifest" && "${MAP_CROP_OVERWRITE:-0}" != '1' ]]; then
  fail "a dataset PBF without a provenance manifest already exists; inspect it, or set MAP_CROP_OVERWRITE=1 to replace it: $merged_pbf"
fi

if [[ "$APPROX_DOWNLOAD_SIZE_UNKNOWN" == "1" ]]; then
  if (( APPROX_DOWNLOAD_MB > 0 )); then
    printf 'Selected areas: %s (union bbox %s, ~%s MB of known source downloads; other sizes unknown)\n' \
      "$MAP_REGION_IDS" "$UNION_BBOX" "$APPROX_DOWNLOAD_MB"
  else
    printf 'Selected areas: %s (union bbox %s, source download sizes unknown)\n' \
      "$MAP_REGION_IDS" "$UNION_BBOX"
  fi
else
  printf 'Selected areas: %s (union bbox %s, ~%s MB of source downloads)\n' \
    "$MAP_REGION_IDS" "$UNION_BBOX" "$APPROX_DOWNLOAD_MB"
fi
if ! sources_output="$(python3 "$SCRIPT_DIR/regions.py" sources "$MAP_REGION_IDS" \
    --snapshot "$MAP_SNAPSHOT_DATE" --source-policy "$MAP_SOURCE_POLICY" \
    --library "$MAP_LIBRARY_DIR")"; then
  fail "could not resolve trusted snapshot sources (see above)"
fi
if ! areas_output="$(python3 "$SCRIPT_DIR/regions.py" areas "$MAP_REGION_IDS" \
    --snapshot "$MAP_SNAPSHOT_DATE" --source-policy "$MAP_SOURCE_POLICY" \
    --library "$MAP_LIBRARY_DIR")"; then
  fail "could not resolve selected area library paths (see above)"
fi
printf 'Snapshot: %s (%s); source policy: %s\n' "$MAP_SNAPSHOT_DATE" "$MAP_SNAPSHOT_MODE" "$MAP_SOURCE_POLICY"
printf 'Map library: %s\nDataset: %s\n' "$MAP_LIBRARY_DIR" "$MAP_DATASET_DIR"

# ---- 1. Source extracts in the standardized library ----
declare -A source_path_by_id=()
declare -A source_sha_by_id=()
while IFS=$'\t' read -r source_id source_url source_file_name source_md5 source_bytes _approx_mb _continent _country _relative source_pbf _snapshot_date; do
  # `regions.py sources` uses `-` for unavailable optional columns. Keep the
  # TSV rectangular because Bash collapses adjacent tab IFS whitespace.
  [[ "$source_md5" != '-' ]] || source_md5=""
  [[ "$source_bytes" != '-' ]] || source_bytes=""
  [[ "$source_pbf" != '-' ]] || source_pbf=""
  source_dir="$(dirname -- "$source_pbf")"
  source_sidecar="${source_pbf}.md5"
  mkdir -p "$source_dir"

  # One-time import of a verified pre-library project-local download. This
  # does not copy tooling or generated artifacts; setup migrates those maps
  # separately.
  if [[ "$MAP_SOURCE_POLICY" != "refresh" && ! -s "$source_pbf" ]]; then
    legacy_candidates=("$REPO_ROOT/map-server/data/source/$source_file_name")
    if [[ "$source_id" == "iran" && "$MAP_SNAPSHOT_DATE" == "2026-10-18" ]]; then
      legacy_candidates+=("$REPO_ROOT/map-server/data/source/iran-latest.osm.pbf")
    fi
    for legacy_source in "${legacy_candidates[@]}"; do
      if is_project_local_regular_file "$legacy_source" && [[ -s "$legacy_source" && -n "$source_md5" && "$(md5_file "$legacy_source")" == "$source_md5" ]]; then
        mv -- "$legacy_source" "$source_pbf"
        printf 'Imported verified legacy source download into the map library: %s\n' "$source_pbf"
        break
      fi
    done
  fi

  download_required=0
  if [[ "$MAP_SOURCE_POLICY" == "refresh" || ! -s "$source_pbf" ]]; then
    download_required=1
  fi
  if (( download_required )); then
    if [[ "$MAP_SOURCE_POLICY" == "offline" ]]; then
      fail "offline source policy: required source $source_id is missing from the map library: $source_pbf"
    fi
    source_tmp_dir="$(mktemp -d "$source_dir/.borobiya-source.XXXXXX")"
    source_tmp="$source_tmp_dir/$source_file_name"
    sidecar_tmp=""
    trap 'rm -rf -- "${source_tmp_dir:-}"' EXIT
    if [[ "$MAP_SNAPSHOT_MODE" != "pinned" ]]; then
      sidecar_tmp="$source_tmp_dir/$source_file_name.md5"
      curl -fL --retry 3 --retry-delay 2 "${source_url}.md5" -o "$sidecar_tmp"
      sidecar_md5="$(awk '{print tolower($1); exit}' "$sidecar_tmp")"
      [[ "$sidecar_md5" == "$source_md5" ]] || \
        fail "official sidecar MD5 for $source_id changed while resolving the snapshot: expected $source_md5, received $sidecar_md5"
    fi
    printf 'Downloading Geofabrik snapshot extract %s...\n' "$source_file_name"
    curl -fL --retry 3 --retry-delay 2 "$source_url" -o "$source_tmp"
    [[ -n "$source_md5" ]] || fail "no trusted MD5 available for source $source_id; refusing to install the download"
    download_md5="$(md5_file "$source_tmp")"
    [[ "$download_md5" == "$source_md5" ]] || \
      fail "downloaded source PBF MD5 mismatch for $source_id: expected $source_md5, received $download_md5"
    mv -- "$source_tmp" "$source_pbf"
    if [[ -n "$sidecar_tmp" ]]; then
      mv -- "$sidecar_tmp" "$source_sidecar"
    fi
    rmdir -- "$source_tmp_dir"
    trap - EXIT
  fi

  [[ -n "$source_md5" ]] || \
    fail "no trusted MD5 metadata for cached source $source_id at $source_pbf; run online once or restore its .md5/source.json"
  actual_md5="$(md5_file "$source_pbf")"
  [[ "$actual_md5" == "$source_md5" ]] || \
    fail "source PBF MD5 mismatch for $source_id: expected $source_md5, received $actual_md5; refusing to crop (delete $source_pbf to re-download)"
  if [[ -n "$source_bytes" ]]; then
    actual_bytes="$(wc -c < "$source_pbf" | tr -d '[:space:]')"
    [[ "$actual_bytes" == "$source_bytes" ]] || \
      fail "source PBF size mismatch for $source_id: expected $source_bytes bytes, received $actual_bytes"
  fi
  if [[ ! -s "$source_sidecar" ]]; then
    printf '%s %s\n' "$actual_md5" "$source_file_name" > "$source_sidecar"
  fi

  source_sha="$(sha256_file "$source_pbf")"
  source_timestamp="$(osmium fileinfo --get=header.option.osmosis_replication_timestamp "$source_pbf" 2>/dev/null || true)"
  source_meta_args=(
    --library "$MAP_LIBRARY_DIR"
    --source "$source_id"
    --snapshot-date "$MAP_SNAPSHOT_DATE"
    --md5 "$actual_md5"
    --sha256 "$source_sha"
  )
  if [[ "$source_timestamp" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
    source_meta_args+=(--data-timestamp "$source_timestamp")
  fi
  python3 "$SCRIPT_DIR/regions.py" write-source-meta "${source_meta_args[@]}" >/dev/null

  source_path_by_id["$source_id"]="$source_pbf"
  source_sha_by_id["$source_id"]="$source_sha"
done <<< "$sources_output"

# ---- 2. Per-area crops (whole countries merge straight from the source) ----
merge_inputs=()
while IFS=$'\t' read -r area_id _country_id source_id area_bbox area_name _continent _city _relative crop_pbf; do
  source_pbf="${source_path_by_id[$source_id]}"
  if [[ "$area_bbox" == 'ALL' ]]; then
    printf 'Area %s: whole %s extract (no crop)\n' "$area_id" "$source_id"
    merge_inputs+=("$source_pbf")
    continue
  fi
  crop_dir="$(dirname -- "$crop_pbf")"
  crop_meta="$crop_dir/$area_id.source.json"
  mkdir -p "$crop_dir"

  if [[ "$MAP_SOURCE_POLICY" != "refresh" && ! -s "$crop_pbf" ]]; then
    legacy_crop="$REPO_ROOT/map-server/data/crops/$area_id.osm.pbf"
    legacy_meta="$REPO_ROOT/map-server/data/crops/$area_id.source.json"
    if is_project_local_regular_file "$legacy_crop" && [[ -s "$legacy_crop" ]]; then
      mv -- "$legacy_crop" "$crop_pbf"
      if is_project_local_regular_file "$legacy_meta" && [[ -s "$legacy_meta" ]]; then
        mv -- "$legacy_meta" "$crop_meta"
      fi
      printf 'Imported legacy crop into the map library: %s\n' "$crop_pbf"
    fi
  fi

  if python3 "$SCRIPT_DIR/regions.py" verify-crop \
      --meta "$crop_meta" --crop "$crop_pbf" --area "$area_id" \
      --source-sha256 "${source_sha_by_id[$source_id]}" \
      --osmium-version "$osmium_version" \
      --snapshot-date "$MAP_SNAPSHOT_DATE" \
      --library "$MAP_LIBRARY_DIR" >/dev/null 2>&1; then
    printf 'Area %s (%s): reusing verified crop\n' "$area_id" "$area_name"
  else
    crop_tmp_dir="$(mktemp -d "$crop_dir/.borobiya-crop.XXXXXX")"
    crop_tmp="$crop_tmp_dir/$area_id.osm.pbf"
    trap 'rm -rf -- "${crop_tmp_dir:-}"' EXIT
    printf 'Area %s (%s): cropping bbox %s from %s...\n' "$area_id" "$area_name" "$area_bbox" "$(basename -- "$source_pbf")"
    osmium extract --strategy=smart --bbox="$area_bbox" --set-bounds \
      --output="$crop_tmp" "$source_pbf"
    [[ -s "$crop_tmp" ]] || fail "osmium extract did not produce a non-empty crop for $area_id"
    osmium fileinfo "$crop_tmp" >/dev/null
    mv -- "$crop_tmp" "$crop_pbf"
    rmdir -- "$crop_tmp_dir"
    trap - EXIT
    python3 "$SCRIPT_DIR/regions.py" write-crop-meta \
      --meta "$crop_meta" --crop "$crop_pbf" --area "$area_id" \
      --source-sha256 "${source_sha_by_id[$source_id]}" \
      --osmium-version "$osmium_version" \
      --snapshot-date "$MAP_SNAPSHOT_DATE" \
      --library "$MAP_LIBRARY_DIR" >/dev/null
  fi
  merge_inputs+=("$crop_pbf")
done <<< "$areas_output"

# ---- 3. Merge into the single shared dataset PBF + provenance manifest ----
merged_tmp_dir="$(mktemp -d "$MAP_DATA_DIR/.borobiya-merge.XXXXXX")"
merged_tmp="$merged_tmp_dir/$MAP_REGION.osm.pbf"
trap 'rm -rf -- "${merged_tmp_dir:-}"' EXIT
printf 'Merging %d area input(s) into %s...\n' "${#merge_inputs[@]}" "$merged_pbf"
osmium merge --output="$merged_tmp" "${merge_inputs[@]}"
[[ -s "$merged_tmp" ]] || fail 'osmium merge did not produce a non-empty dataset PBF'
osmium fileinfo "$merged_tmp" >/dev/null
mv -- "$merged_tmp" "$merged_pbf"
rmdir -- "$merged_tmp_dir"
trap - EXIT

python3 "$SCRIPT_DIR/regions.py" write-manifest \
  --data-dir "$MAP_DATA_DIR" --dataset "$MAP_REGION" \
  --selection "$MAP_REGION_IDS" --merged "$merged_pbf" \
  --osmium-version "$osmium_version" \
  --library "$MAP_LIBRARY_DIR" \
  --snapshot "$MAP_SNAPSHOT_MODE" \
  --snapshot-date "$MAP_SNAPSHOT_DATE" \
  --source-policy "$MAP_SOURCE_POLICY"

printf 'Prepared shared dataset PBF: %s (%s bytes)\n' "$merged_pbf" "$(wc -c < "$merged_pbf" | tr -d '[:space:]')"
printf 'Areas: %s\nSnapshot: %s\nUnion bbox (MAP_BBOX): %s\n' "$MAP_REGION_IDS" "$MAP_SNAPSHOT_DATE" "$UNION_BBOX"
printf 'Use this exact input for Planetiler, OSRM, and the Nominatim → Photon import: MAP_PBF=%s\n' "$merged_pbf"
