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

# 0) Log rotation. libsignal prints huge session dumps via console.log (bypassing
# the silent logger); left alone the log grows until it hits the disk quota and
# takes the whole account down — a self-inflicted outage. Truncate past ~3 MB.
# The bridge appends with O_APPEND (>>), so truncating under it is clean.
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 3145728 ]; then
  tail -c 400000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
  echo "[keepalive $(date -u '+%F %T')] log rotated" >> "$LOG"
fi

# 1) Supervisor alive? (it owns the node loop)
if ! pgrep -f "run-forever.sh" >/dev/null 2>&1; then
  echo "[keepalive $(date -u '+%F %T')] supervisor down — starting" >> "$LOG"
  setsid /bin/bash "$SUP" >/dev/null 2>&1 </dev/null &
  exit 0
fi

# 2) Supervisor up but heartbeat wedged (hung socket)? bounce node; supervisor
# respawns it. 90s: the bridge beats every 15s, so 6 missed beats is safely dead
# without false-positiving a brief GC pause. (Was 180s — half the recovery time.)
if [ -f "$STATUS" ]; then
  ts=$(grep -o '"ts":[0-9]*' "$STATUS" | grep -o '[0-9]*' | head -1)
  now=$(($(date +%s) * 1000))
  if [ -n "$ts" ] && [ $((now - ts)) -gt 90000 ]; then
    echo "[keepalive $(date -u '+%F %T')] heartbeat stale — bouncing node" >> "$LOG"
    pkill -f "wa-bridge.js"
  fi
fi
exit 0
