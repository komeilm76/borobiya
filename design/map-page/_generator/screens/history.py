"""History section screens (own trips, companions, filters, record details, states)."""
from __future__ import annotations

from typing import Callable

from bb.prims import Screen, scrim
from bb.text import fa_digits
from bb.theme import C, R, TYPE
from bb.ui import (chrome, empty_state, home_bar, metric_tiles, notice, segmented_small,
                   sheet_header, telemetry_strip)

from ._base import box, map_view
from bb import scenario as sc
from bb.map import draw_route


def _page(top: float) -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    return s


def _summary_card(s: Screen, y: float, headline: str, metrics):
    s.shadow(16, y, 361, 100, radius=20, blur=18, dy=6, alpha=26)
    s.rect(16, y, 361, 100, fill=C.primary, radius=20)
    s.text(357, y + 16, headline, "caption", "#BFE0DC", align="right")
    s.text(357, y + 34, "آبان ۱۴۰۵", "title-sm", "#FFFFFF", align="right")
    s.text(357, y + 62, "۱۲ سفر ثبت‌شده", "caption", "#A9D2CD", align="right")
    for index, (value, label) in enumerate(metrics):
        # metrics grow from the physical left edge so they never collide with the
        # right-aligned month label (RTL reading order still ends at the right).
        cx = 40 + index * 78
        s.text(cx, y + 28, value, "title-sm", "#FFFFFF", align="center")
        s.text(cx, y + 56, label, "caption", "#A9D2CD", align="center")
    return y + 112


def _trip_card(s: Screen, y: float, item: dict, selected: bool = False) -> float:
    h = item.get("height", 132)
    s.shadow(16, y, 361, h, radius=18, blur=14, dy=4, alpha=20)
    s.rect(16, y, 361, h, fill="#FFFFFF", radius=18,
           outline=C.primary if selected else C.outline, outline_w=1.6 if selected else 1)

    # route spine: origin dot, dotted line, destination flag
    x = 357 - 20
    s.circle(x, y + 26, 5.5, fill=C.origin)
    s.dashed_vertical(x, y + 36, y + 62, C.outline_strong)
    s.i.draw_icon(x, y + 70, "mdi-flag-variant", 15, C.destination)

    s.text(357 - 34, y + 14, item["from"], "label-lg", C.text, align="right", max_width=200)
    s.text(357 - 34, y + 36, item["from_detail"], "caption", C.muted, align="right", max_width=210)
    s.text(357 - 34, y + 58, item["to"], "label-lg", C.text, align="right", max_width=200)
    s.text(357 - 34, y + 80, item["to_detail"], "caption", C.muted, align="right", max_width=210)

    # status chip (top-left) + date
    tone = {"completed": "success", "cancelled": "danger", "active": "info"}[item["status"]]
    label = {"completed": "تکمیل‌شده", "cancelled": "لغوشده", "active": "در جریان"}[item["status"]]
    s.chip(24, y + 12, label, None, tone, h=24)
    s.text(24, y + 40, item["date"], "caption", C.muted_2, align="left", max_width=110)
    s.divider(30, y + h - 40, 363)
    s.text(357 - 6, y + h - 32, f"{item['distance']} · {item['duration']} · {item['mode']}",
           "caption-bold", C.text_2, align="right")
    # companions
    if item.get("companions"):
        cx = 30
        for initial in item["companions"]:
            s.avatar(cx, y + h - 32, 21, initial, C.primary_soft, C.primary, "caption-bold")
            cx += 24
    else:
        s.i.draw_icon(30, y + h - 24, "mdi-account-outline", 15, C.muted_2)
    s.i.draw_icon(357 - 8 - s.tw(f"{item['distance']} · {item['duration']} · {item['mode']}", "caption-bold") - 6,
                  y + h - 24, "mdi-chevron-left", 16, C.muted_2)
    return y + h + 12


# --------------------------------------------------------------------------- #
# 01 — my trips
# --------------------------------------------------------------------------- #
TRIPS = [
    {"from": "خیابان دانشگاه", "from_detail": "موقعیت فعلی من", "to": "آتش‌نشانی مرکزی",
     "to_detail": "خیابان شریعتی، نبش کوچهٔ بهار", "date": "امروز · ۹:۴۱",
     "distance": "۱٫۳ کیلومتر", "duration": "۱۱ دقیقه", "mode": "خودرو",
     "status": "completed", "companions": ["م", "س"]},
    {"from": "منزل", "from_detail": "خیابان فردوس، پلاک ۲۴", "to": "بیمارستان امید",
     "to_detail": "خیابان دانشگاه", "date": "دیروز · ۱۸:۰۵",
     "distance": "۴٫۸ کیلومتر", "duration": "۱۷ دقیقه", "mode": "خودرو",
     "status": "completed", "companions": ["م", "ع"]},
    {"from": "محل کار", "from_detail": "بلوار کشاورز", "to": "میدان انقلاب",
     "to_detail": "خیابان انقلاب", "date": "۲۹ آبان · ۱۳:۲۰",
     "distance": "۲٫۱ کیلومتر", "duration": "۸ دقیقه", "mode": "دوچرخه",
     "status": "cancelled", "companions": []},
    {"from": "خیابان طالقانی", "from_detail": "کوچهٔ یاس", "to": "بوستان شریعتی",
     "to_detail": "بلوار فردوس", "date": "۲۷ آبان · ۰۷:۵۹",
     "distance": "۳٫۴ کیلومتر", "duration": "۴۲ دقیقه", "mode": "پیاده",
     "status": "completed", "companions": ["س"]},
]


def history_user() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    y = 124
    s.text(377, y, "تاریخچه", "display", C.text, align="right")
    s.text(377, y + 38, "سوابق سفرها و همراهان شما", "caption", C.muted, align="right")
    y += 62

    segmented_small(s, 16, y, 361, ["مسیرهای من", "همراهان"], active=0,
                    counts=["۱۲", "۳۴"])
    y += 50

    # search + filter row
    s.rect(16, y, 265, 44, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
    s.i.draw_icon(16 + 265 - 22, y + 22, "mdi-magnify", 18, C.muted_2)
    s.text(16 + 265 - 40, y + 10, "جستجو در سوابق", "body-sm", C.muted_2, align="right")
    s.rect(289, y, 88, 44, fill=C.primary_soft, radius=14)
    s.i.draw_icon(289 + 20, y + 22, "mdi-tune-variant", 18, C.primary)
    s.text(289 + 66, y + 10, "فیلتر", "body-sm", C.primary, align="right")
    y += 58

    y = _summary_card(s, y, "خلاصهٔ سفرهای این ماه", [("۱۲", "سفر"), ("۴۸٫۲", "کیلومتر"),
                                                     ("۳٫۵", "ساعت")])
    for item in TRIPS[:2]:
        y = _trip_card(s, y, item)
    s.rect(16, y + 2, 361, 44, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
    s.text(196.5, y + 12, "نمایش ۱۰ سفر دیگر", "label", C.primary, align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 02 — companions history
# --------------------------------------------------------------------------- #
def history_companions() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    y = 124
    s.text(377, y, "تاریخچه", "display", C.text, align="right")
    s.text(377, y + 38, "سوابق سفرها و همراهان شما", "caption", C.muted, align="right")
    y += 62
    segmented_small(s, 16, y, 361, ["مسیرهای من", "همراهان"], active=1,
                    counts=["۱۲", "۳۴"])
    y += 50

    s.rect(16, y, 265, 44, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
    s.i.draw_icon(16 + 265 - 22, y + 22, "mdi-magnify", 18, C.muted_2)
    s.text(16 + 265 - 40, y + 10, "جستجوی همراه", "body-sm", C.muted_2, align="right")
    s.rect(289, y, 88, 44, fill=C.primary_soft, radius=14)
    s.i.draw_icon(289 + 20, y + 22, "mdi-tune-variant", 18, C.primary)
    s.text(289 + 66, y + 10, "فیلتر", "body-sm", C.primary, align="right")
    y += 58

    s.text(377, y, "افراد همراه شما", "caption-bold", C.muted, align="right")
    s.text(300, y, "۶ نفر", "caption", C.muted_2, align="right")
    y += 22

    people = [("مریم رضایی", "۶ سفر مشترک", "آخرین سفر: دیروز", "م", C.primary),
              ("سعید کریمی", "۴ سفر مشترک", "آخرین سفر: ۲۹ آبان", "س", C.info),
              ("زهرا احمدی", "۳ سفر مشترک", "آخرین سفر: ۲۴ آبان", "ز", C.success),
              ("علی موسوی", "۲ سفر مشترک", "آخرین سفر: ۱۹ آبان", "ع", C.mission)]
    for name, count, last, initial, color in people:
        s.shadow(16, y, 361, 68, radius=16, blur=12, dy=3, alpha=16)
        s.rect(16, y, 361, 68, fill="#FFFFFF", radius=16, outline=C.outline, outline_w=1)
        s.circle(357 - 34, y + 34, 22, fill=C.primary_soft)
        s.text(357 - 34, y + 26, initial, "title-sm", C.primary, align="center")
        s.text(357 - 66, y + 12, name, "label-lg", C.text, align="right")
        s.text(357 - 66, y + 34, count, "caption", C.muted, align="right")
        s.text(357 - 66, y + 50, last, "caption-bold", C.muted_2, align="right")
        s.i.draw_icon(24, y + 34, "mdi-chevron-left", 18, C.muted_2)
        y += 78

    s.rect(16, y, 361, 78, fill=C.surface_2, radius=16)
    s.i.draw_icon(357, y + 20, "mdi-shield-account-outline", 18, C.muted)
    s.text(335, y + 10, "حریم خصوصی همراهان", "caption-bold", C.text_2, align="right")
    # paragraph() takes the block's LEFT edge, so a right-aligned block ends at 35 + 300.
    s.para(35, y + 28, "فقط سفرهای مشترک با شما نمایش داده می‌شود؛ موقعیت زندهٔ آن‌ها در دسترس نیست.",
           "caption", C.muted, align="right", max_width=300, line_height=17)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 03 — filter
# --------------------------------------------------------------------------- #
def history_filter() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    y = 124
    s.text(377, y, "تاریخچه", "display", C.text, align="right")
    s.text(377, y + 38, "سوابق سفرها و همراهان شما", "caption", C.muted, align="right")
    y += 62
    segmented_small(s, 16, y, 361, ["مسیرهای من", "همراهان"], active=0,
                    counts=["۱۲", "۳۴"])
    y += 50
    s.rect(16, y, 265, 44, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
    s.i.draw_icon(24, y + 22, "mdi-magnify", 18, C.muted_2)
    y += 58
    for item in TRIPS[:1]:
        _trip_card(s, y, item)
    scrim(s, 120, top=0, height=852)

    top = 236
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=60)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = sheet_header(s, top + 22, "فیلتر سوابق", "۱۲ سفر در بازهٔ فعلی",
                     icon="mdi-tune-variant", title_style="title")

    # period
    s.text(377, y, "بازهٔ زمانی", "caption-bold", C.muted, align="right")
    y += 22
    periods = ["امروز", "۷ روز", "۳۰ روز", "سفارشی"]
    tile_w = (361 - 24) / 4
    for index, label in enumerate(periods):
        tx = 16 + index * (tile_w + 8)
        active = index == 2
        s.rect(tx, y, tile_w, 40, fill=C.primary if active else C.surface_2, radius=12)
        s.text(tx + tile_w / 2, y + 10, label, "label", "#FFFFFF" if active else C.text_2,
               align="center")
    y += 52

    # date inputs
    s.rect(16, y, 176, 52, fill=C.surface_2, radius=14)
    s.text(357 - 6, y + 8, "از تاریخ", "caption", C.muted, align="right")
    s.text(357 - 6, y + 26, "۲ آبان ۱۴۰۵", "label", C.text, align="right")
    s.rect(201, y, 176, 52, fill=C.surface_2, radius=14)
    s.text(196 - 6, y + 8, "تا تاریخ", "caption", C.muted, align="right")
    s.text(196 - 6, y + 26, "۲ آذر ۱۴۰۵", "label", C.text, align="right")
    y += 68

    s.text(377, y, "وضعیت سفر", "caption-bold", C.muted, align="right")
    y += 22
    for index, (label, count, active) in enumerate([("تکمیل‌شده", "۹", True), ("لغوشده", "۲", False),
                                                    ("در جریان", "۱", False)]):
        ry = y + index * 44
        s.rect(16, ry, 361, 38, fill=C.primary_soft if active else C.surface_2, radius=12)
        s.circle(347, ry + 19, 9, fill=C.primary if active else "#FFFFFF",
                 outline=None if active else C.outline_strong, outline_w=0 if active else 1.2)
        if active:
            s.i.draw_icon(347, ry + 19, "mdi-check", 11, "#FFFFFF")
        s.text(325, ry + 9, label, "body-sm", C.text if active else C.text_2, align="right")
        s.text(60, ry + 9, count, "caption-bold", C.muted, align="right")
    y += 3 * 44 + 8

    s.text(377, y, "وسیلهٔ حرکت", "caption-bold", C.muted, align="right")
    y += 22
    for index, (label, icon, active) in enumerate([("خودرو", "mdi-car", True),
                                                   ("دوچرخه", "mdi-bicycle", False),
                                                   ("پیاده", "mdi-walk", False)]):
        tw = (361 - 16) / 3
        tx = 16 + index * (tw + 8)
        s.rect(tx, y, tw, 44, fill=C.primary_soft if active else C.surface_2, radius=12,
               outline=C.primary if active else None, outline_w=1.4 if active else 0)
        s.i.draw_icon(tx + tw - 20, y + 22, icon, 18, C.primary if active else C.muted)
        s.text(tx + tw - 34, y + 12, label, "body-sm", C.primary if active else C.text_2,
               align="right")
    y += 58

    s.text(377, y, "همراه", "caption-bold", C.muted, align="right")
    y += 22
    cx = 357
    for initial in ["م", "س", "ز", "ع"]:
        cx -= 34
        s.circle(cx + 13, y + 14, 14, fill=C.surface_3)
        s.text(cx + 13, y + 6, initial, "caption-bold", C.text_2, align="center")
    s.rect(cx - 32, y, 30, 28, fill=C.surface_2, radius=14)
    s.i.draw_icon(cx - 17, y + 14, "mdi-plus", 15, C.muted_2)

    s.shadow(16, 742, 176, 50, radius=16, blur=14, dy=5, color=C.primary, alpha=70)
    s.button(201, 742, 176, 50, "اعمال فیلتر", icon="mdi-check", variant="filled")
    s.button(16, 742, 176, 50, "پاک‌کردن", icon="mdi-filter-remove-outline", variant="tonal")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 04 — record details
# --------------------------------------------------------------------------- #
def history_details() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)

    # compact map preview of the recorded trip
    preview_h = 238
    cam = sc.camera(60, 70, 0.185)
    preview = Screen(background=C.map_land, width=393, height=preview_h)
    from bb.map import draw_base, draw_labels
    from bb.theme import VIEW_H
    cam.aim = None  # type: ignore[attr-defined]
    # project with a viewport matching the preview height
    from bb.map import Camera, to_world
    from bb.prims import Screen as _Screen
    cam_h = Camera(to_world(60, 70), 0.185)
    draw_base(preview, cam_h)
    draw_labels(preview, cam_h)
    draw_route(preview, cam_h, sc.route_world(sc.ROUTE_MAIN), width_m=14)
    preview.circle(*cam_h.project_grid(*sc.USER, preview), 8, fill="#FFFFFF", outline=C.origin,
                   outline_w=3)
    preview.i.draw_icon(*cam_h.project_grid(*sc.INCIDENT, preview), "flag-checkered", 20,
                        C.destination)
    s.img.paste(preview.img, (0, 118 * s.s))
    s.rect(0, 118 + preview_h, 393, 1, fill=C.outline)

    s.shadow(14, 136, 44, 44, radius=15, blur=12, dy=4, alpha=40)
    s.rect(14, 136, 44, 44, fill="#FFFFFF", radius=15, outline=C.outline, outline_w=1)
    s.i.draw_icon(36, 158, "mdi-arrow-right", 20, C.text_2)

    top = 356
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=44)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 20
    s.text(377, y, "سفر به آتش‌نشانی مرکزی", "title", C.text, align="right", max_width=280)
    s.text(377, y + 28, "امروز · ۹:۴۱ تا ۹:۵۲ · خودرو", "caption", C.muted, align="right")
    s.chip(24, y + 4, "تکمیل‌شده", None, "success", h=26)
    y += 58

    metric_tiles(s, 16, y, 361, [("مسافت", "۱٫۳ کیلومتر", "mdi-map-marker-distance"),
                                 ("مدت", "۱۱ دقیقه", "mdi-clock-outline"),
                                 ("میانگین", "۱۹ km/h", "mdi-speedometer")], h=68)
    y += 78

    s.text(377, y, "سیر سفر", "caption-bold", C.muted, align="right")
    y += 26
    steps = [("شروع سفر", "خیابان دانشگاه، بین ولیعصر و طالقانی", "۹:۴۱", "mdi-play"),
             ("عبور از خیابان شریعتی", "۶۰۰ متر · بدون توقف", "۹:۴۵", "mdi-map-marker-path"),
             ("رسیدن به مقصد", "آتش‌نشانی مرکزی · خیابان شریعتی", "۹:۵۲", "mdi-flag-checkered")]
    for index, (title, detail, time, icon) in enumerate(steps):
        ry = y + index * 48
        line_bottom = ry + 48 if index < len(steps) - 1 else ry + 18
        s.dividers_vertical(357 - 12, ry + 18, line_bottom, C.outline)
        s.circle(357 - 12, ry + 13, 9, fill=C.primary_soft, outline=C.primary, outline_w=1.4)
        s.i.draw_icon(357 - 12, ry + 13, icon, 11, C.primary)
        s.text(357 - 32, ry + 2, title, "label", C.text, align="right")
        s.text(357 - 32, ry + 22, detail, "caption", C.muted, align="right", max_width=240)
        s.text(16, ry + 3, time, "caption-bold", C.muted_2, align="left")
    y += len(steps) * 48

    s.rect(16, y, 361, 70, fill=C.surface_2, radius=16)
    s.text(357, y + 10, "همراهان این سفر", "caption-bold", C.muted, align="right")
    cursor = 357
    for initial, name in (("م", "مریم رضایی"), ("س", "سعید کریمی")):
        width = s.tw(name, "caption") + 42
        s.circle(cursor - 14, y + 46, 13, fill=C.primary_soft)
        s.text(cursor - 14, y + 39, initial, "caption-bold", C.primary, align="center")
        s.text(cursor - 34, y + 39, name, "caption", C.text_2, align="right")
        cursor -= width
    y += 84

    s.button(201, y, 176, 48, "تکرار این سفر", icon="mdi-restore", variant="filled")
    s.button(16, y, 176, 48, "اشتراک‌گذاری", icon="mdi-share-variant", variant="tonal")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 05–07 — states
# --------------------------------------------------------------------------- #
def history_loading() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    y = 124
    s.text(377, y, "تاریخچه", "display", C.text, align="right")
    s.text(377, y + 38, "سوابق سفرها و همراهان شما", "caption", C.muted, align="right")
    y += 62
    segmented_small(s, 16, y, 361, ["مسیرهای من", "همراهان"], active=0)
    y += 54
    s.spinner(196.5, y + 26, 16, C.primary)
    s.text(196.5, y + 54, "در حال دریافت سوابق سفر…", "caption", C.muted, align="center")
    y += 84

    def skeleton(y0: float, h: float):
        s.rect(16, y0, 361, h, fill="#FFFFFF", radius=18, outline=C.outline, outline_w=1)
        for (bx, by, bw, bh, r) in [(357 - 34, y0 + 16, 150, 14, 7), (357 - 34, y0 + 38, 200, 10, 5),
                                    (357 - 34, y0 + 60, 140, 14, 7), (357 - 34, y0 + 82, 190, 10, 5),
                                    (24, y0 + 16, 64, 22, 11)]:
            s.rect(bx, by, bw, bh, fill=C.surface_3, radius=r)
        s.divider(30, y0 + h - 40, 363)
        s.rect(30, y0 + h - 30, 120, 10, fill=C.surface_3, radius=5)

    for index in range(3):
        skeleton(y + index * 144, 132)
    s.text(196.5, y + 3 * 144 + 6, "بارگذاری صفحهٔ ۱ از ۳", "caption", C.muted_2, align="center")
    home_bar(s)
    return s


def history_empty() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    y = 124
    s.text(377, y, "تاریخچه", "display", C.text, align="right")
    s.text(377, y + 38, "سوابق سفرها و همراهان شما", "caption", C.muted, align="right")
    y += 62
    segmented_small(s, 16, y, 361, ["مسیرهای من", "همراهان"], active=0, counts=["۰", "۰"])
    y += 70

    # illustrative empty card with a dashed route
    s.rect(16, y, 361, 150, fill="#FFFFFF", radius=20, outline=C.outline, outline_w=1)
    s.dashed_route_illustration(196.5, y + 46, 250)
    y += 172

    s.circle(196.5, y + 34, 32, fill=C.primary_soft)
    s.i.draw_icon(196.5, y + 34, "mdi-map-marker-path", 30, C.primary)
    s.text(196.5, y + 78, "هنوز سفری ثبت نشده است", "title", C.text, align="center")
    s.para(56, y + 108, "با انتخاب یک مقصد روی نقشه، اولین سفر شما شروع می‌شود و پس از پایان اینجا ذخیره می‌شود.",
           "body-sm", C.muted, align="center", max_width=280)
    s.button(96.5, y + 172, 200, 50, "شروع مسیریابی", icon="mdi-navigation-variant",
             variant="filled", shadow=True)
    s.text(196.5, y + 238, "سوابق پیش از این تاریخ در دسترس نیستند", "caption", C.muted_2,
           align="center")
    home_bar(s)
    return s


def history_error() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    y = 124
    s.text(377, y, "تاریخچه", "display", C.text, align="right")
    s.text(377, y + 38, "سوابق سفرها و همراهان شما", "caption", C.muted, align="right")
    y += 62
    segmented_small(s, 16, y, 361, ["مسیرهای من", "همراهان"], active=0)
    y += 58

    s.rect(16, y, 361, 96, fill=C.danger_soft, radius=18)
    s.i.draw_icon(357 - 22, y + 28, "mdi-cloud-alert-outline", 22, C.danger)
    s.text(357 - 52, y + 14, "دریافت سوابق ناموفق بود", "label-lg", C.danger, align="right")
    s.text(357 - 52, y + 40, "بدون اتصال؛ سوابق ذخیره‌شده نمایش داده می‌شود.", "caption",
           C.muted, align="right", max_width=270)
    s.rect(24, y + 62, 96, 26, fill="#FFFFFF", radius=9)
    s.text(72, y + 66, "تلاش دوباره", "caption-bold", C.danger, align="center")
    y += 112

    s.chip(16, y, "نمایش آخرین نسخهٔ ذخیره‌شده", "mdi-database-outline", "neutral", h=28)
    y += 40
    for item in TRIPS[:2]:
        y = _trip_card(s, y, item)
    s.text(196.5, y + 2, "این فهرست ممکن است قدیمی باشد", "caption", C.muted_2, align="center")
    home_bar(s)
    return s


SCREENS: dict[str, tuple[str, Callable[[], Screen]]] = {
    "h-01-user": ("history/01-history-user.png", history_user),
    "h-02-companions": ("history/02-history-companions.png", history_companions),
    "h-03-filter": ("history/03-history-filter.png", history_filter),
    "h-04-details": ("history/04-history-details.png", history_details),
    "h-05-loading": ("history/05-history-loading.png", history_loading),
    "h-06-empty": ("history/06-history-empty.png", history_empty),
    "h-07-error": ("history/07-history-error.png", history_error),
}
