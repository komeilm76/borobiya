#!/usr/bin/env python3
"""Tests for scripts/enable-proxy.sh and scripts/disable-proxy.sh.

Run: python3 -m unittest scripts.test_proxy_scripts   (or /tmp/lint/bin/pytest -q scripts/test_proxy_scripts.py)

Every test drives the two shipped scripts in a throwaway HOME and a throwaway /etc, through the root
overrides scripts/proxy-common.sh documents, so nothing here needs sudo, Docker, systemd or a network.
The claims under test are the ones that make a proxy script safe to run on a machine you care about:

  * it asks for the address instead of shipping one, because a bridged VM needs the host's LAN address
    and a NAT VM needs the gateway — the same literal cannot be right for both;
  * it refuses to configure a proxy that does not answer, because a dead proxy turns every later
    failure (apt, curl, git, a docker pull, a 1.3 GB download at 40%) into a timeout with no clue;
  * it removes exactly what it wrote: a ~/.bashrc block between its own markers, a root-owned file
    carrying its own marker line, and nothing else;
  * it does not lose what was already there — unrelated ~/.bashrc lines, unrelated keys in
    ~/.docker/config.json, a proxy file an administrator wrote by hand.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ENABLE = REPO_ROOT / "scripts" / "enable-proxy.sh"
DISABLE = REPO_ROOT / "scripts" / "disable-proxy.sh"
BLOCK_BEGIN = "# >>> borobiya proxy >>>"
BLOCK_END = "# <<< borobiya proxy <<<"
MARKER = "managed by borobiya scripts/enable-proxy.sh"


class ScriptCase(unittest.TestCase):
    """Shared harness: isolated roots, no prompts, no probe, no systemd, no sudo."""

    def setUp(self) -> None:
        for script in (ENABLE, DISABLE):
            self.assertTrue(
                stat.S_IXUSR & script.stat().st_mode,
                f"{script.name} lost its executable bit; the runbook tells people to run ./scripts/{script.name}",
            )
        self.root = Path(tempfile.mkdtemp(prefix="borobiya-proxy-test."))
        self.addCleanup(shutil.rmtree, self.root, True)
        self.home = self.root / "home"
        self.etc = self.root / "etc"
        (self.home / ".config" / "borobiya").mkdir(parents=True)
        (self.etc / "apt" / "apt.conf.d").mkdir(parents=True)
        self.bashrc = self.home / ".bashrc"
        self.bashrc.write_text("# my own bashrc line\nexport EDITOR=vim\n")
        self.docker_config = self.home / ".docker" / "config.json"
        self.state_file = self.home / ".config" / "borobiya" / "proxy.state"
        self.cred_file = self.home / ".config" / "borobiya" / "proxy.env"
        self.apt_file = self.etc / "apt" / "apt.conf.d" / "95borobiya-proxy"
        self.dropin = self.etc / "systemd" / "system" / "docker.service.d" / "borobiya-proxy.conf"

    def base_env(self, **extra: str) -> dict[str, str]:
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(self.home),
            "BOROBIYA_PROXY_HOME": str(self.home),
            "BOROBIYA_PROXY_ETC": str(self.etc),
            "BOROBIYA_PROXY_SUDO": "",  # set-but-empty: no sudo prefix at all
            "BOROBIYA_PROXY_NO_SYSTEMD": "1",
            "BOROBIYA_PROXY_SKIP_PROBE": "1",
            "BOROBIYA_PROXY_CHECK_URL": "http://check.invalid/",
        }
        env.update(extra)
        return env

    def enable(self, *args: str, stdin: str = "", **env_extra: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(ENABLE), *args],
            input=stdin,
            capture_output=True,
            text=True,
            check=False,
            env=self.base_env(**env_extra),
            cwd=REPO_ROOT,
            timeout=90,
        )

    def disable(self, *args: str, **env_extra: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(DISABLE), "--yes", *args],
            input="",
            capture_output=True,
            text=True,
            check=False,
            env=self.base_env(**env_extra),
            cwd=REPO_ROOT,
            timeout=90,
        )

    # ---- assertions about the shipped files ----
    def assertConfigured(self, url: str = "http://10.0.2.5:3128") -> None:
        bashrc = self.bashrc.read_text()
        self.assertIn(BLOCK_BEGIN, bashrc)
        self.assertIn(f'http_proxy="{url}"', bashrc)
        self.assertIn('no_proxy="localhost,127.0.0.1,::1,172.30.0.0/24"', bashrc)
        self.assertIn("# my own bashrc line", bashrc)
        self.assertIn(MARKER, self.apt_file.read_text())
        self.assertIn(f'Acquire::http::Proxy "{url}";', self.apt_file.read_text())
        dropin = self.dropin.read_text()
        self.assertIn("[Service]", dropin)
        self.assertIn(f'Environment="HTTP_PROXY={url}"', dropin)
        self.assertIn("172.30.0.0/24", dropin)
        config = json.loads(self.docker_config.read_text())
        self.assertEqual(config["proxies"]["default"]["httpProxy"], url)

    def block_lines(self) -> list[str]:
        lines = self.bashrc.read_text().splitlines()
        out, inside = [], False
        for line in lines:
            if line.strip() == BLOCK_BEGIN:
                inside = True
                continue
            if inside and line.strip() == BLOCK_END:
                break
            if inside:
                out.append(line)
        return out


class TestEnableWritesEverySetting(ScriptCase):
    def test_all_four_settings_are_written(self) -> None:
        result = self.enable("10.0.2.5:3128", "--skip-checks")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertConfigured()

    def test_address_is_asked_rather_than_shipped(self) -> None:
        """The point of the script: no address is hardcoded, so a bridged and a NAT VM both work."""
        combined = self.enable("--skip-checks", PROXY_FORCE_FORM="1", stdin="proxy.internal:1080\n")
        self.assertEqual(combined.returncode, 0, combined.stdout + combined.stderr)
        self.assertIn("Proxy address", combined.stdout)
        # An answer that already carries the port must not be asked for one again.
        self.assertNotIn("Proxy port", combined.stdout)
        self.assertConfigured("http://proxy.internal:1080")

        split = self.enable("--skip-checks", PROXY_FORCE_FORM="1", stdin="192.168.56.7\n3129\n")
        self.assertEqual(split.returncode, 0, split.stdout + split.stderr)
        self.assertIn("Proxy port", split.stdout)
        self.assertConfigured("http://192.168.56.7:3129")

    def test_no_address_means_no_write(self) -> None:
        """A default at the prompt is fine; inventing an address in the script would not be."""
        result = self.enable("--skip-checks", "--dry-run", PROXY_FORCE_FORM="1", stdin="\n\n")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Proxy address", result.stdout + result.stderr)
        self.assertFalse(self.apt_file.parent.joinpath("95borobiya-proxy").exists())

    def test_no_system_skips_the_root_owned_files(self) -> None:
        self.enable("1.2.3.4:8080", "--skip-checks", "--no-system", "--no-docker-config")
        self.assertIn("http_proxy=", self.bashrc.read_text())
        self.assertFalse(self.apt_file.exists())
        self.assertFalse(self.dropin.exists())
        self.assertFalse(self.docker_config.exists())

    def test_dry_run_changes_nothing_and_still_completes(self) -> None:
        before = self.bashrc.read_text()
        result = self.enable("1.2.3.4:8080", "--skip-checks", "--dry-run")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("would", result.stdout)
        self.assertIn("Done", result.stdout)  # a dry run that died early would be worthless
        self.assertEqual(self.bashrc.read_text(), before)
        self.assertFalse(self.apt_file.exists())
        self.assertFalse(self.docker_config.exists())
        self.assertFalse(self.state_file.exists())


class TestIdempotenceAndReplacement(ScriptCase):
    def test_second_enable_does_not_stack_blocks(self) -> None:
        self.enable("10.0.2.5:3128", "--skip-checks")
        self.enable("10.0.2.5:3128", "--skip-checks")
        bashrc = self.bashrc.read_text()
        self.assertEqual(bashrc.count(BLOCK_BEGIN), 1)
        self.assertEqual(bashrc.count(BLOCK_END), 1)
        self.assertEqual(len(self.block_lines()), 3)

    def test_changing_the_port_replaces_the_value_everywhere(self) -> None:
        self.enable("10.0.2.5:3128", "--skip-checks")
        self.enable("10.0.2.5:9999", "--skip-checks")
        self.assertConfigured("http://10.0.2.5:9999")
        self.assertNotIn("3128", self.bashrc.read_text())
        self.assertNotIn("3128", self.apt_file.read_text())
        self.assertIn("9999", self.state_file.read_text())

    def test_disable_is_safe_to_run_twice(self) -> None:
        self.enable("10.0.2.5:3128", "--skip-checks")
        first = self.disable()
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        second = self.disable()
        self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
        self.assertIn("nothing to remove", second.stdout + second.stderr)

    def test_disable_without_a_previous_enable_touches_nothing(self) -> None:
        before = self.bashrc.read_text()
        result = self.disable()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.bashrc.read_text(), before)

    def test_disable_removes_all_four_and_keeps_foreign_lines(self) -> None:
        self.enable("10.0.2.5:3128", "--skip-checks")
        result = self.disable()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn(BLOCK_BEGIN, self.bashrc.read_text())
        self.assertIn("# my own bashrc line", self.bashrc.read_text())
        self.assertFalse(self.apt_file.exists())
        self.assertFalse(self.dropin.exists())
        self.assertFalse(self.state_file.exists())
        self.assertNotIn("proxies", self.docker_config.read_text())
        self.assertIn("unset http_proxy", result.stdout)  # the terminal it cannot reach
        self.assertIn("§ 5.1a", result.stdout)  # the host-side changes it cannot reach


class TestRefusals(ScriptCase):
    def test_foreign_proxy_files_are_never_overwritten_or_removed(self) -> None:
        self.apt_file.write_text('Acquire::http::Proxy "http://corp-admin:3128";\n')
        result = self.enable("10.0.2.5:3128", "--skip-checks")
        self.assertEqual(result.returncode, 1)
        self.assertIn("REFUSING to overwrite", result.stdout + result.stderr)
        self.assertIn("corp-admin", self.apt_file.read_text())
        self.assertFalse(self.dropin.exists())  # stopped before writing anything else
        self.assertNotIn(BLOCK_BEGIN, self.bashrc.read_text())

        # disable, likewise, leaves a file it did not write alone
        result = self.disable()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("corp-admin", self.apt_file.read_text())
        self.assertIn("left alone", result.stdout)

    def test_a_refusal_leaves_nothing_half_configured(self) -> None:
        """The order of operations is the feature: no write happens before every check has passed."""
        self.apt_file.write_text('Acquire::http::Proxy "http://corp-admin:3128";\n')
        result = self.enable("10.0.2.5:3128", "--skip-checks")
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(BLOCK_BEGIN, self.bashrc.read_text())
        self.assertFalse(self.docker_config.exists())
        self.assertFalse(self.dropin.exists())
        self.assertFalse(self.state_file.exists())

    def test_unbalanced_marker_refuses_to_guess(self) -> None:
        self.bashrc.write_text("# keep me\n" + BLOCK_BEGIN + "\nexport EDITOR=emacs\n")
        result = self.disable()
        self.assertEqual(result.returncode, 1)
        self.assertIn("refusing to guess", result.stdout + result.stderr)
        self.assertIn("# keep me", self.bashrc.read_text())  # nothing eaten from the end of the file

    def test_a_closed_input_stream_is_an_error_not_a_silent_default(self) -> None:
        result = self.enable(PROXY_FORCE_FORM="1", stdin="")
        self.assertEqual(result.returncode, 1)
        self.assertIn("input closed", result.stdout + result.stderr)

    def test_dead_port_is_not_configured(self) -> None:
        """Refused vs timeout is the distinction the script exists to make before writing anything."""
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]  # bound then closed by the with-block → a refused port
        result = self.enable(f"127.0.0.1:{port}", BOROBIYA_PROXY_SKIP_PROBE="0",
                             BOROBIYA_PROXY_PROBE_TIMEOUT="3")
        self.assertEqual(result.returncode, 1)
        combined = result.stdout + result.stderr
        self.assertIn("REFUSED", combined)
        self.assertIn("not configured", combined)
        self.assertNotIn(BLOCK_BEGIN, self.bashrc.read_text())
        self.assertIn("allow connections from LAN", combined)  # the fix, at the moment it is useful

    def test_invalid_targets_are_rejected_with_a_readable_reason(self) -> None:
        cases = {
            "192.168.1.999": "not a usable address",  # octet out of range
            "not a host": "not a usable address",  # a space
            "host/path": "not a usable address",  # a path is not an address
            "1.2.3.4:80:2080": "not a usable address",  # a stray port dressed up as IPv6
        }
        for value, reason in cases.items():
            with self.subTest(host=value):
                result = self.enable("--host", value, "--skip-checks", "--dry-run")
                self.assertEqual(result.returncode, 1)
                self.assertIn(reason, result.stdout + result.stderr)

    def test_conflicting_port_in_two_places(self) -> None:
        result = self.enable("--host", "1.2.3.4:80", "--port", "8080", "--skip-checks", "--dry-run")
        self.assertEqual(result.returncode, 1)
        self.assertIn("contradicts", result.stdout + result.stderr)

    def test_ipv6_forms(self) -> None:
        """Bare IPv6 in a combined answer is ambiguous; as --host it is not, and a URL needs brackets."""
        result = self.enable("--host", "fd00::1", "--port", "3128", "--skip-checks", "--dry-run")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("http://[fd00::1]:3128", result.stdout)
        # No port, twice: without a terminal it says so, and at a prompt it refuses to guess.
        no_terminal = self.enable("--host", "fd00::1", "--skip-checks", "--dry-run")
        self.assertEqual(no_terminal.returncode, 1)
        self.assertIn("without a terminal", no_terminal.stdout + no_terminal.stderr)
        prompted = self.enable("--skip-checks", "--dry-run", PROXY_FORCE_FORM="1", stdin="1.2.3.4\n\n")
        self.assertEqual(prompted.returncode, 1)
        self.assertIn("will not guess one", prompted.stdout + prompted.stderr)
        ambiguous = self.enable("--skip-checks", "--dry-run", PROXY_FORCE_FORM="1", stdin="fd00::1:3128\n")
        self.assertEqual(ambiguous.returncode, 1)
        self.assertIn("bracket an IPv6 address", ambiguous.stdout + ambiguous.stderr)
        # An environment default is honoured, and a bracketed literal survives the same path.
        result = self.enable("--host", "fd00::1", "--skip-checks", "--dry-run", PROXY_PORT="1080")
        self.assertIn("http://[fd00::1]:1080", result.stdout)  # PROXY_PORT is documented, so it must work

    def test_ipv6_round_trips_through_bash_quoting(self) -> None:
        self.enable("--host", "[fd00::1]:3128", "--skip-checks")
        line = next(l for l in self.block_lines() if "http_proxy" in l)
        self.assertIn('http_proxy="http://[fd00::1]:3128"', line)
        resolved = subprocess.run(
            ["bash", "-c", ". ~/.bashrc; printf '%s' \"$http_proxy\""],
            env={"HOME": str(self.home), "PATH": os.environ.get("PATH", "")},
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(resolved.stdout, "http://[fd00::1]:3128")


class TestCredentialsStayOutOfWorldReadableFiles(ScriptCase):
    NASTY = 'a$b`c"d'

    def test_password_is_encoded_and_the_bashrc_stays_clean(self) -> None:
        result = self.enable(
            "10.0.2.5:3128", "--skip-checks", "--username", "bob@corp", "--password", self.NASTY
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        bashrc = self.bashrc.read_text()
        self.assertNotIn(self.NASTY, bashrc)
        self.assertNotIn("bob", bashrc)
        self.assertIn("proxy.env", bashrc)  # the block only sources the 0600 file
        self.assertTrue(self.cred_file.exists())
        self.assertEqual(stat.S_IMODE(self.cred_file.stat().st_mode), 0o600)
        for path in (self.apt_file, self.dropin):
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600, f"{path.name} holds a password")
            self.assertIn("bob%40corp", path.read_text())
        self.assertEqual(stat.S_IMODE(self.state_file.stat().st_mode), 0o600)
        self.assertNotIn(self.NASTY, result.stdout)  # its own output masks it
        self.assertNotIn("bob@corp", result.stdout)

    def test_the_shell_gets_the_exact_password_back(self) -> None:
        self.enable("10.0.2.5:3128", "--skip-checks", "--username", "bob@corp", "--password", self.NASTY)
        resolved = subprocess.run(
            ["bash", "-c", '. ~/.bashrc; printf "%s" "$http_proxy"'],
            env={"HOME": str(self.home), "PATH": os.environ.get("PATH", "")},
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(
            resolved.stdout,
            "http://bob%40corp:a%24b%60c%22d@10.0.2.5:3128",
            "percent-encoding both sides of the credential, and nothing else, is what makes this round-trip",
        )

    def test_disable_removes_the_credential_file(self) -> None:
        self.enable("10.0.2.5:3128", "--skip-checks", "--username", "bob", "--password", "pw")
        self.assertTrue(self.cred_file.exists())
        self.disable()
        self.assertFalse(self.cred_file.exists())
        self.assertNotIn(BLOCK_BEGIN, self.bashrc.read_text())


class TestOtherPeoplesConfigSurvives(ScriptCase):
    def test_unrelated_docker_config_keys_are_preserved(self) -> None:
        self.docker_config.parent.mkdir(parents=True, exist_ok=True)
        self.docker_config.write_text(json.dumps({"experimental": "enabled", "psformat": "table"}) + "\n")
        self.enable("10.0.2.5:3128", "--skip-checks")
        config = json.loads(self.docker_config.read_text())
        self.assertEqual(config["experimental"], "enabled")
        self.assertEqual(config["psformat"], "table")
        self.assertIn("proxies", config)
        self.disable()
        config = json.loads(self.docker_config.read_text())
        self.assertNotIn("proxies", config)
        self.assertEqual(sorted(config), ["experimental", "psformat"])

    def test_a_pre_existing_proxy_is_restored_not_deleted(self) -> None:
        """If the machine already had its own build proxy, disabling ours must put theirs back."""
        self.docker_config.parent.mkdir(parents=True, exist_ok=True)
        prior = {"proxies": {"default": {"httpProxy": "http://admin:3128"}}}
        self.docker_config.write_text(json.dumps(prior) + "\n")
        self.enable("10.0.2.5:3128", "--skip-checks")
        self.assertEqual(
            json.loads(self.docker_config.read_text())["proxies"]["default"]["httpProxy"],
            "http://10.0.2.5:3128",
        )
        backup = self.home / ".config" / "borobiya" / "proxy.docker-config.bak"
        self.assertTrue(backup.exists(), "the first enable has to back up a file it is about to change")
        self.disable()
        self.assertEqual(json.loads(self.docker_config.read_text()), prior)
        self.assertFalse(backup.exists())

    def test_a_second_enable_does_not_backup_its_own_output(self) -> None:
        """Otherwise disable would resurrect our key instead of removing it."""
        self.enable("10.0.2.5:3128", "--skip-checks")
        self.enable("10.0.2.5:9999", "--skip-checks")
        backup = self.home / ".config" / "borobiya" / "proxy.docker-config.bak"
        self.assertFalse(backup.exists())
        self.disable()
        self.assertNotIn("proxies", self.docker_config.read_text())

    def test_malformed_docker_config_is_reported_not_rewritten(self) -> None:
        self.docker_config.parent.mkdir(parents=True, exist_ok=True)
        self.docker_config.write_text("{ not json")
        result = self.enable("10.0.2.5:3128", "--skip-checks")
        self.assertEqual(result.returncode, 1)
        self.assertIn("refusing to rewrite", result.stdout + result.stderr)
        self.assertEqual(self.docker_config.read_text(), "{ not json")
        self.assertNotIn(BLOCK_BEGIN, self.bashrc.read_text())  # pre-flight, not half a config


class TestStatusReports(ScriptCase):
    def test_status_on_a_clean_machine(self) -> None:
        result = self.enable("--status")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("no block", result.stdout)
        self.assertIn("absent", result.stdout)

    def test_status_after_enable_lists_each_file_as_ours(self) -> None:
        self.enable("10.0.2.5:3128", "--skip-checks")
        result = self.disable("--status")
        self.assertIn("block present", result.stdout)
        self.assertIn("ours", result.stdout)
        self.assertIn("build containers", result.stdout)

    def test_help_documents_the_flags_that_exist(self) -> None:
        result = self.enable("--help")
        self.assertEqual(result.returncode, 0)
        for flag in ("--host", "--port", "--username", "--skip-checks", "--no-system", "--dry-run"):
            self.assertIn(flag, result.stdout)
        # and no flag that does not exist: the runbook's own rule for this repository
        for invented in ("--force", "--global", "--systemd"):
            self.assertNotIn(invented, result.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
