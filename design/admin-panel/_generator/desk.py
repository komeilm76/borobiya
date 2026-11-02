"""Desktop shell and primitives for the admin-panel reference mockups (RTL)."""
from __future__ import annotations

import math
from typing import Iterable, Sequence

import atheme as A0
from atheme import A, C, PAD, RAIL, SIDEBAR, TOPBAR, W, H

from bb.prims import Screen
from bb.text import fa_digits

# --------------------------------------------------------------------------- #
# shell
# --------------------------------------------------------------------------- #
NAV: list[tuple[str, list[tuple[str, str, str]]]] = [
    ("عملیات", [
        ("dashboard", "نمای کلی", "mdi-view-dashboard-outline"),
        ("dispatch", "اعزام و امداد", "mdi-radar"),
        ("reports", "گزارش‌ها", "mdi-chart-box-outline"),
    ]),
    ("مدیریت", [
        ("users", "کاربران", "mdi-account-multiple-outline"),
        ("services", "گروه‌های امداد", "mdi-lifebuoy"),
        ("incidents", "انواع حادثه", "mdi-shape-outline"),
    ]),
    ("سامانه", [
        ("audit", "گزارش رویدادها", "mdi-history"),
        ("alerts", "هشدارها", "mdi-bell-alert-outline"),
        ("settings", "تنظیمات", "mdi-cog-outline"),
    ]),
]


def fa(value) -> str:
    """Latin digits -> Persian digits (tabular data still needs Persian numerals)."""
    return fa_digits(str(value))


def screen(bg: str = C.background) -> Screen:
    return Screen(background=bg, width=W, height=H, scale=1)


def sidebar(s: Screen, active: str):
    x0 = W - SIDEBAR
    s.rect(x0, 0, SIDEBAR, H, fill=C.surface)
    s.rect(x0, 0, 1, H, fill=A.card_edge)

    # brand
    s.rect(W - PAD - 40, 22, 40, 40, fill=C.primary, radius=13)
    s.i.draw_icon(W - PAD - 20, 42, "mdi-lifebuoy", 22, "#FFFFFF")
    s.text(W - PAD - 52, 24, "بورو بیا", "d-title", C.text, align="right")
    s.text(W - PAD - 52, 48, "پنل مدیریت امداد", "d-caption", C.muted, align="right")

    y = 104
    for group, items in NAV:
        s.text(W - PAD - 4, y, group, "d-caption-bold", C.muted_2, align="right")
        y += 24
        for key, label, icon in items:
            _nav_item(s, x0, y, key, label, icon, key == active)
            y += 46
        y += 12

    # footer account
    s.rect(x0 + 16, H - 92, SIDEBAR - 32, 1, fill=A.row_line)
    s.avatar(x0 + 16, H - 74, 36, "م", C.primary_soft, C.primary, "d-label-lg")
    s.text(W - PAD - 4, H - 72, "مهدی رستمی", "d-label", C.text, align="right")
    s.text(W - PAD - 4, H - 52, "مدیر ارشد امداد", "d-caption", C.muted, align="right")
    s.i.draw_icon(x0 + 34, H - 56, "mdi-logout", 18, C.muted_2)


def _nav_item(s: Screen, x0: float, y: float, key: str, label: str, icon: str, active: bool):
    x, w = x0 + 14, SIDEBAR - 28
    if active:
        s.rect(x, y, w, 40, fill=A.nav_active, radius=12)
        s.rect(x + w - 3, y + 10, 3, 20, fill=C.primary, radius=2)
    color = C.primary if active else C.text_2
    s.i.draw_icon(x + w - 24, y + 20, icon, 19, color)
    s.text(x + w - 42, y + 9, label, "d-label-lg" if active else "d-label", color, align="right")


def topbar(s: Screen, crumbs: str, actions_left: bool = True):
    s.rect(0, 0, A0.CONTENT_W, TOPBAR, fill=C.surface)
    s.rect(0, TOPBAR - 1, A0.CONTENT_W, 1, fill=A.card_edge)
    s.text(RAIL, 22, crumbs, "d-body", C.muted, align="right")
    # global search
    sx, sw = A0.CONTENT_W - 120 - 392, 392
    s.rect(sx, 16, sw, 36, fill=C.surface_2, radius=10, outline=A.card_edge, outline_w=1)
    s.i.draw_icon(sx + sw - 20, 34, "mdi-magnify", 17, C.muted_2)
    s.text(sx + sw - 36, 26, "جست‌وجوی کاربر، مأموریت یا حادثه…", "d-sm", C.muted_2,
           align="right", max_width=sw - 60)
    s.text(sx + 14, 26, "Ctrl K", "d-caption", C.muted_2, align="left")
    # actions on the physical left
    ax = 24
    s.avatar(ax, 16, 36, "م", C.primary_soft, C.primary, "d-label")
    s.circle(ax + 36, 18, 7, fill=C.danger, outline=C.surface, outline_w=2)
    s.icon_button(ax + 52, 16, 36, "mdi-bell-outline", 19, C.text_2, C.surface, A.card_edge, 10)
    s.icon_button(ax + 96, 16, 36, "mdi-help-circle-outline", 19, C.text_2, C.surface, A.card_edge, 10)


def page_head(s: Screen, y: float, title: str, sub: str, actions: Sequence[tuple] = ()) -> float:
    """Title block; `actions` are (label, icon, variant) laid out from the left edge."""
    s.text(RAIL, y, title, "d-display", C.text, align="right")
    s.text(RAIL, y + 40, sub, "d-body", C.muted, align="right", max_width=720)
    x = PAD
    for label, icon, variant in reversed(list(actions)):
        w = s.tw(label, "d-label") + (54 if icon else 34)
        _button(s, x, y + 8, w, 40, label, icon, variant)
        x += w + 10
    return y + 92


def page(active: str, crumbs: str, title: str, sub: str, actions=()):
    s = screen()
    sidebar(s, active)
    topbar(s, crumbs)
    y = page_head(s, 96, title, sub, actions)
    return s, y


# --------------------------------------------------------------------------- #
# controls
# --------------------------------------------------------------------------- #
def _button(s: Screen, x: float, y: float, w: float, h: float, label: str,
            icon: str | None = None, variant: str = "filled", tone: str = "primary"):
    fill, color, outline = {
        "filled": (C.primary, "#FFFFFF", None),
        "tonal": (C.primary_soft, C.primary, None),
        "outline": ("#FFFFFF", C.text_2, A.card_edge),
        "ghost": (None, C.text_2, None),
        "danger": (C.danger, "#FFFFFF", None),
        "danger-outline": (C.surface, C.danger, C.danger_soft),
    }[variant]
    if fill:
        s.rect(x, y, w, h, fill=fill, radius=11, outline=outline, outline_w=1)
    # RTL: icon leads from the right edge of the label group
    total = s.tw(label, "d-label") + (24 if icon else 0)
    right = x + (w + total) / 2
    if icon:
        s.i.draw_icon(right - 8, y + h / 2, icon, 17, color)
        right -= 24
    s.text(right, y + (h - 20) / 2, label, "d-label", color, align="right")


def field(s: Screen, x: float, y: float, w: float, label: str, value: str = "",
          icon: str | None = "mdi-magnify", h: float = 40, placeholder: bool = True):
    s.rect(x, y, w, h, fill=C.surface, radius=10, outline=A.card_edge, outline_w=1)
    right = x + w - 14
    if icon:
        s.i.draw_icon(right - 8, y + h / 2, icon, 17, C.muted_2)
        right -= 28
    s.text(right, y + (h - 19) / 2, value or label, "d-sm",
           C.text if value else C.muted_2, align="right", max_width=w - 60)


def select(s: Screen, x: float, y: float, w: float, value: str, label: str = ""):
    s.rect(x, y, w, 40, fill=C.surface, radius=10, outline=A.card_edge, outline_w=1)
    s.i.draw_icon(x + 16, y + 20, "mdi-chevron-down", 17, C.muted_2)
    s.text(x + w - 14, y + 10, value, "d-sm", C.text_2, align="right", max_width=w - 46)
    if label:
        s.text(x + w - 14, y - 22, label, "d-caption-bold", C.muted)


def tabs(s: Screen, x: float, y: float, w: float, items: Sequence[str], active: int):
    s.rect(x, y, w, 3, fill=A.row_line)
    seg = w / len(items)
    for index, label in enumerate(items):
        sx = x + w - (index + 1) * seg
        on = index == active
        s.text(sx + seg / 2, y - 30, label, "d-label", C.primary if on else C.muted, align="center")
        if on:
            s.rect(sx + seg * 0.18, y - 3, seg * 0.64, 3, fill=C.primary, radius=2)


def pill(s: Screen, x: float, y: float, text: str, tone: str = "neutral",
         icon: str | None = None, h: float = 24, right: bool = False,
         show_dot: bool = True) -> float:
    """Returns the pill width. `x` is the left edge unless `right` is True."""
    fill, color, dot = {
        "success": (C.success_soft, C.success, C.success),
        "warning": (C.warning_soft, C.warning, C.warning),
        "danger": (C.danger_soft, C.danger, C.danger),
        "info": (C.info_soft, C.info, C.info),
        "mission": (C.mission_soft, C.mission, C.mission),
        "primary": (C.primary_soft, C.primary, C.primary),
        "neutral": (C.surface_3, C.text_2, C.muted_2),
    }[tone]
    mark = bool(icon) or show_dot
    w = s.tw(text, "d-caption-bold") + (34 if mark else 22)
    px = x - w if right else x
    s.rect(px, y, w, h, fill=fill, radius=h / 2)
    if icon:
        s.i.draw_icon(px + w - 15, y + h / 2, icon, 13, color)
        s.text(px + w - 26, y + (h - 17) / 2, text, "d-caption-bold", color, align="right")
    elif show_dot:
        s.circle(px + w - 13, y + h / 2, 3.2, fill=dot)
        s.text(px + w - 23, y + (h - 17) / 2, text, "d-caption-bold", color, align="right")
    else:
        s.text(px + w - 11, y + (h - 17) / 2, text, "d-caption-bold", color, align="right")
    return w


def icon_btn(s: Screen, x: float, y: float, icon: str, size: float = 32, tone: str = C.text_2):
    s.rect(x, y, size, size, fill=C.surface, radius=9, outline=A.card_edge, outline_w=1)
    s.i.draw_icon(x + size / 2, y + size / 2, icon, 16, tone)


# --------------------------------------------------------------------------- #
# surfaces
# --------------------------------------------------------------------------- #
def card(s: Screen, x: float, y: float, w: float, h: float, title: str | None = None,
         icon: str | None = None, action: str | None = None, pad: float = 20) -> float:
    s.shadow(x, y, w, h, radius=16, blur=18, dy=4, alpha=16)
    s.rect(x, y, w, h, fill=C.surface, radius=16, outline=A.card_edge, outline_w=1)
    if title:
        if icon:
            s.i.draw_icon(x + w - pad - 8, y + pad + 9, icon, 17, C.muted_2)
            s.text(x + w - pad - 28, y + pad - 1, title, "d-title", C.text, align="right")
        else:
            s.text(x + w - pad, y + pad - 1, title, "d-title", C.text, align="right")
        if action:
            s.text(x + pad + s.tw(action, "d-caption-bold"), y + pad + 3, action, "d-caption-bold",
                   C.primary, align="right")
        return y + pad + 30
    return y + pad


def kpi(s: Screen, x: float, y: float, w: float, h: float, label: str, value: str,
        delta: str, tone: str, icon: str, spark: Sequence[float] | None = None):
    s.shadow(x, y, w, h, radius=16, blur=16, dy=3, alpha=14)
    s.rect(x, y, w, h, fill=C.surface, radius=16, outline=A.card_edge, outline_w=1)
    s.text(x + w - 18, y + 14, label, "d-sm", C.muted, align="right")
    s.text(x + w - 18, y + 38, value, "d-metric", C.text, align="right")
    tone_fill = {"success": (C.success_soft, C.success), "warning": (C.warning_soft, C.warning),
                 "danger": (C.danger_soft, C.danger), "info": (C.info_soft, C.info),
                 "primary": (C.primary_soft, C.primary)}[tone]
    pill(s, x + 18, y + h - 34, delta, tone, None, 22)
    s.rect(x + 18, y + 16, 34, 34, fill=tone_fill[0], radius=10)
    s.i.draw_icon(x + 35, y + 33, icon, 18, tone_fill[1])
    if spark:
        # keep the trend clear of the right-aligned label and the bottom pill
        sparkline(s, x + 22, y + h - 62, 56, 18, spark, tone_fill[1])


def sparkline(s: Screen, x: float, y: float, w: float, h: float, values: Sequence[float], color: str):
    lo, hi = min(values), max(values)
    span = (hi - lo) or 1
    pts = [(x + i * w / (len(values) - 1), y + h - (v - lo) / span * h) for i, v in enumerate(values)]
    s.line(pts, color, 2.0)


def table(s: Screen, x: float, y: float, w: float, cols: Sequence[tuple[str, float]],
          rows: Sequence[Sequence], row_h: float = 56, actions: bool = True) -> float:
    """cols are (label, width) measured from the right edge, in RTL order."""
    # leave a gutter on the physical left for the row menu; without it the last
    # column's content is pushed past the card edge
    use_w = w - (48 if actions else 0)
    total = sum(cw for _, cw in cols) or 1
    cols = [(label, cw * use_w / total) for label, cw in cols]
    s.rect(x, y, use_w, 40, fill=A.table_head, radius=10)
    cx = x + use_w
    for label, cw in cols:
        s.text(cx - 14, y + 11, label, "d-caption-bold", C.muted, align="right")
        cx -= cw
    y += 40
    for index, row in enumerate(rows):
        if index:
            s.rect(x, y, use_w, 1, fill=A.row_line)
        cx = x + use_w
        for (label, cw), cell in zip(cols, row):
            draw_cell(s, cx - 14, y, cw, row_h, cell)
            cx -= cw
        if actions:
            s.i.draw_icon(x + 20, y + row_h / 2, "mdi-dots-vertical", 17, C.muted_2)
        y += row_h
    return y


def draw_cell(s: Screen, right: float, y: float, w: float, h: float, cell):
    """cell: str | (text, tone) | ('pill', text, tone) | ('avatar', initial, name, meta) | dict."""
    cy = y + h / 2
    if isinstance(cell, tuple) and cell[0] == "pill":
        text, tone = cell[1], cell[2]
        tw = s.tw(text, "d-caption-bold")
        # drop the dot before letting the pill spill into the row-menu gutter
        dot = (tw + 34) <= (w - 8)
        px = right - tw - (34 if dot else 22)
        pill(s, max(px, right - w + 6), cy - 11, text, tone, None, 22, show_dot=dot)
        return
    if isinstance(cell, tuple) and cell[0] == "avatar":
        _, initial, name, meta = cell
        s.circle(right - 16, cy, 17, fill=C.primary_soft)
        s.text(right - 16, cy - 9, initial, "d-label", C.primary, align="center")
        s.text(right - 42, cy - 20, name, "d-label", C.text, align="right", max_width=w - 60)
        s.text(right - 42, cy + 2, meta, "d-caption", C.muted, align="right", max_width=w - 60)
        return
    if isinstance(cell, tuple) and cell[0] == "strong":
        s.text(right, cy - 11, cell[1], "d-label", C.text, align="right", max_width=w - 16)
        return
    s.text(right, cy - 9, str(cell), "d-sm", C.text_2, align="right", max_width=w - 16)


# --------------------------------------------------------------------------- #
# charts
# --------------------------------------------------------------------------- #
def chart_line(s: Screen, x: float, y: float, w: float, h: float, series: Sequence[Sequence[float]],
               labels: Sequence[str], colors: Sequence[str], y_max: float | None = None,
               grid: int = 4, gutter: float = 40, fill_all: bool = False):
    """Series plot with the value axis on the physical right (RTL reading order)."""
    hi = y_max or max(max(v) for v in series) * 1.15
    pw = w - gutter
    for g in range(grid + 1):
        gy = y + h - g * h / grid
        s.rect(x, gy, pw, 1, fill=A.chart_grid)
        s.text(x + w, gy - 8, fa_digits(f"{int(hi * g / grid):,}"), "d-caption", C.muted_2,
               align="right")
    step = pw / max(1, len(labels) - 1)
    for index, label in enumerate(labels):
        s.text(x + pw - index * step, y + h + 8, label, "d-caption", C.muted_2, align="center")
    for index, (values, color) in enumerate(zip(series, colors)):
        pts = [(x + pw - i * step, y + h - v / hi * h) for i, v in enumerate(values)]
        if index == 0 or fill_all:
            with s.alpha_layer():
                # close along the baseline in the same right-to-left order, or the
                # polygon self-intersects into a bow-tie
                poly = pts + [(x, y + h), (x + pw, y + h)]
                s.polygon(poly, fill=(*_rgb(color), 26))
        s.line(pts, color, 2.4)
        for px, py in pts:
            s.circle(px, py, 3.0, fill=C.surface, outline=color, outline_w=2)


def chart_bars(s: Screen, x: float, y: float, w: float, h: float, values: Sequence[float],
               labels: Sequence[str], color: str = C.primary, highlight: int = -1,
               hi: float | None = None):
    hi = hi or max(values) * 1.1
    n = len(values)
    gap = 18
    bw = (w - gap * (n - 1)) / n
    for index, (value, label) in enumerate(zip(values, labels)):
        bh = value / hi * h
        bx = x + w - (index + 1) * bw - index * gap
        s.rect(bx, y + h - bh, bw, bh, fill=color if index != highlight else C.warning, radius=6)
        s.text(bx + bw / 2, y + h + 8, label, "d-caption", C.muted_2, align="center")


def donut(s: Screen, cx: float, cy: float, r: float, values: Sequence[float],
          colors: Sequence[str], thickness: float = 26, center: str = "", sub: str = ""):
    total = sum(values) or 1
    start = -90
    for value, color in zip(values, colors):
        end = start + value / total * 360
        s.d.pieslice([cx - r, cy - r, cx + r, cy + r], start, end, fill=color)
        start = end
    s.circle(cx, cy, r - thickness, fill=C.surface)
    if center:
        s.text(cx, cy - 14, center, "d-h2", C.text, align="center")
    if sub:
        s.text(cx, cy + 8, sub, "d-caption", C.muted, align="center")


def legend_row(s: Screen, x_right: float, y: float, items: Sequence[tuple[str, str]],
               gap: float = 28) -> float:
    """Inline legend: dot + label pairs, laid out right-to-left from x_right."""
    cx = x_right
    for label, color in items:
        tw = s.tw(label, "d-caption")
        s.text(cx, y, label, "d-caption", C.muted, align="right")
        s.circle(cx - tw - 11, y + 7, 4.5, fill=color)
        cx -= tw + 22 + gap
    return cx


def legend(s: Screen, x: float, y: float, items: Sequence[tuple[str, str, str]], col_w: float = 150):
    for index, (label, value, color) in enumerate(items):
        ly = y + index * 20
        s.circle(x + 5, ly + 9, 4.5, fill=color)
        s.text(x + 18, ly, label, "d-caption", C.muted, max_width=col_w - 46)
        s.text(x + col_w, ly, value, "d-caption-bold", C.text_2, align="right")


def _rgb(color: str) -> tuple[int, int, int]:
    color = color.lstrip("#")
    return tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))


# --------------------------------------------------------------------------- #
# map panel
# --------------------------------------------------------------------------- #
def map_tile(s: Screen, x: float, y: float, w: float, h: float, draw, radius: float = 16):
    """Render a map into an off-screen canvas and paste it rounded into a card slot."""
    from bb.prims import Screen as Sub

    sub = Sub(background=C.map_land, width=int(w), height=int(h), scale=1)
    draw(sub)
    from PIL import Image, ImageDraw

    alpha = Image.new("L", (int(w), int(h)), 0)
    ImageDraw.Draw(alpha).rounded_rectangle([0, 0, int(w) - 1, int(h) - 1], radius=radius, fill=255)
    s.img.paste(sub.img, (int(x), int(y)), alpha)


# --------------------------------------------------------------------------- #
# overlays
# --------------------------------------------------------------------------- #
def scrim(s: Screen, alpha: int = 96):
    with s.alpha_layer():
        s.rect(0, 0, W, H, fill=(11, 35, 35, alpha))


def drawer(s: Screen, x: float, y: float, w: float, h: float, title: str, sub: str = "",
           icon: str | None = None) -> float:
    s.shadow(x, y, w, h, radius=18, blur=40, dy=8, alpha=60)
    s.rect(x, y, w, h, fill=C.surface, radius=18)
    if icon:
        s.rect(x + w - 56, y + 20, 36, 36, fill=C.primary_soft, radius=11)
        s.i.draw_icon(x + w - 38, y + 38, icon, 19, C.primary)
        s.text(x + w - 70, y + 20, title, "d-h2", C.text, align="right")
    else:
        s.text(x + w - 24, y + 22, title, "d-h2", C.text, align="right")
    if sub:
        s.text(x + w - 24, y + 50, sub, "d-sm", C.muted, align="right", max_width=w - 110)
    s.i.draw_icon(x + 24, y + 26, "mdi-close", 18, C.muted)
    s.rect(x + 24, y + 84, w - 48, 1, fill=A.row_line)
    return y + 100


def modal(s: Screen, x: float, y: float, w: float, h: float, title: str, sub: str = ""):
    s.shadow(x, y, w, h, radius=18, blur=44, dy=10, alpha=70)
    s.rect(x, y, w, h, fill=C.surface, radius=18)
    s.text(x + w - 24, y + 22, title, "d-h2", C.text, align="right")
    if sub:
        s.text(x + w - 24, y + 52, sub, "d-sm", C.muted, align="right", max_width=w - 48)
    s.i.draw_icon(x + 24, y + 28, "mdi-close", 18, C.muted)
    return y + (78 if sub else 64)


def toast(s: Screen, x: float, y: float, w: float, text: str, tone: str = "success",
          icon: str = "mdi-check-circle-outline"):
    fill, color = {"success": (C.success_soft, C.success), "danger": (C.danger_soft, C.danger),
                   "info": (C.info_soft, C.info), "warning": (C.warning_soft, C.warning)}[tone]
    s.shadow(x, y, w, 48, radius=12, blur=22, dy=6, alpha=50)
    s.rect(x, y, w, 48, fill=C.surface, radius=12, outline=A.card_edge, outline_w=1)
    s.rect(x + w - 4, y + 8, 4, 32, fill=color, radius=2)
    s.i.draw_icon(x + w - 26, y + 24, icon, 18, color)
    s.text(x + w - 44, y + 14, text, "d-sm", C.text_2, align="right", max_width=w - 80)


def banner(s: Screen, x: float, y: float, w: float, text: str, tone: str = "warning",
           action: str | None = None, h: float = 52) -> float:
    fill, color, icon = {
        "warning": (C.warning_soft, C.warning, "mdi-alert-outline"),
        "danger": (C.danger_soft, C.danger, "mdi-alert-circle-outline"),
        "info": (C.info_soft, C.info, "mdi-information-outline"),
        "offline": ("#3A3530", "#F3D9A8", "mdi-wifi-off"),
    }[tone]
    s.rect(x, y, w, h, fill=fill, radius=12)
    s.i.draw_icon(x + w - 24, y + h / 2, icon, 18, color)
    s.text(x + w - 44, y + (h - 19) / 2, text, "d-sm", color, align="right", max_width=w - 180)
    if action:
        s.text(x + 22 + s.tw(action, "d-caption-bold"), y + (h - 17) / 2, action, "d-caption-bold",
               color, align="right")
    return y + h + 14


def empty_block(s: Screen, x: float, y: float, w: float, h: float, icon: str, title: str,
                body: str, cta: str | None = None, cta_icon: str = "mdi-filter-remove-outline"):
    s.rect(x, y, w, h, fill=C.surface, radius=16, outline=A.card_edge, outline_w=1)
    cx, cy = x + w / 2, y + h / 2 - 40
    s.circle(cx, cy, 34, fill=C.primary_soft)
    s.i.draw_icon(cx, cy, icon, 30, C.primary)
    s.text(cx, cy + 50, title, "d-h2", C.text, align="center")
    s.text(cx, cy + 82, body, "d-sm", C.muted, align="center", max_width=w - 120)
    if cta:
        bw = s.tw(cta, "d-label") + 60
        _button(s, cx - bw / 2, cy + 116, bw, 40, cta, cta_icon, "filled")


def skeleton(s: Screen, x: float, y: float, w: float, h: float, r: float = 10):
    s.rect(x, y, w, h, fill=C.surface_3, radius=r)


__all__ = [name for name in dir() if not name.startswith("_")]
