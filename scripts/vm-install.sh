#!/usr/bin/env bash
# Ubuntu 24.04 prerequisites: report first, install only on explicit --install.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ACTION=check
case "${1:---check}" in
  --check) [[ $# -le 1 ]] || { echo 'usage: vm-install.sh [--check|--install|--install-compose]' >&2; exit 2; } ;;
  --install) ACTION=install; [[ $# -eq 1 ]] || { echo 'usage: vm-install.sh [--check|--install|--install-compose]' >&2; exit 2; } ;;
  --install-compose) ACTION=install-compose; [[ $# -eq 1 ]] || { echo 'usage: vm-install.sh [--check|--install|--install-compose]' >&2; exit 2; } ;;
  *) echo 'usage: vm-install.sh [--check|--install|--install-compose]' >&2; exit 2 ;;
esac

as_root() { if (( EUID == 0 )); then "$@"; else sudo "$@"; fi; }
version() { "$@" 2>&1 | head -n 1 || true; }
# Read pinned values as data, not `source .env` (which executes arbitrary shell code).
expected_osmium="$(awk -F= '$1=="MAP_OSMIUM_VERSION" {print $2; exit}' .env 2>/dev/null || true)"
[[ -n "$expected_osmium" ]] || expected_osmium="$(awk -F= '$1=="MAP_OSMIUM_VERSION" {print $2; exit}' .env.example)"
bun_pin="$(python3 -c 'import json; print(json.load(open("package.json"))["packageManager"].split("@")[1])' 2>/dev/null || true)"

check() {
  local bad=0 tool installed label java_major docker_major compose_major python_major python_minor
  printf 'Tool / requirement             Result\n'
  for tool in git curl wget unzip openssl python3 java osmium docker bun; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      printf '%-30s MISSING\n' "$tool"; bad=1; continue
    fi
    case "$tool" in
      python3)
        installed="$(python3 -c 'import sys;print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
        IFS=. read -r python_major python_minor <<< "$installed"
        if (( python_major < 3 || (python_major == 3 && python_minor < 10) )); then label='INCOMPATIBLE (need Python >=3.10)'; bad=1
        else label='OK'; fi ;;
      java)
        installed="$(java -version 2>&1 | awk -F'"' '/version/ {split($2,v,"."); print (v[1]=="1" ? v[2] : v[1]); exit}')"
        java_major="${installed:-0}"
        if ! [[ "$java_major" =~ ^[0-9]+$ ]] || (( java_major < 21 )); then label='INCOMPATIBLE (need Java >=21)'; bad=1
        else label='OK'; fi ;;
      osmium)
        installed="$(osmium --version 2>&1 | awk '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+[.][0-9]+[.][0-9]+$/){print $i; exit}}')"
        if [[ "$installed" != "$expected_osmium" ]]; then label="INCOMPATIBLE (need $expected_osmium)"; bad=1
        else label='OK'; fi ;;
      docker)
        installed="$(docker --version | sed -nE 's/.*version ([0-9]+).*/\1/p')"
        docker_major="${installed:-0}"
        if ! [[ "$docker_major" =~ ^[0-9]+$ ]] || (( docker_major < 24 )); then label='INCOMPATIBLE (need Docker >=24)'; bad=1
        else label='OK'; fi ;;
      bun)
        installed="$(bun --version 2>/dev/null || true)"
        if [[ "$installed" != "$bun_pin" ]]; then label="INCOMPATIBLE (pin $bun_pin)"; bad=1
        else label='OK'; fi ;;
      unzip) installed="$(version unzip -v)"; label='OK' ;;
      openssl) installed="$(openssl version 2>&1)"; label='OK' ;;
      *) installed="$(version "$tool" --version)"; label='OK' ;;
    esac
    printf '%-30s %-34s %s\n' "$tool" "$label" "$installed"
  done
  if command -v docker >/dev/null 2>&1; then
    installed="$(docker compose version --short 2>/dev/null || true)"
    compose_major="${installed#v}"; compose_major="${compose_major%%.*}"
    if ! [[ "$compose_major" =~ ^[0-9]+$ ]] || (( compose_major < 2 )); then
      printf '%-30s INCOMPATIBLE (need Compose plugin v2+)  %s\n' 'docker compose' "${installed:-missing}"; bad=1
    else printf '%-30s OK                                 %s\n' 'docker compose' "$installed"; fi
    if docker info >/dev/null 2>&1; then printf '%-30s OK\n' 'Docker daemon access'
    else printf '%-30s UNAVAILABLE (daemon/group; re-login after group change)\n' 'Docker daemon access'; bad=1; fi
  else
    printf '%-30s MISSING (Docker Engine first)\n' 'docker compose'
    printf '%-30s UNAVAILABLE (Docker Engine first)\n' 'Docker daemon access'
  fi
  for tool in ca-certificates openssh-server; do
    if command -v dpkg-query >/dev/null 2>&1 && dpkg-query -W -f='${Status}' "$tool" 2>/dev/null | grep -q 'install ok installed'; then
      printf '%-30s OK\n' "$tool"
    else printf '%-30s MISSING\n' "$tool"; bad=1; fi
  done
  if (( bad )); then echo 'Repair with --install on Ubuntu 24.04; Docker group changes need a new login.'; return 1; fi
  echo 'Prerequisites OK.'
}

installed_pkg() {
  dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -qx 'install ok installed'
}

install_compose_plugin() {
  local pkg candidate plan
  # Match the existing engine's package family. Never migrate/replace a running
  # Docker installation just because its optional CLI plugin is missing.
  if installed_pkg docker.io && ! installed_pkg docker-ce-cli; then
    pkg=docker-compose-v2  # Ubuntu 24.04 universe
  elif installed_pkg docker-ce-cli && ! installed_pkg docker.io; then
    pkg=docker-compose-plugin  # Docker's official apt repository
  else
    echo 'Cannot identify a single apt-managed Docker CLI (docker.io or docker-ce-cli). Refusing an automatic engine migration; inspect package provenance first.' >&2
    return 1
  fi
  printf 'Install %s ONLY, without removing/upgrading the existing Docker Engine? [y/N] ' "$pkg"
  read -r candidate
  [[ "$candidate" == [yY] ]] || return 1
  # Plain apt-get update can return 0 while printing W: signature errors and
  # reusing stale indexes. Refuse to install from an unverified repository.
  if ! as_root apt-get -o APT::Update::Error-Mode=any update; then
    echo 'APT update failed (check the Docker source signed-by key, repository suite, and proxy); no plugin installed. Never disable signature verification.' >&2
    return 1
  fi
  # Simulate first; apt may upgrade dependencies even with --no-upgrade on
  # the requested package. Refuse any plan that touches the running engine.
  plan="$(as_root apt-get -s install --no-remove --no-upgrade --no-install-recommends "$pkg")"
  printf '%s\n' "$plan"
  if grep -Eq '^(Inst|Remv) (docker-ce|docker-ce-cli|docker.io|containerd.io|containerd|runc)([ :]|$)' <<< "$plan"; then
    echo 'APT would change the running Docker Engine or container runtime. No packages installed; review the plan manually.' >&2
    return 1
  fi
  as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-remove --no-upgrade --no-install-recommends "$pkg"
  docker compose version
}

if [[ "$ACTION" == check ]]; then check; exit $?; fi
[[ -r /etc/os-release ]] || { echo 'Ubuntu 24.04 required' >&2; exit 1; }
# shellcheck disable=SC1091 # Ubuntu's OS metadata is trusted by apt as well.
source /etc/os-release
[[ "${ID:-}" == ubuntu && "${VERSION_ID:-}" == 24.04 ]] || { echo 'Installation is supported only on Ubuntu 24.04.' >&2; exit 1; }
command -v sudo >/dev/null 2>&1 || (( EUID == 0 )) || { echo 'sudo is required' >&2; exit 1; }
if [[ "$ACTION" == install-compose ]]; then
  docker_major="$(docker --version 2>/dev/null | sed -nE 's/.*version ([0-9]+).*/\1/p' || true)"
  [[ "$docker_major" =~ ^[0-9]+$ ]] && (( docker_major >= 24 )) && docker info >/dev/null 2>&1 || {
    echo 'A working Docker Engine >=24 is required for plugin-only installation; run --check.' >&2; exit 1;
  }
  if docker compose version --short >/dev/null 2>&1; then
    echo 'Docker Compose is already installed; run --check to verify its version.'
    exit 0
  fi
  install_compose_plugin
  check
  exit $?
fi
printf 'Installing Ubuntu packages (no dist-upgrade, no automatic uninstall). Continue? [y/N] '
read -r answer
[[ "$answer" == [yY] ]] || exit 0
as_root apt-get -o APT::Update::Error-Mode=any update
as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y openjdk-21-jdk-headless osmium-tool git curl wget unzip ca-certificates openssl python3 openssh-server gnupg
bun_pin="$(python3 -c 'import json; print(json.load(open("package.json"))["packageManager"].split("@")[1])')"
docker_major="$(docker --version 2>/dev/null | sed -nE 's/.*version ([0-9]+).*/\1/p' || true)"
if [[ "$docker_major" =~ ^[0-9]+$ ]] && (( docker_major >= 24 )); then
  if ! docker compose version --short >/dev/null 2>&1; then
    install_compose_plugin
  fi
else
  if installed_pkg docker.io; then
    echo 'Existing docker.io detected. Migrate it deliberately using runbook A2; refusing automatic removal of a running engine.' >&2
    exit 1
  fi
  temp="$(mktemp -d)"
  trap 'rm -rf -- "$temp"' EXIT
  curl -fsSL --retry 3 https://download.docker.com/linux/ubuntu/gpg -o "$temp/docker.asc"
  as_root install -m 0755 -d /etc/apt/keyrings
  as_root install -m 0644 "$temp/docker.asc" /etc/apt/keyrings/borobiya-docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/borobiya-docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$(dpkg --print-architecture)" "$VERSION_CODENAME" | as_root tee /etc/apt/sources.list.d/borobiya-docker.list >/dev/null
  as_root apt-get -o APT::Update::Error-Mode=any update
  as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  as_root systemctl enable --now docker
fi
if [[ "$(bun --version 2>/dev/null || true)" != "$bun_pin" ]]; then
  [[ "$bun_pin" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid Bun pin in package.json' >&2; exit 1; }
  if command -v bun >/dev/null 2>&1; then
    [[ "$(command -v bun)" == /usr/local/bin/bun ]] || {
      echo "An incompatible Bun is already on PATH at $(command -v bun); refusing to override another installation." >&2
      exit 1
    }
    printf 'Replace shared /usr/local/bin/bun with the pinned version %s? [y/N] ' "$bun_pin"
    read -r answer
    [[ "$answer" == [yY] ]] || exit 1
  fi
  case "$(uname -m)" in x86_64) arch=x64 ;; aarch64) arch=aarch64 ;; *) echo 'Bun installer supports x86_64/aarch64 only' >&2; exit 1 ;; esac
  cpu_suffix=''
  if [[ "$arch" == x64 ]] && ! grep -qw avx2 /proc/cpuinfo; then cpu_suffix='-baseline'; fi
  temp="$(mktemp -d)"
  trap 'rm -rf -- "$temp"' EXIT
  asset="bun-linux-${arch}${cpu_suffix}.zip"
  curl -fsSL --retry 3 "https://api.github.com/repos/oven-sh/bun/releases/tags/bun-v${bun_pin}" -o "$temp/release.json"
  digest="$(python3 - "$temp/release.json" "$asset" <<'PY'
import json, re, sys
release = json.load(open(sys.argv[1], encoding="utf-8"))
assets = [item for item in release.get("assets", []) if item.get("name") == sys.argv[2]]
digest = assets[0].get("digest", "") if len(assets) == 1 else ""
if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
    raise SystemExit(f"Release has no verified SHA-256 for {sys.argv[2]}")
print(digest.split(":", 1)[1])
PY
  )"
  curl -fL --retry 3 "https://github.com/oven-sh/bun/releases/download/bun-v${bun_pin}/${asset}" -o "$temp/bun.zip"
  printf '%s  %s\n' "$digest" "$temp/bun.zip" | sha256sum -c -
  unzip -tq "$temp/bun.zip" >/dev/null
  unzip -q "$temp/bun.zip" -d "$temp"
  as_root install -m 0755 "$temp/bun-linux-${arch}${cpu_suffix}/bun" /usr/local/bin/bun
fi
if ! docker info >/dev/null 2>&1 && (( EUID != 0 )); then
  printf 'Grant the current user root-equivalent Docker access? [y/N] '
  read -r answer
  if [[ "$answer" == [yY] ]]; then as_root usermod -aG docker "$(id -un)"; echo 'Log out and back in before launching.'; fi
fi
check
