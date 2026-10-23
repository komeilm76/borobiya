#!/usr/bin/env bash
# Fetch the three "overlap" sources Planetiler's OpenMapTiles profile wants on top of the dataset PBF:
# Natural Earth (borders/bounds at low zoom), lake centerlines (named lakes), and the water polygons
# (oceans/seas, so coastlines read as water outside the extract). None of them are our data: they are
# global reference layers, they are large, and they come from three unrelated hosts — one of which
# (osmdata.openstreetmap.de) has been intermittently unreachable, including a reported outage on
# 2026-10-22 that aborted tile builds.
#
# Why this script exists instead of letting Planetiler fetch them:
#   * Planetiler probes each source's size with a HEAD request that waits a hard-coded 10 seconds and has
#     no retry (planetiler-core Downloader.run -> Future.get(10, SECONDS)). A slow host therefore kills the
#     whole build before it starts, with an `IllegalStateException: Error getting size of <url>` stack trace.
#     `--http_timeout`/`--http_retries` do not cover that probe, and 0.10.2 has no proxy option at all.
#   * Planetiler only registers a download when the file is absent (Planetiler.getPath: `if ((!Files.exists(path)
#     || refresh) && url != null)`), so a file that is already in the cache means NO network request for that
#     source. Caching is therefore the fix, not an optimization — and it is what makes `--source-policy offline`
#     mean something for tiles as well as for the PBF.
#   * Downloads here go through curl, which honors http_proxy/https_proxy like every other script in this
#     pipeline; the JVM inside Planetiler cannot be relied on to.
#
# The cache lives at the map library, not inside a dataset bundle: these layers are not area- or
# snapshot-specific, so per-dataset copies are re-downloaded for every selection, and a dataset bundle is
# something setup prunes. `generate-tiles.sh` points Planetiler's --download-dir at the same directory.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

fail() {
  printf 'fetch-planetiler-sources: %s\n' "$*" >&2
}

# --- library location (same resolution order as the other map scripts) -------------------------------
if [[ -n "${MAP_LIBRARY_DIR:-}" ]]; then
  LIBRARY_DIR="$MAP_LIBRARY_DIR"
elif [[ -n "${XDG_DATA_HOME:-}" ]]; then
  if [[ "$XDG_DATA_HOME" != /* ]]; then
    fail 'XDG_DATA_HOME must be absolute; set MAP_LIBRARY_DIR explicitly or correct XDG_DATA_HOME'
    exit 1
  fi
  LIBRARY_DIR="$XDG_DATA_HOME/borobiya/map-library"
elif [[ -n "${HOME:-}" && "$HOME" == /* ]]; then
  LIBRARY_DIR="$HOME/.local/share/borobiya/map-library"
else
  fail 'HOME and XDG_DATA_HOME are unset; set MAP_LIBRARY_DIR to an external absolute path'
  exit 1
fi
# shellcheck disable=SC2088 # Match a literal user-supplied ~/ path, then expand it manually.
case "$LIBRARY_DIR" in
  "~") LIBRARY_DIR="${HOME:-}" ;;
  "~/"*) LIBRARY_DIR="${HOME:-}/${LIBRARY_DIR#~/}" ;;
esac

# --- what we need, in one table ----------------------------------------------------------------------
# Field order: cache filename | preferred URL | fallback URL | override variable | human label.
# The canonical host comes first so a mirror never silently becomes the source of record; the fallback is a
# mirror maintained for this exact purpose (see the comments in openmaptiles/planetiler-openmaptiles
# OpenMapTilesMain, which uses the MapTiler copies for Natural Earth and lake centerlines). Water polygons
# have no mirrored copy, which is precisely why the failure mode had to be handled here.
SOURCES=(
  "natural_earth_vector.sqlite.zip|https://naciscdn.org/naturalearth/packages/natural_earth_vector.sqlite.zip|https://dev.maptiler.download/geodata/omt/natural_earth_vector.sqlite.zip|MAP_NATURAL_EARTH_URL|Natural Earth"
  "lake_centerline.shp.zip|https://github.com/acalcutt/osm-lakelines/releases/download/v12/lake_centerline.shp.zip|https://dev.maptiler.download/geodata/omt/lake_centerline.shp.zip|MAP_LAKE_CENTERLINES_URL|OSM lake centerlines"
  "water-polygons-split-3857.zip|https://osmdata.openstreetmap.de/download/water-polygons-split-3857.zip||MAP_WATER_POLYGONS_URL|OSM water polygons"
)

SOURCES_DIR="${MAP_PLANETILER_SOURCES_DIR:-$LIBRARY_DIR/planetiler-sources}"
if [[ "$SOURCES_DIR" != /* ]]; then
  fail 'MAP_PLANETILER_SOURCES_DIR must be an absolute path'
  exit 1
fi
# `cache-first` (default): use what is on disk, fetch only what is missing.
# `refresh`: re-fetch even if present (the file is unversioned upstream, so "newer" cannot be detected).
# `offline`: never touch the network; the files must already be in the cache.
SOURCE_POLICY="${MAP_SOURCE_POLICY:-cache-first}"
case "$SOURCE_POLICY" in
  cache-first | refresh | offline) ;;
  *) fail "MAP_SOURCE_POLICY must be cache-first, refresh, or offline (got '$SOURCE_POLICY')"; exit 1 ;;
esac

command -v curl >/dev/null 2>&1 || { fail 'curl is required to fetch the Planetiler overlap sources'; exit 1; }
command -v python3 >/dev/null 2>&1 || { fail 'python3 is required to validate the overlap source archives'; exit 1; }

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

is_readable_archive() {
  # All three are ZIP archives, and Planetiler reads them as such (the Natural Earth one is a ZIP holding a
  # SQLite file). Reading the central directory costs nothing on a 900 MB file and catches the one failure
  # mode a size check cannot: a truncated transfer, or an error page saved under a .zip name.
  python3 - "$1" <<'PY' >/dev/null 2>&1
import sys, zipfile
path = sys.argv[1]
if not zipfile.is_zipfile(path):
    raise SystemExit(1)
with zipfile.ZipFile(path) as archive:
    if archive.testzip() is not None:
        raise SystemExit(1)
PY
}

mkdir -p "$SOURCES_DIR"
if [[ -n "${MAP_DATA_DIR:-}" && -d "$MAP_DATA_DIR/data/sources" ]]; then
  LEGACY_DIR="$MAP_DATA_DIR/data/sources"
else
  LEGACY_DIR=""
fi

missing=()
for entry in "${SOURCES[@]}"; do
  IFS='|' read -r filename primary_url fallback_url override_var label <<<"$entry"
  target="$SOURCES_DIR/$filename"
  # An override replaces the whole URL list: an internal mirror is the answer for a network that cannot
  # reach the public hosts at all, and it must not fall back to a host we were told to stop using.
  urls=()
  if [[ -n "${!override_var:-}" ]]; then
    urls=("${!override_var}")
  else
    urls=("$primary_url")
    [[ -n "$fallback_url" ]] && urls+=("$fallback_url")
  fi

  if [[ -s "$target" ]] && is_readable_archive "$target"; then
    if [[ "$SOURCE_POLICY" == "refresh" ]]; then
      printf '%s: MAP_SOURCE_POLICY=refresh, re-fetching...\n' "$label"
    else
      printf '%s: cached %s (SHA-256 %s)\n' "$label" "$target" "$(sha256_file "$target")"
      continue
    fi
  elif [[ -n "$LEGACY_DIR" && -s "$LEGACY_DIR/$filename" ]] && is_readable_archive "$LEGACY_DIR/$filename"; then
    # An earlier checkout kept these inside the dataset directory. Move the verified copy rather than
    # asking anyone to re-download 900 MB, and keep the digest so provenance survives the move.
    # `mv -n` reports success while refusing to touch an existing target, so the old form could
    # print "moved the copy…" for a move that never happened, leave the legacy archive in place,
    # and fall through to a full re-download. Move only what is proven readable, replace only a
    # target that is proven unusable, and announce only after the file is where it should be.
    recovered=""
    if is_readable_archive "$LEGACY_DIR/$filename"; then
      if [[ -e "$target" ]] && ! is_readable_archive "$target"; then
        printf '%s: %s is not a readable archive; replacing it with the copy from the dataset directory\n' "$label" "$target" >&2
        rm -f -- "$target"
      fi
      if [[ ! -e "$target" ]]; then
        if mv -- "$LEGACY_DIR/$filename" "$target" 2>/dev/null; then
          recovered=moved
        elif cp -- "$LEGACY_DIR/$filename" "$target"; then
          recovered=copied
        fi
      fi
    fi
    if [[ -n "$recovered" ]] && is_readable_archive "$target"; then
      # The comment above promises provenance survives the move, and the sidecar is the only record
      # of the digest — a file that arrived this way was never fetched, so nothing else writes it.
      printf '%s\n' "$(sha256_file "$target")" >"$target.sha256"
      if [[ "$recovered" == moved ]]; then
        printf '%s: moved the copy that was inside the dataset directory to %s\n' "$label" "$target"
      else
        printf '%s: copied the dataset-local archive into the library cache\n' "$label"
      fi
      printf '%s: cached %s (SHA-256 %s)\n' "$label" "$target" "$(sha256_file "$target")"
      continue
    fi
  fi

  if [[ "$SOURCE_POLICY" == "offline" ]]; then
    missing+=("$filename|$label|offline")
    continue
  fi

  fetched=""
  for url in "${urls[@]}"; do
    tmp="$target.part"
    printf '%s: fetching %s\n' "$label" "$url"
    # -C - resumes a partial $target.part from an aborted attempt (it is never pointed at the completed file,
    # so a mirror without byte-range support still serves a full fetch); --speed-limit/--speed-time abort a
    # transfer that has stalled rather than hanging the build; --retry matches the sibling map scripts.
    if curl -fL --retry 3 --retry-delay 5 -C - \
      --connect-timeout 20 --speed-limit 16384 --speed-time 120 \
      --progress-bar "$url" -o "$tmp"; then
      if is_readable_archive "$tmp"; then
        mv -f -- "$tmp" "$target"
        printf '%s\n' "$(sha256_file "$target")" >"$target.sha256"
        printf '%s: verified %s (SHA-256 %s, %s bytes)\n' \
          "$label" "$target" "$(cat "$target.sha256")" "$(wc -c <"$target" | tr -d ' ')"
        fetched=1
        break
      fi
      printf '%s: %s is not a readable archive; trying the next source\n' "$label" "$url" >&2
    fi
    rm -f -- "$tmp"
  done
  [[ -n "$fetched" ]] || missing+=("$filename|$label|network")
done

if ((${#missing[@]} > 0)); then
  fail "the Planetiler overlap sources below are not available and are required to build tiles:"
  for item in "${missing[@]}"; do
    IFS='|' read -r filename label reason <<<"$item"
    printf '  %s  [%s]  ->  %s/%s\n' "$label" "$reason" "$SOURCES_DIR" "$filename" >&2
  done
  cat >&2 <<GUIDE

Fix it by putting each file at the path shown above (the name matters, the source does not, as long as it is
the real archive: Planetiler reads these as ZIPs). Any of these is a valid way to get there:

  1. On a machine with internet, download and copy it in:
       curl -fL --retry 3 -C - -o "$SOURCES_DIR/<file>" <url>
  2. Re-run this script on a network that can reach the host, with the proxy exported so curl uses it:
       export https_proxy=http://<proxy-host>:<port> http_proxy=\$https_proxy
       ./map-server/scripts/fetch-planetiler-sources.sh
  3. Point the build at a mirror instead (it replaces the public URL completely):
       export MAP_WATER_POLYGONS_URL=https://<your-mirror>/water-polygons-split-3857.zip
       ./map-server/scripts/fetch-planetiler-sources.sh

Nothing is fetched again once the files are here, and MAP_SOURCE_POLICY=offline makes this script refuse to
reach out at all instead of failing mid-run.

GUIDE
  exit 1
fi

printf 'Planetiler overlap sources ready in %s\n' "$SOURCES_DIR"
