#!/usr/bin/env python3
"""Manage Borobiya's project-independent map library.

The library is the canonical local store for map content only:

  sources/<continent>/<country>/<source>/<date>/  Geofabrik PBF + metadata
  crops/<continent>/<country>/<city>/<date>/      Osmium city crops
  datasets/<date>/<fingerprint>/                  merged PBF, PMTiles,
                                                  OSRM graphs, Photon index
  current.json                                    active dataset pointer
  datasets/current -> <date>/<fingerprint>         convenience symlink

Docker images, operating-system packages, Java, Osmium binaries, and tool
JARs are deliberately not managed here. Those are separate installation
concerns; this module only manages map data and generated map artifacts.
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import regions  # noqa: E402


class MigrationUnsafe(Exception):
    """Legacy artifacts exist but cannot be moved without risking data loss."""


def fail(message: str) -> None:
    print(f"map-library: {message}", file=sys.stderr)
    raise SystemExit(1)


def note(message: str) -> None:
    print(f"map-library: {message}", file=sys.stderr)


def assert_no_symlink_components(path: Path) -> Path:
    """Fail closed if any component of an artifact path traverses a symlink."""
    absolute = Path(os.path.abspath(path))
    current = Path(absolute.anchor)
    for part in absolute.parts[1:]:
        current /= part
        if current.is_symlink():
            raise MigrationUnsafe(f"refusing to migrate through a symlink: {current}")
    return absolute


def assert_no_symlinks_tree(path: Path) -> None:
    """Reject symlinks in a directory tree before moving it into the library."""
    path = assert_no_symlink_components(path)
    if not path.exists():
        return
    pending = [path]
    while pending:
        directory = pending.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                child = Path(entry.path)
                if entry.is_symlink():
                    raise MigrationUnsafe(f"refusing to migrate symlinked artifact: {child}")
                if entry.is_dir(follow_symlinks=False):
                    pending.append(child)


def resolve_root(library_root: object) -> Path:
    return regions.resolve_library_root(library_root)


def current_path(root: Path) -> Path:
    return root / "current.json"


def load_current(root: Path) -> dict:
    path = regions.library_member_path(root, current_path(root))
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"invalid map library current pointer {path}: {error}")
    if not isinstance(payload, dict) or payload.get("version") != 1:
        fail(f"unsupported map library current pointer: {path}")
    areas = payload.get("areas")
    dataset_dir = payload.get("datasetDir")
    snapshot_date = payload.get("snapshotDate")
    if (
        not isinstance(areas, list)
        or not areas
        or any(not isinstance(area, str) for area in areas)
        or not isinstance(dataset_dir, str)
        or not dataset_dir
        or not isinstance(snapshot_date, str)
        or not snapshot_date
    ):
        fail(f"map library current pointer is incomplete: {path}")
    dataset_path = Path(dataset_dir).expanduser()
    if not dataset_path.is_absolute():
        dataset_path = root / dataset_path
    try:
        dataset_path.resolve().relative_to(root)
    except ValueError:
        fail(f"map library current dataset is outside the library root: {dataset_path}")
    return payload


def write_current(
    catalog: dict,
    library_root: object,
    selection: str,
    snapshot_date_text: str,
    snapshot_mode: str,
    dataset_dir: object,
) -> dict:
    root = resolve_root(library_root)
    snapshot_date = regions.parse_snapshot_date(snapshot_date_text, "--snapshot-date")
    resolved = regions.resolve_selection(catalog, selection)
    paths = regions.library_paths(root, snapshot_date, resolved["ids"])
    target = Path(str(dataset_dir)).expanduser()
    if not target.is_absolute():
        target = Path.cwd() / target
    target = target.resolve()
    if target != paths["datasetDir"]:
        fail(
            f"dataset directory {target} does not match standardized library path "
            f"{paths['datasetDir']}"
        )
    relative = regions.dataset_relative_path(snapshot_date, resolved["ids"])
    payload = {
        "version": 1,
        "dataset": "borobiya",
        "snapshotMode": snapshot_mode,
        "snapshotDate": snapshot_date.isoformat(),
        "dataVersion": snapshot_date.isoformat(),
        "areas": resolved["ids"],
        "bbox": resolved["bbox"],
        "datasetFingerprint": regions.dataset_fingerprint(snapshot_date, resolved["ids"]),
        "datasetRelativePath": relative.as_posix(),
        "datasetDir": str(target),
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    datasets_root = root / "datasets"
    if datasets_root.is_symlink():
        fail(f"refusing to update the active pointer through a datasets symlink: {datasets_root}")
    datasets_root.mkdir(parents=True, exist_ok=True)
    link = datasets_root / "current"
    if link.exists() and not link.is_symlink():
        fail(f"refusing to replace non-symlink current dataset path: {link}")
    temporary = datasets_root / ".current.tmp"
    if temporary.exists() or temporary.is_symlink():
        if not temporary.is_symlink() and not temporary.is_file():
            fail(f"refusing to replace non-file current-link staging path: {temporary}")
        temporary.unlink()
    temporary.symlink_to(relative.relative_to("datasets"), target_is_directory=True)
    try:
        regions.write_json_atomically(current_path(root), payload)
        temporary.replace(link)
    except OSError:
        if temporary.is_symlink():
            temporary.unlink()
        raise
    return payload


def command_current(catalog: dict, args: argparse.Namespace) -> None:
    root = resolve_root(args.library)
    payload = load_current(root)
    if not payload:
        fail(f"no active dataset recorded in map library: {root}")
    areas = payload["areas"]
    if any(not isinstance(area, str) for area in areas):
        fail(f"map library current pointer contains invalid area IDs: {areas!r}")
    resolved = regions.resolve_selection(catalog, ",".join(areas))
    if resolved["ids"] != areas:
        fail(f"map library current pointer areas are not canonical: {areas!r}")
    snapshot_date = regions.parse_snapshot_date(
        payload["snapshotDate"], "current snapshot date"
    )
    paths = regions.library_paths(root, snapshot_date, resolved["ids"])
    dataset_dir = Path(payload["datasetDir"]).expanduser()
    if not dataset_dir.is_absolute():
        dataset_dir = root / dataset_dir
    if dataset_dir.resolve() != paths["datasetDir"]:
        fail("map library current pointer does not identify the standardized dataset path")
    expected_relative = regions.dataset_relative_path(
        snapshot_date, resolved["ids"]
    ).as_posix()
    if (
        payload.get("datasetRelativePath") != expected_relative
        or payload.get("datasetFingerprint")
        != regions.dataset_fingerprint(snapshot_date, resolved["ids"])
        or payload.get("bbox") != resolved["bbox"]
    ):
        fail("map library current pointer does not match its standardized selection metadata")
    regions.emit_shell({
        "ACTIVE_REGION_IDS": ",".join(str(area) for area in payload["areas"]),
        "ACTIVE_SNAPSHOT_DATE": payload["snapshotDate"],
        "ACTIVE_SNAPSHOT_MODE": payload.get("snapshotMode", ""),
        "ACTIVE_DATASET_DIR": dataset_dir.resolve(),
        "ACTIVE_MAP_DATA_DIR": paths["dataDir"],
        "ACTIVE_MAP_PBF": paths["pbf"],
        "ACTIVE_MAP_PBF_MANIFEST": paths["manifest"],
        "ACTIVE_MAP_OSRM_DATA_DIR": paths["osrmDataDir"],
        "ACTIVE_MAP_PHOTON_DATA_DIR": paths["photonDataDir"],
    })


def command_write_current(catalog: dict, args: argparse.Namespace) -> None:
    payload = write_current(
        catalog,
        args.library,
        args.selection,
        args.snapshot_date,
        args.snapshot_mode,
        args.dataset_dir,
    )
    print(
        "Wrote active map library pointer: "
        f"{current_path(resolve_root(args.library))} -> {payload['datasetRelativePath']}"
    )


def assert_under_root(root: Path, path: Path) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        fail(f"refusing to prune path outside map library: {resolved}")
    if resolved == root:
        fail("refusing to prune the map library root itself")
    return resolved


def remove_tree(root: Path, path: Path, dry_run: bool, removed: list[str]) -> None:
    if not path.exists() and not path.is_symlink():
        return
    resolved = assert_under_root(root, path)
    removed.append(str(resolved))
    if dry_run:
        return
    if path.is_symlink() or path.is_file():
        path.unlink()
    else:
        shutil.rmtree(path)


def prune_library(
    catalog: dict,
    library_root: object,
    selection: str,
    snapshot_date_text: str,
    dataset_dir: object,
    dry_run: bool = False,
) -> list[str]:
    root = resolve_root(library_root)
    snapshot_date = regions.parse_snapshot_date(snapshot_date_text, "--snapshot-date")
    resolved = regions.resolve_selection(catalog, selection)
    paths = regions.library_paths(root, snapshot_date, resolved["ids"])
    active_dataset = Path(str(dataset_dir)).expanduser()
    if not active_dataset.is_absolute():
        active_dataset = Path.cwd() / active_dataset
    active_dataset = active_dataset.resolve()
    if active_dataset != paths["datasetDir"]:
        fail(
            f"active dataset {active_dataset} does not match standardized path "
            f"{paths['datasetDir']}"
        )

    removed: list[str] = []
    selected_country_ids = {area["countryId"] for area in resolved["areas"]}
    source_countries = regions.source_country_index(catalog)
    index = regions.area_index(catalog)

    # One retained release per selected country/source and city crop.
    for source_id, country in source_countries.items():
        if country["id"] not in selected_country_ids:
            continue
        parent = (
            root
            / "sources"
            / str(country["continent"])
            / str(country["id"])
            / source_id
        )
        if not parent.is_dir():
            continue
        for child in sorted(parent.iterdir()):
            if child.is_dir() and child.name != snapshot_date.isoformat():
                remove_tree(root, child, dry_run, removed)

    for area in index.values():
        if area["kind"] != "city" or area["countryId"] not in selected_country_ids:
            continue
        parent = (
            root
            / "crops"
            / str(area["continent"])
            / str(area["countryId"])
            / str(area["cityId"])
        )
        if not parent.is_dir():
            continue
        for child in sorted(parent.iterdir()):
            if child.is_dir() and child.name != snapshot_date.isoformat():
                remove_tree(root, child, dry_run, removed)

    # One active generated dataset bundle. Other bundles can be rebuilt from
    # retained sources/crops, so they are not kept as silent second versions.
    datasets_root = root / "datasets"
    if datasets_root.is_symlink():
        fail(f"refusing to prune through a datasets symlink: {datasets_root}")
    if datasets_root.is_dir():
        assert_under_root(root, datasets_root)
        for date_dir in sorted(datasets_root.iterdir()):
            if date_dir.name == "current" or not date_dir.is_dir() or date_dir.is_symlink():
                continue
            assert_under_root(root, date_dir)
            for candidate in sorted(date_dir.iterdir()):
                if candidate.is_dir() and candidate.resolve() != active_dataset:
                    remove_tree(root, candidate, dry_run, removed)
            if not dry_run and date_dir.exists() and not any(date_dir.iterdir()):
                date_dir.rmdir()
    return removed


def command_prune(catalog: dict, args: argparse.Namespace) -> None:
    removed = prune_library(
        catalog,
        args.library,
        args.selection,
        args.snapshot_date,
        args.dataset_dir,
        dry_run=args.dry_run,
    )
    verb = "Would remove" if args.dry_run else "Removed"
    for path in removed:
        print(f"{verb} stale map library path: {path}")
    print(f"Map library prune complete: {len(removed)} path(s) {'identified' if args.dry_run else 'removed'}")


def move_file(source: Path, target: Path) -> bool:
    source = assert_no_symlink_components(source)
    target = assert_no_symlink_components(target)
    if not source.is_file():
        return target.is_file()
    if source.resolve() == target.resolve() if target.exists() else False:
        return True
    if target.exists():
        if regions.sha256_file(source) != regions.sha256_file(target):
            raise MigrationUnsafe(f"target already exists with different content: {target}")
        source.unlink()
        return True
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(target))
    return True


def move_tree(source: Path, target: Path) -> bool:
    source = assert_no_symlink_components(source)
    target = assert_no_symlink_components(target)
    if not source.exists():
        return target.exists()
    if source.resolve() == target.resolve() if target.exists() else False:
        return True
    if target.exists():
        if target.is_dir() and not any(target.iterdir()):
            target.rmdir()
        else:
            raise MigrationUnsafe(f"target directory already exists: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(target))
    return True


def link_or_copy(source: Path, target: Path) -> None:
    source = assert_no_symlink_components(source)
    target = assert_no_symlink_components(target)
    if target.exists():
        if regions.sha256_file(source) != regions.sha256_file(target):
            raise MigrationUnsafe(f"target already exists with different content: {target}")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.link(source, target)
    except OSError:
        shutil.copy2(source, target)


def first_existing(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.exists() or path.is_symlink():
            path = assert_no_symlink_components(path)
            if path.is_file() and path.stat().st_size > 0:
                return path
    return None


def rewrite_artifact_metadata(path: Path, areas: list[str], snapshot_date) -> None:
    path = assert_no_symlink_components(path)
    if not path.is_file():
        return
    payload = regions.read_json_object(path)
    if not payload:
        raise MigrationUnsafe(f"invalid artifact metadata JSON: {path}")
    payload["region"] = "borobiya"
    payload["areas"] = areas
    payload["snapshotDate"] = snapshot_date.isoformat()
    regions.write_json_atomically(path, payload)


def migrate_project_library(
    catalog: dict,
    repo_root: object,
    library_root: object,
    selection: str,
    snapshot_date_text: str,
    dataset_dir: object,
    legacy_osrm_dir: object | None = None,
) -> dict:
    """Move a verified project-local pinned dataset into the map library.

    This is intentionally conservative: every required source/crop/merged
    hash is checked before files are moved. Optional generated artifacts are
    moved only when their targets are absent or byte-identical.
    """
    flags = {"migrated": 0, "tehran": 0, "skipped": 0}
    snapshot_date = regions.parse_snapshot_date(snapshot_date_text, "--snapshot-date")
    if snapshot_date != regions.catalog_snapshot_date(catalog):
        return flags

    repo = Path(str(repo_root)).expanduser().resolve()
    root = resolve_root(library_root)
    resolved = regions.resolve_selection(catalog, selection)
    paths = regions.library_paths(root, snapshot_date, resolved["ids"])
    target_dataset = Path(str(dataset_dir)).expanduser()
    if not target_dataset.is_absolute():
        target_dataset = Path.cwd() / target_dataset
    target_dataset = target_dataset.resolve()
    if target_dataset != paths["datasetDir"]:
        raise MigrationUnsafe(
            f"dataset directory {target_dataset} does not match standardized path {paths['datasetDir']}"
        )

    legacy_data = repo / "map-server" / "data"
    expected_legacy_osrm = repo / "map-server" / "osrm" / "data"
    legacy_osrm = (
        Path(str(legacy_osrm_dir)).expanduser()
        if legacy_osrm_dir
        else expected_legacy_osrm
    )
    if not legacy_osrm.is_absolute():
        legacy_osrm = repo / legacy_osrm
    legacy_osrm = Path(os.path.abspath(legacy_osrm))
    if legacy_osrm != Path(os.path.abspath(expected_legacy_osrm)):
        raise MigrationUnsafe(
            "legacy OSRM migration is limited to map-server/osrm/data inside the checkout"
        )
    legacy_photon = repo / "map-server" / "photon" / "data"
    for legacy_root in (legacy_data, legacy_osrm, legacy_photon):
        assert_no_symlink_components(legacy_root)

    v2_manifest_path = legacy_data / "borobiya.source.json"
    v1_manifest_path = legacy_data / "tehran.source.json"
    assert_no_symlink_components(v2_manifest_path)
    assert_no_symlink_components(v1_manifest_path)
    is_v1 = False
    if v2_manifest_path.is_file():
        old = regions.read_json_object(v2_manifest_path)
        if old.get("version") != 2:
            return flags
        manifest_areas = [str(area) for area in old.get("areas", [])]
        old_manifest_path = v2_manifest_path
        merged_candidates = [paths["pbf"], legacy_data / "borobiya.osm.pbf"]
        expected_merged_sha = old.get("merged", {}).get("sha256") if isinstance(old.get("merged"), dict) else None
        osmium_version = (
            old.get("merged", {}).get("osmiumToolVersion", "1.16.0")
            if isinstance(old.get("merged"), dict)
            else "1.16.0"
        )
    elif v1_manifest_path.is_file() and resolved["ids"] == ["ir-tehran"]:
        is_v1 = True
        old = regions.read_json_object(v1_manifest_path)
        if old.get("region") != "tehran":
            return flags
        manifest_areas = ["ir-tehran"]
        old_manifest_path = v1_manifest_path
        merged_candidates = [paths["pbf"], legacy_data / "borobiya.osm.pbf", legacy_data / "tehran.osm.pbf"]
        crop_block = old.get("crop", {}) if isinstance(old.get("crop"), dict) else {}
        expected_merged_sha = crop_block.get("sha256")
        osmium_version = crop_block.get("osmiumToolVersion", "1.16.0")
    else:
        return flags

    if sorted(manifest_areas) != sorted(resolved["ids"]):
        return flags

    merged_source = first_existing(merged_candidates)
    if merged_source is None:
        raise MigrationUnsafe("legacy merged dataset PBF is missing")
    merged_sha = regions.sha256_file(merged_source)
    if merged_sha != expected_merged_sha:
        raise MigrationUnsafe("legacy merged dataset PBF does not match its manifest SHA-256")

    # Validate the legacy manifest's claimed provenance before trusting its
    # source/crop hashes. In particular, a v1 `region=tehran` label alone is
    # not proof that its crop used the catalog Tehran bbox/strategy.
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            if is_v1:
                regions.validate_legacy_v1_manifest(catalog, old, merged_source)
            else:
                regions.command_verify_manifest(
                    catalog,
                    argparse.Namespace(
                        manifest=str(old_manifest_path),
                        pbf=str(merged_source),
                        selection=",".join(resolved["ids"]),
                        bbox=None,
                        snapshot="pinned",
                        snapshot_date=snapshot_date.isoformat(),
                        library=str(root),
                    ),
                )
    except SystemExit as error:
        raise MigrationUnsafe(
            "legacy manifest does not prove the selected pinned dataset; rebuild instead"
        ) from error

    old_sources = {}
    if is_v1:
        old_source = old.get("source", {}) if isinstance(old.get("source"), dict) else {}
        old_sources["iran"] = old_source
    else:
        for entry in old.get("sources", []):
            if isinstance(entry, dict) and entry.get("id"):
                old_sources[str(entry["id"])] = entry

    descriptors = {
        descriptor["id"]: descriptor
        for descriptor in regions.effective_sources(
            catalog,
            resolved["sourceIds"],
            snapshot_date,
            root,
            policy="offline",
        )
    }
    source_plan: dict[str, tuple[Path, dict, dict]] = {}
    for source_id in resolved["sourceIds"]:
        descriptor = descriptors[source_id]
        target = descriptor["path"]
        assert target is not None
        entry = old_sources.get(source_id)
        if entry is None:
            raise MigrationUnsafe(f"legacy manifest has no source entry for {source_id}")
        candidates = [target]
        legacy_file = entry.get("file")
        if legacy_file is not None:
            if legacy_file == descriptor["file"]:
                candidates.append(legacy_data / "source" / descriptor["file"])
            elif source_id == "iran" and legacy_file == "iran-latest.osm.pbf":
                candidates.append(legacy_data / "source" / "iran-latest.osm.pbf")
            else:
                raise MigrationUnsafe(
                    f"legacy source {source_id} filename is not a supported project-local name"
                )
        candidates.append(legacy_data / "source" / descriptor["file"])
        if source_id == "iran":
            candidates.append(legacy_data / "source" / "iran-latest.osm.pbf")
        candidate = first_existing(candidates)
        if candidate is None:
            raise MigrationUnsafe(f"legacy source PBF is missing for {source_id}")
        if regions.md5_file(candidate) != entry.get("md5"):
            raise MigrationUnsafe(f"legacy source {source_id} MD5 does not match its manifest")
        if regions.sha256_file(candidate) != entry.get("sha256"):
            raise MigrationUnsafe(f"legacy source {source_id} SHA-256 does not match its manifest")
        source_plan[source_id] = (candidate, descriptor, entry)

    old_crops = {}
    if not is_v1:
        for entry in old.get("crops", []):
            if isinstance(entry, dict) and entry.get("area"):
                old_crops[str(entry["area"])] = entry
    crop_plan: dict[str, tuple[Path, Path, dict]] = {}
    for area in resolved["areas"]:
        if area["kind"] == "country":
            continue
        relative = regions.crop_relative_path(area, snapshot_date)
        target = regions.library_path(root, relative)
        if is_v1:
            crop_plan[area["id"]] = (merged_source, target, {"sha256": merged_sha})
            continue
        entry = old_crops.get(area["id"])
        if entry is None:
            raise MigrationUnsafe(f"legacy manifest has no crop entry for {area['id']}")
        candidate = first_existing([
            target,
            legacy_data / "crops" / f"{area['id']}.osm.pbf",
        ])
        if candidate is None:
            raise MigrationUnsafe(f"legacy crop PBF is missing for {area['id']}")
        if regions.sha256_file(candidate) != entry.get("sha256"):
            raise MigrationUnsafe(f"legacy crop {area['id']} SHA-256 does not match its manifest")
        crop_plan[area["id"]] = (candidate, target, entry)

    # Optional generated artifacts: fail before moving anything if a target
    # directory already contains a different generated bundle.
    legacy_pmtiles = legacy_data / ("tehran.pmtiles" if is_v1 else "borobiya.pmtiles")
    legacy_tiles_meta = legacy_data / (
        "tehran.metadata.json" if is_v1 else "borobiya.metadata.json"
    )
    legacy_stamp = legacy_photon / ".borobiya-pbf.sha256"
    for legacy_file in (legacy_pmtiles, legacy_tiles_meta, legacy_stamp):
        assert_no_symlink_components(legacy_file)
    if legacy_pmtiles.is_file() and paths["pmtiles"].is_file():
        if regions.sha256_file(legacy_pmtiles) != regions.sha256_file(paths["pmtiles"]):
            raise MigrationUnsafe("target PMTiles already exists with different content")
    for profile in ("car", "bicycle", "foot"):
        legacy_profile = legacy_osrm / profile
        assert_no_symlinks_tree(legacy_profile)
        target_profile = regions.library_path(
            root, paths["osrmDataDir"].relative_to(root) / profile
        )
        if legacy_profile.is_dir() and target_profile.exists() and any(target_profile.iterdir()):
            raise MigrationUnsafe(f"target OSRM profile already exists: {target_profile}")
    legacy_photon_index = legacy_photon / "photon_data"
    assert_no_symlinks_tree(legacy_photon_index)
    target_photon_index = regions.library_path(
        root, paths["photonDataDir"].relative_to(root) / "photon_data"
    )
    if legacy_photon_index.is_dir() and target_photon_index.exists() and any(target_photon_index.iterdir()):
        raise MigrationUnsafe(f"target Photon index already exists: {target_photon_index}")

    # All required hashes verified; moves below are resumable.
    for source_id, (candidate, descriptor, entry) in source_plan.items():
        target = descriptor["path"]
        assert target is not None
        move_file(candidate, target)
        sidecar = regions.source_sidecar_path(target)
        if not sidecar.is_file():
            sidecar.write_text(f"{entry['md5']} {descriptor['file']}\n", encoding="utf-8")
        regions.write_source_metadata(
            catalog,
            root,
            source_id,
            snapshot_date,
            md5=str(entry["md5"]),
            sha256=str(entry["sha256"]),
            data_timestamp=entry.get("dataTimestamp"),
        )

    move_file(merged_source, paths["pbf"])
    for area in resolved["areas"]:
        if area["kind"] != "city":
            continue
        candidate, target, _entry = crop_plan[area["id"]]
        if is_v1:
            link_or_copy(paths["pbf"], target)
        else:
            move_file(candidate, target)
            legacy_meta = legacy_data / "crops" / f"{area['id']}.source.json"
            if legacy_meta.is_file() and legacy_meta.resolve() != target.with_name(f"{area['id']}.source.json").resolve():
                legacy_meta.unlink()
        source_entry = source_plan[area["source"]][2]
        regions.write_crop_metadata(
            catalog,
            target.with_name(f"{area['id']}.source.json"),
            target,
            area["id"],
            str(source_entry["sha256"]),
            str(osmium_version),
            snapshot_date,
            root,
        )

    if legacy_pmtiles.is_file():
        move_file(legacy_pmtiles, paths["pmtiles"])
    if legacy_tiles_meta.is_file():
        move_file(legacy_tiles_meta, paths["tilesMetadata"])
        rewrite_artifact_metadata(paths["tilesMetadata"], resolved["ids"], snapshot_date)

    for profile in ("car", "bicycle", "foot"):
        legacy_profile = legacy_osrm / profile
        target_profile = regions.library_path(
            root, paths["osrmDataDir"].relative_to(root) / profile
        )
        if not legacy_profile.is_dir():
            continue
        if is_v1:
            target_profile.mkdir(parents=True, exist_ok=True)
            for legacy_file in sorted(legacy_profile.iterdir()):
                if not legacy_file.is_file():
                    continue
                target_name = legacy_file.name
                if target_name.startswith("tehran."):
                    target_name = "borobiya." + target_name.removeprefix("tehran.")
                move_file(legacy_file, target_profile / target_name)
            if not any(legacy_profile.iterdir()):
                legacy_profile.rmdir()
        else:
            move_tree(legacy_profile, target_profile)
        rewrite_artifact_metadata(
            target_profile / "borobiya.metadata.json", resolved["ids"], snapshot_date
        )

    if legacy_photon_index.is_dir():
        move_tree(legacy_photon_index, target_photon_index)
    if legacy_stamp.is_file():
        move_file(legacy_stamp, paths["photonStamp"])
    elif target_photon_index.is_dir():
        paths["photonStamp"].parent.mkdir(parents=True, exist_ok=True)
        paths["photonStamp"].write_text(f"{merged_sha}\n", encoding="utf-8")

    # command_migrate_project's stdout is a shell-variable contract, so keep
    # the manifest writer's human-readable confirmation out of it.
    with contextlib.redirect_stdout(io.StringIO()):
        regions.command_write_manifest(
            catalog,
            argparse.Namespace(
                data_dir=str(target_dataset),
                dataset="borobiya",
                selection=",".join(resolved["ids"]),
                merged=str(paths["pbf"]),
                osmium_version=str(osmium_version),
                library=str(root),
                snapshot="pinned",
                snapshot_date=snapshot_date.isoformat(),
                source_policy="offline",
            ),
        )
    if is_v1:
        legacy_url = source_plan["iran"][2].get("url")
        if legacy_url and legacy_url != catalog["sources"]["iran"]["url"]:
            migrated_manifest = regions.read_json_object(paths["manifest"])
            migrated_manifest["sources"][0]["migratedFromUrl"] = legacy_url
            regions.write_json_atomically(paths["manifest"], migrated_manifest)

    # The migrated artifacts were built against the old manifest file. Point
    # their provenance at the newly written v3 manifest before setup decides
    # whether their dataset checksum still allows each stage to be skipped.
    manifest_sha256 = regions.sha256_file(paths["manifest"])
    artifact_metadata = [paths["tilesMetadata"]]
    artifact_metadata.extend(
        paths["osrmDataDir"] / profile / "borobiya.metadata.json"
        for profile in ("car", "bicycle", "foot")
    )
    for metadata_path in artifact_metadata:
        payload = regions.read_json_object(metadata_path)
        if payload:
            payload["sourceManifestSha256"] = manifest_sha256
            regions.write_json_atomically(metadata_path, payload)
    if old_manifest_path.is_file():
        old_manifest_path.unlink()

    flags["migrated"] = 1
    flags["tehran"] = 1 if is_v1 else 0
    return flags


def command_migrate_project(catalog: dict, args: argparse.Namespace) -> None:
    try:
        flags = migrate_project_library(
            catalog,
            args.repo_root,
            args.library,
            args.selection,
            args.snapshot_date,
            args.dataset_dir,
            getattr(args, "legacy_osrm_dir", None),
        )
    except MigrationUnsafe as error:
        note(f"project library migration skipped: {error}")
        flags = {"migrated": 0, "tehran": 0, "skipped": 1}
    regions.emit_shell({
        "PROJECT_LIBRARY_MIGRATED": flags.get("migrated", 0),
        "PROJECT_LIBRARY_TEHRAN_MIGRATED": flags.get("tehran", 0),
        "PROJECT_LIBRARY_MIGRATION_SKIPPED": flags.get("skipped", 0),
    })


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--catalog", type=Path, default=regions.CATALOG_PATH)
    subparsers = parser.add_subparsers(dest="command", required=True)

    current = subparsers.add_parser("current")
    current.add_argument("--library", required=True)

    write_current_parser = subparsers.add_parser("write-current")
    write_current_parser.add_argument("--library", required=True)
    write_current_parser.add_argument("--selection", required=True)
    write_current_parser.add_argument("--snapshot-date", required=True)
    write_current_parser.add_argument("--snapshot-mode", default="pinned")
    write_current_parser.add_argument("--dataset-dir", required=True)

    prune = subparsers.add_parser("prune")
    prune.add_argument("--library", required=True)
    prune.add_argument("--selection", required=True)
    prune.add_argument("--snapshot-date", required=True)
    prune.add_argument("--dataset-dir", required=True)
    prune.add_argument("--dry-run", action="store_true")

    migrate = subparsers.add_parser("migrate-project")
    migrate.add_argument("--repo-root", required=True)
    migrate.add_argument("--library", required=True)
    migrate.add_argument("--selection", required=True)
    migrate.add_argument("--snapshot-date", required=True)
    migrate.add_argument("--dataset-dir", required=True)
    migrate.add_argument("--legacy-osrm-dir")

    args = parser.parse_args()
    catalog = regions.load_catalog(args.catalog)
    handlers = {
        "current": command_current,
        "write-current": command_write_current,
        "prune": command_prune,
        "migrate-project": command_migrate_project,
    }
    handlers[args.command](catalog, args)


if __name__ == "__main__":
    main()
