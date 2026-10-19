#!/usr/bin/env bash
set -euo pipefail

MARTIN_URL="${MARTIN_URL:-http://localhost:8000}"
MARTIN_URL="${MARTIN_URL%/}"
TILE_PATH="${MARTIN_TILE_PATH:-/tehran/12/2632/1612}"

fail() {
  printf 'verify-tehran-tiles: %s\n' "$*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail 'curl is required'

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

printf 'OK: %s returned HTTP 200, %s, %s bytes\n' \
  "$MARTIN_URL$TILE_PATH" "$content_type" "$(wc -c < "$body_file" | tr -d ' ')"
