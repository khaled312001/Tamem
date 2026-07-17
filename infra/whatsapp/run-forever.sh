#!/bin/bash
# WhatsApp bridge SUPERVISOR. Runs the node bridge in a restart loop so a crash,
# a WhatsApp drop, or an OS reap of the NODE process is recovered within seconds
# with zero external help. Only this lightweight bash loop can be reaped by the
# host; keepalive.sh (driven by a free GitHub Actions cron) revives IT if so.
LOCK=/home/u748721963/whatsapp/.supervisor.lock
exec 9>"$LOCK" || exit 0
flock -n 9 || exit 0          # exactly one supervisor, ever
NODE=/opt/alt/alt-nodejs20/root/usr/bin/node
LOG=/home/u748721963/whatsapp/bridge.log
cd /home/u748721963/whatsapp || exit 1
while true; do
  echo "[supervisor $(date -u '+%F %T')] launching bridge" >> "$LOG"
  "$NODE" wa-bridge.js >> "$LOG" 2>&1 </dev/null
  echo "[supervisor $(date -u '+%F %T')] bridge exited (code $?) — restart in 3s" >> "$LOG"
  sleep 3
done
