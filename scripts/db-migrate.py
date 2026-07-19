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

HANDOFF = r"E:\Tamem\HANDOFF.md"
HOST, PORT, USER = "77.37.37.207", 65002, "u748721963"

TABLE = "HomeConfig"
COLUMN = "featuredProductIds"
DDL = f"ALTER TABLE `{TABLE}` ADD COLUMN `{COLUMN}` JSON NULL"

DRY_RUN = "--dry-run" in sys.argv


def secrets() -> tuple[str, str, str, str]:
    """(ssh_password, db_name, db_user, db_password) — never printed."""
    txt = open(HANDOFF, encoding="utf-8").read()

    i = txt.find("SSH / SFTP")
    ssh_pw = re.search(r"PASS(?:WORD)?\s*:\s*(\S+)", txt[i : i + 1200])
    if not ssh_pw:
        sys.exit("No SSH password found under 'SSH / SFTP' in HANDOFF.md")

    # The DB block is the one that names a *_Tamem user.
    j = txt.find("USER: u748721963_Tamem")
    if j == -1:
        sys.exit("Could not find the database credentials block in HANDOFF.md")
    block = txt[max(0, j - 600) : j + 600]
    db_name = re.search(r"(?:DB|DATABASE|NAME)\s*:\s*(\S+)", block)
    db_user = re.search(r"USER\s*:\s*(u748721963_\S+)", block)
    db_pw = re.search(r"PASS(?:WORD)?\s*:\s*(\S+)", block)
    if not (db_name and db_user and db_pw):
        sys.exit("HANDOFF.md's database block is missing NAME/USER/PASS")
    return ssh_pw.group(1), db_name.group(1), db_user.group(1), db_pw.group(1)


def main() -> None:
    import paramiko

    if not DDL.upper().startswith(f"ALTER TABLE `{TABLE}` ADD COLUMN".upper()):
        sys.exit("This script only runs additive ADD COLUMN statements.")

    ssh_pw, db_name, db_user, db_pw = secrets()

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=ssh_pw, timeout=30)

    def sql(statement: str) -> str:
        # Credentials go in via env, so they never appear in the process list
        # (`ps` on a shared host is readable by other tenants).
        cmd = (
            f"MYSQL_PWD='{db_pw}' mysql -u {db_user} {db_name} "
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

    existing = sql(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
        f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{TABLE}' "
        f"AND COLUMN_NAME = '{COLUMN}'"
    )
    if existing.strip() == COLUMN:
        print(f"{COLUMN} already exists — nothing to do.")
        cli.close()
        return

    print(f"current {TABLE} columns:")
    print(sql(f"SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS "
              f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{TABLE}' ORDER BY ORDINAL_POSITION"))

    if DRY_RUN:
        print(f"\n[dry-run] would run: {DDL}")
        cli.close()
        return

    # Dump the table before touching it. HomeConfig is a single row, so this is
    # instant and gives an exact restore path.
    dump = f"~/homeconfig-backup-$(date +%Y%m%d-%H%M%S).sql"
    _, out, _ = cli.exec_command(
        f"MYSQL_PWD='{db_pw}' mysqldump -u {db_user} {db_name} {TABLE} > {dump} && echo {dump}",
        timeout=120,
    )
    print("backup ->", out.read().decode().strip())

    print("running:", DDL)
    print(sql(DDL) or "(ok)")

    print("\nverify:")
    print(sql(f"SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS "
              f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{TABLE}' AND COLUMN_NAME = '{COLUMN}'"))
    cli.close()


if __name__ == "__main__":
    main()
