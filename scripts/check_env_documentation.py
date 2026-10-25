#!/usr/bin/env python3
"""Ensure the committed active env template and operator key table stay in lockstep.

Only committed files are inspected. Never open .env (it can contain credentials).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_ENTRY = re.compile(r"^([A-Z][A-Z0-9_]*)=", re.MULTILINE)
DOC_ENTRY = re.compile(r"^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|", re.MULTILINE)


def duplicate_names(names):
    seen = set()
    duplicates = set()
    for name in names:
        if name in seen:
            duplicates.add(name)
        seen.add(name)
    return duplicates


def validate(template, documentation):
    keys = TEMPLATE_ENTRY.findall(template)
    documented = DOC_ENTRY.findall(documentation)
    problems = []
    for label, names in (("template", keys), ("reference", documented)):
        if duplicate_names(names):
            problems.append(f"duplicate {label} entries: {', '.join(sorted(duplicate_names(names)))}")
    missing = set(keys) - set(documented)
    unexpected = set(documented) - set(keys)
    if missing:
        problems.append(f"missing reference rows: {', '.join(sorted(missing))}")
    if unexpected:
        problems.append(f"reference rows not in template: {', '.join(sorted(unexpected))}")
    for name in ("SOS_REQUEST_AUTO_EXPIRE_HOURS", "MISSION_STATUS_TIMEOUT_HOURS"):
        if name in keys:
            problems.append(f"{name} is a planned but unused setting, not active configuration")
    for name in ("VITE_API_URL", "VITE_MAP_URL"):
        values = re.findall(rf"^{name}=(.*)$", template, re.MULTILINE)
        if values and (not values[0].startswith("/") or values[0].startswith("//")):
            problems.append(f"{name} must remain a same-origin path")
    return problems


def main():
    template = (ROOT / ".env.example").read_text(encoding="utf-8")
    docs = (ROOT / "docs/ENVIRONMENT.md").read_text(encoding="utf-8")
    problems = validate(template, docs)
    if problems:
        for problem in problems:
            print(f"env documentation: {problem}", file=sys.stderr)
        return 1
    print(f"env documentation: {len(TEMPLATE_ENTRY.findall(template))} active keys documented exactly once")
    return 0


if __name__ == "__main__":
    sys.exit(main())
