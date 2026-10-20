#!/usr/bin/env bash
# Verify that the merged dataset PBF matches its provenance manifest, the
# selected areas (MAP_REGION_IDS), the requested snapshot, and — when
# MAP_BBOX is set — the configured union bounds. All checks live in
# regions.py (verify-manifest) so tiles, routing, and setup share one
# definition of "this PBF is the approved input".
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

fail() {
  printf 'verify-map-pbf: %s\n' "$*" >&2
  exit 1
}

if [[ -n "${MAP_LIBRARY_DIR:-}" ]]; then
  DEFAULT_MAP_LIBRARY_DIR="$MAP_LIBRARY_DIR"
elif [[ -n "${XDG_DATA_HOME:-}" ]]; then
  [[ "$XDG_DATA_HOME" == /* ]] || fail 'XDG_DATA_HOME must be absolute; set MAP_LIBRARY_DIR explicitly or correct XDG_DATA_HOME'
  DEFAULT_MAP_LIBRARY_DIR="$XDG_DATA_HOME/borobiya/map-library"
elif [[ -n "${HOME:-}" ]]; then
  [[ "$HOME" == /* ]] || fail 'HOME must be absolute to derive the external map library; set MAP_LIBRARY_DIR explicitly'
  DEFAULT_MAP_LIBRARY_DIR="$HOME/.local/share/borobiya/map-library"
else
  fail 'HOME and XDG_DATA_HOME are unset; set MAP_LIBRARY_DIR to an external absolute path'
fi
MAP_LIBRARY_DIR="$DEFAULT_MAP_LIBRARY_DIR"
# shellcheck disable=SC2088 # Match a literal user-supplied ~/ path, then expand it manually.
case "$MAP_LIBRARY_DIR" in
  "~") MAP_LIBRARY_DIR="${HOME:-}" ;;
  "~/"*) MAP_LIBRARY_DIR="${HOME:-}/${MAP_LIBRARY_DIR#~/}" ;;
esac
MAP_REGION="${MAP_REGION:-borobiya}"
MAP_REGION_IDS="${MAP_REGION_IDS:-ir-tehran}"

command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required to validate the dataset manifest'

if [[ -n "${MAP_DATA_DIR:-}" ]]; then
  :
elif [[ -n "${MAP_DATASET_DIR:-}" ]]; then
  MAP_DATA_DIR="$MAP_DATASET_DIR"
elif [[ -n "${MAP_PBF_MANIFEST:-}" ]]; then
  MAP_DATA_DIR="$(dirname -- "$MAP_PBF_MANIFEST")"
elif [[ -n "${1:-}" ]]; then
  MAP_DATA_DIR="$(dirname -- "$1")"
elif [[ -n "${MAP_PBF:-}" ]]; then
  MAP_DATA_DIR="$(dirname -- "$MAP_PBF")"
else
  if ! library_paths="$(python3 "$SCRIPT_DIR/regions.py" resolve "$MAP_REGION_IDS" \
      --snapshot "${MAP_SNAPSHOT_DATE:-pinned}" --library "$MAP_LIBRARY_DIR" \
      --dataset "$MAP_REGION")"; then
    fail 'could not resolve the standardized map library dataset (see above)'
  fi
  eval "$library_paths"
fi

MAP_PBF="${1:-${MAP_PBF:-$MAP_DATA_DIR/$MAP_REGION.osm.pbf}}"
MANIFEST="${MAP_PBF_MANIFEST:-$MAP_DATA_DIR/$MAP_REGION.source.json}"

[[ "$MAP_REGION" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail 'MAP_REGION (dataset slug) must be a lowercase slug'
[[ -s "$MAP_PBF" ]] || fail "dataset PBF is missing or empty: $MAP_PBF; run prepare-regions-pbf.sh first"
[[ -s "$MANIFEST" ]] || fail "provenance manifest is missing: $MANIFEST; run prepare-regions-pbf.sh first"

verify_args=(
  --manifest "$MANIFEST"
  --pbf "$MAP_PBF"
  --selection "$MAP_REGION_IDS"
  --library "$MAP_LIBRARY_DIR"
)
if [[ -n "${MAP_SNAPSHOT:-}" ]]; then
  verify_args+=(--snapshot "$MAP_SNAPSHOT")
fi
if [[ -n "${MAP_SNAPSHOT_DATE:-}" ]]; then
  verify_args+=(--snapshot-date "$MAP_SNAPSHOT_DATE")
fi
# Only enforce the environment bbox when the caller actually configured one
# (generate-tiles/build-routing pass MAP_BBOX explicitly; its historical
# Tehran default must not make a Frankfurt dataset "invalid").
if [[ -n "${MAP_BBOX:-}" ]]; then
  verify_args+=(--bbox "$MAP_BBOX")
fi

python3 "$SCRIPT_DIR/regions.py" verify-manifest "${verify_args[@]}"
