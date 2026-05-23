export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly messageAr?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    options: { messageAr?: string; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.messageAr = options.messageAr;
    this.details = options.details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(messageAr = 'غير مصرح') {
    super('UNAUTHORIZED', 'Unauthorized', 401, { messageAr });
  }
}

export class ForbiddenError extends AppError {
  constructor(messageAr = 'ممنوع') {
    super('FORBIDDEN', 'Forbidden', 403, { messageAr });
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', messageAr?: string) {
    super('NOT_FOUND', `${resource} not found`, 404, {
      messageAr: messageAr ?? `${resource} غير موجود`,
    });
  }
}

export class ValidationError extends AppError {
  constructor(details: Record<string, unknown>, messageAr = 'بيانات غير صحيحة') {
    super('VALIDATION_ERROR', 'Validation failed', 422, { messageAr, details });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, messageAr = 'تعارض في البيانات') {
    super('CONFLICT', message, 409, { messageAr });
  }
}

export class InvalidTransitionError extends AppError {
  constructor(from: string, to: string) {
    super('INVALID_STATE_TRANSITION', `Cannot transition from ${from} to ${to}`, 422, {
      messageAr: `لا يمكن نقل الحالة من ${from} إلى ${to}`,
      details: { from, to },
    });
  }
}
