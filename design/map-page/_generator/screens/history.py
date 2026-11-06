"""History section screens: the record of where you have been, and what it is worth.

What the client can actually answer, and therefore what these plates draw:

* **Recorded tracks** — `use-history-playback` + `HistoryPlaybackPanel.vue`: preset ranges of
  ۱/۷/۳۰ days (`RANGE_PRESET_DAYS`), a custom from/to range, speeds ۱/۴/۱۶/۶۰× (`PLAYBACK_SPEEDS`),
  step/play/scrub, and a second source — «مسیر همراهم» — whose range is pinned by the share owner
  («بازه و چگالی را صاحب اشتراک تعیین کرده است»).
* **Emergency records** — `GET /_user/sos/requests` and `GET /_user/sos/missions` exist; the request
  list already has its own plates in the SOS section, so this section links to it instead of
  redrawing it.
* **Companions** — `describeLiveShareRow` / share rows: a shared *trip* is what a companion is.
* **Trips** — the one thing the server does not store yet. `TRIPS` is therefore a proposal, and the
  plates say «سفر» where the API would have to gain a table; nothing here invents a field the client
  could not fill (no notes, no fuel, no photos).

Two decisions the earlier plates got wrong, fixed here:

* A flat list of 146px cards showed two trips per screen and no day boundaries. The record is a
  *calendar*; the plate now groups by day with a per-day total, and a row carries only what the eye
  scans for — where, when, how far, and one status.
* «نمایش ۱۰ سفر دیگر» claimed a page size the design never had. The footer now states how many of
  how many are on screen, which is the only honest thing a paging list can say.
"""
from __future__ import annotations

import math
from typing import Callable

from bb import scenario as sc
from bb.map import Camera, draw_route, draw_trace, destination_pin, origin_marker
from bb.prims import Screen, scrim
from bb.text import fa_digits
from bb.theme import C
from bb.ui import chrome, home_bar, metric_tiles, segmented_small, sheet_header

from ._base import box, keepout, map_view

TABS = ["سفرها", "مأموریت‌ها", "همراهان"]
TAB_COUNTS = ["۱۲", "۳", "۶"]
SUBTITLE = "سفرها، مأموریت‌های امدادی و همراهان شما"

ROW_H = 84


# --------------------------------------------------------------------------- #
# shared pieces
# --------------------------------------------------------------------------- #
def _header(s: Screen, subtitle: str = SUBTITLE, clock: str | None = None) -> float:
    if clock:
        chrome(s, tab=0, map_mode=False, clock=clock)
    else:
        chrome(s, tab=0, map_mode=False)
    s.text(377, 124, "تاریخچه", "display", C.text, align="right")
    s.text(377, 162, subtitle, "caption", C.muted, align="right", max_width=340)
    return 186


def _tabs(s: Screen, y: float, active: int, counts: bool = True) -> float:
    """The record has three subjects, not one list with a filter.

    A trip is not a mission: the creator of an SOS and the responder who accepted it keep two
    different records of the same incident, and a companion is a person the record was shared with.
    One tab per subject keeps every row honest about what it is.
    """
    segmented_small(s, 16, y, 361, TABS, active=active, counts=TAB_COUNTS if counts else None)
    return y + 46


def _sub_tabs(s: Screen, y: float, active: int) -> float:
    """Inside «مأموریتها»: the two sides of the same incident."""
    segmented_small(s, 16, y, 361, ["درخواست‌های من", "مأموریت‌های من"], active=active, h=34)
    return y + 44


def _search_row(s: Screen, y: float, placeholder: str) -> float:
    """Search field + filter shortcut. The chip carries its own width, so nothing is measured by hand."""
    s.rect(16, y, 265, 44, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
    s.i.draw_icon(16 + 265 - 22, y + 22, "mdi-magnify", 18, C.muted_2)
    s.text(16 + 265 - 40, y + 10, placeholder, "body-sm", C.muted_2, align="right",
           max_width=196)
    s.rect(289, y, 88, 44, fill=C.primary_soft, radius=14)
    s.i.draw_icon(289 + 88 - 20, y + 22, "mdi-tune-variant", 18, C.primary)
    s.text(289 + 88 - 36, y + 10, "فیلتر", "body-sm", C.primary, align="right")
    return y + 58


def _day_header(s: Screen, y: float, title: str, summary: str) -> float:
    s.text(377, y, title, "caption-bold", C.muted, align="right")
    s.text(16, y, summary, "caption", C.muted_2, align="left")
    return y + 24


_STATUS = {
    "completed": ("تکمیل‌شده", "success"),
    "cancelled": ("لغوشده", "muted"),
    "active": ("در جریان", "info"),
}


def _trip_row(s: Screen, y: float, item: dict, h: float = ROW_H, selected: bool = False) -> float:
    """One trip, three lines tall: what, where, how much — with the day's clock on the left.

    The old card spent 146px on four text lines and a divider to say the same thing; at 84px the
    same screen holds the whole day instead of two entries of it.
    """
    s.rect(16, y, 361, h, fill="#FFFFFF", radius=16,
           outline=C.primary if selected else C.outline, outline_w=1.6 if selected else 1)

    # route spine: origin dot, dotted hop, destination flag
    x = 345
    s.circle(x, y + 14, 4.6, fill=C.origin)
    s.dashed_vertical(x, y + 22, y + 35, C.outline_strong)
    s.i.draw_icon(x, y + 42, "mdi-flag-variant", 13, C.destination)

    s.text(331, y + 6, item["from"], "label", C.text, align="right", max_width=200)
    s.text(331, y + 28, item["to"], "label-lg", C.text, align="right", max_width=200)
    s.text(331, y + 55, item["meta"], "caption", C.muted, align="right", max_width=190)

    # left column: the clock, the status, and the one extra fact this trip has
    s.text(24, y + 7, item["time"], "caption-bold", C.muted_2, align="left")
    label, tone = _STATUS[item["status"]]
    s.chip(24, y + 28, label, None, tone, h=22)
    if item.get("mission"):
        s.i.draw_icon(30, y + 64, "mdi-ambulance", 13, C.mission)
        s.text(42, y + 57, "مأموریت امداد", "caption", C.mission, align="left")
    elif item.get("recorded"):
        s.i.draw_icon(30, y + 64, "mdi-chart-timeline-variant", 13, C.muted_2)
        s.text(42, y + 57, "مسیر ضبط‌شده", "caption", C.muted_2, align="left")
    elif item.get("companions"):
        s.i.draw_icon(30, y + 64, "mdi-account-multiple-outline", 13, C.muted_2)
        s.text(42, y + 57, fa_digits(str(item["companions"])) + " همسفر", "caption",
               C.muted_2, align="left")
    return y + h + 8


# --------------------------------------------------------------------------- #
# 01 — the record, grouped by day
# --------------------------------------------------------------------------- #
DAYS = (
    {
        "title": "امروز",
        "summary": "۲ سفر · ۵٫۱ کیلومتر",
        "trips": (
            {"from": "خیابان دانشگاه", "to": "آتش‌نشانی مرکزی", "time": "۹:۴۱",
             "meta": "۱٫۳ کیلومتر · ۱۱ دقیقه · خودرو", "status": "completed",
             "mission": True, "recorded": True, "companions": 2},
            {"from": "بیمارستان امید", "to": "منزل", "time": "۸:۱۲",
             "meta": "۳٫۸ کیلومتر · ۱۴ دقیقه · خودرو", "status": "completed",
             "recorded": True, "companions": 0},
        ),
    },
    {
        "title": "دیروز",
        "summary": "۲ سفر · ۶٫۹ کیلومتر",
        "trips": (
            {"from": "منزل", "to": "محل کار", "time": "۱۸:۰۵",
             "meta": "۴٫۸ کیلومتر · ۱۷ دقیقه · خودرو", "status": "completed",
             "companions": 1},
            {"from": "میدان انقلاب", "to": "خیابان طالقانی", "time": "۱۳:۲۰",
             "meta": "۲٫۱ کیلومتر · ۸ دقیقه · دوچرخه", "status": "cancelled",
             "recorded": True, "companions": 0},
        ),
    },
)

ALL_TRIPS = tuple(trip for day in DAYS for trip in day["trips"])


def _month_strip(s: Screen, y: float, h: float = 54) -> float:
    """The month the list is cut from: the one aggregate a calendar can state without a guess."""
    s.rect(16, y, 361, h, fill=C.primary_soft, radius=16)
    s.i.draw_icon(377 - 26, y + h / 2, "mdi-calendar-month-outline", 20, C.primary)
    s.text(377 - 52, y + 9, "آبان ۱۴۰۵", "label", C.primary, align="right")
    s.text(377 - 52, y + 30, "۱۲ سفر · ۳۸٫۴ کیلومتر · ۲ سفر امدادی", "caption", C.muted,
           align="right", max_width=290)
    return y + h + 12


def history_user() -> Screen:
    s = Screen(background=C.background)
    y = _header(s, SUBTITLE, clock="۹:۵۳")
    y = _tabs(s, y, 0)
    y = _search_row(s, y, "جستجو در سفرها")
    y = _month_strip(s, y)

    for day in DAYS:
        y = _day_header(s, y, day["title"], day["summary"])
        for trip in day["trips"]:
            y = _trip_row(s, y, trip)
        y += 2

    s.text(196.5, y + 6, "۴ سفر از ۱۲ سفر · برای دیدن بقیه اسکرول کنید",
           "caption", C.muted_2, align="center", max_width=350)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 02/03 — emergency missions, from both sides of the same incident
# --------------------------------------------------------------------------- #
# The creator and the responder keep two different records of one incident: the creator sees who
# is coming and how it ended, the responder sees the distance they covered and the rating they got.
# Both are served by `/sos/requests` and `/sos/missions`; nothing here invents a third entity.
SOS_STATUS = {
    "pending": ("در انتظار امدادگر", "warning"),
    "dispatched": ("در انتظار پذیرش", "warning"),
    "accepted": ("امدادگر در راه", "info"),
    "completed": ("تکمیل‌شده", "success"),
    "cancelled_by_requester": ("لغوشده", "muted"),
    "cancelled_by_rescuer": ("لغو توسط امدادگر", "warning"),
    "expired": ("منقضی", "muted"),
}

MISSION_STATUS = {
    "pending": ("در انتظار شروع", "warning"),
    "on_the_way": ("در راه", "info"),
    "arrived": ("رسیده", "info"),
    "in_progress": ("در حال رسیدگی", "mission"),
    "completed": ("تکمیل‌شده", "success"),
    "cancelled_by_requester": ("لغو توسط درخواست‌کننده", "muted"),
    "cancelled_by_rescuer": ("لغو توسط شما", "muted"),
    "expired": ("منقضی", "muted"),
}

REQUEST_DAYS = (
    {"title": "امروز", "summary": "۱ درخواست", "rows": (
        {"icon": "mdi-fire", "title": "آتش‌سوزی آشپزخانه",
         "address": "خیابان دانشگاه، پلاک ۱۲", "note": "سعید کریمی · ۱٫۲ کیلومتر تا شما",
         "time": "۹:۳۶", "status": "accepted"},
    )},
    {"title": "دیروز", "summary": "۱ درخواست", "rows": (
        {"icon": "mdi-bike-fast", "title": "تصادف دوچرخه",
         "address": "خیابان طالقانی، نبش کوچهٔ ۴", "note": "تکمیل در ۴۲ دقیقه · امتیاز شما ۵",
         "time": "۱۸:۱۲", "status": "completed"},
    )},
    {"title": "۲۹ آبان", "summary": "۱ درخواست", "rows": (
        {"icon": "mdi-home-flood", "title": "آب‌گرفتگی حیاط",
         "address": "کوچهٔ لاله، پلاک ۸", "note": "لغو با درخواست شما، پیش از اعزام",
         "time": "۱۳:۰۵", "status": "cancelled_by_requester"},
    )},
)

AGENT_DAYS = (
    {"title": "امروز", "summary": "۱ مأموریت", "rows": (
        {"icon": "mdi-fire", "title": "آتش‌سوزی آشپزخانه",
         "address": "خیابان دانشگاه، پلاک ۱۲", "note": "۴٫۲ کیلومتر تا محل · ۶ دقیقه در راه",
         "time": "۹:۳۸", "status": "on_the_way"},
    )},
    {"title": "۲۷ آبان", "summary": "۱ مأموریت", "rows": (
        {"icon": "mdi-hospital-box-outline", "title": "مصدومیت در پارک",
         "address": "بوستان شریعتی، درب شمالی", "note": "۲۳ دقیقه رسیدگی · امتیاز ۵ از ۵",
         "time": "۲۰:۱۰", "status": "completed"},
    )},
    {"title": "۲۴ آبان", "summary": "۱ مأموریت", "rows": (
        {"icon": "mdi-home-flood", "title": "آب‌گرفتگی حیاط",
         "address": "کوچهٔ لاله، پلاک ۸", "note": "لغو توسط شما، پیش از حرکت",
         "time": "۰۸:۴۰", "status": "cancelled_by_rescuer"},
    )},
)


def _mission_row(s: Screen, y: float, item: dict,*, side: str, h: float = 80) -> float:
    """One row per incident: what it was, where, what happened, and one status."""
    s.rect(16, y, 361, h, fill="#FFFFFF", radius=16, outline=C.outline, outline_w=1)
    soft = C.danger_soft if side == "requester" else C.mission_soft
    tone = C.danger if side == "requester" else C.mission
    s.circle(377 - 32, y + 24, 16, fill=soft)
    s.i.draw_icon(377 - 32, y + 24, item["icon"], 18, tone)
    s.text(377 - 58, y + 8, item["title"], "label-lg", C.text, align="right", max_width=215)
    s.text(377 - 58, y + 30, item["address"], "caption", C.muted, align="right", max_width=215)
    s.text(377 - 58, y + 50, item["note"], "caption", C.muted_2, align="right", max_width=215)
    table = SOS_STATUS if side == "requester" else MISSION_STATUS
    label, chip_tone = table[item["status"]]
    s.chip(24, y + 12, label, None, chip_tone, h=22)
    s.text(24, y + 44, item["time"], "caption-bold", C.muted_2, align="left")
    return y + h + 8


def _mission_summary(s: Screen, y: float, headline: str, parts: str, hint: str, *,
                     icon: str, tone: str, soft: str, h: float = 74) -> float:
    s.rect(16, y, 361, h, fill=soft, radius=18)
    s.circle(377 - 30, y + 26, 16, fill="#FFFFFF")
    s.i.draw_icon(377 - 30, y + 26, icon, 18, tone)
    s.text(377 - 56, y + 10, headline, "label-lg", tone, align="right", max_width=250)
    s.text(377 - 56, y + 32, parts, "caption", C.muted, align="right", max_width=250)
    s.text(377 - 56, y + 50, hint, "caption", C.muted_2, align="right", max_width=250)
    return y + h + 12


def history_missions() -> Screen:
    """SOS creator side: «I asked for help — who came, and how did it end?»"""
    s = Screen(background=C.background)
    y = _header(s, "درخواست‌های امدادی که ثبت کرده‌اید", clock="۹:۵۳")
    y = _tabs(s, y, 1)
    y = _sub_tabs(s, y, 0)
    y = _mission_summary(
        s, y, "۳ درخواست امداد", "۱ در جریان · ۱ تکمیل‌شده · ۱ لغوشده",
        "آخرین درخواست: امروز ۹:۳۶", icon="mdi-alarm-light-outline", tone=C.danger,
        soft=C.danger_soft)

    for day in REQUEST_DAYS:
        y = _day_header(s, y, day["title"], day["summary"])
        for row in day["rows"]:
            y = _mission_row(s, y, row, side="requester")
        y += 2

    s.rect(16, y + 4, 361, 56, fill=C.surface_2, radius=14)
    s.i.draw_icon(377 - 26, y + 26, "mdi-file-document-outline", 17, C.muted)
    s.text(377 - 50, y + 12, "پروندهٔ کامل هر درخواست در بخش امداد است", "caption-bold",
           C.text_2, align="right", max_width=300)
    s.text(377 - 50, y + 32, "شرح، عکس و زمان رسیدن امدادگر آنجاست.",
           "caption", C.muted, align="right", max_width=300)
    home_bar(s)
    return s


def history_missions_agent() -> Screen:
    """Responder side: «I accepted a mission — what did it cost me, and how was I rated?»"""
    s = Screen(background=C.background)
    y = _header(s, "مأموریت‌هایی که پذیرفته‌اید", clock="۹:۵۳")
    y = _tabs(s, y, 1)
    y = _sub_tabs(s, y, 1)
    y = _mission_summary(
        s, y, "۳ مأموریت امدادی", "۱ در راه · ۱ تکمیل‌شده · ۱ لغوشده",
        "امتیاز مأموریت‌های تکمیل‌شده: ۵ از ۵", icon="mdi-shield-account-outline",
        tone=C.mission, soft=C.mission_soft)

    for day in AGENT_DAYS:
        y = _day_header(s, y, day["title"], day["summary"])
        for row in day["rows"]:
            y = _mission_row(s, y, row, side="agent")
        y += 2

    s.rect(16, y + 4, 361, 56, fill=C.surface_2, radius=14)
    s.i.draw_icon(377 - 26, y + 26, "mdi-star-outline", 17, C.muted)
    s.text(377 - 50, y + 12, "امتیاز فقط بعد از «تکمیل‌شده» ثبت می‌شود", "caption-bold",
           C.text_2, align="right", max_width=300)
    s.text(377 - 50, y + 32, "مأموریت لغوشده در سابقه می‌ماند، بدون امتیاز.",
           "caption", C.muted, align="right", max_width=300)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 02 — companions, as a record rather than a live list
# --------------------------------------------------------------------------- #
COMPANIONS = (
    ("مریم رضایی", "م", "۶ سفر مشترک", "آخرین سفر: دیروز", C.primary),
    ("سعید کریمی", "س", "۴ سفر مشترک", "آخرین سفر: ۲۹ آبان", C.info),
    ("زهرا احمدی", "ز", "۳ سفر مشترک", "آخرین سفر: ۲۴ آبان", C.success),
    ("علی موسوی", "ع", "۲ سفر مشترک", "آخرین سفر: ۱۹ آبان", C.mission),
)


def _sort_chips(s: Screen, y: float, items, active: int) -> float:
    cursor = 377
    for index, label in enumerate(items):
        width = s.tw(label, "caption-bold") + 30
        cursor -= width
        on = index == active
        s.rect(cursor, y, width, 30, fill=C.primary if on else "#FFFFFF", radius=15,
               outline=None if on else C.outline, outline_w=0 if on else 1)
        s.text(cursor + width / 2, y + 6, label, "caption-bold",
               "#FFFFFF" if on else C.text_2, align="center")
        cursor -= 8
    return y + 40


def history_companions() -> Screen:
    s = Screen(background=C.background)
    y = _header(s, "همراهانی که سفرها با آن‌ها ثبت شده", clock="۹:۵۳")
    y = _tabs(s, y, 2)
    y = _search_row(s, y, "جستجوی همسفر")
    y = _sort_chips(s, y, ["بیشترین سفر", "آخرین سفر", "نام"], active=0)

    s.text(377, y, "۶ همسفر · ۳۴ سفر مشترک", "caption-bold", C.muted, align="right")
    y += 24

    for name, initial, count, last, color in COMPANIONS:
        s.rect(16, y, 361, 76, fill="#FFFFFF", radius=16, outline=C.outline, outline_w=1)
        s.circle(377 - 40, y + 38, 22, fill=C.primary_soft)
        s.text(377 - 40, y + 28, initial, "title-sm", color, align="center")
        s.text(377 - 72, y + 16, name, "label-lg", C.text, align="right", max_width=190)
        s.text(377 - 72, y + 40, last, "caption", C.muted, align="right", max_width=190)
        # the count is the reason the row is sorted where it is, so it gets the left column
        s.chip(44, y + 25, count.split(" ")[0] + " سفر", None, "primary", h=26)
        s.i.draw_icon(30, y + 38, "mdi-chevron-left", 18, C.muted_2)
        y += 84

    # the list is a sample of the record, and says so
    s.text(196.5, y, "۲ همسفر دیگر در سفرهای قدیمی‌تر", "caption", C.muted_2, align="center")
    y += 24

    s.rect(16, y, 361, 74, fill=C.surface_2, radius=16)
    s.i.draw_icon(377 - 24, y + 22, "mdi-shield-account-outline", 18, C.muted)
    s.text(377 - 48, y + 12, "حریم خصوصی همسفران", "caption-bold", C.text_2, align="right")
    s.para(35, y + 32, "فقط سفرهای مشترک با شما نمایش داده می‌شود؛ موقعیت زندهٔ آن‌ها در دسترس نیست.",
           "caption", C.muted, align="right", max_width=300, line_height=17)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 03 — filter
# --------------------------------------------------------------------------- #
def _toggle_row(s: Screen, y: float, title: str, note: str, on: bool, h: float = 38) -> float:
    s.rect(16, y, 361, h, fill=C.surface_2, radius=12)
    s.toggle(377 - 12 - 44, y + (h - 26) / 2, 44, 26, on=on)
    s.text(377 - 68, y + 5, title, "body-sm", C.text, align="right", max_width=250)
    s.text(377 - 68, y + 21, note, "caption", C.muted_2, align="right", max_width=250)
    return y + h + 4


def history_filter() -> Screen:
    s = Screen(background=C.background)
    y = _header(s, SUBTITLE, clock="۹:۵۴")
    y = _tabs(s, y, 0)
    y = _search_row(s, y, "جستجو در سفرها")
    scrim(s, 120, top=0, height=852)

    top = 236
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=60)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    # the count on the apply button and the count in this subtitle have to agree, or the sheet
    # is asking the user to do arithmetic before trusting it
    y = sheet_header(s, top + 22, "فیلتر سوابق", "۷ از ۱۲ سفر با فیلترهای فعلی",
                     icon="mdi-tune-variant", title_style="title")

    # period
    s.text(377, y, "بازهٔ زمانی", "caption-bold", C.muted, align="right")
    y += 22
    periods = ["امروز", "۷ روز", "۳۰ روز", "سفارشی"]
    tile_w = (361 - 24) / 4
    for index, label in enumerate(periods):
        tx = 16 + (len(periods) - 1 - index) * (tile_w + 8)
        active = index == 2
        s.rect(tx, y, tile_w, 40, fill=C.primary if active else C.surface_2, radius=12)
        s.text(tx + tile_w / 2, y + 10, label, "label", "#FFFFFF" if active else C.text_2,
               align="center")
    y += 52

    # a resolved range, not two pickers: with «۳۰ روز» selected the dates are *derived*, and two
    # editable fields would have claimed the user picked them
    s.rect(16, y, 361, 44, fill=C.surface_2, radius=12)
    s.i.draw_icon(377 - 24, y + 22, "mdi-calendar-range", 18, C.muted)
    s.text(377 - 48, y + 6, "بازهٔ انتخاب‌شده", "caption", C.muted, align="right")
    s.text(377 - 48, y + 22, "۲ آبان تا ۲ آذر ۱۴۰۵ · ۳۰ روز", "label", C.text, align="right",
           max_width=290)
    y += 56

    # status: three chips, not three full-width rows — the rows cost 120px to say nine characters
    s.text(377, y, "وضعیت سفر", "caption-bold", C.muted, align="right")
    y += 22
    cursor = 377
    for label, count, on in (("تکمیل‌شده", "۹", True), ("لغوشده", "۲", False),
                             ("در جریان", "۱", False)):
        text = f"{label} {count}"
        width = s.tw(text, "caption-bold") + 24
        cursor -= width
        s.rect(cursor, y, width, 34, fill=C.primary if on else C.surface_2, radius=17)
        s.text(cursor + width / 2, y + 7, text, "caption-bold",
               "#FFFFFF" if on else C.text_2, align="center")
        cursor -= 8
    y += 46

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
    y += 56

    s.text(377, y, "همسفر", "caption-bold", C.muted, align="right")
    y += 22
    cursor = 377 - 8
    for initial in ["م", "س", "ز", "ع"]:
        cursor -= 34
        s.circle(cursor + 14, y + 14, 14, fill=C.surface_3)
        s.text(cursor + 14, y + 6, initial, "caption-bold", C.text_2, align="center")
    s.rect(cursor - 32, y, 30, 28, fill=C.surface_2, radius=14)
    s.i.draw_icon(cursor - 17, y + 14, "mdi-plus", 15, C.muted_2)
    y += 38

    # what the record is allowed to hide — the two toggles the list header cannot express
    y = _toggle_row(s, y, "فقط سفرهای ضبط‌شده", "سفرهایی که مسیرشان برای بازپخش هست", True)
    y = _toggle_row(s, y, "فقط سفرهای امدادی", "سفرهایی که در یک مأموریت ثبت شده‌اند", False)

    assert y < 752, f"filter sheet content runs into the action bar (ends at {y:.0f})"
    s.shadow(16, 762, 176, 50, radius=16, blur=14, dy=5, color=C.primary, alpha=70)
    s.button(201, 762, 176, 50, "نمایش ۷ سفر", icon="mdi-check", variant="filled")
    s.button(16, 762, 176, 50, "پاک‌کردن", icon="mdi-filter-remove-outline", variant="tonal")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 04 — details
# --------------------------------------------------------------------------- #
def _fit_box(points, box_, height: float, padding: float = 0.84) -> "Camera":
    """`fit_camera` for a framed strip: it assumes the full 393×852 viewport, this one does not."""
    x0, y0, x1, y1 = box_
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    ppu = min((x1 - x0) / max(1e-6, max(xs) - min(xs)),
              (y1 - y0) / max(1e-6, max(ys) - min(ys))) * padding
    centre = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
    return Camera((centre[0] - ((x0 + x1) / 2 - 393 / 2) / ppu,
                   centre[1] + ((y0 + y1) / 2 - height / 2) / ppu), ppu)


def _legend(screen: Screen, x: float, y: float, w: float,
            items: list[tuple[str, str, bool]]) -> float:
    """(label, colour, dashed) keys on a white card: a recorded trip needs four line meanings."""
    rows = (len(items) + 1) // 2
    h = 12 + rows * 22
    screen.rect(x, y, w, h, fill="#FFFFFF", radius=12, outline=C.outline, outline_w=1)
    for index, (label, color, dashed) in enumerate(items):
        row, col = divmod(index, 2)
        # RTL: first key top-right; the swatch sits at the *end* of each cell, the label left of it
        right = x + w - 12 - col * (w / 2)
        cy = y + 19 + row * 22
        if dashed:
            for k in range(3):
                screen.rect(right - 26 + k * 10, cy - 1.5, 6, 3, fill=color, radius=1.5)
        else:
            screen.rect(right - 26, cy - 1.5, 26, 3, fill=color, radius=1.5)
        screen.text(right - 34, cy - 8, label, "caption", C.text_2, align="right")
    return y + h


def history_details() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)

    # the record is a *comparison*: what was suggested, where I left it, what was suggested next
    from bb.map import draw_base, draw_labels, deviation_marker, to_world
    preview_h = 282
    pts = sc.route_world(sc.TRIP_PLAN) + sc.route_world(sc.TRIP_ACTUAL)
    # y0 stays clear of the chrome: the destination pin is ~40px tall above its anchor
    cam = _fit_box(pts, (26, 48, 367, 226), preview_h)
    preview = Screen(background=C.map_land, width=393, height=preview_h)
    draw_base(preview, cam)
    draw_labels(preview, cam)

    draw_route(preview, cam, sc.route_world(sc.TRIP_PLAN), color=C.route_alt, width_m=9,
               opacity=120, dashed=True)
    draw_route(preview, cam, sc.route_world(sc.TRIP_ACTUAL), color=C.primary, width_m=11)
    draw_trace(preview, cam, sc.route_world(sc.TRIP_OFFROUTE), color=C.warning, width_px=4.2,
               opacity=210, dashed=True)
    reroute = sc.route_world([sc.TRIP_REALISED_AT, (390, 240), sc.TRIP_REJOIN_AT])
    draw_route(preview, cam, reroute, color=C.info, width_m=5, opacity=230, dashed=True)

    origin_marker(preview, cam, *sc.USER)
    destination_pin(preview, cam, *sc.INCIDENT, label=None)
    deviation_marker(preview, cam, *sc.TRIP_DEVIATION_AT, label="انحراف", label_side="above")
    _legend(preview, 16, preview_h - 72, 361,
            [("مسیر شما", C.primary, False), ("مسیر پیشنهادی", C.route_alt, True),
             ("اشتباه در مسیر", C.warning, True), ("مسیر جدید", C.info, True)])

    s.img.paste(preview.img, (0, 118 * s.s))
    s.rect(0, 118 + preview_h, 393, 1, fill=C.outline)

    s.shadow(14, 136, 44, 44, radius=15, blur=12, dy=4, alpha=40)
    s.rect(14, 136, 44, 44, fill="#FFFFFF", radius=15, outline=C.outline, outline_w=1)
    s.i.draw_icon(36, 158, "mdi-arrow-right", 20, C.text_2)


    # the emergency file this trip belongs to: a chip on the map, under the back control
    s.chip(16, 192, "پروندهٔ امداد", "mdi-ambulance", "mission", h=30)

    top = 410
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=44)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 18
    s.text(357, y, "سفر به آتش‌نشانی مرکزی", "title", C.text, align="right", max_width=250)
    s.text(357, y + 28, "امروز · ۹:۴۱ تا ۹:۵۲ · ۱٫۴ کیلومتر", "caption", C.muted, align="right")
    s.chip(24, y + 2, "تکمیل‌شده", "mdi-check", "success", h=24)
    y += 54

    metric_tiles(s, 16, y, 361, [("مدت", "۱۱ دقیقه", "mdi-clock-outline"),
                                 ("توقف", "۲ دقیقه", "mdi-pause-circle-outline"),
                                 ("انحراف", "۱ بار", "mdi-map-marker-alert")], h=58)
    y += 70

    s.text(377, y, "سیر سفر", "caption-bold", C.muted, align="right")
    y += 24
    steps = [("شروع سفر", "خیابان دانشگاه · مسیر پیشنهادی پذیرفته شد", "۹:۴۱", "mdi-play",
              C.primary, C.primary_soft),
             ("انحراف از مسیر", "پیچ اشتباه؛ مسیر پیشنهادی رد شد", "۹:۴۶", "mdi-alert-outline",
              C.warning, C.warning_soft),
             ("مسیر جدید پیشنهاد شد", "۱٫۱ کیلومتر دوباره محاسبه شد", "۹:۴۷", "mdi-routes",
              C.info, C.info_soft),
             ("رسیدن به مقصد", "آتش‌نشانی مرکزی · خیابان شریعتی", "۹:۵۲", "mdi-flag-checkered",
              C.success, C.success_soft)]
    for index, (head, detail, when, icon, tone, soft) in enumerate(steps):
        ry = y + index * 44
        line_bottom = ry + 44 if index < len(steps) - 1 else ry + 16
        s.dividers_vertical(357 - 12, ry + 17, line_bottom, C.outline)
        s.circle(357 - 12, ry + 12, 9, fill=soft, outline=tone, outline_w=1.4)
        s.i.draw_icon(357 - 12, ry + 12, icon, 11, tone)
        s.text(357 - 32, ry + 1, head, "label", C.text, align="right", max_width=250)
        s.text(357 - 32, ry + 21, detail, "caption", C.muted, align="right", max_width=250)
        s.text(16, ry + 2, when, "caption-bold", C.muted_2, align="left")
    y += len(steps) * 44 + 8

    # the trip's own facts, in one line: vehicle, company, and whether it can be replayed
    s.text(16, y + 4, "خودرو · ۲ همسفر · مسیر ضبط‌شده", "caption", C.muted, align="left")
    y += 28

    # replaying the record is the primary action here; the client shares *live* location, not
    # a past trip, so «اشتراک‌گذاری» on a finished trip was a door with nothing behind it
    s.button(201, y, 176, 46, "بازپخش مسیر", icon="mdi-play", variant="filled")
    s.button(16, y, 176, 46, "تکرار این سفر", icon="mdi-restore", variant="tonal")
    assert y + 46 < 838, f"detail sheet overflows (ends at {y + 46:.0f})"
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 05 — replay (the client's largest history component, previously undesigned)
# --------------------------------------------------------------------------- #
def history_playback() -> Screen:
    pts = sc.route_world(sc.TRIP_ACTUAL)
    cam = _fit_box(pts, (24, 132, 369, 470), 852, padding=0.96)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 120), box(0, 500, 393, 352)),
                 pois=False)
    s.top_scrim(120)
    chrome(s, tab=0, clock="۸:۲۴")

    # split by *distance*, not by point index: the densified trace is not evenly spaced, and a
    # 55 % index split left the playhead parked next to the destination pin
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    target = cum[-1] * 0.55
    split = max(1, min(len(pts) - 1, next(i for i, d in enumerate(cum) if d >= target)))

    draw_trace(s, cam, pts[:split + 1], color=C.primary, width_px=5.4, opacity=235)
    draw_trace(s, cam, pts[split:], color=C.route_alt, width_px=4.2, opacity=210, dashed=True)
    origin_marker(s, cam, *pts[0])
    destination_pin(s, cam, *pts[-1], label=None)

    px, py = cam.project(*pts[split], s)
    s.shadow(px - 32, py - 54, 64, 30, radius=12, blur=12, dy=4, alpha=48)
    s.rect(px - 32, py - 54, 64, 30, fill="#FFFFFF", radius=12, outline=C.outline, outline_w=1)
    s.text(px, py - 48, "۸:۱۹", "caption-bold", C.text, align="center")
    s.circle(px, py, 14, fill="#FFFFFF")
    s.circle(px, py, 10, fill=C.primary)
    s.circle(px, py, 4, fill="#FFFFFF")

    # what the two line styles mean, directly under the section control
    _legend(s, 16, 122, 250, [("پیموده‌شده", C.primary, False), ("باقی مسیر", C.route_alt, True)])

    top = 500
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=52)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    s.icon_button(16, top + 18, 36, "mdi-close", 18, C.muted_2, fill=C.surface_2,
                  outline=None, shadow=False, radius=12)
    s.text(377, top + 18, "بازپخش مسیر", "title", C.text, align="right")
    s.text(377, top + 48, "بیمارستان امید به منزل · امروز ۸:۱۲ تا ۸:۲۶", "caption", C.muted,
           align="right", max_width=330)

    # whose track: own recordings, or a share the owner pinned a range to
    y = top + 76
    s.rect(16, y, 361, 34, fill=C.surface_3, radius=17)
    s.rect(16 + 361 - 3 - (361 / 2), y + 3, 361 / 2 - 3, 28, fill="#FFFFFF", radius=14)
    s.text(16 + 361 - (361 / 4) - 1.5, y + 8, "مسیر خودم", "label", C.primary, align="center")
    s.text(16 + (361 / 4) + 1.5, y + 8, "مسیر همسفر", "label", C.muted, align="center")

    # the presets the API actually serves
    y += 44
    cursor = 377
    for label, on in (("۲۴ ساعت", True), ("۷ روز", False), ("۳۰ روز", False), ("بازهٔ دلخواه", False)):
        width = s.tw(label, "caption-bold") + 26
        cursor -= width
        s.rect(cursor, y, width, 32, fill=C.primary if on else "#FFFFFF", radius=16,
               outline=None if on else C.outline, outline_w=0 if on else 1)
        s.text(cursor + width / 2, y + 7, label, "caption-bold",
               "#FFFFFF" if on else C.text_2, align="center")
        cursor -= 6

    # transport
    y += 44
    s.rect(16, y, 361, 64, fill=C.surface_2, radius=16)
    s.shadow(377 - 16 - 44, y + 10, 44, 44, radius=22, blur=12, dy=4,
             color=C.primary, alpha=90)
    s.circle(377 - 16 - 22, y + 32, 22, fill=C.primary)
    s.i.draw_icon(377 - 16 - 22, y + 32, "mdi-pause", 20, "#FFFFFF")
    s.circle(377 - 16 - 44 - 12 - 17, y + 32, 17, fill="#FFFFFF")
    s.i.draw_icon(377 - 16 - 44 - 12 - 17, y + 32, "mdi-skip-previous", 17, C.text_2)
    s.circle(377 - 16 - 44 - 12 - 17 - 8 - 17, y + 32, 17, fill="#FFFFFF")
    s.i.draw_icon(377 - 16 - 44 - 12 - 17 - 8 - 17, y + 32, "mdi-skip-next", 17, C.text_2)
    s.text(196, y + 10, "۸:۱۹:۳۰", "title-sm", C.text, align="right")
    s.text(196, y + 34, "نقطهٔ ۲۳ از ۴۲", "caption", C.muted, align="right")
    s.chip(28, y + 19, "۱۶×", None, "primary", h=26)

    # scrub (a time axis, so it reads left → right like every chart)
    y += 78
    s.text(377, y - 16, "۸:۲۶", "caption", C.muted_2, align="right")
    s.text(16, y - 16, "۸:۱۲", "caption", C.muted_2, align="left")
    s.rect(16, y, 361, 6, fill=C.surface_3, radius=3)
    s.rect(16, y, 361 * 0.55, 6, fill=C.primary, radius=3)
    s.circle(16 + 361 * 0.55, y + 3, 9, fill="#FFFFFF", outline=C.primary, outline_w=2.4)

    # the one thing that changes with the source, said out loud
    s.rect(16, y + 22, 361, 56, fill=C.info_soft, radius=14)
    s.i.draw_icon(377 - 24, y + 44, "mdi-information-outline", 16, C.info)
    s.text(377 - 46, y + 30, "بازه و چگالی «مسیر همسفر» را صاحب اشتراک تعیین می‌کند.",
           "caption-bold", C.info, align="right", max_width=300)
    s.text(377 - 46, y + 48, "برای مسیر خودتان بازهٔ دلخواه هم قابل انتخاب است.",
           "caption", C.muted, align="right", max_width=300)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 06 — one companion: the trips you actually shared
# --------------------------------------------------------------------------- #
COMPANION_TRIPS = (
    {"from": "خیابان دانشگاه", "to": "آتش‌نشانی مرکزی", "time": "۹:۴۱",
     "meta": "۱٫۳ کیلومتر · ۱۱ دقیقه · خودرو", "status": "completed",
     "mission": True, "recorded": True, "companions": 2},
    {"from": "منزل", "to": "محل کار", "time": "۱۸:۰۵",
     "meta": "۴٫۸ کیلومتر · ۱۷ دقیقه · خودرو", "status": "completed",
     "companions": 1},
    {"from": "خیابان طالقانی", "to": "بوستان شریعتی", "time": "۰۷:۵۹",
     "meta": "۳٫۴ کیلومتر · ۴۲ دقیقه · پیاده", "status": "completed",
     "recorded": True, "companions": 1},
)


def history_companion() -> Screen:
    """The destination the chevron on every companion row always implied."""
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False, clock="۹:۵۵")
    s.icon_button(16, 120, 38, "mdi-chevron-right", 20, C.text_2, fill="#FFFFFF", radius=13)
    s.text(377, 118, "مریم رضایی", "title-lg", C.text, align="right")
    s.text(377, 150, "۶ سفر مشترک · آخرین سفر دیروز", "caption", C.muted, align="right")

    s.rect(16, 182, 361, 92, fill="#FFFFFF", radius=18, outline=C.outline, outline_w=1)
    s.circle(377 - 38, 228, 24, fill=C.primary_soft)
    s.text(377 - 38, 216, "م", "title", C.primary, align="center")
    # the card carries the *relationship*, not the name the page title already says
    s.text(377 - 74, 192, "۶ سفر مشترک", "label-lg", C.text, align="right")
    s.text(377 - 74, 214, "۳۴٫۲ کیلومتر همراهی · در ۱۳ ماه", "caption", C.muted,
           align="right", max_width=250)
    s.text(377 - 74, 234, "اولین سفر: ۳ مهر ۱۴۰۴ · آخرین سفر: دیروز", "caption", C.muted_2,
           align="right", max_width=250)

    y = 292
    s.text(377, y, "سفرهای مشترک", "caption-bold", C.muted, align="right")
    s.text(16, y, "۳ از ۶ سفر", "caption", C.muted_2, align="left")
    y += 24
    y = _day_header(s, y, "امروز", "۱ سفر · ۱٫۳ کیلومتر")
    y = _trip_row(s, y, COMPANION_TRIPS[0])
    y = _day_header(s, y + 2, "دیروز", "۱ سفر · ۴٫۸ کیلومتر")
    y = _trip_row(s, y, COMPANION_TRIPS[1])
    y = _day_header(s, y + 2, "۲۷ آبان", "۱ سفر · ۳٫۴ کیلومتر")
    y = _trip_row(s, y, COMPANION_TRIPS[2])

    s.rect(16, y, 361, 66, fill=C.info_soft, radius=14)
    s.i.draw_icon(377 - 24, y + 22, "mdi-link-variant", 16, C.info)
    s.text(377 - 46, y + 12, "این فهرست از سفرهای ثبت‌شده ساخته شده است", "caption-bold",
           C.info, align="right", max_width=290)
    s.text(377 - 46, y + 32, "نه از اشتراک موقعیت؛ برای دیدن مریم روی نقشه به بخش",
           "caption", C.muted, align="right", max_width=300)
    s.text(377 - 46, y + 48, "«همراهان» بروید.", "caption", C.muted, align="right")

    s.button(16, y + 82, 361, 48, "رفتن به بخش همراهان", icon="mdi-account-multiple",
             variant="filled", shadow=True)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 07–09 — states
# --------------------------------------------------------------------------- #
def history_loading() -> Screen:
    s = Screen(background=C.background)
    y = _header(s, SUBTITLE, clock="۹:۵۳")
    y = _tabs(s, y, 0) + 8
    s.spinner(196.5, y + 14, 15, C.primary)
    s.text(196.5, y + 40, "در حال دریافت سوابق سفر…", "caption", C.muted, align="center")
    y += 64

    def skeleton(y0: float, h: float = ROW_H):
        s.rect(16, y0, 361, h, fill="#FFFFFF", radius=16, outline=C.outline, outline_w=1)
        # right-aligned bars are positioned by their *left* edge: 331 is the row's text edge
        for (bx, by, bw, bh, r) in [(331 - 96, y0 + 10, 96, 10, 5),
                                    (331 - 130, y0 + 30, 130, 14, 7),
                                    (331 - 150, y0 + 58, 150, 9, 4),
                                    (24, y0 + 7, 40, 10, 5),
                                    (24, y0 + 27, 62, 22, 11)]:
            s.rect(bx, by, bw, bh, fill=C.surface_3, radius=r)

    for group in range(2):
        s.rect(333, y + 6, 44, 10, fill=C.outline, radius=5)
        s.rect(16, y + 6, 70, 10, fill=C.outline, radius=5)
        y += 26
        for _ in range(2):
            skeleton(y)
            y += ROW_H + 8
        y += 2
    s.text(196.5, y + 6, "بارگذاری صفحهٔ ۱ از ۳", "caption", C.muted_2, align="center")
    home_bar(s)
    return s


def history_empty() -> Screen:
    s = Screen(background=C.background)
    y = _header(s, SUBTITLE, clock="۹:۵۳")
    # no counts here: a lone Persian zero renders as a dot and reads as a glitch
    y = _tabs(s, y, 0, counts=False) + 84

    # illustrative empty card with a dashed route (compact, so it does not read as a blank panel)
    s.rect(16, y, 361, 104, fill="#FFFFFF", radius=20, outline=C.outline, outline_w=1)
    s.dashed_route_illustration(196.5, y + 52, 250)
    y += 126

    s.circle(196.5, y + 34, 32, fill=C.primary_soft)
    s.i.draw_icon(196.5, y + 34, "mdi-map-marker-path", 30, C.primary)
    s.text(196.5, y + 78, "هنوز سفری ثبت نشده است", "title", C.text, align="center")
    s.para(56, y + 108, "با انتخاب یک مقصد روی نقشه، اولین سفر شما شروع می‌شود و پس از پایان اینجا ذخیره می‌شود.",
           "body-sm", C.muted, align="center", max_width=280)
    s.button(96.5, y + 172, 200, 50, "شروع مسیریابی", icon="mdi-navigation-variant",
             variant="filled", shadow=True)
    home_bar(s)
    return s


def history_error() -> Screen:
    s = Screen(background=C.background)
    y = _header(s, SUBTITLE, clock="۹:۵۳")
    y = _tabs(s, y, 0) + 12

    s.rect(16, y, 361, 96, fill=C.danger_soft, radius=18)
    s.i.draw_icon(377 - 22, y + 28, "mdi-cloud-alert-outline", 22, C.danger)
    s.text(377 - 52, y + 14, "دریافت سوابق ناموفق بود", "label-lg", C.danger, align="right")
    s.text(377 - 52, y + 40, "بدون اتصال؛ سوابق ذخیره‌شده نمایش داده می‌شود.", "caption",
           C.muted, align="right", max_width=270)
    s.rect(24, y + 62, 96, 26, fill="#FFFFFF", radius=9)
    s.text(72, y + 66, "تلاش دوباره", "caption-bold", C.danger, align="center")
    y += 112

    s.chip(16, y, "نسخهٔ ذخیره‌شده", "mdi-database-outline", "neutral", h=28)
    y += 40
    y = _day_header(s, y, "امروز", "۲ سفر · ۵٫۱ کیلومتر")
    for trip in DAYS[0]["trips"]:
        y = _trip_row(s, y, trip)

    # what "cached" means for this list, and when it was cached
    s.rect(16, y + 4, 361, 66, fill=C.surface_2, radius=14)
    s.i.draw_icon(377 - 24, y + 26, "mdi-clock-outline", 17, C.muted)
    s.text(377 - 48, y + 14, "ذخیره‌شده در امروز ۹:۱۲", "caption-bold", C.text_2, align="right")
    s.text(377 - 48, y + 34, "تا برگشتن اتصال، این فهرست به‌روز نمی‌شود؛", "caption", C.muted,
           align="right", max_width=300)
    s.text(377 - 48, y + 50, "سفرهای تازه بعد از اتصال اضافه می‌شوند.", "caption", C.muted,
           align="right", max_width=300)
    home_bar(s)
    return s


SCREENS: dict[str, tuple[str, Callable[[], Screen]]] = {
    "h-01-trips": ("history/01-history-trips.png", history_user),
    "h-02-missions": ("history/02-history-missions.png", history_missions),
    "h-03-missions-agent": ("history/03-history-missions-agent.png", history_missions_agent),
    "h-04-companions": ("history/04-history-companions.png", history_companions),
    "h-05-filter": ("history/05-history-filter.png", history_filter),
    "h-06-details": ("history/06-history-details.png", history_details),
    "h-07-playback": ("history/07-history-playback.png", history_playback),
    "h-08-companion": ("history/08-history-companion.png", history_companion),
    "h-09-loading": ("history/09-history-loading.png", history_loading),
    "h-10-empty": ("history/10-history-empty.png", history_empty),
    "h-11-error": ("history/11-history-error.png", history_error),
}
