#!/usr/bin/env bash
set -euo pipefail

GEOCODE_URL="${MAP_GEOCODE_URL:-http://localhost:8001/geocode}"
REVERSE_URL="${MAP_REVERSE_URL:-http://localhost:8001/reverse}"
MAP_BBOX="${MAP_BBOX:-51.0,35.5,51.7,35.9}"
GEOCODE_URL="${GEOCODE_URL%/}"
REVERSE_URL="${REVERSE_URL%/}"

fail() {
  printf 'verify-geocoding: %s\n' "$*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail 'curl is required'
command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required to validate Photon GeoJSON responses'

geocode_body="$(mktemp)"
reverse_body="$(mktemp)"
trap 'rm -f "$geocode_body" "$reverse_body"' EXIT

status="$(curl --retry 5 --retry-connrefused --retry-delay 2 -sS -G \
  --data-urlencode 'q=Azadi Square' \
  --data-urlencode 'limit=5' \
  --data-urlencode "bbox=$MAP_BBOX" \
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

status="$(curl --retry 5 --retry-connrefused --retry-delay 2 -sS -G \
  --data-urlencode 'lat=35.70' \
  --data-urlencode 'lon=51.40' \
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
