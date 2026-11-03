"""Onboarding: the mandatory five security questions a new account must answer before it can be used.

Shares the auth frame, the form primitives and the type ramp with login/registration — the client renders it with
`CompleteSecurityQuestionsView.vue` inside the same `auth-layout` — so it is documented here rather than left out.
"""
from __future__ import annotations

import authkit as K
from authkit import C, Screen

INTRO_W = 380
FRAME_H = 620
FORM_W = 620

QUESTIONS = [
    ("نام نخستین معلم شما چه بود؟", "آقای رضایی"),
    ("نام خیابانی که در آن بزرگ شدید؟", "شهید بهشتی"),
    ("نام نخستین حیوان خانگی‌تان؟", "پیشی"),
    ("شهر تولد مادرتان؟", ""),
    ("نام نخستین مدرسهٔ شما؟", ""),
]


def onboarding():
    canvas = FRAME_H + 300
    s = K.screen(canvas)
    K.chrome(s)
    top = (canvas - FRAME_H) / 2 + 4
    intro_x, card_x, card_w = K.frame(s, top, FRAME_H, INTRO_W)

    K.intro(
        s, intro_x, top, INTRO_W, FRAME_H,
        kicker="یک مرحلهٔ ضروری",
        title=["از حساب‌تان", "بهتر محافظت کنید."],
        copy="برای ادامه، پنج پرسش امنیتی متفاوت انتخاب کنید و پاسخ‌هایی بنویسید که بعداً به یاد می‌آورید.",
    )
    K.trust_row(s, intro_x + 56, top + FRAME_H - 56 - 78, INTRO_W - 112,
                "پاسخ‌ها رمزنگاری می‌شوند",
                "هیچ‌کس پاسخ‌ها را نمی‌بیند، حتی مدیران.", "mdi-shield-lock-outline")

    right = card_x + card_w - 64
    left = right - FORM_W
    y = top + 74
    y = K.card_head(s, left, y, FORM_W, "تکمیل راه‌اندازی حساب", "پرسش‌های امنیتی شما",
                    "mdi-shield-key-outline")
    y += 6

    # caption above the track: drawn on the same line the bar covered the words
    s.text(right, y, "۳ از ۵ پاسخ ثبت شده", "d-caption", C.muted, align="right")
    s.progress(left, y + 28, FORM_W, 6, 0.6, C.primary)
    y += 50

    for index, (question, answer) in enumerate(QUESTIONS, start=1):
        s.rect(left + FORM_W - 32, y + 4, 32, 32, fill="#EDF7F3", radius=10, outline="#DCEBE5",
               outline_w=1)
        s.text(left + FORM_W - 16, y + 10, K.fa(index), "d-caption-bold", C.primary,
               align="center")
        inner = FORM_W - 44
        q_w = inner * 0.575 - 6
        a_w = inner * 0.425 - 6
        qx = left + FORM_W - 44 - q_w
        s.rect(qx, y, q_w, 44, fill="#FFFFFF", radius=8, outline="#C9D6D2", outline_w=1)
        s.i.draw_icon(qx + 18, y + 22, "mdi-chevron-down", 18, C.muted_2)
        s.text(qx + q_w - 14, y + 12, question, "d-body", C.text, align="right",
               max_width=q_w - 46)

        s.rect(left, y, a_w, 44, fill="#FFFFFF", radius=8,
               outline="#C9D6D2" if answer else "#D8E3DF", outline_w=1)
        if answer:
            K.floating_label(s, left, y, a_w, "پاسخ شما", True, C.primary)
            s.text(left + a_w - 14, y + 12, answer, "d-body", C.text, align="right",
                   max_width=a_w - 28)
        else:
            s.text(left + a_w - 14, y + 12, "پاسخ شما", "d-body", C.muted_2, align="right",
                   max_width=a_w - 28)
        y += 52

    y += 12
    K.submit(s, left, y, FORM_W, "ثبت پاسخ‌ها و ادامه", state="disabled")
    y += K.FIELD_H + 8
    s.text(right, y, "دو پرسش باقی مانده است؛ تا تکمیل هر پنج پرسش، ادامه ممکن نیست.",
           "d-caption", C.muted, align="right", max_width=FORM_W)
    return s


def onboarding_loading():
    """The question catalog is fetched; the form is visible but inert rather than blank."""
    canvas = FRAME_H + 300
    s = K.screen(canvas)
    K.chrome(s)
    top = (canvas - FRAME_H) / 2 + 4
    intro_x, card_x, card_w = K.frame(s, top, FRAME_H, INTRO_W)

    K.intro(
        s, intro_x, top, INTRO_W, FRAME_H,
        kicker="یک مرحلهٔ ضروری",
        title=["از حساب‌تان", "بهتر محافظت کنید."],
        copy="برای ادامه، پنج پرسش امنیتی متفاوت انتخاب کنید و پاسخ‌هایی بنویسید که بعداً به یاد می‌آورید.",
    )
    K.trust_row(s, intro_x + 56, top + FRAME_H - 56 - 78, INTRO_W - 112,
                "پاسخ‌ها رمزنگاری می‌شوند",
                "هیچ‌کس پاسخ‌ها را نمی‌بیند، حتی مدیران.", "mdi-shield-lock-outline")

    right = card_x + card_w - 64
    left = right - FORM_W
    y = top + 74
    y = K.card_head(s, left, y, FORM_W, "تکمیل راه‌اندازی حساب", "پرسش‌های امنیتی شما",
                    "mdi-shield-key-outline")
    y += 6
    y = K.alert(s, left, y, FORM_W, "در حال بارگذاری فهرست پرسش‌ها…", "info")
    y += 6

    for index in range(1, 6):
        s.rect(left + FORM_W - 32, y + 4, 32, 32, fill="#EDF7F3", radius=10, outline="#DCEBE5",
               outline_w=1)
        s.text(left + FORM_W - 16, y + 10, K.fa(index), "d-caption-bold", C.primary,
               align="center")
        inner = FORM_W - 44
        q_w = inner * 0.575 - 6
        a_w = inner * 0.425 - 6
        qx = left + FORM_W - 44 - q_w
        s.rect(qx, y, q_w, 44, fill="#F6FAF8", radius=8, outline="#E1EAE6", outline_w=1)
        K.skeleton(s, qx + 16, y + 15, q_w * 0.62, 14)
        s.rect(left, y, a_w, 44, fill="#F6FAF8", radius=8, outline="#E1EAE6", outline_w=1)
        K.skeleton(s, left + 16, y + 15, a_w * 0.44, 14)
        y += 52

    y += 12
    K.submit(s, left, y, FORM_W, "ثبت پاسخ‌ها و ادامه", state="disabled")
    return s


SCREENS = {
    "a-onboarding": ("11-onboarding.png", onboarding),
    "a-onboarding-loading": ("12-onboarding-loading.png", onboarding_loading),
}
