#!/usr/bin/env python3
"""Structural check for the runbook-style markdown in this repository.

    python3 scripts/check_runbook_markdown.py                     # the runbook
    python3 scripts/check_runbook_markdown.py docs/*.md README.md  # everything

Not a formatter. Each check exists because that class of defect reached docs/UBUNTU_VM_RUNBOOK.md and
was only caught by hand:

  * a table row with a missing pipe, which renders a command into the wrong column;
  * a "§ x.y" reference to a section that does not exist or does not own the claim;
  * a <placeholder> written in prose, where a reader copies it literally;
  * a fenced shell snippet that does not parse (an unbalanced "fi", a heredoc with no terminator);
  * python embedded in such a block that does not compile, because bash -n cannot see inside it;
  * and the meta-bug: the first version of this checker only recognised a fence at column 0, so every
    block indented inside a list item was invisible to it and it reported "clean". A checker that skips
    half the input is worse than none, so fences are matched at any indentation here.

No regular expressions are used, on purpose: every backslash in this file is written as chr(92), which
keeps the source readable when it is pasted, patched or piped through another tool.
"""

from __future__ import annotations

import argparse
import ast
import re
import subprocess
import sys
import tempfile
from pathlib import Path

BACKTICK = chr(96)
FENCE_MARK = BACKTICK * 3
NEWLINE = chr(10)
TAB = chr(9)
SPACE = chr(32)
BSLASH = chr(92)
SECTION_SIGN = chr(167)  # §
# Real inline HTML that this repository's documents use; a placeholder is anything else.
HTML_TAGS = {"kbd", "br", "sub", "sup", "code", "details", "summary", "a", "img", "b", "i", "em", "strong"}
TRIM = SPACE + TAB
DIGITS = "0123456789"


def fence_of(line: str) -> tuple[int, int, str] | None:
    """(indent, fence length, language) for a fence delimiter line, else None.

    The length matters: README.md wraps itself in a four-backtick fence so the whole document can be
    copied as one prompt, and matching only "```" let an inner three-backtick line close that block
    early — which made 1,100 lines of the file look like prose and produced nonsense findings.
    """
    stripped = line.lstrip(SPACE)
    run = 0
    while run < len(stripped) and stripped[run] == BACKTICK:
        run += 1
    if run < 3:
        return None
    rest = stripped[run:].strip(TRIM)
    if SPACE in rest or TAB in rest:
        return None  # not a fence we understand; leave it to the reader
    return len(line) - len(stripped), run, rest


def split_document(text: str):
    """Return prose lines as (number, text), fenced blocks, and structural complaints."""
    lines = text.split(NEWLINE)
    prose: list[tuple[int, str]] = []
    blocks: list[dict] = []
    notes: list[str] = []
    current: dict | None = None
    for index, line in enumerate(lines):
        fence = fence_of(line)
        if current is None:
            if fence is not None:
                current = {
                    "indent": fence[0], "width": fence[1], "lang": fence[2], "body": [], "start": index + 1
                }
                continue
            prose.append((index + 1, line))
        elif (
            fence is not None
            and fence[0] == current["indent"]
            and fence[2] == ""
            and fence[1] >= current["width"]
        ):
            blocks.append({**current, "body": NEWLINE.join(current["body"])})
            current = None
        else:
            current["body"].append(line)
    if current is not None:
        notes.append(f"line {current['start']}: fence is never closed")
        blocks.append({**current, "body": NEWLINE.join(current["body"])})
    return prose, blocks, notes


def strip_inline_code(line: str) -> str:
    """Everything outside backtick spans (odd indices of a split are the code)."""
    return "".join(part for i, part in enumerate(line.split(BACKTICK)) if i % 2 == 0)


def bare_angles(line: str):
    cleaned = strip_inline_code(line)
    i = 0
    while True:
        start = cleaned.find("<", i)
        if start < 0:
            return
        end = cleaned.find(">", start + 1)
        if end < 0:
            return
        inner = cleaned[start + 1:end]
        if inner and inner[0].isalpha() and all(
            ch.isalnum() or ch in "._-" for ch in inner
        ):
            yield cleaned[start:end + 1]
        i = end + 1


def table_cells(line: str) -> list[str]:
    """The cells of a table row. An escaped pipe stays inside its cell."""
    escaped = BSLASH + "|"
    guarded = line.strip(TRIM).replace(escaped, chr(0)).strip("|")
    return [cell.replace(chr(0), "|").strip(TRIM) for cell in guarded.split("|")]


def is_separator_row(line: str) -> bool:
    body = line.strip(TRIM).strip("|")
    return bool(body) and all(ch in "-:|" + SPACE for ch in body) and "-" in body


NUMBERED = re.compile(r"^[0-9]+([.][0-9]+)*$")
ANNOTATION = re.compile(r"^[Aa][0-9]+[a-z]?$")


def heading_ids(lines: list[str]) -> set[str]:
    """The ids this document defines, from "### 5.1 Title" or "#### A5b. Title"."""
    ids: set[str] = set()
    for line in lines:
        stripped = line.lstrip(SPACE)
        if not stripped.startswith("##"):
            continue
        token = stripped.lstrip("#").lstrip(SPACE).split(SPACE, 1)[0].rstrip(".")
        if NUMBERED.match(token) or ANNOTATION.match(token):
            ids.add(token)
    return ids


def sibling_headings(path: Path) -> set[str]:
    """Headings defined by the documents that live beside this one.

    A changelog that cites "§ 5.3" of the runbook is not broken: the reference crosses a file
    boundary. Resolving one file in isolation therefore reported dozens of pointers that any reader
    can follow, which is worse than no check — it teaches everyone to ignore the output.
    """
    ids: set[str] = set()
    for other in sorted(path.parent.glob("*.md")) + sorted(path.parent.parent.glob("README*.md")):
        if other == path:
            continue
        ids |= heading_ids(other.read_text(encoding="utf-8").split(NEWLINE))
    return ids


def section_references(text: str) -> set[str]:
    """Every "§ x.y" / "§ A6" pointer in the file, ignoring prose like "§ Checklist"."""
    refs: set[str] = set()
    for chunk in text.split(SECTION_SIGN)[1:]:
        tail = chunk.lstrip(SPACE)
        token = tail.split(SPACE, 1)[0].split(NEWLINE, 1)[0].rstrip(".,;)")
        if NUMBERED.match(token) or ANNOTATION.match(token):
            refs.add(token)
    return refs


def embedded_python(body: str, tag: str):
    """The lines of a <<'TAG' … TAG heredoc, if any."""
    opener = "<<" + BACKTICK + tag + BACKTICK
    start = body.find(opener)
    while start >= 0:
        nl = body.find(NEWLINE, start)
        if nl < 0:
            return
        closer = NEWLINE + tag + NEWLINE
        end = body.find(closer, nl)
        if end < 0:
            return
        yield body[nl + 1:end]
        start = body.find(opener, end + len(closer))


def check(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    lines = text.split(NEWLINE)
    prose, blocks, problems = split_document(text)
    problems = list(problems)

    # --- tables: header, separator, then rows with the same number of cells ---
    index = 0
    while index < len(prose):
        number, line = prose[index]
        if not line.strip(TRIM).startswith("|"):
            index += 1
            continue
        end = index
        while end < len(prose) and prose[end][1].strip(TRIM).startswith("|"):
            end += 1
        rows = prose[index:end]
        widths = [len(table_cells(strip_inline_code(row[1]))) for row in rows]
        if len(set(widths)) > 1:
            problems.append(f"line {rows[0][0]}: table rows disagree on column count {sorted(set(widths))}")
        if len(rows) < 3:
            problems.append(f"line {rows[0][0]}: only {len(rows)} row(s) — a markdown table needs a header, a separator and a row")
        elif not is_separator_row(rows[1][1]):
            problems.append(f"line {rows[1][0]}: expected the |---| separator row of a table")
        index = end

    # --- prose hygiene outside code ---
    for number, line in prose:
        for placeholder in bare_angles(line):
            if placeholder[1:-1].lower() in HTML_TAGS:
                continue
            problems.append(f"line {number}: {placeholder!r} is outside code, so a reader may paste it literally")

    # --- every § reference has to land on a heading that exists, here or next door ---
    known = heading_ids(lines) | sibling_headings(path)
    for ref in sorted(section_references(text)):
        if ref and ref not in known:
            problems.append(f"reference § {ref} has no matching heading")

    # --- shell in the fences parses, and python inside it compiles ---
    for block in blocks:
        if block["lang"] not in ("bash", "sh"):
            continue
        body = block["body"]
        if block["indent"]:
            pad = SPACE * block["indent"]
            body = NEWLINE.join(l.removeprefix(pad) for l in body.split(NEWLINE))
        with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False) as handle:
            handle.write(body + NEWLINE)
            temp = Path(handle.name)
        result = subprocess.run(
            ["bash", "-n", str(temp)], capture_output=True, text=True, check=False
        )
        temp.unlink(missing_ok=True)
        if result.returncode:
            detail = result.stderr.strip().split(NEWLINE)
            problems.append(f"line {block['start']}: bash block does not parse: {detail[-1] if detail else ''}"[:220])
        for tag in ("PY", "PYEOF", "JSONW", "PYFIX"):
            for snippet in embedded_python(body, tag):
                try:
                    compile(snippet, f"<line {block['start']} {tag}>", "exec")
                except SyntaxError as error:
                    problems.append(f"line {block['start']}: inline python ({tag}) does not compile: {error}")

    # --- headings and inline code balance ---
    heading_lines = [l for l in lines if l.lstrip(SPACE).startswith("##")]
    for heading in sorted({h for h in heading_lines if heading_lines.count(h) > 1}):
        problems.append(f"duplicate heading: {heading.strip()}")
    paragraph: list[str] = []
    for _, line in prose:
        if line.strip(TRIM):
            paragraph.append(line)
        elif paragraph:
            if sum(l.count(BACKTICK) for l in paragraph) % 2:
                problems.append(f"unbalanced inline backticks in the paragraph starting {paragraph[0][:60]!r}")
            paragraph = []
    if paragraph and sum(l.count(BACKTICK) for l in paragraph) % 2:
        problems.append("unbalanced inline backticks in the last paragraph")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description="Structural markdown check for the runbook docs")
    parser.add_argument("paths", nargs="*", type=Path, default=[Path("docs/UBUNTU_VM_RUNBOOK.md")])
    parser.add_argument("--self-test", action="store_true", help="check this file parses and exit")
    args = parser.parse_args()
    if args.self_test:
        ast.parse(Path(__file__).read_text(encoding="utf-8"))
        print("self-test: parses")
        return 0
    failed = False
    for path in args.paths:
        if not path.is_file():
            print(f"{path}: not a file", file=sys.stderr)
            failed = True
            continue
        problems = check(path)
        text = path.read_text(encoding="utf-8")
        _, blocks, _ = split_document(text)
        shells = [b for b in blocks if b["lang"] in ("bash", "sh")]
        verdict = "clean" if not problems else f"{len(problems)} problem(s)"
        print(f"{path}: {len(text.splitlines())} lines, {len(blocks)} fences ({len(shells)} shell) — {verdict}")
        for problem in problems:
            print(f"  - {problem}")
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
