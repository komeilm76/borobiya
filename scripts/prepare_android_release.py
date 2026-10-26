#!/usr/bin/env python3
"""Prepare a freshly generated Capacitor 8 Android project for an installable release.

The Android tree is generated/ignored, so keep manifest and signing customizations
in a reviewed source file rather than manually editing an untracked local project.
Never put secrets into Gradle source or the application package.
"""

from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ANDROID_NS = "http://schemas.android.com/apk/res/android"
SIGNING_MARKER = "// Borobiya CI release signing (environment only; no stored credentials)"
SIGNING_BLOCK = f"""
{SIGNING_MARKER}
def requiredSigningEnv = [
    'BOROBIYA_ANDROID_KEYSTORE_FILE', 'BOROBIYA_ANDROID_STORE_PASSWORD',
    'BOROBIYA_ANDROID_KEY_ALIAS', 'BOROBIYA_ANDROID_KEY_PASSWORD'
]
if (requiredSigningEnv.any {{ !System.getenv(it) }}) {{
    throw new GradleException('Missing Android release signing configuration')
}}
android {{
    signingConfigs {{
        borobiyaRelease {{
            storeFile file(System.getenv('BOROBIYA_ANDROID_KEYSTORE_FILE'))
            storePassword System.getenv('BOROBIYA_ANDROID_STORE_PASSWORD')
            keyAlias System.getenv('BOROBIYA_ANDROID_KEY_ALIAS')
            keyPassword System.getenv('BOROBIYA_ANDROID_KEY_PASSWORD')
        }}
    }}
    buildTypes {{
        release {{ signingConfig signingConfigs.borobiyaRelease }}
    }}
}}
"""


def prepare(android_dir: Path, tag: str, run_number: str) -> None:
    if not re.fullmatch(r"v\d+\.\d+\.\d+", tag):
        raise ValueError("Release tag must be vMAJOR.MINOR.PATCH")
    if not run_number.isdecimal() or not (1 <= int(run_number) <= 2_100_000_000):
        raise ValueError("Android versionCode must be a positive Play-compatible run number")
    gradle = android_dir / "app/build.gradle"
    manifest = android_dir / "app/src/main/AndroidManifest.xml"
    text = gradle.read_text(encoding="utf-8")
    if SIGNING_MARKER in text:
        raise ValueError("Android release signing already configured; expected a fresh cap add")
    if not text.startswith("apply plugin: 'com.android.application'"):
        raise ValueError("Unexpected Capacitor Android build script")
    for pattern, replacement in (
        (r"(?m)^(\s*versionCode )1$", rf"\g<1>{run_number}"),
        (r'(?m)^(\s*versionName )"1\.0"$', rf'\g<1>"{tag[1:]}"'),
    ):
        text, count = re.subn(pattern, replacement, text)
        if count != 1:
            raise ValueError("Unexpected Capacitor Android version template")
    tree = ET.parse(manifest)
    root = tree.getroot()
    app = root.find("application")
    if app is None:
        raise ValueError("Android application manifest missing")
    for permission in ("INTERNET", "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"):
        name = f"android.permission.{permission}"
        matches = [node for node in root.findall("uses-permission")
                   if node.get(f"{{{ANDROID_NS}}}name") == name]
        if len(matches) > 1:
            raise ValueError(f"Duplicate Android permission: {name}")
        if not matches:
            ET.SubElement(root, "uses-permission", {f"{{{ANDROID_NS}}}name": name})
    # Do not back up session data or allow cleartext production WebView requests.
    app.set(f"{{{ANDROID_NS}}}allowBackup", "false")
    app.set(f"{{{ANDROID_NS}}}usesCleartextTraffic", "false")
    ET.register_namespace("android", ANDROID_NS)
    # All validation happens before either file is changed.
    gradle.write_text(text + SIGNING_BLOCK, encoding="utf-8")
    ET.indent(tree, space="    ")
    tree.write(manifest, encoding="utf-8", xml_declaration=True)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("Usage: prepare_android_release.py <android-directory> <tag> <version-code>")
    try:
        prepare(Path(sys.argv[1]), sys.argv[2], sys.argv[3])
    except (OSError, ET.ParseError, ValueError) as error:
        sys.exit(f"Android release preparation failed: {error}")
