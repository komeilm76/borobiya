#!/usr/bin/env bash
# Local-only Vite TLS for phone testing; never distribute the CA private key.
set -euo pipefail

usage() {
  cat >&2 <<'HELP'
Usage: scripts/dev-lan.sh {http|https|cert|android-debug} <LAN IPv4 address>
  http           Run API + Vite over HTTP (GPS on a phone's LAN IP will not work).
  https          Run API + Vite with a locally issued certificate for the IP.
  cert           Issue/inspect the certificate without starting the servers.
  android-debug  Bundle the public CA into a generated Android debug APK overlay.

Example: scripts/dev-lan.sh https 172.16.20.70
Requires: openssl, python3, Bun. HTTPS uses Node.js 20.19+ or 22.12+ for Vite HMR;
on Linux x64, Bun installs a private pinned Node 22 if none is available.
The CA is stored outside Git in
${XDG_DATA_HOME:-$HOME/.local/share}/borobiya/dev-tls (override BOROBIYA_DEV_TLS_DIR).
HELP
  exit 2
}

[[ $# -eq 2 ]] || usage
mode="$1"
address="$2"
case "$mode" in http|https|cert|android-debug) ;; *) usage ;; esac
python3 - "$address" <<'PY'
import ipaddress
import sys

try:
    if ipaddress.ip_address(sys.argv[1]).version != 4:
        raise ValueError("IPv4 required")
except ValueError as error:
    sys.exit(f"Invalid LAN IPv4 address: {error}")
PY

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cert_dir="${BOROBIYA_DEV_TLS_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/borobiya/dev-tls}"
ca_cert="$cert_dir/ca.pem"
ca_key="$cert_dir/ca.key"
leaf_cert="$cert_dir/$address.pem"
leaf_key="$cert_dir/$address.key"

node_is_supported() {
  "$1" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || major === 22 && minor >= 12 || major === 20 && minor >= 19 ? 0 : 1)' >/dev/null 2>&1
}

ensure_vite_node() {
  if command -v node >/dev/null && node_is_supported node; then return; fi
  if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
    echo 'HTTPS HMR needs Node.js >=20.19 or >=22.12 on this platform; install it before retrying.' >&2
    exit 1
  fi
  local node_dir="${BOROBIYA_DEV_NODE_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/borobiya/dev-node}"
  local private_node="$node_dir/node_modules/node-linux-x64/bin/node"
  if [[ ! -x "$private_node" ]] || ! node_is_supported "$private_node"; then
    echo 'Node.js is missing/too old; Bun will install pinned Node 22.16.0 for Vite into:' >&2
    echo "  $node_dir (outside the checkout; no sudo or system packages)" >&2
    (umask 077; mkdir -p -- "$node_dir")
    chmod 700 -- "$node_dir"
    [[ -e "$node_dir/package.json" ]] || printf '{"private":true}\n' > "$node_dir/package.json"
    bun add --cwd "$node_dir" --no-save node-linux-x64@22.16.0 || {
      echo 'Could not download private Node from the npm registry. Check the Bun registry/proxy, or install supported Node manually.' >&2
      exit 1
    }
    [[ -x "$private_node" ]] && node_is_supported "$private_node" || {
      echo 'Private Node installation did not produce a supported binary.' >&2; exit 1;
    }
  fi
  export PATH="$node_dir/node_modules/node-linux-x64/bin:$PATH"
  echo "Using private Node.js $(node --version) for Vite HTTPS HMR (system Node unchanged)."
}

issue_certificate() {
  command -v openssl >/dev/null || { echo 'openssl is required for local HTTPS.' >&2; exit 1; }
  (umask 077; mkdir -p -- "$cert_dir")
  chmod 700 -- "$cert_dir"
  if [[ -e "$ca_cert" || -e "$ca_key" ]]; then
    [[ -s "$ca_cert" && -s "$ca_key" ]] || {
      echo "Incomplete development CA at $cert_dir; repair it manually before retrying." >&2; exit 1;
    }
  else
    (umask 077; openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 3650 \
      -keyout "$ca_key" -out "$ca_cert" -subj '/CN=Borobiya local development CA' \
      -addext 'basicConstraints=critical,CA:TRUE,pathlen:0' \
      -addext 'keyUsage=critical,keyCertSign,cRLSign' >/dev/null 2>&1)
  fi
  chmod 600 -- "$ca_key"
  # Reuse a still-valid certificate only if the IP, CA and key still match.
  if [[ ! -s "$leaf_cert" || ! -s "$leaf_key" ]] ||
     ! openssl x509 -in "$leaf_cert" -noout -checkip "$address" -checkend 86400 >/dev/null 2>&1 ||
     ! openssl verify -CAfile "$ca_cert" "$leaf_cert" >/dev/null 2>&1 ||
     [[ "$(openssl x509 -in "$leaf_cert" -pubkey -noout | openssl sha256)" != "$(openssl pkey -in "$leaf_key" -pubout 2>/dev/null | openssl sha256)" ]]; then
    local scratch
    scratch="$(mktemp -d "$cert_dir/.issue-XXXXXXXX")"
    # Keep old credentials intact if OpenSSL fails. Interrupted issuing leaves
    # only a hidden scratch directory, not a partially replaced trust anchor.
    (umask 077
      openssl req -new -newkey rsa:2048 -nodes -keyout "$scratch/server.key" \
        -out "$scratch/server.csr" -subj "/CN=$address" >/dev/null 2>&1
      printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:%s,IP:127.0.0.1,DNS:localhost\n' \
        "$address" > "$scratch/server.ext"
      openssl x509 -req -in "$scratch/server.csr" -CA "$ca_cert" -CAkey "$ca_key" \
        -set_serial "0x$(openssl rand -hex 16)" -out "$scratch/server.pem" \
        -days 365 -sha256 -extfile "$scratch/server.ext" >/dev/null 2>&1
      openssl verify -CAfile "$ca_cert" "$scratch/server.pem" >/dev/null
      openssl x509 -in "$scratch/server.pem" -noout -checkip "$address" >/dev/null
    )
    mv -f -- "$scratch/server.key" "$leaf_key"
    mv -f -- "$scratch/server.pem" "$leaf_cert"
    rm -rf -- "$scratch"
  fi
  chmod 600 -- "$leaf_key" "$leaf_cert"
  openssl x509 -in "$ca_cert" -outform DER -out "$cert_dir/ca.crt"
  chmod 644 -- "$cert_dir/ca.crt"
}

if [[ "$mode" != http ]]; then
  android_root="${BOROBIYA_DEV_ANDROID_DIR:-$repo_root/packages/client/android}"
  if [[ "$mode" == android-debug && ! -f "$android_root/app/src/main/AndroidManifest.xml" ]]; then
    echo 'No generated Android project found. From packages/client, run bunx cap add android first (see docs/WORKFLOWS.md).' >&2
    exit 1
  fi
  issue_certificate
  echo "Phone Chrome trust anchor (public CA only): $cert_dir/ca.crt"
  echo "CA SHA-256 fingerprint: $(openssl x509 -in "$ca_cert" -noout -fingerprint -sha256)"
  echo "Server certificate: $leaf_cert (SAN: $address, 127.0.0.1, localhost)"
  echo "CA private key: $ca_key (DO NOT copy to phone, APK, or Git)"
fi

case "$mode" in
  cert) ;;
  http)
    unset BOROBIYA_DEV_TLS_CERT BOROBIYA_DEV_TLS_KEY
    echo "Starting HTTP at http://$address:5173 (phone GPS requires HTTPS)."
    cd -- "$repo_root"
    exec bun run dev
    ;;
  https)
    echo "Starting HTTPS at https://$address:5173 (trust ca.crt on your phone first)."
    export BOROBIYA_DEV_TLS_CERT="$leaf_cert" BOROBIYA_DEV_TLS_KEY="$leaf_key"
    ensure_vite_node
    cd -- "$repo_root"
    # Bun 1.4.3 can crash inside its ws implementation on Vite's TLS HMR upgrade.
    # Keep Bun for the API and use the supported Node runtime only for Vite.
    exec bun run dev:lan-https
    ;;
  android-debug)
    debug_dir="$android_root/app/src/debug"
    mkdir -p -- "$debug_dir/res/raw" "$debug_dir/res/xml"
    cp -- "$cert_dir/ca.crt" "$debug_dir/res/raw/borobiya_dev_ca.crt"
    cat > "$debug_dir/res/xml/borobiya_dev_network_security_config.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- DEBUG ONLY: trust the local development CA plus normal public roots. -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="@raw/borobiya_dev_ca" />
        </trust-anchors>
    </base-config>
</network-security-config>
XML
    cat > "$debug_dir/AndroidManifest.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:networkSecurityConfig="@xml/borobiya_dev_network_security_config" />
</manifest>
XML
    echo "Android debug overlay: $debug_dir (public CA only; release builds do not include it)."
    echo 'Rebuild/reinstall the debug APK after reissuing the CA. The overlay does not configure Capacitor to use the LAN URL.'
    ;;
esac
