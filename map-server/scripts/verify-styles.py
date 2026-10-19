#!/usr/bin/env python3
"""Check the checked-in Martin styles, theme parity, and SVG sprite references."""

from __future__ import annotations

import copy
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MAP_SERVER_DIR = SCRIPT_DIR.parent
STYLES_DIR = MAP_SERVER_DIR / "styles"
SPRITE_DIR = MAP_SERVER_DIR / "sprites" / "borobiya"


def fail(message: str) -> None:
    print(f"verify-styles: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_style(name: str) -> dict:
    path = STYLES_DIR / name
    try:
        style = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read {path}: {error}")
    if not isinstance(style, dict) or style.get("version") != 8:
        fail(f"{path} must be a MapLibre style document with version 8")
    return style


def sprite_ids(expression: object) -> set[str]:
    if not isinstance(expression, list) or len(expression) < 4 or expression[0] != "match":
        fail("poi-icons.icon-image must be a MapLibre match expression")

    ids: set[str] = set()
    index = 3
    while index < len(expression) - 1:
        output = expression[index]
        if not isinstance(output, str):
            fail("poi-icons.icon-image outputs must be sprite IDs")
        ids.add(output)
        index += 2

    fallback = expression[-1]
    if not isinstance(fallback, str):
        fail("poi-icons.icon-image fallback must be a sprite ID")
    ids.add(fallback)
    return ids


def main() -> None:
    light = load_style("light.json")
    dark = load_style("dark.json")

    for key in ("sources", "sprite", "glyphs"):
        if light.get(key) != dark.get(key):
            fail(f"light and dark styles must share {key}")
    if light["sources"].get("tehran", {}).get("type") != "vector":
        fail("styles must define the tehran vector source")
    if light.get("sprite") != "/sprite/borobiya" or light.get("glyphs") != "/font/{fontstack}/{range}":
        fail("styles must use the configured local sprite and glyph endpoints")

    light_layers = light.get("layers")
    dark_layers = dark.get("layers")
    if not isinstance(light_layers, list) or not isinstance(dark_layers, list) or len(light_layers) != len(dark_layers):
        fail("light and dark styles must have matching layer lists")

    paint_differs = False
    layer_ids: set[str] = set()
    for light_layer, dark_layer in zip(light_layers, dark_layers, strict=True):
        if not isinstance(light_layer, dict) or not isinstance(dark_layer, dict):
            fail("every style layer must be an object")
        layer_id = light_layer.get("id")
        if not isinstance(layer_id, str) or layer_id in layer_ids:
            fail(f"invalid or duplicate layer ID: {layer_id!r}")
        layer_ids.add(layer_id)

        light_structure = copy.deepcopy(light_layer)
        dark_structure = copy.deepcopy(dark_layer)
        light_paint = light_structure.pop("paint", None)
        dark_paint = dark_structure.pop("paint", None)
        if light_structure != dark_structure:
            fail(f"non-paint properties differ for layer {layer_id!r}")
        paint_differs |= light_paint != dark_paint

    if not paint_differs:
        fail("light and dark styles must use different layer paint")

    sprite_files = {path.stem for path in SPRITE_DIR.glob("*.svg")}
    if not sprite_files:
        fail(f"no SVG sprites found in {SPRITE_DIR}")
    for path in sorted(SPRITE_DIR.glob("*.svg")):
        try:
            if not ET.parse(path).getroot().tag.endswith("svg"):
                fail(f"{path} is not an SVG document")
        except (OSError, ET.ParseError) as error:
            fail(f"invalid SVG {path}: {error}")

    icons_layer = next((layer for layer in light_layers if layer.get("id") == "poi-icons"), None)
    if icons_layer is None:
        fail("missing poi-icons layer")
    missing = sprite_ids(icons_layer.get("layout", {}).get("icon-image")) - sprite_files
    if missing:
        fail(f"POI icon references have no SVG file: {', '.join(sorted(missing))}")

    print(
        f"OK: light/dark share {len(light['sources'])} source(s) and {len(light_layers)} layers; "
        f"paint differs; {len(sprite_files)} SVG sprites validated"
    )


if __name__ == "__main__":
    main()
