"""Shared kit for the authentication reference mockups (RTL, desktop).

Every page under `design/auth/` is drawn from this module so the six auth screens — login, registration, the three
recovery steps, the mandatory security-question onboarding and the auth chrome — cannot drift from each other.

The layout mirrors `packages/client/src/styles/auth.css` and `packages/client/src/App.vue`:

* a quiet chrome bar (`auth-chrome`) with the brand, a theme toggle and a "home" pill, then
* one framed split panel: the dark intro column on the physical right (first grid column in RTL) and the white form
  column on the left, both clipped by a 24px radius and one shared border.

Shared tokens, fonts, icon font and text shaping come from `design/map-page/_generator/bb`; the desktop type ramp is
`design/admin-panel/_generator/atheme.py`, so an auth mockup and an admin mockup use the same 14px body and 11.5px
caption.
"""
from __future__ import annotations

import contextlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GEOM = os.path.abspath(os.path.join(HERE, "..", "..", "map-page", "_generator"))
ADMIN = os.path.abspath(os.path.join(HERE, "..", "..", "admin-panel", "_generator"))
# Appended, not inserted: `design/admin-panel/_generator` also contains a package named `sections`, and
# putting it at the front of sys.path shadowed this folder's own `sections` package whenever something imported
# `sections.system` first.
for _path in (GEOM, ADMIN):
    if _path not in sys.path:
        sys.path.append(_path)

import atheme  # noqa: F401,E402  (registers the desktop type ramp on bb.theme.TYPE)
from atheme import A, C  # noqa: E402

from bb.prims import Screen  # noqa: E402
from bb.text import fa_digits  # noqa: E402

# --- canvas ------------------------------------------------------------------
W = 1440
CHROME_H = 88          # 5.5rem, the auth bar
FRAME_W = 1248         # min(100%, 78rem)
FRAME_X = (W - FRAME_W) / 2
FRAME_H = 560          # min-height: 35rem; the form column can push it taller
RADIUS = 24
FIELD_H = 52
FIELD_R = 8            # v-field rounded="lg"
CARD_X_PAD = 64        # clamp(2rem, 5vw, 4rem)

# The dark intro runs the same 155deg gradient as `.app-shell--auth .auth-intro`.
INTRO = ("#0C5154", "#164C4B", "#193C42")


# --- themes ------------------------------------------------------------------
# `:root.dark` swaps a handful of tokens and nothing else, so the dark plate must not be a second, hand-copied
# drawing of the login page: that copy drifts (it lost the divider gap and the 24px radius within one round).
# Instead a context rebinds the token class the widgets already read at call time, and the *same* functions
# draw the dark screen.  Only tokens that the CSS actually swaps are listed.
# Tokens the auth pages use that the shared palette does not name yet. They are registered on `C` so a widget
# never holds a literal colour, which is what made the first dark plate drift from the light one.
LIGHT_TOKENS = {
    "page": "#EEF5F1",         # `.app-shell--auth .app-main`
    "brand_tile": "#0E6666",
    "frame_edge": "#CFE1DC",
    "field_fill": "#FFFFFF",
    "field_fill_2": "#FBFDFC",
    "field_edge": "#C9D6D2",
    "field_edge_off": "#E4EBE8",
    "tile_fill": "#EDF6F2",
    "tile_edge": "#DCEBE5",
    "ink": "#1A3B3C",
    "ink_quiet": "#748887",
    "line": "#DCE5E2",
    "line_ink": "#9AA9A7",
    "switch_lead": "#758989",
    "dot": "#B7C6C2",
    "cta_busy": "#3C8481",
    "cta_off": "#E3EBE8",
    "cta_off_ink": "#9AA9A6",
}
for _name, _value in LIGHT_TOKENS.items():
    setattr(C, _name, _value)

DARK_TOKENS = {
    "surface": "#101D1E",
    "surface_2": "#16252A",
    "surface_3": "#1B292A",
    "background": "#0C1617",
    "outline": "#2C403D",
    "outline_strong": "#46615D",
    "text": "#EDF5F2",
    "text_2": "#C6DAD6",
    "muted": "#9DB4B0",
    "muted_2": "#7E9490",
    "primary": "#71C7BE",
    "primary_deep": "#8FD8D0",
    "primary_press": "#A5E2DB",
    "primary_soft": "#1C3334",
    "primary_soft_2": "#24403F",
    "on_primary": "#08211F",
    "success_soft": "#142A22",
    "warning_soft": "#2A2113",
    "danger_soft": "#2A1719",
    "info_soft": "#15242A",
    # auth-only tokens
    "page": "#0C1617",
    "brand_tile": "#0E6666",     # the brand mark keeps its colour in both themes
    "frame_edge": "#46615D",
    "field_fill": "#16252A",
    "field_fill_2": "#131F20",
    "field_edge": "#405B57",
    "field_edge_off": "#243635",
    "tile_fill": "#1C3334",
    "tile_edge": "#2C4744",
    "ink": "#EDF5F2",
    "ink_quiet": "#9DB4B0",
    "line": "#33494A",
    "line_ink": "#7E9490",
    "switch_lead": "#A8BFBB",
    "dot": "#4A615E",
    "cta_busy": "#3C8481",
    "cta_off": "#243635",
    "cta_off_ink": "#6B807C",
}


@contextlib.contextmanager
def theme(dark: bool = False):
    """Draw with the light or the dark token set, then put every token back."""
    saved = {}
    table = DARK_TOKENS if dark else LIGHT_TOKENS
    for key, value in table.items():
        saved[key] = getattr(C, key)
        setattr(C, key, value)
    globals()["_DARK"] = dark
    try:
        yield C
    finally:
        for key, value in saved.items():
            setattr(C, key, value)
        globals()["_DARK"] = False


def is_dark() -> bool:
    return globals().get("_DARK", False)


def fa(value) -> str:
    """Latin digits -> Persian digits; every number on these screens is Persian."""
    return fa_digits(str(value))


# Standard plate heights. A page asks for what its content needs and gets the next size up, so the folder
# reads as one set of plates instead of sixteen arbitrary crops. 900 is the desktop viewport.
LADDER = (900, 1000, 1100, 1200, 1400)


def snap(height: float) -> int:
    """Round a requested canvas height up to the ladder."""
    for step in LADDER:
        if height <= step:
            return step
    return int(-(-height // 100) * 100)


def screen(height: int = 900, background: str | None = None, width: int | None = None) -> Screen:
    """Page canvas: the two soft radial washes from `.app-shell--auth .app-main` over #EEF5F1.

    Drawn as a stack of concentric discs in ONE alpha layer. Three opaque discs (the first attempt) leave a
    hard circular edge at every radius, and drawing the accent as a single huge disc leaves a straight
    vertical seam where it is clipped by the canvas edge; stepping the alpha over 40 rings removes both.
    """
    width = width or W
    height = snap(height)
    # In dark mode `.app-main` is one flat #0C1617 with no washes, so the same call draws the same page
    # and the only difference is the token table.
    s = Screen(background=background or C.page, width=width, height=height, scale=1)
    if not is_dark():
        with s.alpha_layer():
            _radial(s, 90, 120, 780, (233, 179, 90), 34)
            _radial(s, width - 110, height - 90, 760, (14, 102, 102), 30)
    return s


def _radial(s: Screen, cx: float, cy: float, r_max: float, color: tuple[int, int, int],
            peak: int, rings: int = 40):
    """One soft wash: alpha ramps from 0 at the rim to `peak` at the centre."""
    for index in range(rings):
        t = (index + 1) / rings
        radius = r_max * (1 - t * 0.94)
        alpha = int(peak * t ** 1.7)
        if alpha <= 0:
            continue
        s.circle(cx, cy, radius, fill=(*color, alpha))


def gradient_v(s: Screen, x: float, y: float, w: float, h: float, stops, steps: int = 96):
    """Vertical multi-stop gradient, stepped so it stays dependency-free."""
    for index in range(steps):
        t = index / (steps - 1)
        pos = t * (len(stops) - 1)
        low = min(int(pos), len(stops) - 2)
        mix = pos - low
        color = _blend(stops[low], stops[low + 1], mix)
        s.rect(x, y + h * index / steps, w, h / steps + 1, fill=color)


def diagonal_panel(s: Screen, x: float, y: float, w: float, h: float, stops=INTRO,
                   decor_cy: float | None = None, decor: bool = True):
    """The intro panel: the 155deg wash, then the faint decoration ring.

    The wash is a pure vertical ramp on purpose. Layering soft translucent discs on top of it, as the
    CSS radial does, leaves a visible circular seam at this size, and a seam is worse than a flat gradient.
    """
    gradient_v(s, x, y, w, h, stops)
    if decor:
        _decor(s, x, y, w, h, decor_cy)


def translucent(s: Screen):
    """Context manager for any rgba fill.

    `ImageDraw` writes an RGBA fill straight into the pixel, it does not blend, so a translucent
    white rect punches a hole through the panel instead of tinting it. Everything translucent is
    therefore drawn into a layer that is composited afterwards.
    """
    return s.alpha_layer()


def _decor(s: Screen, x: float, y: float, w: float, h: float, cy: float | None = None):
    """`.auth-decoration`: faint rings in the empty band under the copy, clipped to the panel.

    The client draws this at 78% opacity behind the trust row; here it is fainter still, because a
    printed reference is read rather than glanced at and anything stronger competes with the copy.
    """
    cx, cy = x + 96, y + (h - 222 if cy is None else cy)
    with s.clip_rounded(x, y, w, h, 0):
        with translucent(s):
            s.circle(cx, cy, 88, fill=None, outline=(255, 255, 255, 34), outline_w=1)
            s.circle(cx, cy, 68, fill=None, outline=(244, 215, 150, 79), outline_w=1)
            s.circle(cx, cy, 48, fill=(255, 255, 255, 14))
            s.i.draw_icon(cx, cy, "mdi-plus", 30, (255, 255, 255, 92))
            s.circle(cx - 62, cy - 70, 5, fill=(233, 179, 90, 190))
            s.circle(cx + 56, cy + 48, 3.5, fill=(67, 161, 138, 190))


def _rgb(color: str) -> tuple[int, int, int]:
    color = color.lstrip("#")
    return tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))


def _blend(a: str, b: str, t: float) -> str:
    ar, ag, ab = _rgb(a)
    br, bg, bb = _rgb(b)
    return "#%02X%02X%02X" % (
        round(ar + (br - ar) * t), round(ag + (bg - ag) * t), round(ab + (bb - ab) * t))


# --------------------------------------------------------------------------- #
# chrome
# --------------------------------------------------------------------------- #
def chrome(s: Screen, y: float = 0, dark: bool | None = None):
    """`auth-chrome`: brand at the reading-start (right) edge, actions at the left.

    `dark` swaps the four colours the client's `:root.dark` block swaps. Drawing the light chrome on a
    dark page left the brand name #173B3C on #101D1E — invisible.
    """
    dark = is_dark() if dark is None else dark
    brand = "#EDF5F2" if dark else "#173B3C"
    pill_fill = "#203536" if dark else "#FFFFFF"
    pill_edge = "#49615D" if dark else "#B9D1CA"
    pill_ink = "#EDF5F2" if dark else "#214C49"

    right = FRAME_X + FRAME_W - 40
    s.rect(right - 42, y + 23, 42, 42, fill=C.brand_tile, radius=13)
    s.i.draw_icon(right - 21, y + 44, "mdi-plus", 24, "#FFFFFF")
    s.text(right - 54, y + 22, "بوروبیا", "d-h2", brand, align="right")

    pill_w = s.tw("صفحهٔ اصلی", "d-label") + 62
    _pill_link(s, FRAME_X + 40, y + 24, pill_w, "صفحهٔ اصلی", "mdi-arrow-left", pill_fill,
               pill_edge, pill_ink)
    s.rect(FRAME_X + 40 + pill_w + 12, y + 22, 44, 44, fill=pill_fill, radius=22,
           outline="#49615D" if dark else "#D8E4E0", outline_w=1)
    s.i.draw_icon(FRAME_X + 40 + pill_w + 12 + 22, y + 44,
                  "mdi-weather-sunny" if dark else "mdi-weather-night", 20, pill_ink)


def _pill_link(s: Screen, x: float, y: float, w: float, label: str, icon: str,
               fill: str = "#FFFFFF", edge: str = "#B9D1CA", ink: str = "#214C49"):
    s.rect(x, y, w, 44, fill=fill, radius=22, outline=edge, outline_w=1)
    total = s.tw(label, "d-label") + 24
    right = x + (w + total) / 2
    s.i.draw_icon(right - 8, y + 22, icon, 17, ink)
    s.text(right - 26, y + 12, label, "d-label", ink, align="right")


# --------------------------------------------------------------------------- #
# frame + intro
# --------------------------------------------------------------------------- #
def frame(s: Screen, top: float, height: float, intro_w: float, decor_cy: float | None = None,
          decor: bool = True):
    """Bordered split panel. Returns (intro_x, card_x, card_w)."""
    x, w = FRAME_X, FRAME_W
    s.shadow(x, top, w, height, radius=RADIUS, blur=44, dy=12, alpha=40)
    s.rect(x, top, w, height, fill=C.surface, radius=RADIUS, outline=C.frame_edge, outline_w=1)
    intro_x = x + w - intro_w
    with s.clip_rounded(x, top, w, height, RADIUS):
        s.rect(x, top, w, height, fill=C.surface)
        diagonal_panel(s, intro_x, top, intro_w, height, decor_cy=decor_cy, decor=decor)
    return intro_x, x, w - intro_w


def intro(s: Screen, x: float, y: float, w: float, h: float, kicker: str, title: list[str],
          copy: str, items: list[tuple[str, str, str]] | None = None, steps: tuple | None = None):
    """Dark column: kicker pill, display title (`<span>` line in amber), copy, then features or a step rail."""
    pad = 56
    right = x + w - pad
    inner = w - pad * 2

    # kicker
    kw = s.tw(kicker, "d-label") + 46
    with translucent(s):
        s.rect(right - kw, y + pad, kw, 34, fill=(255, 255, 255, 30), radius=17,
               outline=(255, 255, 255, 71), outline_w=1)
    s.circle(right - 18, y + pad + 17, 3.5, fill="#F4D796")
    s.text(right - 30, y + pad + 7, kicker, "d-label", "#FFFFFF", align="right", max_width=kw - 44)

    ty = y + pad + 62
    for index, line in enumerate(title):
        s.text(right, ty, line, "d-display", "#F4D796" if index else "#FFFFFF", align="right",
               max_width=inner)
        ty += 44

    ty += 10
    s.para(x + pad, ty, copy, "d-body", "#D9EEEA", align="right", max_width=inner, max_lines=3)

    if steps:
        # Directly under the copy: pinning it to the bottom collides with anything else the
        # column carries, and in a reference the reading order should match the visual order.
        rail_y = ty + _line_count(copy, "d-body", inner) * 22 + 34
        _step_rail(s, x + pad, rail_y, inner, steps)

    if items:
        # Features stack from the bottom so the panel never looks top-heavy. The number badge only decorates
        # the head line; the body keeps the full column width, and any body that still needs two lines pushes
        # the block up instead of being cut off — a body indented by the badge lost 48px and ellipsized at
        # "…نه به شکل م.". Measured, never guessed.
        lines = [_line_count(body, "d-caption", inner) for _, _, body in items]
        height = sum(22 + count * 17 + 16 for count in lines) - 16
        fy = y + h - pad - 24 - height
        for (number, head, body), count in zip(items, lines):
            if number:
                with translucent(s):
                    s.rect(right - 34, fy, 34, 34, fill=(255, 255, 255, 31), radius=11)
                s.text(right - 17, fy + 8, number, "d-caption-bold", "#FFDFA1", align="center")
                head_right, head_width = right - 48, inner - 48
            else:
                head_right, head_width = right, inner
            s.text(head_right, fy - 2, head, "d-label-lg", "#FFFFFF", align="right",
                   max_width=head_width)
            s.para(x + pad, fy + 22, body, "d-caption", "#D4E9E4", align="right", max_width=inner,
                   max_lines=2)
            fy += 22 + count * 17 + 16


def trust_row(s: Screen, x: float, y: float, w: float, title: str, body: str, icon: str):
    """`.auth-trust-row`: the reassurance card pinned to the bottom of the intro column.

    Height follows the copy. A fixed height was truncating the headline and clipping the second line
    of the explanation on the narrower intro column.
    """
    text_w = w - 88
    lines = _line_count(body, "d-caption", text_w)
    h = max(74, 20 + 20 + lines * 17 + 16)
    with translucent(s):
        s.rect(x, y, w, h, fill=(255, 255, 255, 26), radius=16,
               outline=(255, 255, 255, 56), outline_w=1)
        s.rect(x + w - 54, y + (h - 38) / 2, 38, 38, fill=(255, 255, 255, 41), radius=13)
    s.i.draw_icon(x + w - 35, y + h / 2, icon, 20, "#FFFFFF")
    s.text(x + w - 66, y + 15, title, "d-label", "#FFFFFF", align="right", max_width=text_w)
    s.para(x + 14, y + 37, body, "d-caption", "#D4E9E4", align="right", max_width=text_w,
           max_lines=lines)
    return y + h


def _line_count(text: str, style: str, width: float) -> int:
    """How many lines `para` will produce; the rail has to be placed by measurement, not by eye."""
    words, lines, current = text.split(), 1, ""
    for word in words:
        probe = f"{current} {word}".strip()
        if _measure(probe, style) > width and current:
            lines += 1
            current = word
        else:
            current = probe
    return lines


def _measure(text: str, style: str) -> float:
    from bb.text import text_width
    from bb.prims import RENDER_SCALE
    return text_width(text, style, 1)


def _step_rail(s: Screen, x: float, y: float, w: float, steps: tuple):
    """Recovery progress: one row per step, current one lit, completed ones ticked."""
    current, labels = steps
    for index, label in enumerate(labels):
        done = current > index + 1
        on = current == index + 1
        color = "#FFFFFF" if on else "#C8E0DC"
        with translucent(s):
            s.rect(x, y, w, 1, fill=(255, 255, 255, 40))
            s.rect(x, y + 12, 30, 30, radius=15, fill="#F4D796" if done or on else (255, 255, 255, 33))
        if done:
            s.i.draw_icon(x + 15, y + 27, "mdi-check", 16, "#143F3F")
        else:
            s.text(x + 15, y + 18, fa(index + 1), "d-caption-bold",
                   "#143F3F" if on else "#FFFFFF", align="center")
        s.text(x + w - 44, y + 17, label, "d-label", color, align="right")
        y += 54
    with translucent(s):
        s.rect(x, y, w, 1, fill=(255, 255, 255, 40))


# --------------------------------------------------------------------------- #
# form column
# --------------------------------------------------------------------------- #
def skeleton(s: Screen, x: float, y: float, w: float, h: float = 14, r: float = 8):
    """Placeholder bar for the loading state; same colour the admin mockups use."""
    s.rect(x, y, w, h, fill=C.surface_3, radius=r)


def progress(s: Screen, x: float, y: float, w: float, h: float, value: float, color: str):
    s.rect(x, y, w, h, fill=C.surface_3, radius=h / 2)
    if value > 0:
        s.rect(x, y, max(h, w * value), h, fill=color, radius=h / 2)


def intro_copy(s: Screen, x: float, y: float, w: float, text: str, style: str = "d-body"):
    """`.auth-form-intro`: the one quiet sentence that explains what this step asks for."""
    s.para(x, y, text, style, C.ink_quiet, align="right", max_width=w, max_lines=2)
    return y + 54


def card_head(s: Screen, x: float, y: float, w: float, eyebrow: str, title: str, icon: str):
    """52px icon tile + eyebrow + card title, drawn from the reading-start edge."""
    right = x + w
    s.rect(right - 52, y, 52, 52, fill=C.tile_fill, radius=17, outline=C.tile_edge, outline_w=1)
    s.i.draw_icon(right - 26, y + 26, icon, 25, C.primary)
    s.text(right - 68, y + 2, eyebrow, "d-sm", C.muted, align="right", max_width=w - 80)
    s.text(right - 68, y + 22, title, "d-h2", C.ink, align="right", max_width=w - 80)
    return y + 52 + 26


def field(s: Screen, x: float, y: float, w: float, label: str, value: str = "", icon: str | None = None,
          hint: str | None = None, state: str = "idle", trailing: str | None = None,
          h: float = FIELD_H):
    """Outlined text field with a floating label, matching `v-text-field variant="outlined"`.

    state: idle | focus | error | disabled
    """
    edge = {"idle": C.field_edge, "focus": C.primary, "error": C.danger, "disabled": C.field_edge_off}[state]
    fill = C.field_fill_2 if state == "disabled" else C.field_fill
    s.rect(x, y, w, h, fill=fill, radius=FIELD_R, outline=edge, outline_w=2 if state == "focus" else 1)
    right = x + w - 14
    if icon:
        s.i.draw_icon(right - 8, y + h / 2, icon, 18,
                      C.danger if state == "error" else C.muted_2)
        right -= 30
    if trailing:
        s.i.draw_icon(x + 22, y + h / 2, trailing, 18, C.muted)
        # keep the label run clear of the trailing glyph
    if value:
        # outlined fields lift the label into the border rather than stacking it above the box
        floating_label(s, x, y, w, label, True,
                       C.danger if state == "error" else C.primary)
        s.text(right, y + (h - 21) / 2, value, "d-body", C.text, align="right",
               max_width=right - x - (40 if trailing else 14))
    else:
        s.text(right, y + (h - 20) / 2, label, "d-body", C.muted_2, align="right",
               max_width=right - x - (40 if trailing else 14))
    if hint:
        s.text(x + w - 14, y + h + 6, hint, "d-caption", C.muted, align="right", max_width=w - 28)
    return y + h + (24 if hint else 0)


def floating_label(s: Screen, x: float, y: float, w: float, label: str, filled: bool,
                   color: str = C.muted):
    """The label that lifts into the border once a field has content; rows keep their meaning."""
    if not filled:
        return
    tw = s.tw(label, "d-caption")
    right = x + w - 16
    s.rect(right - tw - 6, y - 8, tw + 12, 16, fill=C.field_fill)
    s.text(right, y - 9, label, "d-caption", color, align="right")


def checkbox(s: Screen, right: float, y: float, label: str, checked: bool = False):
    """`right` is the box's reading-start edge: the box sits at the right, the label to its left."""
    s.rect(right - 18, y, 18, 18, radius=4, fill=C.primary if checked else C.field_fill,
           outline=None if checked else C.dot, outline_w=1)
    if checked:
        s.i.draw_icon(right - 9, y + 9, "mdi-check", 13, "#FFFFFF")
    s.text(right - 28, y - 2, label, "d-sm", C.text_2, align="right", max_width=260)


def alert(s: Screen, x: float, y: float, w: float, text: str, tone: str = "error",
          action: str | None = None):
    fill, color, icon = {
        "error": ("#FBEAEB", "#8E2429", "mdi-alert-circle-outline"),
        "success": ("#E4F2EA", "#1F5E41", "mdi-check-circle-outline"),
        "warning": ("#FCF0DC", "#8A5406", "mdi-alert-outline"),
        "info": ("#E6F1F5", "#2A5F76", "mdi-information-outline"),
    }[tone]
    h = 52
    s.rect(x, y, w, h, fill=fill, radius=10)
    s.i.draw_icon(x + w - 24, y + h / 2, icon, 19, color)
    s.text(x + w - 44, y + (h - 22) / 2, text, "d-body", color, align="right",
           max_width=w - (150 if action else 80))
    if action:
        s.text(x + 22 + s.tw(action, "d-label"), y + (h - 20) / 2, action, "d-label", color,
               align="right")
    return y + h + 14


def submit(s: Screen, x: float, y: float, w: float, label: str, icon: str = "mdi-arrow-left",
           state: str = "idle", h: float = 52):
    """Primary CTA. state: idle | loading | disabled"""
    fill = {"idle": C.primary, "loading": C.cta_busy, "disabled": C.cta_off}[state]
    color = C.on_primary if state != "disabled" else C.cta_off_ink
    if state == "idle":
        s.shadow(x, y, w, h, radius=10, blur=18, dy=6, color=C.primary, alpha=54)
    s.rect(x, y, w, h, fill=fill, radius=10)
    if state == "loading":
        s.spinner(x + w - 34, y + h / 2, 10, "#FFFFFF", 2.4)
    total = s.tw(label, "d-label-lg") + 26
    right = x + (w + total) / 2
    if state == "idle":
        s.i.draw_icon(right - 9, y + h / 2, icon, 18, color)
        right -= 26
    s.text(right - (26 if state != "idle" else 0), y + (h - 22) / 2, label, "d-label-lg", color,
           align="right")


def divider(s: Screen, x: float, y: float, w: float, label: str = "یا"):
    mid = x + w / 2
    s.rect(x, y, w / 2 - 20, 1, fill=C.line)
    s.rect(mid + 20, y, w / 2 - 20, 1, fill=C.line)
    s.text(mid, y - 9, label, "d-caption", C.line_ink, align="center")


def switch_copy(s: Screen, x: float, y: float, w: float, lead: str, link: str):
    total = s.tw(lead + " ", "d-sm") + s.tw(link, "d-label")
    right = x + (w + total) / 2
    s.text(right, y, link, "d-label", C.primary, align="right")
    s.text(right - s.tw(link, "d-label") - 6, y, lead, "d-sm", C.switch_lead, align="right")


def privacy_note(s: Screen, x: float, y: float, w: float, text: str):
    icon_w = 18
    total = s.tw(text, "d-caption") + icon_w + 8
    right = x + (w + total) / 2
    s.i.draw_icon(right - 8, y + 8, "mdi-lock-check-outline", 16, C.muted_2)
    s.text(right - 26, y, text, "d-caption", C.muted_2, align="right", max_width=w - 20)


__all__ = ["theme", "is_dark", "DARK_TOKENS", "LIGHT_TOKENS",
    "W", "CHROME_H", "FRAME_W", "FRAME_X", "FRAME_H", "RADIUS", "FIELD_H", "FIELD_R", "CARD_X_PAD",
    "INTRO", "fa", "screen", "snap", "LADDER", "gradient_v", "diagonal_panel", "chrome", "frame", "intro",
    "card_head", "intro_copy", "skeleton", "progress", "field", "floating_label", "checkbox", "alert", "submit", "divider",
    "trust_row", "translucent",
    "switch_copy", "privacy_note", "C", "A", "Screen",
]
