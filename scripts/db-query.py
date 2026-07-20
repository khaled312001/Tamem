"""
Run a READ-ONLY query against the production DB, over SSH.

Same connection path as db-migrate.py (MySQL listens on localhost only on this
host, and credentials come from the server's own DATABASE_URL rather than
HANDOFF.md, which lists a stale username). Nothing here can write: anything but
a single SELECT/SHOW/DESCRIBE is refused before it leaves the machine.

Usage:
    python scripts/db-query.py "SELECT COUNT(*) FROM MerchantAddon"
"""

import re
import sys

HANDOFF = r"E:\Tamem\HANDOFF.md"
HOST, PORT, USER = "77.37.37.207", 65002, "u748721963"

READ_ONLY = re.compile(r"^\s*(select|show|describe|desc|explain)\b", re.I)


def ssh_password() -> str:
    txt = open(HANDOFF, encoding="utf-8").read()
    i = txt.find("SSH / SFTP")
    m = re.search(r"PASS(?:WORD)?\s*:\s*(\S+)", txt[i : i + 1200])
    if not m:
        sys.exit("No SSH password found under 'SSH / SFTP' in HANDOFF.md")
    return m.group(1)


def db_from_server(cli) -> tuple[str, str, str, str]:
    from urllib.parse import unquote

    base = "~/domains/deliverytamem.com/public_html/backendtamem"
    _, out, _ = cli.exec_command(f"grep -m1 '^DATABASE_URL' {base}/.env", timeout=60)
    line = out.read().decode("utf-8", "replace").strip()
    if not line:
        sys.exit("No DATABASE_URL in the deployed .env.")
    url = re.match(r"DATABASE_URL\s*=\s*[\"']?(.+?)[\"']?\s*$", line).group(1)
    p = re.match(r"mysql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/(.+)", url)
    if not p:
        sys.exit("DATABASE_URL is not in mysql://user:pass@host/db form.")
    return p.group(5), unquote(p.group(1)), unquote(p.group(2)), p.group(3)


def main() -> None:
    import paramiko

    queries = [q for q in sys.argv[1:] if q.strip()]
    if not queries:
        sys.exit("Pass at least one query.")
    for q in queries:
        if not READ_ONLY.match(q) or ";" in q.rstrip().rstrip(";"):
            sys.exit(f"Refused (not a single read-only statement): {q[:60]}")

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=ssh_password(), timeout=30)
    db_name, db_user, db_pw, db_host = db_from_server(cli)

    def shell_quote(s: str) -> str:
        return "'" + s.replace("'", "'\\''") + "'"

    for q in queries:
        # Credentials go in via env so they never appear in the process list.
        cmd = (
            f"MYSQL_PWD='{db_pw}' mysql -u {db_user} -h {db_host} {db_name} "
            f"--batch -e {shell_quote(q)}"
        )
        _, out, err = cli.exec_command(cmd, timeout=120)
        o = out.read().decode("utf-8", "replace").rstrip()
        e = err.read().decode("utf-8", "replace").strip()
        print(f"--- {q[:90]}")
        print(o or "(no rows)")
        if e and "Using a password" not in e:
            print("ERR:", e)
        print()

    cli.close()


if __name__ == "__main__":
    main()
