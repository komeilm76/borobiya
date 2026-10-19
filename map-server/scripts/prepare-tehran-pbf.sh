#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-$REPO_ROOT/map-server/data}"
MAP_REGION="${MAP_REGION:-tehran}"
MAP_BBOX="${MAP_BBOX:-51.0,35.5,51.7,35.9}"
MAP_SOURCE_URL="${MAP_SOURCE_URL:-https://download.geofabrik.de/asia/iran-261018.osm.pbf}"
MAP_SOURCE_DATE="${MAP_SOURCE_DATE:-2026-10-18}"
MAP_SOURCE_DATA_TIMESTAMP="${MAP_SOURCE_DATA_TIMESTAMP:-2026-10-18T20:25:06Z}"
MAP_SOURCE_MD5="${MAP_SOURCE_MD5:-a23eb2f21e426677bd243b2712ec1bc8}"
MAP_SOURCE_BYTES="${MAP_SOURCE_BYTES:-229852435}"
# Pinned to Ubuntu 24.04's apt osmium-tool release (the target VM); keep in sync
# with .env.example and docs/MAP_SERVER.md. Override only after reviewing
# `osmium --version` on the machine that produces the crop.
MAP_OSMIUM_VERSION="${MAP_OSMIUM_VERSION:-1.16.0}"
MAP_SOURCE_PBF="${MAP_SOURCE_PBF:-}"
MAP_CROPPED_PBF="${MAP_CROPPED_PBF:-}"

fail() {
  printf 'prepare-tehran-pbf: %s\n' "$*" >&2
  exit 1
}

md5_file() {
  if command -v md5sum >/dev/null 2>&1; then
    md5sum "$1" | awk '{print tolower($1)}'
  elif command -v md5 >/dev/null 2>&1; then
    md5 -q "$1" | tr '[:upper:]' '[:lower:]'
  else
    fail 'md5sum (Linux) or md5 (macOS) is required to verify the Geofabrik checksum'
  fi
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print tolower($1)}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print tolower($1)}'
  else
    fail 'sha256sum or shasum is required to record the source and crop checksums'
  fi
}

[[ "$MAP_REGION" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail 'MAP_REGION must be a lowercase region slug'
[[ "$MAP_SOURCE_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail 'MAP_SOURCE_DATE must use YYYY-MM-DD'
[[ "$MAP_SOURCE_MD5" =~ ^[[:xdigit:]]{32}$ ]] || fail 'MAP_SOURCE_MD5 must be a 32-character hexadecimal checksum'
[[ "$MAP_SOURCE_BYTES" =~ ^[0-9]+$ ]] || fail 'MAP_SOURCE_BYTES must be an integer'
[[ "$MAP_OSMIUM_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'MAP_OSMIUM_VERSION must use a three-part version'
[[ "$MAP_SOURCE_URL" == https://download.geofabrik.de/asia/*.osm.pbf ]] || \
  fail 'MAP_SOURCE_URL must be an HTTPS Geofabrik Asia .osm.pbf URL'

MAP_BBOX="${MAP_BBOX//[[:space:]]/}"
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

command -v curl >/dev/null 2>&1 || fail 'curl is required to download the pinned PBF'
command -v osmium >/dev/null 2>&1 || fail 'osmium-tool is required to crop and validate the PBF'
command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required to write and validate the provenance manifest'
osmium_version="$(osmium --version 2>&1 | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+[.][0-9]+[.][0-9]+$/) { print $i; exit } }')"
[[ -n "$osmium_version" ]] || fail 'could not read a three-part osmium-tool version from `osmium --version`'
[[ "$osmium_version" == "$MAP_OSMIUM_VERSION" ]] || \
  fail "osmium-tool $MAP_OSMIUM_VERSION is required (found $osmium_version); if the installed version is the reviewed one, set MAP_OSMIUM_VERSION=$osmium_version in .env and reload it (set -a; source .env; set +a), or run once with: MAP_OSMIUM_VERSION=$osmium_version $0"

mkdir -p "$MAP_DATA_DIR/source"
MAP_DATA_DIR="$(cd -- "$MAP_DATA_DIR" && pwd)"
source_name="$(basename -- "$MAP_SOURCE_URL")"
source_pbf="${MAP_SOURCE_PBF:-$MAP_DATA_DIR/source/$source_name}"
cropped_pbf="${MAP_CROPPED_PBF:-$MAP_DATA_DIR/$MAP_REGION.osm.pbf}"
manifest="$MAP_DATA_DIR/$MAP_REGION.source.json"
source_dir="$(dirname -- "$source_pbf")"
cropped_dir="$(dirname -- "$cropped_pbf")"
mkdir -p "$source_dir" "$cropped_dir"

if [[ ! -s "$source_pbf" ]]; then
  source_tmp="$source_pbf.part"
  trap 'rm -f "${source_tmp:-}" "${crop_tmp:-}" "${manifest_tmp:-}"' EXIT
  printf 'Downloading Geofabrik snapshot %s to %s...\n' "$MAP_SOURCE_DATE" "$source_pbf"
  curl -fL --retry 3 --retry-delay 2 "$MAP_SOURCE_URL" -o "$source_tmp"
  mv -- "$source_tmp" "$source_pbf"
  trap - EXIT
fi

expected_md5="$(printf '%s' "$MAP_SOURCE_MD5" | tr '[:upper:]' '[:lower:]')"
actual_md5="$(md5_file "$source_pbf")"
[[ "$actual_md5" == "$expected_md5" ]] || \
  fail "source PBF MD5 mismatch: expected $expected_md5, received $actual_md5; refusing to crop"
actual_bytes="$(wc -c < "$source_pbf" | tr -d '[:space:]')"
[[ "$actual_bytes" == "$MAP_SOURCE_BYTES" ]] || \
  fail "source PBF size mismatch: expected $MAP_SOURCE_BYTES bytes, received $actual_bytes"

if [[ -s "$cropped_pbf" || -e "$manifest" ]]; then
  if [[ "${MAP_CROP_OVERWRITE:-0}" != '1' ]]; then
    fail "crop or manifest already exists; inspect it, or set MAP_CROP_OVERWRITE=1 to rebuild: $cropped_pbf"
  fi
fi

crop_tmp="$cropped_dir/.$MAP_REGION.$$.osm.pbf"
manifest_tmp="$MAP_DATA_DIR/.$MAP_REGION.$$.source.json"
trap 'rm -f "${crop_tmp:-}" "${manifest_tmp:-}"' EXIT
printf 'Cropping %s to MAP_BBOX=%s using Osmium smart extraction...\n' "$source_pbf" "$MAP_BBOX"
osmium extract --strategy=smart --bbox="$MAP_BBOX" --set-bounds \
  --output="$crop_tmp" "$source_pbf"
[[ -s "$crop_tmp" ]] || fail 'osmium extract did not produce a non-empty cropped PBF'
osmium fileinfo "$crop_tmp" >/dev/null

source_sha256="$(sha256_file "$source_pbf")"
crop_sha256="$(sha256_file "$crop_tmp")"
python3 - "$manifest_tmp" "$MAP_REGION" "$MAP_SOURCE_URL" "$MAP_SOURCE_DATE" \
  "$MAP_SOURCE_DATA_TIMESTAMP" "$source_name" "$actual_bytes" "$actual_md5" \
  "$source_sha256" "$cropped_pbf" "$crop_sha256" "$MAP_BBOX" "$osmium_version" <<'PY'
import json
import sys

(
    output_path, region, source_url, source_date, source_timestamp, source_name,
    source_bytes, source_md5, source_sha256, crop_path, crop_sha256, bbox_text,
    osmium_version,
) = sys.argv[1:]
bbox = [float(value) for value in bbox_text.split(",")]
manifest = {
    "region": region,
    "source": {
        "provider": "Geofabrik",
        "url": source_url,
        "dataDate": source_date,
        "dataTimestamp": source_timestamp,
        "file": source_name,
        "bytes": int(source_bytes),
        "md5": source_md5,
        "sha256": source_sha256,
        "license": "ODbL-1.0",
    },
    "crop": {
        "file": crop_path,
        "bbox": bbox,
        "strategy": "smart",
        "osmiumToolVersion": osmium_version,
        "sha256": crop_sha256,
    },
    "attribution": "© OpenStreetMap contributors",
    "attributionUrl": "https://www.openstreetmap.org/copyright",
}
with open(output_path, "w", encoding="utf-8") as manifest_file:
    json.dump(manifest, manifest_file, ensure_ascii=False, indent=2)
    manifest_file.write("\n")
PY

mv -- "$crop_tmp" "$cropped_pbf"
mv -- "$manifest_tmp" "$manifest"
trap - EXIT
printf 'Prepared shared cropped PBF: %s (%s bytes)\n' "$cropped_pbf" "$(wc -c < "$cropped_pbf" | tr -d '[:space:]')"
printf 'Source MD5: %s\nSource SHA-256: %s\nCropped SHA-256: %s\n' \
  "$actual_md5" "$source_sha256" "$crop_sha256"
printf 'Wrote provenance manifest: %s\n' "$manifest"
printf 'Use this exact input for Planetiler, OSRM, and the Nominatim → Photon import: MAP_PBF=%s\n' "$cropped_pbf"
