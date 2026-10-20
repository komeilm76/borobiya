#!/usr/bin/env python3
"""Unit tests for regions.py — run: python3 -m unittest test_regions -v"""

from __future__ import annotations

import sys
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

    def test_overlapping_whole_countries_rejected(self) -> None:
        # Germany and Netherlands catalog rectangles intersect; merging both
        # whole extracts could duplicate border objects.
        with self.assertRaises(SystemExit):
            regions.resolve_selection(CATALOG, "de,nl")

    def test_case_insensitive_ids(self) -> None:
        self.assertEqual(
            regions.resolve_selection(CATALOG, "IR-Tehran")["ids"], ["ir-tehran"]
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
