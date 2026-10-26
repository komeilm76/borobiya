"""Regression checks for generated native release wiring, without Android SDK/VM."""
from __future__ import annotations

import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from prepare_android_release import ANDROID_NS, SIGNING_MARKER, prepare

ROOT = Path(__file__).resolve().parent.parent


class AndroidWorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.android = Path(self.temporary.name) / "android"
        self.gradle = self.android / "app/build.gradle"
        self.manifest = self.android / "app/src/main/AndroidManifest.xml"
        self.gradle.parent.mkdir(parents=True)
        self.manifest.parent.mkdir(parents=True)
        self.gradle.write_text("apply plugin: 'com.android.application'\nandroid {\n"
                               "    defaultConfig {\n        versionCode 1\n"
                               '        versionName "1.0"\n    }\n}\n', encoding="utf-8")
        self.manifest.write_text('<?xml version="1.0"?><manifest '
                                 'xmlns:android="http://schemas.android.com/apk/res/android">'
                                 '<application android:allowBackup="true" />'
                                 '<uses-permission android:name="android.permission.INTERNET" />'
                                 '</manifest>', encoding="utf-8")

    def test_generated_project_is_versioned_permissioned_and_signed_from_environment(self) -> None:
        prepare(self.android, "v1.2.3", "452")
        text = self.gradle.read_text(encoding="utf-8")
        self.assertIn("versionCode 452", text)
        self.assertIn('versionName "1.2.3"', text)
        self.assertIn("signingConfig signingConfigs.borobiyaRelease", text)
        self.assertIn("System.getenv('BOROBIYA_ANDROID_STORE_PASSWORD')", text)
        self.assertNotIn("release.keystore", text)
        root = ET.parse(self.manifest).getroot()
        permissions = [node.get(f"{{{ANDROID_NS}}}name") for node in root.findall("uses-permission")]
        self.assertEqual(set(permissions), {f"android.permission.{name}" for name in
                                           ("INTERNET", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION")})
        self.assertEqual(len(permissions), 3)  # preexisting INTERNET must not be duplicated
        app = root.find("application")
        self.assertIsNotNone(app)
        self.assertEqual(app.get(f"{{{ANDROID_NS}}}allowBackup"), "false")
        self.assertEqual(app.get(f"{{{ANDROID_NS}}}usesCleartextTraffic"), "false")
        with self.assertRaisesRegex(ValueError, "already configured"):
            prepare(self.android, "v1.2.3", "453")

    def test_invalid_tag_run_number_or_changed_template_does_not_touch_project(self) -> None:
        original_gradle = self.gradle.read_bytes()
        original_manifest = self.manifest.read_bytes()
        for tag, code in (("v1.2", "1"), ("v1.2.3;echo", "1"), ("v1.2.3", "0"),
                          ("v1.2.3", "not-a-number"), ("v1.2.3", "2100000001")):
            with self.assertRaises(ValueError):
                prepare(self.android, tag, code)
        self.gradle.write_text("apply plugin: 'com.android.application'\nversionCode 2\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "version template"):
            prepare(self.android, "v1.2.3", "42")
        self.assertEqual(self.manifest.read_bytes(), original_manifest)
        self.gradle.write_bytes(original_gradle)
        self.assertEqual(self.gradle.read_bytes(), original_gradle)

    def test_workflow_gates_a_signed_tagged_artifact_without_dev_ca(self) -> None:
        workflow = (ROOT / ".github/workflows/android.yml").read_text(encoding="utf-8")
        config = (ROOT / "packages/client/capacitor.config.ts").read_text(encoding="utf-8")
        self.assertIn("tags: ['v*']", workflow)
        self.assertIn("git merge-base --is-ancestor", workflow)
        self.assertIn("environment: production", workflow)
        self.assertIn("permissions:\n  contents: read", workflow)
        self.assertIn("bun install --frozen-lockfile", workflow)
        self.assertIn("bun run build", workflow)
        self.assertIn("bunx cap add android", workflow)
        self.assertIn("bunx cap sync android", workflow)
        self.assertIn("prepare_android_release.py", workflow)
        self.assertIn("./gradlew --no-daemon assembleRelease", workflow)
        self.assertIn("apksigner\" verify", workflow)
        self.assertIn("if-no-files-found: error", workflow)
        self.assertIn("ANDROID_KEYSTORE_BASE64", workflow)
        self.assertIn("ANDROID_PUBLIC_ORIGIN", workflow)
        self.assertIn("server = { androidScheme: \"https\", url: url.origin", config)
        self.assertIn('cleartext: false', config)
        self.assertNotIn("dev-lan.sh", workflow)
        self.assertNotIn("android-debug", workflow)
        self.assertNotIn("ca.crt", workflow)
        self.assertIn(SIGNING_MARKER, (ROOT / "scripts/prepare_android_release.py").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
