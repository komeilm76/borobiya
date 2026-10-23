#!/usr/bin/env bash
# Repository-wide static hygiene battery: shell syntax, ShellCheck across both
# `scripts/` and `map-server/scripts/`, Ruff across both Python script trees,
# and structural validation of every Markdown document.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd -- "$REPO_ROOT"

shopt -s nullglob
shell_scripts=(scripts/*.sh map-server/scripts/*.sh)
markdown_files=(docs/*.md README.md)

bash -n "${shell_scripts[@]}"
shellcheck -S warning "${shell_scripts[@]}"
ruff check --select E4,E7,E9,F,W,I,B,EXE,PLW1510 scripts map-server/scripts
python3 scripts/check_runbook_markdown.py "${markdown_files[@]}"
