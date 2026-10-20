#!/usr/bin/env bash
# Borobiya — automated Ubuntu 24.04 VM setup.
#
# Runs the launch pipeline of docs/UBUNTU_VM_RUNBOOK.md end-to-end
# (env+secrets, Tehran crop, PMTiles, OSRM graphs, Nominatim -> Photon index,
# full stack start, DB migrations + seed, step-13 verification). The manual
# runbook remains the reference for what each stage does and how to debug it;
# run the Phase A apt/Docker installation there first — this script checks
# for those prerequisites and stops with guidance if any are missing.
#
# Safe to re-run: every stage is skipped when its output already exists and
# verifies. Existing .env values and database passwords are never rotated.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

NOMINATIM_TIMEOUT_MIN="${SETUP_NOMINATIM_TIMEOUT_MIN:-90}"

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
fail() { printf '\nsetup-ubuntu-vm: %s\n' "$*" >&2; exit 1; }

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^#\{0,1\} \{0,1\}//'
  printf '\nUsage: %s\nEnv: SETUP_NOMINATIM_TIMEOUT_MIN (default %s)\n' "$0" "$NOMINATIM_TIMEOUT_MIN"
  exit 0
fi
[[ $# -eq 0 ]] || fail "unknown argument: $1 (see --help)"

# ---------- 0. Prerequisites (runbook Phase A must already be done) ----------
log "Checking prerequisites (runbook Phase A)"
missing=0
for tool in docker git curl wget python3 openssl java osmium; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf '    MISSING: %s\n' "$tool" >&2; missing=1
  fi
done
docker compose version >/dev/null 2>&1 || { printf '    MISSING: docker compose v2 plugin\n' >&2; missing=1; }
docker info >/dev/null 2>&1 || { printf '    Docker daemon unreachable (is your user in the docker group?)\n' >&2; missing=1; }
java_major="$(java -version 2>&1 | awk -F '"' '/version/ { split($2, parts, "."); print (parts[1] == "1" ? parts[2] : parts[1]); exit }')"
[[ "$java_major" =~ ^[0-9]+$ ]] && (( java_major >= 21 )) || { printf '    Java 21+ required (found: %s)\n' "${java_major:-unknown}" >&2; missing=1; }
if (( missing )); then
  fail "prerequisites missing — complete Phase A (steps A1-A4) of docs/UBUNTU_VM_RUNBOOK.md first, then re-run this script."
fi
note "docker + compose v2, Java ${java_major}, osmium, python3 OK"
free_gb="$(df -BG --output=avail . | tail -1 | tr -dc '0-9')"
(( ${free_gb:-0} >= 15 )) || note "WARNING: only ${free_gb:-?} GiB free disk; imports may fail (runbook wants 15-20 GiB free)."

# ---------- 1. Environment + secrets (runbook A6) ----------
log "Environment (.env)"
generated_admin_password=0
if [[ ! -f .env ]]; then
  cp .env.example .env
  note "created .env from .env.example (dated immutable Geofabrik snapshot defaults)"
  db_pass="$(openssl rand -hex 24)"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^NOMINATIM_PASSWORD=.*|NOMINATIM_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${db_pass}|" .env
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://borobiya:${db_pass}@localhost:5432/borobiya|" .env
  unset db_pass
  note "generated JWT + database secrets (never change the database passwords after first start)"
else
  note "reusing existing .env (values are never rotated by this script)"
  if grep -q '^JWT_SECRET=.*replace-this' .env || grep -q '^JWT_REFRESH_SECRET=.*replace-this' .env; then
    sed -i "s|^JWT_SECRET=.*replace-this.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
    sed -i "s|^JWT_REFRESH_SECRET=.*replace-this.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
    note "replaced placeholder JWT secrets with generated ones"

  fi
  if grep -qE '^POSTGRES_PASSWORD=(change-me|replace-)' .env; then
    fail "POSTGRES_PASSWORD is still a placeholder. If the postgres-data volume was never started, set a real password plus the matching DATABASE_URL in .env (runbook A6); if it was started, restore the original password instead."
  fi
fi
set -a; # shellcheck disable=SC1091
source .env; set +a

# The containerized seed (NODE_ENV=production) requires an explicit admin
# password; generate and persist one when unset so admin login always works.
if [[ -z "${ADMIN_SEED_PASSWORD:-}" ]]; then
  ADMIN_SEED_PASSWORD="Admin-$(openssl rand -hex 12)"
  if grep -q '^# ADMIN_SEED_PASSWORD=' .env; then
    sed -i "s|^# ADMIN_SEED_PASSWORD=.*|ADMIN_SEED_PASSWORD=${ADMIN_SEED_PASSWORD}|" .env
  elif grep -q '^ADMIN_SEED_PASSWORD=' .env; then
    sed -i "s|^ADMIN_SEED_PASSWORD=.*|ADMIN_SEED_PASSWORD=${ADMIN_SEED_PASSWORD}|" .env
  else
    printf '\nADMIN_SEED_PASSWORD=%s\n' "$ADMIN_SEED_PASSWORD" >> .env
  fi
  export ADMIN_SEED_PASSWORD
  generated_admin_password=1
  note "generated ADMIN_SEED_PASSWORD into .env (used at seed time below)"
fi

MAP_REGION="${MAP_REGION:-tehran}"
MAP_PBF="${MAP_PBF:-./map-server/data/${MAP_REGION}.osm.pbf}"
OSRM_DATA_DIR="${MAP_OSRM_DATA_DIR:-./map-server/osrm/data}"
expected_osmium="${MAP_OSMIUM_VERSION:-1.16.0}"
installed_osmium="$(osmium --version 2>&1 | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+[.][0-9]+[.][0-9]+$/) { print $i; exit } }')"
[[ "$installed_osmium" == "$expected_osmium" ]] || \
  fail "osmium-tool ${expected_osmium} required (found ${installed_osmium:-unknown}); see runbook step 8 troubleshooting."

# ---------- helpers ----------
wait_healthy() {
  # $1 = service, $2 = timeout seconds, remaining args = compose profile flags
  local service="$1" timeout_s="$2"; shift 2
  local deadline=$(( $(date +%s) + timeout_s )) status=""
  while :; do
    local cid; cid="$(docker compose "$@" ps -q "$service" 2>/dev/null || true)"
    if [[ -n "$cid" ]]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
      case "$status" in
        healthy|running) note "${service}: ${status}"; return 0 ;;
        exited|dead)
          docker compose "$@" logs --tail=50 "$service" >&2 || true
          fail "${service} exited during startup (see logs above)." ;;
      esac
    fi
    (( $(date +%s) < deadline )) || {
      docker compose "$@" logs --tail=50 "$service" >&2 || true
      fail "timed out after ${timeout_s}s waiting for ${service} (last status: ${status:-unknown}; logs above)."
    }
    sleep 10
  done
}

# ---------- 2. Shared Tehran crop (runbook steps 7-8) ----------
log "Tehran crop (source download + Osmium crop + manifest verify)"
if ./map-server/scripts/verify-map-pbf.sh "$MAP_PBF" >/dev/null 2>&1; then
  note "existing crop verified — skipping prepare"
else
  ./map-server/scripts/prepare-tehran-pbf.sh
  ./map-server/scripts/verify-map-pbf.sh "$MAP_PBF"
fi

# ---------- 3. PMTiles (runbook step 9) ----------
log "PMTiles (Planetiler)"
if [[ -s "map-server/data/${MAP_REGION}.pmtiles" ]]; then
  note "existing ${MAP_REGION}.pmtiles found — skipping tile build"
else
  ./map-server/scripts/generate-tiles.sh
fi

# ---------- 4. OSRM graphs (runbook step 10) ----------
log "OSRM graphs (car, bicycle, foot)"
osrm_complete=1; osrm_partial=0
for profile in car bicycle foot; do
  [[ -s "${OSRM_DATA_DIR}/${profile}/${MAP_REGION}.osrm" ]] || osrm_complete=0
  [[ -e "${OSRM_DATA_DIR}/${profile}" ]] && osrm_partial=1
done
if (( osrm_complete )); then
  note "existing OSRM graphs found — skipping graph build"
elif (( osrm_partial )); then
  fail "partial OSRM output under ${OSRM_DATA_DIR}; build-routing.sh requires clean profile dirs — inspect, remove incomplete profile directories, then re-run."
else
  ./map-server/scripts/build-routing.sh
fi

# ---------- 5. Photon index via Nominatim (runbook step 11) ----------
log "Photon geocoding index (Nominatim import -> Photon import)"
./map-server/scripts/download-photon.sh
if [[ -d map-server/photon/data/photon_data ]] && [[ -n "$(ls -A map-server/photon/data/photon_data 2>/dev/null)" ]]; then
  note "existing Photon index found — skipping Nominatim/Photon import"
else
  docker compose --profile geocoding-import up -d nominatim
  note "waiting for Nominatim's first import (can take a long while; timeout ${NOMINATIM_TIMEOUT_MIN}m)..."
  wait_healthy nominatim $(( NOMINATIM_TIMEOUT_MIN * 60 )) --profile geocoding-import
  (
    cd map-server/photon/data
    java -Xms512m -Xmx2g -jar ../photon-1.3.0.jar import \
      -host 127.0.0.1 -port "${NOMINATIM_DB_PORT:-5433}" \
      -database nominatim -user nominatim -password "$NOMINATIM_PASSWORD" \
      -languages fa,en
  )
  docker compose --profile geocoding-import stop nominatim
  note "Photon index built; Nominatim stopped to free RAM"
fi

# ---------- 6. Full stack + database init (runbook step 12 + migrations/seed) ----------
log "Starting the full stack (builds local images on first run)"
docker compose --profile routing --profile geocoding up -d --build
wait_healthy postgres 180
log "Applying database migrations and seed (runtime migrator inside the API image)"
docker compose run --rm api bun src/db/migrate.ts
docker compose run --rm -e ADMIN_SEED_PASSWORD api bun src/db/seed.ts
wait_healthy routing-gateway 180 --profile routing --profile geocoding
wait_healthy api 180

# ---------- 7. Acceptance (runbook step 13) ----------
log "Verifying tiles, routing, and geocoding"
./map-server/scripts/verify-tehran-tiles.sh
./map-server/scripts/verify-routing.sh
./map-server/scripts/verify-geocoding.sh

docker compose --profile routing --profile geocoding ps
docker stats --no-stream || true

log "Setup complete"
cat <<EOF
  Admin login (web client):  username "admin"
    password: ${generated_admin_password:+the ADMIN_SEED_PASSWORD generated into .env during this run}
EOF
if (( ! generated_admin_password )); then
  note "password: the ADMIN_SEED_PASSWORD value in .env — but only if the seed created the admin with it."
  note "If admin login fails, reset it: docker compose run --rm -e ADMIN_SEED_PASSWORD api bun src/db/reset-admin-password.ts '<new-password>'"
else
  note "password (also in .env): ${ADMIN_SEED_PASSWORD}"
fi
cat <<'EOF'

  Next:
    - Web client for development:  bun run dev
      (stop the Docker api first so the dev API can bind :3000:
       docker compose stop api   # keep postgres/martin/gateway/osrm/photon running)
    - Or use the gateway directly at http://localhost:8080 (loopback only).
    - Re-running this script is safe; completed stages are skipped.
EOF
