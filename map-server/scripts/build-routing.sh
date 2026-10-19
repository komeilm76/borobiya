#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
OSRM_IMAGE="ghcr.io/project-osrm/osrm-backend:v26.10.0"
MAP_REGION="${MAP_REGION:-tehran}"
# MAP_PBF is preferred; TEHRAN_PBF remains a compatibility alias for existing setups.
MAP_PBF="${MAP_PBF:-${TEHRAN_PBF:-}}"
OSRM_DATA_DIR="${MAP_OSRM_DATA_DIR:-$REPO_ROOT/map-server/osrm/data}"

fail() {
  printf 'build-routing: %s\n' "$*" >&2
  exit 1
}

[[ "$MAP_REGION" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail 'MAP_REGION must be a lowercase region slug'
[[ -n "$MAP_PBF" ]] || fail 'set MAP_PBF (or TEHRAN_PBF) to a reuse-approved region .osm.pbf; this script never downloads map data'
if [[ "$MAP_PBF" != /* ]]; then
  MAP_PBF="$PWD/$MAP_PBF"
fi
[[ -s "$MAP_PBF" ]] || fail "PBF is missing or empty: $MAP_PBF"

command -v docker >/dev/null 2>&1 || fail 'Docker is required to run the pinned OSRM backend image'
docker info >/dev/null 2>&1 || fail 'Docker daemon is unavailable'

mkdir -p "$OSRM_DATA_DIR"
if [[ "$OSRM_DATA_DIR" != /* ]]; then
  OSRM_DATA_DIR="$PWD/$OSRM_DATA_DIR"
fi
OSRM_DATA_DIR="$(cd -- "$OSRM_DATA_DIR" && pwd)"
for profile in car bicycle foot; do
  [[ ! -e "$OSRM_DATA_DIR/$profile" ]] || \
    fail "$OSRM_DATA_DIR/$profile already exists; use a new MAP_OSRM_DATA_DIR for a clean rebuild"
done

staging="$OSRM_DATA_DIR/.staging-routing-$$"
[[ ! -e "$staging" ]] || fail "staging directory already exists: $staging"
mkdir -p "$staging"
cleanup() { rm -rf -- "$staging"; }
trap cleanup EXIT

for profile in car bicycle foot; do
  mkdir -p "$staging/$profile"
  printf 'Extracting %s graph for %s from the approved PBF...\n' "$profile" "$MAP_REGION"
  docker run --rm \
    --mount "type=bind,source=$MAP_PBF,target=/input/$MAP_REGION.osm.pbf,readonly" \
    --mount "type=bind,source=$staging,target=/data" \
    "$OSRM_IMAGE" osrm-extract \
    --profile "/opt/$profile.lua" \
    "/input/$MAP_REGION.osm.pbf" \
    --output "/data/$profile/$MAP_REGION"
  docker run --rm --mount "type=bind,source=$staging,target=/data" \
    "$OSRM_IMAGE" osrm-partition "/data/$profile/$MAP_REGION.osrm"
  docker run --rm --mount "type=bind,source=$staging,target=/data" \
    "$OSRM_IMAGE" osrm-customize "/data/$profile/$MAP_REGION.osrm"
done

# Publish only after all three profiles have extracted and completed MLD preparation.
for profile in car bicycle foot; do
  mv -- "$staging/$profile" "$OSRM_DATA_DIR/$profile"
done
rmdir -- "$staging"
trap - EXIT
printf 'Created car, bicycle, and foot graphs for %s under %s\n' "$MAP_REGION" "$OSRM_DATA_DIR"
