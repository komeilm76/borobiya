#!/usr/bin/env bash
# Verify car/bicycle/foot routing for one selected area using the test
# points from map-server/regions.json.
# Usage: verify-routing.sh [area-id]   (default: first of MAP_REGION_IDS)
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROUTING_URL="${MAP_ROUTING_URL:-http://localhost:8001/route}"
ROUTING_URL="${ROUTING_URL%/}"
MAP_REGION_IDS="${MAP_REGION_IDS:-ir-tehran}"

fail() {
  printf 'verify-routing: %s\n' "$*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail 'curl is required'
command -v python3 >/dev/null 2>&1 || fail 'python3 is required to validate the response'

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
printf 'Verifying routing in %s (%s)...\n' "$AREA_NAME" "$AREA_ID"

for profile in car bicycle foot; do
  response_file="$(mktemp)"
  trap 'rm -f "$response_file"' EXIT
  request_body="$(printf '{"from":{"lat":%s,"lon":%s},"to":{"lat":%s,"lon":%s},"profile":"%s","alternatives":true}' \
    "$ROUTE_FROM_LAT" "$ROUTE_FROM_LON" "$ROUTE_TO_LAT" "$ROUTE_TO_LON" "$profile")"
  status="$(curl --retry 5 --retry-connrefused --retry-delay 2 -sS \
    -H 'Content-Type: application/json' \
    -d "$request_body" \
    -o "$response_file" -w '%{http_code}' "$ROUTING_URL")" || \
    fail "${profile} route request failed: $ROUTING_URL"
  if [[ "$status" != '200' ]]; then
    # The gateway's 502 body now carries the upstream status, code and message it saw; printing the request
    # body next to it means the same call can be replayed against the profile container without guessing.
    printf 'verify-routing: request body: %s\n' "$request_body" >&2
    printf 'verify-routing: profile container log: docker compose logs --tail 40 osrm-%s routing-gateway\n' "$profile" >&2
    printf 'verify-routing: which selection the mounted graph covers: docker compose exec -T osrm-%s cat "/data/${MAP_REGION:-borobiya}.metadata.json"\n' "$profile" >&2
    fail "${profile} route returned HTTP $status: $(cat "$response_file")"
  fi

  python3 - "$response_file" "$profile" "${MAP_REQUIRE_ELEVATION:-0}" <<'PY' || fail "${profile} response is not a valid route"
import json, math, sys
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
for i, option in enumerate(routes):
    elevation = option.get('elevation')
    if elevation is None:
        if sys.argv[3] == '1':
            raise SystemExit(f'route {i + 1} has no complete offline DEM coverage')
        continue
    if (elevation.get('source') != 'mapzen-skadi' or
            not all(isinstance(elevation.get(key), (int, float)) and math.isfinite(elevation[key]) and elevation[key] >= 0
                    for key in ('gain_m', 'loss_m')) or
            not all(isinstance(elevation.get(key), (int, float)) and math.isfinite(elevation[key])
                    for key in ('start_m', 'end_m'))):
        raise SystemExit(f'route {i + 1} has invalid elevation')
    samples = elevation.get('profile')
    if not isinstance(samples, list) or not 2 <= len(samples) <= 96:
        raise SystemExit(f'route {i + 1} lacks a bounded elevation profile')
    previous_distance = 0
    for j, point in enumerate(samples):
        if (not isinstance(point, dict) or
                not all(isinstance(point.get(key), (int, float)) and math.isfinite(point[key])
                        for key in ('distance_m', 'elevation_m')) or
                point['distance_m'] < (0 if j == 0 else previous_distance) or
                (j == 0 and point['distance_m'] != 0)):
            raise SystemExit(f'route {i + 1} has an invalid elevation profile at point {j}')
        previous_distance = point['distance_m']
print(f"OK: {profile} returned {len(routes)} route(s), {route['distance_m']:.0f} m, {route['duration_s']:.0f} s; "
      f"elevation on {sum(option.get('elevation') is not None for option in routes)}/{len(routes)}")
PY
  rm -f "$response_file"
  trap - EXIT
done
