#!/bin/bash
# Ensures the WhatsApp bridge supervisor is running. Idempotent + locked, safe to
# run on any schedule. Invoked by a free GitHub Actions cron (public repo) every
# few minutes, so the service survives even a full OS reap without any paid
# server subscription or hPanel cron.
SUP=/home/u748721963/whatsapp/run-forever.sh
LOG=/home/u748721963/whatsapp/bridge.log
STATUS=/home/u748721963/domains/deliverytamem.com/public_html/backendtamem/uploads/.wa/status.json
GATE=/home/u748721963/whatsapp/.keepalive.lock
exec 8>"$GATE" || exit 0
flock -n 8 || exit 0

# 1) Supervisor alive? (it owns the node loop)
if ! pgrep -f "run-forever.sh" >/dev/null 2>&1; then
  echo "[keepalive $(date -u '+%F %T')] supervisor down — starting" >> "$LOG"
  setsid /bin/bash "$SUP" >/dev/null 2>&1 </dev/null &
  exit 0
fi

# 2) Supervisor up but heartbeat wedged (hung socket)? bounce node; supervisor respawns it.
if [ -f "$STATUS" ]; then
  ts=$(grep -o '"ts":[0-9]*' "$STATUS" | grep -o '[0-9]*' | head -1)
  now=$(($(date +%s) * 1000))
  if [ -n "$ts" ] && [ $((now - ts)) -gt 180000 ]; then
    echo "[keepalive $(date -u '+%F %T')] heartbeat stale — bouncing node" >> "$LOG"
    pkill -f "wa-bridge.js"
  fi
fi
exit 0
