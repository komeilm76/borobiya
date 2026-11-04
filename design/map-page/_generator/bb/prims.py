"""Reusable UI primitives for the reference mockups (logical pixels, RTL aware)."""
from __future__ import annotations

import math
import os
from contextlib import contextmanager
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFilter

from .icons import Icons
from .text import Text, fa_digits, shape, text_width, type_font, solid, wrap
from .theme import C, RENDER_SCALE, TYPE, VIEW_H, VIEW_W, C as Colors, R


def _rgba(color: str, alpha: int) -> tuple[int, int, int, int]:
    r, g, b = solid(color)[:3]
    return (r, g, b, max(0, min(255, alpha)))


class Screen:
    """A mobile viewport canvas with design-system helpers."""

    def __init__(self, background: str = C.background, scale: int = RENDER_SCALE,
                 width: int = VIEW_W, height: int = VIEW_H):
        self.w = width
        self.h = height
        self.s = scale
        self.img = Image.new("RGBA", (width * scale, height * scale), solid(background))
        self.d = ImageDraw.Draw(self.img)
        self.t = Text(self.d, scale)
        self.i = Icons(self.d, scale)

    # --- translucent layers --------------------------------------------------
    @contextmanager
    def clip_rounded(self, x: float, y: float, w: float, h: float, radius: float):
        """Composite everything drawn inside the block through a rounded-rect mask.

        Needed for device frames on the design boards: the bottom sheet must run to the
        frame's bottom edge and still inherit the frame's rounded corners.
        """
        base_img, base_draw = self.img, self.d
        base_text, base_icons = self.t, self.i
        layer = Image.new("RGBA", base_img.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        self.img, self.d = layer, draw
        # Text and Icons cache their own ImageDraw, so they must follow the layer too.
        self.t = Text(draw, self.s)
        self.i = Icons(draw, self.s)
        try:
            yield self
        finally:
            self.img, self.d = base_img, base_draw
            self.t, self.i = base_text, base_icons

        s = self.s
        mask = Image.new("L", base_img.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [x * s, y * s, (x + w) * s, (y + h) * s], radius=radius * s, fill=255)
        cut = Image.new("RGBA", base_img.size, (0, 0, 0, 0))
        cut.paste(layer, (0, 0), mask)
        base_img.alpha_composite(cut)

    @contextmanager
    def alpha_layer(self):
        """Draw into a transparent layer and composite it, so RGBA fills blend."""
        base_img, base_draw = self.img, self.d
        base_text, base_icons = self.t, self.i
        layer = Image.new("RGBA", base_img.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        self.img, self.d = layer, draw
        # Text and Icons cache their own ImageDraw; without this they would keep painting
        # opaque straight onto the base image and a translucent wash would not cover them.
        self.t = Text(draw, self.s)
        self.i = Icons(draw, self.s)
        try:
            yield self
        finally:
            self.img = base_img
            self.d = base_draw
            self.t, self.i = base_text, base_icons
            base_img.alpha_composite(layer)

    # --- geometry -----------------------------------------------------------
    def _box(self, x: float, y: float, w: float, h: float):
        s = self.s
        return [x * s, y * s, (x + w) * s, (y + h) * s]

    # --- painting -----------------------------------------------------------
    def rect(self, x, y, w, h, fill=None, radius: float = 0, outline=None, outline_w: float = 1,
             corners: tuple[bool, bool, bool, bool] | None = None):
        radius = min(radius, w / 2, h / 2) if radius else 0
        if outline is not None and outline_w:
            self.d.rounded_rectangle(
                self._box(x, y, w, h), radius=radius * self.s, fill=fill,
                outline=outline, width=max(1, int(round(outline_w * self.s))), corners=corners,
            )
        else:
            self.d.rounded_rectangle(self._box(x, y, w, h), radius=radius * self.s, fill=fill, corners=corners)

    def polygon(self, points: Sequence[tuple[float, float]], fill=None, outline=None, outline_w: float = 1):
        pts = [(px * self.s, py * self.s) for px, py in points]
        self.d.polygon(pts, fill=fill)
        if outline is not None and outline_w:
            self.d.line(pts + [pts[0]], fill=outline, width=max(1, int(outline_w * self.s)), joint="curve")

    def line(self, points: Sequence[tuple[float, float]], color, width: float = 1, caps: bool = True):
        pts = [(px * self.s, py * self.s) for px, py in points]
        if len(pts) < 2:
            return
        self.d.line(pts, fill=color, width=max(1, int(round(width * self.s))), joint="curve")
        if caps:
            radius = width * self.s / 2
            for px, py in (pts[0], pts[-1]):
                self.d.ellipse([px - radius, py - radius, px + radius, py + radius], fill=color)

    def circle(self, cx, cy, r, fill=None, outline=None, outline_w: float = 1):
        box = [(cx - r) * self.s, (cy - r) * self.s, (cx + r) * self.s, (cy + r) * self.s]
        if outline is not None and outline_w:
            self.d.ellipse(box, fill=fill, outline=outline, width=max(1, int(round(outline_w * self.s))))
        else:
            self.d.ellipse(box, fill=fill)

    def shadow(self, x, y, w, h, radius: float = 20, blur: float = 16, dy: float = 6,
               color: str = "#0A2422", alpha: int = 38, spread: float = 0):
        """Soft drop shadow, drawn as a blurred rounded rectangle under the surface."""
        pad = int(blur * 2 + 8)
        sw = int((w + pad * 2) * self.s)
        sh = int((h + pad * 2) * self.s)
        layer = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        inset = pad
        d.rounded_rectangle(
            [inset * self.s, inset * self.s, (inset + w + spread * 2) * self.s, (inset + h + spread * 2) * self.s],
            radius=max(0, (radius + spread) * self.s), fill=_rgba(color, alpha),
        )
        layer = layer.filter(ImageFilter.GaussianBlur(blur * self.s * 0.55))
        self.img.alpha_composite(layer, (int((x - pad) * self.s), int((y - pad + dy) * self.s)))

    def card(self, x, y, w, h, radius: float = R.lg, fill: str = C.surface, outline: str | None = C.outline,
             shadow: bool = True, blur: float = 18, alpha: int = 30):
        if shadow:
            self.shadow(x, y, w, h, radius=radius, blur=blur, dy=6, alpha=alpha)
        self.rect(x, y, w, h, fill=fill, radius=radius, outline=outline, outline_w=1 if outline else 0)

    def divider(self, x1, y, x2, color: str = C.outline):
        self.d.line([(x1 * self.s, y * self.s), (x2 * self.s, y * self.s)], fill=color,
                    width=max(1, int(self.s)))

    def dashed_vertical(self, x, y1, y2, color: str = C.outline_strong, dash: float = 4,
                        gap: float = 4, width: float = 1.6):
        cursor = y1
        while cursor < y2:
            end = min(cursor + dash, y2)
            self.d.line([(x * self.s, cursor * self.s), (x * self.s, end * self.s)], fill=color,
                        width=max(1, int(width * self.s)))
            cursor = end + gap

    def dashed_route_illustration(self, cx: float, cy: float, w: float = 240):
        """Decorative dashed path used by empty states."""
        pts = [(cx - w / 2, cy + 26), (cx - w / 4, cy + 26), (cx - w / 4, cy - 14),
               (cx + w / 5, cy - 14), (cx + w / 5, cy + 4), (cx + w / 2 - 10, cy + 4)]
        for index in range(len(pts) - 1):
            x1, y1 = pts[index]
            x2, y2 = pts[index + 1]
            length = max(abs(x2 - x1), abs(y2 - y1))
            step = 9
            n = max(1, int(length / step))
            for i in range(n):
                t0, t1 = i / n, min(1, (i + 0.6) / n)
                self.line([(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0),
                           (x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1)], C.outline_strong, 2.4)
        self.circle(pts[0][0], pts[0][1], 6, fill="#FFFFFF", outline=C.origin, outline_w=2)
        self.circle(pts[-1][0], pts[-1][1], 6, fill="#FFFFFF", outline=C.destination, outline_w=2)

    def dividers_vertical(self, x, y1, y2, color: str = C.outline):
        self.d.line([(x * self.s, y1 * self.s), (x * self.s, y2 * self.s)], fill=color,
                    width=max(1, int(self.s)))

    # --- text ---------------------------------------------------------------
    def text(self, x, y, content, style="body", color=C.text, align="left", max_width=None,
             line_height=None, opacity=None, halo=None, halo_width=2.0) -> float:
        return self.t.line(x, y, content, style, color, align, line_height, opacity, max_width,
                           halo=halo, halo_width=halo_width)

    def para(self, x, y, content, style="body", color=C.text, align="right", max_width=None,
             line_height=None, max_lines=None) -> float:
        return self.t.paragraph(x, y, content, style, color, align, max_width, line_height, max_lines)

    def digits(self, x, y, value, style="metric", color=C.text, align="left", line_height=None) -> float:
        return self.t.digits(x, y, value, style, color, align, line_height)

    def ltr(self, x, y, content: str, style="body", color=C.text, align="left", max_width=None) -> float:
        return self.t.ltr(x, y, content, style, color, align, max_width)

    def tw(self, content: str, style: str = "body") -> float:
        return text_width(content, style, self.s)

    def gradient(self, x, y, w, h, color: str = "#FFFFFF", start: int = 220, end: int = 0,
                 vertical: bool = True):
        """Linear fade used to keep status-bar text legible over the map."""
        s = self.s
        gw, gh = int(w * s), int(h * s)
        if gw <= 0 or gh <= 0:
            return
        if vertical:
            column = Image.new("RGBA", (1, gh))
            for row in range(gh):
                t = row / max(1, gh - 1)
                column.putpixel((0, row), _rgba(color, int(start + (end - start) * t)))
            layer = column.resize((gw, gh))
        else:
            row_img = Image.new("RGBA", (gw, 1))
            for col in range(gw):
                t = col / max(1, gw - 1)
                row_img.putpixel((col, 0), _rgba(color, int(start + (end - start) * t)))
            layer = row_img.resize((gw, gh))
        self.img.alpha_composite(layer, (int(x * s), int(y * s)))

    def top_scrim(self, height: float = 116, color: str = "#FFFFFF", start: int = 232):
        self.gradient(0, 0, self.w, height, color, start, 0)

    def bottom_scrim(self, from_y: float, color: str = "#FFFFFF", top_alpha: int = 0,
                     bottom_alpha: int = 240):
        self.gradient(0, from_y, self.w, self.h - from_y, color, top_alpha, bottom_alpha)

    # --- composite components ----------------------------------------------
    def status_bar(self, time_text: str = "۹:۴۱", color: str = C.text, translucent: bool = False):
        if translucent:
            self.rect(0, 0, self.w, 54, fill=_rgba("#FFFFFF", 210))
        self.text(30, 15, time_text, "label-lg", color, align="left")
        # signal / wifi / battery, right-aligned like iOS
        bx = 366
        self.rect(bx - 24, 22, 24, 12, fill=None, radius=3.5, outline=color, outline_w=1.3)
        self.rect(bx - 22, 24, 14, 8, fill=color, radius=2)
        self.rect(bx - 2, 25.5, 2, 5, fill=color, radius=1)
        self.i.draw_icon(bx - 40, 28, "wifi", 14, color)
        for index, bar_h in enumerate((4, 6, 8, 10)):
            self.rect(bx - 72 + index * 5, 33 - bar_h, 3, bar_h, fill=color, radius=1)

    def home_indicator(self, color: str = "#0B1F1F", width: float = 134):
        self.rect((self.w - width) / 2, self.h - 9, width, 5, fill=color, radius=3)

    # --- buttons ------------------------------------------------------------
    def _content_width(self, label: str, icon: str | None, style: str, icon_size: float, gap: float) -> float:
        width = text_width(label, style, self.s) if label else 0
        if icon:
            width += icon_size + (gap if label else 0)
        return width

    def button(
        self,
        x: float,
        y: float,
        w: float,
        h: float,
        label: str = "",
        icon: str | None = None,
        variant: str = "filled",
        color: str = C.primary,
        style: str = "label-lg",
        icon_size: float = 20,
        radius: float | None = None,
        shadow: bool = False,
        trailing_icon: str | None = None,
        badge: str | None = None,
    ):
        r = radius if radius is not None else min(R.md, h / 2)
        label_color = C.on_primary
        if variant == "filled":
            fill, outline, label_color = color, None, "#FFFFFF"
            if shadow:
                self.shadow(x, y, w, h, radius=r, blur=14, dy=5, color=color, alpha=70)
        elif variant == "deep":
            fill, outline, label_color = color, None, "#FFFFFF"
        elif variant == "tonal":
            fill, outline, label_color = _tint(color, 0.10), None, color
        elif variant == "soft":
            fill, outline, label_color = _tint(color, 0.14), None, color
        elif variant == "outline":
            fill, outline, label_color = None, C.outline_strong, C.text
        elif variant == "text":
            fill, outline, label_color = None, None, color
        elif variant == "surface":
            fill, outline, label_color = C.surface, C.outline, C.text
        else:
            raise ValueError(variant)
        if fill:
            self.rect(x, y, w, h, fill=fill, radius=r)
        if outline:
            self.rect(x, y, w, h, fill=None, radius=r, outline=outline, outline_w=1)
        if not label and icon:
            self.i.draw_icon(x + w / 2, y + h / 2, icon, icon_size, label_color)
            return
        # RTL: the content group is centred, but it reads right-to-left — the
        # leading icon sits on the right of the label, not on its left.
        gap = 8
        total = self._content_width(label, icon, style, icon_size, gap) + (
            (icon_size + gap) if trailing_icon else 0
        )
        right = x + (w + total) / 2
        cy = y + h / 2
        if icon:
            self.i.draw_icon(right - icon_size / 2, cy, icon, icon_size, label_color)
            right -= icon_size + gap
        if label:
            self.text(right, y + (h - TYPE[style][2]) / 2, label, style, label_color,
                      align="right")
            right -= text_width(label, style, self.s)
        if trailing_icon:
            self.i.draw_icon(right - gap - icon_size / 2, cy, trailing_icon, icon_size,
                             label_color)

    def icon_button(self, x, y, d, icon, icon_size=21, color=C.text, fill=C.surface, outline=C.outline,
                    shadow=True, radius=None, badge_color=None, badge_text=None, label=None):
        r = radius if radius is not None else d / 2
        if shadow:
            self.shadow(x, y, d, d, radius=r, blur=12, dy=4, alpha=44)
        self.rect(x, y, d, d, fill=fill, radius=r, outline=outline, outline_w=1 if outline else 0)
        if icon:
            self.i.draw_icon(x + d / 2, y + d / 2, icon, icon_size, color)
        if badge_color and badge_text:
            bw = 19
            self.circle(x + d - 7, y + 7, 9.5, fill=badge_color, outline="#FFFFFF", outline_w=2)
            self.text(x + d - 7, y + 7 - 8, badge_text, "caption-bold", "#FFFFFF", align="center")

    def chip(self, x, y, label, icon=None, tone: str = "neutral", h: float = 28, style="caption-bold",
             fill=None, color=None, outline=None, radius=None) -> float:
        """RTL pill: `x` is the LEFT edge, content reads icon-then-label from the right."""
        if fill is None:
            fill, color, outline = _tone(tone)
        icon_size = 15
        pad = 10
        gap = 5
        width = self._content_width(label, icon, style, icon_size, gap) + pad * 2
        r = radius if radius is not None else h / 2
        self.rect(x, y, width, h, fill=fill, radius=r, outline=outline, outline_w=1 if outline else 0)
        right = x + width - pad
        if icon:
            self.i.draw_icon(right - icon_size / 2, y + h / 2, icon, icon_size, color)
            right -= icon_size + gap
        self.text(right, y + (h - TYPE[style][2]) / 2, label, style, color, align="right")
        return width

    def arc_badge(self, cx, cy, fill, icon, size=11):
        """A small round status dot with a white ring, used on top of avatars and traces."""
        self.circle(cx, cy, size / 2 + 2, fill="#FFFFFF")
        self.circle(cx, cy, size / 2, fill=fill)
        if icon:
            self.i.draw_icon(cx, cy, icon, size * 0.62, "#FFFFFF")

    def badge_dot(self, cx, cy, r=4.5, color=C.danger, ring="#FFFFFF"):
        self.circle(cx, cy, r + 2, fill=ring)
        self.circle(cx, cy, r, fill=color)

    def avatar(self, x, y, d, initial, fill=C.primary_soft, color=C.primary, style="title"):
        self.circle(x + d / 2, y + d / 2, d / 2, fill=fill)
        # text() anchors x,y at the line's top box, so centre it inside the disc.
        self.text(x + d / 2, y + (d - TYPE[style][2]) / 2, initial, style, color, align="center")

    def toggle(self, x, y, w=44, h=26, on=True, on_color=C.primary, off_color="#CBD7D4"):
        r = h / 2
        self.rect(x, y, w, h, fill=on_color if on else off_color, radius=r)
        knob_r = r - 3
        cx = (x + w - r) if on else (x + r)
        self.circle(cx, y + h / 2, knob_r + 1.2, fill="#FFFFFF")
        self.circle(cx, y + h / 2, knob_r, fill="#FFFFFF")

    def progress(self, x, y, w, h=6, value=0.42, color=C.primary, track=C.surface_3):
        self.rect(x, y, w, h, fill=track, radius=h / 2)
        if value > 0:
            self.rect(x, y, max(h, w * value), h, fill=color, radius=h / 2)

    def spinner(self, cx, cy, r=12, color=C.primary, width=2.6, arcs=3):
        for index in range(arcs):
            start = index * 360 / arcs + 12
            self.d.arc(
                [(cx - r) * self.s, (cy - r) * self.s, (cx + r) * self.s, (cy + r) * self.s],
                start=start, end=start + 70, fill=color, width=int(width * self.s),
            )

    def stars(self, x, y, rating: int, size=13, color=C.amber, empty="#D8E2DF"):
        for index in range(5):
            self.i.draw_icon(x + index * (size + 2) + size / 2, y, "star", size, color if index < rating else empty)

    def sheet_surface(self, top: float, radius: float = R.xxl, fill=C.surface, grabber=True,
                      shadow=True, outline=False) -> float:
        """Bottom sheet starting at `top`; returns the y where content can start."""
        if shadow:
            self.shadow(self.w / 2 - 240, top - 6, 480, self.h - top + 40, radius=radius, blur=22, dy=0,
                        alpha=34)
        self.rect(0, top, self.w, self.h - top + 2, fill=fill, radius=radius,
                  outline=C.outline if outline else None, outline_w=1)
        self.rect(0, top + radius, self.w, self.h - top - radius + 2, fill=fill)
        if grabber:
            self.rect(self.w / 2 - 18, top + 8, 36, 4.5, fill=C.outline_strong, radius=3)
        return top + (20 if grabber else 12)

    # --- chrome -------------------------------------------------------------
    def segmented(self, x, y, w, items: Sequence[tuple[str, str]], active: int, h: float = 44,
                  locked: Iterable[int] = (), on_map: bool = True):
        """iOS-style three-way switch: (label, icon) pairs, teal pill for the active section."""
        r = h / 2
        if on_map:
            self.shadow(x, y, w, h, radius=r, blur=16, dy=5, alpha=40)
            self.rect(x, y, w, h, fill=_rgba(C.surface, 245), radius=r, outline=C.outline, outline_w=1)
        else:
            self.rect(x, y, w, h, fill=C.surface_2, radius=r, outline=C.outline, outline_w=1)
        inner_pad = 4
        seg_w = (w - inner_pad * 2) / len(items)
        for index in range(len(items)):
            # RTL: the first item sits at the physical right edge of the control.
            sx = x + w - inner_pad - (index + 1) * seg_w
            item = items[index]
            locked_here = index in locked
            if index == active:
                self.rect(sx, y + inner_pad, seg_w, h - inner_pad * 2, fill=C.primary, radius=(h - inner_pad * 2) / 2)
                color = "#FFFFFF"
            else:
                # #63797A keeps locked sections at ~4.6:1 on white — still clearly disabled,
                # but readable for users who need to know why the section will not open.
                color = C.muted if locked_here else C.text_2
            label, icon = item
            # Four labels at 13px are 41–48px wide; 17px glyphs plus a 6px gap leave only ~9px of
            # padding per side, so the denser control steps the glyph down and tightens the gap.
            icon_size = 17 if len(items) <= 3 else 14
            gap = 6 if len(items) <= 3 else 4
            total = self._content_width(label, icon, "label", icon_size, gap)
            # RTL: the icon leads from the right edge, the label trails to its left.
            cursor = sx + (seg_w + total) / 2
            cy = y + h / 2
            if icon:
                self.i.draw_icon(cursor - icon_size / 2, cy, icon, icon_size, color)
                cursor -= icon_size + gap
            self.text(cursor, cy - TYPE["label"][2] / 2, label, "label", color, align="right")
            if locked_here:
                # lock trails on the far left so it never collides with the leading icon
                self.i.draw_icon(sx + 12, cy, "lock", 11, C.muted_2)

    def toast(self, y, text, icon="mdi-check-circle", tone="success", width=None):
        w = width or min(self.w - 32, self.tw(text, "body-sm") + 62)
        x = (self.w - w) / 2
        fill, color, _ = _tone(tone)
        self.shadow(x, y, w, 44, radius=16, blur=16, dy=5, alpha=46)
        self.rect(x, y, w, 44, fill="#FFFFFF", radius=16, outline=C.outline, outline_w=1)
        self.rect(x, y, 4, 44, fill=color, radius=2)
        self.i.draw_icon(x + 24, y + 22, icon, 19, color)
        self.text(x + 38, y + 12, text, "body-sm", C.text, align="left", max_width=w - 52)
        return x, w


def _tint(color: str, strength: float) -> tuple[int, int, int, int]:
    """White mixed with `strength` of `color` (0.1 = very light wash)."""
    r, g, b = solid(color)[:3]
    mix = lambda channel: int(round(channel * strength + 255 * (1 - strength)))
    return (mix(r), mix(g), mix(b), 255)


_TONES = {
    "neutral": ("#EFF4F3", C.text_2, None),
    "primary": (C.primary_soft, C.primary, None),
    "success": (C.success_soft, C.success, None),
    "warning": (C.warning_soft, C.warning, None),
    "danger": (C.danger_soft, C.danger, None),
    "info": (C.info_soft, C.info, None),
    "mission": (C.mission_soft, C.mission, None),
}


def _tone(tone: str):
    if tone not in _TONES:
        raise KeyError(tone)
    return _TONES[tone]


def scrim(screen: Screen, alpha: int = 120, top: float = 0, height: float | None = None):
    """Dim everything behind a modal. Must go through alpha_layer: an RGBA fill passed
    straight to `rect` paints opaque and would bury the map."""
    h = height if height is not None else screen.h - top
    with screen.alpha_layer():
        screen.rect(0, top, screen.w, h, fill=_rgba(C.overlay_scrim, alpha))
