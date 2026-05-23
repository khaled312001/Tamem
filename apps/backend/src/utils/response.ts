import type { Response } from 'express';

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>): Response {
  return res.json({ data, ...(meta ? { meta } : {}) });
}

export function created<T>(res: Response, data: T): Response {
  return res.status(201).json({ data });
}

export function paginated<T>(
  res: Response,
  data: T[],
  pagination: { page: number; pageSize: number; total: number },
): Response {
  return res.json({
    data,
    meta: {
      pagination: {
        ...pagination,
        totalPages: Math.ceil(pagination.total / pagination.pageSize),
      },
    },
  });
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}
