#!/usr/bin/env bash
set -euo pipefail

ROUTING_URL="${MAP_ROUTING_URL:-http://localhost:8001/route}"
ROUTING_URL="${ROUTING_URL%/}"

fail() {
  printf 'verify-routing: %s\n' "$*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail 'curl is required'
command -v python3 >/dev/null 2>&1 || fail 'python3 is required to validate the response'

for profile in car bicycle foot; do
  response_file="$(mktemp)"
  trap 'rm -f "$response_file"' EXIT
  request_body="$(printf '{"from":{"lat":35.68,"lon":51.38},"to":{"lat":35.70,"lon":51.41},"profile":"%s","alternatives":true}' "$profile")"
  status="$(curl --retry 5 --retry-connrefused --retry-delay 2 -sS \
    -H 'Content-Type: application/json' \
    -d "$request_body" \
    -o "$response_file" -w '%{http_code}' "$ROUTING_URL")" || \
    fail "${profile} route request failed: $ROUTING_URL"
  [[ "$status" == '200' ]] || fail "${profile} route returned HTTP $status: $(cat "$response_file")"

  python3 - "$response_file" "$profile" <<'PY' || fail "${profile} response is not a valid route"
import json, sys
body = json.load(open(sys.argv[1], encoding='utf-8'))
profile = sys.argv[2]
routes = body.get('routes')
if body.get('profile') != profile or not isinstance(routes, list) or not routes:
    raise SystemExit('missing profile or routes')
route = routes[0]
if not isinstance(route.get('distance_m'), (int, float)) or route['distance_m'] <= 0:
    raise SystemExit('invalid distance_m')
if not isinstance(route.get('duration_s'), (int, float)) or route['duration_s'] <= 0:
    raise SystemExit('invalid duration_s')
if not isinstance(route.get('polyline'), str) or not route['polyline']:
    raise SystemExit('missing encoded polyline')
if not isinstance(route.get('legs'), list):
    raise SystemExit('missing route legs')
print(f"OK: {profile} returned {len(routes)} route(s), {route['distance_m']:.0f} m, {route['duration_s']:.0f} s")
PY
  rm -f "$response_file"
  trap - EXIT
done
