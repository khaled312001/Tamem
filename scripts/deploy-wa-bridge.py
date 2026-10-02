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
WA_DIR = f"{HOME}/domains/deliverytamem.com/public_html/backendtamem/uploads/.wa"
STATUS = f"{WA_DIR}/status.json"

# Run on the server with its own node. Summarises the queue and, with "park",
# moves messages to a PERSON that have sat there over 30 minutes into dead/
# (kept, not sent). A backlog flushed at restart is how customers get a burst
# of expired codes and stale order updates. Group messages are left to go out.
# Prints counts only; digits in error texts are masked.
QUEUE_TIDY_JS = r"""
const fs = require('fs'), path = require('path');
const Q = process.argv[2] + '/queue', D = process.argv[2] + '/dead', PARK = process.argv[3] === 'park';
const MAXAGE = 30 * 60 * 1000, now = Date.now();
const o = { total: 0, group: 0, person: 0, person_over_30min: 0, retrying: 0, parked: 0, errors: {} };
try { fs.mkdirSync(D, { recursive: true }); } catch {}
let files = [];
try { files = fs.readdirSync(Q).filter((f) => f.endsWith('.json')); } catch {}
for (const f of files) {
  const full = path.join(Q, f);
  let m;
  try { m = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { continue; }
  const group = String(m.to || '').includes('@g.us');
  o.total++; group ? o.group++ : o.person++;
  if (m.attempts) o.retrying++;
  if (m.lastError) { const k = String(m.lastError).replace(/\d+/g, '#').slice(0, 70); o.errors[k] = (o.errors[k] || 0) + 1; }
  let age = 0;
  try { age = now - fs.statSync(full).mtimeMs; } catch { continue; }
  if (!group && age > MAXAGE) {
    o.person_over_30min++;
    if (PARK) {
      try {
        fs.writeFileSync(path.join(D, f), JSON.stringify({ ...m, reason: 'stale at deploy (>30 min) - not sent' }));
        fs.unlinkSync(full);
        o.parked++;
      } catch {}
    }
  }
}
console.log(JSON.stringify(o));
"""

DRY_RUN = "--dry-run" in sys.argv
# On GitHub Actions the log is public (the repo is public): no phone numbers,
# no bridge.log lines (they carry numbers), only states and counts.
PUBLIC_LOG = bool(os.environ.get("CI"))


def show_phone(p) -> str:
    return "(hidden)" if PUBLIC_LOG else str(p)


def show_log(text: str) -> str:
    return "(bridge.log not shown in a public CI log)" if PUBLIC_LOG else text


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
    tidy = f"{BRIDGE_DIR}/.queue-tidy.js"
    sftp = cli.open_sftp()
    sftp.putfo(io.BytesIO(QUEUE_TIDY_JS.encode("utf-8")), tidy)

    def queue(mode: str) -> str:
        return run(f"'{NODE}' '{tidy}' '{WA_DIR}' {mode}")

    print("server:", run(f"stat -c '%s bytes  %y' '{live}'"))
    before = status()
    print("bridge now:", before.get("status"), "| phone:", show_phone(before.get("phone")))
    print("queue now:", queue("report"))

    if DRY_RUN:
        run(f"rm -f '{tidy}'")
        sftp.close()
        print("\n[dry-run] would deploy to", live)
        cli.close()
        return

    # Staged with a .js extension: node --check refuses any other.
    staged = f"{BRIDGE_DIR}/wa-bridge.next.js"
    sftp.putfo(io.BytesIO(payload), staged)
    sftp.close()
    print("uploaded ->", staged)

    check = run(f"cd '{BRIDGE_DIR}' && '{NODE}' --check wa-bridge.next.js && echo SYNTAX_OK")
    if "SYNTAX_OK" not in check:
        run(f"rm -f '{staged}' '{tidy}'")
        cli.close()
        sys.exit("node --check FAILED on the server — running bridge untouched.\n" + check)

    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = f"$HOME/api-backups/wa-bridge.js.{stamp}"
    print(run(f"mkdir -p $HOME/api-backups && chmod 700 $HOME/api-backups && "
              f"cp -p '{live}' {backup} && echo 'backup -> {backup}'"))
    print(run(f"mv '{staged}' '{live}' && echo 'swapped in new wa-bridge.js'"))

    def server_ms() -> float:
        try:
            return float(run("date +%s%3N"))
        except ValueError:
            return time.time() * 1000

    def restart(park: bool = False) -> float:
        """Stop the bridge; the supervisor starts the new one ~3s later.
        Returns the server's clock at the restart."""
        t0 = server_ms()
        # [n]ode: the pattern must not match this very shell's command line.
        run("pkill -f '[n]ode wa-bridge.js' ; true")
        if park:  # nothing is sending now: safe to move files
            print("queue tidy:", queue("park"))
        time.sleep(4)
        # If the supervisor itself was reaped, keepalive starts it.
        run(f"bash '{BRIDGE_DIR}/keepalive.sh' ; true")
        return t0

    def wait_connected(t0: float, limit: int = 90) -> bool:
        """Connected AND reported by the bridge started after t0 — the old
        one's status.json says "connected" for a while after it is gone."""
        start = time.time()
        while time.time() - start < limit:
            st = status()
            if st.get("status") == "connected" and float(st.get("startedAt") or 0) >= t0:
                return True
            time.sleep(5)
        return False

    t0 = restart(park=True)
    if wait_connected(t0):
        st = status()
        print(f"\nbridge connected as {show_phone(st.get('phone'))} — deployed. Previous version kept at {backup}")
        print(show_log(run(f"tail -n 5 '{BRIDGE_DIR}/bridge.log'")))
    else:
        print("bridge did not report 'connected' within 90s — rolling back")
        print(run(f"cp -p {backup} '{live}' && echo 'restored {backup}'"))
        t1 = restart()
        print("after rollback:", "connected" if wait_connected(t1) else "STILL NOT CONNECTED — check bridge.log")
        print(show_log(run(f"tail -n 20 '{BRIDGE_DIR}/bridge.log'")))
        run(f"rm -f '{tidy}'")
        cli.close()
        sys.exit(1)
    print("queue after:", queue("report"))
    run(f"rm -f '{tidy}'")
    cli.close()


if __name__ == "__main__":
    main()
