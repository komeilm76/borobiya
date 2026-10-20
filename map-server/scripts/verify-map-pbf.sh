#!/usr/bin/env bash
# Verify that the merged dataset PBF matches its version-2 provenance
# manifest, the selected areas (MAP_REGION_IDS), and — when MAP_BBOX is set
# in the environment — the configured union bounds. All checks live in
# regions.py (verify-manifest) so tiles, routing, and setup share one
# definition of "this PBF is the approved input".
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-$REPO_ROOT/map-server/data}"
MAP_REGION="${MAP_REGION:-borobiya}"
MAP_REGION_IDS="${MAP_REGION_IDS:-ir-tehran}"
MAP_PBF="${1:-${MAP_PBF:-$MAP_DATA_DIR/$MAP_REGION.osm.pbf}}"
MANIFEST="${MAP_PBF_MANIFEST:-$MAP_DATA_DIR/$MAP_REGION.source.json}"

fail() {
  printf 'verify-map-pbf: %s\n' "$*" >&2
  exit 1
}

[[ "$MAP_REGION" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail 'MAP_REGION (dataset slug) must be a lowercase slug'
[[ -s "$MAP_PBF" ]] || fail "dataset PBF is missing or empty: $MAP_PBF; run prepare-regions-pbf.sh first"
[[ -s "$MANIFEST" ]] || fail "provenance manifest is missing: $MANIFEST; run prepare-regions-pbf.sh first"
command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required to validate the dataset manifest'

verify_args=(
  --manifest "$MANIFEST"
  --pbf "$MAP_PBF"
  --selection "$MAP_REGION_IDS"
)
# Only enforce the environment bbox when the caller actually configured one
# (generate-tiles/build-routing pass MAP_BBOX explicitly; its historical
# Tehran default must not make a Frankfurt dataset "invalid").
if [[ -n "${MAP_BBOX:-}" ]]; then
  verify_args+=(--bbox "$MAP_BBOX")
fi

python3 "$SCRIPT_DIR/regions.py" verify-manifest "${verify_args[@]}"
