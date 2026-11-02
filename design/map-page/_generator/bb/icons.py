"""Icon rendering for the mockups.

The mockups use the same Material Design Icons webfont the Vue client already ships
(@mdi/font), so icon names in these images map directly to `mdi-*` props in components.
Codepoints are read from the shipped CSS, never hardcoded.
"""
from __future__ import annotations

import functools
import os
import re
from typing import Iterable

from PIL import ImageDraw, ImageFont

from .theme import MDI_CSS, MDI_FONT

_PATTERN = re.compile(r"\.mdi-([a-z0-9-]+)::before\s*\{\s*content:\s*\"\\([0-9A-Fa-f]+)\"")


@functools.lru_cache(maxsize=1)
def codepoints() -> dict[str, int]:
    if not os.path.exists(MDI_CSS):
        raise FileNotFoundError(
            "MDI webfont CSS is missing. Run `python -m bb.fetch_assets` from the generator folder."
        )
    with open(MDI_CSS, encoding="utf-8") as handle:
        source = handle.read()
    table: dict[str, int] = {}
    for name, code in _PATTERN.findall(source):
        table.setdefault(name, int(code, 16))
    if not table:
        raise ValueError("No MDI codepoints parsed from the stylesheet.")
    return table


@functools.lru_cache(maxsize=256)
def icon_font(size: float, scale: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(MDI_FONT, int(round(size * scale)))


class Icons:
    CODEPOINTS = None  # populated lazily in __init__ to keep import cheap

    def __init__(self, draw: ImageDraw.ImageDraw, scale: float):
        self.draw = draw
        self.s = scale
        self.map = codepoints()

    def has(self, name: str) -> bool:
        return name.removeprefix("mdi-") in self.map

    def glyph(self, name: str) -> str:
        key = name.removeprefix("mdi-")
        if key not in self.map:
            raise KeyError(f"Unknown Material Design Icon: {name}")
        return chr(self.map[key])

    def draw_icon(
        self,
        x: float,
        y: float,
        name: str,
        size: float = 22,
        color: str = "#122A2A",
        anchor: str = "center",
    ) -> None:
        """Draw a 22px-class icon centred (default) on logical (x, y)."""
        ch = self.glyph(name)
        f = icon_font(size, self.s)
        px, py = x * self.s, y * self.s
        if anchor == "center":
            self.draw.text((px, py), ch, font=f, fill=color, anchor="mm")
        elif anchor == "left":
            self.draw.text((px, py), ch, font=f, fill=color, anchor="lm")
        elif anchor == "right":
            self.draw.text((px, py), ch, font=f, fill=color, anchor="rm")
        elif anchor == "top-left":
            self.draw.text((px, py), ch, font=f, fill=color, anchor="la")
        elif anchor == "bottom-left":
            self.draw.text((px, py), ch, font=f, fill=color, anchor="ld")
