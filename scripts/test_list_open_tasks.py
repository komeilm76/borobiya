"""The task inventory must stay in sync with the actionable checkbox backlog."""
import unittest

from list_open_tasks import parse_open_tasks, validate_inventory


class OpenTaskInventoryTests(unittest.TestCase):
    def test_parses_only_unchecked_task_ids_not_checked_items_or_prose(self):
        doc = ("- [x] **T1.0.1** done\n"
               "- [ ] **P1-G1 — acceptance** details\n"
               "- [ ] **T4.5.3** workflow\n"
               "  - [ ] nested note, not a tracked task\n")
        self.assertEqual(parse_open_tasks(doc), ["P1-G1", "T4.5.3"])

    def test_rejects_missing_duplicate_completed_and_invalid_stage(self):
        doc = ("- [x] **T1.0.1** done\n- [ ] **P1-G1 — acceptance** details\n"
               "- [ ] **T4.5.3** workflow\n<!-- open-tasks:begin -->\n"
               "| ID | State | Remaining |\n| --- | --- | --- |\n"
               "| `P1-G1` | Not started | VM acceptance |\n"
               "| `P1-G1` | Not started | VM acceptance |\n"
               "| `T1.0.1` | Partial | already done |\n"
               "| `T4.5.3` | Complete | should be invalid |\n"
               "<!-- open-tasks:end -->\n")
        problems = validate_inventory(doc)
        for expected in ("duplicate", "completed", "invalid state", "missing"):
            self.assertTrue(any(expected in problem for problem in problems), problems)

    def test_accepts_complete_inventory_of_both_stages(self):
        doc = ("- [ ] **P1-G1 — acceptance** details\n"
               "- [ ] **T4.4.1** layout\n"
               "<!-- open-tasks:begin -->\n"
               "| ID | State | Remaining |\n| --- | --- | --- |\n"
               "| `P1-G1` | Not started | VM acceptance |\n"
               "| `T4.4.1` | Partial | Browser audit |\n"
               "<!-- open-tasks:end -->\n")
        self.assertEqual(validate_inventory(doc), [])

    def test_real_task_tracker_has_one_status_per_open_task(self):
        from pathlib import Path
        text = (Path(__file__).resolve().parent.parent / "docs/TASKS.md").read_text(encoding="utf-8")
        self.assertEqual(validate_inventory(text), [])
        self.assertGreater(len(parse_open_tasks(text)), 0)


if __name__ == "__main__":
    unittest.main()
