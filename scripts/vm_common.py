"""Small, non-shell-evaluating helpers shared by Ubuntu VM operator commands."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = ROOT / ".env"
MAP_CONFIG = ROOT / ".vm-map.json"
PROFILES = ["--profile", "routing", "--profile", "geocoding"]


def fail(message: str) -> None:
    raise SystemExit(f"vm: {message}")


def env_values() -> dict[str, str]:
    if ENV.is_symlink():
        fail(".env is a symlink; refusing to read or write secrets through it")
    if not ENV.exists():
        return {}
    result: dict[str, str] = {}
    for line in ENV.read_text(encoding="utf-8").splitlines():
        if line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            result[key] = value.strip().strip('"\'')
    return result


def run(args: list[str], *, capture: bool = False, **kwargs: object) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=ROOT, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None, **kwargs)


def compose(*args: str, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return run(["docker", "compose", *PROFILES, *args], capture=capture)


def project() -> str:
    """Identify the owning project without guessing when Docker/Compose is broken."""
    try:
        output = run(["docker", "compose", "config", "--format", "json"],
                     capture=True, stderr=subprocess.PIPE).stdout
    except (OSError, subprocess.CalledProcessError):
        # Do not print Compose stderr or a rendered config: they can contain .env secrets.
        def works(args: list[str]) -> bool:
            try:
                run(args, capture=True, stderr=subprocess.PIPE)
                return True
            except (OSError, subprocess.CalledProcessError):
                return False

        if not works(["docker", "compose", "version", "--short"]):
            fail("Docker Compose v2 is missing or not working; run ./scripts/vm-install.sh --check")
        if not works(["docker", "info"]):
            fail("Docker daemon is inaccessible; run ./scripts/vm-install.sh --check, "
                 "then verify docker info (re-login after docker group changes)")
        if works(["docker", "compose", "config", "--quiet"]):
            fail("Docker Compose accepts the configuration but cannot produce JSON; "
                 "upgrade the Compose v2 plugin and rerun --check")
        fail("Docker Compose configuration is invalid or unsupported; inspect "
             "docker compose config --quiet LOCALLY (never share rendered config or .env)")
    try:
        name = json.loads(output)["name"]
    except (ValueError, KeyError, TypeError):
        fail("Docker Compose returned no valid project name in JSON; update Compose v2")
    if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", name):
        fail("invalid Compose project name")
    return name


def volume(name: str) -> str | None:
    if name not in ("postgres-data", "nominatim-data", "borobiya-uploads", "caddy-data", "caddy-config"):
        fail("unrecognized managed volume")
    owner = project()
    try:
        items = run(["docker", "volume", "ls", "-q", "--filter", f"label=com.docker.compose.project={owner}",
                     "--filter", f"label=com.docker.compose.volume={name}"],
                    capture=True, stderr=subprocess.PIPE).stdout.splitlines()
    except (OSError, subprocess.CalledProcessError) as error:
        fail(f"cannot verify this project's {name} volume ({error}); nothing deleted")
    if len(items) > 1 or any(not re.fullmatch(r"[a-zA-Z0-9_.-]+", item) for item in items):
        fail(f"ambiguous {name} volumes for project {owner}; nothing deleted")
    return items[0] if items else None


def confirm(phrase: str, *, yes: bool = False) -> None:
    # Never accept --yes for data loss: explicit interactive confirmation cannot be smuggled
    # through a CI variable, copy/pasted command, or an unexpected prompt default.
    if yes:
        fail("--yes is not accepted for destructive operations; use an interactive terminal")
    if not sys.stdin.isatty():
        fail("destructive operation needs an interactive terminal; nothing changed")
    if input(f"Type {phrase} to continue: ") != phrase:
        fail("confirmation did not match; nothing changed")


def configured_map() -> dict[str, str]:
    if MAP_CONFIG.is_symlink() or not MAP_CONFIG.is_file():
        fail("map selection missing or symlinked; run scripts/vm-map.py first")
    try:
        value = json.loads(MAP_CONFIG.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        fail(f"invalid map selection: {error}")
    if not isinstance(value, dict) or set(value) != {"regions", "snapshot", "policy", "library"} or any(
        not isinstance(v, str) for v in value.values()
    ):
        fail("invalid map selection; rerun scripts/vm-map.py")
    return value
