"""The SOS guide: one page that explains the flow, in the order the flow happens.

The twenty SOS plates answer «what does each screen look like»; none of them answers «what am I
supposed to do now, and what happens after that». This board is that answer. It is built from the
same primitives as the plates — the real rail, the real dock, the real perimeter ring — so it can
never show a control the product does not have, and every step names the plate that draws it.

Layout, top to bottom:

    header ─ the five-stage rail ─ the button in three states
           ─ before sending (6 rows) │ after sending (6 rows)
           ─ what goes wrong (4 rows) ─ the four rules ─ index of the twenty plates
"""
from __future__ import annotations

from typing import Callable

from bb import scenario as sc
from bb import ui
from bb.prims import Screen
from bb.text import fa_digits
from bb.theme import C

BOARD_W = 760
BOARD_H = 1740

PHASE_A = (
    ("۰۱", "راهنما", "یک بار ببینید و ببندید",
     "جای دکمه و سه گام بعدی؛ «متوجه شدم» کارت را می‌بندد."),
    ("۰۲", "نگه‌داشتن", "انگشت را روی دکمه نگه دارید",
     "حلقه که پر شود فرم باز می‌شود؛ پیش از آن هیچ داده‌ای نمی‌رود."),
    ("۰۳", "قدم ۱ · شرح حادثه", "شدت، نوع و شرح را انتخاب کنید",
     "هیچ شدتی از قبل انتخاب نشده. شرح ۱۰ تا ۵۰۰ نویسه."),
    ("۰۴", "قدم ۲ · محل حادثه", "نقطه را روی نقشه جابه‌جا کنید",
     "نقطهٔ GPS خودکار است؛ فاصلهٔ پین تا آن همان‌جا نوشته می‌شود."),
    ("۰۵", "قدم ۳ · عکس صحنه", "دوربین یا گالری — یا هیچ",
     "تا ۵ مگابایت؛ «ادامه بدون عکس» همیشه در دسترس است."),
    ("۰۶", "قدم ۴ · بازبینی", "چهار مورد را ببینید و بفرستید",
     "تا این دکمه هیچ درخواستی وجود ندارد. «بازگشت و ویرایش» هر زمان."),
)

PHASE_B = (
    ("۰۷", "در حال ارسال", "صبر کنید و پنجره را نبندید",
     "درخواست ثبت شد و عکس در راه است؛ شناسه این‌جا می‌آید."),
    ("۰۸", "ثبت · در انتظار", "منتظر بمانید، گوشی در دسترس",
     "به امدادگران تا شعاع ۵ کیلومتر اطلاع رسید؛ نام که بیاید این‌جا می‌نشیند."),
    ("۰۹", "اعزام", "کاری لازم نیست",
     "امدادگر تعیین شد ولی هنوز نپذیرفته؛ ۲ دقیقه بی‌پاسخ، نفر بعدی."),
    ("۱۰", "پذیرش · در راه", "گوشی را در دسترس نگه دارید",
     "نام، زمان رسیدن و مسیر روی نقشه؛ تماس و پیام همین‌جاست."),
    ("۱۱", "رسیدگی", "به امدادگر خبر بدهید",
     "چند نفر داخل‌اند و راه دسترسی کدام است؛ این دو، نتیجه را عوض می‌کنند."),
    ("۱۲", "پایان", "پرونده بسته شد",
     "خلاصه، ساعت‌ها و شرح ثبت‌شده می‌مانند و در «تاریخچه» دیده می‌شوند."),
)

OTHER = (
    ("۱۳–۱۴", "لغو", "دلیل الزامی است و به مرکز می‌رسد؛ پیشنهادهای در انتظار بسته می‌شوند."),
    ("۱۵", "عکس نرفت", "درخواست ثبت شده؛ دوباره بفرستید یا بی‌عکس ادامه بدهید."),
    ("۱۶", "بدون اینترنت", "درخواست ثبت نمی‌شود؛ با ۱۲۵ تماس بگیرید و بعد دوباره تلاش کنید."),
    ("۱۹", "فرم ناقص", "فهرست موارد مانع ارسال، خطای هر فیلد و دکمهٔ قفل‌شده تا رفع آن‌ها."),
)

RULES = (
    ("ضربه کافی نیست، نگه‌داشتن لازم است", "جیبِ شما نمی‌تواند برای شما درخواست امداد بفرستد."),
    ("لغو تا بسته‌شدن معنا دارد", "بعد از رسیدن امدادگر، لغو فقط پرونده را می‌بندد."),
    ("هر درخواست یک شناسه دارد", "۴۱۲۷ در فرم، وضعیت، سوابق و لغو همان است."),
    ("جان در خطر است؟ اول ۱۲۵", "فرم مکمل تماس است، جانشین آن نیست."),
)


def _board() -> Screen:
    return Screen(background="#F4F7F6", width=BOARD_W, height=BOARD_H)


def _head(s: Screen) -> float:
    s.text(BOARD_W - 40, 34, "SOS · راهنمای استفاده", "caption-bold", C.primary, align="right")
    s.text(BOARD_W - 40, 56, "امداد فوری، از نگه‌داشتن تا بسته‌شدن", "title-lg", C.text,
           align="right")
    s.para(40, 92, "این صفحه کل مسیر است: شش گام تا ارسال، شش وضعیت پس از آن، و چهار چیزی که "
           "باید بدانید. هر شماره، شمارهٔ همان تصویر در پوشهٔ sos است.", "body-sm", C.muted,
           align="right", max_width=BOARD_W - 80, line_height=21)
    return 152


def _section(s: Screen, y: float, title: str, note: str) -> float:
    s.text(BOARD_W - 40, y, title, "title-sm", C.text, align="right")
    s.text(40, y + 3, note, "caption", C.muted_2, align="left")
    return y + 28


def _step(s: Screen, x: float, y: float, w: float, number: str, title: str, action: str,
          note: str, accent: str) -> None:
    """One step: the plate number, what it is, what you do, and what the app does."""
    h = 78
    s.rect(x, y, w, h, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
    s.rect(x + w - 4, y + 10, 4, h - 20, fill=accent, radius=2)
    s.text(x + w - 18, y + 8, number, "caption-bold", accent, align="right")
    s.text(x + w - 62, y + 6, title, "label", C.text, align="right", max_width=w - 74)
    s.text(x + w - 18, y + 27, action, "caption", C.text_2, align="right", max_width=w - 34)
    s.para(x + 14, y + 46, note, "caption", C.muted, align="right", max_width=w - 32,
           line_height=14)


def _button_states(s: Screen, y: float) -> float:
    """The dock in three moments, drawn with the shipped control, not a lookalike."""
    s.text(BOARD_W - 40, y, "همان یک دکمه، در سه حالت", "caption-bold", C.muted, align="right")
    s.text(40, y + 3, "sos/01 · 02", "caption", C.muted_2, align="left")
    y += 22
    panel_w, gap = (BOARD_W - 80 - 2 * 16) / 3, 16
    labels = ("آماده", "در حال نگه‌داشتن", "فرم باز شد")
    notes = ("همیشه در گوشهٔ پایین",
             "حلقه دور قرص پر می‌شود",
             "چهار قدم تا ارسال")
    floors = ("ضربه = هیچ کاری نمی‌کند",
              "رها کردن پیش از پر شدن = لغو",
              "قدم ۱ · شرح حادثه")
    h = 154
    for index in range(3):
        x = BOARD_W - 40 - (index + 1) * panel_w - index * gap
        s.rect(x, y, panel_w, h, fill="#FFFFFF", radius=16, outline=C.outline, outline_w=1)
        cx, cy = x + panel_w / 2, y + 44
        if index == 1:
            ring = dict(x=cx - 38, y=cy - 23, w=76, h=46)
            s.line(ui.pill_perimeter(**ring, progress=1.0), C.danger_soft, 5)
            s.line(ui.pill_perimeter(**ring, progress=0.66), C.danger, 5)
        ui.sos_button(s, cx, cy, r=19, wide=True)
        s.text(cx, y + 76, labels[index], "caption-bold", C.text_2, align="center",
               max_width=panel_w - 16)
        s.text(cx, y + 95, notes[index], "caption", C.muted, align="center",
               max_width=panel_w - 24)
        s.rect(x + 8, y + 118, panel_w - 16, 28, fill=C.surface_2, radius=9)
        s.text(cx, y + 124, floors[index], "caption", C.muted_2, align="center",
               max_width=panel_w - 28)
    return y + h + 12


def sos_guide() -> Screen:
    s = _board()
    y = _head(s)

    # the track, as the product draws it
    card_h = 132
    s.rect(40, y, BOARD_W - 80, card_h, fill="#FFFFFF", radius=18, outline=C.outline, outline_w=1)
    ui.sos_rail(s, 60, y + 14, BOARD_W - 120, 4, timestamps=sc.SOS_STAGE_TIMES,
                caption="مسیر یک درخواست")
    s.rect(40, y + 100, BOARD_W - 80, 1, fill=C.outline)
    s.text(BOARD_W - 60, y + 108, "شما ثبت می‌کنید؛ مرکز اعزام می‌کند؛ امدادگر می‌پذیرد، "
           "می‌رسد و پرونده بسته می‌شود.", "caption", C.muted, align="right",
           max_width=BOARD_W - 120)
    y += card_h + 16

    y = _button_states(s, y)

    # two columns: before sending (right), after sending (left)
    col_w, gap = (BOARD_W - 80 - 20) / 2, 20
    right_x, left_x = BOARD_W - 40 - col_w, 40
    s.text(right_x + col_w, y, "پیش از ارسال", "title-sm", C.text, align="right")
    s.text(right_x + col_w - s.tw("پیش از ارسال", "title-sm") - 10, y + 3, "شش صفحه · ۰۱ تا ۰۶",
           "caption", C.muted_2, align="right")
    s.text(left_x + col_w, y, "بعد از ارسال", "title-sm", C.text, align="right")
    s.text(left_x + col_w - s.tw("بعد از ارسال", "title-sm") - 10, y + 3, "پنج وضعیت · ۰۷ تا ۱۲",
           "caption", C.muted_2, align="right")

    y += 26
    ry = y + 4
    for number, title, action, note in PHASE_A:
        _step(s, right_x, ry, col_w, number, title, action, note, C.danger)
        ry += 86
    ly = y + 4
    for number, title, action, note in PHASE_B:
        _step(s, left_x, ly, col_w, number, title, action, note, C.primary)
        ly += 86
    y = max(ry, ly) + 10

    y = _section(s, y, "وقتی چیزی درست پیش نمی‌رود", "۱۳ تا ۲۰")
    for number, title, note in OTHER:
        s.rect(40, y, BOARD_W - 80, 40, fill="#FFFFFF", radius=12, outline=C.outline,
               outline_w=1)
        s.text(BOARD_W - 56, y + 12, number, "caption-bold", C.warning, align="right")
        s.text(BOARD_W - 96, y + 11, title, "label", C.text, align="right")
        s.text(BOARD_W - 96 - s.tw(title, "label") - 14, y + 13, note, "caption", C.muted,
               align="right", max_width=BOARD_W - 250)
        y += 46

    y = _section(s, y + 6, "چهار قاعده‌ای که نباید اشتباه شود", "همهٔ صفحه‌ها همین را می‌گویند")
    rule_w, rule_gap = (BOARD_W - 80 - 16) / 2, 16
    for index, (title, note) in enumerate(RULES):
        col, row = index % 2, index // 2
        x = BOARD_W - 40 - (col + 1) * rule_w - col * rule_gap
        ry = y + row * 62
        s.rect(x, ry, rule_w, 54, fill=C.surface_2, radius=12)
        s.text(x + rule_w - 14, ry + 8, title, "caption-bold", C.text, align="right",
               max_width=rule_w - 28)
        s.para(x + 14, ry + 26, note, "caption", C.muted, align="right",
               max_width=rule_w - 28, line_height=15)
    y += 2 * 62 + 4

    s.rect(40, y, BOARD_W - 80, 1, fill=C.outline)
    y += 12
    s.text(BOARD_W - 40, y, "فهرست تصویرها — به همان ترتیب", "caption-bold", C.muted,
           align="right")
    s.text(40, y + 2, "sos/01 … 20", "caption", C.muted_2, align="left")
    y += 22

    # the index: twenty numbers in four rows, so the guide doubles as a table of contents
    names = ("راهنما", "نگه‌داشتن", "فرم", "محل", "عکس", "بازبینی", "ارسال", "ثبت",
             "اعزام", "پذیرش", "رسیدگی", "پایان", "لغو", "لغوشده", "عکس نرفت",
             "آفلاین", "سوابق", "پرونده", "خطا", "خالی")
    cell_w, cell_gap = (BOARD_W - 80 - 4 * 8) / 5, 8
    for index, name in enumerate(names):
        col, row = index % 5, index // 5
        x = BOARD_W - 40 - (col + 1) * cell_w - col * cell_gap
        cy = y + row * 42
        s.rect(x, cy, cell_w, 34, fill="#FFFFFF", radius=9, outline=C.outline, outline_w=1)
        s.text(x + cell_w - 8, cy + 4, fa_digits(index + 1), "caption-bold", C.text_2,
               align="right")
        s.text(x + cell_w / 2 - 8, cy + 10, name, "caption", C.muted, align="center",
               max_width=cell_w - 34)
    y += 4 * 42

    s.text(BOARD_W - 40, y + 6, "هر شماره = همان نام فایل در پوشهٔ sos", "caption", C.muted_2,
           align="right")
    s.text(40, y + 6, "BoroBiya · map-page", "caption", C.muted_2, align="left")
    assert y + 24 < BOARD_H, y
    return s


SCREENS: dict[str, tuple[str, Callable[[], Screen]]] = {
    "g-01-sos-guide": ("guides/00-sos-flow.png", sos_guide),
}
