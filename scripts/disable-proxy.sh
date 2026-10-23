#!/usr/bin/env bash
# Borobiya — remove exactly what scripts/enable-proxy.sh configured, and nothing else.
#
# Two rules make this safe to run at any time, including after the machine has been edited by hand:
# a ~/.bashrc block is deleted only between its own begin/end markers (and the script refuses when it
# finds a begin without an end, because guessing would eat the rest of the file), and a root-owned
# proxy file is deleted only if it carries this project's marker line. A file you wrote yourself, or a
# system-wide proxy that predates this repository, is reported as "left alone" instead of removed.
set -euo pipefail

# shellcheck disable=SC2034  # read as the program name by the library sourced below
PROXY_PROG="disable-proxy"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./proxy-common.sh
# shellcheck disable=SC1091  # shellcheck only follows a source line for input files it was given
source "$SCRIPT_DIR/proxy-common.sh"

usage() {
  cat <<'EOF'
Usage: scripts/disable-proxy.sh [options]

Removes the shell block, the apt file, the dockerd drop-in, and the ~/.docker/config.json `proxies`
key that scripts/enable-proxy.sh wrote. Reports anything it refuses to touch because it did not write it.

Options:
  --shell-only        only the ~/.bashrc block and the credential file it sources
  --system-only       only the root-owned files and ~/.docker/config.json
  --keep-docker-config  leave the build-proxy key in place (you configured your own)
  --yes               no confirmation, and no prompt before restarting Docker
  --dry-run           print every removal, make none
  --status            report what is configured right now and exit
  -h, --help          this help

Afterwards: this terminal still holds the old exports — `source ~/.bashrc` in each open terminal, or
close it. The host-side changes runbook § 5.1a describes (the firewall rule, a netsh portproxy) are
outside this VM and are not touched; the same section shows the commands that delete them.
EOF
}

DO_SHELL=1
DO_SYSTEM=1
DO_DOCKER_CONFIG=1
STATUS_ONLY=0

# shellcheck disable=SC2034  # ASSUME_YES and the PROXY_* inputs are consumed by the sourced library
while (( $# > 0 )); do
  case "$1" in
    --shell-only) DO_SYSTEM=0; DO_DOCKER_CONFIG=0; shift ;;
    --system-only) DO_SHELL=0; shift ;;
    --keep-docker-config) DO_DOCKER_CONFIG=0; shift ;;
    --yes) ASSUME_YES=1; shift ;;  # read by the library's proxy_confirm
    --dry-run) DRY_RUN=1; shift ;;
    --status) STATUS_ONLY=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) proxy_fail "unexpected argument: $1 (see --help)" ;;
  esac
done

proxy_setup_io
proxy_status
if (( STATUS_ONLY )); then exit 0; fi

proxy_log "Confirm"
if [[ -n "${http_proxy:-${HTTP_PROXY:-}}" ]]; then
  proxy_note "this terminal still exports $(printf '%s' "${http_proxy:-${HTTP_PROXY}}" | proxy_mask);"
  proxy_note "removal below does not unset it — that is what the final command here is for"
fi
if ! proxy_confirm "remove the configuration listed above?"; then
  proxy_fail "nothing removed. Re-run with --yes, or --dry-run to see the plan without a terminal"
fi

proxy_setup_sudo

proxy_log "Shell"
if (( DO_SHELL )); then
  proxy_bashrc_rewrite remove | sed -n 's/^/    /p'
  if [[ -f "$PROXY_CRED_FILE" ]] && grep -qF -- "$PROXY_FILE_MARKER" "$PROXY_CRED_FILE"; then
    if (( DRY_RUN )); then
      proxy_note "would remove $PROXY_CRED_FILE"
    else
      rm -f "$PROXY_CRED_FILE"
      proxy_note "removed $PROXY_CRED_FILE"
    fi
  fi
else
  proxy_note "skipped (--system-only)"
fi

if (( DO_DOCKER_CONFIG )); then
  proxy_log "Build containers"
  proxy_docker_client_strip
else
  proxy_note "build-proxy key left in place"
fi

proxy_log "apt and the Docker daemon"
if (( DO_SYSTEM )); then
  proxy_system_remove
  proxy_reload_docker
else
  proxy_note "skipped (--shell-only)"
fi

if [[ -f "$PROXY_STATE_FILE" ]]; then
  if (( DRY_RUN )); then
    proxy_note "would remove $PROXY_STATE_FILE"
  else
    rm -f "$PROXY_STATE_FILE"
  fi
fi

proxy_log "Left to do"
proxy_note "in every terminal that still has the old environment:"
proxy_note "  unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY all_proxy ALL_PROXY"
proxy_note "then prove the VM reaches the internet on its own, with no proxy involved:"
proxy_note "  curl --noproxy '*' -sS -o /dev/null -w 'direct: %{http_code}\n' https://github.com/"
proxy_note "  (in this terminal too: the exports are still set until you unset them or open a new shell)"
if (( DO_SYSTEM )); then
  proxy_note "and that the daemon no longer holds the drop-in: systemctl show docker --property=Environment | grep -i proxy"
fi
if [[ -f "$PROXY_DOCKER_BACKUP" ]]; then
  proxy_note "a config.json backup is still at $PROXY_DOCKER_BACKUP (it was kept because a proxies key predated enable-proxy.sh)"
fi
proxy_note "runbook § 5.1a lists the host-side commands (firewall rule, netsh portproxy) this script cannot reach."
