#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
OSRM_IMAGE="ghcr.io/project-osrm/osrm-backend:v26.10.0-debian"
MAP_DATA_DIR="${MAP_DATA_DIR:-$REPO_ROOT/map-server/data}"
MAP_REGION="${MAP_REGION:-tehran}"
MAP_BBOX="${MAP_BBOX:-51.0,35.5,51.7,35.9}"
OSRM_BUILD_THREADS="${OSRM_BUILD_THREADS:-2}"
# The canonical prepared crop is the default; explicit paths remain available for audited local setups.
MAP_PBF="${MAP_PBF:-${TEHRAN_PBF:-$MAP_DATA_DIR/$MAP_REGION.osm.pbf}}"
OSRM_DATA_DIR="${MAP_OSRM_DATA_DIR:-$REPO_ROOT/map-server/osrm/data}"

fail() {
  printf 'build-routing: %s\n' "$*" >&2
  exit 1
}

[[ "$MAP_REGION" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail 'MAP_REGION must be a lowercase region slug'
[[ "$OSRM_BUILD_THREADS" =~ ^[1-4]$ ]] || fail 'OSRM_BUILD_THREADS must be an integer from 1 to 4'
if [[ "$MAP_PBF" != /* ]]; then
  MAP_PBF="$PWD/$MAP_PBF"
fi
[[ -s "$MAP_PBF" ]] || fail "cropped PBF is missing or empty: $MAP_PBF; run scripts/prepare-tehran-pbf.sh first"
mkdir -p "$MAP_DATA_DIR"
MAP_DATA_DIR="$(cd -- "$MAP_DATA_DIR" && pwd)"
MAP_DATA_DIR="$MAP_DATA_DIR" MAP_REGION="$MAP_REGION" MAP_BBOX="$MAP_BBOX" \
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
python3 - "$staging" "$MAP_REGION" "$MAP_BBOX" "$MAP_PBF" \
  "$MAP_DATA_DIR/$MAP_REGION.source.json" "$OSRM_IMAGE" "$OSRM_BUILD_THREADS" <<'PY'
import hashlib
import json
import pathlib
import sys

staging, region, bbox_text, pbf_path, source_manifest_path, image, build_threads = sys.argv[1:]
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
