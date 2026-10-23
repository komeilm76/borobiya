#!/usr/bin/env python3
"""Regression tests for the MAP_BBOX handling in generate-tiles.sh and build-routing.sh.

Both scripts used to open with `MAP_BBOX="${MAP_BBOX:-51.0,35.5,51.7,35.9}"` — Tehran's bounds,
hardcoded as the default for *every* selection, from before areas were selectable. Two things made
that a bug rather than a quirk: `verify-map-pbf.sh` deliberately only enforces the bbox "when the
caller actually configured one", because its author knew the Tehran default "must not make a
Frankfurt dataset invalid" — but a defaulted value is indistinguishable from a configured one by the
time it arrives in the environment; and the resolver the scripts already call prints the selection's
real `UNION_BBOX`, so the correct value was on hand and ignored.

The failure a Berlin run saw was therefore a manifest error blaming the dataset:

    regions: manifest bbox [13.09, 52.34, 13.76, 52.68] does not match ...

These tests run the real scripts in an empty HOME with no network, and assert on which guard stops
them: an unresolved selection must be named as such (before any download, Java check or dataset
touch), a resolved one must inherit its own bounds, and the default selection must keep working.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPTS = {
    "generate-tiles.sh": Path(__file__).resolve().with_name("generate-tiles.sh"),
    "build-routing.sh": Path(__file__).resolve().with_name("build-routing.sh"),
}
GUARD = "MAP_BBOX is not set"
REPO_ROOT = Path(__file__).resolve().parents[2]


def run_script(name: str, env: dict[str, str], home: Path) -> subprocess.CompletedProcess[str]:
    full_env = {"HOME": str(home), "PATH": os.environ["PATH"], "MAP_SOURCE_POLICY": "offline", **env}
    return subprocess.run(
        ["bash", str(SCRIPTS[name])],
        cwd=REPO_ROOT,
        env=full_env,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


class BboxGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.home = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def test_explicit_data_dir_without_bounds_names_the_missing_input(self) -> None:
        """A non-default selection with no way to resolve its bounds must fail *for that reason*."""
        for name in SCRIPTS:
            with self.subTest(script=name):
                result = run_script(
                    name,
                    {"MAP_REGION_IDS": "de-berlin", "MAP_DATA_DIR": str(self.home / "dataset")},
                    self.home,
                )
                self.assertNotEqual(result.returncode, 0, msg=result.stdout + result.stderr)
                self.assertIn(GUARD, result.stderr, msg=result.stderr)
                self.assertIn("loader block", result.stderr, msg="the fix must be named, not just the fault")

    def test_resolved_selection_inherits_its_own_bounds(self) -> None:
        """With no MAP_DATA_DIR the scripts call the resolver, which already printed Berlin's box."""
        for name in SCRIPTS:
            with self.subTest(script=name):
                result = run_script(name, {"MAP_REGION_IDS": "de-berlin"}, self.home)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn(GUARD, result.stderr, msg=result.stderr)
                # It has to get past the bbox guard and stop on the absent dataset instead.
                self.assertIn("borobiya.osm.pbf", result.stderr, msg=result.stderr)

    def test_default_selection_keeps_the_historical_default(self) -> None:
        """Tehran stays Tehran: the pinned default must not start requiring an export."""
        for name in SCRIPTS:
            with self.subTest(script=name):
                result = run_script(name, {"MAP_DATA_DIR": str(self.home / "dataset")}, self.home)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn(GUARD, result.stderr, msg=result.stderr)

    def test_an_explicit_bbox_always_wins(self) -> None:
        for name in SCRIPTS:
            with self.subTest(script=name):
                result = run_script(
                    name,
                    {
                        "MAP_REGION_IDS": "de-berlin",
                        "MAP_DATA_DIR": str(self.home / "dataset"),
                        "MAP_BBOX": "13.09,52.34,13.76,52.68",
                    },
                    self.home,
                )
                self.assertNotIn(GUARD, result.stderr, msg=result.stderr)


if __name__ == "__main__":
    unittest.main()
