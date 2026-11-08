"""User administration: directory, account drawer, role matrix."""
from __future__ import annotations

import atheme  # noqa: F401
from atheme import A, C, PAD, RAIL, W
import desk as D

USERS = [
    ("سعید کریمی", "saeed.k · ۰۹۱۲…۴۵۶۷", "امدادگر", "آتش‌نشانی", "فعال", "success", "۹:۲۴"),
    ("زهرا احمدی", "zahra.a · ۰۹۳۵…۱۲۰۸", "امدادگر", "اورژانس", "فعال", "success", "۹:۱۲"),
    ("علی موسوی", "ali.m · ۰۹۱۹…۷۷۳۴", "امدادگر", "آتش‌نشانی", "فعال", "success", "۸:۵۰"),
    ("مریم رضایی", "maryam.r · ۰۹۱۲…۳۳۱۰", "کاربر", "—", "فعال", "success", "دیروز"),
    ("حسین کریمی", "hossein.k · ۰۹۳۸…۹۹۰۲", "امدادگر", "هلال احمر", "غیرفعال", "danger", "۳ روز پیش"),
    ("مهدی رستمی", "mehdi.r · ۰۹۱۲…۰۰۴۴", "مدیر سامانه", "—", "فعال", "info", "الآن"),
]


def _filters(s, y):
    D.field(s, RAIL - 380, y, 380, "جست‌وجوی نام کاربری یا شمارهٔ همراه")
    D.select(s, RAIL - 380 - 12 - 180, y, 180, "همهٔ نقش‌ها")
    D.select(s, RAIL - 380 - 12 - 180 - 12 - 190, y, 190, "همهٔ گروه‌ها")
    D.select(s, RAIL - 380 - 12 - 180 - 12 - 190 - 12 - 180, y, 180, "همهٔ وضعیت‌ها")
    return y + 62


# --------------------------------------------------------------------------- #
# 01 — directory
# --------------------------------------------------------------------------- #
def directory():
    s, y = D.page(
        "users", "مدیریت / کاربران", "کاربران",
        "جست‌وجو، دسترسی و عضویت امدادگران — تغییر وضعیت بلافاصله اثر می‌کند.",
        [("خروجی CSV", "mdi-download-outline", "outline"), ("کاربر جدید", "mdi-plus", "filled")],
    )

    # summary row first: the counts are the fastest way into the directory
    stats = [("کاربران فعال", "۲۳۰", "۹۳٪ از کل", "success", "mdi-account-check-outline"),
             ("غیرفعال", "۱۸", "۲ نفر این هفته", "danger", "mdi-account-off-outline"),
             ("بدون گروه امداد", "۲۲", "نیازمند تخصیص", "warning", "mdi-account-alert-outline"),
             ("دسترسی مدیر", "۴", "شامل حساب شما", "info", "mdi-shield-account-outline")]
    kw = (1120 - 3 * 16) / 4
    for index, (label, value, delta, tone, icon) in enumerate(stats):
        D.kpi(s, RAIL - kw - index * (kw + 16), y + 6, kw, 104, label, value, delta, tone, icon)
    y += 128

    tabs_y = y
    for index, (label, count) in enumerate([("همه", "۲۴۸"), ("امدادگران", "۱۳۶"),
                                            ("مدیران", "۴"), ("غیرفعال", "۱۸")]):
        w = s.tw(f"{label} {count}", "d-label") + 34
        x = RAIL - w - sum(s.tw(t, "d-label") + 34 + 10 for t, _ in
                           [("همه", "۲۴۸"), ("امدادگران", "۱۳۶"), ("مدیران", "۴"),
                            ("غیرفعال", "۱۸")][:index])
        on = index == 0
        s.rect(x, tabs_y - 6, w, 34, fill=C.primary if on else C.surface, radius=10,
               outline=None if on else A.card_edge, outline_w=0 if on else 1)
        s.text(x + w - 12, tabs_y + 3, f"{label} {count}", "d-label",
               "#FFFFFF" if on else C.text_2, align="right")
    y += 46

    y = _filters(s, y)

    D.card(s, PAD, y, 1120, 440, "۲۴۸ کاربر", "mdi-account-multiple-outline", "انتخاب گروهی")
    cols = [("کاربر", 300), ("نقش", 140), ("گروه امداد", 180), ("آخرین ورود", 130),
            ("وضعیت", 150)]
    rows = [[("avatar", name[0], name, meta), role, group, last, ("pill", status, tone)]
            for name, meta, role, group, status, tone, last in USERS]
    D.table(s, PAD + 20, y + 50, 1080, cols, rows, 54)
    s.text(RAIL - 34, y + 420, "نمایش ۶ کاربر از ۲۴۸ کاربر", "d-caption", C.muted_2, align="right")
    s.text(PAD + 34, y + 420, "صفحهٔ ۱ از ۴۲", "d-caption", C.muted_2, align="left")
    return s


# --------------------------------------------------------------------------- #
# 02 — account drawer
# --------------------------------------------------------------------------- #
def account():
    s, y = D.page("users", "مدیریت / کاربران / سعید کریمی", "کاربران",
                  "جست‌وجو، دسترسی و عضویت امدادگران — تغییر وضعیت بلافاصله اثر می‌کند.")
    y = _filters(s, y + 46)
    D.card(s, PAD, y, 1120, 470, "۲۴۸ کاربر", "mdi-account-multiple-outline")
    cols = [("کاربر", 300), ("نقش", 140), ("گروه امداد", 180), ("آخرین ورود", 130),
            ("وضعیت", 150)]
    rows = [[("avatar", name[0], name, meta), role, group, last, ("pill", status, tone)]
            for name, meta, role, group, status, tone, last in USERS]
    D.table(s, PAD + 20, y + 50, 1080, cols, rows, 66)

    D.scrim(s, 84)
    dx, dw = 0, 560
    s.shadow(dx, 0, dw, 900, radius=0, blur=40, dy=0, alpha=70)
    s.rect(dx, 0, dw, 900, fill=C.surface)
    s.rect(dx + dw - 1, 0, 1, 900, fill=A.card_edge)
    inner = dx + dw - 32

    s.i.draw_icon(dx + 32, 38, "mdi-close", 20, C.muted)
    s.circle(dx + dw - 60, 64, 30, fill=C.primary_soft)
    s.text(dx + dw - 60, 48, "س", "d-h1", C.primary, align="center")
    s.text(inner - 80, 44, "سعید کریمی", "d-h1", C.text, align="right")
    s.text(inner - 80, 78, "saeed.k · امدادگر آتش‌نشانی", "d-sm", C.muted, align="right")

    D.pill(s, inner, 112, "حساب فعال", "success", None, 24, right=True)
    D.pill(s, inner - 108, 112, "امدادگر", "primary", None, 24, right=True)

    s.rect(dx + 32, 156, dw - 64, 1, fill=A.row_line)

    rows2 = [("نام کاربری", "saeed.k"), ("شمارهٔ همراه", "۰۹۱۲ ۳۴۵ ۴۵۶۷"),
             ("گروه امداد", "آتش‌نشانی مرکزی"), ("نقش", "امدادگر"),
             ("تاریخ عضویت", "۱۴ آبان ۱۴۰۴"), ("آخرین ورود", "امروز · ۹:۲۴ از تهران")]
    fy = 176
    for label, value in rows2:
        s.text(inner, fy, label, "d-caption", C.muted, align="right")
        s.text(inner, fy + 18, value, "d-label", C.text, align="right")
        fy += 52

    s.rect(dx + 32, fy + 4, dw - 64, 1, fill=A.row_line)
    s.text(inner, fy + 24, "دستگاه‌های فعال", "d-title", C.text, align="right")
    devices = [("mdi-cellphone", "iPhone 15 · تهران · همین حالا", C.text_2),
               ("mdi-laptop", "Chrome · ویندوز · ۲ روز پیش", C.muted)]
    for index, (icon, label, color) in enumerate(devices):
        dy = fy + 56 + index * 28
        s.i.draw_icon(inner - 4, dy + 8, icon, 16, C.muted_2)
        s.text(inner - 28, dy, label, "d-sm", color, align="right")
    s.text(dx + 32 + s.tw("خروج از همه", "d-caption-bold"), fy + 56, "خروج از همه",
           "d-caption-bold", C.primary, align="right")

    s.rect(dx + 32, fy + 108, dw - 64, 1, fill=A.row_line)
    s.text(inner, fy + 126, "آخرین رویدادها", "d-title", C.text, align="right")
    events = [("پذیرش مأموریت آتش‌سوزی", "۹:۳۸"), ("ورود به پنل امدادگر", "۹:۲۴"),
              ("تغییر رمز عبور", "دیروز")]
    ey = fy + 156
    for index, (text, time) in enumerate(events):
        if index:
            s.rect(dx + 32, ey - 9, dw - 64, 1, fill=C.surface_3)
        s.i.draw_icon(inner - 4, ey + 8, "mdi-circle-small", 16, C.primary)
        s.text(inner - 22, ey, text, "d-sm", C.text_2, align="right")
        s.text(dx + 32, ey + 2, time, "d-caption", C.muted_2, align="left")
        ey += 34

    s.rect(dx + 32, 792, dw - 64, 1, fill=A.row_line)
    D._button(s, dx + 32, 812, 240, 44, "ویرایش کاربر", "mdi-pencil-outline", "filled")
    D._button(s, dx + 284, 812, dw - 64 - 252, 44, "غیرفعال‌کردن حساب",
              "mdi-account-off-outline", "danger-outline")
    s.text(inner, 768, "غیرفعال‌کردن، نشست‌های باز را پایان می‌دهد.",
           "d-caption", C.muted_2, align="right")
    return s


# --------------------------------------------------------------------------- #
# 03 — roles & permissions
# --------------------------------------------------------------------------- #
PERMS = [
    ("مشاهدهٔ داشبورد و نقشهٔ زنده", True, True, False),
    ("دیدن درخواست‌های SOS", True, True, False),
    ("ثبت اعزام امدادگر", True, True, False),
    ("مدیریت کاربران و دسترسی‌ها", True, False, False),
    ("مدیریت گروه‌ها و انواع حادثه", True, False, False),
    ("گزارش رویدادهای سامانه", True, False, False),
    ("تغییر تنظیمات سامانه", True, False, False),
    ("مدیریت هشدارها و اطلاع‌رسانی", True, False, False),
]
ROLES = ["مدیر ارشد", "مدیر اعزام", "امدادگر"]


def roles():
    s, y = D.page(
        "users", "مدیریت / کاربران / نقش‌ها", "نقش‌ها و دسترسی‌ها",
        "هر نقش مجموعه‌ای از مجوزهاست؛ دسترسی کاربر از نقش و عضویت گروهی ساخته می‌شود.",
        [("ذخیرهٔ تغییرات", "mdi-content-save-outline", "filled")],
    )

    D.card(s, PAD, y, 1120, 480, "ماتریس دسترسی", "mdi-shield-key-outline", "بازنشانی")
    # header
    hx = PAD + 20
    s.rect(hx, y + 50, 1080, 44, fill=A.table_head, radius=10)
    s.text(RAIL - 40, y + 62, "مجوز", "d-caption-bold", C.muted, align="right")
    for index, role in enumerate(ROLES):
        cx = PAD + 20 + 430 + index * 150 + 150
        s.text(cx, y + 62, role, "d-caption-bold", C.muted, align="center")
    py = y + 94
    for label, *flags in PERMS:
        s.text(RAIL - 40, py + 12, label, "d-sm", C.text_2, align="right")
        for index, flag in enumerate(flags):
            cx = PAD + 20 + 430 + index * 150 + 150
            if flag:
                s.circle(cx, py + 20, 10, fill=C.primary_soft)
                s.i.draw_icon(cx, py + 20, "mdi-check", 14, C.primary)
            else:
                s.i.draw_icon(cx, py + 20, "mdi-minus", 14, C.muted_2)
        s.rect(hx, py + 40, 1080, 1, fill=A.row_line)
        py += 48

    y += 500
    notes = [
        ("نقش‌ها روی دسترسی گروه اثر ندارند", "mdi-information-outline", C.info, C.info_soft,
         "نقش، مجوزهای پنل را تعیین می‌کند؛ این‌که کاربر در کدام گروه امداد است، در تخصیص "
         "مأموریت و مرتب‌سازی نزدیک‌ترین امدادگر اثر می‌گذارد."),
        ("مدیر ارشد قابل حذف نیست", "mdi-shield-alert-outline", C.warning, C.warning_soft,
         "حداقل یک حساب با نقش مدیر ارشد باید فعال بماند تا دسترسی به تنظیمات و گزارش "
         "رویدادها قطع نشود."),
    ]
    for index, (title, icon, color, soft, body) in enumerate(notes):
        cx = RAIL - 548 - index * 568
        D.card(s, cx, y, 548, 152)
        s.circle(cx + 548 - 46, y + 44, 20, fill=soft)
        s.i.draw_icon(cx + 548 - 46, y + 44, icon, 20, color)
        s.text(cx + 548 - 78, y + 26, title, "d-title", C.text, align="right")
        s.para(cx + 24, y + 66, body, "d-sm", C.muted, align="right", max_width=500,
               line_height=20, max_lines=3)
    return s


SCREENS = {
    "a-usr-list": ("users/01-list.png", directory),
    "a-usr-detail": ("users/02-account.png", account),
    "a-usr-roles": ("users/03-roles.png", roles),
}
