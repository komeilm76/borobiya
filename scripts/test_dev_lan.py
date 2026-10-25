#!/usr/bin/env python3
"""Regression checks for local mobile GPS TLS and debug-only Android trust."""
import os
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

SCRIPT = Path(__file__).with_name("dev-lan.sh")
IP = "172.16.20.70"


class LanTlsTest(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        self.root = Path(self.workspace.name)
        self.certs = self.root / "certs"
        self.env = dict(os.environ, BOROBIYA_DEV_TLS_DIR=str(self.certs))

    def run_script(self, mode, address=IP, *, env=None):
        return subprocess.run([str(SCRIPT), mode, address], env=env or self.env,
                              capture_output=True, text=True, check=False)

    def test_ip_san_trust_and_repeated_issue(self):
        first = self.run_script("cert")
        self.assertEqual(first.returncode, 0, first.stderr)
        certificate = self.certs / f"{IP}.pem"
        public_ca = self.certs / "ca.crt"
        ca_key = self.certs / "ca.key"
        self.assertTrue(certificate.is_file())
        self.assertTrue(public_ca.is_file())
        self.assertEqual(ca_key.stat().st_mode & 0o077, 0)
        details = subprocess.run(["openssl", "x509", "-in", str(certificate), "-noout", "-text"],
                                 capture_output=True, text=True, check=True).stdout
        self.assertIn(f"IP Address:{IP}", details)
        self.assertIn("TLS Web Server Authentication", details)
        subprocess.run(["openssl", "verify", "-CAfile", str(self.certs / "ca.pem"),
                        str(certificate)], check=True, capture_output=True)
        original = (self.certs / "ca.pem").read_bytes(), certificate.read_bytes()
        again = self.run_script("cert")
        self.assertEqual(again.returncode, 0, again.stderr)
        self.assertEqual(original, ((self.certs / "ca.pem").read_bytes(), certificate.read_bytes()))
        other = self.run_script("cert", "172.16.20.71")
        self.assertEqual(other.returncode, 0, other.stderr)
        self.assertEqual(original[0], (self.certs / "ca.pem").read_bytes())
        self.assertTrue((self.certs / "172.16.20.71.pem").is_file())

    def test_rejects_invalid_ip_without_creating_a_ca(self):
        for value in ("lan.example", "172.16.20.999", "2001:db8::1", "172.16.20.70;touch /tmp/unsafe"):
            self.assertNotEqual(self.run_script("cert", value).returncode, 0)
        self.assertFalse(self.certs.exists())

    def test_http_unsets_tls_and_https_passes_the_ip_cert_to_vite(self):
        binary = self.root / "bin"
        binary.mkdir()
        recorder = self.root / "bun-args"
        fake_bun = binary / "bun"
        fake_bun.write_text("#!/bin/sh\nprintf '%s|%s|%s|%s\\n' \"$*\" \"${BOROBIYA_DEV_TLS_CERT-unset}\" "
                            "\"${BOROBIYA_DEV_TLS_KEY-unset}\" \"$PWD\" > \"$BUN_RECORDER\"\n")
        fake_bun.chmod(0o755)
        env = dict(self.env, PATH=f"{binary}:{os.environ['PATH']}", BUN_RECORDER=str(recorder),
                   BOROBIYA_DEV_TLS_CERT="old", BOROBIYA_DEV_TLS_KEY="old")
        http = self.run_script("http", env=env)
        self.assertEqual(http.returncode, 0, http.stderr)
        self.assertIn("run dev|unset|unset|", recorder.read_text())
        https = self.run_script("https", env=env)
        self.assertEqual(https.returncode, 0, https.stderr)
        self.assertIn(f"run dev|{self.certs / f'{IP}.pem'}|{self.certs / f'{IP}.key'}|",
                      recorder.read_text())

    def test_android_overlay_contains_only_public_ca_and_is_debug_only(self):
        android = self.root / "android"
        main = android / "app/src/main"
        main.mkdir(parents=True)
        (main / "AndroidManifest.xml").write_text("<manifest/>")
        result = self.run_script("android-debug", env=dict(self.env, BOROBIYA_DEV_ANDROID_DIR=str(android)))
        self.assertEqual(result.returncode, 0, result.stderr)
        debug = android / "app/src/debug"
        ca = debug / "res/raw/borobiya_dev_ca.crt"
        self.assertEqual(ca.read_bytes(), (self.certs / "ca.crt").read_bytes())
        self.assertNotIn(b"PRIVATE KEY", ca.read_bytes())
        config = ET.parse(debug / "res/xml/borobiya_dev_network_security_config.xml").getroot()
        self.assertEqual([item.get("src") for item in config.iter("certificates")],
                         ["system", "@raw/borobiya_dev_ca"])
        manifest = ET.parse(debug / "AndroidManifest.xml").getroot()
        attribute = "{http://schemas.android.com/apk/res/android}networkSecurityConfig"
        self.assertEqual(manifest.find("application").get(attribute),
                         "@xml/borobiya_dev_network_security_config")
        self.assertFalse((android / "app/src/main/res/raw/borobiya_dev_ca.crt").exists())


if __name__ == "__main__":
    unittest.main()
