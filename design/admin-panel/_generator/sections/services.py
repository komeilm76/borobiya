"""Service management: rescue groups, their incident types, and membership."""
from __future__ import annotations

import atheme  # noqa: F401
from atheme import A, C, PAD, RAIL, W
import desk as D


def _page(active, crumbs, title, sub, actions=()):
    s = D.screen()
    D.sidebar(s, active)
    D.topbar(s, crumbs)
    y = D.page_head(s, 96, title, sub, actions)
    return s, y


GROUPS = [
    ("آتش‌نشانی مرکزی", "fire-truck", ["آتش‌سوزی", "فروریزش", "حادثهٔ شیمیایی"], 18, "فعال", "success"),
    ("اورژانس تهران", "ambulance", ["پزشکی", "تصادف", "غرق‌شدگی"], 26, "فعال", "success"),
    ("هلال احمر", "hospital-box-outline", ["سیل", "زلزله", "گم‌شدن"], 12, "فعال", "success"),
    ("امداد کوهستان", "map-marker-radius-outline", ["گم‌شدن", "سقوط"], 6, "پیش‌نویس", "warning"),
]


# --------------------------------------------------------------------------- #
# 01 — groups list
# --------------------------------------------------------------------------- #
def groups():
    s, y = _page(
        "services", "مدیریت / گروه‌های امداد", "گروه‌های امداد",
        "هر گروه، مجموعه‌ای از انواع حادثه را پوشش می‌دهد و اعضای خودش را دارد.",
        [("خروجی فهرست", "mdi-download-outline", "outline"),
         ("گروه امداد جدید", "mdi-plus", "filled")],
    )

    D.field(s, RAIL - 380, y, 380, "جست‌وجوی گروه یا نوع حادثه")
    D.select(s, RAIL - 380 - 190 - 12, y, 190, "همهٔ وضعیت‌ها")
    D.select(s, RAIL - 380 - 190 - 12 - 200 - 12, y, 200, "همهٔ انواع حادثه")
    y += 62

    D.card(s, PAD, y, 1120, 420, "۴ گروه امداد", "mdi-lifebuoy", "مدیریت اعضا")
    cols = [("گروه", 250), ("انواع حادثهٔ پوشش‌داده‌شده", 400), ("اعضا", 110),
            ("وضعیت", 120), ("آخرین تغییر", 150)]
    rows = []
    for name, icon, types, members, status, tone in GROUPS:
        chips = " · ".join(types[:2])
        if len(types) > 2:
            chips += f" و {D.fa(len(types) - 2)} مورد دیگر"
        rows.append([("strong", name), chips, f"{D.fa(members)} نفر",
                     ("pill", status, tone), "۲ روز پیش"])
    D.table(s, PAD + 20, y + 50, 1080, cols, rows, 68)

    # side blocks
    y += 440
    for index, (title, icon, text, tone) in enumerate([
        ("پوشش انواع حادثه", "mdi-shield-check-outline",
         "همهٔ ۹ نوع حادثهٔ فعال حداقل یک گروه پوشش‌دهنده دارند.", "success"),
        ("گروه بدون عضو", "mdi-account-alert-outline",
         "«امداد کوهستان» ۲ جایگاه خالی دارد و در وضعیت پیش‌نویس است.", "warning"),
    ]):
        bx = RAIL - 548 - index * 12 - index * 548
        D.card(s, bx, y, 548, 120)
        s.circle(bx + 548 - 46, y + 44, 20, fill=C.success_soft if tone == "success" else C.warning_soft)
        s.i.draw_icon(bx + 548 - 46, y + 44, icon, 20,
                      C.success if tone == "success" else C.warning)
        s.text(bx + 548 - 78, y + 26, title, "d-title", C.text, align="right")
        s.text(bx + 548 - 78, y + 52, text, "d-sm", C.muted, align="right", max_width=430)
        tw = s.tw("مشاهده", "d-caption-bold")
        s.i.draw_icon(bx + 548 - 78 - tw - 14, y + 94, "mdi-chevron-left", 16, C.primary)
        s.text(bx + 548 - 78, y + 86, "مشاهده", "d-caption-bold", C.primary, align="right")
    return s


# --------------------------------------------------------------------------- #
# 02 — group editor drawer
# --------------------------------------------------------------------------- #
def group_edit():
    s, y = _page("services", "مدیریت / گروه‌های امداد / ویرایش", "گروه‌های امداد",
                 "هر گروه، مجموعه‌ای از انواع حادثه را پوشش می‌دهد و اعضای خودش را دارد.")

    # table behind (dimmed)
    D.card(s, PAD, y, 1120, 420, "۴ گروه امداد", "mdi-lifebuoy")
    D.table(s, PAD + 20, y + 50, 1080,
            [("گروه", 250), ("انواع حادثه", 400), ("اعضا", 110), ("وضعیت", 120)],
            [[("strong", n), " · ".join(t[:2]), f"{m} نفر", ("pill", st, tn)]
             for n, _i, t, m, st, tn in GROUPS], 68)

    D.scrim(s, 84)
    dx, dw = 0, 560
    s.shadow(dx, 0, dw, 900, radius=0, blur=40, dy=0, alpha=70)
    s.rect(dx, 0, dw, 900, fill=C.surface)
    s.rect(dx + dw - 1, 0, 1, 900, fill=A.card_edge)

    s.text(dx + dw - 32, 30, "ویرایش گروه امداد", "d-h1", C.text, align="right")
    s.text(dx + dw - 32, 70, "تغییرات پس از ذخیره برای همهٔ اعضا اعمال می‌شود.", "d-sm", C.muted,
           align="right")
    s.i.draw_icon(dx + 32, 38, "mdi-close", 20, C.muted)
    s.rect(dx + 32, 108, dw - 64, 1, fill=A.row_line)

    fy = 136
    for label, value in [("نام گروه", "آتش‌نشانی مرکزی"), ("شناسهٔ کوتاه", "fire-central")]:
        s.text(dx + dw - 32, fy, label, "d-caption-bold", C.muted, align="right")
        D.field(s, dx + 32, fy + 24, dw - 64, "", value, None, 44)
        fy += 96

    s.text(dx + dw - 32, fy, "توضیح", "d-caption-bold", C.muted, align="right")
    s.rect(dx + 32, fy + 24, dw - 64, 76, fill=C.surface, radius=10, outline=A.card_edge)
    s.para(dx + 46, fy + 36, "گروه اصلی آتش‌نشانی شهر؛ پوشش آتش‌سوزی، فروریزش و حوادث شیمیایی.",
           "d-sm", C.text_2, align="right", max_width=dw - 92, line_height=20, max_lines=2)
    fy += 118

    s.text(dx + dw - 32, fy, "انواع حادثهٔ پوشش‌داده‌شده", "d-caption-bold", C.muted, align="right")
    chips = [("آتش‌سوزی", True), ("فروریزش", True), ("حادثهٔ شیمیایی", True), ("سیل", False),
             ("زلزله", False), ("پزشکی", False)]
    cx, cy = dx + dw - 32, fy + 26
    for label, on in chips:
        w = s.tw(label, "d-caption-bold") + 46
        if cx - w < dx + 32:
            cx, cy = dx + dw - 32, cy + 40
        D.pill(s, cx, cy, label, "primary" if on else "neutral", "mdi-check" if on else None, 28,
               right=True, show_dot=False)
        cx -= w + 8
    fy = cy + 56

    s.text(dx + dw - 32, fy, "وضعیت گروه", "d-caption-bold", C.muted, align="right")
    s.rect(dx + 32, fy + 24, dw - 64, 64, fill=C.surface_2, radius=12)
    s.text(dx + dw - 48, fy + 36, "فعال — در فهرست اعزام دیده می‌شود", "d-sm", C.text_2, align="right")
    s.text(dx + dw - 48, fy + 56, "با غیرفعال شدن، درخواست جدیدی به این گروه ارجاع نمی‌شود.",
           "d-caption", C.muted, align="right")
    s.toggle(dx + 48, fy + 42, 44, 26, True)

    s.text(dx + dw - 32, 726, "اعضا", "d-caption-bold", C.muted, align="right")
    D._button(s, dx + 32, 748, dw - 64, 40, "مدیریت اعضا (۱۸ نفر)",
              "mdi-account-multiple-outline", "outline")

    s.rect(dx + 32, 812, dw - 64, 1, fill=A.row_line)
    D._button(s, dx + 32, 832, 168, 44, "انصراف", None, "ghost")
    D._button(s, dx + 212, 832, dw - 244, 44, "ذخیرهٔ تغییرات", "mdi-content-save-outline", "filled")
    return s


# --------------------------------------------------------------------------- #
# 03 — members modal
# --------------------------------------------------------------------------- #
def members():
    s, y = _page("services", "مدیریت / گروه‌های امداد / اعضا", "گروه‌های امداد",
                 "هر گروه، مجموعه‌ای از انواع حادثه را پوشش می‌دهد و اعضای خودش را دارد.")
    D.card(s, PAD, y, 1120, 420, "۴ گروه امداد", "mdi-lifebuoy")
    D.table(s, PAD + 20, y + 50, 1080,
            [("گروه", 250), ("انواع حادثه", 400), ("اعضا", 110), ("وضعیت", 120)],
            [[("strong", n), " · ".join(t[:2]), f"{m} نفر", ("pill", st, tn)]
             for n, _i, t, m, st, tn in GROUPS], 68)

    D.scrim(s, 96)
    mw, mh = 720, 620
    mx, my = (W - 264 - mw) / 2, (900 - mh) / 2
    top = D.modal(s, mx, my, mw, mh, "اعضای گروه آتش‌نشانی مرکزی",
                  "۱۸ عضو فعال · ۲ جایگاه خالی (ظرفیت ۲۰)")

    D.field(s, mx + 24, top, mw - 48, "جست‌وجوی نام کاربری یا شمارهٔ همراه")
    D.pill(s, mx + mw - 24, top + 54, "۱۸ انتخاب‌شده", "primary", None, 26, right=True)

    users = [
        ("سعید کریمی", "saeed.k · آتش‌نشان", True),
        ("زهرا احمدی", "zahra.a · امدادگر", True),
        ("علی موسوی", "ali.m · آتش‌نشان", True),
        ("مریم رضایی", "maryam.r · امدادگر", False),
        ("حسین کریمی", "hossein.k · راننده", False),
        ("نگار طاهری", "negar.t · امدادگر", False),
    ]
    ly = top + 94
    row_x, row_w = mx + 24, mw - 48
    cb = row_x + row_w - 14 - 24                # checkbox sits 14 px inside the row
    for name, meta, on in users:
        s.rect(row_x, ly, row_w, 52, fill=C.primary_soft if on else C.surface_2, radius=10)
        s.rect(cb, ly + 14, 24, 24, fill=C.primary if on else C.surface,
               radius=7, outline=None if on else A.card_edge, outline_w=0 if on else 1.4)
        if on:
            s.i.draw_icon(cb + 12, ly + 26, "mdi-check", 17, "#FFFFFF")
        s.text(mx + mw - 92, ly + 8, name, "d-label", C.text, align="right")
        s.text(mx + mw - 92, ly + 28, meta, "d-caption", C.muted, align="right")
        ly += 60

    s.rect(mx + 24, my + mh - 64, mw - 48, 1, fill=A.row_line)
    D._button(s, mx + 24, my + mh - 52, 150, 40, "انصراف", None, "ghost")
    D._button(s, mx + mw - 24 - 210, my + mh - 52, 210, 40, "ذخیرهٔ اعضا", "mdi-check", "filled")
    return s


# --------------------------------------------------------------------------- #
# 04 — incident type catalog
# --------------------------------------------------------------------------- #
def incident_types():
    s, y = _page(
        "incidents", "مدیریت / انواع حادثه", "انواع حادثه",
        "هر نوع حادثه یک شناسهٔ یکتا، آیکن و رنگ دارد و در فرم SOS استفاده می‌شود.",
        [("نوع حادثهٔ جدید", "mdi-plus", "filled")],
    )

    types = [
        ("آتش‌سوزی", "fire", "fire", C.danger, "۲ گروه · ۴۱۲ درخواست", True),
        ("پزشکی", "ambulance", "medical", C.info, "۲ گروه · ۳۸۶ درخواست", True),
        ("غرق‌شدگی", "water", "flood", C.info, "۱ گروه · ۹۴ درخواست", True),
        ("تصادف", "car", "accident", C.warning, "۲ گروه · ۲۱۰ درخواست", True),
        ("گم‌شدن", "account-search-outline", "lost", C.mission, "۲ گروه · ۷۸ درخواست", True),
        ("زلزله", "earth", "earthquake", C.warning, "۳ گروه · ۰ درخواست", False),
    ]
    cw, ch, gap = 360, 150, 20
    for index, (name, icon, slug, color, meta, active) in enumerate(types):
        col, row = index % 3, index // 3
        x = RAIL - cw - col * (cw + gap)
        yy = y + row * (ch + gap)
        D.card(s, x, yy, cw, ch)
        s.rect(x + cw - 20 - 44, yy + 20, 44, 44, fill=C.surface_2, radius=12)
        s.i.draw_icon(x + cw - 42, yy + 42, icon, 22, color)
        s.text(x + cw - 76, yy + 22, name, "d-h2", C.text, align="right")
        s.text(x + cw - 76, yy + 50, f"شناسه: {slug}", "d-caption", C.muted_2, align="right")
        s.text(x + cw - 20, yy + 80, meta, "d-sm", C.text_2, align="right", max_width=cw - 40)
        D.pill(s, x + 20, yy + 104, "فعال" if active else "غیرفعال",
               "success" if active else "neutral", None, 24)

    # hint card
    yy = y + 2 * (ch + gap)
    D.card(s, PAD, yy, 1120, 132)
    s.circle(PAD + 1088, yy + 40, 18, fill=C.info_soft)
    s.i.draw_icon(PAD + 1088, yy + 40, "mdi-information-outline", 18, C.info)
    s.text(PAD + 1058, yy + 22, "افزودن نوع حادثه چه اثری دارد؟", "d-title", C.text, align="right")
    s.para(PAD + 220, yy + 52,
           "نوع جدید بلافاصله در فرم SOS و در فیلترهای اعزام دیده می‌شود؛ برای ارجاع خودکار باید "
           "حداقل یک گروه امداد آن را در تنظیمات خود انتخاب کند.",
           "d-sm", C.muted, align="right", max_width=860, line_height=20, max_lines=2)
    D._button(s, PAD + 24, yy + 68, 170, 38, "راهنمای ارجاع", "mdi-arrow-left", "outline")
    return s


SCREENS = {
    "a-svc-groups": ("services/01-groups.png", groups),
    "a-svc-edit": ("services/02-group-edit.png", group_edit),
    "a-svc-members": ("services/03-members.png", members),
    "a-svc-types": ("services/04-incident-types.png", incident_types),
}
