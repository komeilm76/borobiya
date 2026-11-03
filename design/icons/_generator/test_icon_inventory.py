"""Guards for the icon library.

Run from this folder with `python -m pytest test_icon_inventory.py`, or from the repo root with
`python3 -m pytest design/icons/_generator`. They keep the catalog honest on the three things that actually break:

1. an icon added to the client and never regenerated into `icons.json`;
2. an icon name the shipped webfont does not carry, which renders as a blank box in every browser;
3. a catalog page that stops covering an icon it claims to show.
"""
from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from inventory import DESIGN, ROLE_ORDER, collect  # noqa: E402

REPO = os.path.abspath(os.path.join(DESIGN, "..", ".."))
CSS = os.path.join(REPO, "design", "map-page", "_generator", "assets", "materialdesignicons.css")


def committed() -> dict:
    with open(os.path.join(DESIGN, "icons.json"), encoding="utf-8") as handle:
        return json.load(handle)


def font_names() -> set[str]:
    with open(CSS, encoding="utf-8") as handle:
        return set(re.findall(r"\.mdi-([a-z0-9-]+)::before", handle.read()))


def test_committed_inventory_matches_the_client():
    """A new `mdi-*` in a component must be regenerated, or the catalog is out of date."""
    fresh, saved = collect(), committed()
    assert [icon["name"] for icon in fresh["icons"]] == [icon["name"] for icon in saved["icons"]], (
        "icons.json is stale — run `python render.py` in design/icons/_generator"
    )
    assert fresh["totals"] == saved["totals"]


def test_every_icon_exists_in_the_shipped_font():
    """Names are `mdi-*` strings with no compile step; a typo is only caught by comparing with the font."""
    known = font_names()
    missing = [icon["name"] for icon in committed()["icons"] if icon["name"].removeprefix("mdi-") not in known]
    assert not missing, f"not in the Material Design Icons webfont: {missing}"


def test_every_icon_has_a_role_the_catalog_draws():
    """The renderer groups by role; a role it does not know would silently drop the tile."""
    for icon in committed()["icons"]:
        assert icon["role"] in ROLE_ORDER, icon
        assert set(icon["roles"]) <= set(ROLE_ORDER), icon


def test_each_page_image_exists_and_covers_its_icons():
    """Every page the renderer writes must be committed, so the folder can be read without running Python."""
    pages = sorted(name for name in os.listdir(DESIGN) if re.fullmatch(r"\d\d-[a-z-]+\.png", name))
    assert pages, "no catalog pages rendered"
    assert pages[0].startswith("01-overview"), pages
    saved = committed()
    per_page = 5 * 6  # COLS x rows per library page, see render.py
    library_pages = len(pages) - 1
    assert library_pages * per_page >= saved["totals"]["icons"], (
        f"{library_pages} page(s) cannot hold {saved['totals']['icons']} icons"
    )
