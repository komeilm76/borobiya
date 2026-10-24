#!/usr/bin/env python3
"""Run, diagnose and maintain the Ubuntu VM without global Docker prune or implicit data loss."""
from __future__ import annotations

import argparse
import base64
import getpass
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener

from vm_common import (
    PROFILES,
    ROOT,
    compose,
    configured_map,
    confirm,
    env_values,
    fail,
    run,
    volume,
)

OVERRIDE = ["-f", "docker-compose.yml", "-f", "docker-compose.vm.yml",
            "-f", "docker-compose.production.yml"]


def vm_compose_args(*, all_profiles: bool = False) -> list[str]:
    profiles = [*PROFILES]
    if all_profiles:
        # The import service is intentionally excluded from `up`, but `down` must
        # also stop an import interrupted halfway through an earlier build.
        profiles.extend(["--profile", "geocoding-import"])
    if all_profiles or env_values().get("NODE_ENV") == "production":
        profiles.extend(["--profile", "production"])
    return ["docker", "compose", *OVERRIDE, *profiles]


def vm_compose(*args: str) -> None:
    run([*vm_compose_args(all_profiles=args[:1] == ("down",)), *args])


def stop_inactive_edge() -> None:
    """Never leave the old public production listener running in development mode."""
    command = vm_compose_args(all_profiles=True)
    existing = run([*command, "ps", "-a", "-q", "edge"], capture=True, stderr=subprocess.PIPE).stdout.strip()
    if existing:
        run([*command, "stop", "edge"])
        run([*command, "rm", "-f", "edge"])


def require_env() -> dict[str, str]:
    values = env_values()
    for key in ("POSTGRES_PASSWORD", "NOMINATIM_PASSWORD", "JWT_SECRET", "JWT_REFRESH_SECRET"):
        if not values.get(key) or values[key].startswith(("replace-", "change-me")):
            fail(f"{key} is not configured; run scripts/vm-env.py")
    if min(len(values["JWT_SECRET"]), len(values["JWT_REFRESH_SECRET"])) < 32:
        fail("JWT secrets must contain at least 32 characters; rerun vm-env.py")
    if values["JWT_SECRET"] == values["JWT_REFRESH_SECRET"]:
        fail("JWT secrets must differ")
    if values.get("NODE_ENV") == "production":
        domain = values.get("PUBLIC_DOMAIN", "")
        if not re.fullmatch(r"[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+", domain) or \
                values.get("CORS_ORIGINS") != f"https://{domain}":
            fail("production requires PUBLIC_DOMAIN and exactly matching HTTPS CORS_ORIGINS; rerun vm-env.py")
    return values


def static_ready() -> bool:
    dist = ROOT / "packages/client/dist"
    return (dist / "index.html").is_file() and (dist / "maplibre-gl-worker.mjs").is_file()


def verify_serving_artifacts(env: dict[str, str], config: dict[str, str]) -> None:
    if env.get("MAP_REGION_IDS") != config["regions"] or env.get("MAP_LIBRARY_DIR") != config["library"]:
        fail("saved map selection differs from active .env; run launch (build) or restore the previous selection")
    library = Path(config["library"])
    dataset = Path(env.get("MAP_DATASET_DIR", ""))
    if not library.is_absolute() or not dataset.is_absolute() or not dataset.is_dir():
        fail("active map dataset is missing; run launch while online first")
    try:
        dataset.relative_to(library / "datasets")
    except ValueError:
        fail("MAP_DATASET_DIR is outside the configured map library")
    expected = {"MAP_DATA_DIR": dataset, "MAP_OSRM_DATA_DIR": dataset / "routing",
                "MAP_PHOTON_DATA_DIR": dataset / "geocoding"}
    for key, path in expected.items():
        if env.get(key) != str(path) or not path.is_dir():
            fail(f"{key} does not point to the prepared dataset")
    try:
        pointer = json.loads((library / "current.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        fail(f"active map-library pointer missing or invalid: {error}")
    if (pointer.get("areas") != config["regions"].split(",") or pointer.get("datasetDir") != str(dataset)
            or pointer.get("snapshotDate") != env.get("MAP_SNAPSHOT_DATE")):
        fail("active map pointer, snapshot and .env disagree; rerun full launch")
    slug = env.get("MAP_REGION", "borobiya")
    files = [dataset / f"{slug}.pmtiles", dataset / f"{slug}.osm.pbf",
             dataset / f"{slug}.source.json",
             *(dataset / "routing" / profile / f"{slug}.osrm" for profile in ("car", "bicycle", "foot"))]
    if any(not path.is_file() or path.stat().st_size == 0 for path in files):
        fail("map tiles/PBF/routing graphs are incomplete; run full launch before offline relaunch")
    photon = dataset / "geocoding/photon_data"
    if not photon.is_dir() or not any(photon.iterdir()):
        fail("Photon index is missing; run full launch before offline relaunch")
    if not static_ready():
        fail("built web client missing; run launch while online once before --serve-only")


def launch(args: argparse.Namespace) -> None:
    env = require_env()
    config = configured_map()
    if env.get("NODE_ENV") != "production":
        stop_inactive_edge()
    if args.serve_only:
        verify_serving_artifacts(env, config)
        # Nominatim is import-only (geocoding-import profile is NOT enabled here).
        # Photon serves its already-built index without the rebuildable import DB.
        required_volumes = ["postgres-data", "borobiya-uploads"]
        if env.get("NODE_ENV") == "production":
            required_volumes += ["caddy-data", "caddy-config"]
        for name in required_volumes:
            if not volume(name):
                fail(f"{name} volume is missing; refusing fresh data/cert state in --serve-only mode")
        print("Starting prebuilt images and cached dataset only (no image pulls or builds).")
        vm_compose("up", "-d", "--no-build", "--pull", "never")
    else:
        if config["policy"] == "offline" or args.offline:
            if not static_ready():
                fail("offline map builds cannot download a missing browser build; build once online first")
        command = [str(ROOT / "scripts/setup-ubuntu-vm.sh"), "--yes", "--regions", config["regions"],
                   "--snapshot", config["snapshot"], "--source-policy",
                   "offline" if args.offline else config["policy"], "--map-library", config["library"]]
        print("Setup verifies the map artifacts and database before enabling the gateway; this may take hours.", flush=True)
        run(command)
        if not args.offline and config["policy"] != "offline":
            # Vite reads the resolved MAP_* values written by setup. Keep the bundle and active map in sync.
            run(["bun", "install", "--frozen-lockfile"])
            run(["bun", "--filter", "@borobiya/client", "build"])
        verify_serving_artifacts(env_values(), config)
        services = ["nginx"]
        if env.get("NODE_ENV") == "production":
            services.append("edge")
        options = ["up", "-d", "--no-build", "--force-recreate"]
        if args.offline or config["policy"] == "offline":
            options += ["--pull", "never"]
        vm_compose(*options, *services)
    port = env.get("NGINX_PORT", "8080")
    if env.get("NODE_ENV") == "production":
        print(f"Browser: https://{env['PUBLIC_DOMAIN']}/ (DNS and TCP 80/443 required; verify ACME in doctor).")
    else:
        print(f"Browser: http://localhost:{port}/ (SSH tunnel for remote development).")
        print("Optional HMR: bun --filter @borobiya/client dev (browse port 5173 via SSH tunnel).")
    print("Check: scripts/vm.py doctor")


def backup(output: str) -> Path:
    if not volume("postgres-data"):
        fail("no application database volume exists; nothing to back up")
    target = Path(output).expanduser().absolute()
    if target.exists() or target.is_symlink() or not target.parent.is_dir():
        fail("backup destination must be a NEW file in an existing directory")
    if not compose("ps", "-q", "postgres", capture=True).stdout.strip():
        fail("start the database first (docker compose up -d postgres) before backing up")
    fd, temp = tempfile.mkstemp(prefix=".borobiya-pgdump-", suffix=".dump", dir=target.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as out:
            process = subprocess.run(
                ["docker", "compose", *PROFILES, "exec", "-T", "postgres", "sh", "-ec",
                 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl'],
                cwd=ROOT, stdout=out, check=False,
            )
            out.flush()
            os.fsync(out.fileno())
        with open(temp, "rb") as archive:
            valid_archive = archive.read(5) == b"PGDMP" and Path(temp).stat().st_size > 5
        if process.returncode or not valid_archive:
            fail("pg_dump failed or produced no valid custom-format archive; existing data untouched")
        # The destination must remain NEW even if another process creates it
        # during the dump. A rename/replace would silently overwrite that file.
        os.link(temp, target)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    print(f"Database backup: {target} (PostgreSQL custom format, mode 0600). Keep it off this VM too.")
    print("Restore on a disposable database with pg_restore --no-owner --no-acl; this script never restores into a live volume.")
    return target


def remove_volumes(names: list[str]) -> None:
    # Discover and verify labels before any deletion. Never use `down -v` or a global prune.
    targets = {name: volume(name) for name in names}
    for name, identifier in targets.items():
        if identifier:
            print(f"Removing project-scoped {name}: {identifier}")
            run(["docker", "volume", "rm", identifier])


def stop(clear_db: bool, backup_path: str | None, no_backup: bool) -> None:
    if clear_db:
        db_volume = volume("postgres-data")
        if db_volume and not sys.stdin.isatty():
            fail("database deletion requires an interactive terminal; nothing changed")
        if db_volume and not backup_path and not no_backup:
            fail("database exists: supply --backup /safe/location.dump (recommended) or --no-backup")
        if db_volume and backup_path:
            backup(backup_path)
        if db_volume:
            print(f"Will delete ONLY this Compose project's application DB volume: {db_volume}")
            confirm("DELETE DATABASE")
    vm_compose("down")
    if clear_db:
        remove_volumes(["postgres-data"])
    print("Stopped. Photos, Nominatim and map data preserved." if not clear_db else
          "Stopped; application database removed. Photos, Nominatim and map data preserved.")


def destroy(backup_path: str | None, no_backup: bool) -> None:
    if not sys.stdin.isatty():
        fail("destruction requires an interactive terminal; nothing changed")
    db = volume("postgres-data")
    uploads = volume("borobiya-uploads")
    geo = volume("nominatim-data")
    certs = volume("caddy-data")
    edge_config = volume("caddy-config")
    if db and not backup_path and not no_backup:
        fail("database exists: supply --backup /safe/location.dump or --no-backup")
    if db and backup_path:
        backup(backup_path)
    print("Will remove ONLY this Compose project's application DB, SOS photos, Nominatim DB,\n"
          "TLS certificates and map-library caches. .env, checkout, OS tools and images are preserved.")
    print(f"Volumes: postgres={db or 'none'}, uploads={uploads or 'none'}, nominatim={geo or 'none'}, "
          f"certs={certs or 'none'}, edge config={edge_config or 'none'}")
    # Validate the cache boundary BEFORE removing any volumes; dry-run is non-mutating.
    run([sys.executable, str(ROOT / "scripts/clear-map-cache.py")])
    confirm("DESTROY BOROBIYA DATA")
    vm_compose("down")
    run([sys.executable, str(ROOT / "scripts/clear-map-cache.py"), "--yes"])
    remove_volumes(["postgres-data", "borobiya-uploads", "nominatim-data", "caddy-data", "caddy-config"])
    print("Project data removed. Check your off-VM backup before deleting it.")


def clear_caches(apply: bool) -> None:
    dist = ROOT / "packages/client/dist"
    if dist.is_symlink() or (dist.exists() and not dist.is_dir()):
        fail("refusing unexpected browser-build cache path")
    print("Project map data cache plan (includes offline source files):")
    run([sys.executable, str(ROOT / "scripts/clear-map-cache.py")])
    print(f"Browser build: {dist if dist.is_dir() else 'absent'}")
    print("Database, photos, Nominatim import, .env and global Docker/Bun caches are preserved.")
    if not apply:
        print("Dry run. Re-run with clear-caches --apply for typed confirmation.")
        return
    confirm("CLEAR PROJECT CACHES")
    vm_compose("down")
    run([sys.executable, str(ROOT / "scripts/clear-map-cache.py"), "--yes"])
    if dist.is_dir():
        shutil.rmtree(dist)
    print("Project caches removed. A full online launch is needed before offline serving.")


def clear_tools(apply: bool) -> None:
    # Explicit list of project-local downloaded JARs, never apt packages or shared Docker images.
    targets = [*(ROOT / "map-server/tools").glob("planetiler-*.jar"),
               *(ROOT / "map-server/photon").glob("photon-*.jar"),
               *(ROOT / "map-server/data").glob("planetiler-*.jar")]
    for path in targets:
        if not path.is_file() or path.is_symlink():
            fail(f"refusing unexpected tool path {path}")
    print("Project-local tool JARs (Docker, apt, Java, Osmium and Bun are shared OS tools and stay installed):")
    for path in targets:
        print(f"  {path}")
    if not targets:
        print("  none")
    if not apply:
        print("Dry run. Re-run with clear-tools --apply to delete these JARs.")
        return
    if targets:
        confirm("CLEAR TOOLS")
        for path in targets:
            path.unlink()


def admin_reset(generate: bool) -> None:
    if not sys.stdin.isatty() or (generate and not sys.stdout.isatty()):
        fail("admin password reset requires a terminal; generated secrets must be shown to the operator")
    if not compose("ps", "-q", "postgres", capture=True).stdout.strip():
        fail("application Postgres is not running; launch it before resetting admin password")
    if generate:
        password = "Admin-" + secrets.token_hex(16)
    else:
        if not sys.stdin.isatty():
            fail("admin reset needs a terminal (passwords never belong in CLI arguments)")
        password = getpass.getpass("New admin password: ")
        if password != getpass.getpass("Repeat new admin password: "):
            fail("passwords did not match")
    if not (8 <= len(password.encode("utf-16-le")) // 2 <= 1024 and
            any(unicodedata.category(c).startswith("L") for c in password) and any(c.isdecimal() for c in password)):
        fail("password must contain a letter and digit and be 8–1024 characters")
    if generate:
        # Show it BEFORE changing the database: if the subsequent .env write
        # fails, the operator still has the only copy of the new credential.
        print(f"New admin password (store securely before reset): {password}", flush=True)
    environ = os.environ.copy()
    environ["ADMIN_SEED_PASSWORD"] = password
    subprocess.run(["docker", "compose", *PROFILES, "run", "--rm", "--no-deps", "-T",
                    "-e", "ADMIN_SEED_PASSWORD", "api", "bun", "src/db/reset-admin-password.ts"],
                   cwd=ROOT, env=environ, check=True)
    # Avoid a stale bootstrap secret in .env after a successful reset.
    import importlib.util
    spec = importlib.util.spec_from_file_location("vm_env", ROOT / "scripts/vm-env.py")
    if spec is None or spec.loader is None:
        fail("password reset succeeded but .env sync failed: vm-env.py missing")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        module.update_env({"ADMIN_SEED_PASSWORD_B64": base64.b64encode(password.encode()).decode("ascii")})
    except (OSError, SystemExit) as error:
        fail(f"admin reset succeeded but .env sync failed ({error}); retain the new password, "
             "repair .env before the next seed/launch")
    print("Admin sessions revoked; .env bootstrap secret updated. No other accounts were changed.")


def doctor() -> int:
    errors = 0
    public_https_unverified = False
    values = env_values()
    print("Borobiya VM diagnostics (read-only; no secrets or raw logs):")
    if not values:
        print("FAIL .env missing -> scripts/vm-env.py")
        errors += 1
    else:
        print(f"OK .env present, mode={values.get('NODE_ENV', 'unset')}")
        for key in ("JWT_SECRET", "JWT_REFRESH_SECRET", "POSTGRES_PASSWORD", "NOMINATIM_PASSWORD"):
            if not values.get(key) or values[key].startswith(("replace-", "change-me")):
                print(f"FAIL {key} placeholder -> scripts/vm-env.py")
                errors += 1
        if values.get("NODE_ENV") == "production":
            domain = values.get("PUBLIC_DOMAIN", "")
            if not re.fullmatch(r"[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+", domain) or \
                    values.get("CORS_ORIGINS") != f"https://{domain}":
                print("FAIL production domain/origin mismatch -> scripts/vm-env.py --mode production --origin ...")
                errors += 1
    try:
        config = configured_map()
        print(f"OK map selection: {config['regions']} (policy: {config['policy']})")
        if values.get("MAP_REGION_IDS") != config["regions"]:
            print("WARN saved selection differs from active .env; run launch to rebuild")
    except SystemExit as error:
        print(f"FAIL map selection: {error}")
        errors += 1
    if not static_ready():
        print("FAIL browser build missing -> scripts/vm.py launch (online first)")
        errors += 1
    else:
        print("OK browser build (index + MapLibre worker)")
    try:
        run(["docker", "info"], capture=True, stderr=subprocess.PIPE)
        run([*vm_compose_args(), "config", "--quiet"], capture=True, stderr=subprocess.PIPE)
        print("OK Docker daemon + VM Compose configuration")
        print(run([*vm_compose_args(), "ps"], capture=True).stdout.rstrip())
    except (OSError, subprocess.CalledProcessError):
        print("FAIL Docker/Compose: run scripts/vm-install.sh --check; then docker compose config")
        errors += 1
    try:
        if not compose("ps", "-q", "postgres", capture=True).stdout.strip():
            raise ValueError("Postgres container is not running")
        result = run(["docker", "compose", *PROFILES, "exec", "-T", "postgres", "sh", "-ec",
                      'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -h postgres -U "$POSTGRES_USER" '
                      '-d "$POSTGRES_DB" -tAc "SELECT 1"'], capture=True, stderr=subprocess.PIPE)
        if result.stdout.strip() != "1":
            raise ValueError("database returned an unexpected result")
        print("OK application database authentication over Compose network")
    except (OSError, subprocess.CalledProcessError, ValueError):
        print("FAIL application database authentication; inspect Postgres health and runbook §9.3 (never down -v)")
        errors += 1
    opener = build_opener(ProxyHandler({}))
    if values.get("NODE_ENV") != "production":
        try:
            if run([*vm_compose_args(all_profiles=True), "ps", "-q", "edge"], capture=True,
                   stderr=subprocess.PIPE).stdout.strip():
                print("FAIL old public TLS edge still running in development; run scripts/vm.py launch")
                errors += 1
        except (OSError, subprocess.CalledProcessError):
            pass  # Docker failure already reported above.
    else:
        try:
            if not run([*vm_compose_args(), "ps", "-q", "edge"], capture=True,
                       stderr=subprocess.PIPE).stdout.strip():
                raise ValueError("edge container is not running")
            print("OK TLS edge container running (certificate issuance still needs HTTPS probe)")
        except (OSError, subprocess.CalledProcessError, ValueError):
            print("FAIL TLS edge: verify public DNS, ports 80/443 and Caddy logs locally")
            errors += 1
        domain = values.get("PUBLIC_DOMAIN", "")
        if domain and re.fullmatch(r"[a-zA-Z0-9.-]+", domain):
            try:
                with opener.open(f"https://{domain}/health", timeout=5) as response:
                    if response.status != 200:
                        raise ValueError("unhealthy HTTPS response")
                print("OK public HTTPS + certificate /health")
            except (URLError, OSError, ValueError) as error:
                public_https_unverified = True
                print(f"WARN public HTTPS from VM: {error} (DNS/hairpin may differ; verify from external browser)")
    port = values.get("NGINX_PORT", "8080")
    if not port.isdigit() or not 1 <= int(port) <= 65535:
        print("FAIL NGINX_PORT invalid in .env")
        return 1
    for path, label in (("/health", "gateway only"), ("/api/_public/health", "API process; not a database probe"),
                        ("/map-config", "map gateway"), ("/", "browser client")):
        url = f"http://127.0.0.1:{port}{path}"
        try:
            with opener.open(url, timeout=4) as response:
                sample = response.read(160)
                if response.status != 200 or (path == "/" and b"<html" not in sample.lower()):
                    raise ValueError("unexpected response (gateway-only Nginx or bad upstream)")
            print(f"OK {path} ({label})")
        except (URLError, OSError, ValueError) as error:
            print(f"FAIL {path}: {error}; see docs/UBUNTU_VM_DIAGNOSTICS.md")
            errors += 1
    if errors:
        print(f"{errors} diagnostic failure(s); use docs/UBUNTU_VM_DIAGNOSTICS.md")
    elif public_https_unverified:
        print("LOCAL CHECKS PASS; public HTTPS UNVERIFIED — test from an external browser")
    else:
        print("PASS")
    return 1 if errors else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    start = sub.add_parser("launch", help="build/resume and serve backend + browser client")
    start.add_argument("--offline", action="store_true", help="no online map sources; existing browser build required")
    start.add_argument("--serve-only", action="store_true", help="strict offline relaunch: no builds, pulls or downloads")
    sub.add_parser("doctor", help="read-only launch and runtime checks")
    stop_parser = sub.add_parser("stop", help="stop, preserving data unless explicitly deleting app DB")
    stop_parser.add_argument("--clear-db", action="store_true", help="remove only this project's app Postgres volume")
    stop_parser.add_argument("--backup", metavar="NEW.dump", help="pg_dump -Fc before deleting the database")
    stop_parser.add_argument("--no-backup", action="store_true", help="explicitly discard database without a backup")
    destroy_parser = sub.add_parser("destroy", help="delete project-scoped DB, photos and map caches after confirmation")
    destroy_parser.add_argument("--backup", metavar="NEW.dump")
    destroy_parser.add_argument("--no-backup", action="store_true")
    backup_parser = sub.add_parser("backup", help="PostgreSQL custom-format archive; no password in argv")
    backup_parser.add_argument("output", metavar="NEW.dump")
    caches = sub.add_parser("clear-caches", help="map data + browser build only; preserves databases and global caches")
    caches.add_argument("--apply", action="store_true", help="stop project and clear after typed confirmation")
    tools = sub.add_parser("clear-tools", help="only downloaded project JARs; does not uninstall OS tools")
    tools.add_argument("--apply", action="store_true", help="interactive confirmed deletion")
    admin = sub.add_parser("admin-password", help="reset admin password and revoke admin sessions")
    admin.add_argument("--generate", action="store_true", help="generate rather than prompt (TTY only)")
    args = parser.parse_args()
    if args.command == "launch":
        launch(args)
    elif args.command == "doctor":
        return doctor()
    elif args.command == "stop":
        if (args.backup or args.no_backup) and not args.clear_db:
            fail("--backup/--no-backup require --clear-db")
        if args.backup and args.no_backup:
            fail("choose --backup or --no-backup, not both")
        stop(args.clear_db, args.backup, args.no_backup)
    elif args.command == "destroy":
        if args.backup and args.no_backup:
            fail("choose --backup or --no-backup, not both")
        destroy(args.backup, args.no_backup)
    elif args.command == "backup":
        backup(args.output)
    elif args.command == "clear-caches":
        clear_caches(args.apply)
    elif args.command == "clear-tools":
        clear_tools(args.apply)
    elif args.command == "admin-password":
        admin_reset(args.generate)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, subprocess.CalledProcessError) as error:
        fail(f"operation failed ({error}); existing volumes and secrets were not globally pruned. Run scripts/vm.py doctor")
