#!/usr/bin/env python3
"""Tests for scripts/setup-ubuntu-vm.sh's database-credential block — run: python3 scripts/test_setup_db_passwords.py

The block is about three values that can disagree. ``POSTGRES_PASSWORD`` in `.env` is what Compose
interpolates into the API's ``DATABASE_URL``; the *running container*'s environment is what the
postgres healthcheck authenticates with; and the role inside ``postgres-data`` keeps whatever it was
created with, forever, because the image only applies ``POSTGRES_PASSWORD`` at first init. A machine
can therefore print ``postgres: healthy`` and still answer the migration with ``28P01: password
authentication failed for user "borobiya"`` — which is exactly how a user ended up with a broken setup
after hand-editing `.env`, with a password containing a ``#`` that a URL cannot carry.

So the script asks for both database passwords (Enter generates a URL-safe one), writes the password
and the matching ``DATABASE_URL`` through the same writer that protects paths with ``&`` and ``|``,
refuses any value that a connection URL cannot round-trip, and probes the credential before the hours
of map work — offering ``ALTER USER`` (which loses nothing) when the volume outlived its password.

These tests exercise the real functions lifted out of the shipped script, against a fake ``docker`` on
PATH that behaves like the Postgres image: it authenticates a probe URL against the role password in a
state file, applies an ``ALTER USER`` it receives on stdin, and records every argv it was called with so
that "the password never travels as an argument" is a checked claim, not a comment.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().with_name("setup-ubuntu-vm.sh")

PREAMBLE = """
set -euo pipefail
log() { printf '\\n==> %s\\n' "$*"; }
note() { printf '    %s\\n' "$*"; }
fail() { printf 'setup-ubuntu-vm: %s\\n' "$*" >&2; exit 1; }
DRY_RUN=0
INTERACTIVE=0
INPUT_FD=0
@@FUNCS@@
"""

STUB_SOURCE = SCRIPT.with_name("fake_docker_for_tests.py")


def extract_function(name: str) -> str:
    """Return the whole `name() { ... }` block from the setup script, by brace depth."""
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


FUNCTIONS = (
    "set_env",
    "env_value",
    "db_password_problem",
    "valid_db_password",
    "new_db_password",
    "ask_db_secret",
    "compose_volume_exists",
    "alter_sql_for",
    "psql_in_postgres",
    "apply_alter_sql",
    "set_database_passwords",
    "check_database_credentials",
)


class SetupOutputSafetyTests(unittest.TestCase):
    def test_setup_never_prints_generated_admin_secret_at_completion(self) -> None:
        source = SCRIPT.read_text(encoding="utf-8")
        completion = source.split('log "Setup complete"', 1)[1]
        self.assertNotIn('${ADMIN_SEED_PASSWORD}', completion)
        self.assertNotIn('reset-admin-password.ts \'<new-password>\'', completion)
        self.assertIn('scripts/vm.py admin-password', completion)


class Fixture(unittest.TestCase):
    """A temp directory with `.env`, the script's functions, and a fake docker on PATH."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.state = self.root / "state"
        self.state.mkdir()
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        # The fake docker is a real file in this directory rather than a string here, because a stub
        # nested inside a python string has to survive one more round of escaping than its assertions
        # can notice — a `\.` or `\n` that outlives the quoting silently makes the fake behave unlike
        # the real thing while every test still passes.
        assert STUB_SOURCE.exists(), "the fake docker is missing from scripts/"
        stub = bin_dir / "docker"
        # copied and made executable rather than symlinked: what the test needs is a file PATH can find
        # and the kernel will run, and the source's mode bit is not something a checkout guarantees.
        shutil.copyfile(STUB_SOURCE, stub)
        stub.chmod(0o755)
        script = PREAMBLE.replace("@@FUNCS@@", "\n\n".join(extract_function(n) for n in FUNCTIONS))
        self.script = self.root / "run.sh"
        self.script.write_text(script, encoding="utf-8")

    def env(self, text: str) -> None:
        (self.root / ".env").write_text(text, encoding="utf-8")

    def read_env(self, key: str) -> str | None:
        path = self.root / ".env"
        if not path.exists():
            return None
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1]
        return None

    def role_password(self, value: str) -> None:
        (self.state / "role_password").write_text(value, encoding="utf-8")

    def container_password(self, value: str) -> None:
        (self.state / "container_password").write_text(value, encoding="utf-8")

    def postgres_running(self, value: str = "cid123") -> None:
        (self.state / "postgres.running").write_text(value, encoding="utf-8")

    def api_running(self, database_url: str | None = None) -> None:
        """The API container exists; with a URL, it is the DATABASE_URL Compose interpolated for it."""
        (self.state / "api.running").write_text("cidapi", encoding="utf-8")
        if database_url is not None:
            (self.state / "api_database_url").write_text(database_url, encoding="utf-8")

    def superuser(self, name: str) -> None:
        """Which role the container's local socket will let in as superuser."""
        (self.state / "superuser").write_text(name, encoding="utf-8")

    def volume(self, name: str = "postgres_data.volume") -> None:
        (self.state / name).write_text("", encoding="utf-8")

    def calls(self) -> list[list[str]]:
        import json

        path = self.state / "calls"
        if not path.exists():
            return []
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]

    def invoke(
        self,
        command: str,
        *,
        stdin: str = "",
        interactive: bool = False,
        dry_run: bool = False,
        with_docker: bool = True,
        extra_env: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        env = {
            "PATH": (str(self.root / "bin") + ":" if with_docker else "") + os.environ["PATH"],
            "STUB_STATE": str(self.state),
            "HOME": str(self.root),
        }
        env.update(extra_env or {})
        script = self.script.read_text(encoding="utf-8")
        if interactive:
            script = script.replace("INTERACTIVE=0", "INTERACTIVE=1")
        if dry_run:
            script = script.replace("DRY_RUN=0", "DRY_RUN=1")
        return subprocess.run(
            ["bash", "-c", script + "\n" + command, "db-creds-test"],
            cwd=self.root,
            input=stdin,
            capture_output=True,
            text=True,
            env=env,
            # Every caller asserts on the status itself, because a refused prompt, a refused write and a
            # crash are three different expected outcomes here; `check=True` could only test one of them.
            check=False,
        )

    def assert_ok(self, result: subprocess.CompletedProcess[str]) -> None:
        self.assertEqual(result.returncode, 0, f"stdout={result.stdout}\nstderr={result.stderr}")


class PasswordPolicyTests(Fixture):
    def test_only_url_safe_characters_are_accepted(self) -> None:
        for value in ("Hex-Ok_1.2~3", "a" * 48, "Ab1" + "-" * 20):
            result = self.invoke(f"if valid_db_password {value!r}; then echo yes; else echo no; fi")
            self.assert_ok(result)
            self.assertEqual(result.stdout.strip(), "yes", value)

    def test_characters_a_url_would_reinterpret_are_refused(self) -> None:
        # Measured: urlsplit() of postgresql://u:pa#ss@h/db hands back an empty password, because the
        # fragment swallows the authority. '/' and '?' end the userinfo, '%' promises an escape, and
        # brackets stop the parser outright. All of them authenticate fine as a separate variable, which
        # is what makes the resulting failure look impossible.
        for value in ("pa#ss", "pa/ss", "pa@ss", "pa:ss", "pa ss", "pa%41ss", "pa[ss]", "pàss"):
            result = self.invoke(f"if valid_db_password {value!r}; then echo yes; else echo no; fi")
            self.assert_ok(result)
            self.assertEqual(result.stdout.strip(), "no", value)

    def test_too_short_and_too_long_are_refused(self) -> None:
        for value in ("", "Short1", "a" * 11, "a" * 129):
            result = self.invoke(f"if valid_db_password {value!r}; then echo yes; else echo no; fi")
            self.assert_ok(result)
            self.assertEqual(result.stdout.strip(), "no", repr(value))

    def test_the_reason_follows_the_key_name_in_the_message(self) -> None:
        cases = {
            "": "is empty",
            "change-me": "still the placeholder",
            "replace-with-a-random-password": "still the placeholder",
            "pa#ssword": "connection URL",
            "abcdefghijklmnop": "",
        }
        for value, expected in cases.items():
            result = self.invoke(f'printf "<%s>" "$(db_password_problem {value!r})"')
            self.assert_ok(result)
            self.assertIn(expected, result.stdout, repr(value))

    def test_a_weak_but_working_password_is_not_an_emergency(self) -> None:
        # db_password_problem has no length rule on purpose: refusing to *continue* over a 6-character
        # password that already authenticates would break working machines for a style opinion.
        result = self.invoke('printf "<%s>" "$(db_password_problem abc123)"')
        self.assert_ok(result)
        self.assertEqual(result.stdout, "<>")

    def test_generated_passwords_are_url_safe_and_long(self) -> None:
        result = self.invoke('p="$(new_db_password)"; if valid_db_password "$p"; then echo "${#p}"; fi')
        self.assert_ok(result)
        self.assertEqual(result.stdout.strip(), "48")


class EnvValueTests(Fixture):
    def test_reads_the_file_not_the_shell(self) -> None:
        self.env("POSTGRES_PASSWORD=from-the-file\nOTHER=1\n")
        result = self.invoke("env_value POSTGRES_PASSWORD", extra_env={"POSTGRES_PASSWORD": "stale-export"})
        self.assert_ok(result)
        self.assertEqual(result.stdout, "from-the-file\n")

    def test_an_absent_key_prints_nothing_and_does_not_fail(self) -> None:
        self.env("POSTGRES_PASSWORD=x\n")
        result = self.invoke('printf "<%s>" "$(env_value NOMINATIM_PASSWORD)"')
        self.assert_ok(result)
        self.assertEqual(result.stdout, "<>")

    def test_a_missing_env_file_is_not_fatal(self) -> None:
        result = self.invoke('printf "<%s>" "$(env_value POSTGRES_PASSWORD)"')
        self.assert_ok(result)
        self.assertEqual(result.stdout, "<>")

    def test_a_value_containing_equals_signs_survives(self) -> None:
        self.env("POSTGRES_PASSWORD=a=b=c\n")
        result = self.invoke("env_value POSTGRES_PASSWORD")
        self.assert_ok(result)
        self.assertEqual(result.stdout, "a=b=c\n")


class AlterSqlTests(Fixture):
    def test_a_quote_in_the_password_cannot_end_the_literal(self) -> None:
        result = self.invoke('alter_sql_for borobiya "o\'brien#1"')
        self.assert_ok(result)
        self.assertEqual(result.stdout, 'ALTER USER "borobiya" WITH PASSWORD \'o\'\'brien#1\';\n')

    def test_a_quote_in_the_role_name_cannot_end_the_identifier(self) -> None:
        result = self.invoke('alter_sql_for \'we"ird\' abcdefghijkl')
        self.assert_ok(result)
        self.assertEqual(result.stdout, 'ALTER USER "we""ird" WITH PASSWORD \'abcdefghijkl\';\n')


class PromptTests(Fixture):
    def test_enter_generates_and_both_keys_and_the_url_agree(self) -> None:
        self.env("POSTGRES_USER=borobiya\nPOSTGRES_DB=borobiya\nPOSTGRES_PORT=5432\n")
        result = self.invoke("set_database_passwords ask", stdin="\n\n", interactive=True)
        self.assert_ok(result)
        postgres = self.read_env("POSTGRES_PASSWORD") or ""
        nominatim = self.read_env("NOMINATIM_PASSWORD") or ""
        for value in (postgres, nominatim):
            self.assertRegex(value, r"^[A-Za-z0-9._~-]{48}$")
        self.assertNotEqual(postgres, nominatim, "one blank line answers one prompt, not both")
        self.assertEqual(
            self.read_env("DATABASE_URL"), f"postgresql://borobiya:{postgres}@localhost:5432/borobiya"
        )

    def test_the_two_answers_may_differ_and_the_url_follows_the_postgres_one(self) -> None:
        self.env("POSTGRES_USER=app\nPOSTGRES_DB=maindb\nPOSTGRES_PORT=5432\n")
        result = self.invoke(
            "set_database_passwords ask", stdin="Nominatim-Secret_9\nApp-Secret_2x\n", interactive=True
        )
        self.assert_ok(result)
        self.assertEqual(self.read_env("NOMINATIM_PASSWORD"), "Nominatim-Secret_9")
        self.assertEqual(self.read_env("POSTGRES_PASSWORD"), "App-Secret_2x")
        self.assertEqual(self.read_env("DATABASE_URL"), "postgresql://app:App-Secret_2x@localhost:5432/maindb")

    def test_a_rejected_answer_is_asked_again_rather_than_written(self) -> None:
        self.env("POSTGRES_USER=borobiya\nPOSTGRES_DB=borobiya\nPOSTGRES_PORT=5432\n")
        # First answer needs a URL-hostile character, second is left blank -> generated.
        result = self.invoke(
            "set_database_passwords ask", stdin="bad#password\n\nokpassword1_\n\n", interactive=True
        )
        self.assert_ok(result)
        self.assertIn("12-128 characters of A-Z a-z 0-9 . _ ~ -", result.stderr)
        # Nominatim: the first answer was refused, so the blank second line generated one. Postgres: the
        # accepted answer is stored exactly as typed, and the URL is built from it.
        self.assertRegex(self.read_env("NOMINATIM_PASSWORD") or "", r"^[A-Za-z0-9._~-]{48}$")
        self.assertEqual(self.read_env("POSTGRES_PASSWORD"), "okpassword1_")
        self.assertEqual(
            self.read_env("DATABASE_URL"), "postgresql://borobiya:okpassword1_@localhost:5432/borobiya"
        )

    def test_non_interactive_runs_generate_without_reading_stdin(self) -> None:
        self.env("POSTGRES_USER=borobiya\nPOSTGRES_DB=borobiya\nPOSTGRES_PORT=5432\n")
        result = self.invoke("set_database_passwords ask")
        self.assert_ok(result)
        self.assertRegex(self.read_env("POSTGRES_PASSWORD") or "", r"^[A-Za-z0-9._~-]{48}$")
        self.assertNotIn("[Enter = generate", result.stdout)

    def test_a_created_env_file_is_private(self) -> None:
        result = self.invoke("set_database_passwords ask")
        self.assert_ok(result)
        self.assertEqual(self.root.joinpath(".env").stat().st_mode & 0o777, 0o600)

    def test_dry_run_writes_nothing(self) -> None:
        self.env("POSTGRES_PASSWORD=change-me\nNOMINATIM_PASSWORD=replace-me\n")
        before = (self.root / ".env").read_text(encoding="utf-8")
        result = self.invoke("set_database_passwords keep", dry_run=True)
        self.assert_ok(result)
        self.assertIn("would ask", result.stdout)
        self.assertEqual((self.root / ".env").read_text(encoding="utf-8"), before)


class KeepModeTests(Fixture):
    def test_a_working_password_is_left_alone(self) -> None:
        self.env(
            "POSTGRES_USER=borobiya\nPOSTGRES_DB=borobiya\nPOSTGRES_PORT=5432\n"
            "POSTGRES_PASSWORD=Working-Pass_1\nNOMINATIM_PASSWORD=Other-Pass_123\n"
        )
        self.volume()
        result = self.invoke("set_database_passwords keep")
        self.assert_ok(result)
        self.assertIn("reusing the database passwords", result.stdout)
        self.assertEqual(self.read_env("POSTGRES_PASSWORD"), "Working-Pass_1")
        self.assertEqual(self.calls(), [])

    def test_a_placeholder_with_an_existing_volume_is_refused_not_rotated(self) -> None:
        # Rotating here is what creates the reported symptom: the role keeps the old password and .env
        # now confidently says something else.
        self.env(
            "POSTGRES_USER=borobiya\nPOSTGRES_DB=borobiya\nPOSTGRES_PORT=5432\n"
            "POSTGRES_PASSWORD=change-me\nNOMINATIM_PASSWORD=nominatim-works_1\n"
        )
        self.volume()
        result = self.invoke("set_database_passwords keep")
        self.assertEqual(result.returncode, 1)
        self.assertIn("will not write a new password over it", result.stderr)
        self.assertEqual(self.read_env("POSTGRES_PASSWORD"), "change-me")

    def test_a_url_hostile_password_with_an_existing_volume_is_refused(self) -> None:
        self.env(
            "POSTGRES_USER=borobiya\nPOSTGRES_DB=borobiya\nPOSTGRES_PORT=5432\n"
            "POSTGRES_PASSWORD=pa#ssword\nNOMINATIM_PASSWORD=nominatim-works_1\n"
        )
        self.volume()
        result = self.invoke("set_database_passwords keep")
        self.assertEqual(result.returncode, 1)
        self.assertIn("contains characters a connection URL cannot carry", result.stdout)
        self.assertIn("POSTGRES_PASSWORD cannot be used", result.stderr)

    def test_without_a_volume_a_placeholder_is_asked_for(self) -> None:
        self.env(
            "POSTGRES_USER=borobiya\nPOSTGRES_DB=borobiya\nPOSTGRES_PORT=5432\n"
            "POSTGRES_PASSWORD=change-me\nNOMINATIM_PASSWORD=replace-with-a-random-password\n"
        )
        result = self.invoke("set_database_passwords keep", stdin="\n\n", interactive=True)
        self.assert_ok(result)
        self.assertIn("no database volume is initialized yet", result.stdout)
        self.assertRegex(self.read_env("POSTGRES_PASSWORD") or "", r"^[A-Za-z0-9._~-]{48}$")

    def test_no_docker_daemon_degrades_to_a_note(self) -> None:
        # A host without docker must still get the warning and still get on with the run: only the
        # "may the password be rotated?" question needs a daemon, and that question is then left open.
        minimal = self.root / "nodocker"
        minimal.mkdir()
        for source in ("/usr/bin", "/bin", "/usr/local/bin"):
            if not Path(source).is_dir():
                continue
            for name in os.listdir(source):
                if name == "docker":
                    continue
                target = minimal / name
                if not target.exists():
                    target.symlink_to(Path(source) / name)
        self.env("POSTGRES_PASSWORD=change-me\nNOMINATIM_PASSWORD=x\n")
        result = self.invoke(
            "set_database_passwords keep", with_docker=False, extra_env={"PATH": str(minimal)}
        )
        self.assert_ok(result)
        self.assertIn("deciding that needs a Docker daemon", result.stdout)
        self.assertIn("POSTGRES_PASSWORD is still the placeholder", result.stdout)


class VolumeLookupTests(Fixture):
    def test_an_unreadable_project_name_refuses_to_guess(self) -> None:
        # The stub answers `compose config` with valid JSON; make it answer with an error instead.
        (self.state / "fail_config").write_text("1", encoding="utf-8")
        result = self.invoke("if compose_volume_exists postgres-data; then echo yes; else echo no; fi")
        self.assertEqual(result.returncode, 1)
        self.assertIn("refusing to decide about the database password", result.stderr)

    def test_no_volume_is_a_silent_no(self) -> None:
        result = self.invoke("if compose_volume_exists postgres-data; then echo yes; else echo no; fi")
        self.assert_ok(result)
        self.assertEqual(result.stdout.strip(), "no")

    def test_the_volume_of_this_project_is_a_yes(self) -> None:
        self.volume()
        result = self.invoke("if compose_volume_exists postgres-data; then echo yes; else echo no; fi")
        self.assert_ok(result)
        self.assertEqual(result.stdout.strip(), "yes")
        # ...and the filters are what scoped it, not a name grep.
        volume_call = next(call for call in self.calls() if call[:1] == ["volume"])
        self.assertTrue(any("com.docker.compose.project=borobiya" in part for part in volume_call), volume_call)


class CredentialProbeTests(Fixture):
    BASE_ENV = (
        "POSTGRES_USER=borobiya\nPOSTGRES_DB=borobiya\nPOSTGRES_PORT=5432\n"
        "NOMINATIM_PASSWORD=nominatim-works_1\n"
    )

    def test_a_matching_password_needs_no_change(self) -> None:
        self.env(self.BASE_ENV + "POSTGRES_PASSWORD=Same-Everywhere_1\n")
        self.postgres_running()
        self.role_password("Same-Everywhere_1")
        self.container_password("Same-Everywhere_1")
        result = self.invoke("check_database_credentials")
        self.assert_ok(result)
        self.assertIn("the password in .env authenticates", result.stdout)
        self.assertEqual([c for c in self.calls() if c[:2] == ["compose", "up"]], [])
        self.assertEqual([c for c in self.calls() if "psql -U postgres" in " ".join(c)], [])

    def test_a_volume_that_outlived_its_password_is_reconciled_after_asking(self) -> None:
        # .env and the container agree, the role does not: the shape a machine has after .env is
        # regenerated (or a volume is restored) underneath a running stack.
        self.env(self.BASE_ENV + "POSTGRES_PASSWORD=New-In-Dot-Env_1\n")
        self.postgres_running()
        self.role_password("Old-On-Disk_123")
        self.container_password("New-In-Dot-Env_1")
        self.volume()
        result = self.invoke("check_database_credentials", stdin="y\n", interactive=True)
        self.assert_ok(result)
        self.assertIn("The database rejects the password in .env", result.stdout)
        self.assertIn("verified: .env's password now authenticates", result.stdout)
        self.assertEqual((self.state / "alter.sql").read_text(encoding="utf-8").strip(),
                         'ALTER USER "borobiya" WITH PASSWORD \'New-In-Dot-Env_1\';')
        self.assertEqual(self.role_password_read(), "New-In-Dot-Env_1")
        # Nothing about .env had to change: the file was already the intended truth.
        self.assertEqual(self.read_env("POSTGRES_PASSWORD"), "New-In-Dot-Env_1")

    def test_declining_the_offer_changes_nothing(self) -> None:
        self.env(self.BASE_ENV + "POSTGRES_PASSWORD=New-In-Dot-Env_1\n")
        self.postgres_running()
        self.role_password("Old-On-Disk_123")
        self.container_password("New-In-Dot-Env_1")
        result = self.invoke("check_database_credentials", stdin="n\n", interactive=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("nothing changed", result.stderr)
        self.assertFalse((self.state / "alter.sql").exists())
        self.assertEqual(self.role_password_read(), "Old-On-Disk_123")

    def test_a_non_interactive_run_refuses_to_repassword_the_database(self) -> None:
        self.env(self.BASE_ENV + "POSTGRES_PASSWORD=New-In-Dot-Env_1\n")
        self.postgres_running()
        self.role_password("Old-On-Disk_123")
        self.container_password("New-In-Dot-Env_1")
        result = self.invoke("check_database_credentials")
        self.assertEqual(result.returncode, 1)
        self.assertIn("refusing to change a database password without asking", result.stderr)
        self.assertFalse((self.state / "alter.sql").exists())

    def test_a_stale_container_environment_is_reported_instead_of_reconciled(self) -> None:
        # Here the volume holds what the *container* was created with, so recreating the service fixes
        # it; running ALTER USER would silently overwrite a password the user never meant to change.
        self.env(self.BASE_ENV + "POSTGRES_PASSWORD=Edited-In-Env-Only\n")
        self.postgres_running()
        self.role_password("Created-With-This_1")
        self.container_password("Created-With-This_1")
        self.volume()
        result = self.invoke("check_database_credentials", stdin="y\n", interactive=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("--force-recreate postgres", result.stderr)
        self.assertFalse((self.state / "alter.sql").exists())

    def test_the_password_never_travels_as_an_argument(self) -> None:
        secret = "Never-In-Argv_12345"
        self.env(self.BASE_ENV + f"POSTGRES_PASSWORD={secret}\n")
        self.postgres_running()
        self.role_password(secret)
        self.container_password(secret)
        result = self.invoke("check_database_credentials")
        self.assert_ok(result)
        self.assertEqual(self.probe_url(), f"postgresql://borobiya:{secret}@postgres:5432/borobiya")
        for call in self.calls():
            self.assertNotIn(secret, " ".join(call), call)

    def test_the_probe_reaches_psql_as_a_connection_string_not_a_prompt(self) -> None:
        secret = "Checked-Form_12345"
        self.env(self.BASE_ENV + f"POSTGRES_PASSWORD={secret}\n")
        self.postgres_running()
        self.role_password(secret)
        self.container_password(secret)
        result = self.invoke("check_database_credentials")
        self.assert_ok(result)
        exec_call = next(call for call in self.calls() if call[:3] == ["compose", "exec", "-T"])
        self.assertEqual(exec_call[3:6], ["postgres", "sh", "-c"], exec_call)
        self.assertEqual(exec_call[-3:], ["sh", "-tAc", "SELECT 1"], exec_call)

    def test_a_container_that_is_not_running_is_started_before_it_is_judged(self) -> None:
        secret = "Started-For-Probe_1"
        self.env(self.BASE_ENV + f"POSTGRES_PASSWORD={secret}\n")
        self.role_password(secret)
        self.container_password(secret)
        self.volume()
        result = self.invoke("check_database_credentials")
        self.assert_ok(result)
        self.assertIn("starting postgres so the credentials can be checked", result.stdout)
        self.assertIn(["compose", "up", "-d", "postgres"], self.calls())
        self.assertIn("the password in .env authenticates", result.stdout)

    def test_a_machine_with_no_database_yet_is_left_alone(self) -> None:
        self.env(self.BASE_ENV + "POSTGRES_PASSWORD=Fresh-Machine_123\n")
        result = self.invoke("check_database_credentials")
        self.assert_ok(result)
        self.assertIn("no postgres-data volume yet", result.stdout)
        self.assertEqual([c for c in self.calls() if c[:2] == ["compose", "exec"]], [])

    def test_a_hostile_password_in_the_file_is_refused_before_the_probe(self) -> None:
        self.env(self.BASE_ENV + "POSTGRES_PASSWORD=pa#ss_in_env\n")
        self.postgres_running()
        self.role_password("pa#ss_in_env")
        result = self.invoke("check_database_credentials")
        self.assertEqual(result.returncode, 1)
        self.assertIn("cannot carry", result.stderr)
        self.assertEqual([c for c in self.calls() if c[:2] == ["compose", "exec"]], [])

    def test_dry_run_probes_nothing(self) -> None:
        self.env(self.BASE_ENV + "POSTGRES_PASSWORD=x\n")
        result = self.invoke("check_database_credentials", dry_run=True)
        self.assert_ok(result)
        self.assertEqual(self.calls(), [])

    def test_a_loopback_answer_is_not_accepted_as_verification(self) -> None:
        # The image trusts 127.0.0.1, so a probe that goes there says `1` whatever the password is. This is
        # the regression that made the first version of this check useless on a real VM: it printed
        # "verified" three lines before the migration failed.
        self.env(self.BASE_ENV + "POSTGRES_PASSWORD=Wrong-But-Trusted_1\n")
        self.postgres_running()
        self.role_password("Something-Else-Entirely")
        self.container_password("Wrong-But-Trusted_1")
        self.volume()
        result = self.invoke("check_database_credentials")
        self.assertEqual(result.returncode, 1, "a refusal is right here, and it must not be called verified")
        self.assertIn("The database rejects the password in .env", result.stdout)
        self.assertNotIn("verified", result.stdout)
        self.assertIn("postgres:5432", self.probe_url())
        for host in ("127.0.0.1", "localhost", "::1"):
            self.assertNotIn(host, self.probe_url(), host)
        # The fake answers `1` to any loopback connection, exactly as the image does. So this file existing
        # would mean the script asked a question that could not be answered honestly, even if the answer
        # had been the one it wanted.
        self.assertFalse((self.state / "trust_probe_seen").exists(), "the script probed loopback")

    def test_the_api_container_is_asked_first_and_answers_for_the_app(self) -> None:
        secret = "As-The-App-Sees-It_1"
        self.env(self.BASE_ENV + f"POSTGRES_PASSWORD={secret}\n")
        self.postgres_running()
        self.role_password("Old-On-Disk_123456")          # the volume disagrees with .env ...
        self.container_password(secret)
        # ... but the API container's own URL is fine, so the app-side probe is the one that must decide.
        self.api_running("postgresql://borobiya:Old-On-Disk_123456@postgres:5432/borobiya")
        result = self.invoke("check_database_credentials")
        self.assert_ok(result)
        self.assertIn("the DATABASE_URL the API container holds authenticates", result.stdout)
        self.assertEqual([c for c in self.calls() if c[3:4] == ["postgres"] and "sh -c" in " ".join(c)], [])

    def test_an_api_container_that_cannot_answer_is_not_an_answer(self) -> None:
        # A container that is still starting makes `exec` fail with something that says nothing about the
        # credential; falling back to the database is the only honest move.
        secret = "Api-Still-Starting_1"
        self.env(self.BASE_ENV + f"POSTGRES_PASSWORD={secret}\n")
        self.postgres_running()
        self.role_password(secret)
        self.container_password(secret)
        self.api_running(None)                             # exists, but bun never answered
        result = self.invoke("check_database_credentials")
        self.assert_ok(result)
        self.assertIn("could not answer the probe", result.stdout)
        self.assertIn("authenticates over the network the apps use", result.stdout)

    def test_the_alter_runs_as_the_role_the_image_created(self) -> None:
        secret = "Alter-As-Borobiya_1"
        self.env(self.BASE_ENV + f"POSTGRES_PASSWORD={secret}\n")
        self.postgres_running()
        self.role_password("Old-On-Disk_123")
        self.container_password(secret)
        self.superuser("borobiya")                         # POSTGRES_USER is the superuser; postgres is not
        result = self.invoke("check_database_credentials", stdin="y\n", interactive=True)
        self.assert_ok(result)
        self.assertEqual(read_state(self.state, "alter_role"), "borobiya")
        self.assertIn("verified: .env's password now authenticates", result.stdout)

    def test_the_alter_falls_back_when_only_the_default_superuser_exists(self) -> None:
        secret = "Alter-As-Postgres_123"
        self.env(self.BASE_ENV + f"POSTGRES_PASSWORD={secret}\n")
        self.postgres_running()
        self.role_password("Old-On-Disk_123")
        self.container_password(secret)
        self.superuser("postgres")                         # an image configured the other way round
        result = self.invoke("check_database_credentials", stdin="y\n", interactive=True)
        self.assert_ok(result)
        self.assertEqual(read_state(self.state, "alter_role"), "postgres")

    def test_a_restarted_api_is_suggested_only_when_one_is_running(self) -> None:
        secret = "Rotate-With-Pool_1"
        self.env(self.BASE_ENV + f"POSTGRES_PASSWORD={secret}\n")
        self.postgres_running()
        self.role_password("Old-On-Disk_123")
        self.container_password(secret)
        (self.state / "api.running").write_text("cidapi\n", encoding="utf-8")
        result = self.invoke("check_database_credentials", stdin="y\n", interactive=True)
        self.assert_ok(result)
        self.assertIn("docker compose restart api", result.stdout)

    def role_password_read(self) -> str:
        path = self.state / "role_password"
        return path.read_text(encoding="utf-8") if path.exists() else ""

    def probe_url(self) -> str:
        path = self.state / "probe_url"
        return path.read_text(encoding="utf-8").strip() if path.exists() else ""


def read_state(directory: Path, name: str) -> str:
    path = directory / name
    return path.read_text(encoding="utf-8").strip() if path.exists() else ""


class ShippedInterfaceTests(unittest.TestCase):
    """Claims about the file as a user meets it, not just about its functions."""

    def test_help_documents_the_yes_behaviour(self) -> None:
        result = subprocess.run(
            ["bash", str(SCRIPT), "--help"], capture_output=True, text=True, check=False
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("two database passwords are generated into .env", result.stdout)

    def test_the_admin_password_prompt_and_the_database_prompts_share_one_shape(self) -> None:
        text = SCRIPT.read_text(encoding="utf-8")
        self.assertEqual(text.count("[Enter = generate a strong one]"), 2, "admin + ask_db_secret")

    def test_nothing_in_the_script_probes_postgres_over_loopback(self) -> None:
        # The comments are allowed to name 127.0.0.1 (that is what the trap is); the code is not.
        text = SCRIPT.read_text(encoding="utf-8")
        cases = (
            ("check_database_credentials", "@postgres:${port}"),
            ("check_nominatim_database_auth", "-h nominatim"),
        )
        for name, needle in cases:
            start = text.index(name + "() {")
            body = text[start : text.index("\n}\n", start)]
            code = "\n".join(line for line in body.splitlines() if not line.lstrip().startswith("#"))
            self.assertNotIn("127.0.0.1", code, f"{name} probes loopback, which the image trusts")
            self.assertIn(needle, code, f"{name} does not name the address the apps use")

    def test_the_healthcheck_does_not_claim_to_authenticate_over_loopback(self) -> None:
        compose = Path(__file__).resolve().parents[1].joinpath("docker-compose.yml").read_text(encoding="utf-8")
        block = compose[compose.index("  postgres:") : compose.index("  api:")]
        assert "-h postgres" in block, "the healthcheck must leave the container to require a password"
        assert "127.0.0.1" not in block.split("healthcheck:")[1].split("interval:")[0], block

    def test_no_password_is_ever_printed_by_the_helpers(self) -> None:
        text = SCRIPT.read_text(encoding="utf-8")
        block = text[text.index("set_database_passwords() {") : text.index("check_database_credentials() {")]
        for line in block.splitlines():
            if "note " in line or "printf" in line:
                self.assertNotIn("$postgres", line, line)
                self.assertNotIn("$nominatim", line, line)


if __name__ == "__main__":
    unittest.main()
