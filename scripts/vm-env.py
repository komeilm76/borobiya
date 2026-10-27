#!/usr/bin/env python3
"""Prepare VM secrets and application mode without rotating existing database credentials."""
from __future__ import annotations

import argparse
import base64
import getpass
import ipaddress
import os
import re
import secrets
import sys
import tempfile
import unicodedata
from urllib.parse import urlsplit

from vm_common import ENV, ROOT, env_values, fail, volume


def origin(raw: str) -> str:
    try:
        parsed = urlsplit(raw)
        hostname, port = parsed.hostname, parsed.port
    except ValueError:
        fail("invalid production HTTPS origin or port")
    labels = hostname.split(".") if hostname else []
    try:
        ipaddress.ip_address(hostname or "")
        is_ip = True
    except ValueError:
        is_ip = False
    if (parsed.scheme != "https" or not hostname or port is not None or is_ip or len(raw) > 300
            or len(labels) < 2 or any(not re.fullmatch(r"[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?", label)
                                    for label in labels)
            or not re.fullmatch(r"[a-zA-Z]{2,63}", labels[-1])
            or labels[-1].lower() in {"example", "invalid", "localhost", "test"}
            or parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query
            or parsed.fragment or "," in raw or any(char.isspace() for char in raw)):
        fail("production requires a real public HTTPS DNS name, without a port (e.g. https://maps.your-domain.org)")
    return f"https://{hostname.lower()}"


def valid_admin(value: str) -> bool:
    return 8 <= len(value.encode("utf-16-le")) // 2 <= 1024 and any(
        unicodedata.category(c).startswith("L") for c in value
    ) and any(c.isdecimal() for c in value)


def update_env(changes: dict[str, str]) -> None:
    if ENV.is_symlink():
        fail("refusing symlinked .env")
    if ENV.exists():
        content = ENV.read_text(encoding="utf-8")
    else:
        content = (ROOT / ".env.example").read_text(encoding="utf-8")
    lines = content.splitlines(keepends=True)
    if lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n"
    for key, value in changes.items():
        if "\n" in value or "\r" in value:
            fail("newline is forbidden in environment values")
        positions = [i for i, line in enumerate(lines) if line.startswith(key + "=")]
        if len(positions) > 1:
            fail(f"duplicate {key} assignments in .env; resolve manually")
        if positions:
            lines[positions[0]] = f"{key}={value}\n"
        else:
            lines.append(f"{key}={value}\n")
    fd, name = tempfile.mkstemp(prefix=".env-vm-", dir=ROOT)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as out:
            out.writelines(lines)
            out.flush()
            os.fsync(out.fileno())
        os.replace(name, ENV)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("development", "production"), help="application mode")
    parser.add_argument("--origin", help="public HTTPS DNS origin required in production; Caddy obtains TLS")
    parser.add_argument("--generate-admin", action="store_true", help="generate admin password instead of prompting")
    args = parser.parse_args()
    current = env_values()
    # Before asking for a mode or password, verify any existing DB volumes. A
    # Docker permission failure must not send the operator through prompts that
    # cannot finish or tempt them to regenerate passwords over populated data.
    credentials = {
        "POSTGRES_PASSWORD": "postgres-data",
        "NOMINATIM_PASSWORD": "nominatim-data",
    }
    missing = {key: vol for key, vol in credentials.items()
               if not current.get(key) or current[key].startswith("replace-") or current[key] == "change-me"}
    existing_volumes = {vol: volume(vol) for vol in missing.values()}
    for key, vol in missing.items():
        if existing_volumes[vol]:
            fail(f"{vol} already exists: cannot replace {key} in .env without the actual volume password")
    saved_mode = current.get("NODE_ENV", "development")
    mode = args.mode
    if not mode:
        if not sys.stdin.isatty():
            fail("pass --mode development or --mode production in noninteractive use")
        mode = input(f"Mode [development/production] ({saved_mode}): ").strip() or saved_mode
    if mode not in ("development", "production"):
        fail("invalid mode")
    public_origin = args.origin
    if mode == "production":
        saved_origin = current.get("CORS_ORIGINS", "") if saved_mode == "production" else ""
        if not public_origin:
            if sys.stdin.isatty():
                public_origin = input(f"Public HTTPS origin [{saved_origin or 'required'}]: ").strip() or saved_origin
            else:
                public_origin = saved_origin
        if not public_origin:
            fail("production requires --origin https://your-public-dns-name for Caddy/ACME")
        public_origin = origin(public_origin)
    elif public_origin:
        fail("--origin is for production only")

    changes: dict[str, str] = {"NODE_ENV": mode}
    if public_origin:
        changes["CORS_ORIGINS"] = public_origin
        changes["PUBLIC_DOMAIN"] = urlsplit(public_origin).hostname or ""
    elif saved_mode == "production":
        # An unchanged HTTPS-only allowlist rejects the development browser's
        # Origin (including SSH-tunneled HMR), even on the same VM.
        dev_origins = ["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"]
        port = current.get("NGINX_PORT", "8080")
        if port.isdigit() and 1 <= int(port) <= 65535 and port != "8080":
            dev_origins.append(f"http://localhost:{port}")
        changes["CORS_ORIGINS"] = ",".join(dev_origins)
        changes["PUBLIC_DOMAIN"] = ""
    for key in missing:
        changes[key] = secrets.token_hex(24)
    for key in ("JWT_SECRET", "JWT_REFRESH_SECRET"):
        old = current.get(key, "")
        if not old or old.startswith("replace-this"):
            changes[key] = secrets.token_hex(32)
    if changes.get("JWT_SECRET", current.get("JWT_SECRET")) == changes.get(
        "JWT_REFRESH_SECRET", current.get("JWT_REFRESH_SECRET")
    ):
        fail("JWT secrets must differ; fix .env manually")
    if "POSTGRES_PASSWORD" in changes:
        username = current.get("POSTGRES_USER") or "borobiya"
        database = current.get("POSTGRES_DB") or "borobiya"
        if not re.fullmatch(r"[a-zA-Z0-9_]+", username) or not re.fullmatch(r"[a-zA-Z0-9_]+", database):
            fail("invalid POSTGRES_USER or POSTGRES_DB; configure them explicitly before generating a URL")
        port = current.get("POSTGRES_PORT") or "5432"
        if not port.isdigit() or not 1 <= int(port) <= 65535:
            fail("POSTGRES_PORT must be a TCP port before generating DATABASE_URL")
        changes["DATABASE_URL"] = f"postgresql://{username}:{changes['POSTGRES_PASSWORD']}@localhost:{port}/{database}"
    if not current.get("ADMIN_SEED_PASSWORD_B64"):
        admin = ""
        if not args.generate_admin:
            if not sys.stdin.isatty():
                fail("admin password needs a terminal; use --generate-admin for noninteractive setup")
            admin = getpass.getpass("Initial admin password (Enter to generate): ")
        if not admin:
            if sys.stdin.isatty() and not sys.stdout.isatty():
                fail("cannot safely show generated password with redirected output; use an interactive terminal")
            admin = "Admin-" + secrets.token_hex(16)
            if sys.stdout.isatty():
                print(f"Generated admin password (save it now): {admin}")
            else:
                print("Generated admin password saved in .env as ADMIN_SEED_PASSWORD_B64 (base64 is NOT encryption).")
        if not valid_admin(admin):
            fail("admin password needs 8–1024 UTF-16 characters, a Unicode letter and a decimal digit")
        changes["ADMIN_SEED_PASSWORD_B64"] = base64.b64encode(admin.encode("utf-8")).decode("ascii")
    # Recheck immediately before writing: prompts can take minutes, during which
    # another setup may initialize a volume with a different password.
    for key, vol in missing.items():
        if volume(vol):
            fail(f"{vol} appeared during setup: refusing to replace {key} without its volume password")
    update_env(changes)
    print(f"Prepared .env (mode {mode}, permission 0600); existing credentials were not rotated.")
    if mode == "production":
        print("Production edge will use Caddy/ACME. Point public DNS at this VM and allow TCP 80/443 before launch.")


if __name__ == "__main__":
    main()
