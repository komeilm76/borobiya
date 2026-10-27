#!/usr/bin/env python3
"""Unit tests for scripts/setup-ubuntu-vm.sh's set_env() — run: python3 -m unittest scripts.test_env_writer

The claim under test is about a *value*, not a key: the setup script writes user-supplied paths and
generated secrets into `.env`, and the first implementation interpolated them straight into a sed
replacement expression. Two characters then changed the meaning of the write — `&` expanded to the
whole match, so `/data/R&D/maps` became `/data/RMAP_LIBRARY_DIR=/data/R/maps&/maps` — and one
character stopped it working at all, because `|` was the delimiter: sed died with "unknown option to
`s`", `.env` kept its old value, and `set -e` turned a library path into an aborted setup run with a
bare sed error as the only clue.

`set_env` lives inside a script that otherwise wants Docker, apt and a network, so the test lifts the
function body out by name and runs it in a bash subshell with the two helpers it uses (`note`,
`fail`) stubbed. That keeps the test honest about the shipped code: if the function's text changes,
the extraction still finds it by name, and if the function is deleted the test fails loudly.
"""

from __future__ import annotations

import os
import re
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().with_name("setup-ubuntu-vm.sh")

PREAMBLE = """
set -euo pipefail
note() { printf '    %s\\n' "$*"; }
fail() { printf 'setup-ubuntu-vm: %s\\n' "$*" >&2; exit 1; }
DRY_RUN=0
@@SET_ENV@@
"""


def build_script(body: str, *, dry_run: bool = False) -> str:
    """Glue the extracted function into a runnable snippet without %-formatting the body.

    The body itself is full of `%s` (both helpers printf), so it can never be used as a format
    string; a sentinel replace is the only safe way to splice it in.
    """
    script = PREAMBLE.replace("@@SET_ENV@@", body)
    if dry_run:
        script = script.replace("DRY_RUN=0", "DRY_RUN=1")
    return script


def extract_function(name: str) -> str:
    """Return the whole `name() { … }` block from the setup script, by brace depth."""
    lines = SCRIPT.read_text(encoding="utf-8").splitlines()
    start = next((i for i, line in enumerate(lines) if re.match(rf"^{name}\(\) \{{$", line)), None)
    if start is None:
        raise AssertionError(f"{name}() not found in {SCRIPT.name}; was it renamed or removed?")
    depth = 0
    for offset, line in enumerate(lines[start:], start=start):
        depth += line.count("{") - line.count("}")
        if depth == 0 and offset > start:
            return "\n".join(lines[start : offset + 1])
    raise AssertionError(f"{name}() has no closing brace in {SCRIPT.name}")


def run_set_env(env_dir: Path, key: str, value: str) -> subprocess.CompletedProcess[str]:
    script = build_script(extract_function("set_env")) + f'\nset_env {key} "$1"\n'
    return subprocess.run(
        ["bash", "-c", script, "set_env-test", value],
        cwd=env_dir,
        capture_output=True,
        text=True,
        check=False,
    )


def read_line(env_dir: Path, key: str) -> str | None:
    for line in (env_dir / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1]
    return None


class SetEnvValueTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.env_dir = Path(self._tmp.name)
        (self.env_dir / ".env").write_text(
            "MAP_LIBRARY_DIR=/old/path\nOTHER_KEY=keep-me\n", encoding="utf-8"
        )
        os.chmod(self.env_dir / ".env", 0o600)
        self.addCleanup(self._tmp.cleanup)

    def write(self, key: str, value: str) -> None:
        result = run_set_env(self.env_dir, key, value)
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertEqual(result.stderr, "", msg="set_env should not print warnings")

    def test_new_env_is_written_privately_before_it_becomes_visible(self) -> None:
        source = extract_function("set_env")
        self.assertNotIn('"$value" > .env', source)
        (self.env_dir / ".env").unlink()
        self.write("JWT_SECRET", "test-secret")
        self.assertEqual(stat.S_IMODE((self.env_dir / ".env").stat().st_mode), 0o600)

    def test_setup_checks_env_before_sourcing_including_on_dry_run(self) -> None:
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertLess(source.index('[[ ! -L .env ]] || fail'), source.index('source .env; set +a'))
        self.assertLess(source.index('[[ ! -e .env || -f .env ]] || fail'), source.index('source .env; set +a'))

    def test_refuses_symlinked_env_without_touching_target(self) -> None:
        target = self.env_dir / "other-secret"
        target.write_text("important\n", encoding="utf-8")
        (self.env_dir / ".env").unlink()
        (self.env_dir / ".env").symlink_to(target)
        result = run_set_env(self.env_dir, "MAP_REGION_IDS", "ir-tehran")
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((self.env_dir / ".env").is_symlink())
        self.assertEqual(target.read_text(encoding="utf-8"), "important\n")

    def test_refuses_dangling_env_symlink_without_creating_target(self) -> None:
        target = self.env_dir / "missing-secret"
        (self.env_dir / ".env").unlink()
        (self.env_dir / ".env").symlink_to(target)
        result = run_set_env(self.env_dir, "POSTGRES_PASSWORD", "test-secret")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(target.exists())

    def test_refuses_directory_named_env_without_writing_inside_it(self) -> None:
        (self.env_dir / ".env").unlink()
        (self.env_dir / ".env").mkdir()
        result = run_set_env(self.env_dir, "JWT_SECRET", "not-for-a-directory")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(list((self.env_dir / ".env").iterdir()), [])

    def test_dry_run_never_prints_secrets(self) -> None:
        script = build_script(extract_function("set_env"), dry_run=True) + '\nset_env POSTGRES_PASSWORD "$1"\nset_env DATABASE_URL "$2"\n'
        result = subprocess.run(["bash", "-c", script, "dry-run", "test-secret", "postgresql://user:test-secret@localhost/db"],
                                cwd=self.env_dir, capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("test-secret", result.stdout + result.stderr)
        self.assertEqual(read_line(self.env_dir, "MAP_LIBRARY_DIR"), "/old/path")

    def test_value_with_ampersand_is_written_literally(self) -> None:
        self.write("MAP_LIBRARY_DIR", "/data/R&D/maps")
        self.assertEqual(read_line(self.env_dir, "MAP_LIBRARY_DIR"), "/data/R&D/maps")

    def test_value_with_the_old_sed_delimiter_does_not_break_the_write(self) -> None:
        self.write("MAP_LIBRARY_DIR", "/mnt/share|library/maps")
        self.assertEqual(read_line(self.env_dir, "MAP_LIBRARY_DIR"), "/mnt/share|library/maps")

    def test_value_with_backslash_and_dollar_is_not_reinterpreted(self) -> None:
        self.write("MAP_LIBRARY_DIR", "/srv/a\\b$HOME/c\\n")
        self.assertEqual(read_line(self.env_dir, "MAP_LIBRARY_DIR"), "/srv/a\\b$HOME/c\\n")

    def test_unrelated_keys_and_order_survive(self) -> None:
        self.write("MAP_LIBRARY_DIR", "/new/path")
        body = (self.env_dir / ".env").read_text(encoding="utf-8")
        self.assertIn("OTHER_KEY=keep-me", body)
        self.assertEqual(len(body.splitlines()), 2, msg="must not grow a duplicate key per call")

    def test_a_key_that_is_absent_is_appended_once(self) -> None:
        for _ in range(3):
            self.write("MAP_SNAPSHOT_DATE", "2026-10-18")
        body = (self.env_dir / ".env").read_text(encoding="utf-8")
        self.assertEqual(body.count("MAP_SNAPSHOT_DATE="), 1, msg=body)
        self.assertEqual(read_line(self.env_dir, "MAP_SNAPSHOT_DATE"), "2026-10-18")

    def test_a_commented_assignment_is_uncommented_in_place(self) -> None:
        (self.env_dir / ".env").write_text("# MAP_BBOX=1,2,3,4\nX=1\n", encoding="utf-8")
        self.write("MAP_BBOX", "5,6,7,8")
        self.assertEqual(read_line(self.env_dir, "MAP_BBOX"), "5,6,7,8")
        self.assertNotIn("# MAP_BBOX=", (self.env_dir / ".env").read_text(encoding="utf-8"))

    def test_no_temp_file_is_left_behind(self) -> None:
        self.write("MAP_LIBRARY_DIR", "/a")
        self.assertEqual(
            [p.name for p in self.env_dir.iterdir()],
            [".env"],
            msg="the atomic rewrite must clean up after itself",
        )

    def test_secrets_keep_the_file_private(self) -> None:
        # The rewrite replaces .env through a temp file; if that temp file were world-readable for
        # a moment, or the rename handed back 0644, a generated password would be exposed to every
        # local user on the VM.
        self.write("POSTGRES_PASSWORD", "hunter2")
        mode = stat.S_IMODE(os.stat(self.env_dir / ".env").st_mode)
        self.assertEqual(mode, 0o600, msg=f".env ended up with mode {oct(mode)}")

    def test_created_file_is_private(self) -> None:
        (self.env_dir / ".env").unlink()
        self.write("JWT_SECRET", "abc123")
        mode = stat.S_IMODE(os.stat(self.env_dir / ".env").st_mode)
        self.assertEqual(mode, 0o600, msg=f"a freshly created .env had mode {oct(mode)}")

    def test_the_env_file_is_created_with_private_perms_by_setup(self) -> None:
        # The other half of the same guarantee: the copy from .env.example must not inherit the
        # process umask, because secrets are written into it a few lines later.
        body = SCRIPT.read_text(encoding="utf-8")
        self.assertIn(
            "install -m 600 .env.example .env",
            body,
            msg="`.env` is created with `cp`, so a 0644 umask puts generated secrets on every "
            "local user's readable list",
        )

    def test_dry_run_writes_nothing(self) -> None:
        script = build_script(extract_function("set_env"), dry_run=True)
        script += '\nset_env MAP_LIBRARY_DIR "/a&b"\n'
        result = subprocess.run(
            ["bash", "-c", script, "set_env-test", "/a&b"],
            cwd=self.env_dir,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("would set", result.stdout)
        self.assertEqual(read_line(self.env_dir, "MAP_LIBRARY_DIR"), "/old/path")


if __name__ == "__main__":
    unittest.main()
