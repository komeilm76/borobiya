#!/usr/bin/env python3
"""Structural checks over the reviewed migration SQL — run: python3 scripts/test_migration_sql.py

These exist because a migration can be *valid to drizzle* and still be unrunnable by Postgres, and the
only thing that catches that is a server — which CI here is not. A fresh VM found it the hard way:
``0012_modern_sentry.sql`` created ``sos_requests`` with the column type spelled
``"geography(Point,4326)"``, one quoted identifier, so Postgres looked up a type whose *name* includes the
parentheses and answered ``42704: type "geography(Point,4326)" does not exist``. The same type written bare
(in ``0012``'s sibling, ``0002``'s ``ALTER TABLE ... ADD COLUMN``) is accepted, because that is how
PostGIS documents it: ``geography(Point,4326)`` is a type name plus a type modifier, not a name.

So the checks here are about the text the server will receive: no quoted identifier carrying a type
modifier, the journal and the folder agreeing about which migrations exist, and every statement separated
by the breakpoint marker the runtime migrator splits on.
"""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DRIZZLE = REPO / "packages" / "server" / "drizzle"
JOURNAL = DRIZZLE / "meta" / "_journal.json"
SCHEMA = REPO / "packages" / "server" / "src" / "db" / "schema.ts"
BREAKPOINT = "--> statement-breakpoint"

# A quoted identifier containing parentheses, used where a type belongs: `"(name(args))"` is one
# identifier to Postgres, and no PostGIS/drizzle type is spelled that way.
QUOTED_TYPE_WITH_MODIFIER = re.compile(r'"[A-Za-z_][A-Za-z0-9_]*\([^"]*\)"')


def migration_files() -> list[Path]:
    return sorted(DRIZZLE.glob("*.sql"))


def journal_entries() -> list[dict]:
    return json.loads(JOURNAL.read_text(encoding="utf-8"))["entries"]


def schema_geography_spelling() -> str:
    """The exact string `customType` returns in schema.ts, which is what DDL must contain."""
    text = SCHEMA.read_text(encoding="utf-8")
    match = re.search(r'const geographyPoint = customType.*?dataType: \(\) => "([^"]+)"', text, re.DOTALL)
    assert match, "schema.ts no longer declares geographyPoint the way this test reads it"
    return match.group(1)


class QuotedTypeTests(unittest.TestCase):
    def test_no_migration_quotes_a_type_that_carries_a_modifier(self) -> None:
        offenders = []
        for path in migration_files():
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
                if line.lstrip().startswith("--"):
                    continue
                for match in QUOTED_TYPE_WITH_MODIFIER.finditer(line):
                    offenders.append(f"{path.name}:{number}: {match.group(0)}")
        self.assertEqual(
            offenders,
            [],
            "a quoted identifier is one name to Postgres: `\"geography(Point,4326)\"` asks for a type "
            "literally named that and fails with 42704 on every fresh database. Write the type and its "
            "modifier separately: geography(Point,4326).",
        )

    def test_the_guard_catches_the_shape_it_exists_to_stop(self) -> None:
        # Without this, the check above could pass because its regex silently stopped matching anything.
        broken = 'CREATE TABLE "t" (\n\t"location" "geography(Point,4326)" NOT NULL\n);\n'
        found = [m.group(0) for m in QUOTED_TYPE_WITH_MODIFIER.finditer(broken)]
        self.assertEqual(found, ['"geography(Point,4326)"'])
        for legal in (
            '\t"location" geography(Point,4326) NOT NULL,',
            '\t"rating" numeric(2, 1),',
            '\t"name" varchar(30) NOT NULL,',
            'ALTER TABLE "users" ADD COLUMN "last_location" geography(Point,4326);',
        ):
            self.assertIsNone(QUOTED_TYPE_WITH_MODIFIER.search(legal), legal)

    def test_geography_columns_are_spelled_exactly_as_the_schema_declares_them(self) -> None:
        spelling = schema_geography_spelling()
        self.assertEqual(spelling, "geography(Point,4326)")
        for path in migration_files():
            for line in path.read_text(encoding="utf-8").splitlines():
                if "geography" in line and not line.lstrip().startswith("--"):
                    self.assertIn(spelling, line, f"{path.name}: {line.strip()}")


class JournalTests(unittest.TestCase):
    def test_the_folder_and_the_journal_describe_the_same_migrations(self) -> None:
        entries = journal_entries()
        tags = [entry["tag"] for entry in entries]
        self.assertEqual(len(tags), len(set(tags)), "a tag appears twice")
        on_disk = [path.stem for path in migration_files()]
        self.assertEqual(sorted(tags), sorted(on_disk), "a .sql file with no journal entry never runs, "
                                                         "and a journal entry with no file fails the migrator")

    def test_entries_are_indexed_in_order(self) -> None:
        indexes = [entry["idx"] for entry in journal_entries()]
        self.assertEqual(indexes, list(range(len(indexes))), "idx must be 0..n-1 in file order")

    def test_a_file_with_several_statements_uses_the_markers_the_journal_advertises(self) -> None:
        # The runtime migrator splits on `--> statement-breakpoint` only when the journal entry says
        # `breakpoints: true`, and drizzle-kit writes that flag for every generated file - including a
        # one-statement file, which correctly has no marker. So the check is one-directional: if there is
        # more than one statement to split, the markers have to be there.
        for entry in journal_entries():
            path = DRIZZLE / f"{entry['tag']}.sql"
            body = path.read_text(encoding="utf-8")
            statements = body.count(";")
            if statements <= 1:
                continue
            self.assertTrue(entry.get("breakpoints"), f"{path.name}: {statements} statements and no "
                        "breakpoint flag, so they would be sent as one query")
            self.assertEqual(body.count(BREAKPOINT), statements - 1,
                             f"{path.name}: {statements} statements but {body.count(BREAKPOINT)} markers")


class StatementShapeTests(unittest.TestCase):
    def test_each_chunk_holds_exactly_one_statement(self) -> None:
        # `bun src/db/migrate.ts` splits on the marker and sends each piece as its own query. Two
        # statements in one piece is accepted by some drivers and rejected by others, so the file should
        # not rely on that luck.
        for path in migration_files():
            body = path.read_text(encoding="utf-8")
            for chunk in body.split(BREAKPOINT):
                stripped = chunk.strip()
                if not stripped:
                    continue
                self.assertLessEqual(
                    stripped.count(";"),
                    1,
                    f"{path.name}: a chunk with {stripped.count(';')} semicolons: {stripped[:80]!r}",
                )

    def test_the_extension_that_the_types_need_comes_first(self) -> None:
        # A geography column can only be created in a database where postgis already exists, so the file
        # that enables it has to sort before the first file that uses it. `CREATE EXTENSION` inside the
        # same file as the column is also fine, which is why this compares files, not statements.
        enabled_in = [path.name for path in migration_files()
                      if "CREATE EXTENSION" in path.read_text(encoding="utf-8") and "postgis" in
                      path.read_text(encoding="utf-8")]
        self.assertTrue(enabled_in, "no migration enables postgis, so no geography column can be created")
        used_in = [path.name for path in migration_files() if "geography(" in path.read_text(encoding="utf-8")]
        self.assertTrue(used_in, "the schema declares a geography type but no migration creates a column of it")
        names = [path.name for path in migration_files()]
        self.assertLess(names.index(min(enabled_in)), names.index(min(used_in)) + 1,
                        f"postgis is enabled in {min(enabled_in)}, after the geography column in {min(used_in)}")


if __name__ == "__main__":
    unittest.main()
