#!/bin/bash
# Second watchdog, one half of a mutual-resurrection pair with run-forever.sh.
#
# Why a second process: run-forever.sh recovers the NODE bridge in seconds, but
# nothing on the server recovered run-forever.sh itself when the host reaped it.
# That job fell to keepalive.sh driven by a GitHub Actions cron — and that cron,
# measured over 39 runs, fires every 291 minutes (median) rather than the 5 it
# asks for. So a reaped supervisor meant NO WhatsApp for hours, with every order
# message sitting in the queue. This host has no crontab CLI either (checked:
# `command -v crontab` is empty), so a per-minute server cron has to be added by
# hand in hPanel and cannot be relied on to already exist.
#
# Hence: the supervisor starts this, this restarts the supervisor, and the bridge
# re-checks both. Each one is flock-guarded, so none can ever run twice.
BASE=/home/u748721963/whatsapp
SUP="$BASE/run-forever.sh"
LOG="$BASE/bridge.log"
STATUS=/home/u748721963/domains/deliverytamem.com/public_html/backendtamem/uploads/.wa/status.json
LOCK="$BASE/.watchdog.lock"
exec 7>"$LOCK" || exit 0
flock -n 7 || exit 0          # exactly one watchdog, ever

while true; do
  # 1) Supervisor reaped? It owns the node loop, so nothing sends without it.
  if ! pgrep -f "[r]un-forever.sh" >/dev/null 2>&1; then
    echo "[watchdog $(date -u '+%F %T')] supervisor down — starting" >> "$LOG"
    setsid /bin/bash "$SUP" >/dev/null 2>&1 </dev/null &
  fi

  # 2) Supervisor up but the bridge is wedged on a dead socket. The bridge beats
  # every 15s, so 6 missed beats is safely dead without tripping on a GC pause.
  # Killing node is enough: the supervisor respawns it within 3s.
  if [ -f "$STATUS" ]; then
    ts=$(grep -o '"ts":[0-9]*' "$STATUS" | grep -o '[0-9]*' | head -1)
    now=$(($(date +%s) * 1000))
    if [ -n "$ts" ] && [ $((now - ts)) -gt 90000 ]; then
      echo "[watchdog $(date -u '+%F %T')] heartbeat stale — bouncing node" >> "$LOG"
      pkill -f "wa-bridge.js"
    fi
  fi

  sleep 20
done
