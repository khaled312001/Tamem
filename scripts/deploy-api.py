"""
Deploy apps/backend/dist-bundle/api.php to the Hostinger production host.

Safety model — nothing destructive happens until the new file has proven
itself ON THE SERVER:

  1. upload to  api.php.new
  2. run `php -l api.php.new` remotely (a syntax error in a 400KB shim would
     take the whole API down with a white page)
  3. copy the current api.php to api.php.bak.<timestamp>
  4. only then rename api.php.new -> api.php
  5. re-verify over HTTPS; if the health check fails, roll back to the backup

Credentials are read from HANDOFF.md (git-ignored) and never printed.

Usage:
    python scripts/deploy-api.py            # deploy
    python scripts/deploy-api.py --dry-run  # connect, locate, verify only

Requires: pip install paramiko
"""

import hashlib
import os
import posixpath
import re
import sys
import time
import urllib.request

# Derived from this script's location so the deploy points at the file being
# edited regardless of where the repo is checked out. The old hardcoded
# E:\Tamem\apps\... path pointed at a directory that doesn't exist.
_REPO = os.path.dirname(os.path.abspath(__file__))
HANDOFF = os.path.join(os.path.dirname(_REPO), "HANDOFF.md")
if not os.path.exists(HANDOFF):
    HANDOFF = os.path.join(_REPO, "..", "HANDOFF.md")
if not os.path.exists(HANDOFF):
    HANDOFF = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Tamem", "HANDOFF.md")
if not os.path.exists(HANDOFF):
    HANDOFF = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "HANDOFF.md"))
if not os.path.exists(HANDOFF):
    # Some checkouts nest the repo one level deeper (…/Tamem/Tamem), so HANDOFF
    # sits two levels above scripts/, not one.
    HANDOFF = os.path.join(os.path.dirname(os.path.dirname(_REPO)), "HANDOFF.md")
LOCAL = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "backend", "dist-bundle", "api.php"))
HOST, PORT, USER = "77.37.37.207", 65002, "u748721963"
HEALTH_URL = "https://backendtamem.deliverytamem.com/api/v1/health"

DRY_RUN = "--dry-run" in sys.argv


def read_password() -> str:
    """Pull the SSH password out of HANDOFF.md without echoing it."""
    txt = open(HANDOFF, encoding="utf-8").read()
    i = txt.find("SSH / SFTP")
    if i == -1:
        sys.exit("Could not find the 'SSH / SFTP' section in HANDOFF.md")
    m = re.search(r"PASS(?:WORD)?\s*:\s*(\S+)", txt[i : i + 1200])
    if not m:
        sys.exit("Could not find a PASS/PASSWORD line under 'SSH / SFTP' in HANDOFF.md")
    return m.group(1)


def main() -> None:
    try:
        import paramiko
    except ImportError:
        sys.exit("paramiko is missing.  Run:  python -m pip install paramiko")

    payload = open(LOCAL, "rb").read()
    print(f"local api.php  {len(payload):,} bytes  sha1={hashlib.sha1(payload).hexdigest()[:12]}")

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=read_password(), timeout=30)

    def run(cmd: str) -> str:
        _, out, err = cli.exec_command(cmd, timeout=120)
        o = out.read().decode("utf-8", "replace").strip()
        e = err.read().decode("utf-8", "replace").strip()
        return (o + ("\n" + e if e else "")).strip()

    # Locate the live file rather than assuming a path — a wrong guess here
    # would silently deploy nothing.
    found = run(
        "find ~/domains ~/public_html -maxdepth 5 -name api.php "
        "-not -name '*.bak*' -not -name '*.new' 2>/dev/null | head -10"
    )
    if not found:
        cli.close()
        sys.exit("Could not locate api.php on the server — deploy aborted.")

    paths = found.splitlines()
    print("found on server:")
    for p in paths:
        print("   ", p, run(f"stat -c '%s bytes  %y' '{p}'"))

    if len(paths) > 1:
        print(
            "\nMore than one api.php found. Refusing to guess which is live.\n"
            "Re-run with the right one hard-coded, or remove the stale copies."
        )
        cli.close()
        sys.exit(1)

    remote = paths[0]
    remote_dir = posixpath.dirname(remote)
    staged = remote + ".new"

    if DRY_RUN:
        print(f"\n[dry-run] would deploy to {remote}")
        cli.close()
        return

    # 1) upload alongside, never over, the live file
    sftp = cli.open_sftp()
    sftp.putfo(__import__("io").BytesIO(payload), staged)
    sftp.close()
    print(f"uploaded -> {staged}")

    # 2) syntax check on the server's own PHP build
    lint = run(f"cd '{remote_dir}' && php -l api.php.new")
    print("php -l:", lint)
    if "No syntax errors" not in lint:
        run(f"rm -f '{staged}'")
        cli.close()
        sys.exit("Syntax check FAILED on the server — live file untouched.")

    # 3) backup, 4) swap
    #
    # The backup goes OUTSIDE the web root. It used to be written next to the
    # live file as `api.php.bak.<stamp>`, and Apache served it: the whole 620 KB
    # backend — every route, every auth check, every query — was downloadable by
    # anyone who guessed the name, and one was left behind by every deploy we
    # have ever run. The server's .htaccess blocks dotfiles (`.env` and
    # `.htaccess` both answer 403) but has no rule for `*.bak*`.
    #
    # `~/api-backups/` is not under any docroot, so there is nothing to guess.
    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup_dir = "$HOME/api-backups"
    backup = f"{backup_dir}/api.php.{stamp}"
    print(run(f"mkdir -p '{backup_dir}' && chmod 700 '{backup_dir}' && "
              f"cp -p '{remote}' '{backup}' && echo 'backup -> {backup}'"))
    print(run(f"mv '{staged}' '{remote}' && echo 'swapped in new api.php'"))
    # Sweep any backup a previous run left in the web root. Deleting them is the
    # point — while one exists the source is a public download.
    stale = run(f"find '{remote_dir}' -maxdepth 1 -name 'api.php.bak.*' -print -delete 2>/dev/null | wc -l")
    if stale.strip() not in ("", "0"):
        print(f"removed {stale.strip()} publicly-readable backup(s) from the web root")

    # 5) prove it actually serves traffic; roll back if not
    time.sleep(2)
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=20) as r:
            ok = r.status == 200
            print(f"health check: HTTP {r.status}")
    except Exception as exc:  # noqa: BLE001 - any failure means roll back
        ok = False
        print("health check raised:", exc)

    if not ok:
        print(run(f"cp -p '{backup}' '{remote}' && echo 'ROLLED BACK to {backup}'"))
        cli.close()
        sys.exit("Deploy rolled back — the API did not answer after the swap.")

    print(f"\nDeployed. Previous version kept at {backup}")
    cli.close()


if __name__ == "__main__":
    main()
