"""Static fail-closed checks for the VM deploy Action (no production host needed)."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class DeployWorkflowTests(unittest.TestCase):
    def test_main_only_sha_tagged_images_and_static_bundle(self) -> None:
        workflow = (ROOT / ".github/workflows/deploy.yml").read_text(encoding="utf-8")
        compose = (ROOT / "docker-compose.deploy.yml").read_text(encoding="utf-8")
        self.assertIn("branches: [main]", workflow)
        self.assertIn("cancel-in-progress: false", workflow)
        self.assertIn("environment: production", workflow)
        for image in ("api", "routing", "photon"):
            self.assertIn(f"tags: ${{{{ env.BOROBIYA_IMAGE_PREFIX }}}}-{image}:${{{{ github.sha }}}}", workflow)
            self.assertIn(f"-{image}:${{BOROBIYA_DEPLOY_SHA", compose)
        self.assertIn("download-photon.sh", workflow)
        self.assertIn("bun run test", workflow)
        self.assertIn("node --test map-server/routing-gateway/*.test.mjs", workflow)
        self.assertIn("tar -C packages/client/dist", workflow)
        self.assertIn("StrictHostKeyChecking=yes", workflow)
        self.assertIn("VM_SSH_KNOWN_HOSTS", workflow)
        self.assertNotIn("ssh-keyscan", workflow)

    def test_preflight_preserves_vm_data_and_requires_explicit_migrations(self) -> None:
        script = (ROOT / "scripts/deploy-vm.sh").read_text(encoding="utf-8")
        self.assertIn("vm.verify_serving_artifacts(vm.require_env(), vm.configured_map())", script)
        self.assertIn("browser_build_ready(Path(sys.argv[1]))", script)
        self.assertIn('[[ ! -e "$release" && ! -L "$release" ]]', script)
        self.assertLess(script.index('[[ ! -e "$release" && ! -L "$release" ]]'), script.index('tar -xzf'))
        self.assertLess(script.index("browser_build_ready(Path(sys.argv[1]))"), script.index('"${compose[@]}" pull'))
        self.assertIn("git merge --ff-only FETCH_HEAD", script)
        self.assertIn("bun src/db/check-schema.ts", script)
        self.assertIn("--no-deps --wait --wait-timeout", script)
        self.assertIn("--force-recreate --no-build --pull never nginx", script)
        self.assertIn("trap rollback ERR", script)
        self.assertIn('limit: "30", bbox: process.env.MAP_BBOX', script)
        self.assertIn('Place-search contract failed:', script)
        self.assertLess(script.index('limit: "30", bbox: process.env.MAP_BBOX'),
                        script.index('mv packages/client/dist "$old_dist"'))
        verify = (ROOT / "map-server/scripts/verify-geocoding.sh").read_text(encoding="utf-8")
        self.assertIn("--data-urlencode 'limit=30'", verify)
        self.assertLess(verify.index("--data-urlencode 'limit=5'"), verify.index("--data-urlencode 'limit=30'"))
        for forbidden in ("docker system prune", "down -v", "compose down", "db:migrate", "db:reset",
                          "rm -rf", "StrictHostKeyChecking=no", "ENV_FILE"):
            self.assertNotIn(forbidden, script)
        for service in ("postgres", "borobiya-uploads", "map-server"):
            self.assertNotIn(f"{service} nginx edge", script)


if __name__ == "__main__":
    unittest.main()
