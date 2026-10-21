#!/usr/bin/env python3
"""Safely clear Borobiya map-data caches, with a dry-run default."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class CacheTarget:
    label: str
    path: Path
    boundary: Path


def fail(message: str) -> None:
    raise SystemExit(f"clear-map-cache: {message}")


def parse_dotenv_value(path: Path, key: str) -> str:
    """Read one literal .env value without executing the file as shell code."""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return ""
    result = ""
    for line in lines:
        if line.startswith(f"{key}="):
            result = line.split("=", 1)[1].strip()
    if len(result) >= 2 and result[0] == result[-1] and result[0] in ("'", '"'):
        result = result[1:-1]
    return result


def resolve_library_path(raw_value: str, repo_root: Path) -> Path:
    raw = Path(raw_value).expanduser()
    if not raw.is_absolute():
        raw = repo_root / raw

    # Do not silently follow a configured symlink into an unrelated directory.
    root = Path(raw.anchor)
    for part in raw.parts[1:]:
        if part == "..":
            root = root.parent
            continue
        if part in ("", "."):
            continue
        root = root / part
        if root.is_symlink():
            fail(f"refusing a symlink in MAP_LIBRARY_DIR: {root}")
    root = root.resolve()
    if root == Path(root.anchor):
        fail("refusing to clear a filesystem root as MAP_LIBRARY_DIR")
    try:
        root.relative_to(repo_root)
    except ValueError:
        return root
    fail(f"refusing to clear a map library inside the repository checkout: {root}")


def configured_library_path(argument: str | None) -> Path:
    value = argument or os.environ.get("MAP_LIBRARY_DIR", "")
    if not value:
        value = parse_dotenv_value(REPO_ROOT / ".env", "MAP_LIBRARY_DIR")
    if not value:
        xdg = os.environ.get("XDG_DATA_HOME", "")
        home = os.environ.get("HOME", "")
        if xdg:
            if not Path(xdg).is_absolute():
                fail("XDG_DATA_HOME must be absolute; set MAP_LIBRARY_DIR explicitly")
            value = str(Path(xdg) / "borobiya" / "map-library")
        elif home and Path(home).is_absolute():
            value = str(Path(home) / ".local/share/borobiya/map-library")
        else:
            fail("cannot derive the default library; set MAP_LIBRARY_DIR or pass --library")
    return resolve_library_path(value, REPO_ROOT)


def is_present(path: Path) -> bool:
    return path.exists() or path.is_symlink()


def validate_components(path: Path, boundary: Path) -> None:
    """Require a lexical child of boundary and reject symlinks in its path."""
    if boundary.is_symlink():
        raise RuntimeError(f"refusing to clear through symlink boundary: {boundary}")
    try:
        relative = path.relative_to(boundary)
    except ValueError as error:
        raise RuntimeError(f"cleanup path escaped its allowed root: {path}") from error
    current = boundary
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise RuntimeError(f"refusing to clear through symlink: {current}")


def build_cache_plan(library_root: Path, repo_root: Path) -> list[CacheTarget]:
    library_targets = [
        CacheTarget("library sources", library_root / "sources", library_root),
        CacheTarget("library crops", library_root / "crops", library_root),
        CacheTarget(
            "library generated datasets (PBF, PMTiles, OSRM, Photon)",
            library_root / "datasets",
            library_root,
        ),
        CacheTarget(
            "unconfigured Compose placeholders",
            library_root / ".compose-unconfigured",
            library_root,
        ),
        CacheTarget("active library pointer", library_root / "current.json", library_root),
    ]
    markers = [
        library_root / name
        for name in ("current.json", "sources", "crops", "datasets", ".compose-unconfigured")
    ]
    if library_root.exists() and not any(is_present(path) for path in markers):
        print(
            "The configured library has no Borobiya cache markers; "
            "preserving it and its unknown contents."
        )
        library_targets = []

    legacy_targets = [
        CacheTarget(
            "legacy project-local sources",
            repo_root / "map-server/data/source",
            repo_root,
        ),
        CacheTarget(
            "legacy project-local crops",
            repo_root / "map-server/data/crops",
            repo_root,
        ),
        CacheTarget(
            "legacy project-local OSRM data",
            repo_root / "map-server/osrm/data",
            repo_root,
        ),
        CacheTarget(
            "legacy project-local Photon data",
            repo_root / "map-server/photon/data",
            repo_root,
        ),
    ]
    # These are known generated map artifacts. In particular, do not remove
    # map-server/data itself: older checkouts may keep a Planetiler tool JAR there.
    for dataset in ("tehran", "borobiya"):
        for suffix in ("osm.pbf", "source.json", "pmtiles", "metadata.json"):
            legacy_targets.append(
                CacheTarget(
                    f"legacy {dataset} {suffix}",
                    repo_root / "map-server/data" / f"{dataset}.{suffix}",
                    repo_root,
                )
            )

    plan: list[CacheTarget] = []
    for target in library_targets + legacy_targets:
        validate_components(target.path, target.boundary)
        if not is_present(target.path):
            continue
        if target.path.is_symlink():
            fail(f"refusing to remove symlinked cache target: {target.path}")
        plan.append(target)
    return plan


def compose_project_name() -> str:
    result = subprocess.run(
        ["docker", "compose", "config", "--format", "json"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    project = json.loads(result.stdout).get("name", "")
    if not isinstance(project, str) or not project:
        fail("Compose returned an empty project name; refusing to remove a volume")
    return project


def project_nominatim_volume() -> tuple[str, str]:
    project = compose_project_name()
    result = subprocess.run(
        [
            "docker",
            "volume",
            "ls",
            "-q",
            "--filter",
            f"label=com.docker.compose.project={project}",
            "--filter",
            "label=com.docker.compose.volume=nominatim-data",
        ],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    candidates = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if len(candidates) > 1:
        fail(
            "multiple project-scoped Nominatim volumes found "
            f"({', '.join(candidates)}); inspect and remove the exact volume manually"
        )
    return project, candidates[0] if candidates else ""


def run_docker(args: list[str]) -> None:
    subprocess.run(args, cwd=REPO_ROOT, check=True)


def stop_map_services(*, remove_nominatim_volume: str = "") -> None:
    docker_available = shutil.which("docker") is not None
    if not docker_available:
        if remove_nominatim_volume:
            fail("Docker is unavailable; cannot remove the requested Nominatim volume")
        print("Warning: Docker is unavailable; ensure no map containers are using these paths.")
        return

    info = subprocess.run(
        ["docker", "info"],
        cwd=REPO_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if info.returncode != 0:
        if remove_nominatim_volume:
            fail("Docker daemon is unavailable; no map files or volume were changed")
        print("Warning: Docker daemon is unavailable; ensure no map containers are using these paths.")
        return

    run_docker(
        [
            "docker",
            "compose",
            "--profile",
            "routing",
            "--profile",
            "geocoding",
            "stop",
            "map-server",
            "routing-gateway",
            "osrm-car",
            "osrm-bicycle",
            "osrm-foot",
            "photon",
        ]
    )
    run_docker(
        ["docker", "compose", "--profile", "geocoding-import", "stop", "nominatim"]
    )
    if remove_nominatim_volume:
        run_docker(
            ["docker", "compose", "--profile", "geocoding-import", "rm", "-f", "nominatim"]
        )
        run_docker(["docker", "volume", "rm", remove_nominatim_volume])


def apply_cache_plan(plan: list[CacheTarget]) -> None:
    # Revalidate the full plan before the first deletion. shutil.rmtree removes
    # nested symlinks as links and never follows their targets.
    for target in plan:
        validate_components(target.path, target.boundary)
        if target.path.is_symlink():
            fail(f"refusing to remove symlinked cache target: {target.path}")

    for target in plan:
        if not is_present(target.path):
            continue
        if target.path.is_dir():
            shutil.rmtree(target.path)
        else:
            target.path.unlink()
        print(f"  removed {target.label}: {target.path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Safely clear Borobiya map-data caches (dry-run by default).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "The application Postgres volume, Docker images/build cache, OS packages, "
            "Java/Osmium, tool JARs, and .env are preserved. Use "
            "--include-nominatim-volume only if its database can be rebuilt."
        ),
    )
    parser.add_argument("--library", help="override MAP_LIBRARY_DIR for this operation")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--dry-run", action="store_true", help="print the plan only (default)")
    action.add_argument("--apply", action="store_true", help="apply after typing CLEAR")
    action.add_argument("--yes", action="store_true", help="apply without a prompt")
    parser.add_argument(
        "--include-nominatim-volume",
        action="store_true",
        help="also remove this Compose project's Nominatim DB volume",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    library_root = configured_library_path(args.library)
    print(f"Map-library root: {library_root}")

    volume_project = ""
    nominatim_volume = ""
    if args.include_nominatim_volume:
        if shutil.which("docker") is None:
            fail("--include-nominatim-volume requires Docker Compose")
        info = subprocess.run(
            ["docker", "info"],
            cwd=REPO_ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if info.returncode != 0:
            fail("Docker daemon is not reachable; cannot identify the Compose volume safely")
        try:
            volume_project, nominatim_volume = project_nominatim_volume()
        except (subprocess.CalledProcessError, json.JSONDecodeError) as error:
            fail(f"could not identify this project's Nominatim volume safely: {error}")
        if nominatim_volume:
            print(
                f"Nominatim volume included: {nominatim_volume} "
                f"(Compose project {volume_project})"
            )
        else:
            print(f"No project-scoped nominatim-data volume found for {volume_project}.")

    try:
        plan = build_cache_plan(library_root, REPO_ROOT)
    except (OSError, RuntimeError) as error:
        fail(str(error))

    if plan:
        print("Map cache targets:")
        for target in plan:
            print(f"  {'would remove' if not (args.apply or args.yes) else 'remove'} {target.label}: {target.path}")
    else:
        print("No map cache files or directories were found in the managed locations.")

    if not args.apply and not args.yes:
        print("Dry-run only. Re-run with --apply (prompted) or --yes to remove these map-data caches.")
        if not args.include_nominatim_volume:
            print("The Nominatim Docker volume and Docker image/build caches are preserved.")
        return 0
    if not plan and not nominatim_volume:
        print("Nothing to clear; no services were stopped.")
        return 0

    if args.apply:
        if not sys.stdin.isatty():
            fail("--apply needs an interactive terminal; use --yes only when the displayed plan is correct")
        scope = "the listed map caches"
        if args.include_nominatim_volume and nominatim_volume:
            scope += " and the Nominatim database volume"
        try:
            confirmation = input(f"Type CLEAR to remove {scope}: ")
        except EOFError:
            fail("confirmation input closed; no data was removed")
        if confirmation != "CLEAR":
            print("Cancelled; no caches removed.")
            return 0

    try:
        stop_map_services(
            remove_nominatim_volume=(nominatim_volume if args.include_nominatim_volume else "")
        )
    except (OSError, subprocess.CalledProcessError) as error:
        fail(f"could not stop map services safely; map cache files were not changed: {error}")
    try:
        apply_cache_plan(plan)
    except (OSError, RuntimeError) as error:
        fail(
            "cleanup encountered a filesystem error: "
            f"{error}; some cache targets may already have been removed, inspect before retrying"
        )
    if args.include_nominatim_volume and not nominatim_volume:
        print("No Nominatim volume existed to remove.")
    print("Map cache cleanup complete. .env, application Postgres, Docker images/build cache, and tool JARs were preserved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
