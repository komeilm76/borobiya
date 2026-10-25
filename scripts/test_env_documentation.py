"""Pure checks for the committed env-key/documentation parity guard."""
import unittest

from check_env_documentation import validate


class EnvDocumentationTests(unittest.TestCase):
    def test_matching_keys(self):
        self.assertEqual(validate("A=one\nB=two\n", "| `A` | first |\n| `B` | second |\n"), [])

    def test_missing_extra_and_duplicate_entries(self):
        problems = validate("A=one\nA=again\nB=two\n", "| `A` | first |\n| `A` | duplicate |\n| `C` | extra |\n")
        self.assertTrue(any("duplicate template" in item for item in problems))
        self.assertTrue(any("duplicate reference" in item for item in problems))
        self.assertTrue(any("missing reference rows: B" in item for item in problems))
        self.assertTrue(any("reference rows not in template: C" in item for item in problems))

    def test_rejects_dead_knobs_and_browser_upstream_origins(self):
        problems = validate("SOS_REQUEST_AUTO_EXPIRE_HOURS=24\nVITE_API_URL=http://localhost:3000\n", "| `SOS_REQUEST_AUTO_EXPIRE_HOURS` | old |\n| `VITE_API_URL` | bad |\n")
        self.assertTrue(any("planned but unused" in item for item in problems))
        self.assertTrue(any("same-origin path" in item for item in problems))


if __name__ == "__main__":
    unittest.main()
