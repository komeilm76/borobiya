#!/usr/bin/env python3
"""Unit tests for regions.py — run: python3 -m unittest test_regions -v"""

from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import regions  # noqa: E402

CATALOG = regions.load_catalog()


class CatalogTests(unittest.TestCase):
    def test_catalog_is_valid(self) -> None:
        self.assertEqual(regions.validate_catalog(CATALOG), [])

    def test_every_source_uses_the_pinned_snapshot(self) -> None:
        for source in CATALOG["sources"].values():
            self.assertIn("-261018.osm.pbf", source["url"])

    def test_only_the_requested_twelve_countries_were_added(self) -> None:
        expected_sources = {
            "af": "afghanistan",
            "am": "armenia",
            "az": "azerbaijan",
            "iq": "iraq",
            "pk": "pakistan",
            "tm": "turkmenistan",
            "sa": "saudi-arabia",
            "om": "oman",
            "bh": "bahrain",
            "kw": "kuwait",
            "qa": "qatar",
            "ae": "united-arab-emirates",
        }
        existing_ids = {"ir", "de", "tr", "fr", "gb", "nl"}
        added = {
            country["id"]: country["source"]
            for country in CATALOG["countries"]
            if country["id"] not in existing_ids
        }
        self.assertEqual(added, expected_sources)
        self.assertEqual(len(CATALOG["countries"]), 18)
        for source_id in expected_sources.values():
            source = CATALOG["sources"][source_id]
            self.assertIsNone(source["md5"])
            self.assertEqual(source["md5Source"], "geofabrik-sidecar")
            self.assertIsNone(source["approxSizeMb"])

    def test_unknown_source_size_is_valid_but_malformed_size_is_rejected(self) -> None:
        catalog = copy.deepcopy(CATALOG)
        catalog["sources"]["afghanistan"]["approxSizeMb"] = None
        self.assertEqual(regions.validate_catalog(catalog), [])
        catalog["sources"]["afghanistan"]["approxSizeMb"] = "unknown"
        self.assertTrue(any(
            "approxSizeMb must be null or a positive integer" in problem
            for problem in regions.validate_catalog(catalog)
        ))


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

    def test_requested_middle_east_and_nearby_countries_are_selectable(self) -> None:
        selection = "af,am,az,iq,pk,tm,sa,om,bh,kw,qa,ae"
        resolved = regions.resolve_selection(CATALOG, selection)
        self.assertEqual(resolved["ids"], selection.split(","))
        self.assertEqual(resolved["bbox"], [34.5, 16.3, 77.8, 42.8])
        self.assertEqual(resolved["sourceIds"], [
            "afghanistan", "armenia", "azerbaijan", "iraq", "pakistan",
            "turkmenistan", "saudi-arabia", "oman", "bahrain", "kuwait",
            "qatar", "united-arab-emirates",
        ])
        self.assertTrue(resolved["approxDownloadSizeUnknown"])
        self.assertEqual(resolved["approxDownloadMb"], 0)
        self.assertFalse(resolved["heavy"])

    def test_known_download_sizes_remain_separate_from_unknown_sizes(self) -> None:
        resolved = regions.resolve_selection(CATALOG, "ir,af")
        self.assertEqual(resolved["approxDownloadMb"], 219)
        self.assertTrue(resolved["approxDownloadSizeUnknown"])

    def test_case_insensitive_ids(self) -> None:
        self.assertEqual(
            regions.resolve_selection(CATALOG, "IR-Tehran")["ids"], ["ir-tehran"]
        )


class SnapshotAndLibraryPathTests(unittest.TestCase):
    def test_library_paths_are_categorized_by_continent_country_city_and_date(self) -> None:
        snapshot_date = date(2026, 10, 18)
        with self.assertRaises(SystemExit):
            regions.library_paths(
                regions.SCRIPT_DIR.parent.parent, snapshot_date, ["ir-tehran"]
            )
        with self.assertRaises(SystemExit):
            regions.resolve_library_root("/")
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

    def test_library_paths_reject_symlinked_storage_roots(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "library"
            outside = Path(temporary) / "outside"
            root.mkdir()
            outside.mkdir()
            (root / "datasets").symlink_to(outside, target_is_directory=True)

            with self.assertRaises(SystemExit):
                regions.library_paths(root, date(2026, 10, 18), ["ir-tehran"])

    def test_library_source_metadata_rejects_symlink_escapes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "library"
            snapshot_date = date(2026, 10, 17)
            target = regions.library_path(
                root, regions.source_relative_path(CATALOG, "iran", snapshot_date)
            )
            target.parent.mkdir(parents=True)
            outside = Path(temporary) / "outside.json"
            outside.write_text("{}", encoding="utf-8")
            regions.source_metadata_path(target).symlink_to(outside)

            with self.assertRaises(SystemExit):
                regions.effective_source(
                    CATALOG,
                    "iran",
                    snapshot_date,
                    library_root=root,
                    policy="offline",
                )

    def test_atomic_json_write_does_not_follow_predictable_temp_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / "manifest.json"
            outside = root / "outside.json"
            predictable_temp = target.with_suffix(target.suffix + ".tmp")
            outside.write_text("untouched", encoding="utf-8")
            predictable_temp.symlink_to(outside)

            regions.write_json_atomically(target, {"ready": True})

            self.assertEqual(outside.read_text(encoding="utf-8"), "untouched")
            self.assertEqual(
                json.loads(target.read_text(encoding="utf-8")), {"ready": True}
            )

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

    def test_pinned_new_source_uses_official_sidecar_md5(self) -> None:
        expected_md5 = "c" * 32
        fetched_urls: list[str] = []

        def fake_fetch(url: str) -> str:
            fetched_urls.append(url)
            filename = url.removesuffix(".md5").rsplit("/", 1)[-1]
            return f"{expected_md5} {filename}"

        descriptor = regions.effective_source(
            CATALOG,
            "afghanistan",
            date(2026, 10, 18),
            library_root="/tmp/example-library",
            policy="cache-first",
            fetcher=fake_fetch,
        )
        self.assertTrue(descriptor["url"].endswith("afghanistan-261018.osm.pbf"))
        self.assertEqual(descriptor["md5"], expected_md5)
        self.assertEqual(fetched_urls, [descriptor["url"] + ".md5"])

    def test_pinned_new_source_uses_cached_official_md5_offline(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot_date = date(2026, 10, 18)
            source_url = regions.dated_source_url(
                CATALOG["sources"]["afghanistan"]["url"], snapshot_date
            )
            target = root / regions.source_relative_path(
                CATALOG, "afghanistan", snapshot_date
            )
            target.parent.mkdir(parents=True)
            expected_md5 = "d" * 32
            regions.write_json_atomically(
                regions.source_metadata_path(target),
                {"url": source_url, "md5": expected_md5, "bytes": 456},
            )

            descriptor = regions.effective_source(
                CATALOG,
                "afghanistan",
                snapshot_date,
                library_root=root,
                policy="offline",
                fetcher=lambda _url: self.fail("offline source lookup must not use network"),
            )

            self.assertEqual(descriptor["md5"], expected_md5)
            self.assertEqual(descriptor["bytes"], 456)

    def test_sidecar_backed_source_does_not_inherit_unknown_data_timestamp(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot_date = date(2026, 10, 18)
            target = root / regions.source_relative_path(
                CATALOG, "afghanistan", snapshot_date
            )
            target.parent.mkdir(parents=True)
            source_bytes = b"new country extract"
            target.write_bytes(source_bytes)

            metadata = regions.write_source_metadata(
                CATALOG,
                root,
                "afghanistan",
                snapshot_date,
                md5=hashlib.md5(source_bytes).hexdigest(),
                sha256=hashlib.sha256(source_bytes).hexdigest(),
            )

            self.assertIsNone(metadata["dataTimestamp"])

    def test_sources_table_keeps_unknown_optional_fields_rectangular(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = io.StringIO()
            # command_sources writes directly to stdout; capture that contract
            # explicitly because the Bash consumer reads this as TSV.
            with redirect_stdout(output):
                regions.command_sources(
                    CATALOG,
                    argparse.Namespace(
                        selection="ir-tehran",
                        snapshot="2026-10-17",
                        source_policy="offline",
                        library=temporary,
                    ),
                )
            fields = output.getvalue().rstrip("\n").split("\t")
            self.assertEqual(len(fields), 11)
            self.assertEqual(fields[0:4], [
                "iran",
                "https://download.geofabrik.de/asia/iran-261017.osm.pbf",
                "iran-261017.osm.pbf",
                "-",
            ])
            self.assertEqual(fields[4:7], ["-", "219", "asia"])
            self.assertEqual(fields[7], "ir")
            self.assertEqual(fields[8], "sources/asia/ir/iran/2026-10-17/iran-261017.osm.pbf")
            self.assertEqual(fields[9], str(Path(temporary) / fields[8]))
            self.assertEqual(fields[10], "2026-10-17")

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

    def test_crop_cache_requires_the_same_osmium_version(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            crop_path = root / "ir-tehran.osm.pbf"
            crop_path.write_bytes(b"cached city crop")
            meta_path = root / "ir-tehran.source.json"
            source_sha = "a" * 64
            snapshot_date = regions.catalog_snapshot_date(CATALOG)
            regions.write_crop_metadata(
                CATALOG,
                meta_path,
                crop_path,
                "ir-tehran",
                source_sha,
                "1.15.0",
                snapshot_date,
            )
            args = argparse.Namespace(
                meta=str(meta_path),
                crop=str(crop_path),
                area="ir-tehran",
                source_sha256=source_sha,
                osmium_version="1.16.0",
                snapshot_date=snapshot_date.isoformat(),
            )
            with self.assertRaises(SystemExit):
                regions.command_verify_crop(CATALOG, args)
            args.osmium_version = "1.15.0"
            regions.command_verify_crop(CATALOG, args)

    def test_crop_cache_verification_rejects_symlink_escapes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root = base / "library"
            snapshot_date = regions.catalog_snapshot_date(CATALOG)
            crop_path = regions.library_path(
                root,
                regions.crop_relative_path(
                    regions.area_index(CATALOG)["ir-tehran"], snapshot_date
                ),
            )
            crop_path.parent.mkdir(parents=True)
            crop_path.write_bytes(b"cached Tehran crop")
            meta_path = crop_path.with_name("ir-tehran.source.json")
            source_sha = "a" * 64
            regions.write_crop_metadata(
                CATALOG,
                meta_path,
                crop_path,
                "ir-tehran",
                source_sha,
                "1.16.0",
                snapshot_date,
                root,
            )
            args = argparse.Namespace(
                meta=str(meta_path),
                crop=str(crop_path),
                area="ir-tehran",
                source_sha256=source_sha,
                osmium_version="1.16.0",
                snapshot_date=snapshot_date.isoformat(),
                library=str(root),
            )

            outside_crop = base / "outside.osm.pbf"
            outside_crop.write_bytes(b"cached Tehran crop")
            crop_path.unlink()
            crop_path.symlink_to(outside_crop)
            with self.assertRaises(SystemExit):
                regions.command_verify_crop(CATALOG, args)

            crop_path.unlink()
            crop_path.write_bytes(b"cached Tehran crop")
            outside_meta = base / "outside.source.json"
            outside_meta.write_bytes(meta_path.read_bytes())
            meta_path.unlink()
            meta_path.symlink_to(outside_meta)
            with self.assertRaises(SystemExit):
                regions.command_verify_crop(CATALOG, args)

    def test_v2_manifest_accepts_pinned_sidecar_checksum_for_new_country(self) -> None:
        catalog = copy.deepcopy(CATALOG)
        snapshot_date = regions.catalog_snapshot_date(catalog)
        source_id = "afghanistan"
        source_url = catalog["sources"][source_id]["url"]
        source_bytes = b"fake pinned Afghanistan source"
        source_md5 = hashlib.md5(source_bytes).hexdigest()
        source_sha = hashlib.sha256(source_bytes).hexdigest()
        area_bbox = regions.area_index(catalog)["af"]["bbox"]

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            pbf_path = root / "borobiya.osm.pbf"
            pbf_bytes = b"fake merged Afghanistan dataset"
            pbf_path.write_bytes(pbf_bytes)
            manifest_path = root / "borobiya.source.json"
            manifest = {
                "version": 2,
                "areas": ["af"],
                "bbox": area_bbox,
                "sources": [{
                    "id": source_id,
                    "provider": catalog["snapshot"]["provider"],
                    "license": catalog["snapshot"]["license"],
                    "url": source_url,
                    "dataDate": snapshot_date.isoformat(),
                    "file": source_url.rsplit("/", 1)[-1],
                    "bytes": len(source_bytes),
                    "md5": source_md5,
                    "sha256": source_sha,
                }],
                "crops": [{
                    "area": "af",
                    "strategy": "whole-source",
                    "sha256": source_sha,
                }],
                "merged": {
                    "file": str(pbf_path),
                    "sha256": hashlib.sha256(pbf_bytes).hexdigest(),
                    "osmiumToolVersion": "1.16.0",
                },
            }
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            regions.command_verify_manifest(
                catalog,
                argparse.Namespace(
                    manifest=str(manifest_path),
                    pbf=str(pbf_path),
                    selection="af",
                    bbox=",".join(str(value) for value in area_bbox),
                    snapshot="pinned",
                    snapshot_date=snapshot_date.isoformat(),
                    library=None,
                ),
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
            crop_bytes = b"fake Tehran crop"
            crop_target.write_bytes(crop_bytes)
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
            verify_args = argparse.Namespace(
                manifest=str(paths["manifest"]),
                pbf=str(paths["pbf"]),
                selection="ir-tehran",
                bbox="51.0,35.5,51.7,35.9",
                snapshot="pinned",
                snapshot_date=snapshot_date.isoformat(),
                library=str(root),
            )
            regions.command_verify_manifest(catalog, verify_args)
            altered_manifest = copy.deepcopy(manifest)
            altered_manifest["storage"]["librarySchemaVersion"] = True
            paths["manifest"].write_text(json.dumps(altered_manifest), encoding="utf-8")
            with self.assertRaises(SystemExit):
                regions.command_verify_manifest(catalog, verify_args)
            altered_manifest = copy.deepcopy(manifest)
            altered_manifest["version"] = True
            paths["manifest"].write_text(json.dumps(altered_manifest), encoding="utf-8")
            with self.assertRaises(SystemExit):
                regions.command_verify_manifest(catalog, verify_args)
            altered_manifest = copy.deepcopy(manifest)
            altered_manifest["storage"]["datasetRelativePath"] = "datasets/wrong/path"
            paths["manifest"].write_text(json.dumps(altered_manifest), encoding="utf-8")
            with self.assertRaises(SystemExit):
                regions.command_verify_manifest(catalog, verify_args)
            paths["manifest"].write_text(json.dumps(manifest), encoding="utf-8")
            external_pbf = root.parent / "external.osm.pbf"
            external_pbf.write_bytes(paths["pbf"].read_bytes())
            external_manifest = copy.deepcopy(manifest)
            external_manifest["merged"]["file"] = str(external_pbf)
            paths["manifest"].write_text(json.dumps(external_manifest), encoding="utf-8")
            external_args = copy.deepcopy(verify_args)
            external_args.pbf = str(external_pbf)
            with self.assertRaises(SystemExit):
                regions.command_verify_manifest(catalog, external_args)
            paths["manifest"].write_text(json.dumps(manifest), encoding="utf-8")
            library_args = argparse.Namespace(
                manifest=str(paths["manifest"]),
                library=str(root),
                osmium_version="1.16.0",
            )
            regions.command_manifest_library_ready(catalog, library_args)
            library_args.osmium_version = "1.15.0"
            with self.assertRaises(SystemExit):
                regions.command_manifest_library_ready(catalog, library_args)
            library_args.osmium_version = "1.16.0"
            source_target.write_bytes(b"tampered source")
            with self.assertRaises(SystemExit):
                regions.command_manifest_library_ready(catalog, library_args)
            source_target.write_bytes(source_bytes)
            crop_target.write_bytes(b"tampered crop")
            with self.assertRaises(SystemExit):
                regions.command_manifest_library_ready(catalog, library_args)
            crop_target.write_bytes(crop_bytes)
            crop_target.rename(crop_target.with_suffix(".missing"))
            with self.assertRaises(SystemExit):
                regions.command_manifest_library_ready(
                    catalog,
                    argparse.Namespace(manifest=str(paths["manifest"]), library=str(root)),
                )


class ManifestVerificationTests(unittest.TestCase):
    def test_non_numeric_manifest_bbox_is_rejected_cleanly(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            pbf_path = root / "dataset.osm.pbf"
            pbf_path.write_bytes(b"test dataset")
            manifest_path = root / "dataset.source.json"
            manifest_path.write_text(
                json.dumps({
                    "version": 3,
                    "snapshot": {
                        "provider": CATALOG["snapshot"]["provider"],
                        "license": CATALOG["snapshot"]["license"],
                        "date": CATALOG["snapshot"]["dataDate"],
                    },
                    "storage": {
                        "librarySchemaVersion": 1,
                        "datasetFingerprint": regions.dataset_fingerprint(
                            regions.catalog_snapshot_date(CATALOG), ["ir-tehran"]
                        ),
                        "datasetRelativePath": regions.dataset_relative_path(
                            regions.catalog_snapshot_date(CATALOG), ["ir-tehran"]
                        ).as_posix(),
                    },
                    "areas": ["ir-tehran"],
                    "bbox": ["51.0", 35.5, 51.7, 35.9],
                }),
                encoding="utf-8",
            )

            with self.assertRaises(SystemExit):
                regions.command_verify_manifest(
                    CATALOG,
                    argparse.Namespace(
                        manifest=str(manifest_path),
                        pbf=str(pbf_path),
                        selection="ir-tehran",
                        bbox=None,
                        snapshot="pinned",
                        snapshot_date=None,
                    ),
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
            verify_args = argparse.Namespace(
                manifest=str(output_path),
                pbf=str(pbf_path),
                selection="ir-tehran",
                bbox="51.0,35.5,51.7,35.9",
            )
            regions.command_verify_manifest(CATALOG, verify_args)

            migrated["sources"][0]["bytes"] += 1
            output_path.write_text(json.dumps(migrated), encoding="utf-8")
            with self.assertRaises(SystemExit):
                regions.command_verify_manifest(CATALOG, verify_args)

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
