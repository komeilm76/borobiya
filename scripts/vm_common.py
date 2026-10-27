"""Small, non-shell-evaluating helpers shared by Ubuntu VM operator commands."""
from __future__ import annotations

import grp
import json
import os
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


def docker_access_hint() -> str:
    """Diagnose daemon access without printing Docker/Compose output or changing permissions."""
    socket = Path("/var/run/docker.sock")
    if not (os.environ.get("DOCKER_HOST") or os.environ.get("DOCKER_CONTEXT")):
        try:
            if (os.geteuid() != 0 and socket.is_socket()
                    and grp.getgrgid(socket.stat().st_gid).gr_name == "docker"
                    and socket.stat().st_gid not in {os.getegid(), *os.getgroups()}):
                return ("this login cannot access the Docker socket. For a trusted VM user, run "
                        "./scripts/vm-install.sh --enable-docker-access (explicit root-equivalent grant), "
                        "then reconnect SSH or run 'newgrp docker' in your terminal; rerun this command "
                        "in that new shell. Never run vm-env.py with sudo")
        except (OSError, KeyError):
            pass
    return ("Docker daemon is inaccessible; run docker info locally and ./scripts/vm-install.sh --check. "
            "If your group was just changed, reconnect SSH or run 'newgrp docker' in your terminal")


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
            fail("Docker Compose plugin v2+ is missing or not working; run ./scripts/vm-install.sh --check "
                 "and --install-compose if Docker Engine already works")
        if not works(["docker", "info"]):
            fail(docker_access_hint())
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
    except (OSError, subprocess.CalledProcessError):
        try:
            run(["docker", "info"], capture=True, stderr=subprocess.PIPE)
        except (OSError, subprocess.CalledProcessError):
            fail(f"cannot check this project's {name} volume: {docker_access_hint()}; nothing changed")
        fail(f"Docker is reachable but cannot list this project's {name} volume. "
             "Run docker volume ls locally to inspect the error; nothing changed")
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
