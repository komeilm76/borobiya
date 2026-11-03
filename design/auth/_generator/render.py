#!/usr/bin/env python3
"""Render the BoroBiya authentication reference images.

Usage (from design/auth/_generator):
    python render.py              # every page
    python render.py login        # one section
    python render.py a-login      # one page
"""
from __future__ import annotations

import importlib
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(ROOT, ".."))
sys.path.insert(0, ROOT)

SECTIONS = {
    "login": "sections.login",
    "register": "sections.register",
    "recovery": "sections.recovery",
    "onboarding": "sections.onboarding",
    "system": "sections.system",
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
        print(f"  ✓ {path}  ({screen.img.width}×{screen.img.height})")
    return written


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    screens = registry()
    if not args:
        render(list(screens))
    elif args[0] in SECTIONS:
        render([k for k, v in screens.items() if v[0].startswith(args[0] + "/")])
    else:
        render(args)


if __name__ == "__main__":
    main(sys.argv[1:])
