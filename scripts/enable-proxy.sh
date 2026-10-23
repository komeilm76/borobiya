#!/usr/bin/env bash
# Borobiya — ask for a proxy address and port, prove the port answers, then enable it everywhere this
# project needs it. The manual equivalent is docs/UBUNTU_VM_RUNBOOK.md § 5, which also explains why
# four separate settings are required; this script is that section made interactive.
#
# Nothing is written before the port has answered: a configured-but-dead proxy is worse than no proxy,
# because every later failure (apt, curl, git, a docker pull, a 1.3 GB download at 40% ) turns into a
# timeout with no explanation. And nothing is written blindly: ~/.bashrc gets a delimited block, the
# root-owned files are refused if they already exist without this script's marker, and the address is
# asked for rather than baked into the repository, because it belongs to the machine, not to the code.
set -euo pipefail

# shellcheck disable=SC2034  # read as the program name by the library sourced below
PROXY_PROG="enable-proxy"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=./proxy-common.sh
# shellcheck disable=SC1091  # shellcheck only follows a source line for input files it was given
source "$SCRIPT_DIR/proxy-common.sh"

usage() {
  cat <<'EOF'
Usage: scripts/enable-proxy.sh [host[:port] [port]] [options]

Asks for whatever it is not given, checks the port, then configures the proxy for the shell, apt,
the Docker daemon and Docker builds.

Options:
  --host <addr>        proxy address, no scheme (a bridged VM needs the host's LAN address, a NAT
                       VM the default gateway — see the mode table in runbook § 5)
  --port <n>           proxy port (asked for when omitted; no port is assumed)
  --username <u>       only if the proxy authenticates; both go into a 0600 file, never into a
  --password <p>       world-readable one, and are percent-encoded for you
  --no-shell           skip the delimited block in ~/.bashrc (curl/wget/git and the map scripts)
  --no-system          skip the root-owned files: apt's 95borobiya-proxy and the dockerd drop-in
  --no-docker-config   skip ~/.docker/config.json, i.e. skip the proxy for `docker build` containers
  --skip-checks        configure without probing the port or asking it for a page
  --yes                no confirmations (the Docker restart prompt included)
  --dry-run            print every change, make none
  --status             report what is configured right now and exit
  -h, --help           this help

Env: PROXY_HOST, PROXY_PORT, BOROBIYA_PROXY_CHECK_URL (default https://github.com/),
     BOROBIYA_PROXY_NO_PROXY, BOROBIYA_PROXY_PROBE_TIMEOUT, and the test hooks listed in
     scripts/proxy-common.sh.

Afterwards: open a new terminal or `source ~/.bashrc` (a running command never picks the exports up),
and undo everything with scripts/disable-proxy.sh.
EOF
}

ARG_TARGET=""
ARG_HOST=""
ARG_PORT=""
ARG_USER=""
ARG_PASS=""
DO_SHELL=1
DO_SYSTEM=1
DO_DOCKER_CONFIG=1
DO_CHECKS=1
STATUS_ONLY=0

# shellcheck disable=SC2034  # ASSUME_YES and the PROXY_* inputs are consumed by the sourced library
while (( $# > 0 )); do
  case "$1" in
    --host) [[ $# -ge 2 ]] || proxy_fail "--host requires a value"; ARG_HOST="$2"; shift 2 ;;
    --host=*) ARG_HOST="${1#*=}"; shift ;;
    --port) [[ $# -ge 2 ]] || proxy_fail "--port requires a value"; ARG_PORT="$2"; shift 2 ;;
    --port=*) ARG_PORT="${1#*=}"; shift ;;
    --username) [[ $# -ge 2 ]] || proxy_fail "--username requires a value"; ARG_USER="$2"; shift 2 ;;
    --username=*) ARG_USER="${1#*=}"; shift ;;
    --password) [[ $# -ge 2 ]] || proxy_fail "--password requires a value"; ARG_PASS="$2"; shift 2 ;;
    --password=*) ARG_PASS="${1#*=}"; shift ;;
    --no-shell) DO_SHELL=0; shift ;;
    --no-system) DO_SYSTEM=0; shift ;;
    --no-docker-config) DO_DOCKER_CONFIG=0; shift ;;
    --skip-checks) DO_CHECKS=0; shift ;;
    --yes) ASSUME_YES=1; shift ;;  # read by the library's proxy_confirm
    --dry-run) DRY_RUN=1; shift ;;
    --status) STATUS_ONLY=1; shift ;;
    -h | --help) usage; exit 0 ;;
    -*) proxy_fail "unknown option: $1 (see --help)" ;;
    *)
      # Order matters here: a digits-only argument is a port once a host is known from anywhere, and a
      # host otherwise. "enable-proxy.sh 192.168.100.225 2080" and "enable-proxy.sh --host 1.2.3.4 2080"
      # are both how the answer arrives when nobody opens --help, and treating the second as a hostname
      # would send the run looking for a machine called "2080".
      if [[ "$1" =~ ^[0-9]+$ && -z "$ARG_PORT" && ( -n "$ARG_HOST" || -n "$ARG_TARGET" ) ]]; then
        ARG_PORT="$1"
      elif [[ -z "$ARG_TARGET" ]]; then
        ARG_TARGET="$1"
      else
        proxy_fail "unexpected extra argument: $1 (see --help)"
      fi
      shift ;;
  esac
done

proxy_setup_io
proxy_status
if (( STATUS_ONLY )); then exit 0; fi

# ---------- 1. the address, from the argument, the environment, or the user ----------
# The environment is read before anything is split, because proxy_split_target overwrites both halves.
ARG_PORT="${ARG_PORT:-${PROXY_PORT:-}}"
if [[ -n "$ARG_TARGET" ]]; then
  proxy_split_target "$ARG_TARGET"
else
  proxy_split_target "${PROXY_HOST:-}"
fi
TARGET_PORT="$PROXY_PORT"
if [[ -n "$ARG_HOST" ]]; then
  # --host accepts "10.0.0.5", "10.0.0.5:3128" or "[fd00::1]:3128": one flag should not be a trap for
  # the value a proxy client shows on screen, and a colon that survives into the host field becomes
  # "http://10.0.0.5:3128:2080" — a URL that fails as a timeout, not as a parse error.
  proxy_split_target "$ARG_HOST"
  [[ -n "$PROXY_PORT" ]] || PROXY_PORT="$TARGET_PORT"
fi
# A port can arrive three ways — inside the positional target, as --port / PROXY_PORT, or as a bare
# second positional. Whoever typed it, two different values is a typo and not a precedence rule: a
# silently chosen winner shows up later as a proxy that "does not work".
if [[ -n "$ARG_PORT" && -n "$PROXY_PORT" && "$ARG_PORT" != "$PROXY_PORT" ]]; then
  proxy_fail "the port $ARG_PORT contradicts the port $PROXY_PORT already given; give it once"
fi
[[ -n "$ARG_PORT" ]] && PROXY_PORT="$ARG_PORT"

if [[ -z "$PROXY_HOST" ]]; then
  proxy_log "Where to proxy to"
  # One answer may carry both halves ("10.0.2.5:3128"), because that is the shape a proxy client shows
  # on screen; splitting it here is what stops ":3128" from becoming part of a hostname.
  proxy_ask "Proxy address, optionally host:port (host LAN IP when the VM is bridged; the default gateway only in NAT mode)" ""
  if [[ -n "${PROXY_PORT:-}" ]]; then
    PROXY_HOST="$PROXY_ANSWER"
  else
    if [[ "$PROXY_ANSWER" == *:*:* && "$PROXY_ANSWER" != \[* ]]; then
      # A bracketless IPv6 has more than one colon, so there is no way to tell where the address ends;
      # that ambiguity belongs to the combined answer, not to --host, which is why the advice is here.
      proxy_fail "'$PROXY_ANSWER' has more than one colon: bracket an IPv6 address as [fd00::1]:3128, or give the address alone and let the next question take the port"
    fi
    proxy_split_target "$PROXY_ANSWER"
    [[ -n "$PROXY_HOST" ]] || proxy_fail "no address in '$PROXY_ANSWER'"
  fi
fi
proxy_valid_host "$PROXY_HOST" ||
  proxy_fail "'$PROXY_HOST' is not a usable address — an IPv4 address, a hostname or an IPv6 literal, with no port, scheme or path (a port belongs in --port)"

if [[ -z "$PROXY_PORT" ]]; then
  proxy_ask "Proxy port (whatever your client listens on)" ""
  PROXY_PORT="$PROXY_ANSWER"
  [[ -n "$PROXY_PORT" ]] ||
    proxy_fail "no port given — this script will not guess one, because a wrong port looks like a broken mirror three steps later"
fi
proxy_valid_port "$PROXY_PORT" ||
  proxy_fail "port must be a number from 1 to 65535, got '$PROXY_PORT' (a URL like http://host:2080 works as the argument, a path does not)"

if [[ -n "$ARG_USER" ]]; then
  if [[ -z "$ARG_PASS" ]]; then
    proxy_ask_secret "Proxy password for $ARG_USER"
    ARG_PASS="$PROXY_ANSWER"
  fi
  PROXY_USERPASS="$(proxy_urlenc "$ARG_USER"):$(proxy_urlenc "$ARG_PASS")"
fi

PROXY_URL="$(proxy_build_url "$PROXY_HOST" "$PROXY_PORT" "${PROXY_USERPASS:-}")"
PROXY_URL_MASKED="$(printf '%s' "$PROXY_URL" | proxy_mask)"
PROXY_ENDPOINT="$PROXY_HOST:$PROXY_PORT"

log_target() {
  proxy_log "Target"
  proxy_note "endpoint   : $PROXY_ENDPOINT"
  proxy_note "proxy URL  : $PROXY_URL_MASKED"
  proxy_note "no_proxy   : $PROXY_NO_PROXY"
}
log_target

previous="$(proxy_state_get PROXY_URL)"
if [[ -n "$previous" && "$previous" != "$PROXY_URL" ]]; then
  proxy_note "replacing the proxy this script enabled before: $(printf '%s' "$previous" | proxy_mask)"
fi

# ---------- 2. prove the port answers, before anything is written ----------
if (( DO_CHECKS )); then
  proxy_log "Reaching $PROXY_ENDPOINT"
  probe_rc=0
  proxy_probe "$PROXY_HOST" "$PROXY_PORT" || probe_rc=$?
  case "$probe_rc" in
    0) proxy_note "port open: something is listening and the firewall lets this VM in" ;;
    1)
      proxy_note "connection REFUSED — nothing is listening on $PROXY_ENDPOINT from this VM."
      proxy_note "That is usually the proxy bound to 127.0.0.1 on the host, not a broken proxy."
      proxy_host_hint "$PROXY_HOST" "$PROXY_PORT"
      proxy_fail "not configured. Fix the listen address on the host, then re-run (runbook § 5.1a)."
      ;;
    2)
      proxy_note "TIMEOUT — the port is being dropped, which is a firewall or a wrong address,"
      proxy_note "not a broken download. A refused connection would have been the bind address instead."
      proxy_host_hint "$PROXY_HOST" "$PROXY_PORT"
      proxy_fail "not configured. Allow the port for the VM's range on the host, then re-run (runbook § 5.1a)."
      ;;
    *)
      proxy_note "the TCP probe itself failed: ${PROXY_PROBE_ERROR:-no detail}"
      proxy_fail "not configured. Re-run with --skip-checks to configure it anyway."
      ;;
  esac

  proxy_log "Asking it for a page over HTTP (apt and dockerd need HTTP CONNECT, not SOCKS)"
  code="$(proxy_egress_code http "$PROXY_URL")"
  if [[ "$code" == "000" ]]; then
    socks_code="$(proxy_egress_code socks "$PROXY_ENDPOINT")"
    if [[ "$socks_code" != "000" ]]; then
      proxy_note "the port answers SOCKS ($socks_code) but not HTTP ($code)."
      proxy_note "apt and the Docker daemon cannot use a SOCKS-only listener; point this script at the"
      proxy_note "HTTP or mixed port of the same client (Throne, v2ray and sing-box normally use one port"
      proxy_note "for both) rather than working around it."
      proxy_fail "not configured. Use the HTTP/mixed port, or --skip-checks if you are sure."
    fi
    proxy_note "the port accepted the connection but returned no HTTP status. That can be a proxy that"
    proxy_note "blocks this target, so it is a warning rather than a stop; the checks in runbook § 5.2"
    proxy_note "test the targets this project actually downloads from."
  elif [[ "$code" == "407" ]]; then
    proxy_fail "the proxy demands credentials (407). Re-run with --username and --password."
  else
    proxy_note "proxy answered HTTP $code — it spoke our protocol, which is what this check is for"
  fi
else
  proxy_note "checks skipped on request (--skip-checks)"
fi

# ---------- 3. every check that can fail, before anything is written ----------
if (( DO_SYSTEM )); then
  proxy_log "Checking what I would have to overwrite"
  proxy_setup_sudo
  proxy_system_preflight
fi
if (( DO_DOCKER_CONFIG )); then
  proxy_docker_client_check
fi

# ---------- 4. the shell: one delimited block, or a 0600 file it sources ----------
block_body=""
if (( DO_SHELL )); then
  proxy_log "Shell environment ($PROXY_BASHRC)"
  if [[ -n "${PROXY_USERPASS:-}" ]]; then
    if (( DRY_RUN )); then
      proxy_note "would write the exports to $PROXY_CRED_FILE (0600) and source it from the block"
    else
      mkdir -p "$PROXY_CONFIG_DIR"
      (
        umask 077
        {
          printf '# %s — remove with scripts/disable-proxy.sh\n' "$PROXY_FILE_MARKER"
          printf 'export http_proxy=%s https_proxy=%s\n' "$(proxy_quote "$PROXY_URL")" "$(proxy_quote "$PROXY_URL")"
          printf 'export HTTP_PROXY=%s HTTPS_PROXY=%s\n' "$(proxy_quote "$PROXY_URL")" "$(proxy_quote "$PROXY_URL")"
          printf 'export all_proxy=%s ALL_PROXY=%s\n' "$(proxy_quote "$PROXY_URL")" "$(proxy_quote "$PROXY_URL")"
          printf 'export no_proxy=%s NO_PROXY=%s\n' "$(proxy_quote "$PROXY_NO_PROXY")" "$(proxy_quote "$PROXY_NO_PROXY")"
        } >"$PROXY_CRED_FILE"
      )
      chmod 600 "$PROXY_CRED_FILE"
    fi
    block_body='[ -r "$HOME/.config/borobiya/proxy.env" ] && { set -a; . "$HOME/.config/borobiya/proxy.env"; set +a; }'
    proxy_note "credentials are in $PROXY_CRED_FILE with mode 600; ~/.bashrc only sources it"
  else
    block_body="$(
      printf 'export http_proxy=%s https_proxy=%s no_proxy=%s\n' \
        "$(proxy_quote "$PROXY_URL")" "$(proxy_quote "$PROXY_URL")" "$(proxy_quote "$PROXY_NO_PROXY")"
      printf 'export HTTP_PROXY="$http_proxy" HTTPS_PROXY="$https_proxy" NO_PROXY="$no_proxy"\n'
      printf 'export all_proxy="$http_proxy" ALL_PROXY="$https_proxy"\n'
    )"
  fi
  proxy_bashrc_rewrite apply "$block_body" | sed -n 's/^/    /p'
  proxy_note "new terminals get it automatically; this one needs: source ~/.bashrc"
else
  proxy_note "shell block skipped (--no-shell)"
fi

# ---------- 4. Docker's client config: builds *and* the runtime containers compose creates ----------
if (( DO_DOCKER_CONFIG )); then
  proxy_log "Docker client config, applied to builds and to every container compose starts ($PROXY_DOCKER_CONFIG)"
  proxy_docker_client_apply "$PROXY_URL" "$PROXY_NO_PROXY"
else
  proxy_note "skipped (--no-docker-config): the step-12 image build gets no proxy network, so bun install will fail"

fi

# ---------- 5. apt and the daemon ----------
if (( DO_SYSTEM )); then
  proxy_log "apt and the Docker daemon (needs root)"
  proxy_system_apply "$PROXY_URL" "$PROXY_NO_PROXY"
  proxy_reload_docker
else
  proxy_note "system files skipped (--no-system): apt and image pulls stay unproxied"
fi

# ---------- 6. what disable will need to know ----------
{
  printf 'PROXY_URL=%s\n' "$PROXY_URL"
  printf 'PROXY_HOST=%s\n' "$PROXY_HOST"
  printf 'PROXY_PORT=%s\n' "$PROXY_PORT"
  printf 'NO_PROXY=%s\n' "$PROXY_NO_PROXY"
  printf 'ENABLED_AT=%s\n' "$(date -Is)"
  printf 'ENABLED_BY=%s\n' "$(id -un)@$(hostname 2>/dev/null || printf unknown)"
  printf 'APT_FILE=%s\n' "$PROXY_APT_FILE"
  printf 'DOCKERD_DROPIN=%s\n' "$PROXY_DOCKERD_DROPIN"
  printf 'DOCKER_CONFIG=%s\n' "$PROXY_DOCKER_CONFIG"
  printf 'BASHRC=%s\n' "$PROXY_BASHRC"
  if [[ -n "${PROXY_USERPASS:-}" ]]; then printf 'CRED_FILE=%s\n' "$PROXY_CRED_FILE"; fi
  printf 'GIT_COMMIT=%s\n' "$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || printf unknown)"
} | proxy_state_write

proxy_log "Done"
proxy_note "configured: $PROXY_URL_MASKED"
if (( DRY_RUN )); then
  proxy_note "dry run — nothing was written"
fi
if (( DO_SYSTEM )) && (( PROXY_DOCKER_RESTART_SKIPPED )); then
  proxy_note "the daemon drop-in is on disk but dockerd has not reloaded it yet"
fi
proxy_note "prove it on the four things that use it, in a terminal that has sourced ~/.bashrc:"
proxy_note "  curl -sS -o /dev/null --max-time 15 -w 'proxied: %{http_code}\\n' https://download.docker.com/linux/ubuntu/dists/noble/Release"
proxy_note "  curl -v -o /dev/null --max-time 15 https://github.com/ 2>&1 | grep -E -m2 'Uses proxy|Connected to'"
proxy_note "  sudo apt-get update        # then: docker info | grep -i proxy"
proxy_note "the -v line is what proves the *exported* value is live, on any curl: curl has no write-out"
proxy_note "variable for the proxy it used until 8.7.0 (%{proxy_used}), and Ubuntu 24.04 ships 8.5.0. It"
proxy_note "prints http_proxy's full value, so trim it with this instead of pasting it into a log:"
proxy_note "  ... 2>&1 | grep -m1 -oE 'Uses proxy env variable [a-z_]+'"
proxy_note "and run the six checks in docs/UBUNTU_VM_RUNBOOK.md § 5.2 before the big downloads."
proxy_note "undo everything with: scripts/disable-proxy.sh"
