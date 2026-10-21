#!/usr/bin/env bash
# Verify that Martin serves a real vector tile for one selected area.
# Usage: verify-tiles.sh [area-id]   (default: first of MAP_REGION_IDS)
# The z12 tile is computed from the area's catalog center; set
# MARTIN_TILE_PATH to override the exact path for ad-hoc debugging.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MARTIN_URL="${MARTIN_URL:-http://localhost:8000}"
MARTIN_URL="${MARTIN_URL%/}"
MAP_REGION="${MAP_REGION:-borobiya}"
MAP_REGION_IDS="${MAP_REGION_IDS:-ir-tehran}"

fail() {
  printf 'verify-tiles: %s\n' "$*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail 'curl is required'
command -v python3 >/dev/null 2>&1 || fail 'python3 is required to resolve the area verification tile'

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
TILE_PATH="${MARTIN_TILE_PATH:-/$MAP_REGION/$TILE_ZXY}"

http_code="$(curl --retry 5 --retry-connrefused --retry-delay 2 -sS -o /dev/null -w '%{http_code}' "$MARTIN_URL/health")" || \
  fail "Martin health endpoint is unreachable: $MARTIN_URL/health"
[[ "$http_code" == '200' ]] || fail "Martin health endpoint returned HTTP $http_code"

body_file="$(mktemp)"
headers_file="$(mktemp)"
trap 'rm -f "$body_file" "$headers_file"' EXIT

http_code="$(curl --retry 5 --retry-connrefused --retry-delay 2 -sS -D "$headers_file" -o "$body_file" -w '%{http_code}' \
  -H 'Accept: application/x-protobuf' "$MARTIN_URL$TILE_PATH")" || \
  fail "Tile request failed: $MARTIN_URL$TILE_PATH"
[[ "$http_code" == '200' ]] || fail "Tile endpoint returned HTTP $http_code: $MARTIN_URL$TILE_PATH"
[[ -s "$body_file" ]] || fail 'Martin returned an empty tile body'

content_type="$(awk 'tolower($1) == "content-type:" { gsub("\r", ""); print tolower($2); exit }' "$headers_file")"
case "$content_type" in
  application/x-protobuf|application/vnd.mapbox-vector-tile) ;;
  *) fail "Expected an MVT content type, received '${content_type:-missing}'" ;;
esac

printf 'OK: %s (%s) returned HTTP 200, %s, %s bytes\n' \
  "$MARTIN_URL$TILE_PATH" "$AREA_NAME" "$content_type" "$(wc -c < "$body_file" | tr -d ' ')"
