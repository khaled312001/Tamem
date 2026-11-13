/*
 * Tamem WhatsApp bridge (Baileys, no Chromium).
 * - Persists each WhatsApp session to disk so it reconnects WITHOUT a new QR
 *   after the first pairing.
 * - Writes status + QR (as a data URL) to the IPC dir the PHP shim reads.
 * - Polls the IPC queue dir for outgoing messages and control commands.
 * Runs as a detached process; a cron keep-alive restarts it if it dies.
 *
 * More than one number ("lines"). The MAIN line is the original session and
 * keeps every path it always had: ~/whatsapp/auth and uploads/.wa/{status.json,
 * queue/, control/, dead/, groups.json}. Extra lines are listed by api.php in
 * uploads/.wa/lines.json; each runs its own Baileys socket in this same process
 * with ~/whatsapp/auth-<id> and uploads/.wa/lines/<id>/{status.json, queue/, …}.
 * One process, one PID lock, one set of supervisors, many sessions.
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

// Env overrides exist only so the bridge can be exercised on a dev machine;
// production runs with none of them set.
const HOME = process.env.WA_HOME || '/home/u748721963';
const BASE = process.env.WA_BASE || path.join(HOME, 'whatsapp');
const AUTH_DIR = path.join(BASE, 'auth');

// SINGLE-INSTANCE GUARD. Two bridges sharing the same WhatsApp creds fight over
// the linked-device session — each keeps getting "replaced", closing and
// reconnecting in a tight loop ("Closing session" spam) and nothing is sent.
// A PID-file lock guarantees exactly ONE active bridge no matter how many the
// ops scripts launch: a duplicate sees a live PID here and exits immediately.
const PID_FILE = path.join(BASE, 'bridge.pid');
try {
  fs.mkdirSync(BASE, { recursive: true });
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
// With several sessions in one process, one session's stray rejected promise
// must not take the others down with it. Log it and carry on.
process.on('unhandledRejection', (e) => {
  console.log(
    '[bridge ' + new Date().toISOString() + '] unhandled rejection:',
    (e && e.message) || e,
  );
});

// IPC dir lives under the backend docroot so the PHP shim (open_basedir) can read/write it.
const IPC =
  process.env.WA_IPC ||
  path.join(HOME, 'domains/deliverytamem.com/public_html/backendtamem/uploads/.wa');
const LINES_FILE = path.join(IPC, 'lines.json');
const LINES_DIR = path.join(IPC, 'lines');
// Numbers that answered an offer with «إيقاف». api.php leaves them out of the
// next broadcast. One number per line, digits only.
const OPTOUT_FILE = path.join(IPC, 'optout.txt');
fs.mkdirSync(IPC, { recursive: true });

// A message that keeps failing after this many tries is parked in dead/ — never
// silently dropped, so it can be inspected/re-queued instead of lost.
const MAX_ATTEMPTS = 6;
// One send may take this long before we stop waiting on it. Baileys' own query
// timeout is 60s; past that the send is in an unknown state.
const SEND_TIMEOUT_MS = 75 * 1000;

// Sending limits. WhatsApp bans numbers that blast messages, so every send
// goes through these (env overrides are read at start-up). They apply PER
// NUMBER: each line is its own WhatsApp account with its own reputation.
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

// Offer broadcasts ("bulk", queue files named b-*.json) are the riskiest thing
// a number can do: many strangers, one text. They go out far slower than
// anything else, only in daytime, a capped number per day per line, and only
// after everything urgent in the same queue has gone.
const BULK_MIN_GAP_MS = +process.env.WA_BULK_MIN_GAP_MS || 25000;
const BULK_MAX_GAP_MS = +process.env.WA_BULK_MAX_GAP_MS || 60000;
const BULK_FROM_HOUR = 10; // Cairo time
const BULK_TO_HOUR = 21; // exclusive: the last broadcast message leaves before 9 PM
const BULK_ALWAYS = process.env.WA_BULK_ALWAYS === '1'; // dev only: ignore the clock

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEDUPE_TTL = 15 * 60 * 1000; // 15 minutes

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
// Cairo wall clock, independent of the server's own time zone.
function cairoParts() {
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const g = (t) => (p.find((x) => x.type === t) || {}).value;
    return { day: g('year') + '-' + g('month') + '-' + g('day'), hour: +g('hour') % 24 };
  } catch {
    const d = new Date(Date.now() + 2 * 3600 * 1000);
    return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
  }
}
const STOP_WORDS = new Set(['ايقاف', 'إيقاف', 'الغاء', 'إلغاء', 'وقف', 'stop', 'unsubscribe']);
function isStopWord(text) {
  const t = String(text || '')
    .replace(/[\s«»"'.!؟?،,ً-ْ]/g, '')
    .toLowerCase();
  return STOP_WORDS.has(t);
}
function recordOptOut(jid) {
  const digits = String(jid || '')
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');
  if (digits.length < 10) return;
  try {
    const have = fs.existsSync(OPTOUT_FILE) ? fs.readFileSync(OPTOUT_FILE, 'utf8') : '';
    if (have.split('\n').includes(digits)) return;
    fs.appendFileSync(OPTOUT_FILE, digits + '\n');
  } catch {}
}

class Line {
  constructor({ id, authDir, ipcDir, isMain }) {
    this.id = id;
    this.isMain = !!isMain;
    this.authDir = authDir;
    this.ipcDir = ipcDir;
    this.queueDir = path.join(ipcDir, 'queue');
    this.controlDir = path.join(ipcDir, 'control');
    this.deadDir = path.join(ipcDir, 'dead');
    this.statusFile = path.join(ipcDir, 'status.json');
    this.groupsFile = path.join(ipcDir, 'groups.json');
    for (const d of [authDir, ipcDir, this.queueDir, this.controlDir, this.deadDir])
      fs.mkdirSync(d, { recursive: true });

    this.sock = null;
    this.connecting = false;
    this.stopped = false;
    this.idle = false; // an extra line that showed a QR nobody scanned: paused
    this.qrSince = 0;
    this.lastSendAt = 0;
    this.sentTimes = []; // timestamps of sends in the last hour
    this.perNumber = new Map(); // jid -> timestamps of sends in the last 10 min
    // Groups whose metadata Baileys has, so a send to them will not fail with
    // "group metadata not found". Cleared on disconnect — the cache goes with
    // the socket. One entry per group, primed on demand.
    this.primedGroups = new Set();
    // filename → consecutive parse-failure count, so a file caught mid-write
    // isn't parked as dead on the first miss (see the queue loop).
    this.unparseable = new Map();
    // Recently-delivered dedupe keys → expiry timestamp. Guards against
    // re-sending a message that delivered but whose sendMessage() threw (so it
    // was requeued). In-memory is enough: it only needs to span the retry
    // backoff window, and the enqueue side (dedupe/ marker files) already
    // covers cross-restart duplicates.
    this.recentlySent = new Map();
    this.warmTimer = null;
    this.tickBusy = false;
    this.bulkPerDay = 80;
    this.lastBulkAt = 0;
    this.nextBulkGap = 0;
    const st = this.readStatus();
    this.bulkDay = st.bulkDay || '';
    this.bulkSentToday = +st.bulkSentToday || 0;

    this.recoverInterrupted();
    this.timers = [
      setInterval(() => this.runTick(), 1000),
      // heartbeat so PHP can detect a dead bridge (stale ts)
      setInterval(() => this.writeStatus({}), 15000),
    ];
  }

  log(...args) {
    const tag = this.isMain ? '[bridge ' : '[bridge:' + this.id + ' ';
    console.log(tag + new Date().toISOString() + ']', ...args);
  }

  readStatus() {
    try {
      return JSON.parse(fs.readFileSync(this.statusFile, 'utf8'));
    } catch {
      return {};
    }
  }
  writeStatus(patch) {
    if (this.stopped) return;
    try {
      const next = { ...this.readStatus(), ...patch, ts: Date.now() };
      fs.writeFileSync(this.statusFile, JSON.stringify(next));
    } catch {}
  }

  // A queue file is renamed to `<name>.sending` while its send is in flight, so
  // it is claimed by exactly one send. One still here at start-up means the
  // bridge died mid-send: the message may well have been delivered, so it is
  // parked in dead/ rather than sent again. (Re-sending is how customers ended
  // up with the same code twenty times.)
  recoverInterrupted() {
    let names = [];
    try {
      names = fs.readdirSync(this.queueDir).filter((n) => n.endsWith('.sending'));
    } catch {}
    for (const f of names) {
      const full = path.join(this.queueDir, f);
      try {
        const body = JSON.parse(fs.readFileSync(full, 'utf8'));
        fs.writeFileSync(
          path.join(this.deadDir, f.replace(/\.sending$/, '')),
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
  }

  rememberSent(key) {
    const now = Date.now();
    this.recentlySent.set(key, now + DEDUPE_TTL);
    if (this.recentlySent.size > 500) {
      for (const [k, exp] of this.recentlySent) if (exp < now) this.recentlySent.delete(k);
    }
  }
  // Expiring lookup, so a stale key doesn't block a genuinely new message that
  // happens to be byte-identical much later.
  wasSent(key) {
    const exp = this.recentlySent.get(key);
    if (exp === undefined) return false;
    if (exp < Date.now()) {
      this.recentlySent.delete(key);
      return false;
    }
    return true;
  }

  // Move a queue file into dead/ (preserved, never lost) and remove it from the
  // live queue so it stops being retried.
  park(name, full, payload) {
    try {
      fs.writeFileSync(path.join(this.deadDir, name), JSON.stringify(payload));
    } catch {}
    try {
      fs.unlinkSync(full);
    } catch {}
  }

  // Publish the groups this account is a member of, so the dashboard can offer
  // a picker. Best-effort: a failure here must never take the bridge down.
  async refreshGroups() {
    try {
      if (!this.sock) return false;
      const all = await this.sock.groupFetchAllParticipating();
      const list = Object.values(all || {})
        .map((g) => ({ id: g.id, name: g.subject || g.id, size: (g.participants || []).length }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      fs.writeFileSync(this.groupsFile, JSON.stringify({ groups: list, ts: Date.now() }));
      for (const g of list) this.primedGroups.add(g.id); // free side effect: all primed
      return true;
    } catch (e) {
      // leave the previous groups.json in place; log only
      this.log('refreshGroups failed:', (e && e.message) || e);
      return String((e && e.message) || e).includes('rate-overlimit') ? 'rate' : false;
    }
  }

  // Make ONE group sendable. groupFetchAllParticipating() pulls every group the
  // account is in and is what WhatsApp answers with "rate-overlimit"; a single
  // groupMetadata() call is cheap by comparison. Group messages used to wait on
  // the full fetch, so once it started getting rate-limited — which it does,
  // and every bridge restart asks again — nothing ever reached the group at all.
  async primeGroup(jid) {
    if (this.primedGroups.has(jid)) return true;
    try {
      await withTimeout(this.sock.groupMetadata(jid), 20000);
      this.primedGroups.add(jid);
      return true;
    } catch (e) {
      this.log('primeGroup ' + jid + ' failed:', (e && e.message) || e);
      return false;
    }
  }

  // Keep groups.json current for the dashboard picker. Nothing waits on this
  // any more, so it can afford to be patient — and it must be: retrying a
  // rate-overlimit every minute is how a soft limit becomes a hard one. Main
  // line only: the order group is picked from the main number's groups, and
  // every extra fetch is one more chance to get rate-limited.
  warmGroups(attempt = 0) {
    if (this.warmTimer) clearTimeout(this.warmTimer);
    this.warmTimer = null;
    if (!this.isMain || this.stopped) return;
    // Disconnected: stop here. The next 'open' starts a fresh chain.
    if (this.readStatus().status !== 'connected') return;
    this.refreshGroups().then((ok) => {
      if (ok === true) return;
      // Rate-limited: stand well back. Otherwise ramp 3s -> 1m -> 10m.
      const delay = ok === 'rate' ? 600000 : attempt < 5 ? 3000 : attempt < 15 ? 60000 : 600000;
      this.warmTimer = setTimeout(() => this.warmGroups(attempt + 1), delay);
    });
  }

  async connect() {
    if (this.connecting || this.stopped || this.idle) return;
    this.connecting = true;
    try {
      fs.mkdirSync(this.authDir, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      let version;
      try {
        version = (await fetchLatestBaileysVersion()).version;
      } catch {
        version = undefined;
      }
      if (this.stopped) return;
      const sock = makeWASocket({
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
      this.sock = sock;
      sock.ev.on('creds.update', saveCreds);
      sock.ev.on('messages.upsert', (ev) => this.onInbound(ev));
      sock.ev.on('connection.update', (u) => this.onConnectionUpdate(sock, u));
    } catch (e) {
      this.writeStatus({ status: 'disconnected', lastError: String((e && e.message) || e) });
      setTimeout(() => this.connect(), 5000);
    } finally {
      this.connecting = false;
    }
  }

  // «إيقاف» in reply to an offer: never broadcast to that number again.
  onInbound(ev) {
    try {
      if (!ev || ev.type !== 'notify') return;
      for (const m of ev.messages || []) {
        if (!m || !m.key || m.key.fromMe) continue;
        const msg = m.message || {};
        const text = msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text);
        if (!text || !isStopWord(text)) continue;
        let jid = String(m.key.remoteJid || '');
        // Newer WhatsApp addresses some chats by an opaque LID; the phone number
        // then rides along in one of these.
        if (!jid.endsWith('@s.whatsapp.net'))
          jid = String(m.key.remoteJidAlt || m.key.senderPn || m.key.participantPn || '');
        if (!jid.endsWith('@s.whatsapp.net')) continue;
        recordOptOut(jid);
        this.log('opt-out recorded');
      }
    } catch {}
  }

  async onConnectionUpdate(sock, u) {
    if (sock !== this.sock || this.stopped) return; // an old socket's late event
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      if (!this.qrSince) this.qrSince = Date.now();
      try {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        this.writeStatus({ status: 'qr', qrDataUrl: dataUrl, phone: null, lastError: null });
      } catch (e) {
        this.writeStatus({ status: 'qr', lastError: 'qr encode failed' });
      }
    }
    if (connection === 'connecting') this.writeStatus({ status: 'connecting' });
    if (connection === 'open') {
      this.qrSince = 0;
      const me =
        sock.user && sock.user.id ? String(sock.user.id).split(':')[0].split('@')[0] : null;
      this.log('connected as ' + me);
      this.writeStatus({
        status: 'connected',
        qrDataUrl: null,
        phone: me,
        lastError: null,
        startedAt: Date.now(),
      });
      // Group metadata isn't ready the instant we connect. Warm it (with
      // retries) before allowing group sends, so a message never lands on
      // every phone but skips the group during the reconnect window.
      this.primedGroups.clear(); // the metadata cache went with the old socket
      setTimeout(() => this.warmGroups(0), 1500);
    }
    if (connection === 'close') {
      this.connecting = false;
      this.primedGroups.clear();
      const wasQr = this.readStatus().status === 'qr';
      const code =
        lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
          ? lastDisconnect.error.output.statusCode
          : 0;
      this.log('connection closed (code ' + code + ') — reconnecting');
      // 440 = connectionReplaced: another session took this one's place.
      // Reconnecting is a declaration of war — we replace them, they replace
      // us, every three seconds, and in between nothing gets sent. The log
      // held 1199 of these. Exit instead: the supervisor starts exactly one
      // bridge (the PID lock guarantees one), and a lone instance is not
      // replaced by anybody. The 5s delay keeps a persistent 440 from
      // becoming a hot exit/respawn loop with the supervisor's own 3s.
      if (code === (DisconnectReason && DisconnectReason.connectionReplaced)) {
        this.writeStatus({
          status: 'connecting',
          qrDataUrl: null,
          lastError: 'الجلسة اتبدلت من مكان تاني — بيعاد التشغيل',
        });
        if (this.isMain) {
          this.log('session replaced (440) — exiting so one clean instance restarts');
          setTimeout(() => process.exit(0), 5000);
        } else {
          // An extra line must not take the main number down with it. Back off
          // long enough that two contenders do not ping-pong.
          setTimeout(() => this.connect(), 60000);
        }
        return;
      }
      const loggedOut = code === (DisconnectReason && DisconnectReason.loggedOut);
      if (loggedOut) {
        try {
          fs.rmSync(this.authDir, { recursive: true, force: true });
        } catch {}
        this.writeStatus({
          status: 'disconnected',
          qrDataUrl: null,
          phone: null,
          lastError: 'تم تسجيل الخروج — اضغط بدء جلسة جديدة',
        });
        if (this.isMain) setTimeout(() => this.connect(), 2000);
        else this.goIdle(null);
        return;
      }
      // An extra line nobody scanned for five minutes stops asking for one. A
      // QR spinning forever is load on the box and on WhatsApp for nothing; the
      // dashboard's «اعرض كود الربط» wakes it up.
      if (!this.isMain && wasQr && this.qrSince && Date.now() - this.qrSince > 5 * 60 * 1000) {
        this.goIdle(null);
        return;
      }
      this.writeStatus({ status: 'connecting', qrDataUrl: null });
      setTimeout(() => this.connect(), 3000);
    }
  }

  goIdle(lastError) {
    this.idle = true;
    this.qrSince = 0;
    this.detach();
    this.writeStatus({ status: 'idle', qrDataUrl: null, phone: null, lastError });
  }

  wake() {
    if (!this.idle && this.sock) return;
    this.idle = false;
    this.qrSince = 0;
    this.writeStatus({ status: 'connecting', qrDataUrl: null, lastError: null });
    this.connect();
  }

  // Forget the current socket BEFORE ending it, so its own 'close' event is
  // ignored (onConnectionUpdate drops events from a socket that is no longer
  // this.sock) and cannot schedule a second, competing reconnect.
  detach() {
    const s = this.sock;
    this.sock = null;
    try {
      if (s) s.end(undefined);
    } catch {}
    return s;
  }

  async logout() {
    const s = this.sock;
    this.sock = null;
    try {
      if (s) await withTimeout(s.logout(), 20000);
    } catch {}
    try {
      fs.rmSync(this.authDir, { recursive: true, force: true });
    } catch {}
  }

  // Taken out of lines.json. `forget` = the admin deleted the number: unlink
  // the device from the phone and wipe the session. Otherwise just close.
  async stop(forget) {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    if (this.warmTimer) clearTimeout(this.warmTimer);
    if (forget) {
      await this.logout();
      try {
        fs.rmSync(this.ipcDir, { recursive: true, force: true });
      } catch {}
    } else {
      this.detach();
    }
    this.log(forget ? 'removed' : 'stopped');
  }

  // IPC loop: control commands + outgoing message queue.
  //
  // The tick is async and a single send can take a minute (the first message
  // to a new number fetches its devices and keys first). setInterval does not
  // wait for the previous tick, so without this guard every 2s tick re-read the
  // same still-queued file and sent it AGAIN while the first send was in flight
  // — a new customer's activation code arrived ~20 times. One tick at a time.
  async runTick() {
    if (this.tickBusy || this.stopped) return;
    this.tickBusy = true;
    try {
      await this.ipcTick();
    } catch (e) {
      this.writeStatus({ lastError: 'queue loop: ' + String((e && e.message) || e) });
    } finally {
      this.tickBusy = false;
    }
  }

  async ipcTick() {
    // control commands (logout / start / refresh-groups)
    for (const f of safeList(this.controlDir)) {
      const full = path.join(this.controlDir, f);
      let body = {};
      try {
        body = JSON.parse(fs.readFileSync(full, 'utf8'));
      } catch {}
      try {
        fs.unlinkSync(full);
      } catch {}
      if (body.action === 'logout') {
        await this.logout();
        this.writeStatus({ status: 'connecting', qrDataUrl: null, phone: null });
        this.idle = false;
        setTimeout(() => this.connect(), 1500);
      }
      if (body.action === 'start') this.wake();
      // Let the dashboard force a re-scan of the group list on demand (e.g.
      // after the admin creates or joins a group).
      if (body.action === 'refresh-groups') await this.refreshGroups();
    }
    // Outgoing queue — guaranteed delivery. While disconnected, messages simply
    // stay as files in the queue (nothing is lost); the moment we're connected
    // the whole backlog drains. A transient send failure is RETRIED with
    // growing backoff instead of being dropped; only after MAX_ATTEMPTS is it
    // parked in dead/ (kept for inspection), never deleted-and-forgotten.
    const st = this.readStatus();
    if (!this.sock || st.status !== 'connected') return;
    // Everything urgent first; offer broadcasts (b-*.json) only after.
    const files = safeListFifo(this.queueDir);
    const ordered = files
      .filter((f) => !f.startsWith('b-'))
      .concat(files.filter((f) => f.startsWith('b-')));
    for (const f of ordered) {
      if (this.stopped || !this.sock) return;
      const full = path.join(this.queueDir, f);
      let msg = null;
      try {
        msg = JSON.parse(fs.readFileSync(full, 'utf8'));
      } catch {
        // Likely caught mid-write. Don't park a good message as dead on the
        // first miss — give it a few ticks to finish, park only if it stays
        // broken (a genuinely corrupt file).
        const n = (this.unparseable.get(f) || 0) + 1;
        if (n >= 3) {
          this.unparseable.delete(f);
          this.park(f, full, { reason: 'unparseable' });
        } else {
          this.unparseable.set(f, n);
        }
        continue;
      }
      this.unparseable.delete(f);
      if (!msg || !msg.to || !msg.text) {
        this.park(f, full, { ...(msg || {}), reason: 'missing to/text' });
        continue;
      }
      // A confirmation that could not go out in time is worse late than never.
      if (msg.expiresAt && Date.now() > +msg.expiresAt) {
        this.park(f, full, { ...msg, reason: 'expired before it could be sent' });
        continue;
      }
      // Second line of defence against duplicates: if this exact message was
      // already delivered in this session, drop the file without re-sending.
      // Covers the nasty case where sock.sendMessage() actually delivered but
      // threw a timeout, so the message got requeued for retry — the recipient
      // would otherwise receive it twice. (The enqueue side already de-dupes
      // repeat triggers; this catches the deliver-but-throw path.)
      if (msg.dedupe && this.wasSent(msg.dedupe)) {
        try {
          fs.unlinkSync(full);
        } catch {}
        continue;
      }
      // per-message backoff: skip until its retry time is due
      if (msg.nextAt && Date.now() < msg.nextAt) continue;

      const bulk = f.startsWith('b-');
      if (bulk) {
        const { day, hour } = cairoParts();
        if (day !== this.bulkDay) {
          this.bulkDay = day;
          this.bulkSentToday = 0;
          this.writeStatus({ bulkDay: day, bulkSentToday: 0 });
        }
        if (!BULK_ALWAYS && (hour < BULK_FROM_HOUR || hour >= BULK_TO_HOUR)) return;
        if (this.bulkSentToday >= this.bulkPerDay) return; // the rest waits for tomorrow
        if (Date.now() < this.lastBulkAt + this.nextBulkGap) return;
      }

      // A group send with no metadata fails at the Baileys layer, so fetch it
      // for THIS group first. Retry in 15s without burning an attempt: it is
      // almost always a cold cache right after connecting, not a bad message.
      if (String(msg.to).includes('@g.us') && !(await this.primeGroup(toJid(msg.to)))) {
        msg.nextAt = Date.now() + 15000;
        try {
          fs.writeFileSync(full, JSON.stringify(msg));
        } catch {}
        continue;
      }

      const jid = toJid(msg.to);
      const now = Date.now();
      while (this.sentTimes.length && this.sentTimes[0] < now - 3600 * 1000) this.sentTimes.shift();
      if (this.sentTimes.length >= MAX_PER_HOUR) return; // hourly cap: the rest stays queued
      // Customers only: groups and staff (drivers, supervisor, an admin's
      // extra number) get many order messages at busy times by design.
      //
      // msg.staff is THREE-valued on purpose, because the bridge and api.php
      // are deployed separately and the live api.php may predate the flag:
      //   true      -> staff, exempt from the cap
      //   false     -> api.php says customer: over the cap it is a flood, park it
      //   undefined -> old api.php, we cannot tell. NEVER park: parking a
      //                driver's order alert loses the order. Hold it until the
      //                10-minute window frees up instead, so it still arrives.
      const capped = !jid.endsWith('@g.us') && msg.staff !== true;
      if (capped) {
        const recent = (this.perNumber.get(jid) || []).filter(
          (t) => t > now - PER_NUMBER_WINDOW_MS,
        );
        this.perNumber.set(jid, recent);
        if (recent.length >= MAX_PER_NUMBER) {
          if (msg.staff === false || bulk) {
            this.park(f, full, {
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
      if (this.perNumber.size > 2000) {
        for (const [k, v] of this.perNumber)
          if (!v.some((t) => t > now - PER_NUMBER_WINDOW_MS)) this.perNumber.delete(k);
      }

      // A broadcast to a number that has no WhatsApp is one of the signals
      // WhatsApp reads as spam. Ask first; drop the ones that are not there.
      if (bulk) {
        let exists = null;
        try {
          const r = await withTimeout(this.sock.onWhatsApp(jid), 20000);
          exists = !!(r && r[0] && r[0].exists);
        } catch {
          exists = null;
        }
        if (exists === false) {
          this.park(f, full, { ...msg, reason: 'not on WhatsApp — not sent' });
          continue;
        }
        if (exists === null) {
          msg.nextAt = Date.now() + 60000;
          try {
            fs.writeFileSync(full, JSON.stringify(msg));
          } catch {}
          return;
        }
      }

      const wait = this.lastSendAt + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);

      // Claim the file before sending. If the rename fails, someone else has it.
      const claimed = full + '.sending';
      try {
        fs.renameSync(full, claimed);
      } catch {
        continue;
      }
      this.lastSendAt = Date.now();
      this.sentTimes.push(this.lastSendAt);
      if (capped) this.perNumber.get(jid).push(this.lastSendAt);
      try {
        let content = { text: String(msg.text) };
        if (msg.image) {
          const img = String(msg.image);
          const usable = /^https?:\/\//.test(img) || fs.existsSync(img);
          if (usable) content = { image: { url: img }, caption: String(msg.text) };
        }
        if (bulk) {
          // A person types before they send. Costs a few seconds per message,
          // which the broadcast pace already allows for.
          try {
            await this.sock.sendPresenceUpdate('composing', jid);
            await sleep(2000 + Math.floor(Math.random() * 2500));
            await this.sock.sendPresenceUpdate('paused', jid);
          } catch {}
        }
        await withTimeout(this.sock.sendMessage(jid, content), SEND_TIMEOUT_MS);
        if (msg.dedupe) this.rememberSent(msg.dedupe);
        try {
          fs.unlinkSync(claimed);
        } catch {} // delivered
        if (bulk) {
          this.bulkSentToday++;
          this.lastBulkAt = Date.now();
          this.nextBulkGap =
            BULK_MIN_GAP_MS +
            Math.floor(Math.random() * Math.max(0, BULK_MAX_GAP_MS - BULK_MIN_GAP_MS));
          this.writeStatus({ bulkDay: this.bulkDay, bulkSentToday: this.bulkSentToday });
          return; // one broadcast message per tick at most
        }
      } catch (e) {
        msg.lastError = String((e && e.message) || e);
        if (e && e.timedOut) {
          // Still running in the background and may yet deliver. Retrying is
          // how one message becomes many, so park it instead.
          if (msg.dedupe) this.rememberSent(msg.dedupe);
          this.park(f, claimed, {
            ...msg,
            reason: 'send timed out — not retried (may have been delivered)',
          });
          this.writeStatus({ lastError: 'رسالة اتأخرت ومتبعتتش تاني: ' + msg.lastError });
          continue;
        }
        const attempts = (msg.attempts || 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          this.park(f, claimed, msg);
          this.writeStatus({
            lastError: 'رسالة فشلت بعد ' + attempts + ' محاولات: ' + msg.lastError,
          });
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

// ── Lines ────────────────────────────────────────────────────────────────
// Required (not run) = the test harness: export the pieces, start nothing.
const RUN = require.main === module;
const main = RUN ? new Line({ id: 'main', authDir: AUTH_DIR, ipcDir: IPC, isMain: true }) : null;
const lines = new Map(main ? [['main', main]] : []);
const LINE_ID = /^[a-z0-9]{6,16}$/;

// lines.json is written by api.php (temp file + rename, so never half-read).
// A line that disappears from it is only CLOSED; it is unlinked and wiped only
// when it is also named in `removed` — an admin pressing «حذف». A read glitch
// or an emptied file can therefore never log a working number out.
function syncLines() {
  let cfg = null;
  try {
    cfg = JSON.parse(fs.readFileSync(LINES_FILE, 'utf8'));
  } catch {
    return;
  }
  if (!cfg || typeof cfg !== 'object') return;
  const cap = (v) => Math.max(10, Math.min(300, +v || 80));
  main.bulkPerDay = cap(cfg.main && cfg.main.bulkPerDay);
  const want = new Map();
  for (const l of Array.isArray(cfg.lines) ? cfg.lines : [])
    if (l && LINE_ID.test(String(l.id))) want.set(String(l.id), l);
  const removed = new Set((Array.isArray(cfg.removed) ? cfg.removed : []).map(String));
  for (const [id, l] of want) {
    let s = lines.get(id);
    if (!s) {
      s = new Line({
        id,
        authDir: path.join(BASE, 'auth-' + id),
        ipcDir: path.join(LINES_DIR, id),
        isMain: false,
      });
      lines.set(id, s);
      s.log('started');
      s.writeStatus({ status: 'connecting', startedAt: Date.now(), lastError: null });
      s.connect();
    }
    s.bulkPerDay = cap(l.bulkPerDay);
  }
  for (const [id, s] of lines) {
    if (id === 'main' || want.has(id)) continue;
    lines.delete(id);
    s.stop(removed.has(id));
  }
  // A removed line whose session is not running here any more still has its
  // keys on disk: clear those too.
  for (const id of removed) {
    if (!LINE_ID.test(id) || want.has(id) || lines.has(id)) continue;
    try {
      fs.rmSync(path.join(BASE, 'auth-' + id), { recursive: true, force: true });
      fs.rmSync(path.join(LINES_DIR, id), { recursive: true, force: true });
    } catch {}
  }
}
if (RUN) setInterval(syncLines, 5000);

// Third leg of the keep-alive triangle: run-forever.sh watches this process,
// watchdog.sh watches run-forever.sh, and this — the longest-lived process on
// the box — re-checks both. It matters because nothing else here can: PHP has
// exec/shell_exec/proc_open in disable_functions, and the host has no crontab
// CLI, so a server-side cron must be added by hand in hPanel. Without this,
// recovery waited on a GitHub Actions schedule that fires every ~5 HOURS.
// Node is not restricted, and both scripts are flock-guarded, so a redundant
// start is a harmless no-op.
const { spawn } = require('child_process');
// Liveness is read from a pid file, not probed with `pgrep -f`. pgrep matches
// whole command lines, so the launch command — which necessarily contains the
// plain path watchdog.sh — matched the very pattern [w]atchdog.sh meant to
// exclude it. The check therefore always decided the watchdog was up, and in
// three minutes of watching it never started one. A pid plus signal 0 cannot
// be fooled that way, and needs no subprocess at all.
function opsAlive(pidFile) {
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    if (!pid) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function ensureOpsProcess(pidFile, script) {
  if (opsAlive(pidFile)) return;
  if (!fs.existsSync(script)) return; // dev machine: no supervisors to start
  try {
    console.log('[bridge ' + new Date().toISOString() + '] starting ' + path.basename(script));
    spawn('/bin/sh', ['-c', 'setsid /bin/bash ' + script + ' >/dev/null 2>&1 </dev/null &'], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } catch (e) {
    /* best-effort; a failure here must never take the bridge down */
  }
}
if (RUN)
  setInterval(() => {
    ensureOpsProcess(path.join(BASE, '.watchdog.pid'), path.join(BASE, 'watchdog.sh'));
    ensureOpsProcess(path.join(BASE, '.supervisor.pid'), path.join(BASE, 'run-forever.sh'));
  }, 60000);

if (RUN) {
  main.writeStatus({ status: 'connecting', startedAt: Date.now(), lastError: null });
  main.connect();
  syncLines();
} else {
  module.exports = { Line, cairoParts, isStopWord, toJid };
}
