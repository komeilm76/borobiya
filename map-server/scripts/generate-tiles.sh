#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-$REPO_ROOT/map-server/data}"
mkdir -p "$MAP_DATA_DIR"
MAP_DATA_DIR="$(cd -- "$MAP_DATA_DIR" && pwd)"
TEHRAN_PBF="${TEHRAN_PBF:-$MAP_DATA_DIR/tehran.osm.pbf}"
if [[ "$TEHRAN_PBF" != /* ]]; then
  TEHRAN_PBF="$PWD/$TEHRAN_PBF"
fi
IRAN_PBF="$MAP_DATA_DIR/iran-latest.osm.pbf"
PLANETILER_VERSION="0.10.2"
PLANETILER_SHA256="f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d"
PLANETILER_JAR="$MAP_DATA_DIR/planetiler-$PLANETILER_VERSION.jar"
PLANETILER_URL="https://github.com/onthegomap/planetiler/releases/download/v$PLANETILER_VERSION/planetiler.jar"
IRAN_PBF_URL="${IRAN_PBF_URL:-https://download.geofabrik.de/asia/iran-latest.osm.pbf}"
OUTPUT="$MAP_DATA_DIR/tehran.pmtiles"

fail() {
  printf 'generate-tiles: %s\n' "$*" >&2
  exit 1
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    fail 'sha256sum or shasum is required to verify the pinned Planetiler JAR'
  fi
}

command -v java >/dev/null 2>&1 || fail 'Java 21+ is required (Planetiler 0.10.2)'
command -v curl >/dev/null 2>&1 || fail 'curl is required'
command -v awk >/dev/null 2>&1 || fail 'awk is required'
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  fail 'sha256sum or shasum is required to verify the pinned Planetiler JAR'
fi
mkdir -p "$MAP_DATA_DIR"

java_version="$(java -version 2>&1 | awk -F '"' '/version/ { print $2; exit }')"
java_major="${java_version%%.*}"
if [[ "$java_major" == '1' ]]; then
  java_major="$(printf '%s' "$java_version" | cut -d. -f2)"
fi
if [[ ! "$java_major" =~ ^[0-9]+$ ]] || (( java_major < 21 )); then
  fail "Java 21+ is required; found '${java_version:-unknown}'"
fi

# Use a supplied/previously downloaded Tehran extract when available. Otherwise,
# download the Iran extract and cut Tehran's bbox (west,south,east,north).
if [[ ! -s "$TEHRAN_PBF" ]]; then
  command -v osmium >/dev/null 2>&1 || fail 'osmium-tool is required to cut Tehran from the Iran PBF'
  if [[ ! -s "$IRAN_PBF" ]]; then
    iran_tmp="$IRAN_PBF.part"
    trap 'rm -f "${iran_tmp:-}"' EXIT
    printf 'Downloading Iran OSM extract...\n'
    curl -fL --retry 2 "$IRAN_PBF_URL" -o "$iran_tmp"
    mv "$iran_tmp" "$IRAN_PBF"
    trap - EXIT
  fi
  printf 'Extracting Tehran bbox from %s...\n' "$IRAN_PBF"
  mkdir -p "$(dirname -- "$TEHRAN_PBF")"
  pbf_tmp="$(dirname -- "$TEHRAN_PBF")/.tehran.$$.osm.pbf"
  trap 'rm -f "${pbf_tmp:-}"' EXIT
  osmium extract --bbox 51.0,35.5,51.7,35.9 "$IRAN_PBF" --output-format=pbf --output "$pbf_tmp"
  mv "$pbf_tmp" "$TEHRAN_PBF"
  trap - EXIT
fi
[[ -s "$TEHRAN_PBF" ]] || fail "Tehran PBF is missing or empty: $TEHRAN_PBF"

# Fetch the pinned JAR only if it is absent or fails the published checksum.
if [[ ! -f "$PLANETILER_JAR" ]] || [[ "$(sha256_file "$PLANETILER_JAR")" != "$PLANETILER_SHA256" ]]; then
  jar_tmp="$PLANETILER_JAR.part"
  trap 'rm -f "${jar_tmp:-}"' EXIT
  printf 'Downloading Planetiler %s...\n' "$PLANETILER_VERSION"
  curl -fL --retry 2 "$PLANETILER_URL" -o "$jar_tmp"
  actual_sha256="$(sha256_file "$jar_tmp")"
  [[ "$actual_sha256" == "$PLANETILER_SHA256" ]] || fail "Planetiler JAR checksum mismatch: $actual_sha256"
  mv "$jar_tmp" "$PLANETILER_JAR"
  trap - EXIT
fi

[[ "$(sha256_file "$PLANETILER_JAR")" == "$PLANETILER_SHA256" ]] || fail 'Planetiler JAR checksum verification failed'

# Build to a temporary archive so an interrupted run does not replace a valid map.
temp_output="$(dirname -- "$MAP_DATA_DIR")/.tehran.$$.pmtiles"
trap 'rm -f "${temp_output:-}"' EXIT
printf 'Generating %s from %s...\n' "$OUTPUT" "$TEHRAN_PBF"
(
  cd -- "$MAP_DATA_DIR"
  java "-Xmx${PLANETILER_HEAP:-4g}" -jar "$PLANETILER_JAR" \
    --osm-path="$TEHRAN_PBF" \
    --output="$temp_output" \
    --download --force
)
[[ -s "$temp_output" ]] || fail 'Planetiler did not produce a non-empty PMTiles archive'
mv -f "$temp_output" "$OUTPUT"
trap - EXIT
printf 'Created %s (%s bytes)\n' "$OUTPUT" "$(wc -c < "$OUTPUT" | tr -d ' ')"
