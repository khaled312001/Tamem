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
function toJid(num) {
  let n = String(num).replace(/[^\d]/g, '');
  if (n.startsWith('0')) n = '20' + n.slice(1);
  if (n.length === 10 && n.startsWith('1')) n = '20' + n;
  if (!n.startsWith('20') && n.length === 10) n = '20' + n;
  return n + '@s.whatsapp.net';
}

let sock = null;
let connecting = false;

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
        writeStatus({
          status: 'connected',
          qrDataUrl: null,
          phone: me,
          lastError: null,
          startedAt: Date.now(),
        });
      }
      if (connection === 'close') {
        connecting = false;
        const code =
          lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
            ? lastDisconnect.error.output.statusCode
            : 0;
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

// IPC loop: control commands + outgoing message queue
setInterval(async () => {
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
  }
  // Outgoing queue — guaranteed delivery. While disconnected, messages simply
  // stay as files in QUEUE_DIR (nothing is lost); the moment we're connected the
  // whole backlog drains. A transient send failure is RETRIED with growing
  // backoff instead of being dropped; only after MAX_ATTEMPTS is it parked in
  // dead/ (kept for inspection), never deleted-and-forgotten.
  const st = readStatus();
  if (sock && st.status === 'connected') {
    for (const f of safeList(QUEUE_DIR)) {
      const full = path.join(QUEUE_DIR, f);
      let msg = null;
      try {
        msg = JSON.parse(fs.readFileSync(full, 'utf8'));
      } catch {
        park(f, full, { reason: 'unparseable' });
        continue;
      }
      if (!msg || !msg.to || !msg.text) {
        park(f, full, { ...(msg || {}), reason: 'missing to/text' });
        continue;
      }
      // per-message backoff: skip until its retry time is due
      if (msg.nextAt && Date.now() < msg.nextAt) continue;
      try {
        await sock.sendMessage(toJid(msg.to), { text: String(msg.text) });
        try {
          fs.unlinkSync(full);
        } catch {} // delivered
      } catch (e) {
        const attempts = (msg.attempts || 0) + 1;
        msg.lastError = String((e && e.message) || e);
        if (attempts >= MAX_ATTEMPTS) {
          park(f, full, msg);
          writeStatus({ lastError: 'رسالة فشلت بعد ' + attempts + ' محاولات: ' + msg.lastError });
        } else {
          msg.attempts = attempts;
          // 30s, 60s, 120s, 240s, 480s (capped 10m)
          msg.nextAt = Date.now() + Math.min(30000 * Math.pow(2, attempts - 1), 600000);
          try {
            fs.writeFileSync(full, JSON.stringify(msg));
          } catch {}
        }
      }
    }
  }
}, 2000);

// heartbeat so PHP can detect a dead bridge (stale ts)
setInterval(() => writeStatus({}), 15000);

writeStatus({ status: 'connecting', startedAt: Date.now(), lastError: null });
connect();
