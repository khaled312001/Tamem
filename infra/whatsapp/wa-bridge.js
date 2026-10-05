/*
 * Tamem WhatsApp bridge (Baileys, no Chromium).
 * - Persists the WhatsApp session to ./auth so it reconnects WITHOUT a new
 *   QR after the first pairing.
 * - Writes status + QR (as a data URL) to the IPC dir the PHP shim reads.
 * - Polls the IPC queue dir for outgoing messages and control commands.
 * Runs as a detached process; a cron keep-alive restarts it if it dies.
 */
const fs = require('fs');
const path = require('path');

// libsignal-node prints verbose per-message session dumps ("Closing session:
// SessionEntry { … }") via console.log/console.error, bypassing Baileys' silent
// pino logger. Unchecked they flood bridge.log to megabytes (disk-quota outage)
// and stall the event loop on every inbound message. Drop that specific noise
// while keeping our own diagnostics. Must run before Baileys is required.
for (const level of ['log', 'error', 'warn', 'info', 'debug']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    const first = args.length ? args[0] : '';
    if (
      typeof first === 'string' &&
      (first.startsWith('Closing session') ||
        first.startsWith('Closing open session') ||
        first.startsWith('SessionEntry') ||
        first.includes('Closing stale'))
    ) {
      return; // libsignal ratcheting noise — not actionable
    }
    orig(...args);
  };
}

let baileys;
try {
  baileys = require('baileys');
} catch (e) {
  baileys = require('@whiskeysockets/baileys');
}
const makeWASocket = baileys.default || baileys.makeWASocket;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = baileys;
const QRCode = require('qrcode');
const pino = require('pino');

const HOME = '/home/u748721963';
const BASE = path.join(HOME, 'whatsapp');
const AUTH_DIR = path.join(BASE, 'auth');

// SINGLE-INSTANCE GUARD. Two bridges sharing the same WhatsApp creds fight over
// the linked-device session — each keeps getting "replaced", closing and
// reconnecting in a tight loop ("Closing session" spam) and nothing is sent.
// A PID-file lock guarantees exactly ONE active bridge no matter how many the
// ops scripts launch: a duplicate sees a live PID here and exits immediately.
const PID_FILE = path.join(BASE, 'bridge.pid');
try {
  if (fs.existsSync(PID_FILE)) {
    const other = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (other && other !== process.pid) {
      let alive = false;
      try {
        process.kill(other, 0);
        alive = true;
      } catch {
        alive = false;
      }
      if (alive) {
        console.log('another bridge (pid ' + other + ') is live — exiting');
        process.exit(0);
      }
    }
  }
  fs.writeFileSync(PID_FILE, String(process.pid));
} catch (e) {
  /* best-effort; continue */
}
process.on('exit', () => {
  try {
    if (parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10) === process.pid)
      fs.unlinkSync(PID_FILE);
  } catch {}
});
// IPC dir lives under the backend docroot so the PHP shim (open_basedir) can read/write it.
const IPC = path.join(HOME, 'domains/deliverytamem.com/public_html/backendtamem/uploads/.wa');
const QUEUE_DIR = path.join(IPC, 'queue');
const CONTROL_DIR = path.join(IPC, 'control');
const DEAD_DIR = path.join(IPC, 'dead');
const STATUS_FILE = path.join(IPC, 'status.json');
for (const d of [BASE, AUTH_DIR, IPC, QUEUE_DIR, CONTROL_DIR, DEAD_DIR])
  fs.mkdirSync(d, { recursive: true });
// A message that keeps failing after this many tries is parked in dead/ — never
// silently dropped, so it can be inspected/re-queued instead of lost.
const MAX_ATTEMPTS = 6;
// One send may take this long before we stop waiting on it. Baileys' own query
// timeout is 60s; past that the send is in an unknown state.
const SEND_TIMEOUT_MS = 75 * 1000;

// Sending limits. WhatsApp bans numbers that blast messages, so every send
// goes through these (env overrides are read at start-up):
//  - at least WA_MIN_GAP_MS between two sends
//  - at most WA_MAX_PER_HOUR sends in any rolling hour; past that, messages
//    wait in the queue (nothing is lost)
//  - at most WA_MAX_PER_NUMBER sends to one customer in 10 minutes; past that
//    the message is parked in dead/ and never sent. That is what a flood looks
//    like: the same code twenty times, a reset button hammered. Groups and
//    staff messages (msg.staff, set by api.php) are exempt: order alerts reach
//    them in bursts by design.
// 1.2s is the dominant term in how fast a backlog drains: one order fans out to
// the customer, the driver, the group and the supervisor, so a 3s gap put the
// last of them 12s behind the order even with an empty queue. MAX_PER_HOUR
// still bounds the daily volume, which is what WhatsApp actually bans for.
const MIN_GAP_MS = +process.env.WA_MIN_GAP_MS || 1200;
const MAX_PER_HOUR = +process.env.WA_MAX_PER_HOUR || 300;
const MAX_PER_NUMBER = +process.env.WA_MAX_PER_NUMBER || 5;
const PER_NUMBER_WINDOW_MS = 10 * 60 * 1000;
let lastSendAt = 0;
const sentTimes = []; // timestamps of sends in the last hour
const perNumber = new Map(); // jid -> timestamps of sends in the last 10 min
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A queue file is renamed to `<name>.sending` while its send is in flight, so
// it is claimed by exactly one send. One still here at start-up means the
// bridge died mid-send: the message may well have been delivered, so it is
// parked in dead/ rather than sent again. (Re-sending is how customers ended up
// with the same code twenty times.)
for (const f of (() => {
  try {
    return fs.readdirSync(QUEUE_DIR).filter((n) => n.endsWith('.sending'));
  } catch {
    return [];
  }
})()) {
  const full = path.join(QUEUE_DIR, f);
  try {
    const body = JSON.parse(fs.readFileSync(full, 'utf8'));
    fs.writeFileSync(
      path.join(DEAD_DIR, f.replace(/\.sending$/, '')),
      JSON.stringify({
        ...body,
        reason: 'interrupted mid-send — not resent (may have been delivered)',
      }),
    );
  } catch {}
  try {
    fs.unlinkSync(full);
  } catch {}
}

// Recently-delivered dedupe keys → expiry timestamp. Guards against re-sending a
// message that delivered but whose sendMessage() threw (so it was requeued).
// In-memory is enough: it only needs to span the retry backoff window, and the
// enqueue side (dedupe/ marker files) already covers cross-restart duplicates.
const recentlySent = new Map();
const DEDUPE_TTL = 15 * 60 * 1000; // 15 minutes
function rememberSent(key) {
  const now = Date.now();
  recentlySent.set(key, now + DEDUPE_TTL);
  if (recentlySent.size > 500) {
    for (const [k, exp] of recentlySent) if (exp < now) recentlySent.delete(k);
  }
}
// Wrap Map.has with expiry so stale keys don't block a genuinely new message
// that happens to be byte-identical much later.
{
  const rawHas = recentlySent.has.bind(recentlySent);
  recentlySent.has = (key) => {
    const exp = recentlySent.get(key);
    if (exp === undefined) return false;
    if (exp < Date.now()) {
      recentlySent.delete(key);
      return false;
    }
    return true;
  };
  void rawHas;
}

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function writeStatus(patch) {
  const next = { ...readStatus(), ...patch, ts: Date.now() };
  fs.writeFileSync(STATUS_FILE, JSON.stringify(next));
}
function safeList(d) {
  try {
    return fs.readdirSync(d).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
}
// Oldest first. api.php names queue files with random hex (bin2hex(random_bytes)),
// so plain readdir order is arbitrary — a message could watch newer ones overtake
// it tick after tick. mtime is the only ordering we have; ties keep readdir order.
function safeListFifo(d) {
  return safeList(d)
    .map((f) => {
      let t = 0;
      try {
        t = fs.statSync(path.join(d, f)).mtimeMs;
      } catch {}
      return { f, t };
    })
    .sort((a, b) => a.t - b.t)
    .map((x) => x.f);
}
// Move a queue file into dead/ (preserved, never lost) and remove it from the
// live queue so it stops being retried.
function park(name, full, payload) {
  try {
    fs.writeFileSync(path.join(DEAD_DIR, name), JSON.stringify(payload));
  } catch {}
  try {
    fs.unlinkSync(full);
  } catch {}
}
const GROUPS_FILE = path.join(IPC, 'groups.json');
function toJid(num) {
  const raw = String(num);
  // A group JID is already a full address (…@g.us) — pass it through untouched.
  // Only bare phone numbers get normalised to an individual JID.
  if (raw.includes('@')) return raw;
  let n = raw.replace(/[^\d]/g, '');
  if (n.startsWith('0')) n = '20' + n.slice(1);
  if (n.length === 10 && n.startsWith('1')) n = '20' + n;
  if (!n.startsWith('20') && n.length === 10) n = '20' + n;
  return n + '@s.whatsapp.net';
}

// True once group metadata has synced after (re)connect. Sending to a group
// JID before this is set fails at the Baileys layer with "group metadata not
// found" — the exact reason a message reaches every phone but NOT the group in
// the seconds after a reconnect. The send loop waits on this instead of firing
// blind and burning retries.
let groupsReady = false;

// Publish the groups this account is a member of, so the dashboard can offer a
// picker — and, as a side effect, warm Baileys' group-metadata cache so group
// sends work. Best-effort: a failure here must never take the bridge down.
async function refreshGroups() {
  try {
    if (!sock) return false;
    const all = await sock.groupFetchAllParticipating();
    const list = Object.values(all || {})
      .map((g) => ({ id: g.id, name: g.subject || g.id, size: (g.participants || []).length }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    fs.writeFileSync(GROUPS_FILE, JSON.stringify({ groups: list, ts: Date.now() }));
    groupsReady = true; // cache is now warm — group sends will succeed
    return true;
  } catch (e) {
    // leave the previous groups.json in place; log only
    console.log('refreshGroups failed:', (e && e.message) || e);
    return false;
  }
}

// After connecting, keep trying to warm the group cache until it succeeds, so
// group sends become available as soon as possible (not on a fixed 4s guess
// that can miss under load).
//
// It used to give up after 11 tries (~30s). Group sends wait on groupsReady,
// so one bad stretch at connect time left every group message sitting in the
// queue until the next reconnect, which could be days. Fast tries first, then
// one a minute until it works. One retry chain at a time.
let warmTimer = null;
function warmGroups(attempt = 0) {
  if (warmTimer) clearTimeout(warmTimer);
  warmTimer = null;
  // Disconnected: stop here. The next 'open' starts a fresh chain.
  if (readStatus().status !== 'connected') return;
  refreshGroups().then((ok) => {
    if (ok) return;
    warmTimer = setTimeout(() => warmGroups(attempt + 1), attempt < 10 ? 3000 : 60000);
  });
}

let sock = null;
let connecting = false;
// filename → consecutive parse-failure count, so a file caught mid-write isn't
// parked as dead on the first miss (see the queue loop).
const unparseable = new Map();

async function connect() {
  if (connecting) return;
  connecting = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    let version;
    try {
      version = (await fetchLatestBaileysVersion()).version;
    } catch {
      version = undefined;
    }
    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers
        ? Browsers.appropriate('Tamem Delivery')
        : ['Tamem Delivery', 'Chrome', '1.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
          writeStatus({ status: 'qr', qrDataUrl: dataUrl, phone: null, lastError: null });
        } catch (e) {
          writeStatus({ status: 'qr', lastError: 'qr encode failed' });
        }
      }
      if (connection === 'connecting') writeStatus({ status: 'connecting' });
      if (connection === 'open') {
        const me =
          sock.user && sock.user.id ? String(sock.user.id).split(':')[0].split('@')[0] : null;
        console.log('[bridge ' + new Date().toISOString() + '] connected as ' + me);
        writeStatus({
          status: 'connected',
          qrDataUrl: null,
          phone: me,
          lastError: null,
          startedAt: Date.now(),
        });
        // Group metadata isn't ready the instant we connect. Warm it (with
        // retries) before allowing group sends, so a message never lands on
        // every phone but skips the group during the reconnect window.
        groupsReady = false;
        setTimeout(() => warmGroups(0), 1500);
      }
      if (connection === 'close') {
        connecting = false;
        groupsReady = false;
        const code =
          lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
            ? lastDisconnect.error.output.statusCode
            : 0;
        console.log(
          '[bridge ' +
            new Date().toISOString() +
            '] connection closed (code ' +
            code +
            ') — reconnecting',
        );
        const loggedOut = code === (DisconnectReason && DisconnectReason.loggedOut);
        if (loggedOut) {
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch {}
          writeStatus({
            status: 'disconnected',
            qrDataUrl: null,
            phone: null,
            lastError: 'تم تسجيل الخروج — اضغط بدء جلسة جديدة',
          });
          setTimeout(connect, 2000);
        } else {
          writeStatus({ status: 'connecting', qrDataUrl: null });
          setTimeout(connect, 3000);
        }
      }
    });
  } catch (e) {
    writeStatus({ status: 'disconnected', lastError: String((e && e.message) || e) });
    setTimeout(connect, 5000);
  } finally {
    connecting = false;
  }
}

// IPC loop: control commands + outgoing message queue.
//
// The tick is async and a single send can take a minute (the first message to
// a new number fetches its devices and keys first). setInterval does not wait
// for the previous tick, so without this guard every 2s tick re-read the same
// still-queued file and sent it AGAIN while the first send was in flight — a
// new customer's activation code arrived ~20 times. One tick at a time.
let tickBusy = false;
setInterval(async () => {
  if (tickBusy) return;
  tickBusy = true;
  try {
    await ipcTick();
  } catch (e) {
    try {
      writeStatus({ lastError: 'queue loop: ' + String((e && e.message) || e) });
    } catch {}
  } finally {
    tickBusy = false;
  }
}, 1000);

function withTimeout(promise, ms) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      t = setTimeout(
        () => reject(Object.assign(new Error('send timed out'), { timedOut: true })),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(t));
}

async function ipcTick() {
  // control commands (logout / restart)
  for (const f of safeList(CONTROL_DIR)) {
    const full = path.join(CONTROL_DIR, f);
    let body = {};
    try {
      body = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch {}
    try {
      fs.unlinkSync(full);
    } catch {}
    if (body.action === 'logout') {
      try {
        if (sock) await sock.logout();
      } catch {}
      try {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      } catch {}
      writeStatus({ status: 'connecting', qrDataUrl: null, phone: null });
      setTimeout(connect, 1500);
    }
    // Let the dashboard force a re-scan of the group list on demand (e.g. after
    // the admin creates or joins a group).
    if (body.action === 'refresh-groups') {
      await refreshGroups();
    }
  }
  // Outgoing queue — guaranteed delivery. While disconnected, messages simply
  // stay as files in QUEUE_DIR (nothing is lost); the moment we're connected the
  // whole backlog drains. A transient send failure is RETRIED with growing
  // backoff instead of being dropped; only after MAX_ATTEMPTS is it parked in
  // dead/ (kept for inspection), never deleted-and-forgotten.
  const st = readStatus();
  if (sock && st.status === 'connected') {
    for (const f of safeListFifo(QUEUE_DIR)) {
      const full = path.join(QUEUE_DIR, f);
      let msg = null;
      try {
        msg = JSON.parse(fs.readFileSync(full, 'utf8'));
      } catch {
        // Likely caught mid-write. Don't park a good message as dead on the
        // first miss — give it a few ticks to finish, park only if it stays
        // broken (a genuinely corrupt file).
        const n = (unparseable.get(f) || 0) + 1;
        if (n >= 3) {
          unparseable.delete(f);
          park(f, full, { reason: 'unparseable' });
        } else {
          unparseable.set(f, n);
        }
        continue;
      }
      unparseable.delete(f);
      if (!msg || !msg.to || !msg.text) {
        park(f, full, { ...(msg || {}), reason: 'missing to/text' });
        continue;
      }
      // Second line of defence against duplicates: if this exact message was
      // already delivered in this session, drop the file without re-sending.
      // Covers the nasty case where sock.sendMessage() actually delivered but
      // threw a timeout, so the message got requeued for retry — the recipient
      // would otherwise receive it twice. (The enqueue side already de-dupes
      // repeat triggers; this catches the deliver-but-throw path.)
      if (msg.dedupe && recentlySent.has(msg.dedupe)) {
        try {
          fs.unlinkSync(full);
        } catch {}
        continue;
      }
      // per-message backoff: skip until its retry time is due
      if (msg.nextAt && Date.now() < msg.nextAt) continue;
      // A group send before the metadata cache is warm fails at the Baileys
      // layer. Wait (without burning an attempt) — warmGroups() flips this on
      // within a few seconds of connecting, then the message goes out cleanly.
      if (String(msg.to).includes('@g.us') && !groupsReady) continue;

      const jid = toJid(msg.to);
      const now = Date.now();
      while (sentTimes.length && sentTimes[0] < now - 3600 * 1000) sentTimes.shift();
      if (sentTimes.length >= MAX_PER_HOUR) break; // hourly cap: the rest stays queued
      // Customers only: groups and staff (drivers, supervisor, an admin's
      // extra number) get many order messages at busy times by design.
      //
      // msg.staff is THREE-valued on purpose, because the bridge and api.php are
      // deployed separately and the live api.php may predate the flag:
      //   true      -> staff, exempt from the cap
      //   false     -> api.php says customer: over the cap it is a flood, park it
      //   undefined -> old api.php, we cannot tell. NEVER park: parking a
      //                driver's order alert loses the order. Hold it until the
      //                10-minute window frees up instead, so it still arrives.
      const capped = !jid.endsWith('@g.us') && msg.staff !== true;
      if (capped) {
        const recent = (perNumber.get(jid) || []).filter((t) => t > now - PER_NUMBER_WINDOW_MS);
        perNumber.set(jid, recent);
        if (recent.length >= MAX_PER_NUMBER) {
          if (msg.staff === false) {
            park(f, full, {
              ...msg,
              reason: 'per-number limit (' + MAX_PER_NUMBER + ' in 10 min) — not sent',
            });
          } else {
            // Retry just after the oldest send leaves the window. No attempt is
            // burned: this is a rate limit, not a failure.
            msg.nextAt = recent[0] + PER_NUMBER_WINDOW_MS + 1000;
            try {
              fs.writeFileSync(full, JSON.stringify(msg));
            } catch {}
          }
          continue;
        }
      }
      if (perNumber.size > 2000) {
        for (const [k, v] of perNumber)
          if (!v.some((t) => t > now - PER_NUMBER_WINDOW_MS)) perNumber.delete(k);
      }
      const wait = lastSendAt + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);

      // Claim the file before sending. If the rename fails, someone else has it.
      const claimed = full + '.sending';
      try {
        fs.renameSync(full, claimed);
      } catch {
        continue;
      }
      lastSendAt = Date.now();
      sentTimes.push(lastSendAt);
      if (capped) perNumber.get(jid).push(lastSendAt);
      try {
        await withTimeout(sock.sendMessage(jid, { text: String(msg.text) }), SEND_TIMEOUT_MS);
        if (msg.dedupe) rememberSent(msg.dedupe);
        try {
          fs.unlinkSync(claimed);
        } catch {} // delivered
      } catch (e) {
        msg.lastError = String((e && e.message) || e);
        if (e && e.timedOut) {
          // Still running in the background and may yet deliver. Retrying is
          // how one message becomes many, so park it instead.
          if (msg.dedupe) rememberSent(msg.dedupe);
          park(f, claimed, {
            ...msg,
            reason: 'send timed out — not retried (may have been delivered)',
          });
          writeStatus({ lastError: 'رسالة اتأخرت ومتبعتتش تاني: ' + msg.lastError });
          continue;
        }
        const attempts = (msg.attempts || 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          park(f, claimed, msg);
          writeStatus({ lastError: 'رسالة فشلت بعد ' + attempts + ' محاولات: ' + msg.lastError });
        } else {
          msg.attempts = attempts;
          // 30s, 60s, 120s, 240s, 480s (capped 10m)
          msg.nextAt = Date.now() + Math.min(30000 * Math.pow(2, attempts - 1), 600000);
          try {
            fs.writeFileSync(full, JSON.stringify(msg));
          } catch {}
          try {
            fs.unlinkSync(claimed);
          } catch {}
        }
      }
    }
  }
}

// heartbeat so PHP can detect a dead bridge (stale ts)
setInterval(() => writeStatus({}), 15000);

writeStatus({ status: 'connecting', startedAt: Date.now(), lastError: null });
connect();
