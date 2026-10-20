#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
PHOTON_VERSION="1.3.0"
PHOTON_SHA256="a89707c0045e4807b2a1180e132e68e108d998709f48b6c94b98a6e281f571a5"
PHOTON_URL="https://github.com/komoot/photon/releases/download/$PHOTON_VERSION/photon-$PHOTON_VERSION.jar"
PHOTON_JAR="$REPO_ROOT/map-server/photon/photon-$PHOTON_VERSION.jar"

fail() {
  printf 'download-photon: %s\n' "$*" >&2
  exit 1
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print tolower($1)}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print tolower($1)}'
  else
    fail 'sha256sum or shasum is required to verify the Photon JAR'
  fi
}

command -v curl >/dev/null 2>&1 || fail 'curl is required to download the Photon release JAR'
mkdir -p "$(dirname -- "$PHOTON_JAR")"
if [[ -s "$PHOTON_JAR" ]] && [[ "$(sha256_file "$PHOTON_JAR")" == "$PHOTON_SHA256" ]]; then
  printf 'Photon %s JAR already present and verified: %s\n' "$PHOTON_VERSION" "$PHOTON_JAR"
  exit 0
fi

temp_dir="$(mktemp -d "$(dirname -- "$PHOTON_JAR")/.photon-download.XXXXXX")"
temp_jar="$temp_dir/photon.jar"
trap 'rm -rf -- "${temp_dir:-}"' EXIT
printf 'Downloading Photon %s...\n' "$PHOTON_VERSION"
curl -fL --retry 3 --retry-delay 2 "$PHOTON_URL" -o "$temp_jar"
actual_sha256="$(sha256_file "$temp_jar")"
[[ "$actual_sha256" == "$PHOTON_SHA256" ]] || \
  fail "Photon JAR checksum mismatch: expected $PHOTON_SHA256, received $actual_sha256"
mv -- "$temp_jar" "$PHOTON_JAR"
rmdir -- "$temp_dir"
trap - EXIT
printf 'Verified Photon JAR: %s (SHA-256 %s)\n' "$PHOTON_JAR" "$actual_sha256"
