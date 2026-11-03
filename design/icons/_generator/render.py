#!/usr/bin/env python3
"""Render the icon library for the design folder.

Usage (from design/icons/_generator):
    python render.py            # rescan the client, rewrite icons.json, redraw every page
    python inventory.py         # only rescan + rewrite icons.json

Every glyph is drawn from the same Material Design Icons webfont the client ships, so a tile is the icon a
component actually renders, not a lookalike. The page layout reuses the admin-panel generator's tokens
(`atheme`) so this folder reads as part of the same design system.
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN = os.path.abspath(os.path.join(HERE, ".."))
ADMIN = os.path.abspath(os.path.join(DESIGN, "..", "admin-panel", "_generator"))
for path in (HERE, ADMIN):
    if path not in sys.path:
        sys.path.insert(0, path)

import atheme  # noqa: F401,E402  (registers the desktop type ramp)
from atheme import A, C, PAD  # noqa: E402
from desk import fa, screen  # noqa: E402
from inventory import ROLE_LABELS, ROLE_ORDER, collect, write_json  # noqa: E402
from bb.icons import codepoints as font_codepoints  # noqa: E402
from bb.text import text_width  # noqa: E402

W, H = 1440, 900
COLS = 5
TILE_W = 262
TILE_H = 84
GAP = 12
HEAD = 168          # page title block
SECTION = 52        # section header height
FOOTER = 44
SCALE = 1


def fit(text: str, style: str, max_width: float) -> str:
    """Shorten a path from the left until it fits the tile; the file name is the part a reader needs."""
    if text_width(text, style, SCALE) <= max_width:
        return text
    parts = text.split("/")
    for keep in range(len(parts), 0, -1):
        candidate = "…/" + "/".join(parts[-keep:])
        if text_width(candidate, style, SCALE) <= max_width:
            return candidate
    base = parts[-1]
    while base and text_width("…" + base, style, SCALE) > max_width:
        base = base[1:]
    return "…" + base

PAGES: list[str] = []


def _text(s, x, y, content, style="d-body", color=C.text, align="left", max_width=None):
    return s.text(x, y, content, style, color, align=align, max_width=max_width)


def glyph_box(s, x: float, y: float, icon: str, box: float = 42, size: float = 22, fill: str = C.primary_soft,
              color: str = C.primary, radius: float = 13):
    """The one place an icon is drawn as a specimen: soft tile, centred glyph, brand ink.

    The admin design-system page imports this so the specimen a component author copies and the rows in this
    library cannot drift apart.
    """
    s.rect(x, y, box, box, fill=fill, radius=radius)
    s.i.draw_icon(x + box / 2, y + box / 2, icon, size, color)


def _stat_chip(s, x, y, value: str, label: str):
    """Right-to-left stat chip: value on top, label under it, inside a soft pill."""
    w, h = 128, 58
    s.rect(x, y, w, h, fill=C.surface, radius=14, outline=A.card_edge, outline_w=1)
    _text(s, x + w - 16, y + 10, value, "d-metric-sm", C.text, align="right")
    _text(s, x + w - 16, y + 36, label, "d-caption", C.muted, align="right")
    return w


def page_head(s, title: str, subtitle: str, totals: dict, page_label: str):
    s.rect(0, 0, W, HEAD, fill=C.surface)
    s.rect(0, HEAD - 1, W, 1, fill=A.card_edge)

    s.rect(W - PAD - 46, 40, 46, 46, fill=C.primary, radius=15)
    s.i.draw_icon(W - PAD - 23, 63, "mdi-shape-outline", 26, "#FFFFFF")
    _text(s, W - PAD - 60, 34, title, "d-display", C.text, align="right")
    _text(s, W - PAD - 60, 74, subtitle, "d-sm", C.muted, align="right", max_width=780)
    _text(s, W - PAD - 60, 100, page_label, "d-caption", C.muted_2, align="right", max_width=780)

    x = PAD
    for value, label in (
        (fa(totals["icons"]), "آیکن"),
        (fa(totals["usages"]), "کاربرد در کد"),
        (fa(totals["files"]), "فایل"),
    ):
        x += _stat_chip(s, x, 52, value, label) + 10


def role_header(s, y: float, role: str, count: int, continued: bool) -> float:
    label, description = ROLE_LABELS[role]
    suffix = " (ادامه)" if continued else ""
    _text(s, W - PAD, y, f"{label}{suffix}", "d-h2", C.text, align="right")
    _text(s, W - PAD, y + 26, f"{fa(count)} آیکن · {description}", "d-caption", C.muted, align="right",
          max_width=820)
    s.rect(W - PAD - 4, y + 4, 4, 22, fill=C.primary, radius=2)
    return y + SECTION


def tile(s, x: float, y: float, item: dict):
    s.rect(x, y, TILE_W, TILE_H, fill=C.surface, radius=15, outline=A.card_edge, outline_w=1)

    box = 38
    s.rect(x + TILE_W - 12 - box, y + 12, box, box, fill=C.primary_soft, radius=12)
    s.i.draw_icon(x + TILE_W - 12 - box / 2, y + 12 + box / 2, item["name"], 21, C.primary)

    name_x = x + TILE_W - 12 - box - 10
    _text(s, name_x, y + 13, item["name"], "d-mono", C.text, align="right", max_width=name_x - x - 8)
    extra = "" if len(item["roles"]) == 1 else f" · {fa(len(item['roles']))} نقش"
    _text(s, name_x, y + 33, f"{fa(item['count'])} کاربرد · {fa(len(item['files']))} فایل{extra}",
          "d-caption", C.muted, align="right", max_width=name_x - x - 8)
    _text(s, name_x, y + 52, fit(item["files"][0], "d-caption", name_x - x - 8),
          "d-caption", C.muted_2, align="right")


def footer(s, page_number: int, total: int):
    s.rect(0, H - FOOTER, W, 1, fill=A.card_edge)
    _text(s, PAD, H - 30, "design/icons · ساخته‌شده از هستهٔ کلاینت با `python _generator/render.py`",
          "d-caption", C.muted_2)
    _text(s, W - PAD, H - 30, f"{fa(page_number)} از {fa(total)}", "d-caption", C.muted_2, align="right")


def overview(inventory: dict, total: int):
    s = screen()
    page_head(s, "کتابخانهٔ آیکن", "همهٔ آیکن‌هایی که رابط کاربری رندر می‌کند، با نقش و محل استفاده.",
              inventory["totals"], "این فایل با اسکن مستقیم کد ساخته می‌شود؛ دستی ویرایش نمی‌شود.")

    y = HEAD + 26
    by_role = {}
    for item in inventory["icons"]:
        by_role.setdefault(item["role"], []).append(item)

    # --- role cards ---------------------------------------------------------
    card_w = (W - 2 * PAD - 3 * GAP) / 4
    card_h = 140
    for index, role in enumerate(ROLE_ORDER):
        items = by_role.get(role, [])
        col, row = index % 4, index // 4
        x = PAD + col * (card_w + GAP)
        cy = y + row * (card_h + GAP)
        s.rect(x, cy, card_w, card_h, fill=C.surface, radius=16, outline=A.card_edge, outline_w=1)
        label, description = ROLE_LABELS[role]
        _text(s, x + card_w - 16, cy + 12, label, "d-title", C.text, align="right", max_width=card_w - 32)
        _text(s, x + card_w - 16, cy + 34, f"{fa(len(items))} آیکن", "d-caption-bold", C.primary, align="right")
        s.para(x + 16, cy + 54, description, "d-caption", C.muted, align="right",
               max_width=card_w - 32, max_lines=2)
        for slot, item in enumerate(items[:6]):
            bx = x + card_w - 16 - 28 - slot * 32
            glyph_box(s, bx, cy + card_h - 46, item["name"], box=28, size=16, radius=9)

    # --- size ramp ----------------------------------------------------------
    y += 2 * (card_h + GAP) + 4
    ramp_h = 136
    s.rect(PAD, y, W - 2 * PAD, ramp_h, fill=C.surface, radius=16, outline=A.card_edge, outline_w=1)
    _text(s, W - PAD - 20, y + 14, "اندازه‌های مجاز", "d-title", C.text, align="right")
    _text(s, W - PAD - 20, y + 37,
          "هر اندازه یک جای مشخص دارد؛ آیکن بزرگ‌تر از متن کنارش، همان چیزی است که پنل را بی‌نظم نشان می‌دهد.",
          "d-caption", C.muted, align="right", max_width=900)

    steps = (
        ("۱۶", "درون‌متنی", "mdi-clock-outline", "کنار جمله یا داخل سلول جدول"),
        ("۱۸", "دکمه", "mdi-refresh", "پیش‌فرض `<v-btn prepend-icon>`"),
        ("۲۰", "نوار ابزار", "mdi-bell-outline", "کنش آیکنی و نوار بالا"),
        ("۲۲", "عنوان کارت", "mdi-chart-box-outline", "کنار تیتر کارت"),
        ("۲۶", "پنل وضعیت", "mdi-cloud-off-outline", "آیکن بزرگ حالت خالی/خطا"),
    )
    col_w = (W - 2 * PAD - 40) / len(steps)
    for index, (size, label, icon, note) in enumerate(steps):
        cx = W - PAD - 20 - col_w * (index + 1)
        glyph_box(s, cx + col_w - 12 - 44, y + 64, icon, box=44, size=24, radius=14)
        text_x = cx + col_w - 12 - 44 - 12
        _text(s, text_x, y + 64, f"{size}px", "d-label", C.text, align="right")
        s.para(cx + 10, y + 84, f"{label} · {note}", "d-caption", C.muted, align="right",
               max_width=text_x - cx - 10, max_lines=2)
        if index < len(steps) - 1:
            s.rect(cx, y + 64, 1, 56, fill=A.row_line)

    # --- why this exists ----------------------------------------------------
    y += ramp_h + 14
    why_h = 156
    s.rect(PAD, y, W - 2 * PAD, why_h, fill=C.surface, radius=16, outline=A.card_edge, outline_w=1)
    _text(s, W - PAD - 20, y + 14, "چرا این فایل وجود دارد", "d-title", C.text, align="right")
    notes_left = [
        "هر آیکن تازه در کد، بلافاصله اینجا دیده می‌شود: `icons.json` از همان `mdi-*` هایی ساخته می‌شود که کامپوننت‌ها رندر می‌کنند.",
        "یک آیکن می‌تواند چند نقش داشته باشد (دکمه، منو، وضعیت)؛ نقش اصلی نمایش داده می‌شود و همهٔ کاربردها در JSON ثبت است.",
    ]
    notes_right = [
        "تست `icon-inventory.test.ts` مجموعهٔ آیکن‌های کد را با این فایل مقایسه می‌کند؛ آیکن ثبت‌نشده تست را می‌شکند.",
        "همان تست بررسی می‌کند هر آیکن در فونت Material Design Icons وجود داشته باشد؛ نام اختراعی، گلیف خالی می‌شود.",
    ]
    for column, notes in enumerate((notes_right, notes_left)):
        nx = W - PAD - 20 - column * ((W - 2 * PAD) / 2)
        ny = y + 48
        for note in notes:
            s.rect(nx, ny + 6, 5, 5, fill=C.primary, radius=2)
            _text(s, nx - 14, ny, note, "d-sm", C.muted, align="right", max_width=(W - 2 * PAD) / 2 - 40)
            ny += 48

    footer(s, 1, total)
    return s


def library_pages(inventory: dict):
    """Pack roles into pages: a section starts a page only when it does not fit where it is."""
    by_role = {}
    for item in inventory["icons"]:
        by_role.setdefault(item["role"], []).append(item)

    usable = H - FOOTER - 18
    planned: list[dict] = []
    current = {"sections": [], "y": HEAD + 18}

    for role in ROLE_ORDER:
        items = by_role.get(role, [])
        index = 0
        first = True
        while index < len(items):
            room = int((usable - current["y"] - SECTION + GAP) // (TILE_H + GAP))
            if room <= 0:
                planned.append(current)
                current = {"sections": [], "y": HEAD + 18}
                continue
            take = min(len(items) - index, room * COLS)
            current["sections"].append({"role": role, "tiles": items[index:index + take], "continued": not first})
            current["y"] += SECTION + ((take + COLS - 1) // COLS) * (TILE_H + GAP)
            index += take
            first = False
            if index < len(items):
                planned.append(current)
                current = {"sections": [], "y": HEAD + 18}
    if current["sections"]:
        planned.append(current)
    return planned


def validate(inventory: dict) -> list[str]:
    """An icon name the webfont does not carry draws as a blank box; say so before a page is rendered."""
    known = font_codepoints()
    return [item["name"] for item in inventory["icons"] if item["name"].removeprefix("mdi-") not in known]


def render():
    inventory = collect()
    write_json(inventory)
    unknown = validate(inventory)
    if unknown:
        raise SystemExit(
            "These icons are not in the Material Design Icons webfont and would render blank:\n  "
            + "\n  ".join(unknown)
        )

    planned = library_pages(inventory)
    total = len(planned) + 1
    pages = [("01-overview", lambda: overview(inventory, total))]
    for number, page in enumerate(planned, start=2):
        roles = list(dict.fromkeys(section["role"] for section in page["sections"]))
        pages.append((f"{number:02d}-{'-'.join(roles)}",
                      (lambda p, n: (lambda: library_page(p, inventory, n, total)))(page, number)))

    for name, build in pages:
        image = build()
        target = os.path.join(DESIGN, f"{name}.png")
        image.img.convert("RGB").save(target, optimize=True)
        PAGES.append(f"{name}.png")
        print(f"  ✓ {os.path.basename(target)}")
    print(f"  {total} page(s), {inventory['totals']['icons']} icons")


def library_page(page: dict, inventory: dict, number: int, total: int):
    s = screen()
    roles = [section["role"] for section in page["sections"]]
    title = ROLE_LABELS[roles[0]][0]
    subtitle = " · ".join(ROLE_LABELS[role][0] for role in dict.fromkeys(roles))
    page_head(s, "کتابخانهٔ آیکن", subtitle, inventory["totals"], f"صفحهٔ {title}")

    y = HEAD + 18
    for section in page["sections"]:
        role = section["role"]
        count = int(inventory["roles"].get(role, len(section["tiles"])))
        y = role_header(s, y, role, count, section["continued"])
        for slot, item in enumerate(section["tiles"]):
            col, row = slot % COLS, slot // COLS
            x = PAD + col * (TILE_W + GAP)
            tile(s, x, y + row * (TILE_H + GAP), item)
        rows = (len(section["tiles"]) + COLS - 1) // COLS
        y += rows * (TILE_H + GAP) + 6

    footer(s, number, total)
    return s


if __name__ == "__main__":
    render()
