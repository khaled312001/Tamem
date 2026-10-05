#!/bin/bash
# WhatsApp bridge SUPERVISOR. Runs the node bridge in a restart loop so a crash,
# a WhatsApp drop, or an OS reap of the NODE process is recovered within seconds
# with zero external help. Only this lightweight bash loop can be reaped by the
# host; keepalive.sh (driven by a free GitHub Actions cron) revives IT if so.
LOCK=/home/u748721963/whatsapp/.supervisor.lock
PID_FILE=/home/u748721963/whatsapp/.supervisor.pid
WATCH_PID=/home/u748721963/whatsapp/.watchdog.pid
exec 9>"$LOCK" || exit 0
flock -n 9 || exit 0          # exactly one supervisor, ever
echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT
NODE=/opt/alt/alt-nodejs20/root/usr/bin/node
LOG=/home/u748721963/whatsapp/bridge.log
cd /home/u748721963/whatsapp || exit 1

# Keep the watchdog alive — it is what restarts THIS script if the host reaps it.
# flock inside watchdog.sh makes a second call a no-op, so this is safe to spam.
ensure_watchdog() {
  # By pid, not by pgrep: see the note in watchdog.sh about command-line matches.
  if [ -f "$WATCH_PID" ] && kill -0 "$(cat "$WATCH_PID" 2>/dev/null)" 2>/dev/null; then
    return
  fi
  echo "[supervisor $(date -u '+%F %T')] watchdog down — starting" >> "$LOG"
  setsid /bin/bash /home/u748721963/whatsapp/watchdog.sh >/dev/null 2>&1 </dev/null 9>&- &
}

while true; do
  ensure_watchdog               # also covers the first launch
  echo "[supervisor $(date -u '+%F %T')] launching bridge" >> "$LOG"
  # Children must NOT inherit the lock fd. flock is held as long as ANY open file
  # descriptor refers to it, and a child inherits them: node, launched by the
  # supervisor, kept .supervisor.lock held. So when the host reaped the supervisor
  # and left node running, every attempt to start a replacement failed `flock -n`
  # and exited silently. Nothing supervised the bridge from then on, and when node
  # finally died there was nobody to restart it — hours of no WhatsApp, with every
  # order message queued. `9>&-` (and 7, 8) closes the fd in the child.
  "$NODE" wa-bridge.js >> "$LOG" 2>&1 </dev/null 9>&-
  echo "[supervisor $(date -u '+%F %T')] bridge exited (code $?) — restart in 3s" >> "$LOG"
  sleep 3
done
