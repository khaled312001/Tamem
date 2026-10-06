"""
Deploy the customer password-reset page to https://deliverytamem.com/reset/.

One static file. The admin issues a link from the dashboard
(POST /admin/users/:id/reset-link) and sends it on WhatsApp; this page is what
the link opens. It talks to the API over fetch, so there is nothing to build —
the file in the repo is the file that is served.

It lives under apps/landing/public/ because it belongs to the public site, but
the landing has no CI deploy of its own, so it ships through this script.

Safety model matches deploy-api.py: upload beside the live file, then rename,
so a half-finished upload can never be what a customer opens.

Usage:
    python scripts/deploy-reset-page.py --dry-run
    python scripts/deploy-reset-page.py
"""

import os
import re
import sys

LOCAL = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "apps", "landing", "public", "reset", "index.html")
)
REMOTE_DIR = "/home/u748721963/domains/deliverytamem.com/public_html/reset"
REMOTE = REMOTE_DIR + "/index.html"
HOST, PORT, USER = "77.37.37.207", 65002, "u748721963"

DRY_RUN = "--dry-run" in sys.argv

_REPO = os.path.dirname(os.path.abspath(__file__))
HANDOFF = os.path.abspath(os.path.join(_REPO, "..", "HANDOFF.md"))


def read_password() -> str:
    """The SSH password, from the environment or HANDOFF.md. Never echoed.

    TAMEM_SSH_PASS comes first so this runs from GitHub Actions, which is the
    only route to the host that still works — see docs/RUNBOOK.md.
    """
    if os.environ.get("TAMEM_SSH_PASS"):
        return os.environ["TAMEM_SSH_PASS"]
    if not os.path.exists(HANDOFF):
        sys.exit("No SSH password: set TAMEM_SSH_PASS or add it under 'SSH / SFTP' in HANDOFF.md")
    txt = open(HANDOFF, encoding="utf-8").read()
    i = txt.find("SSH / SFTP")
    if i == -1:
        sys.exit("Could not find the 'SSH / SFTP' section in HANDOFF.md")
    m = re.search(r"PASS(?:WORD)?\s*:\s*(\S+)", txt[i : i + 1200])
    if not m:
        sys.exit("Could not find a PASS/PASSWORD line under 'SSH / SFTP'")
    return m.group(1)


def main() -> None:
    import paramiko

    if not os.path.exists(LOCAL):
        sys.exit(f"Not found: {LOCAL}")
    payload = open(LOCAL, "rb").read()
    print(f"local page: {len(payload):,} bytes")

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=read_password(), timeout=30)

    def run(cmd: str) -> str:
        _, out, err = cli.exec_command(cmd, timeout=120)
        o = out.read().decode("utf-8", "replace").strip()
        e = err.read().decode("utf-8", "replace").strip()
        return (o + ("\n" + e if e else "")).strip()

    print("currently there:", run(f"ls -l '{REMOTE}' 2>/dev/null") or "(nothing)")

    if DRY_RUN:
        print(f"[dry-run] would write {REMOTE}")
        cli.close()
        return

    run(f"mkdir -p '{REMOTE_DIR}'")
    sftp = cli.open_sftp()
    with sftp.file(REMOTE + ".new", "wb") as f:
        f.write(payload)
    sftp.close()

    # Size check before the swap: a truncated upload would otherwise become the
    # live page, and this one has no build step to catch it.
    size = run(f"stat -c %s '{REMOTE}.new'")
    if size != str(len(payload)):
        run(f"rm -f '{REMOTE}.new'")
        cli.close()
        sys.exit(f"Upload incomplete ({size} of {len(payload)} bytes) — nothing was swapped in.")

    print(run(f"mv '{REMOTE}.new' '{REMOTE}' && echo 'swapped in'"))
    # Verified ON THE SERVER, not over HTTPS: Hostinger's WAF answers 403 to
    # datacenter IPs, so a public fetch from a CI runner proves nothing.
    print(run(
        f"grep -q 'auth/reset-link' '{REMOTE}' && stat -c 'live: %s bytes, %y' '{REMOTE}'"
        f" || echo 'MISSING the API call — check the file'"
    ))
    cli.close()


if __name__ == "__main__":
    main()
