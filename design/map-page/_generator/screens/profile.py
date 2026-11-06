"""Profile section screens: who the account is, and what it is signed in on.

The map page's four sections (history / navigation / companions / mission) all answer "what am I
doing". The account answers a fifth question the folder never had a plate for: **who is doing it**.
Every screen here is grounded in the API the client already calls:

* `GET /_user/me` → `username`, `role` (`user | admin`), `isActive`, `avgRating`, `categories`,
  `createdAt`, `mustCompleteSecurityQuestions` (`shared/src/schemas/user.ts`).
* `PATCH /_user/me` → the *only* editable field is `username` (3–30, `[a-z0-9_]`).
* `GET /_user/devices` → live sessions with `deviceName`, `ip`, `lastActiveAt`, `isOnline`,
  `isCurrentDevice`; `DELETE /_user/devices/:sessionId` ends another one.
* `POST /_auth/logout` ends *this* session; recovery runs through the security questions
  (`/_auth/forgot-password/*`).

Two things the product does not have yet are drawn as what they are, not invented: the session
list carries `lastActiveAt` but no login timestamp (so the plate is «ورودها و نشستها», not a
fabricated history), and an account has no display name or avatar upload (so the identity is the
username the server actually stores).
"""
from __future__ import annotations

import math
from typing import Callable

from bb import scenario as sc
from bb.prims import Screen, scrim
from bb.text import fa_digits
from bb.theme import C, R
from bb.ui import chrome, home_bar, map_avatar_button, map_tools, metric_tiles

from ._base import box, keepout, map_view


# --------------------------------------------------------------------------- #
# shared pieces
# --------------------------------------------------------------------------- #
def _page(clock: str) -> Screen:
    s = Screen(background=C.background)
    # The profile is outside the four sections, so the control stays on screen (it is still the
    # fastest way back) but no segment claims to be the page you are on.
    chrome(s, tab=-1, map_mode=False, clock=clock)
    return s


def _header(s: Screen, title: str, subtitle: str, action_icon: str | None = None) -> float:
    """Back, title, subtitle, and an optional trailing action beside the back button.

    The action is an icon button, not a labelled pill: a Persian heading's measured width is not
    its drawn width, so a pill placed from `tw()` landed on top of «پروفایل من» every time.
    """
    s.icon_button(16, 120, 38, "mdi-chevron-right", 20, C.text_2, fill="#FFFFFF", radius=13)
    s.text(377, 118, title, "title-lg", C.text, align="right")
    s.text(377, 150, subtitle, "caption", C.muted, align="right")
    if action_icon:
        s.icon_button(62, 120, 38, action_icon, 18, C.primary, fill=C.primary_soft,
                      outline=None, shadow=False, radius=13)
    return 182


def _card(s: Screen, y: float, h: float, fill: str = "#FFFFFF", outline: str | None = C.outline,
          radius: float = 18, shadow: bool = False) -> None:
    if shadow:
        s.shadow(16, y, 361, h, radius=radius, blur=16, dy=5, alpha=22)
    s.rect(16, y, 361, h, fill=fill, radius=radius, outline=outline, outline_w=1 if outline else 0)


def _row(s: Screen, y: float, icon: str, title: str, subtitle: str, *, h: float = 64,
         danger: bool = False, trailing: str | None = "mdi-chevron-left",
         value: str | None = None) -> float:
    """One account destination: icon, two lines, a chevron or a short value on the left."""
    color = C.danger if danger else C.primary
    _card(s, y, h)
    s.circle(357 - 30, y + h / 2, 17, fill=C.danger_soft if danger else C.primary_soft)
    s.i.draw_icon(357 - 30, y + h / 2, icon, 18, color)
    s.text(357 - 58, y + (h - 22) / 2 - 9, title, "label-lg", C.text, align="right",
           max_width=250)
    s.text(357 - 58, y + (h - 22) / 2 + 12, subtitle, "caption", C.muted, align="right",
           max_width=250)
    if trailing:
        s.i.draw_icon(30, y + h / 2, trailing, 18, C.muted_2)
    if value:
        # a value on the left is still a door: keep the chevron and take the tint
        s.i.draw_icon(30, y + h / 2, "mdi-chevron-left", 18, C.muted_2)
        s.text(50, y + (h - 16) / 2, value, "caption-bold", C.primary, align="left")
    return y + h + 10


def _device_icon(name: str) -> str:
    lowered = name.lower()
    if "s23" in lowered or "pixel" in lowered or "iphone" in lowered or "samsung" in lowered:
        return "mdi-cellphone"
    if "ipad" in lowered or "tab" in lowered:
        return "mdi-tablet"
    return "mdi-laptop"


def _identity(s: Screen, y: float) -> float:
    """The account as the server describes it: a username, a role, and what the role can do."""
    _card(s, y, 136, shadow=True, outline=None, radius=20)
    # avatar: the account has no upload endpoint, so it is the initial of the stored username
    s.circle(357 - 40, y + 40, 28, fill=C.primary_soft)
    s.text(357 - 40, y + 27, "R", "title-lg", C.primary, align="center")
    s.circle(357 - 20, y + 58, 6.5, fill=C.success, outline="#FFFFFF", outline_w=2)

    s.text(357 - 78, y + 16, "نام کاربری", "caption", C.muted, align="right")
    s.ltr(357 - 78 - s.tw("reza_mohammadi", "title"), y + 31, "reza_mohammadi", "title",
          C.text)
    s.text(357 - 78, y + 60, "عضو از آبان ۱۴۰۴ · آخرین فعالیت امروز ۹:۵۲", "caption", C.muted,
           align="right", max_width=240)

    # role + what it grants: a plain account and a responder account look different here
    cursor = 357
    for label, icon, tone in (("شهروند", "mdi-account-outline", "primary"),
                              ("امدادگر · آتش و نجات", "mdi-shield-account-outline",
                               "mission")):
        width = s.tw(label, "caption-bold") + 34
        cursor -= width
        s.chip(cursor, y + 96, label, icon, tone, h=26)
        cursor -= 6
    return y + 136


# --------------------------------------------------------------------------- #
# 01 — the account page
# --------------------------------------------------------------------------- #
def profile_home() -> Screen:
    s = _page("۹:۵۲")
    y = _header(s, "پروفایل من", "حساب، نقش و دسترسی‌ها", action_icon="mdi-pencil-outline")
    y = _identity(s, y) + 12

    # three numbers the account can actually count
    metric_tiles(s, 16, y, 361, [("سفرها", "۱۲", "mdi-map-marker-path"),
                                 ("درخواست امداد", "۳", "mdi-alarm-light-outline"),
                                 ("همراهان", "۶", "mdi-account-multiple-outline")], h=58)
    y += 70

    s.text(377, y, "حساب کاربری", "caption-bold", C.muted, align="right")
    y += 20
    # «ورودها» and «دستگاهها» are two pages because they answer two questions: *when did I sign
    # in, and from what* versus *what is still signed in, and can I end it*. Merging them left
    # both questions half-answered.
    y = _row(s, y, "mdi-account-edit-outline", "اطلاعات حساب",
             "نام کاربری و مشخصات ثابت حساب", h=52)
    y = _row(s, y, "mdi-login-variant", "ورودها",
             "تاریخچهٔ ورود: زمان، دستگاه و IP", h=52)
    y = _row(s, y, "mdi-devices", "دستگاه‌ها",
             "۳ دستگاه باز · پخش اشتراک‌ها", h=52)
    y = _row(s, y, "mdi-shield-lock-outline", "امنیت حساب",
             "پرسش‌های امنیتی و گذرواژه", h=52)
    y = _row(s, y, "mdi-palette-outline", "تنظیمات و ظاهر", "پوستهٔ روشن/تیره و ترجیحات", h=52)
    # the sessions and the devices are one page with two tabs, so the hub has one door for both
    assert y < 745, y

    # leaving is a real destination, not a footer footnote — but it follows the list instead of
    # floating alone at the foot of a half-empty page
    s.button(16, y, 361, 46, "خروج از حساب", icon="mdi-exit-to-app", variant="outline",
             color=C.danger)
    # the account has no display name (`PATCH /_user/me` takes only `username`), so the footer
    # does not print one
    s.text(196.5, y + 58, "نسخهٔ ۰٫۳٫۰ · حساب کاربری", "caption", C.muted_2, align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 02 — the only editable profile field
# --------------------------------------------------------------------------- #
def profile_edit() -> Screen:
    s = _page("۹:۵۲")
    y = _header(s, "اطلاعات حساب", "فقط نام کاربری قابل تغییر است")

    _card(s, y, 132)
    s.text(353, y + 12, "نام کاربری", "caption-bold", C.muted, align="right")
    s.rect(28, y + 32, 337, 54, fill="#FFFFFF", radius=14, outline=C.primary, outline_w=1.6)
    # `ltr()` anchors the run's left edge, so a Latin value starts just inside the field
    s.ltr(44, y + 47, "reza_mohammadi", "title", C.text)
    s.i.draw_icon(348, y + 59, "mdi-pencil-outline", 17, C.primary)
    s.text(353, y + 92, "۳ تا ۳۰ نویسه؛ حرف کوچک لاتین، رقم و زیرخط", "caption", C.muted,
           align="right")
    s.text(28, y + 92, "۱۴ / ۳۰", "caption", C.muted, align="left")
    s.text(353, y + 112, "همین نام در جست‌وجوی همسفر و دعوت‌نامه دیده می‌شود.", "caption",
           C.muted_2, align="right")
    y += 146

    # read-only facts, with the reason they are read-only
    s.text(377, y, "ثابت‌های حساب", "caption-bold", C.muted, align="right")
    y += 22
    for icon, title, value, note in (
            ("mdi-badge-account-horizontal-outline", "نقش", "شهروند",
             "نقش را مدیر سامانه تعیین می‌کند"),
            ("mdi-shield-account-outline", "دستهٔ امداد", "آتش و نجات · امداد جاده‌ای",
             "از گروه‌های پاسخ‌گویی می‌آید"),
            ("mdi-check-circle-outline", "وضعیت حساب", "فعال",
             "تعلیق و فعال‌سازی در اختیار مدیر است")):
        _card(s, y, 68)
        s.circle(357 - 28, y + 26, 15, fill=C.surface_3)
        s.i.draw_icon(357 - 28, y + 26, icon, 17, C.text_2)
        s.text(357 - 52, y + 7, title, "caption", C.muted, align="right")
        s.text(357 - 52, y + 24, value, "label-lg", C.text, align="right", max_width=270)
        # the reason it is read-only belongs under the value, not squeezed beside the icon
        s.text(357 - 52, y + 46, note, "caption", C.muted_2, align="right", max_width=285)
        y += 78
    y += 2

    s.rect(16, y, 361, 62, fill=C.info_soft, radius=14)
    s.i.draw_icon(357 - 20, y + 20, "mdi-information-outline", 15, C.info)
    s.text(357 - 40, y + 10, "تغییر نام کاربری، دعوت‌های در انتظار را باطل نمی‌کند.", "caption",
           C.info, align="right", max_width=300)
    s.text(357 - 40, y + 30, "فقط از این پس با نام جدید پیدایتان می‌کنند.", "caption", C.muted,
           align="right", max_width=300)

    s.button(16, 700, 361, 50, "ذخیرهٔ تغییرات", variant="filled", shadow=True)
    s.button(16, 760, 361, 42, "انصراف", variant="text", color=C.muted)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 03 — sessions: where this account is signed in
# --------------------------------------------------------------------------- #
SESSIONS = (
    {"device": "Chrome · ویندوز ۱۱", "when": "۹:۵۲", "ip": "192.168.•••.24", "current": True,
     "online": True},
    {"device": "Samsung S23", "when": "۹:۵۰", "ip": "5.238.•••.91", "current": False,
     "online": True},
    {"device": "Safari · iPhone 13", "when": "۲۱:۴۰", "ip": "5.238.•••.17", "current": False,
     "online": False},
)


def _tabs(s: Screen, y: float, active: int) -> float:
    """The two readings of one subject: what is signed in, and what those sessions play.

    Same page, same title, same back button — the tab is a lens, not a second destination. That is
    why the account hub has a single door for both.
    """
    s.rect(16, y, 361, 38, fill=C.surface_3, radius=19)
    half = 361 / 2
    pill_x = 16 + 3 if active else 16 + 361 - 3 - half
    s.rect(pill_x, y + 3, half - 3, 32, fill="#FFFFFF", radius=16)
    labels = ("ورودها", "دستگاه‌ها")
    for index, label in enumerate(labels):
        cx = 16 + (361 / 4) + 1.5 if index else 16 + 361 - (361 / 4) - 1.5
        s.text(cx, y + 11, label, "label", C.primary if index == active else C.muted,
               align="center")
    return y + 48


def _session_row(s: Screen, y: float, item: dict, h: float = 74) -> float:
    _card(s, y, h)
    icon = _device_icon(item["device"])
    s.circle(357 - 30, y + h / 2, 17, fill=C.primary_soft if item["current"] else C.surface_3)
    s.i.draw_icon(357 - 30, y + h / 2, icon, 18, C.primary if item["current"] else C.text_2)
    # one rhythm per row: the text block is centred in the card, and both the status chip and the
    # revoke chip sit on the same centre line (they are 22 and 32 tall, so their tops differ)
    s.text(357 - 58, y + 19, item["device"], "label-lg", C.text, align="right", max_width=200)
    s.text(357 - 58, y + 41, item["when"], "caption", C.muted, align="right")
    # IPs are Latin digits in their own LTR run: inside an RTL line the separators reorder them
    s.ltr(140, y + 41, item["ip"], "caption", C.muted_2)
    if item["current"]:
        s.chip(24, y + h / 2 - 11, "همین دستگاه", None, "primary", h=22)
    else:
        s.chip(24, y + h / 2 - 16, "پایان", "mdi-close", h=32, fill="#FFFFFF", color=C.danger,
               outline=C.outline_strong)
    if item["online"]:
        s.circle(357 - 20, y + h / 2 - 20, 3.4, fill=C.success)
    return y + h + 8


def _danger_bar(s: Screen, y: float, label: str, icon: str = "mdi-close-circle-outline",
                h: float = 48) -> None:
    """A destructive control that does not out-shout the content: outline, not a filled pill."""
    s.rect(16, y, 361, h, fill="#FFFFFF", radius=14, outline=C.outline_strong, outline_w=1)
    s.text(196.5, y + h / 2 - 10, label, "label", C.danger, align="center", max_width=280)
    s.i.draw_icon(357 - 24, y + h / 2, icon, 18, C.danger)


LOGIN_DAYS = (
    {"title": "امروز", "summary": "۲ ورود", "rows": (
        {"device": "Chrome · ویندوز ۱۱", "time": "۹:۵۲", "ip": "192.168.•••.24", "current": True},
        {"device": "Samsung S23", "time": "۹:۵۰", "ip": "5.238.•••.91", "current": False},
    )},
    {"title": "دیروز", "summary": "۱ ورود", "rows": (
        {"device": "Safari · iPhone 13", "time": "۲۱:۴۰", "ip": "5.238.•••.17", "current": False},
    )},
    {"title": "۲۹ آبان", "summary": "۱ ورود", "rows": (
        {"device": "Chrome · ویندوز ۱۱", "time": "۰۹:۱۲", "ip": "192.168.•••.24", "current": False},
    )},
)

SESSIONS = tuple(row for day in LOGIN_DAYS for row in day["rows"])


def _day_header(s: Screen, y: float, title: str, summary: str) -> float:
    s.text(377, y, title, "caption-bold", C.muted, align="right")
    s.text(16, y, summary, "caption", C.muted_2, align="left")
    return y + 24


def _login_row(s: Screen, y: float, item: dict, h: float = 72) -> float:
    """One sign-in: **when** on the left, **which device** on the right.

    No revoke control here: this is a diary, and ending a session belongs to the device it holds.
    """
    s.rect(16, y, 361, h, fill="#FFFFFF", radius=16, outline=C.outline, outline_w=1)
    s.circle(377 - 30, y + 26, 17, fill=C.primary_soft if item["current"] else C.surface_3)
    s.i.draw_icon(377 - 30, y + 26, _device_icon(item["device"]), 18,
                  C.primary if item["current"] else C.text_2)
    s.text(377 - 56, y + 12, item["device"], "label-lg", C.text, align="right", max_width=200)
    # the IP keeps its own LTR run and its own column, or the separators reorder it
    s.ltr(150, y + 40, item["ip"], "caption", C.muted_2)
    if item["current"]:
        width = s.tw("همین دستگاه", "caption-bold") + 30
        s.chip(321 - width, y + 36, "همین دستگاه", None, "primary", h=22)
    # the clock is the column the eye scans: same place on every row
    s.text(24, y + 26, item["time"], "title-sm", C.text_2, align="left")
    return y + h + 8


def profile_sessions() -> Screen:
    s = _page("۹:۵۲")
    y = _header(s, "ورودها", "هر ورود، یک نشست در یک دستگاه")

    # a window switch, not a filter sheet: three ranges cover the whole question
    cursor = 377
    for label, on in (("۷ روز", True), ("۳۰ روز", False), ("همه", False)):
        width = s.tw(label, "caption-bold") + 30
        cursor -= width
        s.rect(cursor, y, width, 32, fill=C.primary if on else "#FFFFFF", radius=16,
               outline=None if on else C.outline, outline_w=0 if on else 1)
        s.text(cursor + width / 2, y + 8, label, "caption-bold",
               "#FFFFFF" if on else C.text_2, align="center")
        cursor -= 8
    y += 46

    # what the window contains, in one line: the count and the last entry have to agree with rows
    s.rect(16, y, 361, 62, fill=C.surface_2, radius=16)
    s.i.draw_icon(377 - 26, y + 31, "mdi-shield-check-outline", 19, C.success)
    s.text(377 - 50, y + 9, "۴ ورود در ۷ روز", "label", C.text, align="right")
    s.text(377 - 50, y + 32, "۳ نشست هنوز باز است · آخرین ورود: امروز ۹:۵۲", "caption",
           C.muted, align="right", max_width=300)
    y += 76

    for day in LOGIN_DAYS:
        y = _day_header(s, y, day["title"], day["summary"])
        for row in day["rows"]:
            y = _login_row(s, y, row)
        y += 4

    # the honest boundary of a login list, and the door to the sessions it created
    s.rect(16, y + 2, 361, 72, fill=C.warning_soft, radius=14)
    s.i.draw_icon(377 - 24, y + 22, "mdi-information-outline", 16, C.warning)
    s.text(377 - 46, y + 12, "این فهرست ورودهاست، نه دستگاه‌های باز.", "caption-bold",
           C.warning, align="right", max_width=290)
    s.text(377 - 46, y + 34, "یک دستگاه می‌تواند چند ورود داشته باشد؛ برای دیدن نشست‌های",
           "caption", C.muted, align="right", max_width=300)
    s.text(377 - 46, y + 50, "زنده و پایان دادن به آن‌ها، «دستگاه‌ها» را باز کنید.", "caption",
           C.muted, align="right", max_width=300)
    home_bar(s)
    return s


# The same three accounts as the login list, read as *sessions* instead of *entries*: this page
# answers «what is still open, and can I end it», and it is the only page with a revoke control.
DEVICES = (
    {"device": "Chrome · ویندوز ۱۱", "when": "همین حالا", "ip": "192.168.•••.24",
     "current": True, "online": True},
    {"device": "Samsung S23", "when": "۲ دقیقه پیش", "ip": "5.238.•••.91",
     "current": False, "online": True},
    {"device": "Safari · iPhone 13", "when": "دیروز ۲۱:۴۰", "ip": "5.238.•••.17",
     "current": False, "online": False},
)


def profile_devices() -> Screen:
    s = _page("۹:۵۲")
    y = _header(s, "دستگاه‌ها", "نشست‌های باز و دستگاهی که اشتراک‌ها را نشان می‌دهد")

    for item in DEVICES:
        _card(s, y, 92)
        s.circle(357 - 30, y + 30, 18, fill=C.primary_soft if item["current"] else C.surface_3)
        s.i.draw_icon(357 - 30, y + 30, _device_icon(item["device"]), 19,
                      C.primary if item["current"] else C.text_2)
        s.text(357 - 58, y + 8, item["device"], "label-lg", C.text, align="right",
               max_width=195)
        s.text(357 - 58, y + 30, item["when"], "caption", C.muted, align="right")
        # right-align the Latin run under the age: nothing follows it on this line, and a
        # left-anchored IP floated in the middle of the card
        s.ltr(319 - s.tw(item["ip"], "caption"), y + 52, item["ip"], "caption", C.muted_2)
        # the only control on this page: ending a session. A login record has no such button.
        if item["current"]:
            s.chip(24, y + 35, "همین دستگاه", None, "primary", h=22)
        else:
            s.chip(24, y + 30, "پایان دسترسی", "mdi-close", h=32, fill="#FFFFFF",
                   color=C.danger, outline=C.outline_strong)
        if item["online"]:
            s.circle(357 - 20, y + 14, 3.4, fill=C.success)
        y += 102

    y += 4
    s.text(377, y, "پخش‌کنندهٔ اشتراک موقعیت", "caption-bold", C.muted, align="right")
    y += 22
    _card(s, y, 122)
    s.text(353, y + 8, "کدام دستگاه موقعیت اشتراکی را نشان دهد؟", "label", C.text, align="right")
    s.text(353, y + 30, "پین هر اشتراک جداست؛ این انتخاب همه را جابه‌جا می‌کند.", "caption",
           C.muted, align="right", max_width=330)
    s.text(353, y + 48, "فقط نشست‌های زنده در این فهرست هستند.", "caption", C.muted_2,
           align="right", max_width=330)
    for index, (name, on) in enumerate((("Chrome · ویندوز ۱۱ (همین دستگاه)", True),
                                        ("Samsung S23", False))):
        ry = y + 70 + index * 28
        s.circle(357 - 18, ry + 9, 8, fill=C.primary if on else "#FFFFFF",
                 outline=None if on else C.outline_strong, outline_w=0 if on else 1.6)
        if on:
            s.i.draw_icon(357 - 18, ry + 9, "mdi-check", 10, "#FFFFFF")
        s.text(357 - 38, ry, name, "caption", C.text if on else C.text_2, align="right")
    y += 138

    # the honest boundary: what revoking does, and what an IP is not
    s.rect(16, y, 361, 80, fill=C.info_soft, radius=14)
    s.i.draw_icon(377 - 20, y + 20, "mdi-shield-key-outline", 15, C.info)
    s.text(377 - 40, y + 10, "پایان دسترسی، آن دستگاه را از حساب خارج می‌کند.",
           "caption-bold", C.info, align="right", max_width=300)
    s.text(377 - 40, y + 32, "همین دستگاه را با «خروج از حساب» ببندید.", "caption",
           C.muted, align="right", max_width=300)
    s.text(377 - 40, y + 52, "نشانی IP، محل تقریبی نیست.", "caption", C.muted,
           align="right", max_width=300)

    assert y + 80 < 748, f"devices note runs into the bar ({y + 80:.0f})"
    _danger_bar(s, 758, "پایان دادن به نشست‌های دیگر")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 05 — security
# --------------------------------------------------------------------------- #
def profile_security() -> Screen:
    s = _page("۹:۵۲")
    y = _header(s, "امنیت حساب", "پرسش‌های امنیتی، گذرواژه و نشست‌ها")

    # the recovery path the product actually has: five security questions
    _card(s, y, 92, fill=C.success_soft, outline=None)
    s.circle(357 - 30, y + 34, 20, fill="#FFFFFF")
    s.i.draw_icon(357 - 30, y + 34, "mdi-shield-check-outline", 22, C.success)
    s.text(357 - 62, y + 14, "پرسش‌های امنیتی کامل است", "label-lg", C.success, align="right")
    s.text(357 - 62, y + 38, "۵ از ۵ پرسش ثبت شده · آخرین به‌روزرسانی ۱۴۰۴/۰۹/۰۲", "caption",
           C.muted, align="right")
    s.text(357 - 62, y + 58, "بازیابی گذرواژه با همین پاسخ‌ها انجام می‌شود.", "caption",
           C.muted_2, align="right")
    y += 106

    # no chevron and no «تغییر»: the client has no in-account password endpoint, so this card is a
    # statement about the only path that exists, not a door
    y = _row(s, y, "mdi-lock-reset", "گذرواژه", "تغییر فقط با «فراموشی گذرواژه»",
             trailing=None)
    y = _row(s, y, "mdi-login-variant", "ورودهای اخیر", "۳ نشست فعال در ۳ دستگاه",
             trailing=None, value="مشاهده")
    y = _row(s, y, "mdi-devices", "دستگاه‌ها", "قطع دسترسی نشست‌های دیگر",
             trailing=None, value="مدیریت")
    # the gate in the client: an incomplete account cannot reach the map
    y = 560
    s.rect(16, y, 361, 82, fill=C.warning_soft, radius=14)
    s.i.draw_icon(357 - 20, y + 20, "mdi-alert-outline", 15, C.warning)
    s.text(357 - 40, y + 10, "اگر پرسش‌ها کامل نباشند، برنامه پیش از نقشه", "caption-bold",
           C.warning, align="right", max_width=300)
    s.text(357 - 40, y + 30, "شما را به تکمیل آن‌ها می‌برد؛ این وضعیت در نوار بالای", "caption",
           C.muted, align="right", max_width=300)
    s.text(357 - 40, y + 50, "همان صفحه هم هشدار داده می‌شود.", "caption", C.muted,
           align="right", max_width=300)

    s.text(377, 700, "خطر", "caption-bold", C.danger, align="right")
    y = 722
    _card(s, y, 62)
    s.circle(357 - 28, y + 31, 15, fill=C.danger_soft)
    s.i.draw_icon(357 - 28, y + 31, "mdi-close-circle-outline", 17, C.danger)
    s.text(357 - 52, y + 9, "پایان دادن به همهٔ نشست‌ها", "label-lg", C.danger, align="right")
    s.text(357 - 52, y + 30, "همهٔ دستگاه‌ها جز همین، از حساب خارج می‌شوند", "caption", C.muted,
           align="right")
    s.i.draw_icon(30, y + 31, "mdi-chevron-left", 18, C.muted_2)

    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 06 — leaving: this device only
# --------------------------------------------------------------------------- #
def profile_logout() -> Screen:
    cam = sc.camera(sc.USER[0] + 40, sc.USER[1] - 40, 0.2)
    s = map_view(cam, pois=False)
    chrome(s, tab=-1, clock="۹:۵۳")
    scrim(s, 120)
    s.status_bar("۹:۵۳", color="#FFFFFF")

    top = 246
    s.shadow(28, top, 337, 336, radius=26, blur=26, dy=10, alpha=70)
    s.rect(28, top, 337, 336, fill="#FFFFFF", radius=26)
    s.circle(196.5, top + 44, 28, fill=C.surface_3)
    s.i.draw_icon(196.5, top + 44, "mdi-exit-to-app", 26, C.text_2)
    s.text(196.5, top + 82, "از حساب خارج می‌شوید؟", "title", C.text, align="center")
    s.text(196.5, top + 112, "نشست همین دستگاه پایان می‌یابد.", "caption", C.muted,
           align="center")
    s.text(196.5, top + 132, "دستگاه‌های دیگر خارج نمی‌شوند.", "caption", C.muted,
           align="center")

    s.rect(44, top + 152, 305, 58, fill=C.surface_2, radius=14)
    s.i.draw_icon(327, top + 170, "mdi-monitor", 16, C.text_2)
    s.text(305, top + 162, "Chrome · ویندوز ۱۱", "caption-bold", C.text_2, align="right")
    s.text(305, top + 182, "همین دستگاه · آخرین فعالیت ۹:۵۲", "caption", C.muted,
           align="right")

    s.button(44, top + 224, 140, 46, "انصراف", variant="text", color=C.muted)
    s.button(196, top + 224, 153, 46, "خروج", icon="mdi-exit-to-app", variant="filled",
             color=C.danger)

    s.text(196.5, top + 302, "پس از خروج، برای ارسال SOS باید دوباره وارد شوید.", "caption",
           C.muted_2, align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 07 — the door: how a user reaches this section from the map
# --------------------------------------------------------------------------- #
def profile_entry() -> Screen:
    """The map's account button and the menu it opens.

    The four map sections answer «what am I doing»; the account is the fifth question, so it is
    reached from the map itself — the same avatar every plate of this section prints, in the same
    stacked control group as the map tools (`nav/01`).
    """
    cam = sc.camera(sc.USER[0] + 90, sc.USER[1] - 130, 0.185)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 126), box(0, 690, 393, 162),
                                      box(0, 594, 132, 80), box(258, 646, 135, 40)))
    s.top_scrim(128)
    # the map goes back one layer: the menu is the thing being read
    scrim(s, 52, top=0, height=852)
    chrome(s, tab=1, clock="۹:۵۱")
    map_avatar_button(s, 128, active=True, x=335)

    # the menu hangs from the button it belongs to: same corner, same inset
    left, top, w, h = 393 - 14 - 268, 184, 268, 300
    s.shadow(left, top, w, h, radius=20, blur=24, dy=10, alpha=64)
    s.rect(left, top, w, h, fill="#FFFFFF", radius=20)

    # who: the initial and the role, never a display name the server does not have
    s.circle(left + w - 38, top + 32, 20, fill=C.primary_soft)
    s.text(left + w - 38, top + 21, "R", "title-sm", C.primary, align="center")
    s.circle(left + w - 22, top + 46, 5, fill=C.success, outline="#FFFFFF", outline_w=1.6)
    s.text(left + w - 70, top + 16, "حساب من", "label-lg", C.text, align="right")
    s.text(left + w - 70, top + 38, "شهروند · امدادگر آتش و نجات", "caption", C.muted,
           align="right", max_width=170)

    y = top + 60
    s.divider(left + 12, y, left + w - 12)
    y += 6

    rows = (("پروفایل من", "mdi-account-circle-outline", False),
            ("ورودها", "mdi-login-variant", False),
            ("دستگاه‌ها", "mdi-devices", False),
            ("تاریخچه", "mdi-history", False),
            ("تنظیمات و ظاهر", "mdi-palette-outline", False),
            ("خروج از حساب", "mdi-exit-to-app", True))
    for label, icon, danger in rows:
        color = C.danger if danger else C.primary
        s.i.draw_icon(left + w - 22, y + 18, icon, 18, color)
        s.text(left + w - 40, y + 10, label, "label", C.danger if danger else C.text,
               align="right")
        if not danger:
            s.i.draw_icon(left + 18, y + 18, "mdi-chevron-left", 16, C.muted_2)
        y += 40

    home_bar(s)
    return s


SCREENS: dict[str, tuple[str, Callable[[], Screen]]] = {
    "p-01-home": ("profile/01-profile-home.png", profile_home),
    "p-02-edit": ("profile/02-profile-edit.png", profile_edit),
    "p-03-sessions": ("profile/03-login-history.png", profile_sessions),
    "p-04-devices": ("profile/04-active-devices.png", profile_devices),
    "p-05-security": ("profile/05-security.png", profile_security),
    "p-06-logout": ("profile/06-logout-confirm.png", profile_logout),
    "p-07-entry": ("profile/07-map-entry.png", profile_entry),
}
