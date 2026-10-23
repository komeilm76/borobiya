#!/usr/bin/env python3
"""A stand-in for the `docker` CLI, used by scripts/test_setup_db_passwords.py.

It behaves like the postgis image's container as the setup script meets it — including the detail that
matters most and is easiest to forget: the image's default pg_hba trusts the local socket and loopback TCP
and requires a password only on other addresses. So a probe through 127.0.0.1 answers `1` to *any*
password, and a fake that skipped that rule would let a loopback probe pass every test while a real VM
printed `postgres: healthy` above `28P01`. Here, hosts are split three ways:

  * `127.0.0.1` / `localhost`  -> trusted, the password is ignored (the trap)
  * `postgres` / `nominatim`   -> the Compose network, so the password must match the role
  * anything else              -> refused, because the stub should never be the thing that invents a host

`ALTER USER` arrives on stdin and rewrites the role password; the superuser is the POSTGRES_USER role
(`postgres` does not exist when POSTGRES_USER is set, which is exactly what a real VM reported); and every
argv is recorded so "the password never travels as an argument" stays a checked claim. State lives in
$STUB_STATE, a directory the test owns. The file deliberately contains no backslash escapes: it is read,
copied and executed by a test, and an escape that survives one layer of quoting and not the next makes the
fake behave unlike the real thing while the assertions still pass.
"""

import json
import os
import re
import sys

QUOTE = chr(34)
APOS = chr(39)
LOOPBACK = ("127.0.0.1", "localhost", "::1")

state = os.environ["STUB_STATE"]


def path(name):
    return os.path.join(state, name)


def flag(name):
    return os.path.exists(path(name))


def read(name, default=""):
    if not flag(name):
        return default
    with open(path(name), encoding="utf-8") as handle:
        return handle.read().strip()


def write(name, text=""):
    with open(path(name), "w", encoding="utf-8") as handle:
        handle.write(text)


def record(text):
    """Every argv the script passed, one JSON list per line, so a test can search them."""
    with open(path("calls"), "a", encoding="utf-8") as handle:
        print(text, file=handle)


def note_input(text):
    """Whatever arrived on stdin, kept apart from argv: the point of the transport is that a secret is
    only ever here."""
    with open(path("inputs"), "a", encoding="utf-8") as handle:
        print(text, file=handle)


def parse_conninfo(url):
    """(user, password, host, port, database) from a postgres URL, or None."""
    before, at, after = url.partition("@")
    _scheme, sep, userinfo = before.partition("://")
    if not (at and sep):
        return None
    user, colon, password = userinfo.partition(":")
    if not colon:
        return None
    hostport, slash, database = after.partition("/")
    host, colon2, port = hostport.rpartition(":")
    if not slash or (colon2 and not port.isdigit()):
        return None
    if not colon2:
        host, port = hostport, "5432"
    return user, password, host, port, database


def check(url, source):
    """Print `1` if this connection would be accepted, and return 0."""
    note_input(source + " " + url)
    write("probe_url", url + chr(10))
    parsed = parse_conninfo(url)
    if parsed is None:
        print("psql: error: invalid connection URI " + QUOTE + url + QUOTE, file=sys.stderr)
        return 2
    user, password, host, _port, database = parsed
    if host not in ("postgres", "nominatim") + LOOPBACK:
        print("stub docker: refusing a host the compose network does not have: " + host, file=sys.stderr)
        return 3
    if user != "borobiya" or database != "borobiya":
        print("stub docker: unexpected user or database in " + url, file=sys.stderr)
        return 3
    if host in LOOPBACK:
        # pg_hba says `trust` here, so this is the one answer the fake gives that proves nothing — and the
        # reason a test must never accept it as verification.
        write("trust_probe_seen", url)
        print("1")
        return 0
    if password and password == read("role_password"):
        print("1")
        return 0
    print(
        "psql: error: connection to server at "
        + QUOTE
        + host
        + QUOTE
        + " failed: FATAL:  28P01:  password authentication failed for user "
        + QUOTE
        + user
        + QUOTE,
        file=sys.stderr,
    )
    return 2


def apply_alter(body):
    """`psql -U <role> ... -f -`: only the superuser the image created may change a password."""
    parts = body.split()
    connect_as = parts[2] if len(parts) > 2 else ""
    superuser = read("superuser", "borobiya")
    if connect_as != superuser:
        print('psql: FATAL:  role ' + QUOTE + connect_as + QUOTE + " does not exist", file=sys.stderr)
        return 2
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
    write("alter_role", connect_as)
    write("role_password", match.group(2).replace(APOS + APOS, APOS))
    return 0


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
        # `up -d postgres` creates the container, so the script's poll must start succeeding.
        write("postgres.running", "cid123")
        return 0

    if args[:2] == ["compose", "ps"]:
        # `compose ps -q <service>`: the service is the fourth argument.
        service = args[3] if len(args) > 3 else ""
        value = read("postgres.running" if service == "postgres" else "api.running")
        if value:
            print(value)
        return 0

    if args[:3] == ["compose", "exec", "-T"]:
        # args[3] is the service name; the command after it decides what is being simulated.
        body = " ".join(args[4:])
        if args[3] == "api" and body.startswith("bun -e"):
            # The app's own driver, with the app's own DATABASE_URL: nothing else about this container is
            # consulted, which is what makes it the most faithful question available.
            url = read("api_database_url")
            if not url:
                print("Error: No such container (the API container is still starting)", file=sys.stderr)
                return 1
            return check(url, "APP-URL")
        if args[3] == "postgres" and body.startswith("psql -U"):
            return apply_alter(body)
        if args[3] in ("postgres", "nominatim") and body.startswith("sh -c"):
            return check(sys.stdin.readline().strip(), "URL")
        print("stub docker: unexpected exec: " + " ".join(args[3:]), file=sys.stderr)
        return 9

    if args[:2] == ["compose", "run"]:
        print("stub docker: compose run is not simulated; the script must not need it here", file=sys.stderr)
        return 9

    print("stub docker: unexpected call: " + " ".join(args), file=sys.stderr)
    return 9


if __name__ == "__main__":
    sys.exit(main())
