"""Cross-section states: loading, empty, error, offline, forbidden (403)."""
from __future__ import annotations

import atheme  # noqa: F401
from atheme import A, C, PAD, RAIL, W
import desk as D

USERS = [
    ("سعید کریمی", "saeed.k · ۰۹۱۲…۴۵۶۷", "امدادگر", "آتش‌نشانی", "فعال", "success", "۹:۲۴"),
    ("زهرا احمدی", "zahra.a · ۰۹۳۵…۱۲۰۸", "امدادگر", "اورژانس", "فعال", "success", "۹:۱۲"),
    ("علی موسوی", "ali.m · ۰۹۱۹…۷۷۳۴", "امدادگر", "آتش‌نشانی", "فعال", "success", "۸:۵۰"),
]
COLS = [("کاربر", 300), ("نقش", 140), ("گروه امداد", 180), ("آخرین ورود", 130), ("وضعیت", 150)]


def _shell(banner_text=None, tone="warning", action="تلاش دوباره"):
    s, y = D.page("users", "مدیریت / کاربران", "کاربران",
                  "جست‌وجو، دسترسی و عضویت امدادگران — تغییر وضعیت بلافاصله اثر می‌کند.",
                  [("کاربر جدید", "mdi-plus", "filled")])
    if banner_text:
        return s, D.banner(s, PAD, y, 1120, banner_text, tone, action) + 12
    return s, y + 12


# --------------------------------------------------------------------------- #
def loading():
    s, y = _shell()
    D.banner(s, PAD, y, 1120, "در حال دریافت فهرست کاربران از سرور…", "info", None)
    y += 66
    D.card(s, PAD, y, 1120, 470, "کاربران", "mdi-account-multiple-outline")
    # header
    s.rect(PAD + 20, y + 50, 1032, 40, fill=A.table_head, radius=10)
    cx = PAD + 20 + 1032
    for label, cw in COLS:
        s.text(cx - 14, y + 61, label, "d-caption-bold", C.muted, align="right")
        cx -= cw * 1032 / sum(w for _, w in COLS)
    # column edges, right-to-left
    total = sum(w for _, w in COLS)
    scale = 1032 / total
    edges, cx = [], PAD + 20 + 1032
    for _, cw in COLS:
        edges.append((cx, cw * scale))
        cx -= cw * scale

    ry = y + 100
    for _ in range(6):
        # first column: avatar + two stacked lines
        ex, ew = edges[0]
        s.circle(ex - 31, ry + 28, 17, fill=C.surface_3)
        D.skeleton(s, ex - ew + 46, ry + 18, ew * 0.52, 12)
        D.skeleton(s, ex - ew + 46, ry + 38, ew * 0.34, 10)
        for ex, ew in edges[1:-1]:
            D.skeleton(s, ex - ew + 16, ry + 22, max(48, ew * 0.56), 13)
        # status column gets a pill instead of a bar
        sx, sw = edges[-1]
        D.skeleton(s, sx - sw + 16, ry + 17, 74, 24, 12)
        s.rect(PAD + 20, ry + 58, 1032, 1, fill=A.row_line)
        ry += 60
    return s


def empty():
    s, y = _shell()
    D.field(s, RAIL - 420, y, 420, "جست‌وجو: «امدادگر کوهستان»")
    D.select(s, RAIL - 420 - 200 - 12, y, 200, "غیرفعال")
    y += 62
    D.empty_block(s, PAD, y, 1120, 380, "mdi-account-search-outline",
                  "کاربری با این فیلترها پیدا نشد",
                  "عبارت جست‌وجو را کوتاه‌تر کنید یا فیلتر وضعیت را بردارید.",
                  "پاک‌کردن فیلترها")
    s.text(RAIL - 20, y + 400, "۲۴۸ کاربر در مجموع · ۰ کاربر با فیلتر فعلی", "d-caption",
           C.muted_2, align="right")
    return s


def error():
    s, y = _shell("دریافت فهرست کاربران ناموفق بود — خطای سرور (۵۰۳). داده‌های قبلی نمایش داده "
                  "می‌شوند.", "danger")
    D.card(s, PAD, y, 1120, 320, "۲۴۸ کاربر (آخرین نسخهٔ موفق)", "mdi-account-multiple-outline")
    rows = [[("avatar", n[0], n, m), r, g, l, ("pill", st, tn)]
            for n, m, r, g, st, tn, l in USERS]
    D.table(s, PAD + 20, y + 50, 1080, COLS, rows, 66)

    y += 340
    notices = [
        ("سرور پاسخ نداد", "mdi-server-network-off", C.danger, C.danger_soft,
         "کد رهگیری: a91f-2c07 — تا ۳۰ ثانیهٔ دیگر دوباره تلاش می‌شود."),
        ("چه چیزی از دست رفت؟", "mdi-information-outline", C.info, C.info_soft,
         "فقط فهرست کاربران؛ اعزام و درخواست‌های SOS مستقل از این خطا کار می‌کنند."),
    ]
    for index, (title, icon, color, soft, body) in enumerate(notices):
        cx = RAIL - 548 - index * 568
        D.card(s, cx, y, 548, 136)
        s.circle(cx + 548 - 46, y + 44, 20, fill=soft)
        s.i.draw_icon(cx + 548 - 46, y + 44, icon, 20, color)
        s.text(cx + 548 - 78, y + 26, title, "d-title", C.text, align="right")
        s.para(cx + 24, y + 60, body, "d-sm", C.muted, align="right", max_width=460,
               line_height=20, max_lines=2)
    return s


def offline():
    s, y = D.page("dashboard", "عملیات / نمای کلی", "نمای کلی",
                  "وضعیت لحظه‌ای درخواست‌های امداد، مأموریت‌های فعال و آمادگی گروه‌ها.")
    D.banner(s, PAD, y, 1120,
             "اتصال به سرور قطع است — آخرین داده‌ها ۲ دقیقه پیش دریافت شده و به‌روزرسانی زنده "
             "متوقف است.", "offline", "تلاش دوباره")
    y += 66

    tiles = [("درخواست‌های امروز", "۱۲۴"), ("مأموریت‌های فعال", "۸"),
             ("میانگین زمان پاسخ", "۴:۱۲"), ("امدادگران آنلاین", "۳۶")]
    kw = (1120 - 3 * 16) / 4
    for index, (label, value) in enumerate(tiles):
        x = RAIL - kw - index * (kw + 16)
        D.kpi(s, x, y, kw, 104, label, value, "دادهٔ ذخیره‌شده", "info", "mdi-cloud-off-outline")
    y += 124

    D.card(s, 368, y, 780, 470, "نقشهٔ عملیات زنده", "mdi-map-marker-radius-outline")
    s.rect(388, y + 52, 740, 210, fill=C.surface_2, radius=12)
    s.circle(758, y + 140, 30, fill=C.surface_3)
    s.i.draw_icon(758, y + 140, "mdi-cloud-off-outline", 30, C.muted_2)
    s.text(758, y + 186, "نقشه در حالت آفلاین در دسترس نیست", "d-sm", C.muted, align="center")
    s.text(1128, y + 274, "آخرین همگام‌سازی: ۹:۳۹:۱۰", "d-caption", C.muted_2, align="right")

    s.rect(388, y + 310, 740, 1, fill=A.row_line)
    s.text(1128, y + 326, "چه کاری در صف مانده است؟", "d-title", C.text, align="right")
    queued = [("تأیید غیرفعال‌سازی حساب hossein.k", "در صف ارسال"),
              ("ویرایش گروه امداد کوهستان", "ذخیره‌شده روی این دستگاه")]
    qy = y + 362
    for text, state in queued:
        s.circle(1104, qy + 9, 3.5, fill=C.warning)
        s.text(1092, qy, text, "d-sm", C.text_2, align="right")
        s.text(1092, qy + 22, state, "d-caption", C.muted_2, align="right")
        qy += 52

    D.card(s, PAD, y, 312, 470, "گروه‌های امداد", "mdi-lifebuoy")
    for index, (name, count) in enumerate([("آتش‌نشانی", "۶ از ۸"), ("اورژانس", "۱۱ از ۱۲"),
                                           ("هلال احمر", "۴ از ۶"), ("کوهستان", "۲ از ۴")]):
        gy = y + 64 + index * 74
        s.text(PAD + 312 - 20, gy + 2, name, "d-label", C.text, align="right")
        s.text(PAD + 312 - 20, gy + 22, f"{count} نفر", "d-caption", C.muted, align="right")
        D.pill(s, PAD + 18, gy + 8, "بی‌خبر", "neutral", None, 22)
    s.rect(PAD + 18, y + 358, 312 - 36, 1, fill=A.row_line)
    s.text(PAD + 312 - 20, y + 376, "۲۳ امدادگر آنلاین · ۴ گروه", "d-caption-bold", C.muted,
           align="right")
    s.para(PAD + 18, y + 400,
           "در حالت آفلاین وضعیت اعضا از آخرین همگام‌سازی خوانده می‌شود و ممکن است تغییر کرده باشد.",
           "d-caption", C.muted_2, align="right", max_width=264, line_height=17, max_lines=2)
    return s


def forbidden():
    s = D.screen()
    D.sidebar(s, "settings")
    D.topbar(s, "سامانه / تنظیمات")
    y = 120
    s.rect(PAD, y, 1120, 560, fill=C.surface, radius=18, outline=A.card_edge, outline_w=1)
    cx = PAD + 1120 / 2
    s.circle(cx, y + 150, 58, fill=C.warning_soft)
    s.i.draw_icon(cx, y + 150, "mdi-shield-lock-outline", 52, C.warning)
    s.text(cx, y + 238, "دسترسی به این بخش برای نقش شما مجاز نیست", "d-h1", C.text, align="center")
    s.para(cx - 260, y + 282,
           "صفحهٔ تنظیمات سامانه فقط برای نقش «مدیر ارشد» باز است. برای دسترسی، از مدیر ارشد "
           "بخواهید نقش شما را تغییر دهد؛ این درخواست در گزارش رویدادها ثبت می‌شود.",
           "d-body", C.muted, align="center", max_width=520, line_height=24, max_lines=3)
    D._button(s, cx - 110, y + 372, 220, 46, "بازگشت به نمای کلی", "mdi-arrow-left", "filled")
    s.text(cx, y + 452, "کد خطا: ۴۰۳ · نقش فعلی: مدیر اعزام", "d-caption", C.muted_2, align="center")
    return s


SCREENS = {
    "a-st-loading": ("states/01-loading.png", loading),
    "a-st-empty": ("states/02-empty.png", empty),
    "a-st-error": ("states/03-error.png", error),
    "a-st-offline": ("states/04-offline.png", offline),
    "a-st-forbidden": ("states/05-forbidden.png", forbidden),
}
