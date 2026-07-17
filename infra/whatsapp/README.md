# WhatsApp bridge keep-alive (zero paid subscription)

The Baileys WhatsApp bridge runs on Hostinger **shared** hosting, where PHP
can't spawn processes and there's no crontab CLI, and the host periodically
reaps long-running processes. Staying up therefore needs two layers:

- **`run-forever.sh`** — a supervisor that runs `wa-bridge.js` in a restart loop.
  A crash / WhatsApp drop / node reap recovers in a few seconds, no external help.
  `flock` guarantees a single supervisor.
- **`keepalive.sh`** — relaunches the _supervisor_ if the host reaped it, and
  bounces node if the heartbeat (`status.json.ts`) goes stale. Idempotent + locked.
- **`.github/workflows/whatsapp-keepalive.yml`** — a free scheduled GitHub Action
  (unlimited on public repos) SSHes in every ~5 min and runs `keepalive.sh`.

These scripts are deployed to `/home/u748721963/whatsapp/` on the server. Edit
here, copy there. See the workflow file for the four repo secrets to set once.
