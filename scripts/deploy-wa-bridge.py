"""
Deploy infra/whatsapp/wa-bridge.js to the Hostinger host and restart it.

Same safety model as deploy-api.py: nothing is replaced until the new file
has proven itself ON THE SERVER.

  1. upload to  ~/whatsapp/wa-bridge.js.new
  2. `node --check` it with the server's own node (a syntax error would leave
     the supervisor restarting a dead bridge every 3s — no WhatsApp at all)
  3. copy the running wa-bridge.js to ~/api-backups/wa-bridge.js.<timestamp>
  4. swap it in and stop the running node; run-forever.sh (the supervisor)
     starts the new one within ~3s. If the supervisor itself is down,
     keepalive.sh starts it.
  5. wait for status.json to say "connected" with a fresh heartbeat; if it
     doesn't within 90s, put the backup back and restart again

Credentials: TAMEM_SSH_PASS if set, else HANDOFF.md (git-ignored). Never printed.

Usage:
    python scripts/deploy-wa-bridge.py
    python scripts/deploy-wa-bridge.py --dry-run   # connect + check only

Requires: pip install paramiko
"""

import hashlib
import io
import json
import os
import re
import sys
import time

_SCRIPTS = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_SCRIPTS)
LOCAL = os.path.join(_ROOT, "infra", "whatsapp", "wa-bridge.js")
HANDOFF_CANDIDATES = [
    os.path.join(_ROOT, "HANDOFF.md"),
    os.path.join(os.path.dirname(_ROOT), "HANDOFF.md"),
]
HOST, PORT, USER = "77.37.37.207", 65002, "u748721963"
HOME = "/home/u748721963"
BRIDGE_DIR = f"{HOME}/whatsapp"
NODE = "/opt/alt/alt-nodejs20/root/usr/bin/node"
STATUS = f"{HOME}/domains/deliverytamem.com/public_html/backendtamem/uploads/.wa/status.json"

DRY_RUN = "--dry-run" in sys.argv


def read_password() -> str:
    if os.environ.get("TAMEM_SSH_PASS"):
        return os.environ["TAMEM_SSH_PASS"]
    for path in HANDOFF_CANDIDATES:
        if os.path.exists(path):
            txt = open(path, encoding="utf-8").read()
            i = txt.find("SSH / SFTP")
            m = re.search(r"PASS(?:WORD)?\s*:\s*(\S+)", txt[i : i + 1200]) if i != -1 else None
            if m:
                return m.group(1)
    sys.exit("No SSH password: set TAMEM_SSH_PASS or add it under 'SSH / SFTP' in HANDOFF.md")


def main() -> None:
    try:
        import paramiko
    except ImportError:
        sys.exit("paramiko is missing.  Run:  python -m pip install paramiko")

    payload = open(LOCAL, "rb").read().replace(b"\r\n", b"\n")
    print(f"local wa-bridge.js  {len(payload):,} bytes  sha1={hashlib.sha1(payload).hexdigest()[:12]}")
    if b"tickBusy" not in payload:
        sys.exit("This wa-bridge.js has no re-entrancy guard (tickBusy) — it is the old file. Pull first.")

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=read_password(), timeout=30)

    def run(cmd: str) -> str:
        _, out, err = cli.exec_command(cmd, timeout=120)
        o = out.read().decode("utf-8", "replace").strip()
        e = err.read().decode("utf-8", "replace").strip()
        return (o + ("\n" + e if e else "")).strip()

    def status() -> dict:
        try:
            return json.loads(run(f"cat '{STATUS}'") or "{}")
        except ValueError:
            return {}

    live = f"{BRIDGE_DIR}/wa-bridge.js"
    print("server:", run(f"stat -c '%s bytes  %y' '{live}'"))
    before = status()
    print("bridge now:", before.get("status"), "| phone:", before.get("phone"),
          "| queue:", run(f"ls '{os.path.dirname(STATUS)}/queue' 2>/dev/null | wc -l"), "file(s)")

    if DRY_RUN:
        print("\n[dry-run] would deploy to", live)
        cli.close()
        return

    staged = live + ".new"
    sftp = cli.open_sftp()
    sftp.putfo(io.BytesIO(payload), staged)
    sftp.close()
    print("uploaded ->", staged)

    check = run(f"cd '{BRIDGE_DIR}' && '{NODE}' --check wa-bridge.js.new && echo SYNTAX_OK")
    if "SYNTAX_OK" not in check:
        run(f"rm -f '{staged}'")
        cli.close()
        sys.exit("node --check FAILED on the server — running bridge untouched.\n" + check)

    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = f"$HOME/api-backups/wa-bridge.js.{stamp}"
    print(run(f"mkdir -p $HOME/api-backups && chmod 700 $HOME/api-backups && "
              f"cp -p '{live}' {backup} && echo 'backup -> {backup}'"))
    print(run(f"mv '{staged}' '{live}' && echo 'swapped in new wa-bridge.js'"))

    def restart() -> None:
        # [n]ode: the pattern must not match this very shell's command line.
        run("pkill -f '[n]ode wa-bridge.js' ; true")
        time.sleep(4)
        # If the supervisor itself was reaped, keepalive starts it.
        run(f"bash '{BRIDGE_DIR}/keepalive.sh' ; true")

    def wait_connected(limit: int = 90) -> bool:
        start = time.time()
        while time.time() - start < limit:
            st = status()
            fresh = (time.time() * 1000 - float(st.get("ts") or 0)) < 30000
            if st.get("status") == "connected" and fresh:
                return True
            time.sleep(5)
        return False

    restart()
    if wait_connected():
        st = status()
        print(f"\nbridge connected as {st.get('phone')} — deployed. Previous version kept at {backup}")
        print(run(f"tail -n 5 '{BRIDGE_DIR}/bridge.log'"))
    else:
        print("bridge did not report 'connected' within 90s — rolling back")
        print(run(f"cp -p {backup} '{live}' && echo 'restored {backup}'"))
        restart()
        print("after rollback:", "connected" if wait_connected() else "STILL NOT CONNECTED — check bridge.log")
        print(run(f"tail -n 20 '{BRIDGE_DIR}/bridge.log'"))
        cli.close()
        sys.exit(1)
    cli.close()


if __name__ == "__main__":
    main()
