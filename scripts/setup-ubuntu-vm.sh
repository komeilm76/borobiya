#!/usr/bin/env bash
# Borobiya — automated Ubuntu 24.04 VM setup.
#
# Runs the launch pipeline of docs/UBUNTU_VM_RUNBOOK.md end-to-end:
# env+secrets, area selection, source downloads + Osmium crops + merge,
# PMTiles, OSRM graphs, Nominatim -> Photon index, full stack start,
# DB migrations + seed, and per-area acceptance checks. The manual runbook
# remains the reference for what each stage does and how to debug it; run
# the Phase A apt/Docker installation there first — this script checks for
# those prerequisites and stops with guidance if any are missing.
#
# Map areas are selectable: whole countries and/or cities from
# map-server/regions.json (e.g. ir-tehran, de-Frankfurt, gb). Interactively
# you get a form (countries first, then cities per country — multiple of
# each); non-interactively use --regions or SETUP_REGIONS. The selection is
# stored in .env (MAP_REGION_IDS) so re-runs keep it; use --reselect to
# change it later (stale stages then rebuild automatically).
#
# Safe to re-run: stages whose output still matches the current dataset
# PBF checksum are skipped. Existing .env secrets and database passwords
# are never rotated.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

REGIONS_PY="map-server/scripts/regions.py"
NOMINATIM_TIMEOUT_MIN="${SETUP_NOMINATIM_TIMEOUT_MIN:-90}"
DATASET="borobiya"
MAP_PBF_PATH="./map-server/data/${DATASET}.osm.pbf"
PHOTON_STAMP="map-server/photon/data/.borobiya-pbf.sha256"

ARG_REGIONS=""
RESELECT=0
ASSUME_YES=0
DRY_RUN=0

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
fail() { printf '\nsetup-ubuntu-vm: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: scripts/setup-ubuntu-vm.sh [options]

Options:
  --regions <ids>   Comma-separated area IDs (skip the selection form),
                    e.g. --regions ir-tehran,de-Frankfurt  (or SETUP_REGIONS)
  --reselect        Ask for areas again even if .env already has a selection
  --list-regions    Print the area catalog and exit
  --yes             Non-interactive: no prompts (uses --regions/SETUP_REGIONS,
                    the saved selection, or the ir-tehran default)
  --dry-run         Resolve the selection and print the stage plan only;
                    writes nothing and downloads nothing
  -h, --help        This help

Env: SETUP_REGIONS, SETUP_FORCE_FORM=1 (force prompts without a TTY),
     SETUP_NOMINATIM_TIMEOUT_MIN (default 90)
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --regions) [[ $# -ge 2 ]] || fail "--regions requires a value"; ARG_REGIONS="$2"; shift 2 ;;
    --regions=*) ARG_REGIONS="${1#*=}"; shift ;;
    --reselect) RESELECT=1; shift ;;
    --list-regions)
      command -v python3 >/dev/null 2>&1 || fail "python3 is required to read the region catalog"
      python3 "$REGIONS_PY" list
      exit 0 ;;
    --yes) ASSUME_YES=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1 (see --help)" ;;
  esac
done

# Interactive input: prefer the terminal even when stdin is redirected.
INPUT_FD=0
if { exec 3</dev/tty; } 2>/dev/null; then INPUT_FD=3; fi
INTERACTIVE=0
if [[ -t 0 || "$INPUT_FD" == "3" ]]; then INTERACTIVE=1; fi
# Escape hatch for unusual terminals (and automated form tests).
if [[ "${SETUP_FORCE_FORM:-0}" == "1" ]]; then INTERACTIVE=1; fi
if (( ASSUME_YES )); then INTERACTIVE=0; fi

read_form_line() {
  # $1 = prompt; result in FORM_REPLY
  printf '%s' "$1"
  IFS= read -r -u "$INPUT_FD" FORM_REPLY || fail "input closed; re-run with --regions <ids> for a non-interactive setup"
}

# ---------- 0. Prerequisites (runbook Phase A must already be done) ----------
log "Checking prerequisites (runbook Phase A)"
missing=0
for tool in docker git curl wget python3 openssl java osmium; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf '    MISSING: %s\n' "$tool" >&2; missing=1
  fi
done
if command -v docker >/dev/null 2>&1; then
  docker compose version >/dev/null 2>&1 || { printf '    MISSING: docker compose v2 plugin\n' >&2; missing=1; }
  docker info >/dev/null 2>&1 || { printf '    Docker daemon unreachable (is your user in the docker group?)\n' >&2; missing=1; }
fi
java_major=""
if command -v java >/dev/null 2>&1; then
  java_major="$(java -version 2>&1 | awk -F '"' '/version/ { split($2, parts, "."); print (parts[1] == "1" ? parts[2] : parts[1]); exit }')"
  if ! [[ "$java_major" =~ ^[0-9]+$ ]] || (( java_major < 21 )); then
    printf '    Java 21+ required (found: %s)\n' "${java_major:-unknown}" >&2; missing=1
  fi
fi
if command -v python3 >/dev/null 2>&1; then
  python3 "$REGIONS_PY" validate-catalog >/dev/null || fail "region catalog is invalid (see above); fix map-server/regions.json first"
fi
if (( missing )); then
  if (( DRY_RUN )); then
    note "WARNING: prerequisites missing (dry-run continues; a real run would stop here)"
  else
    fail "prerequisites missing — complete Phase A (steps A1-A4) of docs/UBUNTU_VM_RUNBOOK.md first, then re-run this script."
  fi
else
  note "docker + compose v2, Java ${java_major}, osmium, python3 OK; region catalog valid"
fi
free_gb="$(df -BG --output=avail . | tail -1 | tr -dc '0-9')"
(( ${free_gb:-0} >= 15 )) || note "WARNING: only ${free_gb:-?} GiB free disk; imports may fail (runbook wants 15-20 GiB free)."

# ---------- 1. Environment + secrets (runbook A6) ----------
log "Environment (.env)"
generated_admin_password=0
set_env() {
  local key="$1" value="$2"
  if (( DRY_RUN )); then note "would set ${key}=${value} in .env"; return 0; fi
  if grep -q "^# ${key}=" .env; then
    sed -i "s|^# ${key}=.*|${key}=${value}|" .env
  elif grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

if [[ ! -f .env ]]; then
  if (( DRY_RUN )); then
    note "would create .env from .env.example with generated secrets"
    set -a; # shellcheck disable=SC1091
    source .env.example; set +a
  else
    cp .env.example .env
    note "created .env from .env.example"
    db_pass="$(openssl rand -hex 24)"
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
    sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
    sed -i "s|^NOMINATIM_PASSWORD=.*|NOMINATIM_PASSWORD=$(openssl rand -hex 24)|" .env
    sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${db_pass}|" .env
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://borobiya:${db_pass}@localhost:5432/borobiya|" .env
    unset db_pass
    note "generated JWT + database secrets (never change the database passwords after first start)"
    set -a; # shellcheck disable=SC1091
    source .env; set +a
  fi
else
  note "reusing existing .env (values are never rotated by this script)"
  if (( ! DRY_RUN )); then
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
fi

# The containerized seed (NODE_ENV=production) requires an explicit admin
# password. Offer a prompt interactively; otherwise generate and persist
# one so the admin login always works.
if [[ -z "${ADMIN_SEED_PASSWORD:-}" ]]; then
  chosen_admin_password=""
  if (( INTERACTIVE && ! DRY_RUN )); then
    while :; do
      printf '    Admin password for user "admin" [Enter = generate a strong one]: '
      IFS= read -r -s -u "$INPUT_FD" chosen_admin_password || chosen_admin_password=""
      printf '\n'
      [[ -z "$chosen_admin_password" ]] && break
      if (( ${#chosen_admin_password} >= 8 )) && [[ "$chosen_admin_password" =~ [A-Za-z] && "$chosen_admin_password" =~ [0-9] ]]; then
        break
      fi
      printf '    Password must be at least 8 characters and contain a letter and a digit; try again (or Enter to generate).\n' >&2
    done
  fi
  if [[ -n "$chosen_admin_password" ]]; then
    ADMIN_SEED_PASSWORD="$chosen_admin_password"
    unset chosen_admin_password
    set_env ADMIN_SEED_PASSWORD "$ADMIN_SEED_PASSWORD"
    export ADMIN_SEED_PASSWORD
    note "stored your admin password as ADMIN_SEED_PASSWORD in .env (used at seed time below)"
  elif (( DRY_RUN )); then
    note "would generate ADMIN_SEED_PASSWORD into .env (used at seed time)"
  else
    ADMIN_SEED_PASSWORD="Admin-$(openssl rand -hex 12)"
    set_env ADMIN_SEED_PASSWORD "$ADMIN_SEED_PASSWORD"
    export ADMIN_SEED_PASSWORD
    generated_admin_password=1
    note "generated ADMIN_SEED_PASSWORD into .env (used at seed time below)"
  fi
fi

expected_osmium="${MAP_OSMIUM_VERSION:-1.16.0}"
if command -v osmium >/dev/null 2>&1; then
  installed_osmium="$(osmium --version 2>&1 | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+[.][0-9]+[.][0-9]+$/) { print $i; exit } }')"
  if [[ "$installed_osmium" != "$expected_osmium" ]]; then
    if (( DRY_RUN )); then
      note "WARNING: osmium-tool ${expected_osmium} required (found ${installed_osmium:-unknown})"
    else
      fail "osmium-tool ${expected_osmium} required (found ${installed_osmium:-unknown}); see runbook step 8 troubleshooting."
    fi
  fi
fi

# ---------- 2. Area selection ----------
log "Map area selection"

resolve_selection() {
  # $1 = csv; evals REGION_IDS/UNION_BBOX/... or fails with catalog guidance
  local output
  if ! output="$(python3 "$REGIONS_PY" resolve "$1")"; then
    fail "invalid area selection '$1' (see the message above; list valid areas with: $0 --list-regions)"
  fi
  eval "$output"
}

print_selection_summary() {
  note "areas:            $REGION_IDS"
  note "union bbox:       $UNION_BBOX (written to MAP_BBOX)"
  note "source downloads: $SOURCE_IDS (~${APPROX_DOWNLOAD_MB} MB total, cached after first run)"
  note "geocoding langs:  $PHOTON_LANGUAGES (default: $PHOTON_DEFAULT_LANGUAGE)"
  if [[ "$SELECTION_HEAVY" == "1" ]]; then
    note "WARNING: a whole large country is selected — expect multi-GB downloads and long"
    note "         Planetiler/OSRM/Nominatim builds; the 6 GB VM profile may struggle."
  fi
}

# Turn form tokens (numbers and/or exact IDs) into IDs.
# $1 = raw reply, rest = ordered menu IDs; result in FORM_IDS (space-separated)
parse_form_choices() {
  local reply="$1"; shift
  local -a menu=("$@")
  FORM_IDS=""
  local normalized="${reply//,/ }"
  local -a tokens=()
  read -r -a tokens <<< "$normalized"
  (( ${#tokens[@]} > 0 )) || return 1
  local token index
  for token in "${tokens[@]}"; do
    if [[ "$token" =~ ^[0-9]+$ ]]; then
      index=$((10#$token))
      (( index >= 1 && index <= ${#menu[@]} )) || return 1
      FORM_IDS+="${menu[$((index - 1))]} "
    else
      local lowered="${token,,}" found=0 candidate
      for candidate in "${menu[@]}"; do
        if [[ "$candidate" == "$lowered" ]]; then found=1; break; fi
      done
      (( found )) || return 1
      FORM_IDS+="$lowered "
    fi
  done
  FORM_IDS="${FORM_IDS% }"
}

run_selection_form() {
  local -a country_ids=() country_names=()
  local id name local_name city_count
  while IFS=$'\t' read -r id name local_name city_count; do
    country_ids+=("$id")
    country_names+=("$name ($local_name) — $city_count cities")
  done < <(python3 "$REGIONS_PY" menu-countries)

  printf '\n  Which countries do you need?\n'
  local i
  for i in "${!country_ids[@]}"; do
    printf '    %2d) %-42s [%s]\n' "$((i + 1))" "${country_names[$i]}" "${country_ids[$i]}"
  done
  local -a chosen_countries=()
  while :; do
    read_form_line "  Countries — numbers or IDs, separated by spaces/commas ('all', q = quit): "
    case "${FORM_REPLY,,}" in
      q|quit) fail "aborted by user" ;;
      all) chosen_countries=("${country_ids[@]}"); break ;;
    esac
    if parse_form_choices "$FORM_REPLY" "${country_ids[@]}"; then
      read -r -a chosen_countries <<< "$FORM_IDS"
      break
    fi
    printf '    Please enter valid country numbers/IDs from the list.\n' >&2
  done

  local -a chosen_areas=()
  local country area_id area_label
  for country in "${chosen_countries[@]}"; do
    local -a area_ids=() area_labels=()
    while IFS=$'\t' read -r area_id area_label; do
      area_ids+=("$area_id")
      area_labels+=("$area_label")
    done < <(python3 "$REGIONS_PY" menu-areas "$country")
    printf '\n  %s — entire country, or which cities?\n' "$country"
    for i in "${!area_ids[@]}"; do
      printf '    %2d) %-58s [%s]\n' "$((i + 1))" "${area_labels[$i]}" "${area_ids[$i]}"
    done
    while :; do
      read_form_line "  Areas in $country — numbers or IDs (1 = entire country; multiple allowed; q = quit): "
      case "${FORM_REPLY,,}" in q|quit) fail "aborted by user" ;; esac
      if parse_form_choices "$FORM_REPLY" "${area_ids[@]}"; then
        local -a picked=()
        read -r -a picked <<< "$FORM_IDS"
        chosen_areas+=("${picked[@]}")
        break
      fi
      printf '    Please enter valid area numbers/IDs from the list.\n' >&2
    done
  done

  FORM_SELECTION="$(IFS=','; printf '%s' "${chosen_areas[*]}")"
}

# Recover the selection of an already-built dataset when .env has none yet
# (e.g. first run after upgrading a pre-catalog checkout), so an unattended
# re-run keeps serving the areas that are actually on disk.
existing_selection=""
existing_source=""
if [[ -s "map-server/data/${DATASET}.source.json" ]]; then
  existing_selection="$(python3 - "map-server/data/${DATASET}.source.json" <<'PYEOF' 2>/dev/null || true
import json, sys
try:
    areas = json.load(open(sys.argv[1], encoding="utf-8"))["areas"]
    if isinstance(areas, list) and areas:
        print(",".join(areas))
except Exception:
    pass
PYEOF
)"
  [[ -n "$existing_selection" ]] && existing_source="existing dataset manifest"
fi
if [[ -z "$existing_selection" && -s map-server/data/tehran.osm.pbf && -s map-server/data/tehran.source.json ]]; then
  existing_selection="ir-tehran"
  existing_source="existing Tehran install (artifacts will migrate)"
fi

SELECTION_SOURCE=""
SELECTION_INPUT=""
if [[ -n "$ARG_REGIONS" ]]; then
  SELECTION_INPUT="$ARG_REGIONS"; SELECTION_SOURCE="--regions"
elif [[ -n "${SETUP_REGIONS:-}" ]]; then
  SELECTION_INPUT="$SETUP_REGIONS"; SELECTION_SOURCE="SETUP_REGIONS"
elif (( ! RESELECT )) && [[ -n "${MAP_REGION_IDS:-}" ]]; then
  SELECTION_INPUT="$MAP_REGION_IDS"; SELECTION_SOURCE="saved .env selection"
elif (( ! RESELECT )) && [[ -n "$existing_selection" ]]; then
  SELECTION_INPUT="$existing_selection"; SELECTION_SOURCE="$existing_source"
elif (( INTERACTIVE )); then
  SELECTION_SOURCE="selection form"
else
  SELECTION_INPUT="ir-tehran"; SELECTION_SOURCE="default (non-interactive run without a saved selection)"
fi

while :; do
  if [[ "$SELECTION_SOURCE" == "selection form" ]]; then
    run_selection_form
    SELECTION_INPUT="$FORM_SELECTION"
  fi
  resolve_selection "$SELECTION_INPUT"
  note "selection source: $SELECTION_SOURCE"
  print_selection_summary
  if (( INTERACTIVE )); then
    if [[ "$SELECTION_SOURCE" == "selection form" ]]; then
      read_form_line "  Proceed with this selection? [Y]es / [e]dit / [a]bort: "
      case "${FORM_REPLY,,}" in
        ""|y|yes) break ;;
        e|edit) continue ;;
        a|abort|q) fail "aborted by user" ;;
        *) note "assuming yes"; break ;;
      esac
    elif [[ "$SELECTION_HEAVY" == "1" ]]; then
      read_form_line "  This is a heavy build. Proceed? [Y]es / [a]bort: "
      case "${FORM_REPLY,,}" in
        ""|y|yes) break ;;
        *) fail "aborted by user" ;;
      esac
    else
      break
    fi
  else
    break
  fi
done

if [[ "${MAP_REGION:-}" != "" && "${MAP_REGION:-}" != "$DATASET" ]]; then
  note "MAP_REGION was '${MAP_REGION}'; the dataset slug is now standardized to '${DATASET}'"
  note "(styles/Martin serve exactly one dataset source; your areas live in MAP_REGION_IDS)"
fi
set_env MAP_REGION_IDS "$REGION_IDS"
set_env MAP_REGION "$DATASET"
set_env MAP_BBOX "$UNION_BBOX"
set_env MAP_PBF "$MAP_PBF_PATH"
set_env PHOTON_DEFAULT_LANGUAGE "$PHOTON_DEFAULT_LANGUAGE"
export MAP_REGION_IDS="$REGION_IDS" MAP_REGION="$DATASET" MAP_BBOX="$UNION_BBOX"
export MAP_PBF="$MAP_PBF_PATH" PHOTON_DEFAULT_LANGUAGE
OSRM_DATA_DIR="${MAP_OSRM_DATA_DIR:-./map-server/osrm/data}"

metadata_value() {
  # $1 = json file, $2 = key; echoes value or nothing
  python3 - "$1" "$2" <<'PYEOF' 2>/dev/null || true
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        print(json.load(handle).get(sys.argv[2], ""))
except Exception:
    print("")
PYEOF
}

file_sha256() {
  sha256sum "$1" 2>/dev/null | awk '{print tolower($1)}'
}

# ---------- dry-run: print the plan and stop ----------
if (( DRY_RUN )); then
  log "Dry-run plan (nothing was written, downloaded, or started)"
  if [[ -s "$MAP_PBF_PATH" ]] && ./map-server/scripts/verify-map-pbf.sh "$MAP_PBF_PATH" >/dev/null 2>&1; then
    note "dataset PBF:   present and verified for this selection -> prepare stage would SKIP"
    plan_sha="$(file_sha256 "$MAP_PBF_PATH")"
  else
    note "dataset PBF:   missing/stale -> prepare stage would RUN (downloads/crops/merge)"
    plan_sha=""
  fi
  while IFS=$'\t' read -r _sid _surl sfile _smd5 _sbytes _sapprox; do
    if [[ -s "map-server/data/source/$sfile" ]]; then
      note "  source $sfile: cached"
    else
      note "  source $sfile: would download"
    fi
  done < <(python3 "$REGIONS_PY" sources "$REGION_IDS")
  if [[ -n "$plan_sha" && "$(metadata_value "map-server/data/${DATASET}.metadata.json" sourcePbfSha256)" == "$plan_sha" ]]; then
    note "tiles:         PMTiles matches the dataset checksum -> would SKIP"
  else
    note "tiles:         missing/stale -> Planetiler would RUN"
  fi
  if [[ -n "$plan_sha" && "$(metadata_value "${OSRM_DATA_DIR}/car/${DATASET}.metadata.json" sourcePbfSha256)" == "$plan_sha" ]]; then
    note "routing:       OSRM graphs match the dataset checksum -> would SKIP"
  else
    note "routing:       missing/stale -> OSRM build would RUN (stale graphs moved aside)"
  fi
  if [[ -n "$plan_sha" && -f "$PHOTON_STAMP" && "$(cat "$PHOTON_STAMP")" == "$plan_sha" ]]; then
    note "geocoding:     Photon index matches the dataset checksum -> would SKIP"
  else
    note "geocoding:     missing/stale -> Nominatim + Photon import would RUN"
  fi
  note "then: full stack start, DB migrations + seed, and per-area acceptance checks"
  exit 0
fi

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

# ---------- legacy Tehran-only artifact migration ----------
# Installs built before the area catalog used "tehran" artifact names.
# When the selection is still exactly Tehran, rename them to the dataset
# names (and convert the v1 manifest) instead of rebuilding everything.
legacy_tehran_migrated=0
rewrite_metadata_region() {
  # $1 = metadata json path
  python3 - "$1" "$DATASET" <<'PYEOF'
import json, sys
path, dataset = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as handle:
    data = json.load(handle)
data["region"] = dataset
data["areas"] = ["ir-tehran"]
with open(path, "w", encoding="utf-8") as handle:
    json.dump(data, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
PYEOF
}

if [[ "$REGION_IDS" == "ir-tehran" ]]; then
  data_dir="map-server/data"
  if [[ ! -e "$data_dir/${DATASET}.osm.pbf" && -s "$data_dir/tehran.osm.pbf" && -s "$data_dir/tehran.source.json" ]]; then
    log "Migrating legacy Tehran dataset artifacts to '${DATASET}' names"
    mv -- "$data_dir/tehran.osm.pbf" "$data_dir/${DATASET}.osm.pbf"
    if python3 "$REGIONS_PY" migrate-manifest-v1 \
        --input "$data_dir/tehran.source.json" \
        --output "$data_dir/${DATASET}.source.json" \
        --pbf "$data_dir/${DATASET}.osm.pbf" --dataset "$DATASET"; then
      rm -f -- "$data_dir/tehran.source.json"
      legacy_tehran_migrated=1
      note "dataset PBF + provenance manifest migrated (no re-crop needed)"
    else
      mv -- "$data_dir/${DATASET}.osm.pbf" "$data_dir/tehran.osm.pbf"
      note "legacy manifest could not be migrated safely; the dataset will be rebuilt instead"
    fi
  fi
  if (( legacy_tehran_migrated )); then
    if [[ ! -e "$data_dir/${DATASET}.pmtiles" && -s "$data_dir/tehran.pmtiles" ]]; then
      mv -- "$data_dir/tehran.pmtiles" "$data_dir/${DATASET}.pmtiles"
      if [[ -s "$data_dir/tehran.metadata.json" ]]; then
        mv -- "$data_dir/tehran.metadata.json" "$data_dir/${DATASET}.metadata.json"
        rewrite_metadata_region "$data_dir/${DATASET}.metadata.json"
      fi
      note "PMTiles archive renamed (Martin source is now '${DATASET}')"
    fi
    for profile in car bicycle foot; do
      profile_dir="${OSRM_DATA_DIR}/${profile}"
      if [[ -d "$profile_dir" && ! -e "$profile_dir/${DATASET}.osrm" && -e "$profile_dir/tehran.osrm" ]]; then
        for legacy_file in "$profile_dir"/tehran.*; do
          [[ -e "$legacy_file" ]] || continue
          mv -- "$legacy_file" "$profile_dir/${DATASET}.${legacy_file#"$profile_dir"/tehran.}"
        done
        [[ -s "$profile_dir/${DATASET}.metadata.json" ]] && rewrite_metadata_region "$profile_dir/${DATASET}.metadata.json"
        note "OSRM ${profile} graph renamed"
      fi
    done
  fi
fi

# ---------- 3. Dataset PBF: sources + crops + merge (runbook steps 7-8) ----------
log "Dataset PBF (Geofabrik downloads, Osmium crops, merge, manifest verify)"
if ./map-server/scripts/verify-map-pbf.sh "$MAP_PBF_PATH" >/dev/null 2>&1; then
  note "existing dataset verified for areas $REGION_IDS — skipping prepare"
else
  ./map-server/scripts/prepare-regions-pbf.sh
  ./map-server/scripts/verify-map-pbf.sh "$MAP_PBF_PATH"
fi
pbf_sha="$(file_sha256 "$MAP_PBF_PATH")"
[[ -n "$pbf_sha" ]] || fail "could not checksum the dataset PBF at $MAP_PBF_PATH"

# ---------- 4. PMTiles (runbook step 9) ----------
log "PMTiles (Planetiler)"
if [[ -s "map-server/data/${DATASET}.pmtiles" ]] && \
   [[ "$(metadata_value "map-server/data/${DATASET}.metadata.json" sourcePbfSha256)" == "$pbf_sha" ]]; then
  note "existing ${DATASET}.pmtiles matches the dataset checksum — skipping tile build"
else
  ./map-server/scripts/generate-tiles.sh
fi

# ---------- 5. OSRM graphs (runbook step 10) ----------
log "OSRM graphs (car, bicycle, foot)"
osrm_complete=1; osrm_any=0
for profile in car bicycle foot; do
  [[ -s "${OSRM_DATA_DIR}/${profile}/${DATASET}.osrm" ]] || osrm_complete=0
  [[ -e "${OSRM_DATA_DIR}/${profile}" ]] && osrm_any=1
done
osrm_fresh=0
if (( osrm_complete )) && \
   [[ "$(metadata_value "${OSRM_DATA_DIR}/car/${DATASET}.metadata.json" sourcePbfSha256)" == "$pbf_sha" ]]; then
  osrm_fresh=1
fi
stale_backup=""
if (( osrm_fresh )); then
  note "existing OSRM graphs match the dataset checksum — skipping graph build"
else
  if (( osrm_any )); then
    stale_backup="${OSRM_DATA_DIR}/.stale-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$stale_backup"
    for profile in car bicycle foot; do
      [[ -e "${OSRM_DATA_DIR}/${profile}" ]] && mv -- "${OSRM_DATA_DIR}/${profile}" "$stale_backup/"
    done
    note "moved stale/incomplete OSRM graphs to $stale_backup (delete it once the new build verifies)"
  fi
  ./map-server/scripts/build-routing.sh
fi

# ---------- 6. Photon index via Nominatim (runbook step 11) ----------
log "Photon geocoding index (Nominatim import -> Photon import)"
./map-server/scripts/download-photon.sh

reset_nominatim_volume() {
  docker compose --profile geocoding-import stop nominatim >/dev/null 2>&1 || true
  local cid="" volume=""
  cid="$(docker compose --profile geocoding-import ps -aq nominatim 2>/dev/null || true)"
  if [[ -n "$cid" ]]; then
    volume="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/16/main"}}{{.Name}}{{end}}{{end}}' "$cid" 2>/dev/null || true)"
    docker compose --profile geocoding-import rm -f nominatim >/dev/null 2>&1 || true
  fi
  if [[ -z "$volume" ]]; then
    local -a candidates=()
    mapfile -t candidates < <(docker volume ls -q | grep -E '(^|_)nominatim-data$' || true)
    if (( ${#candidates[@]} == 1 )); then
      volume="${candidates[0]}"
    elif (( ${#candidates[@]} > 1 )); then
      fail "multiple Nominatim volumes found (${candidates[*]}); remove this project's one manually (docker volume rm <name>) after stopping nominatim, delete map-server/photon/data/photon_data and $PHOTON_STAMP, then re-run."
    fi
  fi
  if [[ -n "$volume" ]]; then
    docker volume rm "$volume" >/dev/null || \
      fail "could not remove the Nominatim volume $volume; stop nominatim, remove it manually (docker volume rm $volume), delete map-server/photon/data/photon_data, then re-run."
    note "removed old Nominatim volume $volume (its database held the previous area selection)"
  fi
}

photon_index_present=0
if [[ -d map-server/photon/data/photon_data ]] && [[ -n "$(ls -A map-server/photon/data/photon_data 2>/dev/null)" ]]; then
  photon_index_present=1
fi
photon_fresh=0
if (( photon_index_present )) && [[ -f "$PHOTON_STAMP" ]] && [[ "$(cat "$PHOTON_STAMP")" == "$pbf_sha" ]]; then
  photon_fresh=1
elif (( photon_index_present && legacy_tehran_migrated )) && [[ ! -f "$PHOTON_STAMP" ]]; then
  # The index was built from the same Tehran PBF that was just migrated.
  printf '%s\n' "$pbf_sha" > "$PHOTON_STAMP"
  photon_fresh=1
  note "adopted the existing Tehran Photon index for the migrated dataset (wrote checksum stamp)"
fi

if (( photon_fresh )); then
  note "existing Photon index matches the dataset checksum — skipping Nominatim/Photon import"
else
  if (( photon_index_present )); then
    note "Photon index belongs to a different dataset; rebuilding (Nominatim volume + Photon index reset)"
    docker compose --profile geocoding stop photon >/dev/null 2>&1 || true
    reset_nominatim_volume
    rm -rf -- map-server/photon/data/photon_data
    rm -f -- "$PHOTON_STAMP"
  fi
  docker compose --profile geocoding-import up -d nominatim
  note "waiting for Nominatim's first import (can take a long while; timeout ${NOMINATIM_TIMEOUT_MIN}m)..."
  wait_healthy nominatim $(( NOMINATIM_TIMEOUT_MIN * 60 )) --profile geocoding-import
  (
    cd map-server/photon/data
    java -Xms512m -Xmx2g -jar ../photon-1.3.0.jar import \
      -host 127.0.0.1 -port "${NOMINATIM_DB_PORT:-5433}" \
      -database nominatim -user nominatim -password "$NOMINATIM_PASSWORD" \
      -languages "$PHOTON_LANGUAGES"
  )
  printf '%s\n' "$pbf_sha" > "$PHOTON_STAMP"
  docker compose --profile geocoding-import stop nominatim
  note "Photon index built (languages: $PHOTON_LANGUAGES); Nominatim stopped to free RAM"
fi

# ---------- 7. Full stack + database init (runbook step 12 + migrations/seed) ----------
log "Starting the full stack (builds local images on first run)"
docker compose --profile routing --profile geocoding up -d --build
wait_healthy postgres 180
log "Applying database migrations and seed (runtime migrator inside the API image)"
docker compose run --rm api bun src/db/migrate.ts
docker compose run --rm -e ADMIN_SEED_PASSWORD api bun src/db/seed.ts
wait_healthy routing-gateway 180 --profile routing --profile geocoding
wait_healthy api 180

# ---------- 8. Acceptance per selected area (runbook step 13) ----------
log "Verifying tiles, routing, and geocoding for every selected area"
IFS=',' read -r -a selected_area_ids <<< "$REGION_IDS"
for area in "${selected_area_ids[@]}"; do
  ./map-server/scripts/verify-tiles.sh "$area"
  ./map-server/scripts/verify-routing.sh "$area"
  ./map-server/scripts/verify-geocoding.sh "$area"
done

docker compose --profile routing --profile geocoding ps
docker stats --no-stream || true

log "Setup complete"
note "map areas installed: $REGION_IDS (change later with: $0 --reselect)"
if [[ -n "$stale_backup" ]]; then
  note "stale OSRM graphs were kept at $stale_backup — delete that directory to reclaim disk."
fi
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
    - Re-running this script is safe; up-to-date stages are skipped.
EOF
