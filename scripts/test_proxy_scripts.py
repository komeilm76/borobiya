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
        # PATH_EXTRA puts a stub docker/systemctl ahead of the real PATH, for the tests that have to
        # describe a machine this sandbox is not. It is consumed here, never passed to the child.
        prepend = extra.pop("PATH_EXTRA", None)
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
        if prepend:
            env["PATH"] = prepend + os.pathsep + env["PATH"]
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
        self.assertIn('no_proxy="localhost,127.0.0.1,::1,host.docker.internal,gateway.docker.internal,172.30.0.0/24', bashrc)
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
        line = next(entry for entry in self.block_lines() if "http_proxy" in entry)
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

    def test_disable_with_backup_preserves_docker_config_changes_made_since_enable(self) -> None:
        """Restoring a whole backup would erase Docker logins/settings added after enable."""
        self.docker_config.parent.mkdir(parents=True, exist_ok=True)
        prior = {"auths": {"registry.old": {}},
                 "proxies": {"default": {"httpProxy": "http://admin:3128"},
                             "registry.old": {"httpProxy": "http://old:3128"}}}
        self.docker_config.write_text(json.dumps(prior) + "\n")
        enabled = self.enable("10.0.2.5:3128", "--skip-checks")
        self.assertEqual(enabled.returncode, 0, enabled.stdout + enabled.stderr)
        updated = json.loads(self.docker_config.read_text())
        updated["auths"]["registry.new"] = {"auth": "new-login"}
        updated["proxies"]["registry.new"] = {"httpProxy": "http://new:3128"}
        self.docker_config.write_text(json.dumps(updated) + "\n")
        removed = self.disable()
        self.assertEqual(removed.returncode, 0, removed.stdout + removed.stderr)
        expected = {"auths": updated["auths"],
                    "proxies": {**updated["proxies"], "default": prior["proxies"]["default"]}}
        self.assertEqual(json.loads(self.docker_config.read_text()), expected)
        self.assertFalse((self.state_file.parent / "proxy.docker-config.bak").exists())

    def test_disable_without_backup_preserves_later_named_docker_proxies(self) -> None:
        enabled = self.enable("10.0.2.5:3128", "--skip-checks")
        self.assertEqual(enabled.returncode, 0, enabled.stdout + enabled.stderr)
        config = json.loads(self.docker_config.read_text())
        config["proxies"]["registry.new"] = {"httpProxy": "http://new:3128"}
        self.docker_config.write_text(json.dumps(config) + "\n")
        removed = self.disable()
        self.assertEqual(removed.returncode, 0, removed.stdout + removed.stderr)
        self.assertEqual(json.loads(self.docker_config.read_text())["proxies"],
                         {"registry.new": {"httpProxy": "http://new:3128"}})

    def test_a_second_enable_does_not_backup_its_own_output(self) -> None:
        """Otherwise disable would resurrect our key instead of removing it."""
        self.enable("10.0.2.5:3128", "--skip-checks")
        self.enable("10.0.2.5:9999", "--skip-checks")
        backup = self.home / ".config" / "borobiya" / "proxy.docker-config.bak"
        self.assertFalse(backup.exists())
        self.disable()
        self.assertNotIn("proxies", self.docker_config.read_text())

    def test_partial_disable_keeps_state_so_reenable_cannot_backup_its_own_proxy(self) -> None:
        """The state file is the first-enable sentinel; partial undo must not discard it."""
        for flag in ("--shell-only", "--keep-docker-config"):
            with self.subTest(flag=flag):
                enabled = self.enable("10.0.2.5:3128", "--skip-checks")
                self.assertEqual(enabled.returncode, 0, enabled.stdout + enabled.stderr)
                partial = self.disable(flag)
                self.assertEqual(partial.returncode, 0, partial.stdout + partial.stderr)
                self.assertTrue(self.state_file.exists(), "partial disable must preserve the sentinel")
                reenabling = self.enable("10.0.2.5:9999", "--skip-checks")
                self.assertEqual(reenabling.returncode, 0, reenabling.stdout + reenabling.stderr)
                self.assertFalse((self.state_file.parent / "proxy.docker-config.bak").exists())
                removed = self.disable()
                self.assertEqual(removed.returncode, 0, removed.stdout + removed.stderr)
                self.assertNotIn("proxies", json.loads(self.docker_config.read_text()))
                self.assertFalse(self.state_file.exists(), "full disable should remove the sentinel")

    def test_skipped_docker_does_not_claim_a_later_user_proxy(self) -> None:
        """A shell-only setup cannot use its state file as evidence of Docker key ownership."""
        for partial in (None, "--shell-only", "--keep-docker-config"):
            with self.subTest(partial=partial):
                enabled = self.enable("10.0.2.5:3128", "--skip-checks", "--no-docker-config")
                self.assertEqual(enabled.returncode, 0, enabled.stdout + enabled.stderr)
                self.assertIn("DOCKER_CONFIG_MANAGED=0", self.state_file.read_text())
                if partial:
                    undone = self.disable(partial)
                    self.assertEqual(undone.returncode, 0, undone.stdout + undone.stderr)
                    self.assertFalse(self.state_file.exists())
                self.docker_config.parent.mkdir(parents=True, exist_ok=True)
                foreign = {"proxies": {"default": {"httpProxy": "http://admin:3128"}}}
                self.docker_config.write_text(json.dumps(foreign) + "\n")
                reenabling = self.enable("10.0.2.5:9999", "--skip-checks")
                self.assertEqual(reenabling.returncode, 0, reenabling.stdout + reenabling.stderr)
                self.assertTrue((self.state_file.parent / "proxy.docker-config.bak").exists())
                removed = self.disable()
                self.assertEqual(removed.returncode, 0, removed.stdout + removed.stderr)
                self.assertEqual(json.loads(self.docker_config.read_text()), foreign)

    def test_disable_without_managed_docker_state_leaves_foreign_proxy_alone(self) -> None:
        self.docker_config.parent.mkdir(parents=True, exist_ok=True)
        foreign = {"proxies": {"default": {"httpProxy": "http://admin:3128"}}}
        self.docker_config.write_text(json.dumps(foreign) + "\n")
        enabled = self.enable("10.0.2.5:3128", "--skip-checks", "--no-docker-config")
        self.assertEqual(enabled.returncode, 0, enabled.stdout + enabled.stderr)
        removed = self.disable()
        self.assertEqual(removed.returncode, 0, removed.stdout + removed.stderr)
        self.assertEqual(json.loads(self.docker_config.read_text()), foreign)
        self.assertIn("leaving the Docker config alone", removed.stdout)

    def test_full_disable_after_system_only_preserves_restored_foreign_proxy(self) -> None:
        """Finishing a partial undo must not strip the user's original Docker proxy again."""
        self.docker_config.parent.mkdir(parents=True, exist_ok=True)
        foreign = {"proxies": {"default": {"httpProxy": "http://admin:3128"}}}
        self.docker_config.write_text(json.dumps(foreign) + "\n")
        enabled = self.enable("10.0.2.5:3128", "--skip-checks")
        self.assertEqual(enabled.returncode, 0, enabled.stdout + enabled.stderr)
        partial = self.disable("--system-only")
        self.assertEqual(partial.returncode, 0, partial.stdout + partial.stderr)
        self.assertEqual(json.loads(self.docker_config.read_text()), foreign)
        self.assertFalse(self.state_file.exists())
        finished = self.disable()
        self.assertEqual(finished.returncode, 0, finished.stdout + finished.stderr)
        self.assertEqual(json.loads(self.docker_config.read_text()), foreign)
        self.assertNotIn(BLOCK_BEGIN, self.bashrc.read_text())

    def test_system_only_disable_allows_a_new_foreign_docker_proxy_to_be_backed_up(self) -> None:
        """Once our Docker key is gone, the next enable must regard a new key as user-owned."""
        enabled = self.enable("10.0.2.5:3128", "--skip-checks")
        self.assertEqual(enabled.returncode, 0, enabled.stdout + enabled.stderr)
        partial = self.disable("--system-only")
        self.assertEqual(partial.returncode, 0, partial.stdout + partial.stderr)
        self.assertFalse(self.state_file.exists())
        foreign = {"proxies": {"default": {"httpProxy": "http://admin:3128"}}}
        self.docker_config.write_text(json.dumps(foreign) + "\n")
        reenabling = self.enable("10.0.2.5:9999", "--skip-checks")
        self.assertEqual(reenabling.returncode, 0, reenabling.stdout + reenabling.stderr)
        self.assertTrue((self.state_file.parent / "proxy.docker-config.bak").exists())
        removed = self.disable()
        self.assertEqual(removed.returncode, 0, removed.stdout + removed.stderr)
        self.assertEqual(json.loads(self.docker_config.read_text()), foreign)

    def test_non_object_proxies_refused_before_any_shell_or_system_change(self) -> None:
        """A top-level JSON object can still carry a proxies value apply cannot merge."""
        self.docker_config.parent.mkdir(parents=True, exist_ok=True)
        for value in (None, ["not", "a", "mapping"]):
            with self.subTest(value=value):
                initial = {"proxies": value}
                self.docker_config.write_text(json.dumps(initial) + "\n")
                result = self.enable("10.0.2.5:3128", "--skip-checks")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("proxies", result.stdout + result.stderr)
                self.assertNotIn(BLOCK_BEGIN, self.bashrc.read_text())
                self.assertFalse(self.apt_file.exists())
                self.assertFalse((self.state_file.parent / "proxy.docker-config.bak").exists())
                self.assertEqual(json.loads(self.docker_config.read_text()), initial)

    def test_missing_current_config_keeps_the_previous_proxy_backup(self) -> None:
        self.docker_config.parent.mkdir(parents=True, exist_ok=True)
        self.docker_config.write_text(json.dumps({"proxies": {"default": {"httpProxy": "http://admin:3128"}}}))
        enabled = self.enable("10.0.2.5:3128", "--skip-checks")
        self.assertEqual(enabled.returncode, 0, enabled.stdout + enabled.stderr)
        backup = self.state_file.parent / "proxy.docker-config.bak"
        self.assertTrue(backup.exists())
        self.docker_config.unlink()
        removed = self.disable()
        self.assertNotEqual(removed.returncode, 0)
        self.assertIn("backup", removed.stdout + removed.stderr)
        self.assertTrue(backup.exists())
        self.assertTrue(self.state_file.exists())
        self.assertFalse(self.docker_config.exists())

    def test_malformed_current_config_is_not_overwritten_from_backup(self) -> None:
        self.docker_config.parent.mkdir(parents=True, exist_ok=True)
        self.docker_config.write_text(json.dumps({"proxies": {"default": {"httpProxy": "http://admin:3128"}}}))
        enabled = self.enable("10.0.2.5:3128", "--skip-checks")
        self.assertEqual(enabled.returncode, 0, enabled.stdout + enabled.stderr)
        backup = self.state_file.parent / "proxy.docker-config.bak"
        self.assertTrue(backup.exists())
        self.docker_config.write_text("{incomplete")
        removed = self.disable()
        self.assertNotEqual(removed.returncode, 0)
        self.assertEqual(self.docker_config.read_text(), "{incomplete")
        self.assertTrue(backup.exists())
        self.assertTrue(self.state_file.exists())

    def test_malformed_docker_config_is_reported_not_rewritten(self) -> None:
        self.docker_config.parent.mkdir(parents=True, exist_ok=True)
        self.docker_config.write_text("{ not json")
        result = self.enable("10.0.2.5:3128", "--skip-checks")
        self.assertEqual(result.returncode, 1)
        self.assertIn("refusing to rewrite", result.stdout + result.stderr)
        self.assertEqual(self.docker_config.read_text(), "{ not json")
        self.assertNotIn(BLOCK_BEGIN, self.bashrc.read_text())  # pre-flight, not half a config


class TestForeignProxyFiles(ScriptCase):
    """A machine that already had a proxy file, written before these scripts existed.

    The runbook used /etc/apt/apt.conf.d/95proxy and docker.service.d/proxy.conf, so following that
    revision leaves a second file in each directory that enable-proxy.sh never wrote and disable-proxy.sh
    must not delete — and those files are not inert: apt merges apt.conf.d in filename order, and
    systemd concatenates Environment= across drop-ins, so two of them can be in force at once.
    """

    def legacy(self) -> tuple[Path, Path]:
        apt = self.etc / "apt" / "apt.conf.d" / "95proxy"
        apt.write_text('Acquire::http::Proxy "http://192.168.100.225:2080";\n')
        # A neighbour that sets no proxy at all, to prove the scan reads the directory rather than
        # guessing from the file name.
        (self.etc / "apt" / "apt.conf.d" / "01autoremove").write_text(
            'APT::Never-MarkAuto-Sections "true";\n'
        )
        dockerd = self.etc / "systemd" / "system" / "docker.service.d" / "proxy.conf"
        dockerd.parent.mkdir(parents=True, exist_ok=True)
        dockerd.write_text('[Service]\nEnvironment="HTTP_PROXY=http://192.168.100.225:2080"\n')
        (dockerd.parent / "deprecation.conf").write_text("[Service]\nExecStart=\n")
        return apt, dockerd

    def test_the_report_counts_the_place_not_our_own_file(self) -> None:
        apt, dockerd = self.legacy()
        result = self.enable("--status")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("2 of 4 places", result.stdout)
        self.assertIn(str(apt), result.stdout)
        self.assertIn(str(dockerd), result.stdout)
        self.assertIn('Acquire::http::Proxy "http://192.168.100.225:2080"', result.stdout)
        self.assertNotIn("01autoremove", result.stdout)
        self.assertNotIn("deprecation.conf", result.stdout)

    def test_enable_refuses_before_writing_anything(self) -> None:
        """Writing ours on top of theirs is how you get a proxy that changes when you rename a file."""
        apt, dockerd = self.legacy()
        before = apt.read_text()
        result = self.enable("192.168.100.225", "2080", "--yes", "--skip-checks")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("Another proxy file is already in the way", result.stdout)
        self.assertIn(str(apt), result.stdout)
        self.assertIn(str(dockerd), result.stdout)
        self.assertIn("sudo rm -f", result.stdout)  # the way out, in the message that blocks the way in
        self.assertFalse(self.apt_file.exists())
        self.assertFalse(self.dropin.exists())
        self.assertNotIn(BLOCK_BEGIN, self.bashrc.read_text())
        self.assertFalse(self.state_file.exists())
        self.assertEqual(apt.read_text(), before)
        self.assertTrue(dockerd.exists())

    def test_no_system_still_sets_up_the_shell(self) -> None:
        """The escape hatch: theirs stays theirs, ours goes where no root file is needed."""
        apt, _ = self.legacy()
        result = self.enable("10.0.2.5:3128", "--yes", "--skip-checks", "--no-system", "--no-docker-config")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("http://10.0.2.5:3128", self.bashrc.read_text())
        self.assertFalse(self.apt_file.exists())
        self.assertIn("Acquire::http::Proxy", apt.read_text())  # untouched

    def test_disable_says_what_it_left_in_place(self) -> None:
        self.enable("10.0.2.5:3128", "--skip-checks")
        apt, _ = self.legacy()
        result = self.disable()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Left in place on purpose", result.stdout)
        self.assertIn(str(apt), result.stdout)
        self.assertTrue(apt.exists())
        self.assertFalse(self.apt_file.exists(), "ours was still ours to remove")

    def test_an_unreadable_file_is_reported_but_never_refuses(self) -> None:
        """Refusing over a file we could not read would hold up a working machine for a guess."""
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            self.skipTest("running as root, so no file is unreadable here")
        stranger = self.etc / "apt" / "apt.conf.d" / "70-local"
        stranger.write_text('Acquire::http::Proxy "http://internal:3128";\n')
        stranger.chmod(0o000)
        self.addCleanup(stranger.chmod, 0o644)
        status = self.enable("--status")
        self.assertEqual(status.returncode, 0, status.stdout + status.stderr)
        self.assertIn("not readable without sudo", status.stdout)
        enabled = self.enable("10.0.2.5:3128", "--yes", "--skip-checks")
        self.assertEqual(enabled.returncode, 0, enabled.stdout + enabled.stderr)


class TestWhereAPortComesFrom(ScriptCase):
    """Three ways to give the port (target, flag, bare second argument) and no silent winner.

    The pair form is how the answer arrives when nobody opens --help; a second value that disagrees is
    a typo, and whichever one quietly won would show up later as "the proxy does not work".
    """

    def test_a_bare_second_positional_is_the_port(self) -> None:
        result = self.enable("1.2.3.4", "2080", "--skip-checks", "--dry-run")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("http://1.2.3.4:2080", result.stdout)

    def test_a_port_in_the_target_and_a_second_positional_must_agree(self) -> None:
        result = self.enable("1.2.3.4:80", "8080", "--skip-checks", "--dry-run")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("contradicts", result.stdout + result.stderr)

    def test_a_bare_port_completes_a_target_that_has_none(self) -> None:
        result = self.enable("--host", "1.2.3.4", "2080", "--skip-checks", "--dry-run")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("http://1.2.3.4:2080", result.stdout)



class TestNoProxyCoversTheComposeNetwork(ScriptCase):
    """The `proxies` key in ~/.docker/config.json is merged into every container the client creates, so
    its noProxy list decides whether service-to-service calls stay on the Compose network. Compose services
    address each other by name (`http://osrm-car:5000`), and curl matches a CIDR only against a numeric
    host — so a list of loopback plus `172.30.0.0/24` exempts nothing that a running stack actually calls,
    and the symptom is a 502 from the proxy on a machine where every container is healthy (seen on the VM
    with `verify-routing.sh`). The names are therefore read from docker-compose.yml, not remembered."""

    FIXTURE = "services:\n  alpha-svc:\n    image: x\n# a comment at column zero\n  beta_svc:\n    image: y\n"

    def no_proxy_written(self, **env: str) -> str:
        fixture = self.root / "docker-compose.fixture.yml"
        fixture.write_text(self.FIXTURE)
        result = self.enable("--yes", "--skip-checks", "10.0.2.5", "3128", BOROBIYA_PROXY_COMPOSE_FILE=str(fixture), **env)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return json.loads(self.docker_config.read_text())["proxies"]["default"]["noProxy"]

    def test_service_names_from_the_compose_file_reach_docker_and_the_shell(self) -> None:
        no_proxy = self.no_proxy_written()
        for name in ("alpha-svc", "beta_svc"):
            self.assertIn(name, no_proxy)
        # A comment line at column zero is not the end of the services block.
        self.assertIn("localhost", no_proxy)
        self.assertIn("127.0.0.1", no_proxy)
        self.assertIn("172.30.0.0/24", no_proxy)
        # The exported shell value and the JSON value must be the same list, or `curl` from a terminal and a
        # fetch from a container disagree about what bypasses the proxy.
        bashrc = self.bashrc.read_text()
        for name in ("alpha-svc", "beta_svc"):
            self.assertIn(name, bashrc)
        self.assertIn(no_proxy, bashrc)

    def test_the_shipped_compose_file_is_the_default_source(self) -> None:
        # Scoped to the `services:` block: a two-space key elsewhere (an anchor's `default:`, a subnet
        # entry) is not a hostname anything will ever call, and counting it would make this test a
        # restatement of the script's own parser rather than a check on it.
        services: list[str] = []
        inside = False
        for line in (REPO_ROOT / "docker-compose.yml").read_text().splitlines():
            if not inside:
                inside = line.rstrip() == "services:"
                continue
            if line[:1].strip() and not line.startswith(" "):
                break
            if line.startswith("  #"):
                continue
            if line.startswith("  ") and not line.startswith("   ") and line.rstrip().endswith(":"):
                services.append(line.strip()[:-1])
        self.assertIn("osrm-car", services, "the shipped Compose file no longer has the service this bug is about")
        self.assertTrue(services, "no services found; the extractor this test guards needs updating")
        result = self.enable("--yes", "--skip-checks", "10.0.2.5", "3128")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        no_proxy = json.loads(self.docker_config.read_text())["proxies"]["default"]["noProxy"]
        for name in services:
            self.assertIn(name, no_proxy.split(","))

    def test_an_explicit_no_proxy_is_used_verbatim(self) -> None:
        # BOROBIYA_PROXY_NO_PROXY is the documented override; appending derived names to it would quietly
        # route something the operator excluded on purpose.
        no_proxy = self.no_proxy_written(BOROBIYA_PROXY_NO_PROXY="internal.example")
        self.assertEqual(no_proxy, "internal.example")

    def test_a_missing_compose_file_degrades_to_loopback_instead_of_failing(self) -> None:
        result = self.enable(
            "--yes", "--skip-checks", "10.0.2.5", "3128",
            BOROBIYA_PROXY_COMPOSE_FILE=str(self.root / "does-not-exist.yml"),
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        no_proxy = json.loads(self.docker_config.read_text())["proxies"]["default"]["noProxy"]
        self.assertEqual(
            no_proxy,
            "localhost,127.0.0.1,::1,host.docker.internal,gateway.docker.internal,172.30.0.0/24",
        )

    def test_the_library_says_the_client_key_reaches_runtime_containers(self) -> None:
        # The claim this whole class exists to keep true: an earlier comment called this key "the builder's",
        # which is exactly the misunderstanding that leaves a healthy stack unable to talk to itself.
        library = (REPO_ROOT / "scripts" / "proxy-common.sh").read_text()
        self.assertRegex(library, r"every\n#\s+container `docker compose up`")
        enable = (REPO_ROOT / "scripts" / "enable-proxy.sh").read_text()
        self.assertIn("applied to builds and to every container compose starts", enable)

class TestStatusReports(ScriptCase):
    def test_shell_proxy_credentials_are_redacted_in_both_status_commands(self) -> None:
        url = "http://alice:s%40cret@10.0.2.5:3128"
        for result in (self.enable("--status", http_proxy=url),
                       self.disable("--status", HTTP_PROXY=url)):
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("http://***:***@10.0.2.5:3128", result.stdout)
            self.assertNotIn("alice", result.stdout + result.stderr)
            self.assertNotIn("s%40cret", result.stdout + result.stderr)

    def test_foreign_proxy_credentials_are_redacted_in_status_and_refusal(self) -> None:
        foreign = self.etc / "apt" / "apt.conf.d" / "95proxy"
        foreign.write_text('Acquire::http::Proxy "http://corp:s%40cret@host.lan:3128";\n')
        for result in (self.enable("--status"), self.enable("10.0.2.5:3128", "--skip-checks")):
            self.assertIn("http://***:***@host.lan:3128", result.stdout)
            self.assertNotIn("corp", result.stdout + result.stderr)
            self.assertNotIn("s%40cret", result.stdout + result.stderr)
        self.assertFalse(self.state_file.exists())

    def test_username_only_proxy_urls_are_redacted_too(self) -> None:
        # Some pre-existing proxy files use URL userinfo with no literal colon.
        foreign = self.etc / "apt" / "apt.conf.d" / "95proxy"
        foreign.write_text('Acquire::http::Proxy "http://foreign-user@host.lan:3128";\n')
        result = self.enable("--status", http_proxy="http://shell-user@host.lan:3128")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.count("http://***:***@host.lan:3128"), 2)
        self.assertNotIn("foreign-user", result.stdout + result.stderr)
        self.assertNotIn("shell-user", result.stdout + result.stderr)

    def stub(self, names: dict[str, str]) -> str:
        """A PATH holding fake docker/systemctl, so a test can describe a machine this sandbox is not.

        The report bug that reached a real VM was invisible here for one reason: no docker binary, so
        the whole branch never ran. A stub makes that state reachable on purpose.
        """
        bin_dir = self.home / "stub-bin"
        bin_dir.mkdir(parents=True, exist_ok=True)
        for name, body in names.items():
            script = bin_dir / name
            script.write_text("#!/bin/sh\n" + body + "\n")
            script.chmod(0o755)
        return str(bin_dir)

    def test_a_running_daemon_with_no_proxy_still_asks_for_the_address(self) -> None:
        """The machine from the bug report: docker answers, and its unit environment has no proxy.

        Before the fix, `grep -i proxy` inside the report exited 1, `set -e` read that assignment as
        fatal, and enable-proxy.sh printed five lines and died — no prompt, no error, nothing a
        reader could act on. Only reproducible with a docker binary, so this stubs one.
        """
        path = self.stub({
            "docker": 'if [ "$1" = info ]; then exit 0; fi\nexit 0',
            "systemctl": 'printf "Environment=\n"\nexit 0',
        })
        # NO_SYSTEMD off, so the report asks the daemon; --no-system on, so the run does not write to
        # it. Reporting and writing are separate decisions and this test is about the first one.
        result = self.enable(
            "--dry-run", "--skip-checks", "--no-system", "--no-docker-config",
            PATH_EXTRA=path, BOROBIYA_PROXY_NO_SYSTEMD="0", PROXY_FORCE_FORM="1",
            stdin="10.0.2.5:3128\n",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Proxy address", result.stdout)
        self.assertIn("no proxy in the unit environment", result.stdout)
    def test_status_survives_a_daemon_that_reports_a_proxy(self) -> None:
        """The other half: when there *is* a proxy in the unit environment, say so, and say it cleanly."""
        path = self.stub({
            "docker": 'if [ "$1" = info ]; then exit 0; fi\nexit 0',
            "systemctl": 'printf "Environment=http_proxy=http://10.0.2.5:3128 https_proxy=http://10.0.2.5:3128\n"\nexit 0',
        })
        result = self.enable("--status", PATH_EXTRA=path, BOROBIYA_PROXY_NO_SYSTEMD="0")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("daemon env", result.stdout)
        self.assertIn("http://10.0.2.5:3128", result.stdout)
        self.assertNotIn("Environment=", result.stdout)  # systemctl's field name is not part of the value
    def test_daemon_proxy_credentials_are_redacted_in_status(self) -> None:
        path = self.stub({
            "docker": 'if [ "$1" = info ]; then exit 0; fi\nexit 0',
            "systemctl": 'printf "Environment=http_proxy=http://alice:s%%40cret@host.lan:3128\\n"\nexit 0',
        })
        result = self.enable("--status", PATH_EXTRA=path, BOROBIYA_PROXY_NO_SYSTEMD="0")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("http://***:***@host.lan:3128", result.stdout)
        self.assertNotIn("alice", result.stdout + result.stderr)
        self.assertNotIn("s%40cret", result.stdout + result.stderr)

    def test_status_survives_a_daemon_that_does_not_answer(self) -> None:
        """A docker CLI with no daemon behind it (the usual state before step 12) skips the line."""
        path = self.stub({"docker": "exit 1", "systemctl": "exit 1"})
        result = self.enable("--status", PATH_EXTRA=path, BOROBIYA_PROXY_NO_SYSTEMD="0")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("daemon env", result.stdout)
    def test_status_survives_a_host_without_systemd(self) -> None:
        """docker answers and systemctl does not exist (a container host, WSL without systemd)."""
        if shutil.which("systemctl") is not None:
            self.skipTest("this host has a real systemctl, so the no-systemd shape cannot be faked")
        path = self.stub({"docker": 'if [ "$1" = info ]; then exit 0; fi\nexit 0'})
        result = self.enable("--status", PATH_EXTRA=path, BOROBIYA_PROXY_NO_SYSTEMD="0")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("daemon env", result.stdout)
    def test_disabling_a_never_enabled_machine_asks_nothing(self) -> None:
        """disable-proxy.sh with no flags on a clean VM: exit 0, an explanation, no [y/N].

        Every earlier test called disable through a helper that passes --yes, so the confirmation
        path — the thing a reader actually walks into after runbook § 5.4 — had never run against a
        machine with nothing to remove.
        """
        result = subprocess.run(
            [str(DISABLE)], input="", capture_output=True, text=True, check=False,
            env=self.base_env(), cwd=REPO_ROOT, timeout=90,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Nothing to remove", result.stdout)
        self.assertIn("nothing to remove", result.stdout)
        self.assertNotIn("[y/N]", result.stdout)
        self.assertIn("5.1a", result.stdout)  # the host-side half it cannot reach, named at the moment
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
