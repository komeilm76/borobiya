"""Offline regression tests for Geofabrik download error handling in the shipped shell script."""
from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("prepare-regions-pbf.sh")


class GeofabrikErrorTests(unittest.TestCase):
    def test_http_failures_explain_expired_pin_without_repinning_or_leaking_proxy(self):
        source = SCRIPT.read_text(encoding="utf-8")
        body = source.split("download_geofabrik_file() {", 1)[1].split("\n}\n", 1)[0]
        function = "download_geofabrik_file() {" + body + "\n}"
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
                ("404", "22", "--snapshot latest --policy cache-first"),
                ("410", "22", "dated snapshot may have expired"),
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
                    self.assertEqual(result.returncode, 0 if curl_exit == "0" else 1)
                    self.assertIn(expected, result.stderr)
                    self.assertNotIn("token:private", result.stdout + result.stderr)
                    self.assertFalse(output.exists())  # The fake curl never writes to disk.
