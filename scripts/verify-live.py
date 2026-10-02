"""
Read-only check that production is running what was just deployed.

Prints only yes/no and counts, never values that identify anyone, because on
GitHub Actions the log is public.

  - api.php on the server carries the mail switch, the customer-WhatsApp switch
    and /admin/notify-status
  - the switches' values in the server .env (absent = the safe default: off)
  - wa-bridge.js on the server carries the re-entrancy guard, and the bridge
    reports "connected" with a fresh heartbeat
  - queue / dead-letter counts
  - /health answers 200, the dashboard answers 200 and its bundle calls
    /admin/notify-status

Exit code 1 if any check fails.

Usage:  python scripts/verify-live.py      (TAMEM_SSH_PASS or HANDOFF.md)
"""

import json
import os
import re
import sys
import time
import urllib.request

HOST, PORT, USER = "77.37.37.207", 65002, "u748721963"
HOME = "/home/u748721963"
API_DIR = f"{HOME}/domains/deliverytamem.com/public_html/backendtamem"
WA_DIR = f"{API_DIR}/uploads/.wa"
BRIDGE = f"{HOME}/whatsapp/wa-bridge.js"
HEALTH = "https://backendtamem.deliverytamem.com/api/v1/health"
DASHBOARD = "https://deliverytamem.com/super_admin/"

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_password() -> str:
    if os.environ.get("TAMEM_SSH_PASS"):
        return os.environ["TAMEM_SSH_PASS"]
    for path in (os.path.join(_ROOT, "HANDOFF.md"), os.path.join(os.path.dirname(_ROOT), "HANDOFF.md")):
        if os.path.exists(path):
            txt = open(path, encoding="utf-8").read()
            i = txt.find("SSH / SFTP")
            m = re.search(r"PASS(?:WORD)?\s*:\s*(\S+)", txt[i : i + 1200]) if i != -1 else None
            if m:
                return m.group(1)
    sys.exit("No SSH password: set TAMEM_SSH_PASS or add it under 'SSH / SFTP' in HANDOFF.md")


failures = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('  — ' + detail) if detail else ''}")
    if not ok:
        failures.append(label)


def http_get(url: str) -> tuple:
    try:
        with urllib.request.urlopen(url, timeout=25) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001
        return 0, str(exc)


def main() -> None:
    import paramiko

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=read_password(), timeout=30)

    def run(cmd: str) -> str:
        _, out, _ = cli.exec_command(cmd, timeout=60)
        return out.read().decode("utf-8", "replace").strip()

    api = f"{API_DIR}/api.php"
    for marker, label in [
        ("function mailEnabled", "api.php has the email switch"),
        ("function waCustomerOrderMsgs", "api.php has the customer-WhatsApp switch"),
        ("/admin/notify-status", "api.php serves /admin/notify-status"),
        ("$adminOtp = $isAdmin && mailEnabled()", "api.php: admin login skips OTP unless enabled"),
    ]:
        check(label, run(f"grep -cF '{marker}' '{api}'") not in ("", "0"))

    flags = {}
    for line in run(f"grep -E '^(MAIL_ENABLED|ADMIN_OTP_REQUIRED|WA_CUSTOMER_ORDER_MSGS)=' '{API_DIR}/.env'").splitlines():
        k, _, v = line.partition("=")
        flags[k.strip()] = v.strip().strip("'\"")
    for k in ("MAIL_ENABLED", "ADMIN_OTP_REQUIRED", "WA_CUSTOMER_ORDER_MSGS"):
        v = flags.get(k)
        on = (v or "").lower() in ("1", "true", "yes", "on")
        check(f".env {k} is off", not on, f"set to {v!r}" if v is not None else "not set (default off)")

    check("wa-bridge.js has the one-send-at-a-time guard", run(f"grep -c tickBusy '{BRIDGE}'") not in ("", "0"))
    try:
        st = json.loads(run(f"cat '{WA_DIR}/status.json'") or "{}")
    except ValueError:
        st = {}
    age = time.time() - float(st.get("ts") or 0) / 1000
    check("bridge connected", st.get("status") == "connected", f"status={st.get('status')!r}")
    check("bridge heartbeat fresh (< 60s)", age < 60, f"{int(age)}s old")
    print(f"info  queue: {run(f'ls {WA_DIR}/queue 2>/dev/null | wc -l')} file(s), "
          f"dead/: {run(f'ls {WA_DIR}/dead 2>/dev/null | wc -l')} file(s)")
    cli.close()

    code, _ = http_get(HEALTH)
    check("API /health answers 200", code == 200, f"HTTP {code}")
    code, html = http_get(DASHBOARD)
    check("dashboard answers 200", code == 200, f"HTTP {code}")
    m = re.search(r'src="(/super_admin/assets/index-[^"]+\.js)"', html or "")
    if m:
        _, js = http_get("https://deliverytamem.com" + m.group(1))
        check("dashboard bundle calls /admin/notify-status", "notify-status" in js)
    else:
        check("dashboard bundle found", False, "no index-*.js in index.html")

    print("\nALL CHECKS PASSED" if not failures else f"\n{len(failures)} CHECK(S) FAILED")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
