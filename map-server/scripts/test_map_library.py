#!/usr/bin/env python3
"""Unit tests for map_library.py — run: python3 -m unittest test_map_library -v"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import map_library  # noqa: E402
import regions  # noqa: E402

CATALOG = regions.load_catalog()
SNAPSHOT_DATE = regions.catalog_snapshot_date(CATALOG)


class CurrentAndPruneTests(unittest.TestCase):
    def test_current_rejects_symlinked_pointer_file(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root = base / "library"
            root.mkdir()
            outside = base / "current.json"
            outside.write_text("{}", encoding="utf-8")
            (root / "current.json").symlink_to(outside)

            with self.assertRaises(SystemExit):
                map_library.load_current(root)

    def test_current_rejects_nonstandard_dataset_pointer(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "library"
            paths = regions.library_paths(root, SNAPSHOT_DATE, ["ir-tehran"])
            paths["datasetDir"].mkdir(parents=True)
            map_library.write_current(
                CATALOG,
                root,
                "ir-tehran",
                SNAPSHOT_DATE.isoformat(),
                "pinned",
                paths["datasetDir"],
            )
            pointer_path = root / "current.json"
            pointer = json.loads(pointer_path.read_text(encoding="utf-8"))
            pointer["datasetDir"] = str(root / "datasets" / "other")
            pointer_path.write_text(json.dumps(pointer), encoding="utf-8")

            with self.assertRaises(SystemExit):
                map_library.command_current(
                    CATALOG, argparse.Namespace(library=str(root))
                )

    def test_current_link_preflight_does_not_advance_pointer_on_conflict(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "library"
            paths = regions.library_paths(root, SNAPSHOT_DATE, ["ir-tehran"])
            paths["datasetDir"].mkdir(parents=True)
            map_library.write_current(
                CATALOG,
                root,
                "ir-tehran",
                SNAPSHOT_DATE.isoformat(),
                "pinned",
                paths["datasetDir"],
            )
            current_file = root / "current.json"
            previous_pointer = current_file.read_bytes()
            current_link = root / "datasets" / "current"
            current_link.unlink()
            current_link.mkdir()

            with self.assertRaises(SystemExit):
                map_library.write_current(
                    CATALOG,
                    root,
                    "ir-tehran",
                    SNAPSHOT_DATE.isoformat(),
                    "pinned",
                    paths["datasetDir"],
                )

            self.assertEqual(current_file.read_bytes(), previous_pointer)

    def test_write_current_and_prune_to_one_release(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "library"
            paths = regions.library_paths(root, SNAPSHOT_DATE, ["ir-tehran"])
            paths["datasetDir"].mkdir(parents=True)

            payload = map_library.write_current(
                CATALOG,
                root,
                "ir-tehran",
                SNAPSHOT_DATE.isoformat(),
                "pinned",
                paths["datasetDir"],
            )
            self.assertEqual(payload["areas"], ["ir-tehran"])
            loaded = map_library.load_current(root)
            self.assertEqual(loaded["datasetDir"], str(paths["datasetDir"]))
            self.assertTrue((root / "datasets" / "current").is_symlink())
            self.assertEqual(
                (root / "datasets" / "current").resolve(), paths["datasetDir"]
            )

            old_date = "2026-09-01"
            for relative in (
                f"sources/asia/ir/iran/{old_date}",
                f"sources/asia/ir/iran/{SNAPSHOT_DATE.isoformat()}",
                f"crops/asia/ir/tehran/{old_date}",
                f"crops/asia/ir/tehran/{SNAPSHOT_DATE.isoformat()}",
                f"sources/europe/de/hessen/{old_date}",
                f"datasets/{old_date}/oldselection",
            ):
                directory = root / relative
                directory.mkdir(parents=True)
                (directory / "placeholder").write_text("x", encoding="utf-8")

            removed = map_library.prune_library(
                CATALOG,
                root,
                "ir-tehran",
                SNAPSHOT_DATE.isoformat(),
                paths["datasetDir"],
            )
            self.assertEqual(len(removed), 3)
            self.assertFalse((root / f"sources/asia/ir/iran/{old_date}").exists())
            self.assertFalse((root / f"crops/asia/ir/tehran/{old_date}").exists())
            self.assertFalse((root / f"datasets/{old_date}").exists())
            self.assertTrue(paths["datasetDir"].is_dir())
            # An unselected country keeps its one retained release until it is
            # selected for an update; prune is scoped to selected countries.
            self.assertTrue((root / f"sources/europe/de/hessen/{old_date}").is_dir())


class ProjectMigrationTests(unittest.TestCase):
    def make_catalog(self, source_bytes: bytes) -> dict:
        catalog = copy.deepcopy(CATALOG)
        catalog["sources"]["iran"]["md5"] = hashlib.md5(source_bytes).hexdigest()
        catalog["sources"]["iran"]["bytes"] = len(source_bytes)
        return catalog

    def write_legacy_tehran(
        self,
        repo: Path,
        catalog: dict,
        *,
        source_matches: bool = True,
        crop_bbox: list[float] | None = None,
    ) -> tuple[bytes, bytes]:
        data = repo / "map-server" / "data"
        source_dir = data / "source"
        source_dir.mkdir(parents=True)
        source_bytes = b"fake legacy Iran source"
        stored_source_bytes = source_bytes if source_matches else b"different bytes"
        (source_dir / "iran-latest.osm.pbf").write_bytes(stored_source_bytes)

        crop_bytes = b"legacy Tehran crop"
        (data / "tehran.osm.pbf").write_bytes(crop_bytes)
        snapshot = catalog["snapshot"]
        pinned = catalog["sources"]["iran"]
        manifest = {
            "region": "tehran",
            "source": {
                "provider": snapshot["provider"],
                "url": regions.LEGACY_IRAN_LATEST_URL,
                "dataDate": snapshot["dataDate"],
                "dataTimestamp": snapshot["dataTimestamp"],
                "file": "iran-latest.osm.pbf",
                "bytes": len(source_bytes),
                "md5": pinned["md5"],
                "sha256": hashlib.sha256(source_bytes).hexdigest(),
                "license": snapshot["license"],
            },
            "crop": {
                "file": str(data / "tehran.osm.pbf"),
                "bbox": crop_bbox if crop_bbox is not None else [51.0, 35.5, 51.7, 35.9],
                "strategy": "smart",
                "osmiumToolVersion": "1.16.0",
                "sha256": hashlib.sha256(crop_bytes).hexdigest(),
            },
            "attribution": "© OpenStreetMap contributors",
            "attributionUrl": "https://www.openstreetmap.org/copyright",
        }
        (data / "tehran.source.json").write_text(
            json.dumps(manifest), encoding="utf-8"
        )
        (data / "tehran.pmtiles").write_bytes(b"legacy pmtiles")
        (data / "tehran.metadata.json").write_text(
            json.dumps({
                "region": "tehran",
                "sourcePbfSha256": hashlib.sha256(crop_bytes).hexdigest(),
            }),
            encoding="utf-8",
        )

        osrm_root = repo / "map-server" / "osrm" / "data"
        for profile in ("car", "bicycle", "foot"):
            profile_dir = osrm_root / profile
            profile_dir.mkdir(parents=True)
            (profile_dir / "tehran.osrm").write_bytes(f"{profile} graph".encode())
            (profile_dir / "tehran.metadata.json").write_text(
                json.dumps({
                    "region": "tehran",
                    "sourcePbfSha256": hashlib.sha256(crop_bytes).hexdigest(),
                }),
                encoding="utf-8",
            )

        photon_index = repo / "map-server" / "photon" / "data" / "photon_data"
        photon_index.mkdir(parents=True)
        (photon_index / "index").write_text("legacy photon", encoding="utf-8")
        return source_bytes, crop_bytes

    def test_migrates_verified_legacy_tehran_into_standard_library(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo = base / "repo"
            library = base / "library"
            source_bytes = b"fake legacy Iran source"
            catalog = self.make_catalog(source_bytes)
            _source, crop_bytes = self.write_legacy_tehran(repo, catalog)
            paths = regions.library_paths(library, SNAPSHOT_DATE, ["ir-tehran"])

            flags = map_library.migrate_project_library(
                catalog,
                repo,
                library,
                "ir-tehran",
                SNAPSHOT_DATE.isoformat(),
                paths["datasetDir"],
                repo / "map-server" / "osrm" / "data",
            )

            self.assertEqual(flags, {"migrated": 1, "tehran": 1, "skipped": 0})
            source_target = library / regions.source_relative_path(
                catalog, "iran", SNAPSHOT_DATE
            )
            crop_target = library / regions.crop_relative_path(
                regions.area_index(catalog)["ir-tehran"], SNAPSHOT_DATE
            )
            self.assertEqual(source_target.read_bytes(), source_bytes)
            self.assertEqual(crop_target.read_bytes(), crop_bytes)
            self.assertEqual(paths["pbf"].read_bytes(), crop_bytes)
            self.assertTrue(paths["pmtiles"].is_file())
            self.assertTrue((paths["osrmDataDir"] / "car" / "borobiya.osrm").is_file())
            self.assertTrue((paths["photonDataDir"] / "photon_data" / "index").is_file())
            manifest_sha256 = hashlib.sha256(paths["manifest"].read_bytes()).hexdigest()
            tiles_metadata = json.loads(paths["tilesMetadata"].read_text(encoding="utf-8"))
            self.assertEqual(tiles_metadata["sourceManifestSha256"], manifest_sha256)
            osrm_metadata = json.loads(
                (paths["osrmDataDir"] / "car" / "borobiya.metadata.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(osrm_metadata["sourceManifestSha256"], manifest_sha256)
            self.assertEqual(
                paths["photonStamp"].read_text(encoding="utf-8").strip(),
                hashlib.sha256(crop_bytes).hexdigest(),
            )
            self.assertFalse((repo / "map-server" / "data" / "tehran.osm.pbf").exists())
            self.assertFalse((repo / "map-server" / "data" / "tehran.source.json").exists())

            manifest = json.loads(paths["manifest"].read_text(encoding="utf-8"))
            self.assertEqual(manifest["version"], 3)
            self.assertEqual(manifest["sources"][0]["migratedFromUrl"], regions.LEGACY_IRAN_LATEST_URL)
            regions.command_verify_manifest(
                catalog,
                argparse.Namespace(
                    manifest=str(paths["manifest"]),
                    pbf=str(paths["pbf"]),
                    selection="ir-tehran",
                    bbox="51.0,35.5,51.7,35.9",
                    snapshot="pinned",
                    snapshot_date=SNAPSHOT_DATE.isoformat(),
                    library=str(library),
                ),
            )

    def test_migration_rejects_legacy_source_filename_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo = base / "repo"
            library = base / "library"
            source_bytes = b"fake legacy Iran source"
            catalog = self.make_catalog(source_bytes)
            self.write_legacy_tehran(repo, catalog)
            outside = base / "outside.osm.pbf"
            outside.write_bytes(source_bytes)
            manifest_path = repo / "map-server" / "data" / "tehran.source.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["source"]["file"] = "../../outside.osm.pbf"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            paths = regions.library_paths(library, SNAPSHOT_DATE, ["ir-tehran"])

            with self.assertRaises(map_library.MigrationUnsafe):
                map_library.migrate_project_library(
                    catalog,
                    repo,
                    library,
                    "ir-tehran",
                    SNAPSHOT_DATE.isoformat(),
                    paths["datasetDir"],
                    repo / "map-server" / "osrm" / "data",
                )

            self.assertEqual(outside.read_bytes(), source_bytes)
            self.assertTrue(
                (repo / "map-server" / "data" / "source" / "iran-latest.osm.pbf").is_file()
            )
            self.assertFalse(paths["pbf"].exists())

    def test_migration_refuses_external_legacy_osrm_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo = base / "repo"
            library = base / "library"
            source_bytes = b"fake legacy Iran source"
            catalog = self.make_catalog(source_bytes)
            self.write_legacy_tehran(repo, catalog)
            external_osrm = base / "external-osrm"
            external_profile = external_osrm / "car"
            external_profile.mkdir(parents=True)
            external_graph = external_profile / "graph.osrm"
            external_graph.write_bytes(b"user graph")
            paths = regions.library_paths(library, SNAPSHOT_DATE, ["ir-tehran"])

            with self.assertRaises(map_library.MigrationUnsafe):
                map_library.migrate_project_library(
                    catalog,
                    repo,
                    library,
                    "ir-tehran",
                    SNAPSHOT_DATE.isoformat(),
                    paths["datasetDir"],
                    external_osrm,
                )

            self.assertEqual(external_graph.read_bytes(), b"user graph")
            self.assertTrue(
                (repo / "map-server" / "data" / "source" / "iran-latest.osm.pbf").is_file()
            )
            self.assertFalse(paths["pbf"].exists())

    def test_migration_rejects_symlinked_legacy_artifacts_before_moving_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo = base / "repo"
            library = base / "library"
            source_bytes = b"fake legacy Iran source"
            catalog = self.make_catalog(source_bytes)
            self.write_legacy_tehran(repo, catalog)
            outside = base / "outside.graph"
            outside.write_bytes(b"external graph")
            profile = repo / "map-server" / "osrm" / "data" / "car"
            (profile / "external.graph").symlink_to(outside)
            paths = regions.library_paths(library, SNAPSHOT_DATE, ["ir-tehran"])

            with self.assertRaises(map_library.MigrationUnsafe):
                map_library.migrate_project_library(
                    catalog,
                    repo,
                    library,
                    "ir-tehran",
                    SNAPSHOT_DATE.isoformat(),
                    paths["datasetDir"],
                    repo / "map-server" / "osrm" / "data",
                )

            self.assertTrue((repo / "map-server" / "data" / "tehran.osm.pbf").is_file())
            self.assertTrue((repo / "map-server" / "data" / "tehran.source.json").is_file())
            self.assertTrue((profile / "external.graph").is_symlink())
            self.assertEqual(outside.read_bytes(), b"external graph")
            self.assertFalse(paths["pbf"].exists())

    def test_v1_migration_rejects_wrong_crop_bbox_before_moving_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo = base / "repo"
            library = base / "library"
            source_bytes = b"fake legacy Iran source"
            catalog = self.make_catalog(source_bytes)
            self.write_legacy_tehran(
                repo,
                catalog,
                crop_bbox=[51.1, 35.5, 51.7, 35.9],
            )
            paths = regions.library_paths(library, SNAPSHOT_DATE, ["ir-tehran"])
            legacy_source = repo / "map-server" / "data" / "source" / "iran-latest.osm.pbf"
            legacy_crop = repo / "map-server" / "data" / "tehran.osm.pbf"

            with self.assertRaises(map_library.MigrationUnsafe):
                map_library.migrate_project_library(
                    catalog,
                    repo,
                    library,
                    "ir-tehran",
                    SNAPSHOT_DATE.isoformat(),
                    paths["datasetDir"],
                    repo / "map-server" / "osrm" / "data",
                )

            self.assertEqual(legacy_source.read_bytes(), source_bytes)
            self.assertTrue(legacy_crop.is_file())
            source_target = library / regions.source_relative_path(
                catalog, "iran", SNAPSHOT_DATE
            )
            self.assertFalse(source_target.exists())
            self.assertFalse(paths["pbf"].exists())

    def test_v2_migration_rejects_wrong_crop_bbox_before_moving_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo = base / "repo"
            library = base / "library"
            data = repo / "map-server" / "data"
            source_dir = data / "source"
            crop_dir = data / "crops"
            source_dir.mkdir(parents=True)
            crop_dir.mkdir(parents=True)

            source_bytes = b"legacy Iran source for v2"
            crop_bytes = b"legacy Tehran crop for v2"
            merged_bytes = b"legacy merged Tehran dataset for v2"
            catalog = self.make_catalog(source_bytes)
            source_path = source_dir / "iran-latest.osm.pbf"
            crop_path = crop_dir / "ir-tehran.osm.pbf"
            merged_path = data / "borobiya.osm.pbf"
            source_path.write_bytes(source_bytes)
            crop_path.write_bytes(crop_bytes)
            merged_path.write_bytes(merged_bytes)
            snapshot = catalog["snapshot"]
            pinned = catalog["sources"]["iran"]
            manifest = {
                "version": 2,
                "dataset": "borobiya",
                "areas": ["ir-tehran"],
                "bbox": [51.0, 35.5, 51.7, 35.9],
                "sources": [{
                    "id": "iran",
                    "provider": snapshot["provider"],
                    "url": pinned["url"],
                    "dataDate": snapshot["dataDate"],
                    "dataTimestamp": snapshot["dataTimestamp"],
                    "file": source_path.name,
                    "bytes": len(source_bytes),
                    "md5": pinned["md5"],
                    "sha256": hashlib.sha256(source_bytes).hexdigest(),
                    "license": snapshot["license"],
                }],
                "crops": [{
                    "area": "ir-tehran",
                    "file": str(crop_path),
                    "bbox": [51.1, 35.5, 51.7, 35.9],
                    "strategy": "smart",
                    "sha256": hashlib.sha256(crop_bytes).hexdigest(),
                }],
                "merged": {
                    "file": str(merged_path),
                    "sha256": hashlib.sha256(merged_bytes).hexdigest(),
                    "osmiumToolVersion": "1.16.0",
                },
            }
            manifest_path = data / "borobiya.source.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            paths = regions.library_paths(library, SNAPSHOT_DATE, ["ir-tehran"])
            source_target = library / regions.source_relative_path(
                catalog, "iran", SNAPSHOT_DATE
            )

            with self.assertRaises(map_library.MigrationUnsafe):
                map_library.migrate_project_library(
                    catalog,
                    repo,
                    library,
                    "ir-tehran",
                    SNAPSHOT_DATE.isoformat(),
                    paths["datasetDir"],
                    repo / "map-server" / "osrm" / "data",
                )

            self.assertTrue(source_path.is_file())
            self.assertTrue(crop_path.is_file())
            self.assertTrue(merged_path.is_file())
            self.assertFalse(source_target.exists())
            self.assertFalse(paths["pbf"].exists())

    def test_migration_skips_without_moving_when_legacy_source_differs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo = base / "repo"
            library = base / "library"
            source_bytes = b"fake legacy Iran source"
            catalog = self.make_catalog(source_bytes)
            self.write_legacy_tehran(repo, catalog, source_matches=False)
            paths = regions.library_paths(library, SNAPSHOT_DATE, ["ir-tehran"])

            with self.assertRaises(map_library.MigrationUnsafe):
                map_library.migrate_project_library(
                    catalog,
                    repo,
                    library,
                    "ir-tehran",
                    SNAPSHOT_DATE.isoformat(),
                    paths["datasetDir"],
                    repo / "map-server" / "osrm" / "data",
                )
            self.assertTrue((repo / "map-server" / "data" / "tehran.osm.pbf").is_file())
            self.assertFalse(paths["pbf"].exists())


if __name__ == "__main__":
    unittest.main()
