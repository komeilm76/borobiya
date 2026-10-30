#!/usr/bin/env bash
# Verify forward + reverse geocoding for one selected area using the test
# query/point from map-server/regions.json.
# Usage: verify-geocoding.sh [area-id]   (default: first of MAP_REGION_IDS)
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
GEOCODE_URL="${MAP_GEOCODE_URL:-http://localhost:8001/geocode}"
REVERSE_URL="${MAP_REVERSE_URL:-http://localhost:8001/reverse}"
GEOCODE_URL="${GEOCODE_URL%/}"
REVERSE_URL="${REVERSE_URL%/}"
MAP_REGION_IDS="${MAP_REGION_IDS:-ir-tehran}"

fail() {
  printf 'verify-geocoding: %s\n' "$*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail 'curl is required'
command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required to validate Photon GeoJSON responses'

AREA="${1:-}"
if [[ -z "$AREA" ]]; then
  resolved_selection="$(python3 "$SCRIPT_DIR/regions.py" resolve "$MAP_REGION_IDS")" || \
    fail "invalid MAP_REGION_IDS '$MAP_REGION_IDS' (see above; list areas with: python3 $SCRIPT_DIR/regions.py list)"
  eval "$resolved_selection"
  AREA="$PRIMARY_AREA"
fi
verify_vars="$(python3 "$SCRIPT_DIR/regions.py" verify-point "$AREA")" || \
  fail "unknown area '$AREA' (see above; list areas with: python3 $SCRIPT_DIR/regions.py list)"
eval "$verify_vars"
printf 'Verifying geocoding in %s (%s)...\n' "$AREA_NAME" "$AREA_ID"

geocode_body="$(mktemp)"
reverse_body="$(mktemp)"
trap 'rm -f "$geocode_body" "$reverse_body"' EXIT

status="$(curl --retry 5 --retry-connrefused --retry-delay 2 -sS -G \
  --data-urlencode "q=$GEOCODE_QUERY" \
  --data-urlencode 'limit=5' \
  --data-urlencode "bbox=$AREA_BBOX" \
  -o "$geocode_body" -w '%{http_code}' "$GEOCODE_URL")" || \
  fail "forward geocoding request failed: $GEOCODE_URL"
[[ "$status" == '200' ]] || fail "GET /geocode returned HTTP $status: $(cat "$geocode_body")"
python3 - "$geocode_body" <<'PY' || fail 'GET /geocode did not return a non-empty Photon FeatureCollection'
import json, sys
body = json.load(open(sys.argv[1], encoding="utf-8"))
features = body.get("features") if body.get("type") == "FeatureCollection" else None
if not isinstance(features, list) or not features:
    raise SystemExit("missing results")
first = features[0]
if first.get("type") != "Feature" or not isinstance(first.get("geometry"), dict):
    raise SystemExit("invalid first feature")
name = first.get("properties", {}).get("name", "unnamed place")
print(f"OK: GET /geocode returned {len(features)} feature(s); first result: {name}")
PY

# The map search UI requests thirty. A five-hit smoke test alone can pass
# against a stale gateway that still rejects limit=30 with HTTP 400.
status="$(curl --retry 5 --retry-connrefused --retry-delay 2 -sS -G \
  --data-urlencode "q=$GEOCODE_QUERY" \
  --data-urlencode 'limit=30' \
  --data-urlencode "bbox=$AREA_BBOX" \
  -o "$geocode_body" -w '%{http_code}' "$GEOCODE_URL")" || \
  fail "thirty-result geocoding request failed: $GEOCODE_URL"
[[ "$status" == '200' ]] || fail "GET /geocode limit=30 returned HTTP $status; check that the routing gateway and Photon are current/ready"
python3 - "$geocode_body" <<'PYCODE' || fail 'GET /geocode limit=30 did not return a Photon FeatureCollection'
import json, sys
body = json.load(open(sys.argv[1], encoding="utf-8"))
features = body.get("features") if body.get("type") == "FeatureCollection" else None
if not isinstance(features, list) or len(features) > 30:
    raise SystemExit("invalid thirty-result response")
print("OK: GET /geocode accepts limit=30")
PYCODE

status="$(curl --retry 5 --retry-connrefused --retry-delay 2 -sS -G \
  --data-urlencode "lat=$REVERSE_LAT" \
  --data-urlencode "lon=$REVERSE_LON" \
  -o "$reverse_body" -w '%{http_code}' "$REVERSE_URL")" || \
  fail "reverse geocoding request failed: $REVERSE_URL"
[[ "$status" == '200' ]] || fail "GET /reverse returned HTTP $status: $(cat "$reverse_body")"
python3 - "$reverse_body" <<'PY' || fail 'GET /reverse did not return a valid Photon FeatureCollection'
import json, sys
body = json.load(open(sys.argv[1], encoding="utf-8"))
features = body.get("features") if body.get("type") == "FeatureCollection" else None
if not isinstance(features, list) or not features:
    raise SystemExit("missing reverse result")
first = features[0]
if first.get("type") != "Feature" or not isinstance(first.get("geometry"), dict):
    raise SystemExit("invalid first feature")
name = first.get("properties", {}).get("name", "unnamed place")
print(f"OK: GET /reverse returned {len(features)} feature(s); first result: {name}")
PY
