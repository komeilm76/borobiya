#!/usr/bin/env python3
"""Choose map areas without downloading them; setup-ubuntu-vm.sh remains the builder."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "map-server/scripts"))
import regions  # noqa: E402  # use the pipeline's own catalog/selection rules
from vm_common import env_values  # noqa: E402

CONFIG = ROOT / ".vm-map.json"
SAFE_PATH = re.compile(r"^[a-zA-Z0-9_./@+-]+$")


def fail(message: str) -> None:
    raise SystemExit(f"vm-map: {message}")


def load() -> dict[str, str]:
    if CONFIG.is_symlink():
        fail("refusing symlinked map configuration")
    if not CONFIG.exists():
        return {}
    try:
        data = json.loads(CONFIG.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        fail(f"cannot read {CONFIG}: {error}")
    if not isinstance(data, dict) or set(data) != {"regions", "snapshot", "policy", "library"} or any(
        not isinstance(value, str) for value in data.values()
    ):
        fail("invalid saved selection; inspect .vm-map.json before changing it")
    return data


def library_path(raw: str) -> str:
    path = Path(raw).expanduser()
    if not path.is_absolute() or not SAFE_PATH.fullmatch(str(path)) or ".." in path.parts:
        fail("library must be an absolute path without whitespace, '..', or shell syntax")
    if any(part.is_symlink() for part in (path, *path.parents)):
        fail("library path must not traverse symlinks")
    resolved = path.resolve()
    if resolved == Path(resolved.anchor) or resolved == ROOT or ROOT in resolved.parents:
        fail("library must be outside the repository and cannot be a filesystem root")
    return str(path)


def save(config: dict[str, str]) -> None:
    fd, name = tempfile.mkstemp(prefix=".vm-map-", dir=ROOT)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump(config, output, indent=2)
            output.write("\n")
        os.replace(name, CONFIG)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--set", metavar="IDS", help="replace selection (comma-separated country/city IDs)")
    group.add_argument("--add", metavar="IDS", help="add countries/cities to saved selection")
    group.add_argument("--remove", metavar="IDS", help="remove IDs from saved selection")
    group.add_argument("--show", action="store_true", help="show saved selection")
    parser.add_argument("--list", action="store_true", help="list catalog of valid country/city IDs")
    parser.add_argument("--snapshot", help="pinned, latest, or YYYY-MM-DD")
    parser.add_argument("--policy", choices=regions.SOURCE_POLICIES,
                        help="cache-first, refresh, or offline (never fetch sources)")
    parser.add_argument("--library", help="external path for persistent map data")
    args = parser.parse_args()
    catalog = regions.load_catalog()
    if regions.validate_catalog(catalog):
        fail("invalid region catalog; run python3 map-server/scripts/regions.py validate-catalog")
    if args.list:
        regions.command_list(catalog, args)
        return
    prior = load()
    if args.show:
        print(json.dumps(prior or {"message": "No saved selection. First configuration will reuse active .env values."},
                         indent=2))
        return
    if not prior:
        active = env_values()
        prior = {
            "regions": active.get("MAP_REGION_IDS") or "ir-tehran",
            "snapshot": active.get("MAP_SNAPSHOT") or "pinned",
            "policy": active.get("MAP_SOURCE_POLICY") or "cache-first",
            "library": active.get("MAP_LIBRARY_DIR") or str(Path.home() / ".local/share/borobiya/map-library"),
        }
    if not any((args.set, args.add, args.remove, args.snapshot, args.policy, args.library)):
        if not sys.stdin.isatty():
            fail("interactive selection needs a terminal; use --set IDs or --show")
        regions.command_list(catalog, args)
        args.set = input(f"Country/city IDs (comma separated) [{prior['regions']}]: ").strip() or prior["regions"]
        args.snapshot = input(f"Snapshot [{prior['snapshot']}]: ").strip() or prior["snapshot"]
        args.policy = input(f"Source policy [{prior['policy']}; cache-first / refresh / offline]: ").strip() or prior["policy"]
        args.library = input(f"External map library [{prior['library']}]: ").strip() or prior["library"]
    selected = prior.get("regions", "")
    if args.set is not None:
        selected = args.set
    elif args.add is not None:
        selected = ",".join(filter(None, (selected, args.add)))
    elif args.remove is not None:
        if not selected:
            fail("no saved selection to remove from")
        removal = {value.strip().lower() for value in args.remove.split(",")}
        if "" in removal or not removal.issubset(regions.area_index(catalog)):
            fail("unknown or empty ID to remove")
        existing = [value.strip() for value in selected.split(",")]
        if not removal.issubset(existing):
            fail("cannot remove an ID that is not in the saved selection")
        selected = ",".join(value for value in existing if value not in removal)
    if not selected:
        fail("at least one country or city must remain selected")
    result = regions.resolve_selection(catalog, selected)
    policy = args.policy or prior.get("policy", "cache-first")
    regions.validate_source_policy(policy)
    snapshot = args.snapshot or prior.get("snapshot", "pinned")
    if snapshot not in ("pinned", "latest"):
        try:
            from datetime import date
            if date.fromisoformat(snapshot).isoformat() != snapshot:
                raise ValueError(snapshot)
        except ValueError:
            fail("snapshot must be pinned, latest or a real YYYY-MM-DD date")
    path = library_path(args.library or prior.get("library", str(Path.home() / ".local/share/borobiya/map-library")))
    if result["heavy"]:
        print("WARNING: a whole large country needs much more disk/RAM and a long import.")
    if policy == "offline":
        print("Offline requires pre-cached sources, reference layers, JARs, images and an index for this selection.")
    config = {"regions": ",".join(result["ids"]), "snapshot": snapshot, "policy": policy, "library": path}
    save(config)
    print(f"Saved {CONFIG.name}: {config['regions']} | {snapshot} | {policy} | {path}")
    print("Run scripts/vm.py launch to build and activate; selection alone changes no live map.")


if __name__ == "__main__":
    main()
