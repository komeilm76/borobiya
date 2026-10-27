"""Offline operator-script tests: no Docker daemon, package install, VM or network needed."""
from __future__ import annotations

import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import vm  # noqa: E402
import vm_common  # noqa: E402


def load_hyphen(name: str):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), SCRIPTS / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


vm_map = load_hyphen("vm-map")
vm_env = load_hyphen("vm-env")


class MapSelectionTests(unittest.TestCase):
    def test_country_city_changes_and_offline_policy_do_not_touch_live_env(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / ".vm-map.json"
            with patch.object(vm_map, "CONFIG", config):
                for command in (
                    ["--set", "ir-tehran,de-frankfurt", "--policy", "offline", "--library", directory],
                    ["--add", "de-berlin"],
                    ["--remove", "ir-tehran"],
                ):
                    with patch.object(sys, "argv", ["vm-map.py", *command]), redirect_stdout(io.StringIO()):
                        vm_map.main()
                saved = json.loads(config.read_text())
                self.assertEqual(saved["regions"], "de-frankfurt,de-berlin")
                self.assertEqual(saved["policy"], "offline")
                self.assertEqual(config.stat().st_mode & 0o777, 0o600)
                before = config.read_bytes()
                with patch.object(sys, "argv", ["vm-map.py", "--remove", "de-nonexistent"]):
                    with self.assertRaises(SystemExit):
                        vm_map.main()
                self.assertEqual(config.read_bytes(), before)

    def test_first_configuration_preserves_existing_active_env_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / ".vm-map.json"
            active = {"MAP_REGION_IDS": "de-berlin", "MAP_LIBRARY_DIR": directory,
                      "MAP_SNAPSHOT": "pinned", "MAP_SOURCE_POLICY": "cache-first"}
            with patch.object(vm_map, "CONFIG", config), patch.object(vm_map, "env_values", return_value=active), \
                 patch.object(sys, "argv", ["vm-map.py", "--policy", "offline"]), redirect_stdout(io.StringIO()):
                vm_map.main()
            self.assertEqual(json.loads(config.read_text())["regions"], "de-berlin")
            self.assertEqual(json.loads(config.read_text())["policy"], "offline")

    def test_rejects_repository_path_and_symlinked_config(self):
        with self.assertRaises(SystemExit):
            vm_map.library_path(str(vm_map.ROOT / "map-server"))
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "selection"
            config.symlink_to(Path(directory) / "other")
            with patch.object(vm_map, "CONFIG", config), self.assertRaises(SystemExit):
                vm_map.load()


class EnvTests(unittest.TestCase):
    def test_secrets_atomic_idempotent_and_mode_600(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env.example").write_text((vm_common.ROOT / ".env.example").read_text())
            env = root / ".env"
            with (patch.object(vm_env, "ENV", env), patch.object(vm_env, "ROOT", root),
                  patch.object(vm_common, "ENV", env), patch.object(vm_env, "volume", return_value=None)):
                for _ in range(2):
                    with patch.object(sys, "argv", ["vm-env.py", "--mode", "development", "--generate-admin"]):
                        with redirect_stdout(io.StringIO()):
                            vm_env.main()
                    secrets = vm_common.env_values()
                    if _ == 0:
                        first = secrets
                    else:
                        for key in ("POSTGRES_PASSWORD", "NOMINATIM_PASSWORD", "JWT_SECRET",
                                    "JWT_REFRESH_SECRET", "ADMIN_SEED_PASSWORD_B64"):
                            self.assertEqual(secrets[key], first[key])
                self.assertEqual(env.stat().st_mode & 0o777, 0o600)
                self.assertNotEqual(secrets["JWT_SECRET"], secrets["JWT_REFRESH_SECRET"])
                self.assertIn(secrets["POSTGRES_PASSWORD"], secrets["DATABASE_URL"])
                self.assertNotIn("change-me", env.read_text())

    def test_missing_password_checks_docker_before_mode_prompt_or_env_write(self):
        with patch.object(vm_env, "env_values", return_value={}), \
             patch.object(vm_env, "volume", side_effect=SystemExit("docker socket denied")) as volume, \
             patch.object(vm_env, "update_env") as writer, \
             patch("builtins.input", side_effect=AssertionError("mode prompt came before Docker check")), \
             patch.object(sys, "argv", ["vm-env.py"]):
            with self.assertRaisesRegex(SystemExit, "docker socket denied"):
                vm_env.main()
            volume.assert_called_once_with("postgres-data")
            writer.assert_not_called()

    def test_generated_admin_password_is_not_announced_as_saved_when_volume_appears(self):
        with patch.object(vm_env, "env_values", return_value={}), \
             patch.object(vm_env, "volume", side_effect=[None, None, "project_postgres-data"]), \
             patch.object(vm_env, "update_env") as writer, \
             patch.object(sys.stdin, "isatty", return_value=True), \
             patch.object(sys, "argv", ["vm-env.py", "--mode", "development", "--generate-admin"]), \
             redirect_stdout(io.StringIO()) as output:
            with patch.object(sys.stdout, "isatty", return_value=True), \
                 self.assertRaisesRegex(SystemExit, "appeared during setup"):
                vm_env.main()
        writer.assert_not_called()
        self.assertNotIn("Generated admin password", output.getvalue())

    def test_generated_admin_password_is_announced_only_after_env_write(self):
        with redirect_stdout(io.StringIO()) as output:
            def writer(changes):
                self.assertIn("ADMIN_SEED_PASSWORD_B64", changes)
                self.assertNotIn("Generated admin password", output.getvalue())

            with patch.object(vm_env, "env_values", return_value={}), \
                 patch.object(vm_env, "volume", return_value=None), \
                 patch.object(vm_env, "update_env", side_effect=writer), \
                 patch.object(sys.stdin, "isatty", return_value=True), \
                 patch.object(sys.stdout, "isatty", return_value=True), \
                 patch.object(sys, "argv", ["vm-env.py", "--mode", "development", "--generate-admin"]):
                vm_env.main()
        self.assertIn("Generated admin password", output.getvalue())

    def test_generated_admin_password_is_not_announced_on_env_write_failure(self):
        with patch.object(vm_env, "env_values", return_value={}), \
             patch.object(vm_env, "volume", return_value=None), \
             patch.object(vm_env, "update_env", side_effect=OSError("disk full")), \
             patch.object(sys.stdin, "isatty", return_value=True), \
             patch.object(sys, "argv", ["vm-env.py", "--mode", "development", "--generate-admin"]), \
             redirect_stdout(io.StringIO()) as output:
            with patch.object(sys.stdout, "isatty", return_value=True), self.assertRaises(OSError):
                vm_env.main()
        self.assertNotIn("Generated admin password", output.getvalue())

    def test_volume_created_during_password_prompt_is_not_overwritten(self):
        with patch.object(vm_env, "env_values", return_value={"ADMIN_SEED_PASSWORD_B64": "c2VjcmV0"}), \
             patch.object(vm_env, "volume", side_effect=[None, None, "project_postgres-data"]) as volume, \
             patch.object(vm_env, "update_env") as writer, \
             patch.object(sys, "argv", ["vm-env.py", "--mode", "development"]):
            with self.assertRaisesRegex(SystemExit, "appeared during setup"):
                vm_env.main()
        self.assertEqual(volume.call_count, 3)
        writer.assert_not_called()

    def test_docker_access_hint_only_offers_group_repair_for_inaccessible_local_socket(self):
        with patch.dict(os.environ, {"DOCKER_HOST": "", "DOCKER_CONTEXT": ""}), \
             patch.object(vm_common.os, "geteuid", return_value=1000), \
             patch.object(vm_common.os, "getegid", return_value=1000), \
             patch.object(vm_common.os, "getgroups", return_value=[1000]), \
             patch.object(vm_common.Path, "is_socket", return_value=True), \
             patch.object(vm_common.Path, "stat", return_value=SimpleNamespace(st_gid=999)), \
             patch.object(vm_common.grp, "getgrgid", return_value=SimpleNamespace(gr_name="docker")):
            self.assertIn("--enable-docker-access", vm_common.docker_access_hint())
        with patch.dict(os.environ, {"DOCKER_HOST": "tcp://other-host"}):
            self.assertNotIn("--enable-docker-access", vm_common.docker_access_hint())

    def test_volume_listing_permission_error_provides_session_repair_without_leaking_stderr(self):
        denied = subprocess.CalledProcessError(1, ["docker", "volume", "ls"], stderr="secret from daemon")
        with patch.object(vm_common, "project", return_value="borobiya"), \
             patch.object(vm_common, "run", side_effect=[denied, denied]), \
             patch.object(vm_common, "docker_access_hint", return_value="reconnect SSH or newgrp docker"):
            with self.assertRaises(SystemExit) as error:
                vm_common.volume("postgres-data")
        message = str(error.exception)
        self.assertIn("reconnect SSH or newgrp docker", message)
        self.assertNotIn("secret from daemon", message)

    def test_production_rerun_keeps_existing_origin_and_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env.example").write_text((vm_common.ROOT / ".env.example").read_text())
            env = root / ".env"
            with patch.object(vm_env, "ENV", env), patch.object(vm_env, "ROOT", root), \
                 patch.object(vm_common, "ENV", env), patch.object(vm_env, "volume", return_value=None):
                with patch.object(sys, "argv", ["vm-env.py", "--mode", "production", "--origin",
                                                     "https://maps.example.org", "--generate-admin"]), \
                     redirect_stdout(io.StringIO()):
                    vm_env.main()
                first = vm_common.env_values()
                with patch.object(sys, "argv", ["vm-env.py", "--mode", "production", "--generate-admin"]), \
                     redirect_stdout(io.StringIO()):
                    vm_env.main()
                self.assertEqual(vm_common.env_values(), first)
                self.assertEqual(first["CORS_ORIGINS"], "https://maps.example.org")
                self.assertEqual(first["PUBLIC_DOMAIN"], "maps.example.org")
                with patch.object(sys, "argv", ["vm-env.py", "--mode", "development", "--generate-admin"]), \
                     redirect_stdout(io.StringIO()):
                    vm_env.main()
                development = vm_common.env_values()
                self.assertEqual(development["PUBLIC_DOMAIN"], "")
                self.assertEqual(development["CORS_ORIGINS"],
                                 "http://localhost:5173,http://localhost:3000,http://localhost:8080")
                for key in ("POSTGRES_PASSWORD", "NOMINATIM_PASSWORD", "JWT_SECRET", "JWT_REFRESH_SECRET"):
                    self.assertEqual(development[key], first[key])

    def test_refuses_password_generation_for_existing_database_volume(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env.example").write_text((vm_common.ROOT / ".env.example").read_text())
            env = root / ".env"
            with (patch.object(vm_env, "ENV", env), patch.object(vm_env, "ROOT", root),
                  patch.object(vm_common, "ENV", env), patch.object(vm_env, "volume", return_value="project_postgres-data"),
                  patch.object(sys, "argv", ["vm-env.py", "--mode", "production", "--origin", "https://example.org",
                                                 "--generate-admin"])):
                with self.assertRaises(SystemExit):
                    vm_env.main()
                self.assertFalse(env.exists())
        for value in ("http://example.org", "https://a.org,https://b.org", "https://a.org:invalid"):
            with self.assertRaises(SystemExit):
                vm_env.origin(value)


class RunbookSafetyTests(unittest.TestCase):
    def test_vm_guides_use_one_nonrotating_env_writer_and_scoped_cleanup(self):
        docs = vm.ROOT / "docs"
        runbook = (docs / "UBUNTU_VM_RUNBOOK.md").read_text()
        quick = (docs / "UBUNTU_VM_QUICKSTART.md").read_text()
        diagnostic = (docs / "UBUNTU_VM_DIAGNOSTICS.md").read_text()
        for guide in (runbook, quick, diagnostic):
            self.assertIn("scripts/vm.py doctor", guide)
        self.assertIn("python3 scripts/vm-env.py", runbook)
        self.assertIn("python3 scripts/vm-map.py", runbook)
        self.assertIn("python3 scripts/vm.py destroy --backup", runbook)
        self.assertNotIn("NEW=$(openssl rand -hex 32)", runbook)
        self.assertNotIn("docker volume rm <project>_postgres-data", runbook)
        self.assertNotIn("./scripts/clear-map-cache.sh --yes", runbook)
        self.assertNotIn('rm -rf -- "$MAP_OSRM_DATA_DIR"', runbook)

    def test_expired_snapshot_guidance_updates_saved_selection_not_only_env(self):
        docs = vm.ROOT / "docs"
        for name in ("UBUNTU_VM_QUICKSTART.md", "UBUNTU_VM_RUNBOOK.md", "UBUNTU_VM_DIAGNOSTICS.md"):
            guide = (docs / name).read_text()
            self.assertIn("scripts/vm-map.py --snapshot latest --policy cache-first", guide)
        runbook = (docs / "UBUNTU_VM_RUNBOOK.md").read_text()
        self.assertNotIn("remedy is one `.env` line", runbook)
        diagnostic = (docs / "UBUNTU_VM_DIAGNOSTICS.md").read_text()
        self.assertIn("pinned HTTP=%{http_code}", diagnostic)
        self.assertIn("proxy can return its own 404", diagnostic)

    def test_guides_describe_doctor_as_an_auth_probe_not_a_migration_check(self):
        docs = vm.ROOT / "docs"
        quick = (docs / "UBUNTU_VM_QUICKSTART.md").read_text()
        diagnostic = (docs / "UBUNTU_VM_DIAGNOSTICS.md").read_text()
        runbook = (docs / "UBUNTU_VM_RUNBOOK.md").read_text()
        self.assertIn("SELECT 1", quick)
        self.assertIn("SELECT 1", diagnostic)
        self.assertIn("SELECT 1", runbook)
        self.assertIn("does **not** prove migrations", quick)
        self.assertIn("does not verify migrations", diagnostic)
        self.assertIn("-password", runbook)
        self.assertIn("host Java process arguments", runbook)


class InstallerTests(unittest.TestCase):
    def test_runbook_docker_source_uses_codename_value_not_assignment(self):
        runbook = (vm.ROOT / "docs/UBUNTU_VM_RUNBOOK.md").read_text()
        self.assertNotIn("$(grep VERSION_CODENAME /etc/os-release", runbook)
        self.assertIn('"$(dpkg --print-architecture)" "$VERSION_CODENAME" | sudo tee', runbook)
        self.assertIn("/etc/apt/sources.list.d/docker.list", runbook)
        self.assertIn('sudo install -m 0644 "$DOCKER_KEY" /etc/apt/keyrings/docker.asc', runbook)
        self.assertIn("signed-by=/etc/apt/keyrings/docker.asc", runbook)
        self.assertNotIn("sudo gpg --dearmor < /tmp/docker.gpg >", runbook)
        self.assertIn("sudo test -s \"$KEY\"", runbook)
        self.assertIn("signed-by=/etc/apt/keyrings/docker.gpg|signed-by=/etc/apt/keyrings/docker.asc", runbook)
        self.assertIn("APT::Update::Error-Mode=any update", runbook)

    def test_reports_incompatible_versions_without_installing_anything(self):
        with tempfile.TemporaryDirectory() as directory:
            bin_dir = Path(directory)
            for name, body in {
                "java": 'echo \'openjdk version "17.0.9"\' >&2',
                "osmium": 'echo "osmium version 1.15.0"',
                "bun": 'echo "0.9.0"',
                "docker": 'if [ "$1" = compose ]; then echo "2.30.0"; elif [ "$1" = info ]; then '
                          'exit 0; else echo "Docker version 25.0.0"; fi',
            }.items():
                path = bin_dir / name
                path.write_text("#!/bin/sh\n" + body + "\n")
                path.chmod(0o755)
            result = subprocess.run(["bash", str(SCRIPTS / "vm-install.sh"), "--check"], cwd=vm.ROOT,
                                    env={**os.environ, "PATH": str(bin_dir) + ":" + os.environ["PATH"]},
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 1)
            for expected in ("need Java >=21", "need 1.16.0", "pin 1.4.3"):
                self.assertIn(expected, result.stdout)
            self.assertIn("Docker daemon access", result.stdout)

    def test_check_rejects_daemon_that_denies_required_volume_listing(self):
        with tempfile.TemporaryDirectory() as directory:
            docker = Path(directory) / "docker"
            docker.write_text("#!/bin/sh\n"
                              'if [ "$1" = info ]; then exit 0; fi\n'
                              'if [ "$1" = volume ]; then echo "volume listing denied" >&2; exit 1; fi\n'
                              'if [ "$1" = compose ]; then echo 5.6.1; exit 0; fi\n'
                              'echo "Docker version 29.9.2"\n')
            docker.chmod(0o755)
            result = subprocess.run(["bash", str(SCRIPTS / "vm-install.sh"), "--check"], cwd=vm.ROOT,
                                    env={**os.environ, "PATH": directory + ":" + os.environ["PATH"]},
                                    capture_output=True, text=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Docker volume inspection", result.stdout)
            self.assertIn("UNAVAILABLE", result.stdout)
            self.assertNotIn("volume listing denied", result.stdout + result.stderr)
            self.assertNotIn("Prerequisites OK", result.stdout)

    def test_group_grant_requires_explicit_option_and_typed_interactive_consent(self):
        installer = (SCRIPTS / "vm-install.sh").read_text()
        self.assertIn("--enable-docker-access", installer)
        self.assertIn("[[ -t 0 && -t 1 ]]", installer)
        self.assertIn("GRANT DOCKER ACCESS", installer)
        self.assertIn('as_root usermod -aG docker "$login"', installer)
        self.assertIn("A child script cannot change the groups of its parent shell", installer)
        with tempfile.TemporaryDirectory() as directory:
            docker = Path(directory) / "docker"
            docker.write_text("#!/bin/sh\n[ \"$1\" = info ]\n")
            docker.chmod(0o755)
            result = subprocess.run(["bash", str(SCRIPTS / "vm-install.sh"), "--enable-docker-access"],
                                    cwd=vm.ROOT, env={**os.environ, "PATH": directory + ":" + os.environ["PATH"]},
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("already works", result.stdout)

    def test_group_grant_does_not_escalate_when_login_is_stale_or_no_tty(self):
        # Exercise the real installer function without running sudo or touching host groups.
        source = (SCRIPTS / "vm-install.sh").read_text()
        function = "enable_docker_access() {" + source.split("enable_docker_access() {", 1)[1].split("\n}\n", 1)[0] + "\n}"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, body in {
                "docker": "exit 1",
                "stat": 'echo 1234',
                "id": 'if [ "$1" = -un ]; then echo operator; elif [ "${LOGIN_IS_MEMBER:-}" = 1 ]; '
                      'then echo "1001 1234"; else echo 1001; fi',
            }.items():
                binary = root / name
                binary.write_text("#!/bin/sh\n" + body + "\n")
                binary.chmod(0o755)
            shell = ("set -euo pipefail\n"
                     "as_root() { touch \"$CAPTURE\"; }\n"
                     "socket_group_missing() { return 0; }\n"
                     "next_docker_session() { echo 'new group shell required'; }\n"
                     + function + "\nenable_docker_access\n")
            for member, expected_code, expected_text in (
                ("1", 0, "already in the docker group"),
                ("0", 1, "requires an interactive terminal"),
            ):
                capture = root / "unexpected-grant"
                result = subprocess.run(["bash", "-c", shell], cwd=vm.ROOT, capture_output=True, text=True,
                                        env={**os.environ, "PATH": directory + ":" + os.environ["PATH"],
                                             "CAPTURE": str(capture), "LOGIN_IS_MEMBER": member}, check=False)
                self.assertEqual(result.returncode, expected_code, result.stderr)
                self.assertIn(expected_text, result.stdout + result.stderr)
                self.assertFalse(capture.exists())

    def test_compose_plugin_accepts_newer_major_and_has_plugin_only_repair(self):
        with tempfile.TemporaryDirectory() as directory:
            docker = Path(directory) / "docker"
            docker.write_text("#!/bin/sh\nif [ \"$1\" = compose ]; then echo 5.4.0; "
                              "elif [ \"$1\" = info ]; then exit 0; else echo 'Docker version 29.1.3'; fi\n")
            docker.chmod(0o755)
            result = subprocess.run(["bash", str(SCRIPTS / "vm-install.sh"), "--check"], cwd=vm.ROOT,
                                    env={**os.environ, "PATH": directory + ":" + os.environ["PATH"]},
                                    capture_output=True, text=True, check=False)
            self.assertRegex(result.stdout, r"docker compose\s+OK\s+5\.4\.0")
            self.assertNotIn("INCOMPATIBLE (need Compose plugin", result.stdout)
        installer = (SCRIPTS / "vm-install.sh").read_text()
        self.assertIn("--install-compose", installer)
        self.assertIn("pkg=docker-compose-v2", installer)
        self.assertIn("pkg=docker-compose-plugin", installer)
        self.assertIn("--no-remove --no-upgrade", installer)
        self.assertIn("APT::Update::Error-Mode=any", installer)


class OperationsTests(unittest.TestCase):
    def test_down_stops_import_and_previous_production_profiles_without_starting_them(self):
        with patch.object(vm, "env_values", return_value={"NODE_ENV": "development"}), \
             patch.object(vm, "run") as run:
            vm.vm_compose("down")
            down = run.call_args.args[0]
            self.assertIn("geocoding-import", down)
            self.assertIn("production", down)
            vm.vm_compose("up", "-d")
            up = run.call_args.args[0]
            self.assertNotIn("geocoding-import", up)
            self.assertNotIn("production", up)

    def test_dev_launch_stops_and_removes_previous_public_edge(self):
        with patch.object(vm, "env_values", return_value={"NODE_ENV": "development"}), \
             patch.object(vm, "run", side_effect=[SimpleNamespace(stdout="edge-container\n"), None, None]) as run:
            vm.stop_inactive_edge()
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(commands[0][-4:], ["ps", "-a", "-q", "edge"])
        self.assertEqual(commands[1][-2:], ["stop", "edge"])
        self.assertEqual(commands[2][-3:], ["rm", "-f", "edge"])
        self.assertTrue(all("production" in command for command in commands))
        with patch.object(vm, "env_values", return_value={"NODE_ENV": "development"}), \
             patch.object(vm, "run", return_value=SimpleNamespace(stdout="")) as run:
            vm.stop_inactive_edge()
        self.assertEqual(run.call_count, 1)

    def test_doctor_reports_saved_snapshot_pending_without_claiming_it_is_active(self):
        class Response:
            status = 200
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                return False
            def read(self, _size):
                return b"<html>ok</html>"

        def command(args, **_kwargs):
            return SimpleNamespace(stdout="1\n" if "psql" in str(args) else "")

        env = {"NODE_ENV": "development", "NGINX_PORT": "8080", "MAP_REGION_IDS": "ir-tehran",
               "MAP_LIBRARY_DIR": "/library", "MAP_SNAPSHOT": "pinned", "MAP_SNAPSHOT_DATE": "2026-10-18",
               "JWT_SECRET": "a" * 32, "JWT_REFRESH_SECRET": "b" * 32,
               "POSTGRES_PASSWORD": "secret", "NOMINATIM_PASSWORD": "secret"}
        config = {"regions": "ir-tehran", "library": "/library", "snapshot": "latest", "policy": "cache-first"}
        with patch.object(vm, "env_values", return_value=env), \
             patch.object(vm, "configured_map", return_value=config), \
             patch.object(vm, "static_ready", return_value=True), \
             patch.object(vm, "run", side_effect=command), \
             patch.object(vm, "compose", return_value=SimpleNamespace(stdout="db\n")), \
             patch.object(vm, "build_opener", return_value=SimpleNamespace(open=lambda *_a, **_kw: Response())), \
             redirect_stdout(io.StringIO()) as output:
            self.assertEqual(vm.doctor(), 0)
            self.assertIn("latest map snapshot is pending", output.getvalue())
            config["snapshot"] = "2026-10-26"
            output.seek(0)
            output.truncate()
            self.assertEqual(vm.doctor(), 0)
            self.assertIn("saved map snapshot/version differs", output.getvalue())
            config["snapshot"] = "pinned"
            env["MAP_DATA_VERSION"] = "2026-10-26"
            output.seek(0)
            output.truncate()
            self.assertEqual(vm.doctor(), 0)
            self.assertIn("saved map snapshot/version differs", output.getvalue())

    def test_doctor_flags_public_edge_left_running_in_development(self):
        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _size):
                return b"<html>ok</html>"

        def command(args, **_kwargs):
            if args[-3:] == ["ps", "-q", "edge"]:
                return SimpleNamespace(stdout="public-edge\n")
            if "psql" in str(args):
                return SimpleNamespace(stdout="1\n")
            return SimpleNamespace(stdout="")

        env = {"NODE_ENV": "development", "NGINX_PORT": "8080", "MAP_REGION_IDS": "ir-tehran",
               "JWT_SECRET": "a" * 32, "JWT_REFRESH_SECRET": "b" * 32,
               "POSTGRES_PASSWORD": "secret", "NOMINATIM_PASSWORD": "secret"}
        with patch.object(vm, "env_values", return_value=env), \
             patch.object(vm, "configured_map", return_value={"regions": "ir-tehran", "policy": "cache-first"}), \
             patch.object(vm, "static_ready", return_value=True), \
             patch.object(vm, "run", side_effect=command), \
             patch.object(vm, "compose", return_value=SimpleNamespace(stdout="db\n")), \
             patch.object(vm, "build_opener", return_value=SimpleNamespace(open=lambda *_args, **_kw: Response())), \
             redirect_stdout(io.StringIO()) as output:
            self.assertEqual(vm.doctor(), 1)
        self.assertIn("old public TLS edge still running", output.getvalue())

    def test_stop_preserves_data_and_clear_db_requires_backup_and_confirmation(self):
        with patch.object(vm, "vm_compose") as compose, patch.object(vm, "volume", return_value="project_postgres-data"), \
             patch.object(vm, "remove_volumes") as remove, patch.object(vm, "confirm") as confirm, \
             patch.object(vm, "backup") as backup, patch.object(sys.stdin, "isatty", return_value=True):
            vm.stop(False, None, False)
            compose.assert_called_with("down")
            remove.assert_not_called()
            with self.assertRaises(SystemExit):
                vm.stop(True, None, False)
            confirm.assert_not_called()
            compose.assert_called_once()
            vm.stop(True, "/safe/new.dump", False)
            backup.assert_called_once_with("/safe/new.dump")
            confirm.assert_called_once_with("DELETE DATABASE")
            remove.assert_called_once_with(["postgres-data"])

    def test_destroy_never_uses_down_v_or_global_prune(self):
        with patch.object(vm, "volume", return_value=None), patch.object(vm, "run") as run, \
             patch.object(vm, "vm_compose") as compose, patch.object(vm, "remove_volumes") as remove, \
             patch.object(vm, "confirm") as confirm, patch.object(sys.stdin, "isatty", return_value=True):
            vm.destroy(None, False)
            self.assertEqual(run.call_count, 2)  # dry-run BEFORE confirmation; apply afterwards
            self.assertEqual(Path(run.call_args_list[0].args[0][-1]).name, "clear-map-cache.py")
            self.assertEqual(run.call_args_list[1].args[0][-1], "--yes")
            confirm.assert_called_once_with("DESTROY BOROBIYA DATA")
            compose.assert_called_once_with("down")
            remove.assert_called_once_with(["postgres-data", "borobiya-uploads", "nominatim-data", "caddy-data", "caddy-config"])

    def test_latest_snapshot_is_pinned_after_verified_setup_not_on_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            config_file = Path(directory) / ".vm-map.json"
            selection = {"regions": "ir-tehran", "library": directory,
                         "snapshot": "latest", "policy": "cache-first"}
            config_file.write_text(json.dumps(selection))
            active = {"MAP_REGION_IDS": "ir-tehran", "MAP_LIBRARY_DIR": directory,
                      "MAP_SNAPSHOT": "2026-10-27", "MAP_SNAPSHOT_DATE": "2026-10-27"}
            with patch.object(vm, "MAP_CONFIG", config_file), patch.object(vm_common, "MAP_CONFIG", config_file):
                with self.assertRaises(SystemExit):
                    vm.pin_resolved_snapshot(selection, {**active, "MAP_SNAPSHOT_DATE": "2026-10-26"})
                self.assertEqual(json.loads(config_file.read_text()), selection)
                operator_edit = {**selection, "regions": "de-berlin"}
                config_file.write_text(json.dumps(operator_edit))
                with self.assertRaisesRegex(SystemExit, "changed during launch"):
                    vm.pin_resolved_snapshot(selection, active)
                self.assertEqual(json.loads(config_file.read_text()), operator_edit)
                config_file.write_text(json.dumps(selection))
                updated = vm.pin_resolved_snapshot(selection, active)
            self.assertEqual(updated["snapshot"], "2026-10-27")
            self.assertEqual(json.loads(config_file.read_text()), updated)
            self.assertEqual(config_file.stat().st_mode & 0o777, 0o600)
            self.assertEqual(updated["regions"], "ir-tehran")

    def test_cache_first_fallback_is_pinned_only_after_verified_setup(self):
        with tempfile.TemporaryDirectory() as directory:
            config_file = Path(directory) / ".vm-map.json"
            active = {"MAP_REGION_IDS": "ir", "MAP_LIBRARY_DIR": directory,
                      "MAP_SOURCE_POLICY": "cache-first",
                      "MAP_SNAPSHOT": "2026-10-26", "MAP_SNAPSHOT_DATE": "2026-10-26"}
            with patch.object(vm, "MAP_CONFIG", config_file), patch.object(vm_common, "MAP_CONFIG", config_file):
                for requested in ("pinned", "2026-10-18"):
                    selection = {"regions": "ir", "library": directory,
                                 "snapshot": requested, "policy": "cache-first"}
                    config_file.write_text(json.dumps(selection))
                    updated = vm.pin_resolved_snapshot(selection, active)
                    self.assertEqual(updated["snapshot"], "2026-10-26")
                    self.assertEqual(json.loads(config_file.read_text()), updated)
                    config_file.write_text(json.dumps({**selection, "policy": "offline"}))
                    with self.assertRaisesRegex(SystemExit, "without cache-first fallback"):
                        vm.pin_resolved_snapshot({**selection, "policy": "offline"}, active)
                    config_file.write_text(json.dumps(selection))
                    with self.assertRaisesRegex(SystemExit, "without cache-first fallback"):
                        vm.pin_resolved_snapshot(selection, {**active, "MAP_SOURCE_POLICY": "offline"})
                self.assertEqual(json.loads(config_file.read_text())["snapshot"], "2026-10-18")

    def test_full_launch_pins_latest_only_after_setup_succeeds(self):
        selection = {"regions": "ir-tehran", "snapshot": "latest", "policy": "cache-first", "library": "/maps"}
        active = {"MAP_SNAPSHOT_DATE": "2026-10-27", "MAP_SNAPSHOT": "2026-10-27",
                  "MAP_REGION_IDS": "ir-tehran", "MAP_LIBRARY_DIR": "/maps"}
        with patch.object(vm, "require_env", return_value={"NODE_ENV": "development"}), \
             patch.object(vm, "configured_map", return_value=selection), \
             patch.object(vm, "stop_inactive_edge"), \
             patch.object(vm, "run", side_effect=subprocess.CalledProcessError(1, "setup")), \
             patch.object(vm, "pin_resolved_snapshot") as pin:
            with self.assertRaises(subprocess.CalledProcessError):
                vm.launch(SimpleNamespace(serve_only=False, offline=False))
            pin.assert_not_called()

        calls = []
        def fake_run(_args):
            calls.append("setup" if "setup-ubuntu-vm.sh" in str(_args) else "build")
        def fake_pin(config, env):
            calls.append("pin")
            self.assertEqual(config["snapshot"], "latest")
            self.assertEqual(env, active)
            return {**config, "snapshot": active["MAP_SNAPSHOT_DATE"]}
        with patch.object(vm, "require_env", return_value={"NODE_ENV": "development"}), \
             patch.object(vm, "configured_map", return_value=selection), \
             patch.object(vm, "env_values", return_value=active), \
             patch.object(vm, "stop_inactive_edge"), \
             patch.object(vm, "run", side_effect=fake_run), \
             patch.object(vm, "pin_resolved_snapshot", side_effect=fake_pin), \
             patch.object(vm, "verify_serving_artifacts"), \
             patch.object(vm, "vm_compose"):
            vm.launch(SimpleNamespace(serve_only=False, offline=False))
        self.assertEqual(calls[:2], ["setup", "pin"])

    def test_strict_offline_launch_rejects_mismatched_selection_and_never_builds(self):
        with tempfile.TemporaryDirectory() as directory:
            library = Path(directory)
            dataset = library / "datasets/snapshot-one"
            for path in (dataset, dataset / "routing/car", dataset / "routing/bicycle",
                         dataset / "routing/foot", dataset / "geocoding/photon_data"):
                path.mkdir(parents=True)
            for path in (dataset / "borobiya.pmtiles", dataset / "borobiya.osm.pbf",
                         dataset / "borobiya.source.json", dataset / "geocoding/photon_data/index",
                         *(dataset / "routing" / profile / "borobiya.osrm" for profile in ("car", "bicycle", "foot"))):
                path.write_bytes(b"data")
            (library / "current.json").write_text(json.dumps({"areas": ["ir-tehran"],
                                                               "datasetDir": str(dataset), "snapshotDate": "2026-10-18",
                                                               "bbox": [51.0, 35.5, 51.7, 35.9]}))
            values = {"MAP_REGION_IDS": "ir-tehran", "MAP_LIBRARY_DIR": directory, "MAP_REGION": "borobiya",
                      "MAP_SNAPSHOT": "pinned", "MAP_SNAPSHOT_DATE": "2026-10-18",
                      "MAP_DATA_VERSION": "2026-10-18", "MAP_BBOX": "51,35.5,51.7,35.9",
                      "MAP_DATASET_DIR": str(dataset), "MAP_DATA_DIR": str(dataset),
                      "MAP_OSRM_DATA_DIR": str(dataset / "routing"), "MAP_PHOTON_DATA_DIR": str(dataset / "geocoding")}
            selection = {"regions": "de-berlin", "library": directory, "snapshot": "pinned", "policy": "offline"}
            with patch.object(vm, "require_env", return_value=values), \
                 patch.object(vm, "configured_map", return_value=selection), \
                 patch.object(vm, "static_ready", return_value=True), \
                 patch.object(vm, "volume", return_value="scoped-volume"), \
                 patch.object(vm, "stop_inactive_edge") as stop_edge, \
                 patch.object(vm, "vm_compose") as compose:
                with self.assertRaises(SystemExit):
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()
                selection["regions"] = values["MAP_REGION_IDS"]
                selection["snapshot"] = "latest"
                with self.assertRaisesRegex(SystemExit, "pending"):  # unresolved latest must not serve old data
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()
                selection["snapshot"] = "2026-10-26"
                with self.assertRaisesRegex(SystemExit, "snapshot"):  # explicit date differs from active one
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()
                selection["snapshot"] = "pinned"
                vm.launch(SimpleNamespace(serve_only=True, offline=False))
                stop_edge.assert_called()
                compose.assert_called_once_with("up", "-d", "--no-build", "--pull", "never")
                compose.reset_mock()
                # A seemingly complete dataset may still describe a different
                # release/bbox to the browser or point outside the verified library.
                values["MAP_BBOX"] = "0,0,1,1"
                with self.assertRaisesRegex(SystemExit, "MAP_BBOX"):
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()
                values["MAP_BBOX"] = "51.0,35.5,51.7,35.9"  # numeric formatting is equivalent
                vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_called_once_with("up", "-d", "--no-build", "--pull", "never")
                compose.reset_mock()
                values["MAP_BBOX"] = "51,35.5,51.7,35.9"
                values["MAP_DATA_VERSION"] = "2026-10-26"
                with self.assertRaisesRegex(SystemExit, "snapshot|version"):
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()
                values["MAP_DATA_VERSION"] = "2026-10-18"
                values["MAP_SNAPSHOT_DATE"] = "2026-10-26"
                (library / "current.json").write_text(json.dumps({"areas": ["ir-tehran"],
                                                                   "datasetDir": str(dataset),
                                                                   "snapshotDate": "2026-10-26",
                                                                   "bbox": [51.0, 35.5, 51.7, 35.9]}))
                with self.assertRaisesRegex(SystemExit, "snapshot"):
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()
                values["MAP_SNAPSHOT_DATE"] = "2026-10-18"
                (library / "current.json").write_text(json.dumps({"areas": ["ir-tehran"],
                                                                   "datasetDir": str(dataset),
                                                                   "snapshotDate": "2026-10-18",
                                                                   "bbox": [51.0, 35.5, 51.7, 35.9]}))
                selection["snapshot"] = "2026-10-18"
                with self.assertRaisesRegex(SystemExit, "snapshot"):
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()
                values["MAP_SNAPSHOT"] = "2026-10-18"
                vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_called_once_with("up", "-d", "--no-build", "--pull", "never")
                compose.reset_mock()
                values["MAP_SNAPSHOT"] = "pinned"
                selection["snapshot"] = "pinned"
                (library / "current.json").write_text("[]")
                with self.assertRaisesRegex(SystemExit, "pointer"):
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()
                (library / "current.json").write_text(json.dumps({"areas": ["ir-tehran"],
                                                                   "datasetDir": str(dataset),
                                                                   "snapshotDate": "2026-10-18",
                                                                   "bbox": [51.0, 35.5, 51.7, 35.9]}))
                (library / "current.json").write_text(json.dumps({"areas": ["ir-tehran"],
                                                                   "datasetDir": str(dataset),
                                                                   "snapshotDate": "2026-10-18",
                                                                   "bbox": [10**1000, 35.5, 51.7, 35.9]}))
                with self.assertRaisesRegex(SystemExit, "MAP_BBOX"):
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()
                (library / "current.json").write_text(json.dumps({"areas": ["ir-tehran"],
                                                                   "datasetDir": str(dataset),
                                                                   "snapshotDate": "2026-10-18",
                                                                   "bbox": [51.0, 35.5, 51.7, 35.9]}))
                (library / "current.json").rename(library / "pointer-real.json")
                (library / "current.json").symlink_to("pointer-real.json")
                with self.assertRaisesRegex(SystemExit, "pointer is a symlink"):
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()
                (library / "current.json").unlink()
                (library / "pointer-real.json").rename(library / "current.json")
                (dataset / "routing").rename(dataset / "routing-real")
                (dataset / "routing").symlink_to("routing-real", target_is_directory=True)
                with self.assertRaisesRegex(SystemExit, "symlink"):
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()
                (dataset / "routing").unlink()
                (dataset / "routing-real").rename(dataset / "routing")
                (dataset / "geocoding/photon_data").rename(dataset / "geocoding/photon-real")
                (dataset / "geocoding/photon_data").symlink_to("photon-real", target_is_directory=True)
                with self.assertRaisesRegex(SystemExit, "symlink"):
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()
                (dataset / "geocoding/photon_data").unlink()
                (dataset / "geocoding/photon-real").rename(dataset / "geocoding/photon_data")
                # Offline serving uses the Photon index, not Nominatim's import DB.
                with patch.object(vm, "volume", side_effect=lambda name: None if name == "nominatim-data" else "present") as volume:
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                self.assertNotIn("nominatim-data", [call.args[0] for call in volume.call_args_list])
                compose.reset_mock()
                with patch.object(vm, "volume", return_value=None), self.assertRaises(SystemExit):
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()
                values["NODE_ENV"] = "production"
                with patch.object(vm, "volume", side_effect=lambda name: None if name == "caddy-data" else "present"), \
                     self.assertRaises(SystemExit):
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()
                values.pop("NODE_ENV")
                (dataset / "routing/foot/borobiya.osrm").unlink()
                with self.assertRaises(SystemExit):
                    vm.launch(SimpleNamespace(serve_only=True, offline=False))
                compose.assert_not_called()

    def test_clear_caches_dry_run_preserves_web_build_and_confirmed_apply_stops_first(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dist = root / "packages/client/dist"
            dist.mkdir(parents=True)
            (dist / "index.html").write_text("test")
            calls = []

            def stop(*_args):
                calls.append("stop")

            def cache_run(args):
                calls.append("apply" if args[-1] == "--yes" else "preview")
                self.assertTrue(dist.exists())

            with patch.object(vm, "ROOT", root), patch.object(vm, "run", side_effect=cache_run), \
                 patch.object(vm, "vm_compose", side_effect=stop), \
                 patch.object(vm, "confirm", side_effect=lambda _text: calls.append("confirmed")):
                vm.clear_caches(False)
                self.assertEqual(calls, ["preview"])
                self.assertTrue(dist.exists())
                vm.clear_caches(True)
                self.assertEqual(calls, ["preview", "preview", "confirmed", "stop", "apply"])
                self.assertFalse(dist.exists())

    def test_clear_caches_refuses_symlinked_browser_build_parent(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "repo"
            (root / "packages").mkdir(parents=True)
            outside = base / "outside-client"
            dist = outside / "dist"
            dist.mkdir(parents=True)
            protected = dist / "index.html"
            protected.write_text("not a project cache")
            (root / "packages/client").symlink_to(outside, target_is_directory=True)
            with patch.object(vm, "ROOT", root), patch.object(vm, "run") as run, \
                 patch.object(vm, "vm_compose") as compose, patch.object(vm, "confirm") as confirm:
                with self.assertRaisesRegex(SystemExit, "symlink"):
                    vm.clear_caches(True)
                run.assert_not_called()
                compose.assert_not_called()
                confirm.assert_not_called()
            self.assertEqual(protected.read_text(), "not a project cache")

    def test_clear_tools_refuses_symlinked_jar_parent(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "repo"
            (root / "map-server").mkdir(parents=True)
            outside = base / "outside-tools"
            outside.mkdir()
            protected = outside / "planetiler-1.20.0.jar"
            protected.write_bytes(b"not a project tool")
            (root / "map-server/tools").symlink_to(outside, target_is_directory=True)
            with patch.object(vm, "ROOT", root), patch.object(vm, "confirm") as confirm:
                with self.assertRaisesRegex(SystemExit, "symlink"):
                    vm.clear_tools(True)
                confirm.assert_not_called()
            self.assertEqual(protected.read_bytes(), b"not a project tool")

    def test_clear_caches_rechecks_browser_build_parent_after_confirmation(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "repo"
            client = root / "packages/client"
            (client / "dist").mkdir(parents=True)
            outside = base / "outside-client"
            (outside / "dist").mkdir(parents=True)
            protected = outside / "dist/index.html"
            protected.write_text("external build")

            def replace_parent(_phrase):
                client.rename(root / "packages/old-client")
                client.symlink_to(outside, target_is_directory=True)

            with patch.object(vm, "ROOT", root), patch.object(vm, "run") as run, \
                 patch.object(vm, "confirm", side_effect=replace_parent), \
                 patch.object(vm, "vm_compose") as compose:
                with self.assertRaisesRegex(SystemExit, "symlink"):
                    vm.clear_caches(True)
                run.assert_called_once()  # preview only; do not run the apply cleaner
                compose.assert_not_called()
            self.assertEqual(protected.read_text(), "external build")

    def test_clear_tools_rechecks_parent_after_confirmation_and_accepts_regular_jars(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "repo"
            tools = root / "map-server/tools"
            tools.mkdir(parents=True)
            local = tools / "planetiler-1.20.0.jar"
            local.write_bytes(b"local jar")
            extra = tools / "keep.txt"
            extra.write_text("keep")
            outside = base / "outside-tools"
            outside.mkdir()
            protected = outside / local.name
            protected.write_bytes(b"external jar")

            def replace_parent(_phrase):
                tools.rename(root / "map-server/old-tools")
                tools.symlink_to(outside, target_is_directory=True)

            with patch.object(vm, "ROOT", root), patch.object(vm, "confirm", side_effect=replace_parent):
                with self.assertRaisesRegex(SystemExit, "symlink"):
                    vm.clear_tools(True)
            self.assertEqual(protected.read_bytes(), b"external jar")
            self.assertEqual((root / "map-server/old-tools" / local.name).read_bytes(), b"local jar")
            tools.unlink()
            (root / "map-server/old-tools").rename(tools)
            with patch.object(vm, "ROOT", root), patch.object(vm, "confirm") as confirm:
                vm.clear_tools(True)
                confirm.assert_called_once_with("CLEAR TOOLS")
            self.assertFalse(local.exists())
            self.assertEqual(extra.read_text(), "keep")
            self.assertEqual(protected.read_bytes(), b"external jar")

    def test_backup_is_private_valid_pg_dump_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "new.dump"

            def dump(_args, **kwargs):
                self.assertIn("pg_dump", str(_args))
                self.assertNotIn("change-me", str(_args))
                kwargs["stdout"].write(b"PGDMPtest fixture")
                return subprocess.CompletedProcess(_args, 0)

            with patch.object(vm, "volume", return_value="project_postgres-data"), \
                 patch.object(vm, "compose", return_value=SimpleNamespace(stdout="container-id\n")), \
                 patch.object(vm.subprocess, "run", side_effect=dump):
                vm.backup(str(target))
                self.assertEqual(target.read_bytes(), b"PGDMPtest fixture")
                self.assertEqual(target.stat().st_mode & 0o777, 0o600)
                with self.assertRaises(SystemExit):
                    vm.backup(str(target))

    def test_backup_never_overwrites_destination_created_during_dump(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "new.dump"

            def dump(args, **kwargs):
                kwargs["stdout"].write(b"PGDMPtest fixture")
                return subprocess.CompletedProcess(args, 0)

            def concurrent_create(_source, destination):
                Path(destination).write_bytes(b"another operator's backup")
                raise FileExistsError(destination)

            with patch.object(vm, "volume", return_value="project_postgres-data"), \
                 patch.object(vm, "compose", return_value=SimpleNamespace(stdout="container-id\n")), \
                 patch.object(vm.subprocess, "run", side_effect=dump), \
                 patch.object(vm.os, "link", side_effect=concurrent_create):
                with self.assertRaises(FileExistsError):
                    vm.backup(str(target))
            self.assertEqual(target.read_bytes(), b"another operator's backup")
            self.assertFalse(list(Path(directory).glob(".borobiya-pgdump-*")))

    def test_failed_backup_cleans_partial_archive_without_touching_database(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "failed.dump"

            def failed_dump(args, **kwargs):
                kwargs["stdout"].write(b"partial")
                return subprocess.CompletedProcess(args, 1)

            with patch.object(vm, "volume", return_value="project_postgres-data"), \
                 patch.object(vm, "compose", return_value=SimpleNamespace(stdout="container-id\n")), \
                 patch.object(vm.subprocess, "run", side_effect=failed_dump):
                with self.assertRaises(SystemExit):
                    vm.backup(str(target))
                self.assertFalse(target.exists())
                self.assertFalse(list(Path(directory).glob(".borobiya-pgdump-*")))

    def test_generated_admin_secret_remains_available_if_env_sync_fails(self):
        class Terminal(io.StringIO):
            def isatty(self):
                return True

        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env"
            env.write_text("ADMIN_SEED_PASSWORD_B64=one\nADMIN_SEED_PASSWORD_B64=two\n")
            output = Terminal()

            def reset(args, **kwargs):
                secret = kwargs["env"]["ADMIN_SEED_PASSWORD"]
                self.assertIn(secret, output.getvalue())  # printed before the DB changes
                self.assertNotIn(secret, str(args))
                return subprocess.CompletedProcess(args, 0)

            with patch.object(vm_common, "ENV", env), patch.object(vm, "compose", return_value=SimpleNamespace(stdout="db")), \
                 patch.object(vm.subprocess, "run", side_effect=reset), \
                 patch.object(sys.stdin, "isatty", return_value=True), redirect_stdout(output):
                with self.assertRaisesRegex(SystemExit, "reset succeeded but .env sync failed"):
                    vm.admin_reset(True)
            self.assertIn("New admin password", output.getvalue())

    def test_env_setup_diagnoses_compose_failure_without_leaking_secrets_or_writing_env(self):
        cases = (
            ({"version"}, "Docker Compose plugin v2+ is missing"),
            ({"info"}, "Docker daemon is inaccessible"),
            ({"quiet"}, "Docker Compose configuration is invalid or unsupported"),
            (set(), "cannot produce JSON"),
        )
        for failed, expected in cases:
            with self.subTest(failed=failed), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / ".env.example").write_text((vm_common.ROOT / ".env.example").read_text())
                env = root / ".env"

                def command(args, *, failed=failed, **_kwargs):
                    kind = ("version" if "version" in args else "info" if "info" in args
                            else "quiet" if "--quiet" in args else "json")
                    if kind == "json" or kind in failed:
                        raise subprocess.CalledProcessError(125, args, stderr="SENSITIVE_VALUE")
                    return SimpleNamespace(stdout="ok")

                with patch.object(vm_env, "ENV", env), patch.object(vm_env, "ROOT", root), \
                     patch.object(vm_common, "ENV", env), patch.object(vm_common, "run", side_effect=command), \
                     patch.object(sys, "argv", ["vm-env.py", "--mode", "development", "--generate-admin"]):
                    with self.assertRaises(SystemExit) as raised:
                        vm_env.main()
                self.assertIn(expected, str(raised.exception))
                self.assertNotIn("SENSITIVE_VALUE", str(raised.exception))
                self.assertFalse(env.exists())

    def test_volume_lookup_refuses_ambiguous_project_labels(self):
        with patch.object(vm_common, "project", return_value="borobiya"), \
             patch.object(vm_common, "run", return_value=SimpleNamespace(stdout="one\ntwo\n")):
            with self.assertRaises(SystemExit):
                vm_common.volume("postgres-data")
        with self.assertRaises(SystemExit):
            vm_common.volume("somebody-elses-volume")

    def test_no_implicit_destructive_confirmation(self):
        with patch.object(sys.stdin, "isatty", return_value=False):
            with self.assertRaises(SystemExit):
                vm_common.confirm("DELETE DATABASE")
            with self.assertRaises(SystemExit):
                vm_common.confirm("DELETE DATABASE", yes=True)

    def test_production_rejects_unvalidated_domain_in_caddy_environment(self):
        values = {"NODE_ENV": "production", "POSTGRES_PASSWORD": "secret", "NOMINATIM_PASSWORD": "secret",
                  "JWT_SECRET": "a" * 32, "JWT_REFRESH_SECRET": "b" * 32, "PUBLIC_DOMAIN": "a.org {",
                  "CORS_ORIGINS": "https://a.org {"}
        with patch.object(vm, "env_values", return_value=values), self.assertRaises(SystemExit):
            vm.require_env()
        for invalid in ("https://localhost", "https://127.0.0.1", "https://a.org:444"):
            with self.assertRaises(SystemExit):
                vm_env.origin(invalid)

    def test_production_compose_profile_is_explicit(self):
        with patch.object(vm, "env_values", return_value={"NODE_ENV": "production"}):
            self.assertIn("docker-compose.production.yml", vm.vm_compose_args())
            self.assertEqual(vm.vm_compose_args()[-2:], ["--profile", "production"])
        with patch.object(vm, "env_values", return_value={"NODE_ENV": "development"}):
            self.assertNotIn("production", vm.vm_compose_args())
        self.assertIn("caddy-data", (vm.ROOT / "docker-compose.production.yml").read_text())
        self.assertIn("header_up X-Forwarded-Proto {scheme}", (vm.ROOT / "Caddyfile.vm").read_text())

    def test_geofabrik_fetch_fails_fast_on_unreachable_host_without_limiting_transfer_time(self):
        script = (vm.ROOT / "map-server/scripts/prepare-regions-pbf.sh").read_text()
        self.assertEqual(script.count("curl -fL --connect-timeout 20 --retry 3"), 1)
        self.assertIn('download_geofabrik_file "${source_url}.md5"', script)
        self.assertIn('download_geofabrik_file "$source_url"', script)
        self.assertIn("check this shell's HTTPS proxy/no_proxy", script)
        self.assertNotIn("--max-time", script)  # large source transfers can take hours

    def test_vm_nginx_preserves_proxy_locations_but_serves_spa(self):
        base = (vm.ROOT / "nginx.conf").read_text()
        quick = (vm.ROOT / "nginx.vm.conf").read_text()
        for route in ("/api/", "/api/socket.io", "/map-config", "/map/", "/health"):
            self.assertIn(route, base)
            self.assertIn(route, quick)
        self.assertIn("try_files $uri $uri/ /index.html;", quick)
        self.assertIn("map $http_x_forwarded_proto $borobiya_client_scheme", quick)
        self.assertIn("proxy_set_header X-Forwarded-Proto $borobiya_client_scheme;", quick)
        self.assertNotIn("Start the client with bun run dev", quick)
        self.assertIn("/usr/share/nginx/html:ro", (vm.ROOT / "docker-compose.vm.yml").read_text())
        # Never let a gateway route/security fix land in only one of the two Nginx configs.
        normalized = quick.split("server {", 1)[1]
        normalized = normalized.replace("$borobiya_client_scheme", "$scheme")
        normalized = normalized.replace(
            "    # VM quickstart: serve the built SPA from the same origin as API, map and sockets.\n"
            "    root /usr/share/nginx/html;\n"
            "    location / {\n        try_files $uri $uri/ /index.html;\n    }",
            '    location = / {\n        default_type text/plain;\n'
            '        return 200 "Borobiya API/map gateway. Start the client with bun run dev.\\n";\n    }',
        )
        normalized = normalized.replace("\n\n}\n", "\n\n    location / {\n        return 404;\n    }\n}\n")
        self.assertEqual(normalized, base.split("server {", 1)[1])


class MapSourceFallbackTests(unittest.TestCase):
    def test_setup_retries_unavailable_dates_before_persisting_any_map_paths(self):
        setup = (SCRIPTS / "setup-ubuntu-vm.sh").read_text()
        function = ("preflight_map_sources() {" + setup.split("preflight_map_sources() {", 1)[1]
                    .split("\n}\npreflight_map_sources", 1)[0] + "\n}")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script_dir = root / "map-server" / "scripts"
            script_dir.mkdir(parents=True)
            prepare = script_dir / "prepare-regions-pbf.sh"
            prepare.write_text(
                "#!/bin/bash\n"
                "printf '%s|%s\\n' \"$MAP_SNAPSHOT\" \"$MAP_SNAPSHOT_DATE\" >> \"$ATTEMPTS\"\n"
                "if [[ \"${FAKE_STATUS:-}\" == 7 ]]; then exit 7; fi\n"
                "case \"$MAP_SNAPSHOT_DATE\" in 2026-10-18|2026-10-27) exit 42 ;; esac\n"
                "exit 0\n",
            )
            prepare.chmod(0o755)
            attempts = root / "attempts"
            shell = ("set -euo pipefail\n"
                     "fail() { printf '%s\\n' \"$*\" >&2; exit 1; }\n"
                     "note() { :; }\nlog() { :; }\nprint_selection_summary() { :; }\n"
                     "resolve_selection() {\n"
                     "  [[ \"$SNAPSHOT_INPUT\" == latest ]] || exit 9\n"
                     "  SNAPSHOT_MODE=latest\n"
                     "  if [[ \"$SKIP_SNAPSHOT_DATES\" == 2026-10-18 ]]; then\n"
                     "    SNAPSHOT_DATE=2026-10-27\n"
                     "  elif [[ \"$SKIP_SNAPSHOT_DATES\" == 2026-10-18,2026-10-27 ]]; then\n"
                     "    SNAPSHOT_DATE=2026-10-26\n"
                     "  else exit 8; fi\n"
                     "}\n"
                     "DATASET=borobiya; REGION_IDS=ir; SELECTION_INPUT=ir\n"
                     "SNAPSHOT_INPUT=pinned; SNAPSHOT_MODE=pinned; SNAPSHOT_DATE=2026-10-18\n"
                     "SOURCE_POLICY_INPUT=${TEST_POLICY:-cache-first}; DRY_RUN=${TEST_DRY_RUN:-0}\n"
                     "MAP_LIBRARY_DIR=$PWD/library\n" + function + "\npreflight_map_sources\n"
                     "printf 'result=%s|%s|%s\\n' \"$SNAPSHOT_INPUT\" \"$SNAPSHOT_DATE\" "
                     "\"${SKIP_SNAPSHOT_DATES:-}\"\n")
            env = {**os.environ, "ATTEMPTS": str(attempts)}
            ok = subprocess.run(["bash", "-c", shell], cwd=root, env=env,
                                capture_output=True, text=True, check=False)
            self.assertEqual(ok.returncode, 0, ok.stderr)
            self.assertIn("result=latest|2026-10-26|2026-10-18,2026-10-27", ok.stdout)
            self.assertEqual(attempts.read_text().splitlines(),
                             ["pinned|2026-10-18", "2026-10-27|2026-10-27", "2026-10-26|2026-10-26"])
            for policy, dry_run in (("offline", "0"), ("refresh", "0"), ("cache-first", "1")):
                attempts.unlink(missing_ok=True)
                skipped = subprocess.run(["bash", "-c", shell], cwd=root,
                                         env={**env, "TEST_POLICY": policy, "TEST_DRY_RUN": dry_run},
                                         capture_output=True, text=True, check=False)
                self.assertEqual(skipped.returncode, 0, skipped.stderr)
                self.assertFalse(attempts.exists())
                self.assertIn("result=pinned|2026-10-18|", skipped.stdout)
            attempts.unlink(missing_ok=True)
            network = subprocess.run(["bash", "-c", shell], cwd=root,
                                     env={**env, "FAKE_STATUS": "7"},
                                     capture_output=True, text=True, check=False)
            self.assertNotEqual(network.returncode, 0)
            self.assertIn("no automatic fallback for network/checksum errors", network.stderr)
            self.assertEqual(attempts.read_text().splitlines(), ["pinned|2026-10-18"])


if __name__ == "__main__":
    unittest.main()
