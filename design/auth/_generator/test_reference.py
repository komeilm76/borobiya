"""Contract tests for the authentication reference images.

These do not check pixels. They check the four things that actually go wrong with a design folder that has to stay
true to a codebase:

1. a page listed here is not in the folder, or a file in the folder is not listed;
2. a page on disk is not the size its generator says it is (a stale render);
3. an icon drawn on a page does not exist in the vendored Material Design Icons font, which renders as a blank box;
4. a page uses a token colour the client's `auth.css`/`App.vue` do not actually use.

Run from `design/auth/_generator`:  python -m pytest . -q
"""
from __future__ import annotations

import os
import re
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN = os.path.abspath(os.path.join(HERE, ".."))
REPO = os.path.abspath(os.path.join(DESIGN, "..", ".."))
CSS = os.path.join(REPO, "design", "map-page", "_generator", "assets", "materialdesignicons.css")
CLIENT = os.path.join(REPO, "packages", "client", "src")

sys.path.insert(0, HERE)

import render  # noqa: E402


def screens() -> dict[str, tuple[str, object]]:
    return render.registry()


def readme() -> str:
    with open(os.path.join(DESIGN, "README.md"), encoding="utf-8") as handle:
        return handle.read()


def page_files() -> list[str]:
    return sorted(name for name in os.listdir(DESIGN) if re.fullmatch(r"\d\d-[a-z-]+\.png", name))


def test_every_registered_page_exists():
    missing = [path for path, _ in screens().values()
               if not os.path.exists(os.path.join(DESIGN, path))]
    assert not missing, f"run `python render.py`: {missing}"


def test_every_page_is_documented_and_every_documented_page_exists():
    documented = set(re.findall(r"`(\d\d-[a-z-]+\.png)`", readme()))
    on_disk = set(page_files())
    assert on_disk - documented == set(), f"rendered but not in README.md: {sorted(on_disk - documented)}"
    assert documented - on_disk == set(), f"README.md lists a missing page: {sorted(documented - on_disk)}"


def test_page_count_matches_the_registry():
    assert len(page_files()) == len(screens()), (
        "the folder and the generator disagree — delete stale renders or register the new page"
    )


def test_readme_image_index_matches_the_files():
    """The index table is what a reader trusts, and it drifted silently the first time the plates were resized."""
    from PIL import Image

    rows = re.findall(r"^\| (\d\d) \| [^|]+ \| (\d+)×(\d+) \|$", readme(), re.MULTILINE)
    assert len(rows) == len(screens()), "every page needs a row in the image index"
    for number, width, height in rows:
        name = next(n for n in page_files() if n.startswith(f"{number}-"))
        with Image.open(os.path.join(DESIGN, name)) as image:
            assert image.size == (int(width), int(height)), (
                f"README says {name} is {width}×{height}; the file is {image.size[0]}×{image.size[1]}"
            )


def test_icons_used_in_the_generator_exist_in_the_font():
    """A name the font does not carry draws as an empty box; nothing else catches it before a reader does."""
    with open(CSS, encoding="utf-8") as handle:
        known = set(re.findall(r"\.mdi-([a-z0-9-]+)::before", handle.read()))
    assert len(known) > 7000

    used: set[str] = set()
    for folder, _, files in os.walk(HERE):
        for name in files:
            if not name.endswith(".py"):
                continue
            with open(os.path.join(folder, name), encoding="utf-8") as handle:
                used.update(re.findall(r"mdi-[a-z0-9-]+", handle.read()))
    unknown = sorted(name for name in used if name.removeprefix("mdi-") not in known)
    assert not unknown, f"not in the Material Design Icons webfont: {unknown}"


def test_auth_css_still_owns_the_tokens_the_pages_draw():
    """The mockups claim to mirror the client; if the client moves, this folder has to be re-read."""
    with open(os.path.join(CLIENT, "styles", "auth.css"), encoding="utf-8") as handle:
        css = handle.read()
    with open(os.path.join(CLIENT, "App.vue"), encoding="utf-8") as handle:
        app = handle.read()

    for token in ("#0e6666", "#173b3c", "#eef5f1", "#f4d796", "#0c5154"):
        assert token in css or token in app, f"{token} is no longer a client colour; the mockups are stale"


@pytest.mark.parametrize("key", sorted(screens()))
def test_page_size_matches_its_generator(key):
    """A page whose file size and generator disagree is a stale render."""
    path, fn = screens()[key]
    screen = fn()
    from PIL import Image

    with Image.open(os.path.join(DESIGN, path)) as image:
        assert image.size == screen.img.size, f"{path}: re-run the generator"
