import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        messageAr: err.messageAr,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        messageAr: 'بيانات غير صحيحة',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      messageAr: 'حدث خطأ في الخادم',
      // In dev only, echo the real cause so the operator can debug from
      // the browser network panel without tailing the backend terminal.
      ...(isDev && err instanceof Error
        ? { devMessage: err.message, devStack: err.stack?.split('\n').slice(0, 8) }
        : {}),
    },
  });
};
