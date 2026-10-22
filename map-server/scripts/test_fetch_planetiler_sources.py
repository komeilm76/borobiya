#!/usr/bin/env python3
"""Unit tests for fetch-planetiler-sources.sh — run: python3 -m unittest test_fetch_planetiler_sources -v

The claim under test is about network behavior, so these run the real script against a local HTTP server and
count its requests: a source that is already in the library cache must not be requested again (that is the whole
reason Planetiler never has to reach a flaky host), and a source that cannot be fetched must stop the build with
a message naming the file and the destination path rather than a Java stack trace from inside Planetiler's
downloader.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
import unittest
import urllib.request
import zipfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SCRIPT = Path(__file__).resolve().with_name("fetch-planetiler-sources.sh")
GENERATE_TILES = Path(__file__).resolve().with_name("generate-tiles.sh")
FILENAMES = (
    "natural_earth_vector.sqlite.zip",
    "lake_centerline.shp.zip",
    "water-polygons-split-3857.zip",
)


def write_zip(path: Path, label: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("content.txt", label)


class CountingHandler(SimpleHTTPRequestHandler):
    """A plain static server, plus the log of what was asked for — the tests assert on that log.

    The request list is a class attribute because `socketserver` instantiates the handler itself and gives no
    way to pass constructor arguments through `ThreadingHTTPServer`; `setUp` binds a fresh list per test so
    counting is not shared between cases.
    """

    requests: list[str]

    def do_GET(self) -> None:  # noqa: N802 (http.server API)
        type(self).requests.append(self.path)
        super().do_GET()

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        pass  # keep test output readable


class FetchPlanetilerSourcesTest(unittest.TestCase):
    def setUp(self) -> None:
        if shutil.which("curl") is None:
            self.skipTest("curl is required by the script under test")
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.upload = self.root / "upload"
        self.upload.mkdir()
        for name in FILENAMES:
            write_zip(self.upload / name, f"payload for {name}")
        self.requests: list[str] = []
        handler = type("CountedHandler", (CountingHandler,), {"requests": self.requests})
        handler = partial(handler, directory=str(self.upload))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 5)
        self.addCleanup(self.server.shutdown)
        self.addCleanup(self.server.server_close)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.library = self.root / "library"
        self.cache = self.library / "planetiler-sources"

    def run_script(self, *, policy: str | None = None, urls: dict[str, str] | None = None,
                   data_dir: Path | None = None) -> subprocess.CompletedProcess[str]:
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(self.root / "home"),
            "MAP_LIBRARY_DIR": str(self.library),
            "MAP_NATURAL_EARTH_URL": f"{self.base}/natural_earth_vector.sqlite.zip",
            "MAP_LAKE_CENTERLINES_URL": f"{self.base}/lake_centerline.shp.zip",
            "MAP_WATER_POLYGONS_URL": f"{self.base}/water-polygons-split-3857.zip",
        }
        if policy is not None:
            env["MAP_SOURCE_POLICY"] = policy
        for key, value in (urls or {}).items():
            env[key] = value
        if data_dir is not None:
            env["MAP_DATA_DIR"] = str(data_dir)
        return subprocess.run([str(SCRIPT)], capture_output=True, text=True, env=env, check=False, timeout=120)

    # --- the cache behavior that keeps Planetiler off the network -------------------------------------

    def test_fetches_every_missing_source_and_records_provenance(self) -> None:
        result = self.run_script()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.requests), 3, self.requests)
        for name in FILENAMES:
            self.assertTrue((self.cache / name).is_file(), name)
            self.assertTrue((self.cache / f"{name}.sha256").is_file(), name)
            with zipfile.ZipFile(self.cache / name) as archive:
                self.assertEqual(archive.read("content.txt"), b"payload for " + name.encode())
        self.assertIn("verified", result.stdout)
        self.assertNotIn(".part", result.stdout + result.stderr)

    def test_a_warm_cache_makes_no_request_at_all(self) -> None:
        self.run_script()
        self.requests.clear()

        result = self.run_script()

        self.assertEqual(result.returncode, 0, result.stderr)
        # This is the entire point of the step: Planetiler only downloads a source whose file is absent, so a
        # present file means no size probe and no 10-second timeout to abort the build.
        self.assertEqual(self.requests, [], "a cached source must not be fetched again")
        self.assertEqual(result.stdout.count("cached"), 3, result.stdout)
        self.assertIn("Planetiler overlap sources ready", result.stdout)

    def test_refresh_policy_refetches_and_replaces_the_cached_copy(self) -> None:
        self.run_script()
        self.requests.clear()
        (self.cache / FILENAMES[0]).write_text("stale")

        result = self.run_script(policy="refresh")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.requests), 3, self.requests)
        with zipfile.ZipFile(self.cache / FILENAMES[0]) as archive:
            self.assertEqual(archive.read("content.txt"), b"payload for " + FILENAMES[0].encode())
        self.assertIn("re-fetching", result.stdout)

    # --- failure modes: named, actionable, and leaving nothing half-written ---------------------------

    def test_offline_refuses_without_touching_the_network(self) -> None:
        result = self.run_script(policy="offline")

        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.requests, [], "offline mode must not reach out")
        for name in FILENAMES:
            self.assertIn(str(self.cache / name), result.stderr)
        self.assertIn("offline", result.stderr)
        self.assertIn("MAP_WATER_POLYGONS_URL", result.stderr, "the mirror override is named in the advice")
        self.assertIn("fetch-planetiler-sources.sh", result.stderr)

    def test_an_archive_that_is_not_a_zip_is_never_accepted(self) -> None:
        (self.upload / "broken.zip").write_bytes(b"not a zip, just an error page someone saved")

        result = self.run_script(urls={"MAP_WATER_POLYGONS_URL": f"{self.base}/broken.zip"})

        self.assertEqual(result.returncode, 1)
        self.assertIn("not a readable archive", result.stderr)
        self.assertFalse((self.cache / "water-polygons-split-3857.zip").exists())
        self.assertEqual(list(self.cache.glob("*.part")), [], "a rejected download must not linger")
        # The other two are still fine and stay; one bad source does not poison the cache.
        self.assertTrue((self.cache / FILENAMES[1]).is_file())

    def test_a_broken_mirror_names_the_source_it_refused(self) -> None:
        # An override replaces the URL list for that source alone, so a broken mirror is a hard failure by
        # design — but it has to say which file it gave up on, since that is what the operator copies in.
        (self.upload / "broken.zip").write_bytes(b"junk")

        result = self.run_script(urls={"MAP_LAKE_CENTERLINES_URL": f"{self.base}/broken.zip"})

        self.assertEqual(result.returncode, 1)
        self.assertIn("lake centerlines", result.stderr)
        self.assertIn(str(self.cache / "lake_centerline.shp.zip"), result.stderr)

    def test_unknown_source_policy_is_refused_before_any_work(self) -> None:
        result = self.run_script(policy="sometimes")

        self.assertEqual(result.returncode, 1)
        self.assertIn("cache-first, refresh, or offline", result.stderr)
        self.assertEqual(self.requests, [])

    def test_relative_cache_directory_is_refused(self) -> None:
        result = self.run_script(urls={"MAP_PLANETILER_SOURCES_DIR": "relative/path"})

        self.assertEqual(result.returncode, 1)
        self.assertIn("absolute path", result.stderr)

    # --- the library layout the pipeline actually uses ------------------------------------------------

    def test_a_copy_left_in_the_dataset_directory_is_moved_not_redownloaded(self) -> None:
        data_dir = self.root / "dataset"
        legacy = data_dir / "data" / "sources"
        write_zip(legacy / "water-polygons-split-3857.zip", "already here")

        result = self.run_script(data_dir=data_dir)

        self.assertEqual(result.returncode, 0, result.stderr)
        # Only the two genuinely missing sources are fetched; the 900 MB one is reused. Older checkouts kept
        # these inside the dataset bundle, and nobody should re-download them because the cache moved.
        self.assertEqual(len(self.requests), 2, self.requests)
        self.assertIn("moved the copy that was inside the dataset directory", result.stdout)
        self.assertFalse((legacy / "water-polygons-split-3857.zip").exists())
        with zipfile.ZipFile(self.cache / "water-polygons-split-3857.zip") as archive:
            self.assertEqual(archive.read("content.txt"), b"already here")

    def test_cache_directory_override_is_honored(self) -> None:
        elsewhere = self.root / "shared-external-cache"

        result = self.run_script(urls={"MAP_PLANETILER_SOURCES_DIR": str(elsewhere)})

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(all((elsewhere / name).is_file() for name in FILENAMES))
        self.assertFalse(self.cache.exists(), "an explicit cache must not also create the default one")

    # --- invocation pins ------------------------------------------------------------------------------

    def test_both_scripts_parse(self) -> None:
        if shutil.which("bash") is None:
            self.skipTest("bash is required")
        for path in (SCRIPT, GENERATE_TILES):
            result = subprocess.run(["bash", "-n", str(path)], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, f"{path.name}: {result.stderr}")

    def test_generate_tiles_points_planetiler_at_the_shared_cache(self) -> None:
        text = GENERATE_TILES.read_text()

        self.assertIn('--download-dir="$MAP_PLANETILER_SOURCES_DIR"', text)
        self.assertIn("fetch-planetiler-sources.sh", text)
        # The tile-weight file is another download gated on --download; the build does not use those stats,
        # and every source Planetiler wants is one more 10-second probe that can abort the run.
        self.assertIn("--download-osm-tile-weights=false", text)
        # Passing that would defeat the cache — it makes Planetiler re-probe every source on every run — so the
        # pin is on the commands rather than the file: the script explains the decision in a comment, and a
        # comment must neither satisfy nor break a behavioral assertion.
        commands = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#"))
        for flag in ("--refresh_sources", "--refresh-sources", "refresh_sources="):
            self.assertNotIn(flag, commands)


if __name__ == "__main__":
    unittest.main()
