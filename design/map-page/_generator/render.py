#!/usr/bin/env python3
"""Render the BoroBiya map-page reference images.

Usage (from design/map-page/_generator):
    python render.py                # every screen
    python render.py nav            # one section (history | navigation | mission | design-system)
    python render.py 01-map-idle    # one screen by key
    python render.py --sheet        # also write a contact sheet per section
"""
from __future__ import annotations

import importlib
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(ROOT, ".."))
sys.path.insert(0, ROOT)

SECTIONS = {
    "design-system": "screens.design_system",
    "history": "screens.history",
    "navigation": "screens.nav",
    "mission": "screens.mission",
}


SECTION_PREFIX = {"design-system": "design-system", "history": "history",
                  "navigation": "navigation", "mission": "mission"}


def registry():
    screens: dict[str, tuple[str, callable]] = {}
    for module_name in SECTIONS.values():
        try:
            module = importlib.import_module(module_name)
        except ModuleNotFoundError:
            continue
        screens.update(getattr(module, "SCREENS", {}))
    return screens


def render(keys: list[str]) -> list[str]:
    screens = registry()
    written = []
    for key in keys:
        if key not in screens:
            raise SystemExit(f"unknown screen: {key}")
        path, fn = screens[key]
        target = os.path.join(OUT, path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        screen = fn()
        screen.img.convert("RGB").save(target, optimize=True)
        written.append(target)
        print(f"  ✓ {path}")
    return written


def contact_sheet(paths: list[str], target: str, cols: int = 4, scale: float = 0.45):
    from PIL import Image, ImageDraw, ImageFont
    thumbs = []
    for path in paths:
        img = Image.open(path)
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
        thumbs.append((os.path.basename(path), img))
    if not thumbs:
        return
    pad = 18
    label_h = 26
    tw, th = thumbs[0][1].size
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (tw + pad) + pad, rows * (th + label_h + pad) + pad), "#1C2B2B")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(os.path.join(ROOT, "assets/fonts/Vazirmatn-Medium.ttf"), 15)
    for index, (name, img) in enumerate(thumbs):
        r, c = divmod(index, cols)
        x = pad + c * (tw + pad)
        y = pad + r * (th + label_h + pad)
        sheet.paste(img, (x, y))
        draw.text((x + 4, y + th + 5), name, font=font, fill="#CFE0DC")
    sheet.save(target, optimize=True)
    print(f"  ✓ sheet {os.path.basename(target)}")


def main(argv: list[str]) -> None:
    args = [a for a in argv if not a.startswith("--")]
    want_sheet = "--sheet" in argv
    screens = registry()
    if not args:
        keys = list(screens)
    elif args[0] in SECTION_PREFIX:
        prefix = SECTION_PREFIX[args[0]]
        keys = [k for k, (path, _) in screens.items() if path.startswith(prefix)]
    else:
        keys = args
    written = render(keys)
    written_pairs = [(k, screens[k][0]) for k in keys]
    if want_sheet:
        by_section: dict[str, list[str]] = {}
        for key, path in written_pairs:
            section = path.split("/")[0]
            by_section.setdefault(section, []).append(os.path.join(OUT, path))
        for section, paths in by_section.items():
            contact_sheet(paths, os.path.join(ROOT, f"_preview-{section}.png"))


if __name__ == "__main__":
    main(sys.argv[1:])
