"""Design-system reference boards: colour, type, controls and sheet anatomy."""
from __future__ import annotations

from typing import Callable

from bb.prims import Screen
from bb.text import fa_digits
from bb.theme import C, R, TYPE
from bb.ui import (MISSION_STAGES, SEGMENTS, chrome, form_step, mission_pill, mission_rail,
                   mission_steps, segmented_small, sos_button, sos_dock, sos_pill, sos_rail,
                   sos_steps)

BOARD_W = 760
BOARD_H = 960


def _board() -> Screen:
    return Screen(background="#F4F7F6", width=BOARD_W, height=BOARD_H)


def _head(s: Screen, kicker: str, title: str, body: str) -> float:
    s.text(BOARD_W - 40, 40, kicker, "caption-bold", C.primary, align="right")
    s.text(BOARD_W - 40, 62, title, "display", C.text, align="right")
    s.text(40, 104, body, "body-sm", C.muted, align="left", max_width=BOARD_W - 80)
    return 140


def tokens_board() -> Screen:
    """Colour + shape tokens: brand, semantic, surface and map palette with usage notes."""
    s = _board()
    y = _head(s, "DESIGN SYSTEM · 1/5", "رنگ‌ها و معنا",
              "هر رنگ یک نقش ثابت دارد؛ رنگ بدون برچسب و آیکن برای انتقال معنا کافی نیست.")

    groups = [
        ("برند و اقدام اصلی", [("primary", C.primary, "دکمهٔ اصلی، انتخاب فعال"),
                              ("primary-deep", C.primary_deep, "نوار راهنمای مسیر"),
                              ("primary-soft", C.primary_soft, "حالت انتخاب‌شده"),
                              ("on-primary", "#FFFFFF", "متن روی رنگ اصلی")]),
        ("وضعیت‌ها", [("success", C.success, "تکمیل، آماده"),
                     ("warning", C.warning, "انحراف از مسیر، انتظار"),
                     ("danger", C.danger, "SOS، لغو، حادثه"),
                     ("info", C.info, "اطلاع‌رسانی خنثی")]),
        ("سطوح و متن", [("surface", C.surface, "کارت، شیت"),
                       ("surface-2", C.surface_2, "فیلد، ردیف ثانویه"),
                       ("text", C.text, "متن اصلی"),
                       ("muted", C.muted, "متن کم‌اهمیت")]),
        ("نقشه", [("land", C.map_land, "پس‌زمینهٔ شهر"),
                 ("water", C.map_water, "آب"),
                 ("park", C.map_park, "فضای سبز"),
                 ("route", C.route, "مسیر انتخابی")]),
    ]
    col_w = (BOARD_W - 80 - 32) / 2
    for index, (title, items) in enumerate(groups):
        col = index % 2
        row = index // 2
        x = 40 + col * (col_w + 32)
        right = x + col_w
        gy = y + row * 200
        s.text(right, gy, title, "title-sm", C.text, align="right")
        s.divider(x, gy + 28, right)
        for i, (name, color, usage) in enumerate(items):
            iy = gy + 38 + i * 40
            s.rect(right - 44, iy, 44, 30, fill=color, radius=9,
                   outline=C.outline, outline_w=1 if color == "#FFFFFF" else 0)
            s.text(right - 56, iy + 2, name, "label", C.text, align="right")
            s.text(right - 56, iy + 20, usage, "caption", C.muted, align="right")
            s.text(x, iy + 8, color.upper(), "mono", C.muted_2, align="left")

    y2 = y + 2 * 200 + 4
    s.text(BOARD_W - 40, y2, "شعاع گوشه‌ها و سایه", "title-sm", C.text, align="right")
    y2 += 32
    radii = [("شیت", 26), ("کارت", 20), ("فیلد", 14), ("چیپ", 999)]
    for i, (label, radius) in enumerate(radii):
        rx = 40 + i * 130
        h = 56
        s.shadow(rx, y2, 104, h, radius=min(radius, 26), blur=12, dy=4, alpha=26)
        s.rect(rx, y2, 104, h, fill="#FFFFFF", radius=min(radius, 26), outline=C.outline, outline_w=1)
        s.text(rx + 52, y2 + 16, label, "label", C.text, align="center")
        s.text(rx + 52, y2 + 34, f"{fa_digits(radius) if radius < 99 else '۴۴'}", "caption",
               C.muted_2, align="center")
    y2 += 84

    s.rect(40, y2, BOARD_W - 80, 116, fill=C.surface, radius=18, outline=C.outline, outline_w=1)
    s.text(BOARD_W - 58, y2 + 14, "قواعد کنتراست", "label-lg", C.text, align="right")
    rules = ["متن روی سطح روشن حداقل ۴٫۵:۱ کنتراست دارد؛ متن ثانویه از #63797A تیره‌تر نمی‌شود.",
             "وضعیت‌ها همیشه رنگ + آیکن + متن دارند تا فقط به رنگ وابسته نباشند.",
             "قرمز پر فقط برای SOS و حادثه؛ بقیهٔ خطاها با تن ملایم و حاشیه مشخص می‌شوند."]
    for i, rule in enumerate(rules):
        ry = y2 + 44 + i * 22
        s.circle(BOARD_W - 52, ry + 9, 2.5, fill=C.primary)
        s.text(BOARD_W - 64, ry, rule, "body-sm", C.muted, align="right", max_width=BOARD_W - 130)
    return s


def type_board() -> Screen:
    """Typography scale on the 8px grid."""
    s = _board()
    y = _head(s, "DESIGN SYSTEM · 2/5", "تایپوگرافی",
              "وزیرمتن با اعداد فارسی؛ اندازه‌ها روی شبکهٔ ۸ پیکسلی و برای خواندن در حرکت انتخاب شده‌اند.")
    rows = [
        ("display", "۲۵۰ متر", "عنوان صفحه و فاصلهٔ مانور"),
        ("title-lg", "به خیابان شریعتی بپیچید", "عنوان اصلی کارت"),
        ("title", "آتش‌نشانی مرکزی", "عنوان شیت"),
        ("label-lg", "شروع سفر", "دکمه و اکشن اصلی"),
        ("body", "مسیرها بر اساس موقعیت فعلی شما محاسبه شده‌اند.", "متن توضیحی"),
        ("caption", "اعتبار پیشنهاد تا ۰:۳۸", "متادیتا و راهنما"),
        ("metric", "۹:۵۰", "مقدار عددی بزرگ"),
    ]
    for i, (style, sample, usage) in enumerate(rows):
        ry = y + i * 74
        s.text(BOARD_W - 40, ry + 4, sample, style, C.text, align="right")
        s.text(40, ry + 10, style, "mono", C.muted_2, align="left")
        s.text(40, ry + 32, usage, "caption", C.muted, align="left")
        s.divider(40, ry + 66, BOARD_W - 40)

    y2 = y + len(rows) * 74 + 8
    s.text(BOARD_W - 40, y2, "قواعد", "title-sm", C.text, align="right")
    notes = [
        "همهٔ اعداد با ارقام فارسی و جهت LTR درون جمله‌های RTL.",
        "ارتفاع خط متن بدنه ۲۴px؛ متن‌های کوچک‌تر از ۱۱٫۵px استفاده نمی‌شوند.",
        "وزن‌ها: regular برای متن، semibold برای عنوان، bold برای مقدار کلیدی.",
    ]
    for i, note in enumerate(notes):
        s.text(BOARD_W - 40, y2 + 26 + i * 22, note, "body-sm", C.muted, align="right")
    return s


def controls_board() -> Screen:
    """Buttons, segmented control, chips, toggles, fields and map controls."""
    s = _board()
    y = _head(s, "DESIGN SYSTEM · 3/5", "کنترل‌ها",
              "همهٔ کنترل‌ها حداقل ۴۴ پیکسل ارتفاع دارند؛ اکشن اصلی همیشه پررنگ‌ترین عنصر است.")

    s.text(BOARD_W - 40, y, "دکمه‌ها", "title-sm", C.text, align="right")
    s.divider(40, y + 30, BOARD_W - 40)
    y += 30
    s.button(40, y, 210, 52, "شروع سفر", icon="mdi-navigation-variant", variant="filled", shadow=True)
    s.button(266, y, 210, 52, "مسیر جایگزین", icon="mdi-routes", variant="tonal")
    s.button(492, y, 228, 52, "ارسال موقعیت", icon="mdi-share-variant", variant="outline")
    y += 68
    s.button(40, y, 210, 48, "پایان سفر", icon="mdi-stop-circle-outline", variant="tonal", color=C.danger)
    s.button(266, y, 210, 48, "لغو مأموریت", variant="filled", color=C.danger)
    s.button(492, y, 228, 48, "غیرفعال", variant="filled")
    s.rect(492, y, 228, 48, fill=C.surface_3, radius=16)
    s.text(606, y + 13, "غیرفعال", "label-lg", C.muted_2, align="center")
    y += 82

    s.text(BOARD_W - 40, y, "انتخاب‌گر بخش‌ها", "title-sm", C.text, align="right")
    s.divider(40, y + 30, BOARD_W - 40)
    y += 30
    s.segmented(40, y, 360, SEGMENTS, active=1, on_map=False)
    s.text(BOARD_W - 40, y + 6, "چهار بخش مستقل؛ مسیریابی پیش‌فرض.", "caption", C.muted,
           align="right")
    s.text(BOARD_W - 40, y + 26, "در مأموریت فعال، سه بخش دیگر قفل می‌شوند.", "caption", C.muted,
           align="right")
    y += 68

    s.text(BOARD_W - 40, y, "چیپ‌ها و وضعیت", "title-sm", C.text, align="right")
    s.divider(40, y + 30, BOARD_W - 40)
    y += 30
    x = 40
    for label, icon, tone in [("ترافیک روان", "mdi-traffic-light", "success"),
                              ("نیمه‌سنگین", "mdi-traffic-light", "warning"),
                              ("SOS فوری", None, "danger"),
                              ("مأموریت فعال", "mdi-lifebuoy", "mission"),
                              ("ارسال‌شده", "mdi-check", "info")]:
        x += s.chip(x, y, label, icon, tone, h=32) + 10
    y += 52

    s.text(BOARD_W - 40, y, "کلیدها، فیلدها و کنترل نقشه", "title-sm", C.text, align="right")
    s.divider(40, y + 30, BOARD_W - 40)
    y += 30
    s.rect(40, y, 300, 56, fill=C.surface_2, radius=18, outline=C.primary, outline_w=1.6)
    s.i.draw_icon(320, y + 28, "mdi-magnify", 22, C.primary)
    s.text(300, y + 16, "کجا می‌روی؟", "label-lg", C.muted, align="right")
    s.toggle(370, y + 14, 50, 30, on=True)
    s.toggle(440, y + 14, 50, 30, on=False)
    s.icon_button(520, y + 6, 44, "mdi-layers-outline", 20, C.text_2, radius=15)
    s.icon_button(576, y + 6, 44, "mdi-crosshairs-gps", 20, C.primary, radius=15)
    y += 84

    s.rect(40, y, BOARD_W - 80, 92, fill=C.surface, radius=18, outline=C.outline, outline_w=1)
    s.text(BOARD_W - 58, y + 12, "هدف لمس و دسترس‌پذیری", "label-lg", C.text, align="right")
    rules = ["تمام اکشن‌های اصلی در نیمهٔ پایین صفحه و در دسترس انگشت شست هستند.",
             "کنترل‌های حساس (SOS، لغو) از ناحیهٔ اصلی لمس فاصله دارند و تأیید می‌خواهند.",
             "حالت focus با حاشیهٔ ۲ پیکسلی و بدون اتکا به رنگ تنها نمایش داده می‌شود."]
    for i, rule in enumerate(rules):
        s.text(BOARD_W - 58, y + 38 + i * 18, "• " + rule, "caption", C.muted, align="right")
    return s


def sheet_board() -> Screen:
    """Bottom-sheet anatomy: collapsed, half and expanded, plus anatomy labels."""
    s = _board()
    y = _head(s, "DESIGN SYSTEM · 4/5", "شیت پایین صفحه",
              "شیت‌ها سلسله‌مراتب ثابتی دارند: دستگیره، عنوان، محتوا، اکشن اصلی.")

    # three mini states side by side, each frame clipped like a phone screen
    specs = [("بسته", 0.28), ("نیمه‌باز", 0.52), ("باز", 0.76)]
    mini_w = (BOARD_W - 80 - 2 * 20) / 3
    mh = 552
    for index, (label, ratio) in enumerate(specs):
        mx = 40 + index * (mini_w + 20)
        my = y
        with s.clip_rounded(mx, my, mini_w, mh, 20):
            s.rect(mx, my, mini_w, mh, fill=C.map_land)
            # road grid + a route so the frame reads as a map, not an empty box
            for i in range(14):
                gy = my + 26 + i * 30
                s.rect(mx, gy, mini_w, 3, fill="#E4EBE3")
            for i in range(5):
                gx = mx + 18 + i * 42
                s.rect(gx, my, 3, mh, fill="#E7EDE5")
            route = [(mx + 12, my + 470), (mx + 60, my + 400), (mx + 118, my + 400),
                     (mx + 150, my + 330), (mx + 178, my + 280)]
            s.line(route, C.primary, 5)
            s.circle(mx + 178, my + 280, 7, fill=C.destination, outline="#FFFFFF", outline_w=2)

            top = my + mh * (1 - ratio)
            s.shadow(mx, top, mini_w, mh * ratio + 8, radius=22, blur=14, dy=4, alpha=40)
            s.rect(mx, top, mini_w, mh * ratio + 8, fill="#FFFFFF", radius=22)
            s.rect(mx, top + 22, mini_w, mh * ratio, fill="#FFFFFF")
            s.rect(mx + mini_w / 2 - 18, top + 8, 36, 4, fill=C.outline_strong, radius=2)
            s.text(mx + mini_w - 16, top + 20, label, "label", C.text, align="right")
            s.text(mx + mini_w - 16, top + 42, "مقصد انتخاب‌شده", "caption", C.muted,
                   align="right")
            s.rect(mx + 16, top + 64, mini_w - 32, 34, fill=C.surface_2, radius=12)
            s.rect(mx + 16, top + 104, mini_w - 32, 26, fill=C.surface_2, radius=10)
            if ratio >= 0.5:
                s.button(mx + 16, my + mh - 68, mini_w - 32, 46, "سفر", variant="filled")
        # frame outline last so the clipped content keeps a crisp border
        s.rect(mx, my, mini_w, mh, fill=None, radius=20, outline=C.outline, outline_w=1.2)
        s.text(mx + mini_w / 2, my + mh + 14,
               f"{fa_digits(int(ratio * 100))}٪ ارتفاع صفحه", "caption", C.muted_2,
               align="center")
    y += mh + 52

    s.rect(40, y, BOARD_W - 80, 176, fill=C.surface, radius=18, outline=C.outline, outline_w=1)
    s.text(BOARD_W - 58, y + 12, "قواعد شیت", "label-lg", C.text, align="right")
    rules = [
        "حداکثر دو حالت (بسته/باز) برای هر شیت؛ حالت سوم فقط در سفر فعال.",
        "شیت هرگز دکمهٔ اصلی را زیر نوار home پنهان نمی‌کند؛ padding پایین = safe-area + ۱۲px.",
        "بستن با کشیدن به پایین یا Escape؛ در سفر فعال بستن فقط از مسیرهای مشخص.",
        "پنل روی نقشه نباید بیش از ۴۵٪ ارتفاع را در حالت عادی بگیرد.",
    ]
    for i, rule in enumerate(rules):
        s.text(BOARD_W - 58, y + 40 + i * 30, "• " + rule, "body-sm", C.muted, align="right")
    return s


def mission_state_board() -> Screen:
    """The mission-state trio: rail (full), steps (slim), pill (overlay) — one contract, three sizes."""
    s = _board()
    y = _head(s, "DESIGN SYSTEM · 5/5", "وضعیت مأموریت",
              "هر صفحهٔ مأموریت باید بگوید مأموریت کجاست. سه اندازه از یک قرارداد: ریل کامل، "
              "خط فشرده، و پیل روی نقشه.")

    # 1 — the rail (running, then finished)
    s.rect(40, y, BOARD_W - 80, 262, fill=C.surface, radius=18, outline=C.outline, outline_w=1)
    s.text(BOARD_W - 58, y + 12, "ریل کامل · mission_rail", "label-lg", C.text, align="right")
    s.text(BOARD_W - 58, y + 36, "شیت‌هایی که جا دارند: جزئیات، رسیدن، گزارش، پایان.",
           "caption", C.muted, align="right")
    mission_rail(s, 58, y + 64, BOARD_W - 116, 2, timestamps=("۹:۴۹", "۹:۵۰", "۹:۵۳"),
                 tone="mission")
    mission_rail(s, 58, y + 160, BOARD_W - 116, 4,
                 timestamps=("۹:۴۹", "۹:۵۰", "۹:۵۳", "۹:۵۴", "۱۰:۱۲"), tone="success")
    y += 278

    # 2 — the slim line
    s.rect(40, y, BOARD_W - 80, 176, fill=C.surface, radius=18, outline=C.outline, outline_w=1)
    s.text(BOARD_W - 58, y + 12, "خط فشرده · mission_steps", "label-lg", C.text, align="right")
    s.text(BOARD_W - 58, y + 36, "فرم‌ها و شیت‌های پر: پیشنهاد، مسیر جایگزین، پشتیبانی.",
           "caption", C.muted, align="right")
    mission_steps(s, 58, y + 64, BOARD_W - 116, -1, note="هنوز پذیرفته نشده")
    mission_steps(s, 58, y + 98, BOARD_W - 116, 1, note="همین مأموریت")
    mission_steps(s, 58, y + 132, BOARD_W - 116, 3, note="درخواست پشتیبانی ۹:۵۵")
    y += 192

    # 3 — the pill, on a map overlay
    s.rect(40, y, BOARD_W - 80, 190, fill=C.surface, radius=18, outline=C.outline, outline_w=1)
    s.text(BOARD_W - 58, y + 12, "پیل روی نقشه · mission_pill", "label-lg", C.text, align="right")
    s.text(BOARD_W - 58, y + 36, "در مسیریابی، جایی که شیت باز است و فقط یک خط جا هست.",
           "caption", C.muted, align="right")
    w1 = mission_pill(s, None, y + 66, 1, label="در مسیر", h=32)
    mission_pill(s, BOARD_W - 58 - w1, y + 66, 1, label="در مسیر", h=32)
    w2 = mission_pill(s, None, y + 110, 4, label="بسته شد", tone="primary")
    mission_pill(s, BOARD_W - 58 - w2, y + 110, 4, label="بسته شد", tone="primary")
    w3 = mission_pill(s, None, y + 154, 3, style="soft")
    mission_pill(s, BOARD_W - 58 - w3, y + 154, 3, style="soft")
    y += 206

    # 4 — the rules
    s.rect(40, y, BOARD_W - 80, 142, fill=C.surface, radius=18, outline=C.outline, outline_w=1)
    s.text(BOARD_W - 58, y + 10, "قواعد وضعیت", "label-lg", C.text, align="right")
    rules = [
        "پنج مرحله، همیشه و همه‌جا، از راست: پذیرش، در مسیر، رسیده، رسیدگی، پایان.",
        "مرحلهٔ جاری حلقه می‌شود نه نقطهٔ بزرگ‌تر؛ زمان مرحله‌های آینده چاپ نمی‌شود.",
        "ساعت نوار وضعیت همان لحظهٔ صفحه است؛ ۹:۴۱ روی صفحه‌ای با «۱۰:۱۲» خطاست.",
        "یک داده یک‌جا: اگر ریل زمان را می‌گوید، جعبهٔ «زمان صرف‌شده» تکرار است.",
    ]
    for i, rule in enumerate(rules):
        s.text(BOARD_W - 58, y + 34 + i * 25, "• " + rule, "body-sm", C.muted, align="right")
    return s


def sos_parts_board() -> Screen:
    """The SOS request's own parts: its rail, its button, and the tiles the form uses."""
    from screens.sos import hold_button, incident_tiles, severity_cards

    s = _board()
    class _Shift:
        """Left-inset proxy: the form helpers are laid out for a 393px sheet, the board is 760."""

        def __init__(self, screen, dx):
            self.screen, self.dx = screen, dx

        def __getattr__(self, name):
            attr = getattr(self.screen, name)
            if name == "i":                      # the icon canvas draws at absolute x too
                canvas, dx = attr, self.dx

                class _Icons:
                    def __getattr__(self, inner):
                        fn = getattr(canvas, inner)
                        if inner == "draw_icon":
                            def wrapped(x, *args, **kwargs):
                                return fn(x + dx, *args, **kwargs)
                            return wrapped
                        return fn

                return _Icons()
            if name in ("rect", "circle", "text", "icon", "button", "chip"):
                def wrapped(x, *args, **kwargs):
                    return attr(x + self.dx, *args, **kwargs)
                return wrapped
            return attr

    y = _head(s, "DESIGN SYSTEM · 6/6", "اجزای درخواست امداد",
              "درخواست SOS ریل و دکمهٔ خودش را دارد، اما از همان توکن‌ها و همان قواعد RTL "
              "می‌آید: چهار قدم پیش از ارسال، پنج مرحله پس از آن، و یک دکمهٔ ثابت روی نقشه.")

    # 1 — the SOS rail, running then finished
    s.rect(40, y, BOARD_W - 80, 232, fill=C.surface, radius=18, outline=C.outline, outline_w=1)
    s.text(BOARD_W - 58, y + 12, "ریل · sos_rail", "label-lg", C.text, align="right")
    s.text(BOARD_W - 58, y + 36, "ثبت ‹ اعزام ‹ پذیرش ‹ رسیدگی ‹ پایان؛ قرمز تا پایان، "
           "سبز پس از بسته‌شدن.", "caption", C.muted, align="right", max_width=BOARD_W - 140)
    sos_rail(s, 58, y + 58, BOARD_W - 116, 2, timestamps=("۹:۳۶", "۹:۴۳", "۹:۴۹"))
    sos_rail(s, 58, y + 150, BOARD_W - 116, 4,
             timestamps=("۹:۳۶", "۹:۴۳", "۹:۴۹", "۹:۵۳", "۱۰:۱۲"), ended="انجام شد")
    y += 244

    # 2 — the form's own four steps: the request rail cannot exist before the request does
    s.rect(40, y, BOARD_W - 80, 116, fill=C.surface, radius=18, outline=C.outline, outline_w=1)
    s.text(BOARD_W - 58, y + 12, "پیشرفت فرم · form_step", "label-lg", C.text, align="right")
    s.text(BOARD_W - 58, y + 36, "پیش از ثبت، فرم چهار قدم دارد (شرح، محل، عکس، بازبینی)؛ ریل "
           "پنج‌مرحله‌ای درخواست از لحظهٔ ارسال شروع می‌شود و اینجا نمی‌آید.",
           "caption", C.muted, align="right", max_width=BOARD_W - 160)
    form_step(s, 58, y + 52, BOARD_W - 116, 1, "شرح حادثه")
    form_step(s, 58, y + 84, BOARD_W - 116, 3, "عکس صحنه")
    y += 128

    # 3 — the docked button, its wide form and the hold state
    s.rect(40, y, BOARD_W - 80, 156, fill=C.surface, radius=18, outline=C.outline, outline_w=1)
    s.text(BOARD_W - 58, y + 12, "دکمهٔ SOS · ui.sos_button / ui.sos_dock", "label-lg", C.text,
           align="right")
    s.text(BOARD_W - 58, y + 36, "همیشه در گوشهٔ نقشه (x=16) و همیشه قرمز پر؛ نگه‌داشتن "
           "۰٫۸ ثانیه فرم را باز می‌کند و رها کردن چیزی نمی‌فرستد.",
           "caption", C.muted, align="right", max_width=BOARD_W - 160)
    sos_button(s, 58 + 56, y + 84, r=24, wide=False)
    s.text(58 + 56, y + 114, "فشرده", "caption", C.muted, align="center")
    sos_button(s, 58 + 200, y + 84, r=26, wide=True)
    s.text(58 + 200, y + 114, "روی نقشه", "caption", C.muted, align="center")
    # the hold state is the real component, not a sketch of it
    hold_button(s, 58 + 372, y + 84, r=30, progress=0.62)
    s.text(58 + 372, y + 128, "در حال نگه‌داشتن · hold_button", "caption", C.muted,
           align="center")
    y += 168

    # 4 — severity tiles (the one control that is *always* on the form) and the rules
    s.rect(40, y, BOARD_W - 80, 136, fill=C.surface, radius=18, outline=C.outline, outline_w=1)
    s.text(BOARD_W - 58, y + 12, "شدت حادثه · severity_cards", "label-lg", C.text, align="right")
    s.text(BOARD_W - 58, y + 36, "سه مقدار مجاز قرارداد (low/medium/high)؛ انتخاب‌شده رنگِ خودش را "
           "پر می‌کند.", "caption", C.muted, align="right", max_width=BOARD_W - 160)
    shift = _Shift(s, 40)
    severity_cards(shift, y + 54, "high")
    y += 154

    s.rect(40, y, BOARD_W - 80, 118, fill=C.surface, radius=18, outline=C.outline, outline_w=1)
    s.text(BOARD_W - 58, y + 10, "قواعد درخواست امداد", "label-lg", C.text, align="right")
    rules = [
        "یک درخواست = یک شناسهٔ پیگیری؛ همان شماره در سوابق، پرونده و پشتیبانی.",
        "نوع حادثه از فهرست سرور می‌آید؛ اگر نیامد، «بارگذاری دوباره» جای فهرست می‌نشیند.",
        "شرح ۱۰ تا ۵۰۰ نویسه با شمارنده؛ کمتر از ۱۰ نویسه اجازهٔ ارسال نمی‌دهد.",
        "عکس اختیاری است (≤ ۵ مگابایت)؛ اگر نرفت، درخواست باطل نمی‌شود: «ادامه بدون تصویر».",
    ]
    for i, rule in enumerate(rules):
        s.text(BOARD_W - 58, y + 32 + i * 20, "• " + rule, "body-sm", C.muted, align="right",
               max_width=BOARD_W - 120)
    return s


SCREENS: dict[str, tuple[str, Callable[[], Screen]]] = {
    "ds-colors": ("design-system/colors.png", tokens_board),
    "ds-typography": ("design-system/typography.png", type_board),
    "ds-controls": ("design-system/controls.png", controls_board),
    "ds-bottom-sheet": ("design-system/bottom-sheet.png", sheet_board),
    "ds-mission-state": ("design-system/mission-state.png", mission_state_board),
    "ds-sos-parts": ("design-system/sos-parts.png", sos_parts_board),
}
