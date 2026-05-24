import type { RequestHandler } from 'express';
import { z } from 'zod';

import * as wpp from '../../integrations/wppconnect.js';
import { ok } from '../../utils/response.js';

const sendSchema = z.object({
  phone: z.string().trim().min(8),
  message: z.string().trim().min(1).max(2000),
});

export const status: RequestHandler = async (_req, res, next) => {
  try {
    ok(res, wpp.getStatus());
  } catch (err) {
    next(err);
  }
};

export const start: RequestHandler = async (_req, res, next) => {
  try {
    // Don't await fully — the QR is emitted via socket; respond immediately
    // with the current state so the UI shows "جاري الاتصال…" right away.
    wpp.startSession().catch(() => undefined);
    ok(res, wpp.getStatus());
  } catch (err) {
    next(err);
  }
};

export const stop: RequestHandler = async (_req, res, next) => {
  try {
    await wpp.stopSession();
    ok(res, wpp.getStatus());
  } catch (err) {
    next(err);
  }
};

export const sendTest: RequestHandler = async (req, res, next) => {
  try {
    const input = sendSchema.parse(req.body);
    const sent = await wpp.sendText(input.phone, input.message);
    ok(res, { sent });
  } catch (err) {
    next(err);
  }
};
