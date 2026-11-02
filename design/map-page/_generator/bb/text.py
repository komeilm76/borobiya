"""Persian/RTL text rendering for the mockups.

Pillow has no bidi/shaping here (no libraqm in the wheel), so logical Persian text is
reshaped with arabic-reshaper and reordered with python-bidi before drawing. Wrapping
happens on the logical string so words stay intact.
"""
from __future__ import annotations

import functools
import os
import re
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFont
from bidi.algorithm import get_display

try:  # arabic_reshaper >= 3
    import arabic_reshaper
    from arabic_reshaper import ArabicReshaper
except ImportError:  # pragma: no cover - dev tooling only
    arabic_reshaper = None
    ArabicReshaper = None

from .theme import FONTS, FONT_DIR, TYPE

_FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")

if ArabicReshaper is not None:
    _RESHAPER = ArabicReshaper(
        configuration={
            "delete_harakat": True,
            "support_ligatures": True,
            "RIAL": False,
        }
    )
else:  # pragma: no cover
    _RESHAPER = None


def fa_digits(value: object) -> str:
    """Convert ASCII digits in a formatted string to Persian digits."""
    return str(value).translate(_FA_DIGITS)


def _has_arabic(text: str) -> bool:
    return any("\u0600" <= ch <= "\u06FF" or "\uFB50" <= ch <= "\uFEFF" for ch in text)


def shape(text: str) -> str:
    """Logical text -> visually ordered, glyph-shaped text for Pillow."""
    if not text or not _has_arabic(text):
        return text
    return get_display(_RESHAPER.reshape(text))


@functools.lru_cache(maxsize=512)
def font(weight: str = "regular", size: float = 14, scale: float = 2) -> ImageFont.FreeTypeFont:
    path = os.path.join(FONT_DIR, FONTS[weight])
    return ImageFont.truetype(path, int(round(size * scale)))


def type_font(style: str, scale: float = 2) -> ImageFont.FreeTypeFont:
    weight, size, _ = TYPE[style]
    return font(weight, size, scale)


def text_width(text: str, style: str, scale: float) -> float:
    """Visual width in logical pixels of a single line."""
    if not text:
        return 0.0
    return font(TYPE[style][0], TYPE[style][1], scale).getlength(shape(text)) / scale


def wrap(text: str, style: str, max_width: float, scale: float, max_lines: int | None = None) -> list[str]:
    """Greedy word wrap measured on shaped text. Returns logical lines."""
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if text_width(candidate, style, scale) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    if max_lines is not None and len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and text_width(last + "…", style, scale) > max_width:
            last = last[:-1].rstrip()
        lines[-1] = last + "…"
    return lines


def ellipsize(text: str, style: str, max_width: float, scale: float) -> str:
    if text_width(text, style, scale) <= max_width:
        return text
    trimmed = text
    while trimmed and text_width(trimmed + "…", style, scale) > max_width:
        trimmed = trimmed[:-1].rstrip()
    return trimmed + "…"


class Text:
    """Draws Persian text on a supersampled canvas using logical pixel coordinates."""

    def __init__(self, draw: ImageDraw.ImageDraw, scale: float):
        self.draw = draw
        self.s = scale

    def _baseline(self, y: float, style: str, line_height: float | None) -> float:
        height = line_height if line_height is not None else TYPE[style][2]
        return (y + height / 2) * self.s

    def line(
        self,
        x: float,
        y: float,
        text: str,
        style: str = "body",
        color: str = "#122A2A",
        align: str = "left",
        line_height: float | None = None,
        opacity: float | None = None,
        max_width: float | None = None,
        halo: str | None = None,
        halo_width: float = 2.0,
    ) -> float:
        """Draw one line; returns its visual width. `align` anchors x: left|right|center."""
        if not text:
            return 0.0
        if max_width is not None:
            text = ellipsize(text, style, max_width, self.s)
        visual = shape(text)
        f = type_font(style, self.s)
        width = f.getlength(visual) / self.s
        if align == "right":
            anchor, px = "rm", x * self.s
        elif align == "center":
            anchor, px = "mm", x * self.s
        else:
            anchor, px = "lm", x * self.s
        py = self._baseline(y, style, line_height)
        fill = color
        if opacity is not None:
            fill = (0, 0, 0, 0)
        if halo:
            self.draw.text(
                (px, py), visual, font=f, fill=halo, anchor=anchor,
                stroke_width=max(1, int(halo_width * self.s)), stroke_fill=halo,
            )
        self.draw.text((px, py), visual, font=f, fill=color, anchor=anchor)
        return width

    def paragraph(
        self,
        x: float,
        y: float,
        text: str,
        style: str = "body",
        color: str = "#122A2A",
        align: str = "right",
        max_width: float | None = None,
        line_height: float | None = None,
        max_lines: int | None = None,
    ) -> float:
        """Wrap & draw; returns the total height consumed."""
        width = max_width if max_width is not None else 10_000
        lines = wrap(text, style, width, self.s, max_lines)
        lh = line_height if line_height is not None else TYPE[style][2]
        for index, line_text in enumerate(lines):
            if align == "right":
                self.line(x + width, y + index * lh, line_text, style, color, align="right", line_height=lh)
            elif align == "center":
                self.line(x + width / 2, y + index * lh, line_text, style, color, align="center", line_height=lh)
            else:
                self.line(x, y + index * lh, line_text, style, color, align="left", line_height=lh)
        return len(lines) * lh

    def ltr(self, x: float, y: float, text: str, style: str = "body", color: str = "#122A2A",
            align: str = "left", max_width: float | None = None) -> float:
        """Latin-only run (numbers, coordinates) drawn without bidi reordering."""
        if not text:
            return 0.0
        f = type_font(style, self.s)
        width = f.getlength(text) / self.s
        if max_width is not None and width > max_width:
            while text and f.getlength(text + "…") / self.s > max_width:
                text = text[:-1]
            text += "…"
            width = f.getlength(text) / self.s
        if align == "right":
            anchor, px = "rm", x * self.s
        elif align == "center":
            anchor, px = "mm", x * self.s
        else:
            anchor, px = "lm", x * self.s
        self.draw.text((px, self._baseline(y, style, None)), text, font=f, fill=color, anchor=anchor)
        return width

    def digits(self, x: float, y: float, value: object, style: str = "metric", color: str = "#122A2A",
               align: str = "left", line_height: float | None = None) -> float:
        return self.line(x, y, fa_digits(value), style, color, align, line_height)

    def mixed(self, x: float, y: float, parts: Sequence[tuple[str, str, str]], style: str = "body",
              align: str = "left") -> float:
        """Draw inline runs described as (text, style_override|'', color_override|'')."""
        total = sum(text_width(part[0], part[1] or style, self.s) for part in parts)
        if align == "center":
            cursor = x - total / 2
        elif align == "right":
            cursor = x - total
        else:
            cursor = x
        # RTL: chips are laid out right-to-left in a Persian sentence.
        for text, run_style, run_color in reversed(parts):
            st = run_style or style
            width = text_width(text, st, self.s)
            self.line(cursor, y, text, st, run_color or "#122A2A", align="left")
            cursor += width
        return total


def solid(color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    color = color.lstrip("#")
    return (int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16), alpha)


def mix(a: str, b: str, t: float) -> tuple[int, int, int]:
    ca, cb = solid(a), solid(b)
    return tuple(int(round(ca[i] + (cb[i] - ca[i]) * t)) for i in range(3))  # type: ignore[return-value]
