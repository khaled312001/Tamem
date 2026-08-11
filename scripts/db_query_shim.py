"""
Shared SSH → production `DATABASE_URL` lookup.

db-query.py and db-migrate.py both grew their own copy of this because their
filenames have hyphens and cannot be imported. Rather than add a third copy for
dev-env-sync.py, the lookup lives here once. The URL is returned, never printed.
"""

import re
import sys

HANDOFF = r"E:\Tamem\HANDOFF.md"
HOST, PORT, USER = "77.37.37.207", 65002, "u748721963"
REMOTE_ENV = "~/domains/deliverytamem.com/public_html/backendtamem/.env"


def ssh_password() -> str:
    txt = open(HANDOFF, encoding="utf-8").read()
    i = txt.find("SSH / SFTP")
    m = re.search(r"PASS(?:WORD)?\s*:\s*(\S+)", txt[i : i + 1200])
    if not m:
        sys.exit("No SSH password found under 'SSH / SFTP' in HANDOFF.md")
    return m.group(1)


def db_url_from_server() -> str:
    """The exact DATABASE_URL string the deployed api.php connects with."""
    import paramiko

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=ssh_password(), timeout=30)
    try:
        _, out, _ = cli.exec_command(f"grep -m1 '^DATABASE_URL' {REMOTE_ENV}", timeout=60)
        line = out.read().decode("utf-8", "replace").strip()
    finally:
        cli.close()
    if not line:
        sys.exit("No DATABASE_URL in the deployed .env.")
    m = re.match(r"DATABASE_URL\s*=\s*[\"']?(.+?)[\"']?\s*$", line)
    if not m:
        sys.exit("Could not parse DATABASE_URL from the deployed .env.")
    return m.group(1)
