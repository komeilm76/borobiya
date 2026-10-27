#!/usr/bin/env python3
"""Print unchecked task work; verify the human-curated stage summary stays in sync.

Only docs/TASKS.md is read. 'Not started' is about the named work or acceptance run,
not a claim that its prerequisite implementation has never been written.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

TASKS = Path(__file__).resolve().parent.parent / "docs/TASKS.md"
TASK_LINE = re.compile(r"^- \[([ x])\] \*\*((?:T\d+\.\d+\.\d+|P\d+-[A-Z]\d+))(?=\s|\*)", re.MULTILINE)
BEGIN = "<!-- open-tasks:begin -->"
END = "<!-- open-tasks:end -->"
ROW = re.compile(r"^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$")
STAGES = {"Not started", "Partial"}


def parse_open_tasks(document: str) -> list[str]:
    return [task_id for mark, task_id in TASK_LINE.findall(document) if mark == " "]


def inventory_rows(document: str) -> tuple[list[tuple[str, str, str]], list[str]]:
    if document.count(BEGIN) != 1 or document.count(END) != 1 or document.index(BEGIN) > document.index(END):
        return [], ["missing or duplicated open-task summary markers"]
    section = document.split(BEGIN, 1)[1].split(END, 1)[0]
    rows = []
    problems = []
    for line in section.splitlines():
        if not line.startswith("| `"):
            continue
        match = ROW.fullmatch(line)
        if not match:
            problems.append(f"malformed summary row: {line}")
            continue
        task_id, state, remaining = (part.strip() for part in match.groups())
        if state not in STAGES:
            problems.append(f"invalid state for {task_id}: {state}")
            continue
        rows.append((task_id, state, remaining))
    return rows, problems


def validate_inventory(document: str) -> list[str]:
    rows, problems = inventory_rows(document)
    tracked = TASK_LINE.findall(document)
    open_ids = [task_id for mark, task_id in tracked if mark == " "]
    completed_ids = {task_id for mark, task_id in tracked if mark == "x"}
    if len(open_ids) != len(set(open_ids)):
        problems.append("duplicate unchecked task IDs")
    seen = set()
    for task_id, _state, _remaining in rows:
        if task_id in seen:
            problems.append(f"duplicate summary row: {task_id}")
        seen.add(task_id)
        if task_id in completed_ids:
            problems.append(f"completed task in open summary: {task_id}")
        elif task_id not in open_ids:
            problems.append(f"unknown task in open summary: {task_id}")
    for task_id in open_ids:
        if task_id not in seen:
            problems.append(f"missing open task from summary: {task_id}")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate the status table without printing it")
    args = parser.parse_args()
    document = TASKS.read_text(encoding="utf-8")
    problems = validate_inventory(document)
    if problems:
        for problem in problems:
            print(f"open tasks: {problem}")
        return 1
    rows, _ = inventory_rows(document)
    print(f"Open tasks: {len(rows)} ({sum(state == 'Partial' for _, state, _ in rows)} partial; "
          f"{sum(state == 'Not started' for _, state, _ in rows)} not started)")
    if not args.check:
        for task_id, state, remaining in rows:
            print(f"{task_id}: {state} — {remaining}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
