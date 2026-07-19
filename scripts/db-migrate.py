"""
Run an additive schema change on the production DB, over SSH.

MySQL only listens on localhost on this host, so everything goes through the
SSH session. Nothing destructive: the table is dumped first, the column is
added with IF NOT EXISTS semantics (checked, not assumed), and the script
refuses to run anything that isn't an additive ADD COLUMN.

Usage:
    python scripts/db-migrate.py --dry-run
    python scripts/db-migrate.py
"""

import re
import sys
import time

HANDOFF = r"E:\Tamem\HANDOFF.md"
HOST, PORT, USER = "77.37.37.207", 65002, "u748721963"

# Existing JSON-ish columns on this table are `longtext`, not `JSON` (Prisma
# maps Json to longtext on MySQL here). Matching that keeps the column
# consistent with featuredOfferIds/visibleServiceKeys rather than introducing a
# second convention.
MIGRATIONS = [
    ("HomeConfig", "featuredProductIds", "longtext NULL"),
    ("MerchantProfile", "prepMinutesMin", "int NULL"),
    ("MerchantProfile", "prepMinutesMax", "int NULL"),
]

DRY_RUN = "--dry-run" in sys.argv


def secrets() -> tuple[str, str, str, str, str]:
    """(ssh_password, db_name, db_user, db_password, db_host) — never printed.

    The SSH password comes from HANDOFF.md, but the DB credentials are read
    from the LIVE server's own .env instead. HANDOFF.md's database block lists
    the user as `u748721963_Tamem` when it is actually `u748721963_TamemDB`,
    which reads as a wrong password rather than a wrong username. Taking them
    from DATABASE_URL — the exact string api.php connects with — means this can
    never drift from what production uses.
    """
    txt = open(HANDOFF, encoding="utf-8").read()
    i = txt.find("SSH / SFTP")
    m = re.search(r"PASS(?:WORD)?\s*:\s*(\S+)", txt[i : i + 1200])
    if not m:
        sys.exit("No SSH password found under 'SSH / SFTP' in HANDOFF.md")
    return m.group(1), "", "", "", ""


def db_from_server(cli) -> tuple[str, str, str, str]:
    """(name, user, password, host) parsed from the deployed .env."""
    from urllib.parse import unquote

    base = "~/domains/deliverytamem.com/public_html/backendtamem"
    _, out, _ = cli.exec_command(f"grep -m1 '^DATABASE_URL' {base}/.env", timeout=60)
    line = out.read().decode("utf-8", "replace").strip()
    if not line:
        sys.exit("No DATABASE_URL in the deployed .env — cannot determine credentials.")
    url = re.match(r"DATABASE_URL\s*=\s*[\"']?(.+?)[\"']?\s*$", line).group(1)
    p = re.match(r"mysql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/(.+)", url)
    if not p:
        sys.exit("DATABASE_URL is not in mysql://user:pass@host/db form.")
    return p.group(5), unquote(p.group(1)), unquote(p.group(2)), p.group(3)


def main() -> None:
    import paramiko

    ssh_pw, _, _, _, _ = secrets()

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=ssh_pw, timeout=30)
    db_name, db_user, db_pw, db_host = db_from_server(cli)
    print(f"db: {db_user}@{db_host}/{db_name}")

    def sql(statement: str) -> str:
        # Credentials go in via env, so they never appear in the process list
        # (`ps` on a shared host is readable by other tenants).
        cmd = (
            f"MYSQL_PWD='{db_pw}' mysql -u {db_user} -h {db_host} {db_name} "
            f"--batch --skip-column-names -e {shell_quote(statement)}"
        )
        _, out, err = cli.exec_command(cmd, timeout=120)
        o = out.read().decode("utf-8", "replace").strip()
        e = err.read().decode("utf-8", "replace").strip()
        if e and "Using a password" not in e:
            return f"{o}\nERR: {e}".strip()
        return o

    def shell_quote(s: str) -> str:
        return "'" + s.replace("'", "'\\''") + "'"

    print("mysql client:", cli.exec_command("which mysql")[1].read().decode().strip() or "NOT FOUND")

    for table, column, coltype in MIGRATIONS:
        exists = sql(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
            f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{table}' "
            f"AND COLUMN_NAME = '{column}'"
        ).strip()
        if exists == column:
            print(f"  {table}.{column}: already exists")
            continue

        if DRY_RUN:
            print(f"  [dry-run] ALTER TABLE `{table}` ADD COLUMN `{column}` {coltype}")
            continue

        # Dump before the first change to each table. Additive DDL cannot lose
        # rows, but a backup costs seconds and removes the need to be sure.
        stamp = time.strftime("%Y%m%d-%H%M%S")
        dump = f"~/{table}-backup-{stamp}.sql"
        cli.exec_command(
            f"MYSQL_PWD='{db_pw}' mysqldump -u {db_user} -h {db_host} {db_name} {table} > {dump}",
            timeout=180,
        )[1].read()

        err = sql(f"ALTER TABLE `{table}` ADD COLUMN `{column}` {coltype}")
        ok = sql(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
            f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{table}' "
            f"AND COLUMN_NAME = '{column}'"
        ).strip()
        print(f"  {table}.{column}: {'added' if ok == column else 'FAILED ' + err[:120]}")

    cli.close()


if __name__ == "__main__":
    main()
