import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { created, noContent, ok, paginated } from '../../utils/response.js';

const param = (v: unknown): string => {
  if (typeof v !== 'string' || !v) throw new NotFoundError('Resource');
  return v;
};

/** Fields worth putting on a timeline. Anything else is bookkeeping noise. */
const HISTORY_FIELDS = [
  'nameAr',
  'name',
  'price',
  'salePrice',
  'discount',
  'stock',
  'sku',
  'barcode',
  'categoryName',
  'merchantId',
  'description',
  'imageUrl',
  'unit',
  'isAvailable',
  'isHidden',
] as const;

export interface FieldChange {
  field: string;
  old: unknown;
  new: unknown;
}

/**
 * Old vs new for the fields that actually changed. Decimal columns come back as
 * Prisma.Decimal (or "120.00") where the client sent 120, so numbers are
 * compared by value — otherwise every save would report edits nobody made.
 */
export function diffProduct(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of HISTORY_FIELDS) {
    if (!(f in after)) continue;
    const o = before[f] ?? null;
    const n = after[f] ?? null;
    if (o === null && n === null) continue;
    const on = Number(o);
    const nn = Number(n);
    if (o !== null && n !== null && Number.isFinite(on) && Number.isFinite(nn)) {
      if (Math.abs(on - nn) < 0.00001) continue;
    } else if (String(o) === String(n)) {
      continue;
    }
    out.push({
      field: f,
      old: o instanceof Object ? String(o) : o,
      new: n instanceof Object ? String(n) : n,
    });
  }
  return out;
}

/** A lone availability flip reads better than a generic UPDATE with a boolean. */
export function productActionFor(changes: FieldChange[]): string {
  if (changes.length === 1 && changes[0]?.field === 'isAvailable') {
    return changes[0].new ? 'ACTIVATE' : 'DEACTIVATE';
  }
  return 'UPDATE';
}

/** Import attribution rides on headers — it can say where a change came from,
 *  never suppress the record. */
function importCtx(req: Request): { jobId: string | null; file: string | null } {
  const job = String(req.header('x-import-job') ?? '').trim();
  const raw = String(req.header('x-import-file') ?? '').trim();
  let file: string | null = null;
  if (raw) {
    try {
      file = decodeURIComponent(raw);
    } catch {
      file = raw;
    }
  }
  return { jobId: job || null, file };
}

/**
 * Record a product change. Never throws: an audit insert must not be able to
 * fail the write it is describing.
 */
export async function recordProductHistory(
  req: Request,
  input: {
    productId: string;
    productName?: string | null;
    action: string;
    changes?: FieldChange[] | null;
  },
): Promise<void> {
  try {
    const actorId = req.user?.id ?? null;
    const actorName = actorId
      ? ((await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }))?.name ??
        null)
      : null;
    const ctx = importCtx(req);
    await prisma.productHistory.create({
      data: {
        productId: input.productId,
        productName: input.productName ?? null,
        // Cast: the enums live in the generated client, and the callers pass
        // values straight from ProductAction/ChangeSource.
        action: input.action as never,
        source: (ctx.jobId ? 'IMPORT' : 'MANUAL') as never,
        actorId,
        actorName,
        importJobId: ctx.jobId,
        importFileName: ctx.file,
        changes: (input.changes?.length ? input.changes : null) as never,
      },
    });
  } catch (err) {
    console.error('[audit] product history insert failed:', (err as Error).message);
  }
}

// ─── Read endpoints ──────────────────────────────────────────────────────────

const historyQuery = z.object({
  action: z.string().optional(),
  source: z.string().optional(),
  actorId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export const productHistory: RequestHandler = async (req, res, next) => {
  try {
    const q = historyQuery.parse(req.query);
    const where: Record<string, unknown> = { productId: param(req.params.id) };
    if (q.action) where.action = q.action;
    if (q.source) where.source = q.source;
    if (q.actorId) where.actorId = q.actorId;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    const [items, total] = await Promise.all([
      prisma.productHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.productHistory.count({ where }),
    ]);
    paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

// ─── Import jobs ─────────────────────────────────────────────────────────────

const createJobSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileUrl: z.string().max(500).optional(),
  status: z.enum(['PENDING', 'VALIDATING', 'PROCESSING']).default('PROCESSING'),
  kind: z.enum(['CREATE', 'UPDATE', 'MIXED']).default('MIXED'),
  totalRows: z.number().int().nonnegative().default(0),
});

export const createJob: RequestHandler = async (req, res, next) => {
  try {
    const input = createJobSchema.parse(req.body);
    const actorId = req.user?.id ?? null;
    const actorName = actorId
      ? ((await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }))?.name ??
        null)
      : null;
    const job = await prisma.importJob.create({ data: { ...input, actorId, actorName } });
    created(res, job);
  } catch (err) {
    next(err);
  }
};

const updateJobSchema = z.object({
  status: z
    .enum(['PENDING', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'])
    .optional(),
  kind: z.enum(['CREATE', 'UPDATE', 'MIXED']).optional(),
  fileUrl: z.string().max(500).optional(),
  errorMessage: z.string().max(500).optional(),
  totalRows: z.number().int().nonnegative().optional(),
  createdCount: z.number().int().nonnegative().optional(),
  updatedCount: z.number().int().nonnegative().optional(),
  skippedCount: z.number().int().nonnegative().optional(),
  errorCount: z.number().int().nonnegative().optional(),
});

const TERMINAL = ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'];

export const updateJob: RequestHandler = async (req, res, next) => {
  try {
    const input = updateJobSchema.parse(req.body);
    const job = await prisma.importJob.update({
      where: { id: param(req.params.id) },
      data: {
        ...input,
        // Stamped here, not by the client: the duration shown to the admin must
        // not depend on whatever clock the browser happens to have.
        ...(input.status && TERMINAL.includes(input.status) ? { finishedAt: new Date() } : {}),
      },
    });
    ok(res, job);
  } catch (err) {
    next(err);
  }
};

const rowsSchema = z.object({
  rows: z
    .array(
      z.object({
        line: z.number().int(),
        productId: z.string().max(80).optional(),
        productName: z.string().max(255).optional(),
        sku: z.string().max(80).optional(),
        action: z.string().max(10),
        status: z.string().max(10),
        errorColumn: z.string().max(120).optional(),
        errorMessage: z.string().max(500).optional(),
        badValue: z.string().max(255).optional(),
      }),
    )
    .max(5000),
});

export const logRows: RequestHandler = async (req, res, next) => {
  try {
    const { rows } = rowsSchema.parse(req.body);
    const jobId = param(req.params.id);
    const r = await prisma.importRowLog.createMany({
      data: rows.map((x) => ({ ...x, jobId })),
    });
    ok(res, { inserted: r.count });
  } catch (err) {
    next(err);
  }
};

const listJobsQuery = z.object({
  status: z.string().optional(),
  kind: z.string().optional(),
  actorId: z.string().optional(),
  search: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const listJobs: RequestHandler = async (req, res, next) => {
  try {
    const q = listJobsQuery.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.kind) where.kind = q.kind;
    if (q.actorId) where.actorId = q.actorId;
    if (q.search) {
      where.OR = [{ fileName: { contains: q.search } }, { actorName: { contains: q.search } }];
    }
    if (q.from || q.to) {
      where.startedAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    const [items, total] = await Promise.all([
      prisma.importJob.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.importJob.count({ where }),
    ]);
    paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
  } catch (err) {
    next(err);
  }
};

export const getJob: RequestHandler = async (req, res, next) => {
  try {
    const job = await prisma.importJob.findUnique({
      where: { id: param(req.params.id) },
      include: { rows: { orderBy: { line: 'asc' } } },
    });
    if (!job) throw new NotFoundError('Import job');
    ok(res, job);
  } catch (err) {
    next(err);
  }
};

export const jobProducts: RequestHandler = async (req, res, next) => {
  try {
    const entries = await prisma.productHistory.findMany({
      where: { importJobId: param(req.params.id) },
      orderBy: { createdAt: 'asc' },
    });
    const ids = [...new Set(entries.map((e) => e.productId))];
    const live = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const alive = new Set(live.map((p) => p.id));
    ok(
      res,
      entries.map((e) => ({
        productId: e.productId,
        productName: e.productName,
        action: e.action,
        createdAt: e.createdAt,
        changes: e.changes,
        // The product may have been deleted since — the UI must not offer a
        // dead link.
        exists: alive.has(e.productId),
      })),
    );
  } catch (err) {
    next(err);
  }
};

/** Removes the log entry only. Products it touched — and their history — stay:
 *  deleting a receipt must not delete the goods. */
export const removeJob: RequestHandler = async (req, res, next) => {
  try {
    await prisma.importJob.delete({ where: { id: param(req.params.id) } });
    noContent(res);
  } catch (err) {
    next(err);
  }
};
