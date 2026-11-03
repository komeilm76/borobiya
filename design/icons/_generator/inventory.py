"""Inventory every Material Design Icon the Vue client renders, and say what it is for.

The design folder is the place a reader goes to find out what a screen is made of; an icon that exists only
inside a `.vue` file is invisible there. This module reads the client sources, records every `mdi-*` token with
the element and slot that carry it, and groups the result into the roles the catalog is drawn from.

Two rules keep the result honest:

* only markup counts. A glyph inside `<script>` or `<style>` is data (a nav tuple, a status map), so it is
  classified from the file it lives in rather than from tags that are not markup at all.
* an icon may serve more than one role. `mdi-plus` is a button in one screen, a menu row in another and a state
  action in a third; the catalog shows the primary role and keeps every role in `icons.json`.

Run it directly to see the classification, or import `collect()` from `render.py`.
"""
from __future__ import annotations

import json
import os
import re
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN = os.path.abspath(os.path.join(HERE, ".."))          # design/icons
ROOT = os.path.abspath(os.path.join(DESIGN, "..", ".."))    # repo root
CLIENT = os.path.join(ROOT, "packages", "client", "src")

ICON = re.compile(r"mdi-[a-z0-9]+(?:-[a-z0-9]+)*")
TAG = re.compile(r"<([A-Za-z][\w.-]*)((?:[^<>\"']|\"[^\"]*\"|'[^']*')*)>")
BLOCK = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.S)
NAV_TUPLE = re.compile(r"\[\s*\"[^\"]+\"\s*,\s*\"[^\"]+\"\s*,\s*\"mdi-")

# Tags that never wrap content, so they must not be pushed on the scope stack.
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
        "track", "wbr", "path", "circle", "rect", "line", "polygon", "polyline", "use", "stop"}

# element -> the role its icons serve
ELEMENTS = {
    "v-btn": "actions", "v-fab": "actions", "button": "actions",
    "v-text-field": "fields", "v-select": "fields", "v-autocomplete": "fields", "v-combobox": "fields",
    "v-file-input": "fields", "v-textarea": "fields", "v-switch": "fields", "v-checkbox": "fields",
    "v-radio-group": "fields", "v-slider": "fields", "label": "fields", "legend": "fields",
    "v-alert": "status", "adminstatepanel": "status", "v-snackbar": "status", "v-chip": "status",
    "v-progress-circular": "status", "v-progress-linear": "status", "v-badge": "status",
    "routerlink": "navigation", "v-tab": "navigation", "v-tabs": "navigation", "v-breadcrumbs": "navigation",
    "v-navigation-drawer": "navigation", "nav": "navigation",
    "v-card-title": "cards", "v-card": "cards", "v-list-item": "cards", "v-list": "cards",
    "td": "cards", "th": "cards", "h1": "cards", "h2": "cards", "h3": "cards", "v-tooltip": "cards",
    "li": "cards", "summary": "cards",
}

# Ancestors that only wrap a glyph; the role belongs to whatever contains them.
TRANSPARENT = {"v-icon", "i", "span", "div", "template", "v-row", "v-col", "v-slot", "strong", "small",
               "b", "em", "p", "code", "v-container", "v-main"}

# A name can be more specific than the element it sits in: every map control is a button, but a reader looking for
# "what does the map use" should find the crosshairs there, not among the form buttons.
NAME_ROLES = (
    ("map", (
        "crosshairs", "map-marker", "map-outline", "map-legend", "map-search", "map-clock", "navigation-variant",
        "radar", "layers", "compass", "routes", "vector-polyline",
    )),
    ("media", (
        "image", "camera", "video", "file-document", "paperclip", "download", "upload", "content-copy",
        "printer", "qrcode", "picture", "microphone",
    )),
    ("account", (
        "account", "lock", "shield", "key", "login", "logout", "fingerprint", "incognito", "badge-account",
        "passport", "form-textbox-password", "eye-off", "domain",
    )),
)

# Where a role cannot be read from the markup, the file says what kind of data it is.
FILE_ROLES = (
    ("admin/sos-alerts", "status"),
    ("admin/status", "status"),
    ("admin/nav", "navigation"),
    ("components/admin/adminshell", None),   # markup, never reaches this branch
)

ROLE_LABELS = {
    "actions": ("کنش‌ها و دکمه‌ها", "هر چیزی که یک کار انجام می‌دهد: ذخیره، بازخوانی، بستن، افزودن، پخش."),
    "fields": ("فرم‌ها و فیلدها", "آیکن داخل ورودی‌ها: پیشوند جست‌وجو، آیکن کنار برچسب، چک‌باکس و انتخاب."),
    "navigation": ("ناوبری و مسیرها", "ریل کنار، منوی برنامه، مسیر راهنما، لینک برگشت و تب‌ها."),
    "status": ("وضعیت و بازخورد", "هشدار، خالی، خطا، آفلاین، موفقیت، اتصال و نشان‌های وضعیت."),
    "cards": ("کارت‌ها و فهرست‌ها", "عنوان کارت، ردیف فهرست، سلول جدول و سرصفحه."),
    "map": ("نقشه و موقعیت", "لایه‌ها، مکان‌نما، مسیر، نشانگر و کنترل‌های نقشه."),
    "media": ("رسانه و پیوست", "تصویر، فایل، رونوشت، دانلود و چاپ."),
    "account": ("حساب و دسترسی", "ورود، خروج، قفل، نقش و مجوز."),
}

ROLE_ORDER = ["actions", "fields", "navigation", "status", "cards", "map", "media", "account"]


def _masked(text: str):
    """Character ranges that are script/style rather than markup."""
    return [(match.start(), match.end()) for match in BLOCK.finditer(text)]


def _inside(pos: int, ranges) -> bool:
    return any(start <= pos < end for start, end in ranges)


def _scopes(text: str, masked):
    """(offset, tag, [ancestors]) for every opening tag in the markup."""
    stack: list[str] = []
    events = []
    for match in TAG.finditer(text):
        if _inside(match.start(), masked):
            continue
        raw = match.group(0)
        name = match.group(1).lower()
        if raw.startswith("</"):
            if stack:
                stack.pop()
            continue
        events.append((match.start(), match.end(), name, tuple(stack)))
        if raw.endswith("/>") or name in VOID:
            continue
        stack.append(name)
    return events


def _scope_of(events, pos: int):
    """The innermost tag that owns `pos`, plus its ancestors."""
    chosen = None
    for start, end, name, ancestors in events:
        if start > pos:
            break
        if end > pos:
            return name, ancestors
        chosen = (name, ancestors)
    return chosen if chosen else ("", ())


def _slot(text: str, pos: int) -> str:
    """The attribute that carries the glyph (`icon`, `prepend-inner-icon`, `action-icon`, …)."""
    window = text[max(0, pos - 60):pos]
    found = re.search(r"([a-zA-Z-]+)\s*[:=]\s*[\"']?$", window)
    return found.group(1).lower() if found else ""


def _file_role(relative: str, line: str) -> str:
    """What an icon inside `<script>` means: nav tuples, status maps, or data-driven content."""
    if NAV_TUPLE.search(line):
        return "navigation"
    lowered = relative.lower()
    for needle, role in FILE_ROLES:
        if needle in lowered and role:
            return role
    return ""


def _named(icon: str) -> str:
    bare = icon.removeprefix("mdi-")
    return next((role for role, needles in NAME_ROLES if any(bare.startswith(n) for n in needles)), "")


def _role(element: str, ancestors, slot: str, icon: str, script_role: str) -> str:
    if script_role:
        return script_role

    if slot in ("prepend-inner-icon", "append-inner-icon") and element.startswith("v-"):
        return "fields"
    if slot == "action-icon":
        return "status"

    chain = [element, *reversed(ancestors)] if element else list(reversed(ancestors))
    base = ""
    for tag in chain:
        if tag in TRANSPARENT:
            continue
        role = ELEMENTS.get(tag)
        if role:
            base = role
            break

    named = _named(icon)
    if base in ("actions", "cards", "fields") and named in ("map", "media", "account"):
        return named
    if base:
        return base
    return named or "cards"


def _file_hint(relative: str) -> str:
    lowered = relative.lower()
    return "navigation" if "shell" in lowered or "navigation" in lowered else ""


def collect() -> dict:
    """Read the client, return the inventory the catalog is drawn and tested from."""
    usages = []
    for folder, _dirs, files in os.walk(CLIENT):
        for name in sorted(files):
            # Tests pin source strings; an icon named in a test is not an icon the product renders.
            if not name.endswith((".vue", ".ts")) or name.endswith(".test.ts"):
                continue
            path = os.path.join(folder, name)
            with open(path, encoding="utf-8") as handle:
                text = handle.read()
            if "mdi-" not in text:
                continue

            relative = os.path.relpath(path, CLIENT).replace(os.sep, "/")
            masked = _masked(text) if name.endswith(".vue") else [(0, len(text))]
            events = _scopes(text, masked)
            lines = text.splitlines()
            hint = _file_hint(relative)

            for match in ICON.finditer(text):
                icon = match.group(0)
                line_number = text.count("\n", 0, match.start()) + 1
                if _inside(match.start(), masked):
                    element, slot = "script", ""
                    role = _file_role(relative, lines[line_number - 1]) or _named(icon) or "cards"
                else:
                    element, ancestors = _scope_of(events, match.start())
                    slot = _slot(text, match.start())
                    role = _role(element, ancestors, slot, icon, "")
                    # A shell full of menu rows is navigation even when the row is drawn as a card.
                    if hint and role == "cards":
                        role = hint
                usages.append({
                    "icon": icon,
                    "file": relative,
                    "line": line_number,
                    "element": element,
                    "slot": slot,
                    "role": role,
                })

    by_icon = {}
    for usage in usages:
        entry = by_icon.setdefault(usage["icon"], {"roles": Counter(), "uses": []})
        entry["roles"][usage["role"]] += 1
        entry["uses"].append({"file": usage["file"], "line": usage["line"], "element": usage["element"]})

    icons = []
    for icon, entry in by_icon.items():
        ranked = [role for role, _count in entry["roles"].most_common()]
        icons.append({
            "name": icon,
            "role": ranked[0],
            "roles": ranked,
            "count": sum(entry["roles"].values()),
            "files": sorted({use["file"] for use in entry["uses"]}),
            "uses": sorted(entry["uses"], key=lambda use: (use["file"], use["line"])),
        })
    icons.sort(key=lambda item: (ROLE_ORDER.index(item["role"]), -item["count"], item["name"]))

    roles = Counter(icon["role"] for icon in icons)
    return {
        "icons": icons,
        "roles": {role: roles[role] for role in ROLE_ORDER if roles[role]},
        "totals": {
            "icons": len(icons),
            "usages": len(usages),
            "files": len({usage["file"] for usage in usages}),
        },
    }


def write_json(inventory: dict) -> str:
    target = os.path.join(DESIGN, "icons.json")
    with open(target, "w", encoding="utf-8") as handle:
        json.dump(inventory, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return target


if __name__ == "__main__":
    data = collect()
    print(json.dumps(data["totals"], ensure_ascii=False))
    print("roles:", json.dumps(data["roles"], ensure_ascii=False))
    for role in ROLE_ORDER:
        icons = [icon for icon in data["icons"] if icon["role"] == role]
        if not icons:
            continue
        print(f"\n{role} ({len(icons)}): {', '.join(icon['name'] for icon in icons)}")
    write_json(data)
