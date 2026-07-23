"""
Deploy the built dashboard (apps/dashboard/dist) to /super_admin/ on Hostinger.

Same safety model as deploy-api.py: nothing is overwritten in place. The new
build is uploaded to a sibling directory, then swapped by rename, so a failed
or half-finished upload can never leave a broken dashboard live.

  1. upload dist/ -> super_admin.new/
  2. rename super_admin -> super_admin.bak.<timestamp>
  3. rename super_admin.new -> super_admin
  4. fetch index.html over HTTPS; roll back if it doesn't answer 200

Run scripts/deploy-api.py first if the backend also changed — a dashboard
calling endpoints that don't exist yet just shows errors.

Usage:
    python scripts/deploy-dashboard.py --dry-run
    python scripts/deploy-dashboard.py
"""

import os
import posixpath
import re
import sys
import time
import urllib.request

# Paths are derived from this script's own location so the deploy can't break
# when the repo is checked out somewhere other than E:\Tamem\Tamem. (A hardcoded
# E:\Tamem\apps\... path silently pointed at a directory that doesn't exist.)
_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HANDOFF = os.path.join(os.path.dirname(_REPO), "HANDOFF.md")
LOCAL_DIST = os.path.join(_REPO, "apps", "dashboard", "dist")
REMOTE_BASE = "/home/u748721963/domains/deliverytamem.com/public_html"
REMOTE_DIR = posixpath.join(REMOTE_BASE, "super_admin")
URL = "https://deliverytamem.com/super_admin/"
HOST, PORT, USER = "77.37.37.207", 65002, "u748721963"

DRY_RUN = "--dry-run" in sys.argv


def read_password() -> str:
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

    if not os.path.isdir(LOCAL_DIST):
        sys.exit(f"No build found at {LOCAL_DIST} — run `npm run build` in apps/dashboard first.")

    files = []
    for root, _, names in os.walk(LOCAL_DIST):
        for n in names:
            full = os.path.join(root, n)
            files.append((full, os.path.relpath(full, LOCAL_DIST).replace("\\", "/")))
    total = sum(os.path.getsize(f) for f, _ in files)
    print(f"local build: {len(files)} files, {total/1024/1024:.2f} MB")

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=read_password(), timeout=30)

    def run(cmd: str) -> str:
        _, out, err = cli.exec_command(cmd, timeout=180)
        o = out.read().decode("utf-8", "replace").strip()
        e = err.read().decode("utf-8", "replace").strip()
        return (o + ("\n" + e if e else "")).strip()

    # Look before overwriting: show what is there now.
    print("\ncurrently deployed:")
    print(run(f"ls -la '{REMOTE_DIR}' 2>/dev/null | head -12") or "  (nothing there)")
    print("\nfile count now:", run(f"find '{REMOTE_DIR}' -type f 2>/dev/null | wc -l"))

    if DRY_RUN:
        print(f"\n[dry-run] would replace {REMOTE_DIR}")
        cli.close()
        return

    staged = REMOTE_DIR + ".new"
    run(f"rm -rf '{staged}'")

    sftp = cli.open_sftp()
    made = set()
    for i, (local, rel) in enumerate(files, 1):
        remote = posixpath.join(staged, rel)
        d = posixpath.dirname(remote)
        if d not in made:
            run(f"mkdir -p '{d}'")
            made.add(d)
        sftp.put(local, remote)
        if i % 10 == 0 or i == len(files):
            print(f"  uploaded {i}/{len(files)}")
    sftp.close()

    n_new = run(f"find '{staged}' -type f | wc -l")
    if int(n_new or 0) != len(files):
        run(f"rm -rf '{staged}'")
        cli.close()
        sys.exit(f"Upload incomplete ({n_new}/{len(files)}) — live dashboard untouched.")

    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = f"{REMOTE_DIR}.bak.{stamp}"
    print(run(f"mv '{REMOTE_DIR}' '{backup}' && echo 'backup -> {backup}'"))
    print(run(f"mv '{staged}' '{REMOTE_DIR}' && echo 'swapped in new build'"))

    time.sleep(2)
    try:
        with urllib.request.urlopen(URL, timeout=25) as r:
            ok = r.status == 200
            print(f"check: HTTP {r.status}")
    except Exception as exc:  # noqa: BLE001
        ok = False
        print("check raised:", exc)

    if not ok:
        run(f"rm -rf '{REMOTE_DIR}'")
        print(run(f"mv '{backup}' '{REMOTE_DIR}' && echo 'ROLLED BACK'"))
        cli.close()
        sys.exit("Deploy rolled back — the dashboard did not answer after the swap.")

    print(f"\nDeployed. Previous build kept at {backup}")
    cli.close()


if __name__ == "__main__":
    main()
