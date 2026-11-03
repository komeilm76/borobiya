"""Registration: the widest form in the product, spread over two tiers plus five security questions."""
from __future__ import annotations

import authkit as K
from authkit import C, Screen

INTRO_W = 380                 # auth-layout-wide: the narrow intro
CANVAS_H = 1120               # a scroll page in the client; the reference shows it whole
FRAME_H = 924
FORM_W = 620

QUESTIONS = [
    ("نام نخستین معلم شما چه بود؟", "آقای رضایی"),
    ("نام خیابانی که در آن بزرگ شدید؟", "شهید بهشتی"),
    ("نام نخستین حیوان خانگی‌تان؟", ""),
    ("شهر تولد مادرتان؟", ""),
    ("نام نخستین مدرسهٔ شما؟", ""),
]


def _intro(s: Screen, x: float, y: float, w: float, h: float):
    K.intro(
        s, x, y, w, h,
        kicker="یک قدم تا همراهی",
        title=["حسابی امن،", "همراهی نزدیک."],
        copy="با ساخت حساب، به شبکه‌ای از همراهان محلی می‌پیوندید. پرسش‌های امنیتی را طوری انتخاب کنید که پاسخ‌شان را به‌خاطر بسپارید.",
        items=[
            ("۰۱", "پاسخ‌ها محرمانه می‌مانند", "به‌صورت امن ذخیره می‌شوند، نه به شکل متن."),
            ("۰۲", "پنج پرسش متفاوت", "پاسخ‌هایی که فراموش نمی‌کنید."),
        ],
    )


def _question_row(s: Screen, x: float, y: float, w: float, index: int, question: str,
                  answer: str):
    """Index badge on the reading-start edge, then the select / answer pair."""
    s.rect(x + w - 32, y + 10, 32, 32, fill="#EDF7F3", radius=10, outline="#DCEBE5",
           outline_w=1)
    s.text(x + w - 16, y + 16, K.fa(index), "d-caption-bold", C.primary, align="center")

    inner = w - 44
    q_w = inner * 0.575 - 6
    a_w = inner * 0.425 - 6
    # select: label + chevron
    qx = x + w - 44 - q_w
    s.rect(qx, y, q_w, 44, fill="#FFFFFF", radius=8, outline="#C9D6D2", outline_w=1)
    s.i.draw_icon(qx + 18, y + 22, "mdi-chevron-down", 18, C.muted_2)
    s.text(qx + q_w - 14, y + (44 - 20) / 2, question, "d-body", C.text, align="right",
           max_width=q_w - 46)

    ax = x
    s.rect(ax, y, a_w, 44, fill="#FFFFFF", radius=8,
           outline="#C9D6D2" if answer else "#D8E3DF", outline_w=1)
    if answer:
        K.floating_label(s, ax, y, a_w, "پاسخ شما", True, C.primary)
        s.text(ax + a_w - 14, y + (44 - 21) / 2, answer, "d-body", C.text, align="right",
               max_width=a_w - 28)
    else:
        s.text(ax + a_w - 14, y + (44 - 20) / 2, "پاسخ شما", "d-body", C.muted_2, align="right",
               max_width=a_w - 28)
    return y + 44


def register():
    s = K.screen(CANVAS_H)
    K.chrome(s)
    top = (CANVAS_H - FRAME_H) / 2 + 10
    intro_x, card_x, card_w = K.frame(s, top, FRAME_H, INTRO_W, decor_cy=FRAME_H * 0.50)
    _intro(s, intro_x, top, INTRO_W, FRAME_H)

    right = card_x + card_w - 64
    left = right - FORM_W
    y = top + 64

    y = K.card_head(s, left, y, FORM_W, "شروع همراهی", "ساخت حساب جدید",
                    "mdi-account-plus-outline")
    y += 10

    # username
    y = K.field(s, left, y, FORM_W, "نام کاربری", "saeed.karimi", "mdi-at",
                hint="۳ تا ۳۰ نویسه؛ فقط حروف کوچک انگلیسی، عدد و زیرخط")
    y += 18

    # password pair — one row, as `.auth-password-grid`
    pair = (FORM_W - 14) / 2
    K.field(s, left + pair + 14, y, pair, "گذرواژه", "••••••••••", "mdi-lock-outline")
    K.field(s, left, y, pair, "تکرار گذرواژه", "••••••••••", "mdi-lock-check-outline")
    s.text(left + FORM_W, y + K.FIELD_H + 6, "حداقل ۸ نویسه، شامل یک حرف و یک عدد",
           "d-caption", C.muted, align="right", max_width=FORM_W)
    y += K.FIELD_H + 36   # the hint's own line is 17px tall; 26 put the checkbox on top of it

    K.checkbox(s, left + FORM_W, y, "نمایش گذرواژه‌ها", checked=False)
    y += 44

    # question section
    s.text(right, y, "برای امنیت و بازیابی حساب", "d-sm", "#6D8985", align="right")
    s.text(right, y + 20, "پنج پرسش امنیتی", "d-h2", "#244748", align="right")
    chip_w = s.tw("۲ از ۵", "d-caption-bold") + 34
    s.rect(left, y + 22, chip_w, 26, fill=C.primary_soft, radius=13)
    s.text(left + chip_w - 12, y + 26, "۲ از ۵", "d-caption-bold", C.primary, align="right")
    y += 58

    for index, (question, answer) in enumerate(QUESTIONS, start=1):
        _question_row(s, left, y, FORM_W, index, question, answer)
        y += 56

    y += 14
    K.submit(s, left, y, FORM_W, "ساخت حساب امن")
    y += K.FIELD_H + 34

    K.switch_copy(s, left, y, FORM_W, "قبلاً حساب ساخته‌اید؟", "وارد شوید")
    y += 28
    K.privacy_note(s, left, y, FORM_W, "پاسخ‌ها را کسی جز شما نمی‌بیند.")
    return s


def register_error():
    """`USERNAME_TAKEN`: the server rejects the account after the form is complete.

    This is the real failure path — everything is filled in, the CTA is live, and the only thing wrong
    is the name. Showing it with half-empty questions (an earlier draft) misrepresented what the user
    actually sees at that moment.
    """
    s = K.screen(CANVAS_H)
    K.chrome(s)
    top = (CANVAS_H - FRAME_H) / 2 + 10
    intro_x, card_x, card_w = K.frame(s, top, FRAME_H, INTRO_W, decor_cy=FRAME_H * 0.50)
    _intro(s, intro_x, top, INTRO_W, FRAME_H)

    right = card_x + card_w - 64
    left = right - FORM_W
    y = top + 64
    y = K.card_head(s, left, y, FORM_W, "شروع همراهی", "ساخت حساب جدید",
                    "mdi-account-plus-outline")
    y += 10

    y = K.alert(s, left, y, FORM_W,
                "این نام کاربری قبلاً انتخاب شده است. نام دیگری امتحان کنید.", "error")
    y = K.field(s, left, y, FORM_W, "نام کاربری", "saeed.karimi", "mdi-at",
                hint="نام کاربری آزاد است؟ نام دیگری بگذارید و دوباره بفرستید.", state="error")
    y += 18

    pair = (FORM_W - 14) / 2
    K.field(s, left + pair + 14, y, pair, "گذرواژه", "••••••••••", "mdi-lock-outline")
    K.field(s, left, y, pair, "تکرار گذرواژه", "••••••••••", "mdi-lock-check-outline")
    s.text(left + FORM_W, y + K.FIELD_H + 6, "حداقل ۸ نویسه، شامل یک حرف و یک عدد",
           "d-caption", C.muted, align="right", max_width=FORM_W)
    y += K.FIELD_H + 34
    K.checkbox(s, left + FORM_W, y, "نمایش گذرواژه‌ها", checked=False)
    y += 42

    s.text(right, y, "برای امنیت و بازیابی حساب", "d-sm", "#6D8985", align="right")
    s.text(right, y + 20, "پنج پرسش امنیتی", "d-h2", "#244748", align="right")
    chip_w = s.tw("۵ از ۵", "d-caption-bold") + 34
    s.rect(left, y + 22, chip_w, 26, fill=C.primary_soft, radius=13)
    s.text(left + chip_w - 12, y + 26, "۵ از ۵", "d-caption-bold", C.primary, align="right")
    y += 58

    answered = [("نام نخستین معلم شما چه بود؟", "آقای رضایی"),
                ("نام خیابانی که در آن بزرگ شدید؟", "شهید بهشتی"),
                ("نام نخستین حیوان خانگی‌تان؟", "پیشی"),
                ("شهر تولد مادرتان؟", "تهران"),
                ("نام نخستین مدرسهٔ شما؟", "دبستان شهید کاظمی")]
    for index, (question, answer) in enumerate(answered, start=1):
        _question_row(s, left, y, FORM_W, index, question, answer)
        y += 56

    y += 14
    K.submit(s, left, y, FORM_W, "ساخت حساب امن")
    y += K.FIELD_H + 34
    K.switch_copy(s, left, y, FORM_W, "قبلاً حساب ساخته‌اید؟", "وارد شوید")
    y += 28
    K.privacy_note(s, left, y, FORM_W, "پاسخ‌ها را کسی جز شما نمی‌بیند.")
    return s


SCREENS = {
    "a-register": ("03-register.png", register),
    "a-register-error": ("04-register-error.png", register_error),
}
