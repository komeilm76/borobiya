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
        self, repo: Path, catalog: dict, *, source_matches: bool = True
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
                "bbox": [51.0, 35.5, 51.7, 35.9],
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
