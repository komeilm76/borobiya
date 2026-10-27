"""Offline regression tests for source caching and manifest retries in the shipped shell script."""
from __future__ import annotations

import copy
import hashlib
import json
import os
import shlex
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("prepare-regions-pbf.sh")
sys.path.insert(0, str(SCRIPT.parent))
import regions  # noqa: E402


def shell_function(name: str) -> str:
    source = SCRIPT.read_text(encoding="utf-8")
    return name + "() {" + source.split(name + "() {", 1)[1].split("\n}\n", 1)[0] + "\n}"


class GeofabrikErrorTests(unittest.TestCase):
    def test_http_failures_explain_expired_pin_without_repinning_or_leaking_proxy(self):
        function = shell_function("download_geofabrik_file")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            curl = root / "curl"
            curl.write_text('#!/bin/sh\nprintf "%s" "$FAKE_STATUS"\nexit "$FAKE_EXIT"\n')
            curl.chmod(0o755)
            script = ('set -euo pipefail\nfail() { printf "%s\\n" "$*" >&2; exit 1; }\n'
                      + function + '\ndownload_geofabrik_file '
                      'https://download.geofabrik.de/asia/iran-261018.osm.pbf '
                      '"$FAKE_OUTPUT" iran\n')
            for status, curl_exit, expected in (
                ("404", "22", "Geofabrik HTTP 404"),
                ("410", "22", "Geofabrik HTTP 410"),
                ("404", "56", "HTTPS proxy/no_proxy"),  # network error after HTTP status
                ("403", "22", "HTTP 403"),
                ("000", "7", "HTTPS proxy/no_proxy"),
                ("200", "0", ""),
            ):
                with self.subTest(status=status):
                    output = root / "download"
                    result = subprocess.run(["bash", "-c", script], capture_output=True, text=True,
                                            env={**os.environ, "PATH": f"{root}:{os.environ['PATH']}",
                                                 "https_proxy": "http://token:private@proxy:2080",
                                                 "FAKE_STATUS": status, "FAKE_EXIT": curl_exit,
                                                 "FAKE_OUTPUT": str(output)}, check=False)
                    self.assertEqual(result.returncode, 0 if curl_exit == "0" else 42 if curl_exit == "22" and status in ("404", "410") else 1)
                    self.assertIn(expected, result.stderr)
                    self.assertNotIn("token:private", result.stdout + result.stderr)
                    self.assertFalse(output.exists())  # The fake curl never writes to disk.


class ManifestRetryTests(unittest.TestCase):
    def test_shell_manifest_writer_passes_snapshot_spec_to_real_regions_cli(self):
        """The resolved mode 'date' must never be supplied as --snapshot."""
        catalog = copy.deepcopy(regions.load_catalog())
        snapshot_date = regions.parse_snapshot_date("2026-10-26")
        source_bytes = b"verified fake Iran source"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            library = root / "library"
            source = library / regions.source_relative_path(catalog, "iran", snapshot_date)
            source.parent.mkdir(parents=True)
            source.write_bytes(source_bytes)
            regions.write_source_metadata(
                catalog, library, "iran", snapshot_date,
                md5=hashlib.md5(source_bytes).hexdigest(),
                sha256=hashlib.sha256(source_bytes).hexdigest(),
            )
            paths = regions.library_paths(library, snapshot_date, ["ir"])
            paths["datasetDir"].mkdir(parents=True)
            paths["pbf"].write_bytes(b"fake merged PBF")
            catalog_path = root / "catalog.json"
            catalog_path.write_text(json.dumps(catalog), encoding="utf-8")

            # Inject only the fixture catalog; the shell function still invokes
            # the shipped Python CLI and writes a real library manifest.
            python = root / "bin" / "python3"
            python.parent.mkdir()
            python.write_text(
                "#!/bin/sh\n"
                f"if [ \"$1\" = {shlex.quote(str(SCRIPT.parent / 'regions.py'))} ]; then\n"
                "  shift\n"
                f"  exec {shlex.quote(sys.executable)} {shlex.quote(str(SCRIPT.parent / 'regions.py'))}"
                f" --catalog {shlex.quote(str(catalog_path))} \"$@\"\n"
                "fi\n"
                f"exec {shlex.quote(sys.executable)} \"$@\"\n",
                encoding="utf-8",
            )
            python.chmod(0o755)
            command = ("set -euo pipefail\n" + shell_function("write_dataset_manifest")
                       + "\nwrite_dataset_manifest\n")
            for snapshot, mode in (("2026-10-26", "date"), ("latest", "latest")):
                with self.subTest(snapshot=snapshot):
                    paths["manifest"].unlink(missing_ok=True)
                    result = subprocess.run(
                        ["bash", "-c", command], capture_output=True, text=True,
                        env={**os.environ, "PATH": f"{python.parent}:{os.environ['PATH']}",
                             "SCRIPT_DIR": str(SCRIPT.parent),
                             "MAP_DATA_DIR": str(paths["datasetDir"]),
                             "MAP_REGION": "borobiya", "MAP_REGION_IDS": "ir",
                             "merged_pbf": str(paths["pbf"]), "osmium_version": "1.16.0",
                             "MAP_LIBRARY_DIR": str(library), "MAP_SNAPSHOT": snapshot,
                             "MAP_SNAPSHOT_MODE": mode, "MAP_SNAPSHOT_DATE": "2026-10-26",
                             "MAP_SOURCE_POLICY": "offline"}, check=False,
                    )
                    self.assertEqual(result.returncode, 0, result.stderr)
                    manifest = json.loads(paths["manifest"].read_text(encoding="utf-8"))
                    self.assertEqual(manifest["snapshot"]["date"], "2026-10-26")
                    self.assertEqual(manifest["snapshot"]["mode"], mode)
                    self.assertEqual(manifest["sources"][0]["md5"], hashlib.md5(source_bytes).hexdigest())
                    verified = subprocess.run(
                        [sys.executable, str(SCRIPT.parent / "regions.py"),
                         "--catalog", str(catalog_path), "verify-manifest",
                         "--manifest", str(paths["manifest"]), "--pbf", str(paths["pbf"]),
                         "--selection", "ir", "--snapshot-date", "2026-10-26",
                         "--library", str(library)],
                        capture_output=True, text=True, check=False,
                    )
                    self.assertEqual(verified.returncode, 0, verified.stderr)

    def test_orphan_merge_is_reused_only_when_reverified_bytes_match(self):
        command = ("set -euo pipefail\n"
                   "fail() { printf '%s\\n' \"$*\" >&2; exit 1; }\n"
                   "sha256_file() { sha256sum \"$1\" | awk '{print $1}'; }\n"
                   + shell_function("install_merged_pbf")
                   + '\ninstall_merged_pbf "$candidate" "$target" "$provenance"\n')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            candidate, target, provenance = (root / name for name in ("candidate", "target", "manifest"))
            env = {**os.environ, "candidate": str(candidate), "target": str(target),
                   "provenance": str(provenance)}
            candidate.write_bytes(b"same verified merge")
            target.write_bytes(b"same verified merge")
            result = subprocess.run(["bash", "-c", command], env=env, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(candidate.exists())
            self.assertEqual(target.read_bytes(), b"same verified merge")
            self.assertIn("Reusing byte-identical", result.stdout)

            candidate.write_bytes(b"different verified merge")
            result = subprocess.run(["bash", "-c", command], env=env, capture_output=True, text=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("differs from the verified re-merge", result.stderr)
            self.assertEqual(target.read_bytes(), b"same verified merge")
            self.assertEqual(candidate.read_bytes(), b"different verified merge")

            result = subprocess.run(["bash", "-c", command], env={**env, "MAP_CROP_OVERWRITE": "1"},
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(target.read_bytes(), b"different verified merge")

            target.unlink()
            target.symlink_to(root / "protected")
            candidate.write_bytes(b"new merge")
            result = subprocess.run(["bash", "-c", command], env=env, capture_output=True, text=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertTrue(target.is_symlink())
            self.assertEqual(candidate.read_bytes(), b"new merge")

    def test_full_retry_reuses_cache_and_fetches_missing_sources_safely(self):
        """Exercise the shipped shell against a cached source and fake HTTP responses."""
        catalog = copy.deepcopy(regions.load_catalog())
        snapshot_date = regions.parse_snapshot_date("2026-10-26")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script_dir = root / "project" / "map-server" / "scripts"
            script_dir.mkdir(parents=True)
            script = script_dir / SCRIPT.name
            script.write_bytes(SCRIPT.read_bytes())
            (script_dir / "regions.py").touch()
            library = root / "library"
            source_bytes = b"fixture Iran PBF from a verified cached source"
            source = library / regions.source_relative_path(catalog, "iran", snapshot_date)
            source.parent.mkdir(parents=True)
            source.write_bytes(source_bytes)
            regions.write_source_metadata(
                catalog, library, "iran", snapshot_date,
                md5=hashlib.md5(source_bytes).hexdigest(),
                sha256=hashlib.sha256(source_bytes).hexdigest(),
            )
            paths = regions.library_paths(library, snapshot_date, ["ir"])
            paths["datasetDir"].mkdir(parents=True)
            paths["pbf"].write_bytes(source_bytes)  # previous merge, before manifest failure
            catalog_path = root / "catalog.json"
            catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
            bin_dir = root / "bin"
            bin_dir.mkdir()
            python = bin_dir / "python3"
            python.write_text(
                "#!/bin/sh\n"
                f"if [ \"$1\" = {shlex.quote(str(script_dir / 'regions.py'))} ]; then\n"
                "  shift\n"
                f"  exec {shlex.quote(sys.executable)} {shlex.quote(str(SCRIPT.parent / 'regions.py'))}"
                f" --catalog {shlex.quote(str(catalog_path))} \"$@\"\n"
                "fi\n"
                f"exec {shlex.quote(sys.executable)} \"$@\"\n",
                encoding="utf-8",
            )
            python.chmod(0o755)
            osmium = bin_dir / "osmium"
            osmium.write_text(
                "#!/bin/bash\n"
                "case \"$1\" in\n"
                "  --version) echo 'osmium version 1.16.0' ;;\n"
                "  fileinfo) if [[ \"$2\" != --get=* ]]; then test -s \"$2\"; fi ;;\n"
                "  merge) cp -- \"${@: -1}\" \"${2#--output=}\" ;;\n"
                "  *) exit 3 ;;\n"
                "esac\n", encoding="utf-8",
            )
            osmium.chmod(0o755)
            curl = bin_dir / "curl"
            curl.write_text("#!/bin/sh\necho 'unexpected download' >&2\nexit 10\n", encoding="utf-8")
            curl.chmod(0o755)
            env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}",
                   "MAP_LIBRARY_DIR": str(library), "MAP_REGION_IDS": "ir",
                   "MAP_SNAPSHOT": "2026-10-26", "MAP_SOURCE_POLICY": "cache-first"}
            result = subprocess.run(["bash", str(script)], env=env, capture_output=True,
                                    text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Reusing byte-identical unmanifested dataset PBF", result.stdout)
            self.assertNotIn("Downloading Geofabrik", result.stdout)
            self.assertEqual(paths["pbf"].read_bytes(), source_bytes)
            self.assertEqual(json.loads(paths["manifest"].read_text())["snapshot"]["date"],
                             "2026-10-26")

            paths["manifest"].unlink()
            paths["pbf"].write_bytes(b"unknown pre-existing data")
            result = subprocess.run(["bash", str(script)], env=env, capture_output=True,
                                    text=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("differs from the verified re-merge", result.stderr)
            self.assertEqual(paths["pbf"].read_bytes(), b"unknown pre-existing data")
            self.assertFalse(paths["manifest"].exists())

            # A missing source and its sidecar must be fetched before a build;
            # only HTTP 404/410 signals the orchestrator to try another date.
            source.unlink()
            (source.parent / "source.json").unlink()
            source.with_name(source.name + ".md5").unlink()
            remote_source = root / "remote-source"
            remote_md5 = root / "remote-md5"
            remote_source.write_bytes(source_bytes)
            remote_md5.write_text(f"{hashlib.md5(source_bytes).hexdigest()} {source.name}\n")
            curl.write_text(
                "#!/bin/bash\n"
                "destination=''\nurl=''\n"
                "while (( $# )); do\n"
                "  case \"$1\" in -o) destination=$2; shift 2 ;; *) url=$1; shift ;; esac\n"
                "done\n"
                "if [[ \"$FAKE_HTTP\" != 200 && "
                "( \"$FAKE_HTTP\" != PBF404 || \"$url\" == *.osm.pbf ) ]]; then "
                "printf '404'; exit 22; fi\n"
                "if [[ \"$url\" == *.md5 ]]; then cp \"$FAKE_MD5\" \"$destination\"; "
                "else cp \"$FAKE_SOURCE\" \"$destination\"; fi\n"
                "printf '200'\n", encoding="utf-8",
            )
            curl.chmod(0o755)
            online = {**env, "FAKE_SOURCE": str(remote_source), "FAKE_MD5": str(remote_md5)}
            missing = subprocess.run(["bash", str(script), "--sources-only"],
                                     env={**online, "FAKE_HTTP": "404"},
                                     capture_output=True, text=True, check=False)
            self.assertEqual(missing.returncode, 42, missing.stderr)
            self.assertFalse(source.exists())
            self.assertEqual(paths["pbf"].read_bytes(), b"unknown pre-existing data")
            sidecar = source.with_name(source.name + ".md5")
            pbf_unavailable = subprocess.run(["bash", str(script), "--sources-only"],
                                             env={**online, "FAKE_HTTP": "PBF404"},
                                             capture_output=True, text=True, check=False)
            self.assertEqual(pbf_unavailable.returncode, 42, pbf_unavailable.stderr)
            self.assertFalse(sidecar.exists())  # do not persist unverified provenance
            fetched = subprocess.run(["bash", str(script), "--sources-only"],
                                     env={**online, "FAKE_HTTP": "200"},
                                     capture_output=True, text=True, check=False)
            self.assertEqual(fetched.returncode, 0, fetched.stderr)
            self.assertIn("Downloading Geofabrik", fetched.stdout)
            self.assertEqual(source.read_bytes(), source_bytes)
            self.assertEqual(paths["pbf"].read_bytes(), b"unknown pre-existing data")
            source.unlink()
            missing_pbf = subprocess.run(["bash", str(script), "--sources-only"],
                                         env={**online, "FAKE_HTTP": "PBF404"},
                                         capture_output=True, text=True, check=False)
            self.assertEqual(missing_pbf.returncode, 42, missing_pbf.stderr)
            self.assertFalse(source.exists())
            self.assertEqual(paths["pbf"].read_bytes(), b"unknown pre-existing data")
            sidecar.unlink()
            (source.parent / "source.json").unlink()
            remote_md5.write_text(f"{'f' * 32} {source.name}\n")
            mismatched = subprocess.run(["bash", str(script), "--sources-only"],
                                        env={**online, "FAKE_HTTP": "200"},
                                        capture_output=True, text=True, check=False)
            self.assertNotEqual(mismatched.returncode, 42)
            self.assertNotEqual(mismatched.returncode, 0)
            self.assertIn("MD5 mismatch", mismatched.stderr)
            self.assertFalse(source.exists())
            self.assertFalse(sidecar.exists())

            # A corrupt cached PBF must not be accepted, but cache-first can
            # repair it with a same-date download without deleting it first.
            remote_md5.write_text(f"{hashlib.md5(source_bytes).hexdigest()} {source.name}\n")
            source.write_bytes(source_bytes)
            regions.write_source_metadata(
                catalog, library, "iran", snapshot_date,
                md5=hashlib.md5(source_bytes).hexdigest(),
                sha256=hashlib.sha256(source_bytes).hexdigest(),
            )
            source.write_bytes(b"corrupt cached data")
            original = source.read_bytes()
            offline = subprocess.run(["bash", str(script), "--sources-only"],
                                     env={**online, "MAP_SOURCE_POLICY": "offline", "FAKE_HTTP": "200"},
                                     capture_output=True, text=True, check=False)
            self.assertNotEqual(offline.returncode, 0)
            self.assertIn("MD5 mismatch", offline.stderr)
            self.assertEqual(source.read_bytes(), original)
            unavailable = subprocess.run(["bash", str(script), "--sources-only"],
                                         env={**online, "FAKE_HTTP": "PBF404"},
                                         capture_output=True, text=True, check=False)
            self.assertEqual(unavailable.returncode, 42, unavailable.stderr)
            self.assertEqual(source.read_bytes(), original)
            remote_source.write_bytes(b"bad new download")
            bad_download = subprocess.run(["bash", str(script), "--sources-only"],
                                          env={**online, "FAKE_HTTP": "200"},
                                          capture_output=True, text=True, check=False)
            self.assertNotEqual(bad_download.returncode, 0)
            self.assertIn("downloaded source PBF MD5 mismatch", bad_download.stderr)
            self.assertEqual(source.read_bytes(), original)
            remote_source.write_bytes(source_bytes)
            repaired = subprocess.run(["bash", str(script), "--sources-only"],
                                      env={**online, "FAKE_HTTP": "200"},
                                      capture_output=True, text=True, check=False)
            self.assertEqual(repaired.returncode, 0, repaired.stderr)
            self.assertIn("mismatched MD5", repaired.stderr)
            self.assertEqual(source.read_bytes(), source_bytes)
            self.assertEqual(paths["pbf"].read_bytes(), b"unknown pre-existing data")
