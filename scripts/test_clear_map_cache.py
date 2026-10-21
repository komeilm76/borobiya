from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("clear-map-cache.py")
SPEC = importlib.util.spec_from_file_location("clear_map_cache", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
clear_map_cache = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = clear_map_cache
SPEC.loader.exec_module(clear_map_cache)


class ClearMapCacheTests(unittest.TestCase):
    def test_plan_and_apply_remove_only_map_data_and_preserve_tools(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo = base / "repo"
            library = base / "library"
            (library / "sources" / "asia" / "ir").mkdir(parents=True)
            (library / "sources" / "asia" / "ir" / "iran.pbf").write_bytes(b"source")
            dataset = library / "datasets" / "2026-10-18" / "fingerprint"
            (dataset / "routing" / "car").mkdir(parents=True)
            (dataset / "routing" / "car" / "graph.osrm").write_bytes(b"graph")
            (library / "datasets" / "current").symlink_to(
                "2026-10-18/fingerprint", target_is_directory=True
            )
            (library / "current.json").write_text("{}", encoding="utf-8")
            (library / ".compose-unconfigured" / "dataset").mkdir(parents=True)

            data = repo / "map-server" / "data"
            (data / "source").mkdir(parents=True)
            (data / "source" / "legacy.pbf").write_bytes(b"legacy")
            (data / "planetiler-1.20.0.jar").write_bytes(b"tool jar")
            (data / "notes.txt").write_text("keep", encoding="utf-8")
            photon_data = repo / "map-server" / "photon" / "data" / "photon_data"
            photon_data.mkdir(parents=True)
            (photon_data / "index").write_bytes(b"index")
            photon_jar = repo / "map-server" / "photon" / "photon-1.3.0.jar"
            photon_jar.parent.mkdir(parents=True, exist_ok=True)
            photon_jar.write_bytes(b"tool jar")

            plan = clear_map_cache.build_cache_plan(library, repo)
            self.assertTrue(any(target.path == library / "sources" for target in plan))
            self.assertTrue(any(target.path == library / "datasets" for target in plan))
            self.assertTrue(any(target.path == photon_data.parent for target in plan))
            self.assertFalse(any(target.path == data / "planetiler-1.20.0.jar" for target in plan))
            self.assertFalse(any(target.path == data / "notes.txt" for target in plan))
            self.assertFalse(any(target.path == photon_jar for target in plan))

            clear_map_cache.apply_cache_plan(plan)

            self.assertFalse((library / "sources").exists())
            self.assertFalse((library / "datasets").exists())
            self.assertFalse((library / "current.json").exists())
            self.assertFalse((data / "source").exists())
            self.assertFalse(photon_data.parent.exists())
            self.assertEqual((data / "planetiler-1.20.0.jar").read_bytes(), b"tool jar")
            self.assertEqual((data / "notes.txt").read_text(encoding="utf-8"), "keep")
            self.assertEqual(photon_jar.read_bytes(), b"tool jar")
            self.assertEqual(clear_map_cache.build_cache_plan(library, repo), [])

    def test_configured_library_path_rejects_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo = base / "repo"
            external = base / "external"
            external.mkdir()
            library_link = base / "library-link"
            library_link.symlink_to(external, target_is_directory=True)

            with self.assertRaises(SystemExit):
                clear_map_cache.resolve_library_path(str(library_link), repo)

    def test_plan_refuses_symlinked_library_cache_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo = base / "repo"
            library = base / "library"
            outside = base / "outside"
            outside.mkdir()
            (outside / "keep.txt").write_text("external", encoding="utf-8")
            library.mkdir()
            (library / "sources").symlink_to(outside, target_is_directory=True)

            with self.assertRaises(RuntimeError):
                clear_map_cache.build_cache_plan(library, repo)

            self.assertEqual((outside / "keep.txt").read_text(encoding="utf-8"), "external")

    def test_apply_refuses_library_root_replaced_by_symlink_after_preview(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo = base / "repo"
            library = base / "library"
            (library / "sources").mkdir(parents=True)
            (library / "sources" / "source.pbf").write_bytes(b"managed cache")
            plan = clear_map_cache.build_cache_plan(library, repo)

            outside = base / "outside"
            (outside / "sources").mkdir(parents=True)
            protected = outside / "sources" / "source.pbf"
            protected.write_bytes(b"do not delete")
            library.rename(base / "old-library")
            library.symlink_to(outside, target_is_directory=True)

            with self.assertRaises(RuntimeError):
                clear_map_cache.apply_cache_plan(plan)

            self.assertEqual(protected.read_bytes(), b"do not delete")

    def test_library_with_only_unknown_files_is_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            repo = base / "repo"
            library = base / "library"
            library.mkdir()
            unknown = library / "important.txt"
            unknown.write_text("keep", encoding="utf-8")

            plan = clear_map_cache.build_cache_plan(library, repo)

            self.assertFalse(any(target.boundary == library for target in plan))
            self.assertTrue(unknown.is_file())


if __name__ == "__main__":
    unittest.main()
