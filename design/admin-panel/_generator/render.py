#!/usr/bin/env python3
"""Render the BoroBiya admin-panel reference images.

Usage (from design/admin-panel/_generator):
    python render.py                # every screen
    python render.py dashboard      # one section
    python render.py a-dash-overview --sheet
"""
from __future__ import annotations

import importlib
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(ROOT, ".."))
sys.path.insert(0, ROOT)

SECTIONS = {
    "design-system": "sections.design_system",
    "dashboard": "sections.dashboard",
    "services": "sections.services",
    "users": "sections.users",
    "system": "sections.system",
    "states": "sections.states",
}


def registry():
    screens = {}
    for module_name in SECTIONS.values():
        try:
            module = importlib.import_module(module_name)
        except ModuleNotFoundError:
            continue
        screens.update(getattr(module, "SCREENS", {}))
    return screens


def render(keys):
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
        written.append(path)
        print(f"  ✓ {path}")
    return written


def sheet(section):
    from PIL import Image

    screens = {k: v for k, v in registry().items() if v[0].startswith(section + "/")}
    if not screens:
        raise SystemExit(f"no screens for section {section}")
    thumbs = []
    for key in screens:
        path, fn = screens[key]
        target = os.path.join(OUT, path)
        if not os.path.exists(target):
            screen = fn()
            screen.img.convert("RGB").save(target, optimize=True)
        image = Image.open(target)
        image.thumbnail((520, 340))
        thumbs.append((path, image))
    cols = 3
    rows = (len(thumbs) + cols - 1) // cols
    pad, cap = 16, 26
    cell_w = max(t[1].width for t in thumbs) + pad
    cell_h = max(t[1].height for t in thumbs) + pad + cap
    canvas = Image.new("RGB", (cols * cell_w + pad, rows * cell_h + pad), "#1D2B2A")
    from PIL import ImageDraw, ImageFont

    font_path = os.path.join(ROOT, "..", "..", "map-page", "_generator", "assets", "fonts",
                             "Vazirmatn-Regular.ttf")
    font = ImageFont.truetype(font_path, 13) if os.path.exists(font_path) else None
    draw = ImageDraw.Draw(canvas)
    for index, (path, image) in enumerate(thumbs):
        cx = pad + (index % cols) * cell_w
        cy = pad + (index // cols) * cell_h
        canvas.paste(image, (cx, cy + cap))
        draw.text((cx + 4, cy + 4), os.path.basename(path), fill="#9DB4AE", font=font)
    target = os.path.join(ROOT, f"_preview-{section}.png")
    canvas.save(target, optimize=True)
    print(f"  ✓ sheet {os.path.basename(target)}")


def main(argv):
    show_sheet = "--sheet" in argv
    args = [a for a in argv if not a.startswith("--")]
    screens = registry()
    if not args:
        render(list(screens))
    elif args[0] in SECTIONS:
        render([k for k, v in screens.items() if v[0].startswith(args[0] + "/")])
        if show_sheet:
            sheet(args[0])
    else:
        render(args)
        for key in args:
            path = screens[key][0].split("/")[0]
            if show_sheet:
                sheet(path)
                break


if __name__ == "__main__":
    main(sys.argv[1:])
