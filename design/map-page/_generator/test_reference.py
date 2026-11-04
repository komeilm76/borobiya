"""Contract tests for the map-page reference images.

They do not compare pixels (the renderer is deterministic, so that would only test Pillow). They
check the things that actually rot in a design folder that has to stay true to the product:

1. a plate is registered but missing on disk, or a PNG is on disk but nobody registers it;
2. a plate on disk is not the phone size the README claims (a stale render after a layout change);
3. the README index and the registry disagree about which plates exist;
4. the icon names used by the new companion plates are not in the vendored MDI font;
5. the numbers printed on the live plate contradict the recorded trip they are derived from.

Run from `design/map-page/_generator`:  python -m pytest . -q
"""
from __future__ import annotations

import os
import re
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN = os.path.abspath(os.path.join(HERE, ".."))
CSS = os.path.join(HERE, "assets", "materialdesignicons.css")

sys.path.insert(0, HERE)

import render  # noqa: E402


def screens() -> dict:
    return render.registry()


def readme() -> str:
    with open(os.path.join(DESIGN, "README.md"), encoding="utf-8") as handle:
        return handle.read()


def test_registry_and_disk_agree():
    registered = {path for path, _ in screens().values()}
    on_disk = set()
    for folder in ("design-system", "history", "navigation", "mission", "companions"):
        directory = os.path.join(DESIGN, folder)
        for name in sorted(os.listdir(directory)):
            if name.endswith(".png"):
                on_disk.add(f"{folder}/{name}")
    assert registered == on_disk, (
        f"missing on disk: {sorted(registered - on_disk)}; not registered: {sorted(on_disk - registered)}")


def test_every_plate_is_a_phone_screenshot():
    from PIL import Image

    expected = (786, 1704)
    wrong = {}
    for path, _ in screens().values():
        if path.startswith("design-system/"):    # those plates are spec sheets, not phone screens
            continue
        with Image.open(os.path.join(DESIGN, path)) as image:
            if image.size != expected:
                wrong[path] = image.size
    assert not wrong, f"plates not at {expected}: {wrong}"


def test_readme_lists_every_plate():
    text = readme()
    missing = [path for path, _ in screens().values() if os.path.basename(path) not in text]
    assert not missing, f"plates missing from the README index: {missing}"


def test_companion_plates_only_use_real_icons():
    css = open(CSS, encoding="utf-8").read()
    known = set(re.findall(r"\.mdi-([a-z0-9-]+)::?before", css))
    assert known, "could not read the icon font css"

    import importlib

    used: set[str] = set()
    for module_name in render.SECTIONS.values():
        module = importlib.import_module(module_name)
        source = open(module.__file__, encoding="utf-8").read()
        used.update(re.findall(r'"mdi-([a-z0-9-]+)"', source))
    assert not (used - known), f"icons that would render as a blank box: {sorted(used - known)}"


def test_live_plate_numbers_match_the_route():
    """The sheet said «۲۰۰ متر جلوتر» while the marker was ۳۷۰ متر behind; keep that from returning."""
    from bb import scenario as sc

    total = sum(sc.grid_length(sc.ROUTE_MAIN[i], sc.ROUTE_MAIN[i + 1])
                for i in range(len(sc.ROUTE_MAIN) - 1))
    me = sc.ME_T * total
    ahead = [c for c in sc.COMPANIONS if c["t"] > sc.ME_T]
    assert ahead, "no companion is ahead of me any more"
    gaps = sorted(round(c["t"] * total - me) for c in ahead)
    assert all(40 <= gap <= 400 for gap in gaps), f"distances to companions are not plausible: {gaps}"


@pytest.mark.parametrize("key,needle", [
    ("c03-companions-live", "۱۹۰ متر جلوتر"),
    ("c05-companion-status", "۲۱۰ متر"),
    ("c07-share-history", "از تاریخ"),
    ("c10-companions-offline", "ذخیره‌شده در این دستگاه"),
])
def test_key_plates_keep_their_promise(key, needle):
    import inspect

    module = __import__("screens.companions", fromlist=["SCREENS"])
    assert key in module.SCREENS
    path, fn = module.SCREENS[key]
    assert inspect.getsource(fn).find(needle) != -1, f"{path} lost its copy: {needle}"
    screen = fn()
    assert (screen.w, screen.h) == (393, 852)
