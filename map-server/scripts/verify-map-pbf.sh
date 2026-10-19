#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-$REPO_ROOT/map-server/data}"
MAP_REGION="${MAP_REGION:-tehran}"
MAP_BBOX="${MAP_BBOX:-51.0,35.5,51.7,35.9}"
MAP_SOURCE_URL="${MAP_SOURCE_URL:-https://download.geofabrik.de/asia/iran-261018.osm.pbf}"
MAP_SOURCE_DATE="${MAP_SOURCE_DATE:-2026-10-18}"
MAP_SOURCE_MD5="$(printf '%s' "${MAP_SOURCE_MD5:-a23eb2f21e426677bd243b2712ec1bc8}" | tr '[:upper:]' '[:lower:]')"
MAP_PBF="${1:-${MAP_PBF:-$MAP_DATA_DIR/$MAP_REGION.osm.pbf}}"
MANIFEST="${MAP_PBF_MANIFEST:-$MAP_DATA_DIR/$MAP_REGION.source.json}"

fail() {
  printf 'verify-map-pbf: %s\n' "$*" >&2
  exit 1
}

[[ "$MAP_REGION" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail 'MAP_REGION must be a lowercase region slug'
[[ -s "$MAP_PBF" ]] || fail "cropped PBF is missing or empty: $MAP_PBF"
[[ -s "$MANIFEST" ]] || fail "provenance manifest is missing: $MANIFEST; run prepare-tehran-pbf.sh first"
command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required to validate the cropped PBF manifest'

python3 - "$MAP_PBF" "$MANIFEST" "$MAP_REGION" "$MAP_BBOX" \
  "$MAP_SOURCE_URL" "$MAP_SOURCE_DATE" "$MAP_SOURCE_MD5" <<'PY'
import hashlib
import json
import math
import sys

pbf_path, manifest_path, expected_region, bbox_text, source_url, source_date, source_md5 = sys.argv[1:]
try:
    with open(manifest_path, encoding="utf-8") as manifest_file:
        manifest = json.load(manifest_file)
except (OSError, json.JSONDecodeError) as error:
    raise SystemExit(f"invalid provenance manifest: {error}")

if manifest.get("region") != expected_region:
    raise SystemExit(f"manifest region {manifest.get('region')!r} does not match MAP_REGION={expected_region!r}")
source = manifest.get("source", {})
if source.get("provider") != "Geofabrik" or source.get("license") != "ODbL-1.0":
    raise SystemExit("source manifest must identify Geofabrik and the approved ODbL-1.0 license")
if source.get("url") != source_url or source.get("dataDate") != source_date or source.get("md5") != source_md5:
    raise SystemExit("source URL/date/MD5 in the manifest do not match the configured approved snapshot")

try:
    expected_bbox = [float(value.strip()) for value in bbox_text.split(",")]
    manifest_bbox = [float(value) for value in manifest["crop"]["bbox"]]
except (ValueError, KeyError, TypeError) as error:
    raise SystemExit(f"invalid MAP_BBOX or crop manifest: {error}")
if len(expected_bbox) != 4 or len(manifest_bbox) != 4 or not all(math.isfinite(value) for value in expected_bbox + manifest_bbox):
    raise SystemExit("MAP_BBOX and manifest crop bbox must each contain four finite coordinates")
west, south, east, north = expected_bbox
if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
    raise SystemExit("MAP_BBOX must be an ordered WGS84 west,south,east,north box")
if any(abs(left - right) > 1e-9 for left, right in zip(expected_bbox, manifest_bbox)):
    raise SystemExit(f"manifest crop bbox {manifest_bbox!r} does not match MAP_BBOX {expected_bbox!r}")
if manifest["crop"].get("strategy") != "smart":
    raise SystemExit("manifest crop strategy is not Osmium smart")
sha256 = hashlib.sha256()
with open(pbf_path, "rb") as pbf_file:
    for chunk in iter(lambda: pbf_file.read(1024 * 1024), b""):
        sha256.update(chunk)
actual_sha256 = sha256.hexdigest()
expected_sha256 = manifest["crop"].get("sha256")
if actual_sha256 != expected_sha256:
    raise SystemExit(f"cropped PBF SHA-256 {actual_sha256} does not match manifest {expected_sha256!r}")

print(f"OK: {pbf_path} matches {expected_region} crop {expected_bbox!r} (SHA-256 {actual_sha256})")
PY
