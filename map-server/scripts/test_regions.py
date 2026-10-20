#!/usr/bin/env python3
"""Unit tests for regions.py — run: python3 -m unittest test_regions -v"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import regions  # noqa: E402

CATALOG = regions.load_catalog()


class CatalogTests(unittest.TestCase):
    def test_catalog_is_valid(self) -> None:
        self.assertEqual(regions.validate_catalog(CATALOG), [])

    def test_every_source_is_pinned_to_the_snapshot(self) -> None:
        for source in CATALOG["sources"].values():
            self.assertIn("-261018.osm.pbf", source["url"])


class ResolveTests(unittest.TestCase):
    def test_single_tehran_matches_historical_defaults(self) -> None:
        resolved = regions.resolve_selection(CATALOG, "ir-tehran")
        self.assertEqual(resolved["ids"], ["ir-tehran"])
        self.assertEqual(resolved["bbox"], [51.0, 35.5, 51.7, 35.9])
        self.assertEqual(resolved["sourceIds"], ["iran"])
        self.assertEqual(resolved["languages"], ["fa", "en"])
        self.assertEqual(resolved["defaultLanguage"], "fa")
        self.assertFalse(resolved["heavy"])

    def test_multi_country_union_and_languages(self) -> None:
        resolved = regions.resolve_selection(CATALOG, "ir-tehran,de-Frankfurt")
        self.assertEqual(resolved["ids"], ["ir-tehran", "de-frankfurt"])
        self.assertEqual(resolved["bbox"], [8.44, 35.5, 51.7, 50.23])
        self.assertEqual(resolved["sourceIds"], ["iran", "hessen"])
        self.assertEqual(resolved["languages"], ["fa", "de", "en"])
        self.assertEqual(resolved["approxDownloadMb"], 219 + 330)

    def test_shared_source_downloaded_once(self) -> None:
        resolved = regions.resolve_selection(CATALOG, "de-Frankfurt,de-wiesbaden")
        self.assertEqual(resolved["sourceIds"], ["hessen"])

    def test_whole_country_supersedes_its_cities(self) -> None:
        resolved = regions.resolve_selection(CATALOG, "ir-tehran,ir,ir-Karaj")
        self.assertEqual(resolved["ids"], ["ir"])

    def test_duplicates_collapse_and_order_is_preserved(self) -> None:
        resolved = regions.resolve_selection(CATALOG, "de-berlin,de-berlin,ir-tehran")
        self.assertEqual(resolved["ids"], ["de-berlin", "ir-tehran"])
        self.assertEqual(resolved["primary"], "de-berlin")
        self.assertEqual(resolved["defaultLanguage"], "de")

    def test_english_not_duplicated(self) -> None:
        resolved = regions.resolve_selection(CATALOG, "gb-london")
        self.assertEqual(resolved["languages"], ["en"])

    def test_heavy_whole_country_flagged(self) -> None:
        self.assertTrue(regions.resolve_selection(CATALOG, "de")["heavy"])
        self.assertFalse(regions.resolve_selection(CATALOG, "ir")["heavy"])

    def test_unknown_area_rejected(self) -> None:
        with self.assertRaises(SystemExit):
            regions.resolve_selection(CATALOG, "ir-atlantis")

    def test_empty_selection_rejected(self) -> None:
        with self.assertRaises(SystemExit):
            regions.resolve_selection(CATALOG, "ir-tehran,,de-berlin")

    def test_adjacent_whole_countries_with_overlapping_bboxes_allowed(self) -> None:
        # Germany and Netherlands catalog rectangles intersect, but both are
        # built from the same snapshot and osmium merge emits shared objects once.
        resolved = regions.resolve_selection(CATALOG, "de,nl")
        self.assertEqual(resolved["ids"], ["de", "nl"])
        self.assertEqual(resolved["bbox"], [3.36, 47.27, 15.04, 55.06])
        self.assertEqual(resolved["sourceIds"], ["germany", "netherlands"])
        self.assertEqual(resolved["languages"], ["de", "nl", "en"])
        self.assertTrue(resolved["heavy"])

    def test_all_whole_countries_can_be_selected_together(self) -> None:
        resolved = regions.resolve_selection(CATALOG, "ir,de,tr,fr,gb,nl")
        self.assertEqual(resolved["ids"], ["ir", "de", "tr", "fr", "gb", "nl"])
        self.assertEqual(resolved["bbox"], [-8.65, 24.8, 63.4, 60.86])
        self.assertEqual(resolved["languages"], ["fa", "de", "tr", "fr", "en", "nl"])
        self.assertTrue(resolved["heavy"])

    def test_case_insensitive_ids(self) -> None:
        self.assertEqual(
            regions.resolve_selection(CATALOG, "IR-Tehran")["ids"], ["ir-tehran"]
        )


class ManifestMigrationTests(unittest.TestCase):
    def write_v1_manifest(self, root: Path, *, source_bytes: int) -> tuple[Path, Path]:
        pbf_path = root / "borobiya.osm.pbf"
        pbf_bytes = b"legacy Tehran crop"
        pbf_path.write_bytes(pbf_bytes)
        pinned = CATALOG["sources"]["iran"]
        snapshot = CATALOG["snapshot"]
        manifest = {
            "region": "tehran",
            "source": {
                "provider": snapshot["provider"],
                "url": regions.LEGACY_IRAN_LATEST_URL,
                "dataDate": snapshot["dataDate"],
                "dataTimestamp": snapshot["dataTimestamp"],
                "file": "iran-latest.osm.pbf",
                "bytes": source_bytes,
                "md5": pinned["md5"],
                "sha256": hashlib.sha256(b"pinned Iran source").hexdigest(),
                "license": snapshot["license"],
            },
            "crop": {
                "file": str(pbf_path),
                "bbox": [51.0, 35.5, 51.7, 35.9],
                "strategy": "smart",
                "osmiumToolVersion": "1.16.0",
                "sha256": hashlib.sha256(pbf_bytes).hexdigest(),
            },
            "attribution": "© OpenStreetMap contributors",
            "attributionUrl": "https://www.openstreetmap.org/copyright",
        }
        manifest_path = root / "tehran.source.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        return manifest_path, pbf_path

    def test_v1_latest_url_migrates_when_snapshot_identity_is_exact(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            input_path, pbf_path = self.write_v1_manifest(
                root, source_bytes=CATALOG["sources"]["iran"]["bytes"]
            )
            output_path = root / "borobiya.source.json"

            regions.command_migrate_manifest_v1(
                CATALOG,
                argparse.Namespace(
                    input=str(input_path),
                    output=str(output_path),
                    pbf=str(pbf_path),
                    dataset="borobiya",
                ),
            )

            migrated = json.loads(output_path.read_text(encoding="utf-8"))
            source = migrated["sources"][0]
            self.assertEqual(migrated["version"], 2)
            self.assertEqual(source["url"], CATALOG["sources"]["iran"]["url"])
            self.assertEqual(source["file"], "iran-261018.osm.pbf")
            self.assertEqual(source["migratedFromUrl"], regions.LEGACY_IRAN_LATEST_URL)
            regions.command_verify_manifest(
                CATALOG,
                argparse.Namespace(
                    manifest=str(output_path),
                    pbf=str(pbf_path),
                    selection="ir-tehran",
                    bbox="51.0,35.5,51.7,35.9",
                ),
            )

    def test_v1_latest_url_rejected_when_snapshot_identity_differs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            input_path, pbf_path = self.write_v1_manifest(root, source_bytes=12345)

            with self.assertRaises(SystemExit):
                regions.command_migrate_manifest_v1(
                    CATALOG,
                    argparse.Namespace(
                        input=str(input_path),
                        output=str(root / "borobiya.source.json"),
                        pbf=str(pbf_path),
                        dataset="borobiya",
                    ),
                )


class VerifyPointTests(unittest.TestCase):
    def test_tehran_tile_matches_live_acceptance(self) -> None:
        # Step-13 live run served Tehran at /12/2632/1612.
        self.assertEqual(regions.tile_zxy(51.389, 35.6892), "12/2632/1612")

    def test_all_verify_points_inside_bboxes(self) -> None:
        for country in CATALOG["countries"]:
            for city in country["cities"]:
                bbox = [float(value) for value in city["bbox"]]
                self.assertTrue(regions.point_in_bbox(city["verify"]["routeFrom"], bbox))
                self.assertTrue(regions.point_in_bbox(city["verify"]["routeTo"], bbox))


if __name__ == "__main__":
    unittest.main()
