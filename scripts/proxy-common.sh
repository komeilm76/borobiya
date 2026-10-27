#!/usr/bin/env bash
# shellcheck shell=bash disable=SC2034
# Borobiya — shared helpers behind scripts/enable-proxy.sh and scripts/disable-proxy.sh.
#
# This file is a library, not an entry point. It exists because an enable and a disable only work as
# a pair if they agree on every path and every marker string: a disable that drifts by one character
# either deletes a file it never wrote or leaves a proxy configured after the user believes it is gone.
# Both entry points source it, so the markers, the target paths, the block surgery and the "is this
# file ours?" test live in exactly one place.
#
# What "enable" changes, and why the four parts are separate (docs/UBUNTU_VM_RUNBOOK.md § 5):
#   1. the shell   — a delimited block in ~/.bashrc, which is what curl/wget/git and the download
#                    scripts in map-server/scripts read;
#   2. apt         — /etc/apt/apt.conf.d/, because apt ignores this file when you only export
#                    http_proxy, and ignores your shell environment when it drops privileges;
#   3. the daemon  — a systemd drop-in, because dockerd pulls images and reads neither of the above;
#   4. the client  — ~/.docker/config.json `proxies`, because a RUN line in a Dockerfile gets its
#                    environment from there, not from the daemon's. The same key is applied to every
#                    container `docker compose up`/`run` creates, not only to builds: the proxy env in
#                    that block is what a service's own outbound fetch sees at runtime. That is why
#                    no_proxy has to name the Compose services (see proxy_compose_service_names).
#
# Roots are overridable so the pair can be tested without touching a real machine:
#   BOROBIYA_PROXY_HOME, BOROBIYA_PROXY_BASHRC, BOROBIYA_PROXY_ETC, BOROBIYA_PROXY_DOCKER_CONFIG,
#   BOROBIYA_PROXY_SUDO (empty = run privileged commands directly), BOROBIYA_PROXY_NO_SYSTEMD=1,
#   BOROBIYA_PROXY_SKIP_PROBE=1, BOROBIYA_PROXY_CHECK_URL, BOROBIYA_PROXY_PROBE_TIMEOUT,
#   BOROBIYA_PROXY_CHECK_TIMEOUT, BOROBIYA_PROXY_NO_PROXY, BOROBIYA_PROXY_COMPOSE_FILE.

if [[ -z "${PROXY_PROG:-}" ]]; then
  printf 'proxy-common.sh is a library — run scripts/enable-proxy.sh or scripts/disable-proxy.sh\n' >&2
  exit 64
fi

# ---------- paths and the markers that make removal exact ----------
# The proxy's address is deliberately absent from this file: a VM in bridged mode needs the *host's*
# LAN address, and which address that is belongs to the machine, not to this repository.
PROXY_HOME="${BOROBIYA_PROXY_HOME:-${HOME:-}}"
if [[ -z "$PROXY_HOME" ]]; then
  printf '%s: HOME is unset, so ~/.bashrc and ~/.docker cannot be located\n' "$PROXY_PROG" >&2
  exit 1
fi

PROXY_CONFIG_DIR="$PROXY_HOME/.config/borobiya"
PROXY_STATE_FILE="$PROXY_CONFIG_DIR/proxy.state"
PROXY_CRED_FILE="$PROXY_CONFIG_DIR/proxy.env"
PROXY_BASHRC="${BOROBIYA_PROXY_BASHRC:-$PROXY_HOME/.bashrc}"
PROXY_ETC="${BOROBIYA_PROXY_ETC:-/etc}"
PROXY_APT_FILE="$PROXY_ETC/apt/apt.conf.d/95borobiya-proxy"
PROXY_DOCKERD_DROPIN="$PROXY_ETC/systemd/system/docker.service.d/borobiya-proxy.conf"
PROXY_DOCKER_CONFIG="${BOROBIYA_PROXY_DOCKER_CONFIG:-${DOCKER_CONFIG:-$PROXY_HOME/.docker}/config.json}"
PROXY_DOCKER_BACKUP="$PROXY_CONFIG_DIR/proxy.docker-config.bak"

PROXY_BLOCK_BEGIN='# >>> borobiya proxy >>>'
PROXY_BLOCK_END='# <<< borobiya proxy <<<'
PROXY_FILE_MARKER='managed by borobiya scripts/enable-proxy.sh'
PROXY_REPO_ROOT="${BOROBIYA_PROXY_REPO_ROOT:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
PROXY_COMPOSE_FILE="${BOROBIYA_PROXY_COMPOSE_FILE:-$PROXY_REPO_ROOT/docker-compose.yml}"

# Loopback and the pinned subnet are not enough. curl matches a NO_PROXY CIDR only against a *numeric*
# host, and Compose services address each other by name (`http://osrm-car:5000`, `http://photon:2322`),
# so a name never matches an IP range and the request goes to the proxy instead — which answers with its
# own 502 and never reaches the service. The names therefore have to be listed, and the list is read from
# docker-compose.yml rather than remembered here, because a service renamed in one place has to follow in
# the other. A missing or unreadable file degrades to loopback-only, which is what this default used to be.
proxy_compose_service_names() {
  python3 - "$PROXY_COMPOSE_FILE" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
try:
    lines = path.read_text(encoding="utf-8").splitlines()
except OSError:
    raise SystemExit(0)

names = []
in_services = False
for line in lines:
    if not in_services:
        in_services = re.match(r"^services:\s*(?:#.*)?$", line) is not None
        continue
    if line.startswith("#"):
        continue                     # a comment at column 0 is not the end of the services block
    if line and not line[0].isspace():
        break
    match = re.match(r"^  ([A-Za-z0-9][A-Za-z0-9_.-]*):\s*(?:#.*)?$", line)
    if match:
        names.append(match.group(1))
print(",".join(dict.fromkeys(names)))
PY
}

PROXY_LOCAL_HOSTS='localhost,127.0.0.1,::1,host.docker.internal,gateway.docker.internal,172.30.0.0/24'
_proxy_services="$(proxy_compose_service_names 2>/dev/null || true)"   # never fail a proxy enable over a config parse
PROXY_NO_PROXY_DEFAULT="$PROXY_LOCAL_HOSTS${_proxy_services:+,$_proxy_services}"
PROXY_NO_PROXY="${BOROBIYA_PROXY_NO_PROXY:-$PROXY_NO_PROXY_DEFAULT}"

DRY_RUN="${DRY_RUN:-0}"
ASSUME_YES="${ASSUME_YES:-0}"
PROXY_SUDO=()
PROXY_DOCKER_RESTART_SKIPPED=0
PROXY_PROBE_ERROR=""

# ---------- output ----------
proxy_log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
proxy_note() { printf '    %s\n' "$*"; }
proxy_fail() { printf '\n%s: %s\n' "$PROXY_PROG" "$*" >&2; exit 1; }
proxy_mask() { # hide credentials that may sit inside a URL before anything prints it
  # Match URL userinfo whether it has a password, an empty password, or just a username.
  sed -E -e 's#//[^/@[:space:]]+@#//***:***@#g'
}

# ---------- small primitives ----------
proxy_have() { command -v "$1" >/dev/null 2>&1; }

proxy_setup_io() {
  # Prefer the terminal even when stdin is redirected, matching setup-ubuntu-vm.sh.
  PROXY_INPUT_FD=0
  if { exec 3</dev/tty; } 2>/dev/null; then PROXY_INPUT_FD=3; fi
  PROXY_INTERACTIVE=0
  if [[ -t 0 || "$PROXY_INPUT_FD" == "3" ]]; then PROXY_INTERACTIVE=1; fi
  if [[ "${PROXY_FORCE_FORM:-0}" == "1" ]]; then PROXY_INTERACTIVE=1; fi
  if (( ASSUME_YES )); then PROXY_INTERACTIVE=0; fi
}

proxy_ask() { # $1 = prompt, $2 = default (empty = none); result in PROXY_ANSWER
  local prompt="$1" default="${2:-}"
  PROXY_ANSWER=""
  if (( !PROXY_INTERACTIVE )); then
    [[ -n "$default" ]] || proxy_fail "cannot ask '$prompt' without a terminal; pass it as an option (see --help)"
    PROXY_ANSWER="$default"
    proxy_note "$prompt (default, not asked) $PROXY_ANSWER"
    return 0
  fi
  if [[ -n "$default" ]]; then
    printf '%s [%s]: ' "$prompt" "$default"
  else
    printf '%s: ' "$prompt"
  fi
  IFS= read -r -u "$PROXY_INPUT_FD" PROXY_ANSWER || proxy_fail "input closed before '$prompt' was answered"
  [[ -n "$PROXY_ANSWER" ]] || PROXY_ANSWER="$default"
}

proxy_ask_secret() { # $1 = prompt; result in PROXY_ANSWER (never echoed, never written to history)
  local prompt="$1"
  PROXY_ANSWER=""
  if (( !PROXY_INTERACTIVE )); then
    proxy_fail "cannot ask '$prompt' without a terminal; pass it as an option (see --help)"
  fi
  printf '%s: ' "$prompt"
  local answer
  IFS= read -r -s -u "$PROXY_INPUT_FD" answer || proxy_fail "input closed before '$prompt' was answered"
  printf '\n'
  PROXY_ANSWER="$answer"
}

proxy_confirm() { # $1 = question → 0 yes, 1 no
  if (( ASSUME_YES )); then return 0; fi
  if (( !PROXY_INTERACTIVE )); then
    proxy_note "no terminal to ask: $1 → no"
    return 1
  fi
  printf '%s [y/N]: ' "$1"
  local answer
  IFS= read -r -u "$PROXY_INPUT_FD" answer || return 1
  case "$answer" in
    [yY] | [yY][eE][sS]) return 0 ;;
    *) return 1 ;;
  esac
}

proxy_setup_sudo() {
  PROXY_SUDO=()
  # Set-but-empty must mean "no prefix at all", not "work it out yourself": on a machine where sudo is
  # passwordless, an empty override that fell through to detection would quietly run the redirected
  # test writes as root and leave root-owned files behind in the fake /etc.
  if [[ -n "${BOROBIYA_PROXY_SUDO+set}" ]]; then
    # shellcheck disable=SC2206 # Deliberate word split of a documented prefix such as "sudo -n".
    PROXY_SUDO=(${BOROBIYA_PROXY_SUDO-})
    return 0
  fi
  if [[ "${EUID:-$(id -u)}" == "0" ]]; then
    return 0
  fi
  if ! proxy_have sudo; then
    proxy_fail "the apt and Docker daemon files need root and sudo is not installed; run as root with BOROBIYA_PROXY_SUDO=, or use --no-system"
  fi
  PROXY_SUDO=(sudo)
}

proxy_sudo() {
  if (( DRY_RUN )); then
    proxy_note "as root: $*"
    return 0
  fi
  "${PROXY_SUDO[@]}" "$@"
}

# ---------- target parsing and validation ----------
# Accepts whatever a user copies out of a proxy client: "1.2.3.4:2080", "http://1.2.3.4:2080",
# "host.lan", or "http://user:pass@1.2.3.4:2080". Parsing it here is what stops a pasted URL from
# becoming "http://http://1.2.3.4:2080" in ~/.bashrc, which fails later as a timeout, not an error.
proxy_split_target() { # $1 = raw target; sets PROXY_HOST, PROXY_PORT, PROXY_USERPASS
  local raw="$1" body host port="" tail
  PROXY_USERPASS=""
  body="${raw#*://}"
  if [[ "$body" == *"@"* ]]; then
    PROXY_USERPASS="${body%@*}"
    body="${body##*@}"
  fi
  if [[ "$body" == \[* ]]; then # bracketed IPv6, with or without :port
    host="${body%]*}"
    host="${host#\[}"
    tail="${body#*]}"
    if [[ "$tail" == :* ]]; then port="${tail#:}"; fi
  elif [[ "$body" == *:*:* ]]; then # bare IPv6: no port can be read out of it
    host="$body"
  elif [[ "$body" == *:* ]]; then
    host="${body%%:*}"
    port="${body#*:}"
  else
    host="$body"
  fi
  PROXY_HOST="$host"
  PROXY_PORT="$port"
}

proxy_valid_host() {
  local h="$1" o
  [[ -n "$h" && ${#h} -le 253 ]] || return 1
  [[ "$h" != */* ]] || return 1
  if [[ "$h" =~ ^[0-9.]+$ ]]; then # dotted quad: check every octet, curl will not complain clearly
    local -a octets
    IFS=. read -r -a octets <<<"$h"
    (( ${#octets[@]} == 4 )) || return 1
    for o in "${octets[@]}"; do
      [[ "$o" =~ ^[0-9]{1,3}$ ]] || return 1
      ((10#$o <= 255)) || return 1
    done
    return 0
  fi
  [[ "$h" =~ ^[A-Za-z0-9._:-]+$ ]] || return 1
  if [[ "$h" == *:* ]]; then # a colon is only legitimate inside an IPv6 literal, never a stray port
    # (`1.2.3.4:80` is hex-plus-dots-and-colons too, so the shape test is `::` or enough colons, not
    # the character class alone — otherwise a mistyped host:port becomes part of a hostname and the
    # failure shows up three steps later as a proxy timeout).
    [[ "$h" =~ ^[0-9A-Fa-f:.]+$ ]] || return 1
    if [[ "$h" != *::* ]]; then
      local colons="${h//[!:]/}"
      (( ${#colons} >= 4 )) || return 1
    fi
  fi
  return 0
}

proxy_valid_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] || return 1
  ((10#$1 >= 1 && 10#$1 <= 65535)) || return 1
  return 0
}

proxy_quote() { # "value" when nothing in it can expand, printf %q when something can
  # A bracket expression is deliberately not used to spell the safe set: `]` and `[` inside `[...]` are
  # not escapable in ERE, and the first version of this test silently matched nothing, which sent every
  # URL down the %q path and left `http://\[fd00::1\]:3128` in the reader's ~/.bashrc.
  local v="$1"
  case "$v" in
    *'"'* | *'$'* | *'`'* | *'\'* | *[$' \t\n']* | *[![:print:]]*) printf %q "$v" ;;
    *) printf '"%s"' "$v" ;;
  esac
}

proxy_urlenc() { # percent-encode one component, instead of the runbook's manual %40/%3A dance
  python3 -c 'import sys, urllib.parse; sys.stdout.write(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

proxy_build_url() { # $1 = host, $2 = port, $3 = user:pass (may be empty)
  # An IPv6 host must be bracketed inside a URL, but bash's /dev/tcp probe wants the bare address, so
  # the brackets are added here at the last moment and never stored in PROXY_HOST.
  local host="$1"
  # proxy_valid_host has already established that a colon here means IPv6, and it may already be
  # bracketed if the user pasted the URL form.
  if [[ "$host" == *:* && "$host" != \[* ]]; then host="[$host]"; fi
  if [[ -n "${3:-}" ]]; then
    printf 'http://%s@%s:%s' "$3" "$host" "$2"
  else
    printf 'http://%s:%s' "$host" "$2"
  fi
}

# ---------- reachability ----------
proxy_probe() { # $1 host $2 port → 0 open · 1 refused · 2 timeout/filtered · 3 other error
  local host="$1" port="$2" out rc timeout_s
  if [[ "${BOROBIYA_PROXY_SKIP_PROBE:-0}" == "1" ]]; then return 0; fi
  timeout_s="${BOROBIYA_PROXY_PROBE_TIMEOUT:-5}"
  if proxy_have timeout; then
    set +e
    out="$(timeout "$timeout_s" bash -c "exec 3<>/dev/tcp/$host/$port" 2>&1)"
    rc=$?
    set -e
  else
    set +e
    out="$(bash -c "exec 3<>/dev/tcp/$host/$port" 2>&1)"
    rc=$?
    set -e
  fi
  if (( rc == 0 )); then return 0; fi
  if (( rc == 124 || rc == 137 )); then return 2; fi
  case "$out" in
    *"Connection refused"* | *ECONNREFUSED*) return 1 ;;
  esac
  PROXY_PROBE_ERROR="$out"
  return 3
}

proxy_egress_code() { # $1 = "http"|"socks"|"direct", $2 = value for that mode → prints a code or 000
  # http takes a full proxy URL (credentials included, when there are any); socks takes host:port.
  local mode="$1" endpoint="$2" code url
  url="${BOROBIYA_PROXY_CHECK_URL:-https://github.com/}"
  local -a opts=(-sS -m "${BOROBIYA_PROXY_CHECK_TIMEOUT:-15}" -o /dev/null -w '%{http_code}')
  case "$mode" in
    http) opts+=(--proxy "$endpoint") ;;
    socks) opts+=(--socks5-hostname "$endpoint") ;;
    *) opts+=(--noproxy '*') ;;
  esac
  set +e
  code="$(curl "${opts[@]}" "$url" 2>/dev/null)"
  set -e
  printf '%s' "${code:-000}"
}

# ---------- ~/.bashrc block surgery ----------
# Removal matches both marker lines, never a pattern: `sed /proxy/d` would eat lines the user wrote,
# and a range delete that meets a BEGIN without its END silently eats the rest of the file.
proxy_bashrc_rewrite() { # $1 = apply|remove, $2 = body for apply
  local mode="$1" body="${2:-}"
  if (( DRY_RUN )); then
    proxy_note "would $mode the borobiya block in $PROXY_BASHRC"
    return 0
  fi
  PROXY_BLOCK_BODY="$body" python3 - "$PROXY_BASHRC" "$mode" "$PROXY_BLOCK_BEGIN" "$PROXY_BLOCK_END" <<'PY'
import os
import pathlib
import sys

path, mode, begin, end = sys.argv[1:5]
p = pathlib.Path(path)
lines = p.read_text().splitlines() if p.is_file() else []
out, i, removed, dropped = [], 0, 0, 0
while i < len(lines):
    if lines[i].strip() == begin:
        closer = next((k for k in range(i + 1, len(lines)) if lines[k].strip() == end), None)
        if closer is None:
            sys.exit(f"{path}: a '{begin}' line has no matching '{end}' line; refusing to guess where "
                     "the block ends — delete those lines by hand and re-run")
        dropped += closer - i + 1
        i = closer + 1
        removed += 1
        continue
    out.append(lines[i])
    i += 1

if mode == "apply":
    body = os.environ.get("PROXY_BLOCK_BODY", "").strip("\n")
    out.append(begin)
    if body:
        out.extend(body.split("\n"))
    out.append(end)

if mode == "remove" and removed == 0:
    print("no block here; nothing to remove")
else:
    text = "\n".join(out) + ("\n" if out else "")
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".borobiya.tmp")
    mode_bits = (p.stat().st_mode & 0o777) if p.exists() else 0o644
    tmp.write_text(text)
    os.chmod(tmp, mode_bits)
    os.replace(tmp, p)
    if mode == "apply":
        print(f"block written to {path}; {len(lines) - dropped} pre-existing line(s) preserved, "
              f"{removed} earlier block(s) replaced")
    else:
        print(f"removed {removed} block(s) from {path}; {len(out)} line(s) left behind")
PY
}

# ---------- state file (what makes disable exact rather than hopeful) ----------
proxy_state_write() { # key=value lines on stdin
  if (( DRY_RUN )); then
    # Drain the pipe either way: returning without reading stdin leaves the producer of the here-block
    # writing into a closed pipe, which is SIGPIPE (141) under `set -o pipefail` — a dry run that dies
    # before its own summary is worse than no dry run at all.
    cat >/dev/null
    proxy_note "would write $PROXY_STATE_FILE"
    return 0
  fi
  mkdir -p "$PROXY_CONFIG_DIR"
  # 0600 from the first byte: with --username/--password the URL in this file is a credential, and a
  # plain `>` would hand it the process umask (0644 by default) exactly as .env did before that was
  # fixed in setup-ubuntu-vm.sh.
  (
    umask 077
    cat >"$PROXY_STATE_FILE"
  )
  chmod 600 "$PROXY_STATE_FILE"
}

proxy_state_get() { # $1 = key → prints the value, or nothing when absent
  [[ -f "$PROXY_STATE_FILE" ]] || return 0
  local key line
  while IFS= read -r line; do
    if [[ "${line%%=*}" == "$1" ]]; then printf '%s' "${line#*=}"; return 0; fi
  done <"$PROXY_STATE_FILE"
}

# ---------- Docker client config: the only setting that reaches build containers ----------
# The previous file is backed up once, before the first write. Disable restores only its previous
# proxies.default entry, leaving Docker logins and other proxy mappings added since enable intact.
proxy_docker_client_apply() { # $1 = proxy url, $2 = no_proxy
  if (( DRY_RUN )); then
    proxy_note "would set proxies.default in $PROXY_DOCKER_CONFIG"
    return 0
  fi
  # The backup has to be what the file was *before we ever touched it*. Only a first enable can know
  # that: on a re-run the file we would save is our own last output, and treating it as pristine would
  # make disable resurrect our key instead of removing it.
  local first_enable=0
  # A state file from --no-docker-config does not mean we own the Docker key. An absent field is an
  # older state file: preserve its previous first-enable behavior for existing installations.
  if [[ ! -f "$PROXY_STATE_FILE" || "$(proxy_state_get DOCKER_CONFIG_MANAGED)" == 0 ]]; then
    first_enable=1
  fi
  PROXY_FIRST_ENABLE="$first_enable" PROXY_DOCKER_BACKUP="$PROXY_DOCKER_BACKUP" \
    PROXY_DOCKER_URL="$1" PROXY_DOCKER_NOPROXY="$2" python3 - "$PROXY_DOCKER_CONFIG" <<'PY'
import json
import os
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
backup = pathlib.Path(os.environ["PROXY_DOCKER_BACKUP"])
config = {}
if path.is_file():
    try:
        config = json.loads(path.read_text() or "{}")
    except ValueError:
        sys.exit(f"{path}: not valid JSON; refusing to rewrite it — merge a \"proxies\" key by hand "
                 "(docs/UBUNTU_VM_RUNBOOK.md § 5.3)")
    if not isinstance(config, dict):
        sys.exit(f"{path}: top level is not a JSON object; refusing to rewrite it")
    if "proxies" in config and not isinstance(config["proxies"], dict):
        sys.exit(f"{path}: proxies must be a JSON object; refusing to rewrite it")
    if "proxies" in config and not backup.exists() and os.environ.get("PROXY_FIRST_ENABLE") == "1":
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_text(path.read_text())
        os.chmod(backup, 0o600)
        print(f"    backed up the previous {path} to {backup}")
proxies = {
    "httpProxy": os.environ["PROXY_DOCKER_URL"],
    "httpsProxy": os.environ["PROXY_DOCKER_URL"],
    "noProxy": os.environ["PROXY_DOCKER_NOPROXY"],
}
if isinstance(config.get("proxies"), dict) and config["proxies"].get("default") == proxies:
    print("    build proxy already configured in that file; left as is")
    raise SystemExit(0)
config["proxies"] = {**(config.get("proxies") or {}), "default": proxies}
path.parent.mkdir(parents=True, exist_ok=True)
tmp = path.with_name(path.name + ".borobiya.tmp")
tmp.write_text(json.dumps(config, indent=2) + "\n")
os.chmod(tmp, 0o600)
os.replace(tmp, path)
print(f"    wrote proxies.default to {path}")
PY
}

proxy_docker_client_strip() {
  if (( DRY_RUN )); then
    proxy_note "would restore or clear proxies.default in $PROXY_DOCKER_CONFIG (preserving other keys)"
    return 0
  fi
  PROXY_DOCKER_BACKUP="$PROXY_DOCKER_BACKUP" python3 - "$PROXY_DOCKER_CONFIG" <<'PY'
import json
import os
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
backup = pathlib.Path(os.environ["PROXY_DOCKER_BACKUP"])
if not path.is_file():
    if backup.is_file():
        sys.exit(f"{path}: missing while a previous proxy backup exists at {backup}; "
                 "leaving state and backup for manual recovery")
    print(f"    no {path}; nothing to do")
    raise SystemExit(0)


def read_config(source):
    try:
        value = json.loads(source.read_text() or "{}")
    except ValueError:
        sys.exit(f"{source}: not valid JSON; leaving it alone — edit proxies.default by hand")
    if not isinstance(value, dict) or ("proxies" in value and not isinstance(value["proxies"], dict)):
        sys.exit(f"{source}: expected a JSON object with an object-valued proxies key; leaving it alone")
    return value


config = read_config(path)
original = read_config(backup) if backup.is_file() else {}
updated = {**config}
proxies = dict(config.get("proxies", {}))
original_proxies = original.get("proxies", {})
if "default" in original_proxies:
    proxies["default"] = original_proxies["default"]
else:
    proxies.pop("default", None)
if proxies or "proxies" in original:
    updated["proxies"] = proxies
else:
    updated.pop("proxies", None)
if updated != config:
    tmp = path.with_name(path.name + ".borobiya.tmp")
    tmp.write_text(json.dumps(updated, indent=2) + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)
if backup.is_file():
    backup.unlink()
    print(f"    restored the previous proxies.default from {backup}; kept other Docker settings in {path}")
else:
    print(f"    removed managed proxies.default from {path}; kept other Docker settings")
PY
}

# ---------- pre-flight: find every failure before anything is written ----------
# Order matters here. A check that can fail has to run before the writes, not after: an enable that
# configured ~/.bashrc and then discovered an administrator's apt file would leave a half-configured
# proxy behind, which is the exact state this whole section exists to avoid.
proxy_foreign_proxy_files() { # $1 = apt | dockerd | (empty for both) → "kind<TAB>path" per hit
  # Every file in a root-owned proxy directory that is not ours, which is the only way to find a
  # configuration written under a name this repository used before the scripts existed. A second file in
  # either place is not harmless: apt reads apt.conf.d in sorted filename order and the last value it
  # sees wins, while systemd concatenates Environment= across drop-ins, so two files can both be in
  # force at once.
  #
  # Kinds: "proxy" means the file sets one; "unreadable" means it exists and we could not tell, which
  # belongs in the report but must never cause a refusal — refusing over an unknown is worse than
  # printing it. Callers filter on the kind.
  local which="${1:-all}" dir f skip found=0
  local -a files
  for dir in apt dockerd; do
    [[ "$which" == "all" || "$which" == "$dir" ]] || continue
    case "$dir" in
      apt) [[ -d "${PROXY_ETC}/apt/apt.conf.d" ]] || continue
           files=( "${PROXY_ETC}"/apt/apt.conf.d/* )
           skip="$PROXY_APT_FILE" ;;
      *)   [[ -d "${PROXY_ETC}/systemd/system/docker.service.d" ]] || continue
           files=( "${PROXY_ETC}"/systemd/system/docker.service.d/*.conf )
           skip="$PROXY_DOCKERD_DROPIN" ;;
    esac
    # An array, not "$1": `set -- dir/* file` puts the first match in $1 and shifts the rest out of
    # sight, so only one file in the directory was ever examined — which is precisely the file that
    # is not the interesting one, because apt.conf.d is alphabetical and the leftovers sort late.
    for f in "${files[@]}"; do
      [[ -f "$f" && "$f" != "$skip" ]] || continue
      if [[ ! -r "$f" ]]; then
        printf 'unreadable %s\n' "$f"
        found=1
      elif grep -qiE '::[a-z]*proxy|proxy=' "$f"; then
        printf 'proxy %s\n' "$f"
        found=1
      fi
    done
  done
  return $(( 1 - found ))
}




# `sed -n '/^proxy /p'` and not `grep -q`: grep -q stops reading at its first match, the writer then
# dies of SIGPIPE, and under `set -o pipefail` the pipeline's status is 141 — so "it matched" arrives at
# the `if` as a failure, whenever the producer is fast enough to still be writing. Which is a race, and
# this whole file exists to avoid half-configured state. sed reads to the end and cannot lose that race.
proxy_foreign_conflicts() { # $1 = apt | dockerd | (omitted) → only the provable hits
  # ${1:-} and not "$1": `set -u` makes an omitted argument a fatal error, and because this runs inside
  # a command substitution in a condition, that error is swallowed and the check silently reports "no
  # conflict" — the refusal stops working, which is the one thing this function exists to do.
  proxy_foreign_proxy_files "${1:-}" | sed -n '/^proxy /p'
}


proxy_apt_sets_proxy() {
  # "sets a proxy" means provably: an unreadable neighbour is shown by --status and does not count here,
  # because 0-of-4 versus 1-of-4 is a claim about the machine, not about what we could read.
  [[ -e "$PROXY_APT_FILE" ]] && return 0
  [[ -n "$(proxy_foreign_conflicts apt)" ]]
}


proxy_dockerd_sets_proxy() {
  [[ -e "$PROXY_DOCKERD_DROPIN" ]] && return 0
  [[ -n "$(proxy_foreign_conflicts dockerd)" ]]
}


proxy_foreign_note() { # the advice that belongs wherever the list is printed
  local kind f line hits
  hits="$(proxy_foreign_proxy_files || true)"
  [[ -n "$hits" ]] || return 0   # no advice when there is nothing to advise about
  while read -r kind f; do
    [[ -n "$f" ]] || continue
    if [[ "$kind" == "unreadable" ]]; then
      # Named without its contents: the reader has to know the file is there, and "we could not read
      # it" is the honest form of that.
      printf '    also here, and not readable without sudo, so it may set a proxy: %s\n' "$f"
      continue
    fi
    printf '    also sets a proxy, and was not written here: %s\n' "$f"
    # Its own proxy lines, quoted back, because "there is another file" is not actionable and
    # "there is another file pointing at a different address" is.
    line="$(grep -h -iE '::[a-z]*proxy|proxy=' "$f" | head -2 | tr '\n' ' ')"
    [[ -n "$line" ]] && printf '      %s\n' "$(printf '%s' "$line" | proxy_mask)"
  done <<<"$hits"
  proxy_note "apt merges apt.conf.d in filename order (the last value read wins) and systemd appends"
  proxy_note "Environment= across drop-ins, so this file and ours will disagree in ways that are hard"
  proxy_note "to read back. Read it, then remove it: sudo rm -f <path> — this script will not delete a"
  proxy_note "file it did not write, because you may have put a second proxy in it on purpose."
  return 0
}


proxy_system_preflight() {
  local f foreign=0
  for f in "$PROXY_APT_FILE" "$PROXY_DOCKERD_DROPIN"; do
    if ! proxy_owns_or_absent "$f"; then
      proxy_note "REFUSING to overwrite $f — it exists and does not carry this script's marker"
      foreign=1
    fi
  done
  # Only a provable conflict stops the run: a file we could not read is reported by --status, but
  # refusing because something in /etc might disagree would hold up a working machine.
  if [[ -n "$(proxy_foreign_conflicts)" ]]; then
    proxy_log "Another proxy file is already in the way"
    proxy_foreign_note
    foreign=1
  fi
  if (( foreign )); then
    proxy_fail "a proxy file already exists that this script did not write; read it, then remove it or point this script elsewhere"
  fi
}

proxy_docker_client_check() {
  if (( DRY_RUN )); then return 0; fi
  python3 - "$PROXY_DOCKER_CONFIG" <<'JSONCHECK'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
if not path.is_file():
    if path.exists():
        sys.exit(f"{path}: exists but is not a regular file")
    print(f"    {path}: does not exist yet, will be created")
    raise SystemExit(0)
try:
    config = json.loads(path.read_text() or "{}")
except ValueError:
    sys.exit(f"{path}: not valid JSON; refusing to rewrite it — merge a \"proxies\" key by hand "
             "(docs/UBUNTU_VM_RUNBOOK.md § 5.3)")
if not isinstance(config, dict):
    sys.exit(f"{path}: top level is not a JSON object; refusing to rewrite it")
if "proxies" in config and not isinstance(config["proxies"], dict):
    sys.exit(f"{path}: proxies must be a JSON object; refusing to rewrite it")
print(f"    {path}: readable JSON with {len(config)} key(s) already in it")
JSONCHECK
}

# ---------- root-owned files ----------
proxy_owns_or_absent() { # $1 = path → 0 ours or absent · 1 foreign
  [[ -e "$1" ]] || return 0
  if [[ -r "$1" ]]; then
    if grep -qF -- "$PROXY_FILE_MARKER" "$1" 2>/dev/null; then return 0; fi
    return 1
  fi
  return 0
}

proxy_system_apply() { # $1 = url with credentials for apt/daemon, $2 = no_proxy
  local apt_body daemon_body
  apt_body="$(printf '// %s — remove with scripts/disable-proxy.sh\nAcquire::http::Proxy "%s";\nAcquire::https::Proxy "%s";\n' \
    "$PROXY_FILE_MARKER" "$1" "$1")"
  daemon_body="$(printf '# %s — remove with scripts/disable-proxy.sh\n# systemd does not read your shell environment, so dockerd needs this.\n[Service]\nEnvironment="HTTP_PROXY=%s"\nEnvironment="HTTPS_PROXY=%s"\nEnvironment="NO_PROXY=%s"\n' \
    "$PROXY_FILE_MARKER" "$1" "$1" "$2")"
  if (( DRY_RUN )); then
    proxy_note "would write $PROXY_APT_FILE and $PROXY_DOCKERD_DROPIN"
    return 0
  fi
  proxy_sudo mkdir -p "${PROXY_APT_FILE%/*}" ||
    proxy_fail "could not create ${PROXY_APT_FILE%/*} — re-run with a working sudo, or use runbook § 5.3"
  printf '%s\n' "$apt_body" | proxy_sudo tee "$PROXY_APT_FILE" >/dev/null ||
    proxy_fail "could not write $PROXY_APT_FILE"
  proxy_note "wrote $PROXY_APT_FILE"
  proxy_sudo mkdir -p "${PROXY_DOCKERD_DROPIN%/*}" ||
    proxy_fail "could not create ${PROXY_DOCKERD_DROPIN%/*} — the apt file is written, the drop-in is not"
  printf '%s\n' "$daemon_body" | proxy_sudo tee "$PROXY_DOCKERD_DROPIN" >/dev/null ||
    proxy_fail "could not write $PROXY_DOCKERD_DROPIN"
  proxy_note "wrote $PROXY_DOCKERD_DROPIN"
  if [[ -n "${PROXY_USERPASS:-}" ]]; then
    # Both files now contain a password. apt and systemd read them as root, so 0600 costs nothing.
    proxy_sudo chmod 600 "$PROXY_APT_FILE" "$PROXY_DOCKERD_DROPIN" ||
      proxy_fail "both files were written but are not 0600, so a password is readable: run" \
        "'sudo chmod 600 $PROXY_APT_FILE $PROXY_DOCKERD_DROPIN' before anything else"
  fi
}

proxy_system_remove() {
  local f
  for f in "$PROXY_APT_FILE" "$PROXY_DOCKERD_DROPIN"; do
    if [[ ! -e "$f" ]]; then
      proxy_note "absent, nothing to remove: $f"
      continue
    fi
    if ! proxy_owns_or_absent "$f"; then
      proxy_note "left alone, because enable-proxy.sh did not write it: $f"
      continue
    fi
    if (( DRY_RUN )); then
      proxy_note "would remove $f"
    else
      if proxy_sudo rm -f "$f"; then
        proxy_note "removed $f"
      else
        # Not fatal: a file that outlives the run because sudo was unavailable is a leak to report,
        # and saying so beats the script exiting between two notes.
        proxy_note "could not remove $f — it is still there, and needs: sudo rm -f $f"
      fi
    fi
  done
}

proxy_reload_docker() {
  if [[ "${BOROBIYA_PROXY_NO_SYSTEMD:-0}" == "1" ]]; then
    proxy_note "BOROBIYA_PROXY_NO_SYSTEMD=1 — no daemon-reload and no restart"
    return 0
  fi
  if ! proxy_have systemctl; then
    proxy_note "no systemctl here: run 'systemctl daemon-reload && systemctl restart docker' as root"
    return 0
  fi
  if (( DRY_RUN )); then
    proxy_note "as root: systemctl daemon-reload && systemctl restart docker"
    return 0
  fi
  if ! proxy_confirm "restarting Docker stops and restarts every running container — continue?"; then
    PROXY_DOCKER_RESTART_SKIPPED=1
    proxy_note "skipped: apply it later with 'sudo systemctl daemon-reload && sudo systemctl restart docker'"
    return 0
  fi
  # Both are said rather than trusted: under `set -e` a bare failing command here would stop the
  # script after the files were written, which is the worst place to go silent — the reader would be
  # left with a configured apt and a daemon that never re-read it.
  proxy_sudo systemctl daemon-reload ||
    proxy_note "daemon-reload failed; the drop-in is still on disk and applies at the next restart"
  proxy_sudo systemctl restart docker ||
    proxy_fail "docker did not restart, so it is still running without the proxy: run" \
      "'sudo systemctl restart docker' by hand, then re-check with 'docker info | grep -i proxy'"
  proxy_note "docker restarted; the daemon now reads $PROXY_DOCKERD_DROPIN"
}

# ---------- reporting ----------
proxy_file_state() { # $1 = path
  if [[ ! -e "$1" ]]; then
    printf '  %s: absent\n' "$1"
  elif grep -qF -- "$PROXY_FILE_MARKER" "$1" 2>/dev/null; then
    printf '  %s: ours\n' "$1"
  else
    printf '  %s: exists, not ours\n' "$1"
  fi
}

proxy_is_configured() {
  # True when there is anything at all in the places this project uses — ours or somebody else's.
  # The question exists so disable-proxy.sh can decline to ask "remove the configuration listed
  # above?" about an empty list, and a foreign apt file is emphatically not an empty list: disable has
  # to run, report it as left alone, and let the reader see that decision being made. Ours-ness is
  # each writer's business (they refuse on it); presence is this function's.
  if [[ -f "$PROXY_STATE_FILE" ]]; then return 0; fi
  if [[ -f "$PROXY_BASHRC" ]] && grep -qF -- "$PROXY_BLOCK_BEGIN" "$PROXY_BASHRC"; then return 0; fi
  if [[ -e "$PROXY_APT_FILE" ]]; then return 0; fi
  if [[ -e "$PROXY_DOCKERD_DROPIN" ]]; then return 0; fi
  if [[ -f "$PROXY_DOCKER_CONFIG" ]] && grep -q '"proxies"' "$PROXY_DOCKER_CONFIG" 2>/dev/null; then
    return 0
  fi
  return 1
}


proxy_status() {
  proxy_log "Proxy state, as far as this machine shows it"
  local here="${http_proxy:-${HTTP_PROXY:-}}"
  printf '  this shell   : %s\n' "$(printf '%s' "${here:-nothing exported (the block affects new terminals, not this one)}" | proxy_mask)"
  if [[ -f "$PROXY_BASHRC" ]] && grep -qF -- "$PROXY_BLOCK_BEGIN" "$PROXY_BASHRC"; then
    printf '  %s\n' "$PROXY_BASHRC: block present"
    awk -v begin="$PROXY_BLOCK_BEGIN" -v end="$PROXY_BLOCK_END" '
        index($0, begin) { f = 1 }
        f { print }
        index($0, end) { f = 0 }
      ' "$PROXY_BASHRC" | proxy_mask | sed -n 's/^/               /p'
  else
    printf '  %s\n' "$PROXY_BASHRC: no block"
  fi
  proxy_file_state "$PROXY_APT_FILE"
  proxy_file_state "$PROXY_DOCKERD_DROPIN"
  if [[ -f "$PROXY_DOCKER_CONFIG" ]] && grep -q '"proxies"' "$PROXY_DOCKER_CONFIG" 2>/dev/null; then
    printf '  %s\n' "$PROXY_DOCKER_CONFIG: has a proxies key (build containers)"
  else
    printf '  %s: no proxies key\n' "$PROXY_DOCKER_CONFIG"
  fi
  if [[ -f "$PROXY_STATE_FILE" ]]; then
    printf '  state file    : %s\n' "$PROXY_STATE_FILE"
    proxy_mask <"$PROXY_STATE_FILE" | sed -n 's/^/               /p'
  else
    printf '  state file    : none (nothing was enabled by enable-proxy.sh, or it has been removed)\n'
  fi
  # The daemon's own view, when there is a daemon to ask. Every part of that sentence is a way for
  # this report to fail, and a report is not allowed to fail: `systemctl` is absent on a non-systemd
  # host, `docker info` needs the socket, and on a correctly configured machine with no proxy the
  # `grep -i proxy` finds nothing and exits 1 — which, inside an assignment under `set -e`, ended the
  # whole script mid-report. That is the bug a reader on a real VM hits first and cannot name: the
  # output simply stops. Hence `|| true`, the guard, and the `return 0`.
  # The report is also the only place a reader learns that the machine is *half* proxied: apt can be
  # pointed at a proxy the shell has never heard of, which is what a hand-written file from an earlier
  # revision of the runbook leaves behind. Both facts come from the same scan.
  # Counted per *place*, whoever configured it: on a machine where apt was set up by hand from an older
  # revision of this file, "0 of 4" would be a false reassurance and "2 of 4" is the actual diagnosis.
  local set=0
  if [[ -f "$PROXY_BASHRC" ]] && grep -qF -- "$PROXY_BLOCK_BEGIN" "$PROXY_BASHRC"; then set=$(( set + 1 )); fi
  if proxy_apt_sets_proxy; then set=$(( set + 1 )); fi
  if proxy_dockerd_sets_proxy; then set=$(( set + 1 )); fi
  if [[ -f "$PROXY_DOCKER_CONFIG" ]] && grep -q '"proxies"' "$PROXY_DOCKER_CONFIG" 2>/dev/null; then
    set=$(( set + 1 ))
  fi
  printf '  how much is set : %s of 4 places%s\n' "$set" \
    "$(if (( set > 0 && set < 4 )); then printf ' — the four are independent settings, so a partial one is the usual cause of "apt works but curl does not"'; fi)"
  proxy_foreign_note

  if [[ "${BOROBIYA_PROXY_NO_SYSTEMD:-0}" != "1" ]] && proxy_have docker \
    && proxy_have systemctl && docker info >/dev/null 2>&1; then
    local daemon_env=""
    # `sed` first because systemctl answers with the field name attached ("Environment=http_proxy=…"),
    # and `|| true` because a machine with no proxy in its unit environment makes `grep` exit 1 — which
    # inside an assignment is exactly the fatal status that ended this report under `set -e`.
    daemon_env="$(systemctl show docker --property=Environment 2>/dev/null \
      | sed -e 's/^Environment=//' | tr ' ' '\n' | grep -i proxy | paste -sd' ' - || true)"
    printf '  daemon env    : %s\n' "$(printf '%s' "${daemon_env:-no proxy in the unit environment}" | proxy_mask)"
  fi
  return 0
}

# ---------- the host side, which this repository cannot touch ----------
proxy_host_hint() { # $1 = host, $2 = port — the two commands § 5.1a describes, with the values used
  local host="$1" port="$2" own=""
  if proxy_have ip; then
    own="$(ip -4 -o addr show scope global 2>/dev/null | awk 'NR == 1 { print $4 }')"
  fi
  printf '\nIf nothing answered on %s:%s, the fix is on the host, not in this VM:\n' "$host" "$port"
  printf '  1. turn on the proxy client'"'"'s "allow connections from LAN" option, so it binds 0.0.0.0\n'
  printf '     instead of 127.0.0.1 (a VM is not loopback to the host), and\n'
  printf '  2. let the port through the host firewall for the LAN only — elevated PowerShell:\n\n'
  printf '       New-NetFirewallRule -DisplayName "borobiya proxy" -Direction Inbound -Action Allow -Protocol TCP -LocalPort %s -RemoteAddress %s -Profile Any\n\n' \
    "$port" "${own:-<run: ip -4 -o addr show scope global>}"
  printf '       netsh interface portproxy add v4tov4 listenaddress=%s listenport=%s connectaddress=127.0.0.1 connectport=%s\n\n' "$host" "$port" "$port"
  printf '   netsh is only for a client that cannot listen outside loopback; it needs the IP Helper service.\n'
  printf '   The -RemoteAddress value has to be your LAN range: the address printed above belongs to this\n'
  printf '   VM, which shares the host subnet only in bridged mode. Delete the rule, and the portproxy if\n'
  printf '   you added one, when the downloads are done — disable-proxy.sh cannot reach the host.\n'
}
