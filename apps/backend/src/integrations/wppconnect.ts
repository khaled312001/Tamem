/**
 * WppConnect-based WhatsApp bridge.
 *
 * Lifecycle:
 *   - startSession()       → spawns a headless browser, navigates to web.whatsapp.com,
 *                            emits the QR data URL through `onQr` until scanned.
 *   - getStatus()          → "disconnected" | "qr" | "connecting" | "connected"
 *   - sendText(phone, msg) → no-op when disconnected; queues otherwise
 *   - stopSession()        → closes the browser, clears the cache
 *
 * Notes:
 *   - The library writes session tokens under ./tokens/<session> so reconnects
 *     after a restart don't need a new QR scan.
 *   - On Windows, puppeteer-core may not have a bundled Chromium; we fall back
 *     to the system Chrome if WPP_CHROME_PATH is set.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Whatsapp } from '@wppconnect-team/wppconnect';

import { logger } from '../utils/logger.js';

type Status = 'disconnected' | 'qr' | 'connecting' | 'connected';

interface State {
  client: Whatsapp | null;
  status: Status;
  qrDataUrl: string | null;
  phone: string | null;
  startedAt: number | null;
  lastError: string | null;
  starting: boolean;
}

const SESSION_NAME = 'tamem-admin';
const TOKENS_DIR = resolve(process.cwd(), 'tokens');

const state: State = {
  client: null,
  status: 'disconnected',
  qrDataUrl: null,
  phone: null,
  startedAt: null,
  lastError: null,
  starting: false,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // ignore listener errors
    }
  }
}

export function onStatusChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getStatus() {
  return {
    status: state.status,
    qrDataUrl: state.qrDataUrl,
    phone: state.phone,
    startedAt: state.startedAt,
    lastError: state.lastError,
  };
}

function pickChromePath(): string | undefined {
  if (process.env.WPP_CHROME_PATH && existsSync(process.env.WPP_CHROME_PATH)) {
    return process.env.WPP_CHROME_PATH;
  }
  // Common Windows install locations
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      // ignore
    }
  }
  return undefined;
}

export async function startSession(): Promise<{ status: Status; qrDataUrl: string | null }> {
  if (state.starting) return { status: state.status, qrDataUrl: state.qrDataUrl };
  if (state.client && state.status === 'connected') {
    return { status: state.status, qrDataUrl: null };
  }
  state.starting = true;
  state.lastError = null;
  state.status = 'connecting';
  state.qrDataUrl = null;
  emit();

  // Lazy import so the module load doesn't crash if puppeteer can't find a browser
  const wpp = await import('@wppconnect-team/wppconnect');
  const chromePath = pickChromePath();

  try {
    const client = await wpp.create({
      session: SESSION_NAME,
      folderNameToken: TOKENS_DIR,
      catchQR: (base64Qr, _ascii, attempts) => {
        state.qrDataUrl = base64Qr;
        state.status = 'qr';
        logger.info({ attempts }, 'whatsapp QR ready');
        emit();
      },
      statusFind: (status) => {
        logger.info({ status }, 'whatsapp status');
        if (status === 'isLogged' || status === 'qrReadSuccess' || status === 'inChat') {
          state.status = 'connected';
          state.qrDataUrl = null;
          state.startedAt = Date.now();
          emit();
        } else if (status === 'browserClose' || status === 'disconnectedMobile') {
          state.status = 'disconnected';
          state.qrDataUrl = null;
          state.client = null;
          emit();
        }
      },
      headless: 'new' as unknown as boolean, // newer puppeteer signature
      logQR: false,
      autoClose: 0,
      puppeteerOptions: chromePath ? { executablePath: chromePath } : {},
      browserArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    state.client = client;
    state.status = 'connected';
    state.qrDataUrl = null;
    state.startedAt = Date.now();
    try {
      const me = await client.getHostDevice();
      state.phone = me?.wid?.user ?? null;
    } catch {
      // ignore
    }
    emit();
    return { status: state.status, qrDataUrl: null };
  } catch (err) {
    state.lastError =
      err instanceof Error ? err.message : 'فشل تشغيل جلسة واتساب — تأكد من تثبيت Chrome';
    state.status = 'disconnected';
    state.client = null;
    state.qrDataUrl = null;
    emit();
    throw err;
  } finally {
    state.starting = false;
  }
}

export async function stopSession(): Promise<void> {
  const client = state.client;
  state.client = null;
  state.status = 'disconnected';
  state.qrDataUrl = null;
  state.phone = null;
  state.startedAt = null;
  emit();
  if (client) {
    try {
      await client.close();
    } catch (err) {
      logger.warn({ err }, 'wppconnect close failed');
    }
  }
}

/**
 * Auto-resume on backend boot. If a session token folder exists from a previous
 * successful QR scan, wppconnect picks it up silently — the admin doesn't need
 * to re-scan unless WhatsApp explicitly logged them out from another device.
 * Safe to call even if no tokens exist; it just no-ops in that case.
 */
export async function autoResumeIfPossible(): Promise<void> {
  try {
    const { existsSync, readdirSync } = await import('node:fs');
    const sessionDir = `${TOKENS_DIR}/${SESSION_NAME}`;
    if (!existsSync(sessionDir)) {
      logger.info('whatsapp: no saved session, skipping auto-resume');
      return;
    }
    // wppconnect saves multiple token files — make sure at least one is there
    const files = readdirSync(sessionDir);
    if (files.length === 0) {
      logger.info('whatsapp: token folder empty, skipping auto-resume');
      return;
    }
    logger.info('whatsapp: saved session detected, auto-resuming...');
    startSession().catch((err) => logger.warn({ err }, 'whatsapp auto-resume failed'));
  } catch (err) {
    logger.warn({ err }, 'whatsapp autoResumeIfPossible error');
  }
}

export async function sendText(phone: string, message: string): Promise<boolean> {
  const client = state.client;
  if (!client || state.status !== 'connected') return false;
  // wppconnect expects format: <digits>@c.us (no leading +)
  const digits = phone.replace(/\D+/g, '');
  if (digits.length < 8) return false;
  const jid = `${digits}@c.us`;
  try {
    await client.sendText(jid, message);
    return true;
  } catch (err) {
    logger.warn({ err, phone: digits }, 'wppconnect sendText failed');
    return false;
  }
}
