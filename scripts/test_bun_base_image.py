"""Source-level guard for the optional, matching Bun 1.4.3 Compose base image.

Docker itself is deliberately not needed to check the wiring on CI/host tests.
"""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
ARG = "BOROBIYA_BUN_BASE_IMAGE"
DEFAULT = "oven/bun:1.4.3"


class BunBaseImageTests(unittest.TestCase):
    def test_both_dockerfiles_keep_the_same_pinned_default(self):
        for name in ("packages/server/Dockerfile", "map-server/routing-gateway/Dockerfile"):
            with self.subTest(name=name):
                lines = (ROOT / name).read_text().splitlines()
                self.assertIn(f"ARG {ARG}={DEFAULT}", lines)
                self.assertIn(f"FROM ${{{ARG}}}", lines)
                self.assertLess(lines.index(f"ARG {ARG}={DEFAULT}"), lines.index(f"FROM ${{{ARG}}}"))

    def test_compose_passes_one_override_to_both_builds(self):
        compose = (ROOT / "docker-compose.yml").read_text()
        self.assertEqual(compose.count(f"{ARG}: ${{{ARG}:-{DEFAULT}}}"), 2)
        for name in ("api", "routing-gateway"):
            section = compose.split(f"  {name}:\n    build:\n", 1)[1].split("\n    restart:", 1)[0]
            self.assertIn(f"{ARG}: ${{{ARG}:-{DEFAULT}}}", section)
        self.assertIn(f"{ARG}=", (ROOT / ".env.example").read_text())


if __name__ == "__main__":
    unittest.main()
