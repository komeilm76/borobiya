#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
OSRM_IMAGE="ghcr.io/project-osrm/osrm-backend:v26.10.0-debian"
MAP_DATA_DIR="${MAP_DATA_DIR:-${MAP_DATASET_DIR:-}}"
# MAP_REGION is the stable dataset slug (OSRM graph basename);
# MAP_REGION_IDS carries the selected areas from regions.json.
MAP_REGION="${MAP_REGION:-borobiya}"
MAP_REGION_IDS="${MAP_REGION_IDS:-ir-tehran}"
# The bounds must describe THIS selection. The historical Tehran default is kept only for the
# default selection: as an unconditional fallback it made every other area look invalid to
# verify-map-pbf.sh, which then blamed the dataset for a value this script had invented.
MAP_BBOX="${MAP_BBOX:-}"
MAP_BBOX_WAS_SET="${MAP_BBOX:-}"
MAP_SNAPSHOT_DATE="${MAP_SNAPSHOT_DATE:-}"
if [[ -n "${MAP_LIBRARY_DIR:-}" ]]; then
  DEFAULT_MAP_LIBRARY_DIR="$MAP_LIBRARY_DIR"
elif [[ -n "${XDG_DATA_HOME:-}" ]]; then
  if [[ "$XDG_DATA_HOME" != /* ]]; then
    printf 'build-routing: XDG_DATA_HOME must be absolute; set MAP_LIBRARY_DIR explicitly or correct XDG_DATA_HOME\n' >&2
    exit 1
  fi
  DEFAULT_MAP_LIBRARY_DIR="$XDG_DATA_HOME/borobiya/map-library"
elif [[ -n "${HOME:-}" ]]; then
  if [[ "$HOME" != /* ]]; then
    printf 'build-routing: HOME must be absolute to derive the external map library; set MAP_LIBRARY_DIR explicitly\n' >&2
    exit 1
  fi
  DEFAULT_MAP_LIBRARY_DIR="$HOME/.local/share/borobiya/map-library"
else
  printf 'build-routing: HOME and XDG_DATA_HOME are unset; set MAP_LIBRARY_DIR to an external absolute path\n' >&2
  exit 1
fi
MAP_LIBRARY_DIR="$DEFAULT_MAP_LIBRARY_DIR"
# shellcheck disable=SC2088 # Match a literal user-supplied ~/ path, then expand it manually.
case "$MAP_LIBRARY_DIR" in
  "~") MAP_LIBRARY_DIR="${HOME:-}" ;;
  "~/"*) MAP_LIBRARY_DIR="${HOME:-}/${MAP_LIBRARY_DIR#~/}" ;;
esac
OSRM_BUILD_THREADS="${OSRM_BUILD_THREADS:-2}"
# The canonical merged dataset PBF is the default; explicit paths remain available for audited local setups.
MAP_PBF="${MAP_PBF:-}"
OSRM_DATA_DIR="${MAP_OSRM_DATA_DIR:-}"

fail() {
  printf 'build-routing: %s\n' "$*" >&2
  exit 1
}

[[ "$MAP_REGION" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail 'MAP_REGION (dataset slug) must be a lowercase slug'
[[ "$OSRM_BUILD_THREADS" =~ ^[1-4]$ ]] || fail 'OSRM_BUILD_THREADS must be an integer from 1 to 4'
if [[ -z "$MAP_DATA_DIR" ]]; then
  command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required to resolve the map library dataset'
  if ! library_paths="$(python3 "$SCRIPT_DIR/regions.py" resolve "$MAP_REGION_IDS" \
      --snapshot "${MAP_SNAPSHOT_DATE:-pinned}" --library "$MAP_LIBRARY_DIR" \
      --dataset "$MAP_REGION")"; then
    fail 'could not resolve the standardized map library dataset (see above)'
  fi
  eval "$library_paths"
  MAP_SNAPSHOT_DATE="$SNAPSHOT_DATE"
  # The resolver already computed the selection's real union bounds; use them instead of a default.
  [[ -n "$MAP_BBOX_WAS_SET" ]] || MAP_BBOX="${UNION_BBOX:-}"
fi
if [[ -z "$MAP_BBOX" && "$MAP_REGION_IDS" == "ir-tehran" ]]; then
  MAP_BBOX="51.0,35.5,51.7,35.9"
fi
if [[ -z "$MAP_BBOX" ]]; then
  fail 'MAP_BBOX is not set and the selection was not resolved (MAP_DATA_DIR was given explicitly). ' \
       'Run the loader block from docs/UBUNTU_VM_RUNBOOK.md § 2.1, which exports MAP_BBOX from the ' \
       'resolver, or pass MAP_BBOX=west,south,east,north for this selection. ' \
       'A non-default selection must never fall back to another area'"'"'s bounds.'
fi
if [[ -z "$MAP_SNAPSHOT_DATE" ]]; then
  command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required to resolve the pinned snapshot'
  MAP_SNAPSHOT_DATE="$(python3 "$SCRIPT_DIR/regions.py" pinned-snapshot)"
fi
if [[ -z "$OSRM_DATA_DIR" || "$OSRM_DATA_DIR" == "./map-server/osrm/data" || "$OSRM_DATA_DIR" == "$REPO_ROOT/map-server/osrm/data" ]]; then
  OSRM_DATA_DIR="$MAP_DATA_DIR/routing"
fi
MAP_PBF="${MAP_PBF:-$MAP_DATA_DIR/$MAP_REGION.osm.pbf}"
if [[ "$MAP_PBF" != /* ]]; then
  MAP_PBF="$PWD/$MAP_PBF"
fi
[[ -s "$MAP_PBF" ]] || fail "dataset PBF is missing or empty: $MAP_PBF; run map-server/scripts/prepare-regions-pbf.sh first"
mkdir -p "$MAP_DATA_DIR"
MAP_DATA_DIR="$(cd -- "$MAP_DATA_DIR" && pwd)"
MAP_DATA_DIR="$MAP_DATA_DIR" MAP_LIBRARY_DIR="$MAP_LIBRARY_DIR" \
  MAP_SNAPSHOT_DATE="$MAP_SNAPSHOT_DATE" MAP_REGION="$MAP_REGION" \
  MAP_REGION_IDS="$MAP_REGION_IDS" MAP_BBOX="$MAP_BBOX" \
  "$SCRIPT_DIR/verify-map-pbf.sh" "$MAP_PBF"

command -v docker >/dev/null 2>&1 || fail 'Docker is required to run the pinned OSRM backend image'
command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required to write the OSRM provenance manifests'
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

# --user keeps generated graph files owned by the invoking user; the OSRM
# image otherwise runs as root and leaves root-owned artifacts on the host.
for profile in car bicycle foot; do
  mkdir -p "$staging/$profile"
  printf 'Extracting %s graph for %s from the approved PBF (%s threads)...\n' "$profile" "$MAP_REGION" "$OSRM_BUILD_THREADS"
  docker run --rm --user "$(id -u):$(id -g)" \
    --mount "type=bind,source=$MAP_PBF,target=/input/$MAP_REGION.osm.pbf,readonly" \
    --mount "type=bind,source=$staging,target=/data" \
    "$OSRM_IMAGE" osrm-extract \
    --threads "$OSRM_BUILD_THREADS" \
    --profile "/opt/$profile.lua" \
    "/input/$MAP_REGION.osm.pbf" \
    --output "/data/$profile/$MAP_REGION"
  docker run --rm --user "$(id -u):$(id -g)" --mount "type=bind,source=$staging,target=/data" \
    "$OSRM_IMAGE" osrm-partition --threads "$OSRM_BUILD_THREADS" \
    "/data/$profile/$MAP_REGION.osrm"
  docker run --rm --user "$(id -u):$(id -g)" --mount "type=bind,source=$staging,target=/data" \
    "$OSRM_IMAGE" osrm-customize --threads "$OSRM_BUILD_THREADS" \
    "/data/$profile/$MAP_REGION.osrm"
done

# Record the exact shared cropped PBF and bbox for every generated graph.
python3 - "$staging" "$MAP_REGION" "$MAP_REGION_IDS" "$MAP_SNAPSHOT_DATE" "$MAP_BBOX" "$MAP_PBF" \
  "$MAP_DATA_DIR/$MAP_REGION.source.json" "$OSRM_IMAGE" "$OSRM_BUILD_THREADS" <<'PY'
import hashlib
import json
import pathlib
import sys

staging, region, region_ids, snapshot_date, bbox_text, pbf_path, source_manifest_path, image, build_threads = sys.argv[1:]
bbox = [float(value) for value in bbox_text.split(",")]

def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

pbf_sha256 = sha256(pbf_path)
source_manifest_sha256 = sha256(source_manifest_path)
for profile in ("car", "bicycle", "foot"):
    metadata = {
        "region": region,
        "areas": [area for area in region_ids.split(",") if area],
        "snapshotDate": snapshot_date,
        "profile": profile,
        "algorithm": "mld",
        "osrmImage": image,
        "buildThreads": int(build_threads),
        "bbox": bbox,
        "sourcePbfSha256": pbf_sha256,
        "sourceManifestSha256": source_manifest_sha256,
    }
    output = pathlib.Path(staging) / profile / f"{region}.metadata.json"
    output.write_text(json.dumps(metadata, separators=(",", ":")) + "\n", encoding="utf-8")
PY

# Publish only after all three profiles and provenance manifests are ready.
for profile in car bicycle foot; do
  mv -- "$staging/$profile" "$OSRM_DATA_DIR/$profile"
done
rmdir -- "$staging"
trap - EXIT
printf 'Created car, bicycle, and foot graphs for %s under %s\n' "$MAP_REGION" "$OSRM_DATA_DIR"
