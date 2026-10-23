#!/usr/bin/env python3
"""A stand-in for the `docker` CLI, used by scripts/test_setup_db_passwords.py.

It behaves like the postgis image's container as the setup script meets it: the role inside the volume
authenticates whatever password the state file says, `ALTER USER` arrives on stdin and rewrites that
file, and every argv is recorded so a test can assert the password was never among them. State lives in
$STUB_STATE, a directory the test owns.

The file deliberately contains no backslash escape sequences: it is read, copied and executed by a test,
and a `\\n` or `\\.` that survives one layer of quoting and not the next is the kind of bug that makes a
fake behave unlike the real thing while every assertion still passes.
"""

import json
import os
import re
import sys

QUOTE = chr(34)
APOS = chr(39)

state = os.environ["STUB_STATE"]


def path(name):
    return os.path.join(state, name)


def flag(name):
    return os.path.exists(path(name))


def read(name, default=""):
    if not flag(name):
        return default
    with open(path(name), encoding="utf-8") as handle:
        return handle.read()


def write(name, text=""):
    with open(path(name), "w", encoding="utf-8") as handle:
        handle.write(text)


def record(text):
    """Every argv the script passed, one JSON list per line, so a test can search them."""
    with open(path("calls"), "a", encoding="utf-8") as handle:
        print(text, file=handle)


def note_input(text):
    """Whatever arrived on stdin, kept apart from argv: the whole point of the transport is that
    secrets are only ever here."""
    with open(path("inputs"), "a", encoding="utf-8") as handle:
        print(text, file=handle)


def fail_unless(condition, message, code=1):
    if not condition:
        print(message, file=sys.stderr)
        sys.exit(code)


def main():
    args = sys.argv[1:]
    record(json.dumps(args))

    if args[:1] == ["volume"]:
        if flag("postgres_data.volume"):
            print("borobiya_postgres-data")
        if flag("nominatim_data.volume"):
            print("borobiya_nominatim-data")
        return 0

    if args[:1] == ["inspect"]:
        container_password = read("container_password")
        if container_password:
            print("POSTGRES_PASSWORD=" + container_password)
        return 0

    if args[:2] == ["compose", "config"]:
        if flag("fail_config"):
            print("error: no configuration found", file=sys.stderr)
            return 1
        print(json.dumps({"name": "borobiya"}))
        return 0

    if args[:2] == ["compose", "up"]:
        # `up -d postgres` creates the container, so the script's poll for it must start succeeding.
        write("postgres.running", "cid123")
        return 0

    if args[:2] == ["compose", "ps"]:
        # `compose ps -q <service>`: the service is the fourth argument, and reading the wrong one here
        # would answer for a different container than the script asked about.
        service = args[3] if len(args) > 3 else ""
        name = "postgres.running" if service == "postgres" else "api.running"
        value = read(name)
        if value:
            print(value)
        return 0

    if args[:3] == ["compose", "exec", "-T"]:
        # args[3] is the service name; the command that follows is what decides the behaviour.
        body = " ".join(args[4:])
        if body.startswith("psql -U postgres"):
            return apply_alter()
        if body.startswith("sh -c"):
            return probe()
        print("stub docker: unexpected exec: " + body, file=sys.stderr)
        return 9

    print("stub docker: unexpected call: " + " ".join(args), file=sys.stderr)
    return 9


def apply_alter():
    """`psql -f -`: the statement is the whole of stdin, and it becomes the new role password."""
    sql = sys.stdin.read().strip()
    note_input("STDIN " + sql)
    pattern = (
        "ALTER USER "
        + QUOTE
        + "([^"
        + QUOTE
        + "]*)"
        + QUOTE
        + " WITH PASSWORD "
        + APOS
        + "(.*)"
        + APOS
        + ";"
    )
    match = re.fullmatch(pattern, sql)
    if not match:
        print("psql: ERROR:  syntax error: " + sql, file=sys.stderr)
        return 3
    write("alter.sql", sql + chr(10))
    write("role_password", match.group(2).replace(APOS + APOS, APOS))
    return 0


def probe():
    """The connection string arrives on stdin, exactly as psql_in_postgres promises."""
    url = sys.stdin.readline().strip()
    note_input("URL " + url)
    write("probe_url", url + chr(10))
    before, at, after = url.partition("@")
    scheme, sep, userinfo = before.partition("://")
    user, colon, password = userinfo.partition(":")
    if not (at and sep and colon) or scheme != "postgresql":
        print('psql: error: invalid connection URI ' + QUOTE + url + QUOTE, file=sys.stderr)
        return 2
    if not after.startswith("127.0.0.1:5432/borobiya"):
        print("psql: error: stub refuses hosts other than the server's own loopback: " + after, file=sys.stderr)
        return 2
    database = after.rpartition("/")[2]
    role = read("role_password")
    if user == "borobiya" and database == "borobiya" and password and password == role:
        print("1")
        return 0
    print(
        "psql: error: connection to server at "
        + QUOTE
        + "127.0.0.1"
        + QUOTE
        + ' failed: FATAL:  28P01:  password authentication failed for user "'
        + user
        + '"',
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
