#!/usr/bin/env python3
"""Unit tests for regions.py — run: python3 -m unittest test_regions -v"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
import tempfile
import unittest
from datetime import date
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
        resolved = regions.resolve_selection(CATALOG, "ir-tehran,de-frankfurt")
        self.assertEqual(resolved["ids"], ["ir-tehran", "de-frankfurt"])
        self.assertEqual(resolved["bbox"], [8.44, 35.5, 51.7, 50.23])
        self.assertEqual(resolved["sourceIds"], ["iran", "hessen"])
        self.assertEqual(resolved["languages"], ["fa", "de", "en"])
        self.assertEqual(resolved["approxDownloadMb"], 219 + 330)

    def test_shared_source_downloaded_once(self) -> None:
        resolved = regions.resolve_selection(CATALOG, "de-frankfurt,de-wiesbaden")
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


class SnapshotAndLibraryPathTests(unittest.TestCase):
    def test_library_paths_are_categorized_by_continent_country_city_and_date(self) -> None:
        snapshot_date = date(2026, 10, 18)
        self.assertEqual(
            regions.source_relative_path(CATALOG, "hessen", snapshot_date).as_posix(),
            "sources/europe/de/hessen/2026-10-18/hessen-261018.osm.pbf",
        )
        Frankfurt = regions.area_index(CATALOG)["de-frankfurt"]
        self.assertEqual(
            regions.crop_relative_path(Frankfurt, snapshot_date).as_posix(),
            "crops/europe/de/frankfurt/2026-10-18/de-frankfurt.osm.pbf",
        )
        paths = regions.library_paths("/tmp/example-library", snapshot_date, ["ir-tehran"])
        self.assertTrue(str(paths["datasetDir"]).startswith("/tmp/example-library/datasets/2026-10-18/"))

    def test_explicit_snapshot_uses_official_sidecar_md5(self) -> None:
        expected_md5 = "a" * 32

        def fake_fetch(url: str) -> str:
            filename = url.removesuffix(".md5").rsplit("/", 1)[-1]
            return f"{expected_md5} {filename}"

        descriptor = regions.effective_source(
            CATALOG,
            "iran",
            date(2026, 10, 17),
            library_root="/tmp/example-library",
            policy="cache-first",
            fetcher=fake_fetch,
        )
        self.assertTrue(descriptor["url"].endswith("iran-261017.osm.pbf"))
        self.assertEqual(descriptor["md5"], expected_md5)
        self.assertIsNone(descriptor["bytes"])

    def test_offline_snapshot_uses_cached_source_metadata_without_network(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot_date = date(2026, 10, 17)
            target = root / regions.source_relative_path(CATALOG, "iran", snapshot_date)
            target.parent.mkdir(parents=True)
            target.write_bytes(b"cached source")
            expected_md5 = "b" * 32
            regions.write_json_atomically(
                regions.source_metadata_path(target),
                {
                    "url": regions.dated_source_url(
                        CATALOG["sources"]["iran"]["url"], snapshot_date
                    ),
                    "md5": expected_md5,
                    "bytes": 123,
                },
            )

            descriptor = regions.effective_source(
                CATALOG,
                "iran",
                snapshot_date,
                library_root=root,
                policy="offline",
                fetcher=lambda _url: self.fail("offline policy must not fetch"),
            )
            self.assertEqual(descriptor["md5"], expected_md5)
            self.assertEqual(descriptor["bytes"], 123)

    def test_latest_snapshot_finds_latest_common_date(self) -> None:
        def fake_fetch(url: str) -> str | None:
            filename = url.removesuffix(".md5").rsplit("/", 1)[-1]
            if "-261018.osm.pbf" in url:
                return f"{'c' * 32} {filename}"
            return None

        mode, resolved_date = regions.snapshot_date_for_spec(
            CATALOG,
            "latest",
            ["iran", "hessen"],
            policy="cache-first",
            fetcher=fake_fetch,
            today=date(2026, 10, 20),
        )
        self.assertEqual(mode, "latest")
        self.assertEqual(resolved_date, date(2026, 10, 18))

    def test_latest_snapshot_is_rejected_offline(self) -> None:
        with self.assertRaises(SystemExit):
            regions.snapshot_date_for_spec(
                CATALOG,
                "latest",
                ["iran"],
                policy="offline",
                today=date(2026, 10, 20),
            )

    def test_write_and_verify_manifest_v3(self) -> None:
        catalog = copy.deepcopy(CATALOG)
        snapshot_date = regions.catalog_snapshot_date(catalog)
        source_bytes = b"fake pinned Iran source"
        catalog["sources"]["iran"]["md5"] = hashlib.md5(source_bytes).hexdigest()
        catalog["sources"]["iran"]["bytes"] = len(source_bytes)

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "library"
            source_target = root / regions.source_relative_path(
                catalog, "iran", snapshot_date
            )
            source_target.parent.mkdir(parents=True)
            source_target.write_bytes(source_bytes)
            source_sha = hashlib.sha256(source_bytes).hexdigest()
            regions.write_source_metadata(
                catalog,
                root,
                "iran",
                snapshot_date,
                md5=hashlib.md5(source_bytes).hexdigest(),
                sha256=source_sha,
                data_timestamp=catalog["snapshot"]["dataTimestamp"],
            )

            tehran = regions.area_index(catalog)["ir-tehran"]
            crop_target = root / regions.crop_relative_path(tehran, snapshot_date)
            crop_target.parent.mkdir(parents=True)
            crop_target.write_bytes(b"fake Tehran crop")
            crop_meta = crop_target.with_name("ir-tehran.source.json")
            regions.write_crop_metadata(
                catalog,
                crop_meta,
                crop_target,
                "ir-tehran",
                source_sha,
                "1.16.0",
                snapshot_date,
                root,
            )

            paths = regions.library_paths(root, snapshot_date, ["ir-tehran"])
            paths["datasetDir"].mkdir(parents=True)
            paths["pbf"].write_bytes(b"fake merged dataset")
            regions.command_write_manifest(
                catalog,
                argparse.Namespace(
                    data_dir=str(paths["datasetDir"]),
                    dataset="borobiya",
                    selection="ir-tehran",
                    merged=str(paths["pbf"]),
                    osmium_version="1.16.0",
                    library=str(root),
                    snapshot="pinned",
                    snapshot_date=snapshot_date.isoformat(),
                    source_policy="offline",
                ),
            )

            manifest = json.loads(paths["manifest"].read_text(encoding="utf-8"))
            self.assertEqual(manifest["version"], 3)
            self.assertEqual(manifest["snapshot"]["date"], "2026-10-18")
            self.assertEqual(
                manifest["sources"][0]["libraryRelativePath"],
                "sources/asia/ir/iran/2026-10-18/iran-261018.osm.pbf",
            )
            regions.command_verify_manifest(
                catalog,
                argparse.Namespace(
                    manifest=str(paths["manifest"]),
                    pbf=str(paths["pbf"]),
                    selection="ir-tehran",
                    bbox="51.0,35.5,51.7,35.9",
                    snapshot="pinned",
                    snapshot_date=snapshot_date.isoformat(),
                    library=str(root),
                ),
            )
            regions.command_manifest_library_ready(
                catalog,
                argparse.Namespace(manifest=str(paths["manifest"]), library=str(root)),
            )
            crop_target.rename(crop_target.with_suffix(".missing"))
            with self.assertRaises(SystemExit):
                regions.command_manifest_library_ready(
                    catalog,
                    argparse.Namespace(manifest=str(paths["manifest"]), library=str(root)),
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
