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
# you get a form (map library, snapshot, source policy, countries, then
# cities per country — multiple of each); non-interactively use --regions,
# --snapshot, --source-policy, and --map-library (or the SETUP_* env forms).
# Map content is stored in a project-independent library, by default
# ~/.local/share/borobiya/map-library, organized by continent/country/
# city or source/snapshot date. The active selection, snapshot, policy, and
# dataset paths are stored in .env so re-runs keep them; use --reselect to
# change areas later (stale stages then rebuild automatically).
#
# Safe to re-run: stages whose output still matches the current dataset
# PBF checksum are skipped. Existing .env secrets and database passwords
# are never rotated.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

REGIONS_PY="map-server/scripts/regions.py"
MAP_LIBRARY_PY="map-server/scripts/map_library.py"
NOMINATIM_TIMEOUT_MIN="${SETUP_NOMINATIM_TIMEOUT_MIN:-90}"
DATASET="borobiya"

ARG_REGIONS=""
ARG_SNAPSHOT=""
ARG_SOURCE_POLICY=""
ARG_MAP_LIBRARY=""
UPDATE_MAP=0
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
  --snapshot <spec> Map snapshot: pinned, latest, or YYYY-MM-DD
                    (or SETUP_SNAPSHOT; default: saved/pinned)
  --source-policy <p>
                    cache-first (default), refresh, or offline
                    (or SETUP_SOURCE_POLICY)
  --refresh-sources Shortcut for --source-policy refresh
  --offline         Shortcut for --source-policy offline
  --update-map      Resolve/download the latest common snapshot online
  --map-library <p> External map library root (or SETUP_MAP_LIBRARY);
                    default: ~/.local/share/borobiya/map-library
  --reselect        Ask for areas/snapshot/policy again even if saved
  --list-regions    Print the area catalog and exit
  --yes             Non-interactive: no prompts (uses CLI/env inputs,
                    the saved configuration, or safe defaults). On a first run the
                    two database passwords are generated into .env instead of
                    asked for; an existing .env is never rotated.
  --dry-run         Resolve the configuration and print the stage plan only;
                    writes nothing and downloads no map data
  -h, --help        This help

Env: SETUP_REGIONS, SETUP_SNAPSHOT, SETUP_SOURCE_POLICY, SETUP_MAP_LIBRARY,
     SETUP_FORCE_FORM=1 (force prompts without a TTY),
     SETUP_NOMINATIM_TIMEOUT_MIN (minutes, 1-720; default 90)
EOF
}

while (( $# > 0 )); do
  # shellcheck disable=SC2088 # Match a literal user-supplied ~/ path, then expand it manually.
  case "$1" in
    --regions) [[ $# -ge 2 ]] || fail "--regions requires a value"; ARG_REGIONS="$2"; shift 2 ;;
    --regions=*) ARG_REGIONS="${1#*=}"; shift ;;
    --snapshot) [[ $# -ge 2 ]] || fail "--snapshot requires a value"; ARG_SNAPSHOT="$2"; shift 2 ;;
    --snapshot=*) ARG_SNAPSHOT="${1#*=}"; shift ;;
    --source-policy) [[ $# -ge 2 ]] || fail "--source-policy requires a value"; ARG_SOURCE_POLICY="$2"; shift 2 ;;
    --source-policy=*) ARG_SOURCE_POLICY="${1#*=}"; shift ;;
    --refresh-sources) ARG_SOURCE_POLICY="refresh"; shift ;;
    --offline) ARG_SOURCE_POLICY="offline"; shift ;;
    --update-map) UPDATE_MAP=1; ARG_SNAPSHOT="latest"; shift ;;
    --map-library) [[ $# -ge 2 ]] || fail "--map-library requires a value"; ARG_MAP_LIBRARY="$2"; shift 2 ;;
    --map-library=*) ARG_MAP_LIBRARY="${1#*=}"; shift ;;
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

[[ "$NOMINATIM_TIMEOUT_MIN" =~ ^[0-9]{1,3}$ ]] || \
  fail "SETUP_NOMINATIM_TIMEOUT_MIN must be an integer from 1 to 720 (minutes), got '$NOMINATIM_TIMEOUT_MIN'"
NOMINATIM_TIMEOUT_MIN=$((10#$NOMINATIM_TIMEOUT_MIN))
(( NOMINATIM_TIMEOUT_MIN >= 1 && NOMINATIM_TIMEOUT_MIN <= 720 )) || \
  fail "SETUP_NOMINATIM_TIMEOUT_MIN must be between 1 and 720 minutes, got '$NOMINATIM_TIMEOUT_MIN'"

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

expand_home_path() {
  # shellcheck disable=SC2088 # Match a literal user-supplied ~/ path, then expand it manually.
  case "$1" in
    "~") printf '%s' "${HOME:-}" ;;
    "~/"*) printf '%s/%s' "${HOME:-}" "${1#~/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

default_map_library_dir() {
  if [[ -n "${XDG_DATA_HOME:-}" ]]; then
    [[ "$XDG_DATA_HOME" == /* ]] || fail "XDG_DATA_HOME must be absolute; set MAP_LIBRARY_DIR explicitly or correct XDG_DATA_HOME"
    printf '%s' "$XDG_DATA_HOME/borobiya/map-library"
  elif [[ -n "${HOME:-}" ]]; then
    [[ "$HOME" == /* ]] || fail "HOME must be absolute to derive the external map library; set MAP_LIBRARY_DIR explicitly"
    printf '%s' "$HOME/.local/share/borobiya/map-library"
  else
    fail "HOME and XDG_DATA_HOME are unset; set MAP_LIBRARY_DIR to an external absolute path"
  fi
}

canonical_library_dir() {
  local path
  path="$(expand_home_path "$1")"
  [[ "$path" != *$'\n'* && "$path" != *[[:space:]]* ]] || \
    fail "map library path must not contain whitespace (it is persisted in .env): $path"
  [[ "$path" =~ ^[[:alnum:]_./@+-]+$ ]] || \
    fail "map library path contains characters unsafe for .env and Compose volume storage; use letters, digits, and / . _ @ + -: $path"
  if [[ "$path" != /* ]]; then
    path="$REPO_ROOT/$path"
  fi
  while [[ "$path" == */ && "$path" != "/" ]]; do
    path="${path%/}"
  done
  printf '%s' "$path"
}

DOCKER_STORAGE_ROOTS=()
load_docker_storage_roots() {
  local docker_root
  if ! docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null)"; then
    fail "could not query Docker's storage root; run 'docker info' and verify the daemon is healthy"
  fi
  [[ "$docker_root" == /* && -d "$docker_root" ]] || \
    fail "Docker reported an invalid storage root: ${docker_root:-<empty>}"
  DOCKER_STORAGE_ROOTS=("$docker_root")
  # Docker's containerd image store may use this separate filesystem; check it
  # too because layer extraction fails there even when DockerRootDir has space.
  if [[ -d /var/lib/containerd ]]; then
    DOCKER_STORAGE_ROOTS+=(/var/lib/containerd)
  fi
}

check_docker_storage_capacity() {
  local required_gib="$1" phase="$2"
  local required_bytes=$((required_gib * 1024 * 1024 * 1024))
  local path device available_bytes available_inodes available_gib
  local -A checked_devices=()
  (( ${#DOCKER_STORAGE_ROOTS[@]} > 0 )) || fail "Docker storage paths were not initialized"

  for path in "${DOCKER_STORAGE_ROOTS[@]}"; do
    device="$(stat -c '%d' -- "$path" 2>/dev/null || true)"
    if [[ -n "$device" ]]; then
      [[ -z "${checked_devices[$device]:-}" ]] || continue
      checked_devices[$device]=1
    fi
    available_bytes="$(df -B1 --output=avail -- "$path" 2>/dev/null | tail -n 1 | tr -d '[:space:]')"
    available_inodes="$(df -Pi -- "$path" 2>/dev/null | awk 'NR == 2 { print $4 }')"
    [[ "$available_bytes" =~ ^[0-9]+$ && "$available_inodes" =~ ^[0-9]+$ ]] || \
      fail "could not read free bytes/inodes for Docker storage at $path"
    available_gib="$(awk -v bytes="$available_bytes" 'BEGIN { printf "%.1f", bytes / 1073741824 }')"
    note "Docker storage $path: ${available_gib} GiB free; ${available_inodes} inodes free"
    if (( available_bytes < required_bytes )); then
      fail "Docker storage at $path has only ${available_gib} GiB free before $phase; at least ${required_gib} GiB is required. Inspect 'docker system df -v' and the runbook's disk-space recovery notes; do not prune Docker volumes blindly."
    fi
    if (( available_inodes < 50000 )); then
      fail "Docker storage at $path has only $available_inodes free inodes before $phase; at least 50000 are required. Check 'df -i $path' and free space/inodes before retrying."
    fi
  done
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
(( ${free_gb:-0} >= 15 )) || note "WARNING: only ${free_gb:-?} GiB free on the repository filesystem; imports may fail (runbook wants 15-20 GiB free)."
if (( !DRY_RUN )); then
  load_docker_storage_roots
  check_docker_storage_capacity 15 "starting the map setup"
fi

# ---------- 1. Environment + secrets (runbook A6) ----------
log "Environment (.env)"
FRESH_ENV_FROM_EXAMPLE=0
EXPLICIT_ADMIN_SEED_PASSWORD="${ADMIN_SEED_PASSWORD:-}"
set_env() {
  local key="$1" value="$2"
  # Never echo a value: database URLs and secrets also pass through this writer.
  if (( DRY_RUN )); then note "would set ${key} in .env (value hidden)"; return 0; fi
  [[ ! -L .env ]] || fail "refusing symlinked .env; inspect it before running setup"
  [[ ! -e .env || -f .env ]] || fail "refusing non-file .env; inspect it before running setup"

  # A value is never interpolated into a sed replacement here. Paths are user input, and a
  # library directory containing `&` would expand to the whole match while one containing the
  # `|` delimiter aborts sed with "unknown option to `s`" — which, under `set -e`, ends the whole
  # setup run with a bare sed error and .env left untouched. awk -v assigns both fields
  # literally; the rewrite goes through a temp file in the same directory (same filesystem, so
  # the rename is atomic) and .env keeps 0600 because the secrets in it are generated below.
  local tmp
  tmp="$(mktemp ".env.borobiya.XXXXXX")" || fail "could not create a temporary file next to .env"
  chmod 600 "$tmp"
  if [[ ! -f .env ]]; then
    # Never expose a generated secret even briefly under the process umask (often 0644).
    if ! printf '%s=%s\n' "$key" "$value" > "$tmp"; then
      rm -f -- "$tmp"
      fail "could not create .env securely"
    fi
    mv -f -- "$tmp" .env
    return 0
  fi
  # One statement per line, and the value through the environment rather than `awk -v`, both
  # deliberately: Ubuntu's default awk is mawk, which refuses a pattern continued onto the next
  # line ("missing ) near end of line") where gawk accepts it, and POSIX `awk -v` processes
  # backslash escapes in the assigned text — `/srv/a\b` would arrive as a backspace. ENVIRON
  # assignments are literal. A rewrite that only works on the developer's laptop is worse than the
  # sed it replaced, because .env has already been created by then.
  if BOROBIYA_ENV_KEY="$key" BOROBIYA_ENV_VALUE="$value" awk '
      BEGIN { key = ENVIRON["BOROBIYA_ENV_KEY"]; value = ENVIRON["BOROBIYA_ENV_VALUE"] }
      BEGIN { prefix = key "="; commented = "# " prefix; done = 0 }
      {
        if (done) { print; next }
        if (substr($0, 1, length(prefix)) == prefix || substr($0, 1, length(commented)) == commented) { print prefix value; done = 1; next }
        print
      }
      END { if (!done) print prefix value }
     ' .env > "$tmp"; then
    mv -f -- "$tmp" .env
  else
    rm -f -- "$tmp"
    fail "could not rewrite ${key} in .env"
  fi
}

env_value() {
  # $1 = key; prints what .env assigns to it, or nothing. Deliberately not `source`: the file is data,
  # sourcing executes it, and an older value exported earlier in this shell (the runbook's loader block
  # exports POSTGRES_PASSWORD and DATABASE_URL) would then win over the file being checked.
  local key="$1"
  BOROBIYA_ENV_KEY="$key" awk '
     BEGIN { key = ENVIRON["BOROBIYA_ENV_KEY"]; prefix = key "=" }
     substr($0, 1, length(prefix)) == prefix { print substr($0, length(prefix) + 1); exit }
   ' .env 2>/dev/null || true
}

db_password_problem() {
  # $1 = value. Prints '' when the value can be used, otherwise the reason, phrased to follow a key
  # name in a message. The character rule is not taste: Compose interpolates POSTGRES_PASSWORD straight
  # into the API's DATABASE_URL and the Nominatim image does the same for its own connection string, so
  # '#' starts a fragment, '/' and '?' end the authority, '%' promises an escape, and brackets stop the
  # parser outright. Postgres then rejects a password that .env plainly contains, which is a far more
  # confusing failure than refusing to accept it here.
  python3 - "$1" <<'PYEOF'
import re
import sys

value = sys.argv[1]
if not value:
    print("is empty")
elif value == "change-me" or value.startswith("replace-"):
    print("is still the placeholder from .env.example")
elif not re.fullmatch(r"[A-Za-z0-9._~-]+", value):
    print("contains characters a connection URL cannot carry (only A-Z a-z 0-9 . _ ~ - are)")
else:
    print("")
PYEOF
}

valid_db_password() {
  # A password this script is asked to accept: the URL-safe set, and long enough to be worth having.
  # db_password_problem is the weaker rule it also satisfies — that one is used on values already in
  # .env, where a short password that works is nobody's emergency.
  python3 - "$1" <<'PYEOF'
import re
import sys

sys.exit(0 if re.fullmatch(r"[A-Za-z0-9._~-]{12,128}", sys.argv[1]) else 1)
PYEOF
}

new_db_password() {
  # 48 hex characters: an alphabet no URL parser can misread, which is why generating is always correct
  # and typing is only sometimes.
  openssl rand -hex 24
}

ask_db_secret() {
  # $1 = prompt label; the accepted value lands in DB_SECRET_ANSWER, left empty on --dry-run. A global
  # rather than command substitution, because the notes this function prints would be captured into the
  # secret.
  DB_SECRET_ANSWER=""
  if (( DRY_RUN )); then
    note "would ask for $1 (Enter generates a strong one)"
    return 0
  fi
  local typed=""
  if (( INTERACTIVE )); then
    while :; do
      # -s: a database password that reaches the terminal echo also reaches scrollback and any
      # screenshot of the run, and unlike the admin password this one never has to be typed again by
      # hand, because it is written into .env.
      printf '    %s [Enter = generate a strong one]: ' "$1"
      IFS= read -r -s -u "$INPUT_FD" typed || typed=""
      printf '\n'
      if [[ -z "$typed" ]]; then
        break
      fi
      if valid_db_password "$typed"; then
        break
      fi
      printf '    Use 12-128 characters of A-Z a-z 0-9 . _ ~ - ; the value goes into a connection URL.\n' >&2
      printf '    Try again, or press Enter to generate one.\n' >&2
    done
  fi
  if [[ -n "$typed" ]]; then
    DB_SECRET_ANSWER="$typed"
  else
    DB_SECRET_ANSWER="$(new_db_password)" || \
      fail "could not run 'openssl rand -hex' to generate a database password"
  fi
}

compose_volume_exists() {
  # exit 0 when this Compose project has a named volume whose key is $1 (e.g. postgres-data). The label
  # filters, rather than a global `docker volume ls` plus a grep, keep this about *this* checkout:
  # another project's volume must not be able to talk this run out of setting a password it is safe to
  # set here.
  local project="" out=""
  if ! project="$(docker compose config --format json 2>/dev/null | \
      python3 -c 'import json,sys; print(json.load(sys.stdin).get("name", ""))')"; then
    fail "could not read the Compose project name ('docker compose config' says why); refusing to decide about the database password from a global volume search."
  fi
  [[ -n "$project" ]] || \
    fail "Compose reported no project name; refusing to decide about the database password from a global volume search."
  if ! out="$(docker volume ls -q \
      --filter "label=com.docker.compose.project=$project" \
      --filter "label=com.docker.compose.volume=$1" 2>/dev/null)"; then
    fail "could not list this project's volumes ('docker volume ls' says why); refusing to rotate POSTGRES_PASSWORD without knowing whether the database already exists."
  fi
  [[ -n "$out" ]]
}

alter_sql_for() {
  # $1 = role, $2 = password -> one ALTER statement on stdout. Quoting happens here, by doubling the
  # only characters that need it, so a password containing a quote cannot close the literal early and
  # turn the rest of itself into SQL.
  python3 - "$1" "$2" <<'PYEOF'
import sys

role, password = sys.argv[1], sys.argv[2]
quote = chr(34)
ident = quote + role.replace(quote, quote + quote) + quote
literal = chr(39) + password.replace(chr(39), chr(39) + chr(39)) + chr(39)
print("ALTER USER " + ident + " WITH PASSWORD " + literal + ";")
PYEOF
}

psql_in_postgres() {
  # $1 = connection string, rest = psql arguments, run inside the postgres container. Two details are
  # load-bearing. The string arrives over stdin rather than as an argument, because the argv of a
  # docker command is readable by every other process on the host while it runs and this carries the
  # database password. And the host must not be 127.0.0.1: the image trusts the local socket and
  # loopback TCP, requiring a password only on other addresses, so a loopback probe answers 1 to a
  # wrong password and reports a healthy database on a machine where nothing can log in. Use the
  # service's own Compose alias, which is the line the apps will match.
  local conninfo="$1"; shift
  printf '%s\n' "$conninfo" | \
    docker compose exec -T postgres sh -c 'IFS= read -r url; exec psql "$url" "$@"' sh "$@" 2>&1
}

apply_alter_sql() {
  # Change a role's password from inside the container, where the local socket needs no password.
  # The role to connect as is POSTGRES_USER, not `postgres`: with POSTGRES_USER set, initdb names the
  # superuser that and there is no `postgres` role at all — which is why the manual form of this
  # command dies with `role "postgres" does not exist` on a machine like this one. Both names are
  # tried, so a server configured the other way is not left without a path.
  local sql
  sql="$(cat)"
  if printf '%s\n' "$sql" | docker compose exec -T postgres psql -U "$1" -d postgres -q -v ON_ERROR_STOP=1 -f - >/dev/null 2>&1; then
    return 0
  fi
  printf '%s\n' "$sql" | docker compose exec -T postgres psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f -
}

set_database_passwords() {
  # $1 = "ask" on a .env this run just created, "keep" on one that already existed.
  local mode="$1" user db port postgres nominatim problem nproblem
  user="$(env_value POSTGRES_USER)"; [[ -n "$user" ]] || user="borobiya"
  db="$(env_value POSTGRES_DB)"; [[ -n "$db" ]] || db="borobiya"
  port="$(env_value POSTGRES_PORT)"; [[ -n "$port" ]] || port="5432"

  if [[ "$mode" == "keep" ]]; then
    # An existing .env is only rewritten when what it holds cannot work at all. Otherwise the volumes
    # were initialized with these values, and rotating one here is the single change that turns a
    # working machine into "password authentication failed" with a .env that still looks reasonable.
    postgres="$(env_value POSTGRES_PASSWORD)"; problem="$(db_password_problem "$postgres")"
    nominatim="$(env_value NOMINATIM_PASSWORD)"; nproblem="$(db_password_problem "$nominatim")"
    if [[ -z "$problem" && -z "$nproblem" ]]; then
      note "reusing the database passwords in .env (the volumes hold these; they are never rotated)"
      return 0
    fi
    if [[ -n "$problem" ]]; then
      note "POSTGRES_PASSWORD ${problem}"
    fi
    if [[ -n "$nproblem" ]]; then
      note "NOMINATIM_PASSWORD ${nproblem}"
    fi
    if (( DRY_RUN )) || ! command -v docker >/dev/null 2>&1; then
      note "would ask for the unusable value(s) above; deciding that needs a Docker daemon, because a volume that already holds a database must not be re-passworded by surprise"
      return 0
    fi
    if compose_volume_exists postgres-data; then
      fail "POSTGRES_PASSWORD cannot be used, and postgres-data already holds this project's database, so this script will not write a new password over it. Put the volume's own password back in .env, or change the role instead of the file (runbook § 9.3 has both)."
    fi
    if [[ -n "$nproblem" ]] && compose_volume_exists nominatim-data; then
      fail "NOMINATIM_PASSWORD cannot be used, and the nominatim volume is already initialized; runbook § 9.2 has the Nominatim password and volume recovery. Neither rebuilds map tiles."
    fi
    note "no database volume is initialized yet, so this is the moment to choose the passwords"
  fi

  ask_db_secret "Nominatim database password (NOMINATIM_PASSWORD)"
  nominatim="$DB_SECRET_ANSWER"
  ask_db_secret "Postgres app password (POSTGRES_PASSWORD, and the app URL below)"
  postgres="$DB_SECRET_ANSWER"
  unset DB_SECRET_ANSWER
  if [[ -z "$postgres" ]]; then
    note "would set NOMINATIM_PASSWORD, POSTGRES_PASSWORD and a matching DATABASE_URL in .env"
    return 0
  fi
  set_env NOMINATIM_PASSWORD "$nominatim"
  set_env POSTGRES_PASSWORD "$postgres"
  # Both spellings of the one credential, from one variable: host-side tools read DATABASE_URL, the
  # containers get a URL built from POSTGRES_PASSWORD by Compose, and the two disagreeing is the failure
  # this block exists to prevent. No encoding is applied because the alphabet needs none.
  set_env DATABASE_URL "postgresql://${user}:${postgres}@localhost:${port}/${db}"
  note "database passwords are in .env (mode 600) and were never printed; DATABASE_URL carries the same one"
}

check_database_credentials() {
  # Prove the credential before the hours of map work, and name which side is wrong. Three values can
  # differ — the password in .env, the one the container was created with, and the one the role in
  # postgres-data has kept since its first init — and only two of them can be settled by editing a
  # file. A `postgres: healthy` line is evidence about none of them unless whatever produced it
  # connected from off loopback, because the image trusts local addresses: the healthcheck and this
  # script's first version both said 127.0.0.1, and a real VM then answered healthy and 28P01 in the
  # same log with the password genuinely wrong.
  (( DRY_RUN )) && return 0
  local user db port postgres problem cid answer out container_password
  user="$(env_value POSTGRES_USER)"; [[ -n "$user" ]] || user="borobiya"
  db="$(env_value POSTGRES_DB)"; [[ -n "$db" ]] || db="borobiya"
  port="$(env_value POSTGRES_PORT)"; [[ -n "$port" ]] || port="5432"
  postgres="$(env_value POSTGRES_PASSWORD)"
  problem="$(db_password_problem "$postgres")"
  if [[ -n "$problem" ]]; then
    fail "POSTGRES_PASSWORD ${problem}; runbook § 9.3 explains why the URL forms make that fatal."
  fi

  cid="$(docker compose ps -q postgres 2>/dev/null || true)"
  if [[ -z "$cid" ]]; then
    if ! compose_volume_exists postgres-data; then
      note "no postgres-data volume yet: the database will be created with the password now in .env"
      return 0
    fi
    note "starting postgres so the credentials can be checked before anything long begins"
    docker compose up -d postgres >/dev/null 2>&1 || \
      fail "could not start postgres for the credential check; fix that first (runbook § 7.1), then re-run this script."
    local tries=0
    until cid="$(docker compose ps -q postgres 2>/dev/null || true)"; [[ -n "$cid" ]]; do
      (( ++tries > 30 )) && fail "postgres did not report a container within 30s of starting; runbook § 7.1 has the log commands."
      sleep 1
    done
  fi

  # Best case, ask the driver the application uses, inside the application's container, with the
  # application's own DATABASE_URL: that one question covers the password, the URL Compose interpolated
  # into it, and the pg_hba line that will really be matched. It needs a container to exec into, so a
  # first run falls through to the psql form below.
  local api_cid out
  api_cid="$(docker compose ps -q api 2>/dev/null || true)"
  if [[ -n "$api_cid" ]]; then
    out="$(docker compose exec -T api bun -e '
      import postgres from "postgres";
      const sql = postgres(process.env.DATABASE_URL, { max: 1 });
      const rows = await sql.query("select 1 as ok");
      console.log(rows[0].ok);
      await sql.end();
    ' 2>&1 || true)"
    if [[ "${out//[[:space:]]/}" == "1" ]]; then
      note "verified: the DATABASE_URL the API container holds authenticates"
      return 0
    fi
    if ! grep -qiE 'password authentication failed|28P01|no password' <<< "$out"; then
      # Exec into a container that is still starting answers with something else entirely, and that is
      # not an answer about the credential. Refusing to conclude from it is the point.
      note "the API container could not answer the probe (${out:0:120}); asking the database directly instead"
      api_cid=""
    fi
  fi
  if [[ -z "$api_cid" ]]; then
    out="$(psql_in_postgres "postgresql://${user}:${postgres}@postgres:${port}/${db}" -tAc 'SELECT 1' || true)"
    if [[ "${out//[[:space:]]/}" == "1" ]]; then
      note "verified: the password in .env authenticates over the network the apps use"
      return 0
    fi
  fi

  container_password="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cid" 2>/dev/null | \
    sed -n 's/^POSTGRES_PASSWORD=//p' | head -1)"
  if [[ -n "$container_password" && "$container_password" != "$postgres" ]]; then
    fail "the running postgres container was created with a different POSTGRES_PASSWORD than .env holds now, and that is the password the volume was initialized with. Reload .env and recreate that one service — the data stays: docker compose up -d --force-recreate postgres (runbook § 9.3)."
  fi

  # .env and the container agree, and the role rejects both: the volume outlived the password it was
  # created with. Only one of the two can be made the other, so offer the direction that loses nothing:
  # .env stays as it is and the role is told what .env says.
  log "The database rejects the password in .env"
  note "postgres-data was initialized with a different password. Either put that password back in .env,"
  note "or set the role's password to what .env says now — one credential changes, no data does — and"
  note "this script can do the second for you."
  if ! (( INTERACTIVE )); then
    fail "refusing to change a database password without asking. Restore the previous POSTGRES_PASSWORD in .env, or run this script interactively and accept the offer. The manual form is at the end of runbook § 9.3."
  fi
  printf '    Set the role password for "%s" to the one in .env now? [y/N]: ' "$user"
  IFS= read -r -u "$INPUT_FD" answer || answer=""
  case "$answer" in
    [yY] | [yY][eE][sS]) ;;
    *) fail "nothing changed. Restore the previous POSTGRES_PASSWORD in .env, or re-run and accept, before the migration step can pass." ;;
  esac
  # The statement is generated and piped, never passed as an argument, so the new password is not
  # sitting in ps output for the length of the command.
  if ! alter_sql_for "$user" "$postgres" | apply_alter_sql "$user"; then
    fail "could not run ALTER USER as a superuser over the container local socket. Do it from a shell inside the container instead (runbook § 9.3 has the statement)."
  fi
  out="$(psql_in_postgres "postgresql://${user}:${postgres}@postgres:${port}/${db}" -tAc 'SELECT 1' || true)"
  if [[ "${out//[[:space:]]/}" == "1" ]]; then
    note "verified: .env's password now authenticates"
  else
    fail "ALTER USER ran but the login still fails, so something else is choosing the credential; runbook § 9.3 lists the three places it can come from."
  fi
  if [[ -n "$(docker compose ps -q api 2>/dev/null || true)" ]]; then
    note "the API holds a pool of connections made with the old password: docker compose restart api"
  fi
}

# Check before reading/sourcing, even on a dry run or a dangling symlink.
[[ ! -L .env ]] || fail "refusing symlinked .env; inspect it before running setup"
[[ ! -e .env || -f .env ]] || fail "refusing non-file .env; inspect it before running setup"
if [[ ! -f .env ]]; then
  FRESH_ENV_FROM_EXAMPLE=1
  if (( DRY_RUN )); then
    note "would create .env from .env.example with generated secrets"
    set -a; # shellcheck disable=SC1091
    source .env.example; set +a
  else
    # 0600 from the first write: .env is about to receive generated database, JWT and
    # Nominatim passwords, and `cp` would otherwise hand them the process umask (0644 by default).
    install -m 600 .env.example .env
    note "created .env from .env.example (mode 600)"
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
    sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
    # The two database passwords used to be generated here in silence, which left anyone who wanted
    # their own to edit .env by hand afterwards — and a hand-edited value carrying a '#' or an '@' comes
    # back later, far away, as an authentication error. They are asked for now, the way the admin
    # password is, with the same Enter-to-generate.
    set_database_passwords ask
    note "JWT secrets generated (never change the database passwords after first start)"
    set -a; # shellcheck disable=SC1091
    source .env; set +a
  fi
else
  note "reusing existing .env (values are never rotated by this script)"
  # Outside the DRY_RUN guard on purpose: this is the one place that can tell the user their .env holds
  # a password that cannot work, and a preview that stays silent about it is a preview of a run that
  # stops at the first question. The function itself writes nothing when --dry-run is set.
  set_database_passwords keep
  if (( ! DRY_RUN )); then
    if grep -q '^JWT_SECRET=.*replace-this' .env || grep -q '^JWT_REFRESH_SECRET=.*replace-this' .env; then
      sed -i "s|^JWT_SECRET=.*replace-this.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
      sed -i "s|^JWT_REFRESH_SECRET=.*replace-this.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
      note "replaced placeholder JWT secrets with generated ones"
    fi
  fi
  set -a; # shellcheck disable=SC1091
  source .env; set +a
fi

# Read from the file and not from the shell variables sourced above: the loader block in the runbook
# exports the same names, and a stale export would let this check pass on a machine the containers
# cannot log into.
nominatim_problem="$(db_password_problem "$(env_value NOMINATIM_PASSWORD)")"
if [[ -n "$nominatim_problem" ]]; then
  if (( DRY_RUN )); then
    note "WARNING: NOMINATIM_PASSWORD ${nominatim_problem} (a real run stops before the plan)"
  else
    fail "NOMINATIM_PASSWORD ${nominatim_problem} — that image builds its own connection string from it, so set a usable value before the import (runbook A6)."
  fi
fi
check_database_credentials

if [[ -f .env ]] && grep -q '^ADMIN_SEED_PASSWORD=' .env && [[ -n "${ADMIN_SEED_PASSWORD:-}" ]]; then
  ADMIN_SEED_PASSWORD_B64="$(python3 -c 'import base64,sys; print(base64.b64encode(sys.argv[1].encode("utf-8")).decode("ascii"))' "$ADMIN_SEED_PASSWORD")"
  if (( DRY_RUN )); then
    note "would migrate the legacy ADMIN_SEED_PASSWORD .env entry to ADMIN_SEED_PASSWORD_B64"
  else
    set_env ADMIN_SEED_PASSWORD_B64 "$ADMIN_SEED_PASSWORD_B64"
    sed -i '/^ADMIN_SEED_PASSWORD=/d' .env
    note "migrated the legacy ADMIN_SEED_PASSWORD .env entry to ADMIN_SEED_PASSWORD_B64"
  fi
fi

if [[ -n "$EXPLICIT_ADMIN_SEED_PASSWORD" ]]; then
  ADMIN_SEED_PASSWORD="$EXPLICIT_ADMIN_SEED_PASSWORD"
  export ADMIN_SEED_PASSWORD
fi
unset EXPLICIT_ADMIN_SEED_PASSWORD

# The setup-managed password is base64 in .env so Bash and Compose parse it
# literally, including Unicode and punctuation. Preserve an explicitly exported
# ADMIN_SEED_PASSWORD over the saved value.
if [[ -z "${ADMIN_SEED_PASSWORD:-}" && -n "${ADMIN_SEED_PASSWORD_B64:-}" ]]; then
  if ! ADMIN_SEED_PASSWORD="$(python3 - "$ADMIN_SEED_PASSWORD_B64" <<'PYEOF'
import base64, sys
try:
    value = base64.b64decode(sys.argv[1], validate=True).decode("utf-8")
    if any(ord(character) in (0, 10, 13) for character in value):
        raise ValueError("control character")
except (ValueError, UnicodeDecodeError):
    raise SystemExit(1)
sys.stdout.write(value)
PYEOF
  )"; then
    fail "ADMIN_SEED_PASSWORD_B64 in .env is not valid base64-encoded UTF-8"
  fi
  export ADMIN_SEED_PASSWORD
fi

valid_admin_password() {
  python3 - "$1" <<'PYEOF'
import sys, unicodedata
password = sys.argv[1]
try:
    length = len(password.encode("utf-16-le")) // 2
except UnicodeEncodeError:
    raise SystemExit(1)
has_letter = any(unicodedata.category(character).startswith("L") for character in password)
has_decimal = any(unicodedata.category(character) == "Nd" for character in password)
sys.exit(0 if 8 <= length <= 1024 and has_letter and has_decimal else 1)
PYEOF
}

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
      if valid_admin_password "$chosen_admin_password"; then
        break
      fi
      printf '    Password must be 8–1024 characters and contain a Unicode letter and decimal digit; try again (or Enter to generate).\n' >&2
    done
  fi
  if [[ -n "$chosen_admin_password" ]]; then
    ADMIN_SEED_PASSWORD="$chosen_admin_password"
    unset chosen_admin_password
    ADMIN_SEED_PASSWORD_B64="$(python3 -c 'import base64,sys; print(base64.b64encode(sys.argv[1].encode("utf-8")).decode("ascii"))' "$ADMIN_SEED_PASSWORD")"
    set_env ADMIN_SEED_PASSWORD_B64 "$ADMIN_SEED_PASSWORD_B64"
    export ADMIN_SEED_PASSWORD
    note "stored your admin password as base64 in ADMIN_SEED_PASSWORD_B64 in .env (used at seed time below)"
  elif (( DRY_RUN )); then
    note "would generate ADMIN_SEED_PASSWORD_B64 into .env (used at seed time)"
  else
    ADMIN_SEED_PASSWORD="Admin-$(openssl rand -hex 12)"
    ADMIN_SEED_PASSWORD_B64="$(python3 -c 'import base64,sys; print(base64.b64encode(sys.argv[1].encode("utf-8")).decode("ascii"))' "$ADMIN_SEED_PASSWORD")"
    set_env ADMIN_SEED_PASSWORD_B64 "$ADMIN_SEED_PASSWORD_B64"
    export ADMIN_SEED_PASSWORD
    note "generated admin password saved in .env as base64 (not encryption); use scripts/vm.py admin-password to set a known password privately"
  fi
fi

if [[ -n "${ADMIN_SEED_PASSWORD:-}" ]] && ! valid_admin_password "$ADMIN_SEED_PASSWORD"; then
  fail "ADMIN_SEED_PASSWORD must be 8–1024 characters and contain a Unicode letter and decimal digit"
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
  # $1 = csv; evals REGION_IDS/UNION_BBOX/snapshot/library paths or fails.
  local output
  if ! output="$(python3 "$REGIONS_PY" resolve "$1" \
      --snapshot "$SNAPSHOT_INPUT" --source-policy "$SOURCE_POLICY_INPUT" \
      --library "$MAP_LIBRARY_DIR" --dataset "$DATASET")"; then
    fail "invalid map selection/snapshot (see above; list areas with: $0 --list-regions)"
  fi
  eval "$output"
}

print_selection_summary() {
  note "areas:            $REGION_IDS"
  note "snapshot:         $SNAPSHOT_DATE ($SNAPSHOT_MODE; source: $SNAPSHOT_SOURCE)"
  note "source policy:    $SOURCE_POLICY"
  note "map library:      $MAP_LIBRARY_DIR"
  note "dataset:          $MAP_DATASET_DIR"
  note "union bbox:       $UNION_BBOX (written to MAP_BBOX)"
  if [[ "$APPROX_DOWNLOAD_SIZE_UNKNOWN" == "1" ]]; then
    if (( APPROX_DOWNLOAD_MB > 0 )); then
      note "source downloads: $SOURCE_IDS (~${APPROX_DOWNLOAD_MB} MB known; other source sizes unknown, cached after first run)"
    else
      note "source downloads: $SOURCE_IDS (size unknown, cached after first run)"
    fi
  else
    note "source downloads: $SOURCE_IDS (~${APPROX_DOWNLOAD_MB} MB total, cached after first run)"
  fi
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
  local pinned_snapshot
  pinned_snapshot="$(python3 "$REGIONS_PY" pinned-snapshot)"

  printf '\n  Map library (project-independent storage for all map content)\n'
  while :; do
    read_form_line "  Library path [Enter = $MAP_LIBRARY_DIR, q = quit]: "
    case "${FORM_REPLY,,}" in q|quit) fail "aborted by user" ;; esac
    if [[ -z "$FORM_REPLY" ]]; then
      FORM_LIBRARY_DIR="$MAP_LIBRARY_DIR"
      break
    fi
    FORM_LIBRARY_DIR="$(canonical_library_dir "$FORM_REPLY")" && break
  done

  printf '\n  Which Geofabrik snapshot should be installed?\n'
  printf '    1) Repository-pinned snapshot (%s) [default]\n' "$pinned_snapshot"
  printf '    2) Latest available common snapshot (online check)\n'
  printf '    3) Specific date (YYYY-MM-DD)\n'
  FORM_SNAPSHOT="pinned"
  while :; do
    read_form_line "  Snapshot [1]: "
    case "${FORM_REPLY,,}" in
      q|quit) fail "aborted by user" ;;
      ""|1|pinned) FORM_SNAPSHOT="pinned"; break ;;
      2|latest) FORM_SNAPSHOT="latest"; break ;;
      3|date|specific)
        while :; do
          read_form_line "  Snapshot date (YYYY-MM-DD): "
          case "${FORM_REPLY,,}" in q|quit) fail "aborted by user" ;; esac
          if [[ "$FORM_REPLY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] && \
             python3 -c 'import datetime,sys; datetime.date.fromisoformat(sys.argv[1])' "$FORM_REPLY" >/dev/null 2>&1; then
            FORM_SNAPSHOT="$FORM_REPLY"
            break
          fi
          printf '    Please enter a valid YYYY-MM-DD date.\n' >&2
        done
        break
        ;;
      *) printf '    Please choose 1, 2, or 3.\n' >&2 ;;
    esac
  done

  printf '\n  When a selected source already exists in the library:\n'
  printf '    1) Cache-first: reuse it after checksum verification [default]\n'
  printf '    2) Refresh: download it again and atomically replace it\n'
  if [[ "$FORM_SNAPSHOT" != "latest" ]]; then
    printf '    3) Offline: never download; fail if the library copy is missing\n'
  fi
  FORM_SOURCE_POLICY="cache-first"
  while :; do
    read_form_line "  Source policy [1]: "
    case "${FORM_REPLY,,}" in
      q|quit) fail "aborted by user" ;;
      ""|1|cache-first|cache) FORM_SOURCE_POLICY="cache-first"; break ;;
      2|refresh|download) FORM_SOURCE_POLICY="refresh"; break ;;
      3|offline)
        if [[ "$FORM_SNAPSHOT" == "latest" ]]; then
          printf '    Offline cannot resolve the latest snapshot; choose 1 or 2.\n' >&2
        else
          FORM_SOURCE_POLICY="offline"; break
        fi
        ;;
      *) printf '    Please choose a listed source policy.\n' >&2 ;;
    esac
  done

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

# Resolve the map library and recover an already-installed selection/snapshot
# when .env has none yet (for example on the first run after upgrading).
# Migration may inspect only the historical project-local directory; never
# treat a user-configured external MAP_OSRM_DATA_DIR as disposable legacy data.
LEGACY_OSRM_DATA_DIR="$REPO_ROOT/map-server/osrm/data"
MAP_LIBRARY_DIR="$(canonical_library_dir "${ARG_MAP_LIBRARY:-${SETUP_MAP_LIBRARY:-${MAP_LIBRARY_DIR:-$(default_map_library_dir)}}}")"

library_current_selection=""
library_current_snapshot=""
if [[ -s "$MAP_LIBRARY_DIR/current.json" ]]; then
  if ! library_current_output="$(python3 "$MAP_LIBRARY_PY" current --library "$MAP_LIBRARY_DIR")"; then
    fail "invalid active map library pointer: $MAP_LIBRARY_DIR/current.json (see above)"
  fi
  eval "$library_current_output"
  library_current_selection="$ACTIVE_REGION_IDS"
  library_current_snapshot="$ACTIVE_SNAPSHOT_DATE"
fi

read_manifest_summary() {
  # $1 = manifest path. Sets MANIFEST_REGION_IDS / MANIFEST_SNAPSHOT_DATE.
  local summary
  summary="$(python3 "$REGIONS_PY" manifest-summary --manifest "$1" 2>/dev/null)" || return 1
  eval "$summary"
}

existing_selection=""
existing_source=""
existing_snapshot=""
if [[ -n "$library_current_selection" ]]; then
  existing_selection="$library_current_selection"
  existing_source="active map library dataset"
  existing_snapshot="$library_current_snapshot"
elif [[ -n "${MAP_DATASET_DIR:-}" && -s "${MAP_DATASET_DIR}/${DATASET}.source.json" ]] && read_manifest_summary "${MAP_DATASET_DIR}/${DATASET}.source.json"; then
  existing_selection="$MANIFEST_REGION_IDS"
  existing_source="saved dataset manifest"
  existing_snapshot="$MANIFEST_SNAPSHOT_DATE"
elif [[ -s "map-server/data/${DATASET}.source.json" ]] && read_manifest_summary "map-server/data/${DATASET}.source.json"; then
  existing_selection="$MANIFEST_REGION_IDS"
  existing_source="existing project-local dataset manifest"
  existing_snapshot="$MANIFEST_SNAPSHOT_DATE"
elif [[ -s map-server/data/tehran.osm.pbf && -s map-server/data/tehran.source.json ]] && read_manifest_summary map-server/data/tehran.source.json; then
  existing_selection="$MANIFEST_REGION_IDS"
  existing_source="existing Tehran install (artifacts will migrate)"
  existing_snapshot="$MANIFEST_SNAPSHOT_DATE"
fi

if [[ -n "$ARG_SNAPSHOT" ]]; then
  SNAPSHOT_INPUT="$ARG_SNAPSHOT"; SNAPSHOT_SOURCE="--snapshot"
elif (( UPDATE_MAP )); then
  SNAPSHOT_INPUT="latest"; SNAPSHOT_SOURCE="--update-map"
elif [[ -n "${SETUP_SNAPSHOT:-}" ]]; then
  SNAPSHOT_INPUT="$SETUP_SNAPSHOT"; SNAPSHOT_SOURCE="SETUP_SNAPSHOT"
elif (( ! FRESH_ENV_FROM_EXAMPLE )) && [[ -n "${MAP_SNAPSHOT:-}" && "${MAP_SNAPSHOT,,}" != "latest" ]]; then
  SNAPSHOT_INPUT="$MAP_SNAPSHOT"; SNAPSHOT_SOURCE="saved .env snapshot"
elif (( ! FRESH_ENV_FROM_EXAMPLE )) && [[ -n "${MAP_SNAPSHOT_DATE:-}" ]]; then
  SNAPSHOT_INPUT="$MAP_SNAPSHOT_DATE"; SNAPSHOT_SOURCE="saved .env snapshot"
elif [[ -n "$existing_snapshot" ]]; then
  SNAPSHOT_INPUT="$existing_snapshot"; SNAPSHOT_SOURCE="$existing_source"
elif [[ -n "${MAP_SNAPSHOT:-}" ]]; then
  SNAPSHOT_INPUT="$MAP_SNAPSHOT"; SNAPSHOT_SOURCE="saved .env snapshot"
else
  SNAPSHOT_INPUT="pinned"; SNAPSHOT_SOURCE="repository pin"
fi

if [[ -n "$ARG_SOURCE_POLICY" ]]; then
  SOURCE_POLICY_INPUT="$ARG_SOURCE_POLICY"
elif [[ -n "${SETUP_SOURCE_POLICY:-}" ]]; then
  SOURCE_POLICY_INPUT="$SETUP_SOURCE_POLICY"
elif [[ -n "${MAP_SOURCE_POLICY:-}" ]]; then
  SOURCE_POLICY_INPUT="$MAP_SOURCE_POLICY"
else
  SOURCE_POLICY_INPUT="cache-first"
fi
case "$SOURCE_POLICY_INPUT" in
  cache-first|refresh|offline) ;;
  *) fail "source policy must be cache-first, refresh, or offline (got $SOURCE_POLICY_INPUT)" ;;
esac

SELECTION_SOURCE=""
SELECTION_INPUT=""
if [[ -n "$ARG_REGIONS" ]]; then
  SELECTION_INPUT="$ARG_REGIONS"; SELECTION_SOURCE="--regions"
elif [[ -n "${SETUP_REGIONS:-}" ]]; then
  SELECTION_INPUT="$SETUP_REGIONS"; SELECTION_SOURCE="SETUP_REGIONS"
elif (( ! RESELECT && ! FRESH_ENV_FROM_EXAMPLE )) && [[ -n "${MAP_REGION_IDS:-}" ]]; then
  SELECTION_INPUT="$MAP_REGION_IDS"; SELECTION_SOURCE="saved .env selection"
elif (( ! RESELECT )) && [[ -n "$existing_selection" ]]; then
  SELECTION_INPUT="$existing_selection"; SELECTION_SOURCE="$existing_source"
elif (( INTERACTIVE )); then
  SELECTION_SOURCE="selection form"
elif [[ -n "${MAP_REGION_IDS:-}" ]]; then
  SELECTION_INPUT="$MAP_REGION_IDS"; SELECTION_SOURCE=".env.example default (non-interactive first run)"
else
  SELECTION_INPUT="ir-tehran"; SELECTION_SOURCE="default (non-interactive run without a saved selection)"
fi

while :; do
  if [[ "$SELECTION_SOURCE" == "selection form" ]]; then
    run_selection_form
    SELECTION_INPUT="$FORM_SELECTION"
    MAP_LIBRARY_DIR="$FORM_LIBRARY_DIR"
    SNAPSHOT_INPUT="$FORM_SNAPSHOT"
    SOURCE_POLICY_INPUT="$FORM_SOURCE_POLICY"
    SNAPSHOT_SOURCE="selection form"
  fi
  resolve_selection "$SELECTION_INPUT"
  MAP_SNAPSHOT_DATE="$SNAPSHOT_DATE"
  MAP_SOURCE_POLICY="$SOURCE_POLICY"
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
if [[ "$SNAPSHOT_MODE" == "pinned" ]]; then
  PERSISTED_SNAPSHOT="pinned"
else
  # A resolved latest/specific snapshot is saved as its concrete date so a
  # later cache-first rerun does not silently move to a newer release.
  PERSISTED_SNAPSHOT="$SNAPSHOT_DATE"
fi
MAP_PBF_PATH="$MAP_PBF"
OSRM_DATA_DIR="$MAP_OSRM_DATA_DIR"
set_env MAP_LIBRARY_DIR "$MAP_LIBRARY_DIR"
set_env MAP_SNAPSHOT "$PERSISTED_SNAPSHOT"
set_env MAP_SNAPSHOT_DATE "$SNAPSHOT_DATE"
set_env MAP_SOURCE_POLICY "$SOURCE_POLICY"
set_env MAP_REGION_IDS "$REGION_IDS"
set_env MAP_REGION "$DATASET"
set_env MAP_BBOX "$UNION_BBOX"
set_env MAP_DATA_VERSION "$SNAPSHOT_DATE"
set_env MAP_DATASET_DIR "$MAP_DATASET_DIR"
set_env MAP_DATA_DIR "$MAP_DATA_DIR"
set_env MAP_OSRM_DATA_DIR "$MAP_OSRM_DATA_DIR"
set_env MAP_PHOTON_DATA_DIR "$MAP_PHOTON_DATA_DIR"
set_env MAP_PBF "$MAP_PBF"
set_env PHOTON_DEFAULT_LANGUAGE "$PHOTON_DEFAULT_LANGUAGE"
export MAP_LIBRARY_DIR MAP_SNAPSHOT="$PERSISTED_SNAPSHOT" MAP_SNAPSHOT_DATE
export MAP_SOURCE_POLICY MAP_REGION_IDS="$REGION_IDS" MAP_REGION="$DATASET"
export MAP_BBOX="$UNION_BBOX" MAP_DATA_VERSION="$SNAPSHOT_DATE"
export MAP_DATASET_DIR MAP_DATA_DIR MAP_OSRM_DATA_DIR MAP_PHOTON_DATA_DIR
export MAP_PBF MAP_PBF_MANIFEST PHOTON_DEFAULT_LANGUAGE

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
  log "Dry-run plan (nothing was written or started; no map data was downloaded)"
  if [[ "$SOURCE_POLICY" != "refresh" && -s "$MAP_PBF_PATH" ]] && ./map-server/scripts/verify-map-pbf.sh "$MAP_PBF_PATH" >/dev/null 2>&1; then
    note "dataset PBF:   present and verified for this selection -> prepare stage would SKIP"
    plan_sha="$(file_sha256 "$MAP_PBF_PATH")"
  else
    note "dataset PBF:   missing/stale -> prepare stage would RUN (downloads/crops/merge)"
    plan_sha=""
  fi
  if ! dry_source_rows="$(python3 "$REGIONS_PY" sources "$REGION_IDS" \
      --snapshot "$SNAPSHOT_DATE" --source-policy "$SOURCE_POLICY" \
      --library "$MAP_LIBRARY_DIR")"; then
    fail "could not resolve source rows for the dry-run plan (see above)"
  fi
  while IFS=$'\t' read -r _sid _surl sfile _smd5 _sbytes _sapprox _continent _country _relative spath _sdate; do
    if [[ -s "$spath" ]]; then
      if [[ "$SOURCE_POLICY" == "refresh" ]]; then
        note "  source $sfile: cached (refresh would download it again)"
      else
        note "  source $sfile: cached"
      fi
    elif [[ -s "map-server/data/source/$sfile" || ( "$_sid" == "iran" && -s map-server/data/source/iran-latest.osm.pbf ) ]]; then
      note "  source $sfile: would import the verified project-local legacy copy"
    elif [[ "$SOURCE_POLICY" == "offline" ]]; then
      note "  source $sfile: MISSING (offline run would fail)"
    else
      note "  source $sfile: would download"
    fi
  done <<< "$dry_source_rows"
  if [[ -s map-server/data/tehran.source.json || -s "map-server/data/${DATASET}.source.json" ]]; then
    note "legacy project-local map artifacts: present -> migration into the map library would be attempted"
  fi
  if [[ -n "$plan_sha" && "$(metadata_value "$MAP_DATASET_DIR/${DATASET}.metadata.json" sourcePbfSha256)" == "$plan_sha" ]]; then
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
  note "then: full stack start, DB migrations + seed, per-area acceptance, current-pointer update, and old-release pruning"
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

# ---------- project-local -> standardized map-library migration ----------
# Older checkouts stored map artifacts under map-server/data, map-server/
# osrm/data, and map-server/photon/data. Move a verified pinned dataset into
# the external library once; unsafe/partial legacy sets are left untouched
# and the normal rebuild stages below create a fresh library dataset.
legacy_tehran_migrated=0
project_library_migrated=0
mkdir -p "$MAP_LIBRARY_DIR" "$MAP_DATASET_DIR" "$MAP_PHOTON_DATA_DIR"
if [[ -s map-server/data/tehran.source.json || -s "map-server/data/${DATASET}.source.json" ]]; then
  log "Checking project-local map artifacts for library migration"
  migration_output="$(python3 "$MAP_LIBRARY_PY" migrate-project \
    --repo-root "$REPO_ROOT" \
    --library "$MAP_LIBRARY_DIR" \
    --selection "$REGION_IDS" \
    --snapshot-date "$SNAPSHOT_DATE" \
    --dataset-dir "$MAP_DATASET_DIR" \
    --legacy-osrm-dir "$LEGACY_OSRM_DATA_DIR")"
  eval "$migration_output"
  legacy_tehran_migrated="$PROJECT_LIBRARY_TEHRAN_MIGRATED"
  project_library_migrated="$PROJECT_LIBRARY_MIGRATED"
  if (( project_library_migrated )); then
    note "verified project-local map artifacts migrated into $MAP_LIBRARY_DIR"
  elif (( PROJECT_LIBRARY_MIGRATION_SKIPPED )); then
    note "legacy map artifacts were not migrated safely; the library dataset will be rebuilt instead"
  fi
fi

# ---------- 3. Dataset PBF: sources + crops + merge (runbook steps 7-8) ----------
log "Dataset PBF (Geofabrik downloads, Osmium crops, merge, manifest verify)"
# prepare-regions-pbf.sh has its own verified fast path; always calling it
# also ensures the library source/crop inputs are complete, not just merged.
./map-server/scripts/prepare-regions-pbf.sh
./map-server/scripts/verify-map-pbf.sh "$MAP_PBF_PATH"
pbf_sha="$(file_sha256 "$MAP_PBF_PATH")"
[[ -n "$pbf_sha" ]] || fail "could not checksum the dataset PBF at $MAP_PBF_PATH"

# ---------- 4. PMTiles (runbook step 9) ----------
log "PMTiles (Planetiler)"
if [[ -s "$MAP_DATASET_DIR/${DATASET}.pmtiles" ]] && \
   [[ "$(metadata_value "$MAP_DATASET_DIR/${DATASET}.metadata.json" sourcePbfSha256)" == "$pbf_sha" ]]; then
  note "existing ${DATASET}.pmtiles matches the dataset checksum — skipping tile build"
else
  # Planetiler wants three global reference layers (Natural Earth, lake centerlines, water polygons) on top of
  # the dataset PBF. generate-tiles.sh fetches them into the shared library cache first and reuses them for
  # every dataset, so say here that a first build may pull ~1.3 GB — a multi-GB surprise mid-pipeline is what
  # people mistake for a hang, and an unreachable host is now reported by the fetch script with the paths it
  # needs rather than as a Java stack trace from Planetiler.
  note "tile build may fetch ~1.3 GB of Planetiler reference layers into ${MAP_PLANETILER_SOURCES_DIR:-${MAP_LIBRARY_DIR}/planetiler-sources} (reused by later builds; MAP_SOURCE_POLICY=offline requires them present)"
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
    [[ ! -e "$stale_backup" && ! -L "$stale_backup" ]] || \
      fail "stale OSRM backup staging path already exists: $stale_backup; inspect it before continuing"
    mkdir -- "$stale_backup"
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
# Build the runtime image before the disk-heavy Nominatim database import. This
# surfaces a full containerd/Docker filesystem before spending time on the import.
check_docker_storage_capacity 5 "building the Photon runtime image"
docker compose --profile geocoding build photon

reset_nominatim_volume() {
  docker compose --profile geocoding-import stop nominatim >/dev/null 2>&1 || true
  local cid="" volume=""
  cid="$(docker compose --profile geocoding-import ps -aq nominatim 2>/dev/null || true)"
  if [[ -n "$cid" ]]; then
    volume="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/16/main"}}{{.Name}}{{end}}{{end}}' "$cid" 2>/dev/null || true)"
    docker compose --profile geocoding-import rm -f nominatim >/dev/null 2>&1 || true
  fi
  if [[ -z "$volume" ]]; then
    local compose_project="" volume_list=""
    if ! compose_project="$(docker compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("name", ""))')"; then
      fail "could not determine the Compose project name; refusing to search/delete a Nominatim volume globally. Inspect this project's volumes manually."
    fi
    [[ -n "$compose_project" ]] || \
      fail "Compose did not report a project name; refusing to search/delete a Nominatim volume globally. Inspect this project's volumes manually."
    if ! volume_list="$(docker volume ls -q \
        --filter "label=com.docker.compose.project=$compose_project" \
        --filter 'label=com.docker.compose.volume=nominatim-data')"; then
      fail "could not list Nominatim volumes for Compose project $compose_project"
    fi
    local -a candidates=()
    if [[ -n "$volume_list" ]]; then
      mapfile -t candidates <<< "$volume_list"
    fi
    if (( ${#candidates[@]} == 1 )); then
      volume="${candidates[0]}"
    elif (( ${#candidates[@]} > 1 )); then
      fail "multiple Nominatim volumes found for Compose project $compose_project (${candidates[*]}); inspect them and remove this project's obsolete volume manually."
    fi
  fi
  if [[ -n "$volume" ]]; then
    docker volume rm "$volume" >/dev/null || \
      fail "could not remove the Nominatim volume $volume; stop nominatim, remove it manually (docker volume rm $volume), delete $MAP_PHOTON_DATA_DIR/photon_data, then re-run."
    note "removed old Nominatim volume $volume (its database held the previous area selection)"
  fi
}

check_nominatim_database_auth() {
  # -h nominatim and not -h 127.0.0.1: the same image trusts loopback TCP, so a loopback probe passes on
  # a wrong password and the Photon import — which reaches this server from outside the container, where
  # a password really is required — would fail an hour later, after the long one.
  local result=""
  if result="$(docker compose --profile geocoding-import exec -T \
      -e "PGPASSWORD=${NOMINATIM_PASSWORD}" nominatim \
      psql -h nominatim -U nominatim -d nominatim -tAc 'SELECT 1' 2>&1)"; then
    [[ "${result//[[:space:]]/}" == "1" ]] || \
      fail "Nominatim database auth probe returned an unexpected result: ${result:-<empty>}"
    note "Nominatim database authentication verified for the Photon import"
  elif grep -Fqi 'password authentication failed for user "nominatim"' <<< "$result"; then
    fail "the existing Nominatim database volume rejects NOMINATIM_PASSWORD from .env. Restore the password used when that volume was initialized, or follow the Nominatim password/volume recovery in docs/UBUNTU_VM_RUNBOOK.md to reset only this Compose project's Nominatim volume and re-import. Do not remove postgres-data."
  else
    fail "could not verify Nominatim database authentication before Photon import: ${result:-<no output>}"
  fi
}

mkdir -p "$MAP_PHOTON_DATA_DIR"
photon_index_present=0
if [[ -d "$MAP_PHOTON_DATA_DIR/photon_data" ]] && [[ -n "$(ls -A "$MAP_PHOTON_DATA_DIR/photon_data" 2>/dev/null)" ]]; then
  photon_index_present=1
fi
photon_fresh=0
if (( photon_index_present )) && [[ -f "$PHOTON_STAMP" ]] && [[ "$(cat "$PHOTON_STAMP")" == "$pbf_sha" ]]; then
  photon_fresh=1
elif (( photon_index_present && legacy_tehran_migrated )) && [[ ! -f "$PHOTON_STAMP" ]]; then
  # The index was built from the same Tehran PBF that was just migrated.
  mkdir -p "$(dirname -- "$PHOTON_STAMP")"
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
    rm -rf -- "$MAP_PHOTON_DATA_DIR/photon_data"
    rm -f -- "$PHOTON_STAMP"
  fi
  docker compose --profile geocoding-import up -d nominatim
  note "waiting for Nominatim's first import (can take a long while; timeout ${NOMINATIM_TIMEOUT_MIN}m)..."
  wait_healthy nominatim $(( NOMINATIM_TIMEOUT_MIN * 60 )) --profile geocoding-import
  check_nominatim_database_auth
  mkdir -p "$MAP_PHOTON_DATA_DIR"
  (
    cd "$MAP_PHOTON_DATA_DIR"
    java -Xms512m -Xmx2g -jar "$REPO_ROOT/map-server/photon/photon-1.3.0.jar" import \
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
check_docker_storage_capacity 5 "building/recreating the full Compose stack after the Nominatim import"
# Recreate map services explicitly so bind mounts and loaded files always
# point at the selected library dataset, even after an in-place refresh.
docker compose --profile routing --profile geocoding up -d --build --force-recreate \
  map-server routing-gateway osrm-car osrm-bicycle osrm-foot photon
docker compose --profile routing --profile geocoding up -d --build
wait_healthy postgres 180
# Stage 1 already proved this password against the running server; that proof is why there is no
# authentication handling here — by now the migrations are the only thing left to get wrong.
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

log "Activating the verified dataset and pruning old map releases"
python3 "$MAP_LIBRARY_PY" write-current \
  --library "$MAP_LIBRARY_DIR" \
  --selection "$REGION_IDS" \
  --snapshot-date "$SNAPSHOT_DATE" \
  --snapshot-mode "$SNAPSHOT_MODE" \
  --dataset-dir "$MAP_DATASET_DIR"
python3 "$MAP_LIBRARY_PY" prune \
  --library "$MAP_LIBRARY_DIR" \
  --selection "$REGION_IDS" \
  --snapshot-date "$SNAPSHOT_DATE" \
  --dataset-dir "$MAP_DATASET_DIR"
if [[ -n "$stale_backup" && -d "$stale_backup" ]]; then
  rm -rf -- "$stale_backup"
  note "removed verified-replaced stale OSRM graphs at $stale_backup"
fi

docker compose --profile routing --profile geocoding ps
docker stats --no-stream || true

log "Setup complete"
note "map areas installed: $REGION_IDS (change later with: $0 --reselect)"
note "snapshot: $SNAPSHOT_DATE ($SNAPSHOT_MODE); source policy: $SOURCE_POLICY"
note "map library: $MAP_LIBRARY_DIR"
note "active dataset: $MAP_DATASET_DIR"
note 'Admin login: username "admin". Passwords are never printed in setup logs.'
note 'If the seed password was generated and not saved, use python3 scripts/vm.py admin-password'
note 'from an interactive terminal after the application database is running; store it securely.'
cat <<'EOF'

  Next:
    - Web client for development:  bun run dev
      (stop the Docker api first so the dev API can bind :3000:
       docker compose stop api   # keep postgres/martin/gateway/osrm/photon running)
    - Or use the gateway directly at http://localhost:8080 (loopback only).
    - Update maps later: ./scripts/setup-ubuntu-vm.sh --update-map
    - Re-run without map downloads: ./scripts/setup-ubuntu-vm.sh --offline
    - Re-running this script is safe; up-to-date stages are skipped.
EOF
