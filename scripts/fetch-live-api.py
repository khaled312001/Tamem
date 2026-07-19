"""
Download the live api.php for comparison. Read-only — touches nothing.

The server copy has drifted from git before (SFTP hotfixes that were never
committed), so this is the check to run before any deploy: if the live file
contains work that isn't in the repo, deploying would silently delete it.
"""

import re
import sys

HANDOFF = r"E:\Tamem\HANDOFF.md"
REMOTE = "/home/u748721963/domains/deliverytamem.com/public_html/backendtamem/api.php"
OUT = r"C:\Users\MATRIX\AppData\Local\Temp\claude\e--Tamem-Tamem\live-api.php"
HOST, PORT, USER = "77.37.37.207", 65002, "u748721963"


def read_password() -> str:
    txt = open(HANDOFF, encoding="utf-8").read()
    i = txt.find("SSH / SFTP")
    if i == -1:
        sys.exit("Could not find the 'SSH / SFTP' section in HANDOFF.md")
    m = re.search(r"PASS(?:WORD)?\s*:\s*(\S+)", txt[i : i + 1200])
    if not m:
        sys.exit("Could not find a PASS/PASSWORD line under 'SSH / SFTP'")
    return m.group(1)


import paramiko  # noqa: E402

cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect(HOST, port=PORT, username=USER, password=read_password(), timeout=30)
sftp = cli.open_sftp()
sftp.get(REMOTE, OUT)
sftp.close()
cli.close()
print("downloaded ->", OUT)
