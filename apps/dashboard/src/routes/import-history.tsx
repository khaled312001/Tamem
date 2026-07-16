import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  History,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { Drawer } from '../components/ui/Dialog.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { ErrorState } from '../components/ui/States.js';
import { api } from '../lib/api.js';
import { formatCount, formatDateTime } from '../lib/format.js';
import { downloadBlob } from '../lib/productsSheet.js';
import type { Tone } from '../lib/statusRegistry.js';
import { TONE } from '../lib/statusRegistry.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'قيد الرفع', tone: 'zinc' },
  VALIDATING: { label: 'قيد الفحص', tone: 'sky' },
  PROCESSING: { label: 'قيد المعالجة', tone: 'blue' },
  COMPLETED: { label: 'تم بنجاح', tone: 'green' },
  PARTIAL: { label: 'تم جزئياً مع أخطاء', tone: 'amber' },
  FAILED: { label: 'فشل', tone: 'red' },
  CANCELLED: { label: 'تم الإلغاء', tone: 'zinc' },
};
const KIND: Record<string, string> = {
  CREATE: 'إضافة منتجات',
  UPDATE: 'تحديث منتجات',
  MIXED: 'إضافة وتحديث',
};

const RANGES: [string, string, number][] = [
  ['all', 'كل الفترات', 0],
  ['7', 'آخر 7 أيام', 7],
  ['30', 'آخر 30 يوم', 30],
  ['90', 'آخر 3 شهور', 90],
];

function StatusBadge({ status }: { status: string }) {
  const m = STATUS[status] ?? { label: status, tone: 'zinc' as Tone };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${TONE[m.tone].badge}`}
    >
      {status === 'PROCESSING' && <Loader2 className="w-3 h-3 animate-spin" />}
      {m.label}
    </span>
  );
}

/** Server timestamps are the source of truth — a browser clock can be anything. */
function duration(job: Row): string {
  if (!job.startedAt || !job.finishedAt) return '—';
  const ms = new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return 'أقل من ثانية';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} ثانية` : `${Math.floor(s / 60)} د ${s % 60} ث`;
}

export function ImportHistoryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [range, setRange] = useState('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Row | null>(null);

  const days = RANGES.find(([k]) => k === range)?.[2] ?? 0;
  const from = days ? new Date(Date.now() - days * 86400_000).toISOString() : undefined;

  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['admin', 'import-jobs', search, statusF, range],
    queryFn: () =>
      api.adminListImportJobs({
        pageSize: 100,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(statusF ? { status: statusF } : {}),
        ...(from ? { from } : {}),
      }),
    // A run in another tab moves through PROCESSING → COMPLETED; without this
    // the row would sit on a stale status until a manual refresh.
    //
    // 20s, not something snappier: the PHP shim opens a DB connection per
    // request against a 500/hour cap, so a 5s poll would spend the whole
    // hourly budget on this one screen. Only polls while a job is live.
    refetchInterval: (q) =>
      ((q.state.data?.items as Row[] | undefined) ?? []).some((j) =>
        ['PROCESSING', 'PENDING', 'VALIDATING'].includes(j.status),
      )
        ? 20_000
        : false,
  });

  const items = (data?.items as Row[] | undefined) ?? [];

  const del = useMutation({
    mutationFn: (id: string) => api.adminDeleteImportJob(id),
    onSuccess: () => {
      toast.success('تم حذف السجل — المنتجات لم تتأثر');
      setConfirmDel(null);
      qc.invalidateQueries({ queryKey: ['admin', 'import-jobs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const anyFilter = !!search.trim() || !!statusF || range !== 'all';

  return (
    <div className="space-y-4">
      <PageHeader
        title="سجل الاستيراد"
        subtitle={`${formatCount(items.length)} عملية — كل ملف اترفع، مين رفعه، وإيه اللي حصل لكل صف`}
        icon={History}
        crumbs={[{ label: 'المنتجات', to: '/products' }]}
        actions={
          <Button variant="outline" size="md" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            تحديث
          </Button>
        }
      />

      <div className="bg-card rounded-xl border border-border p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم الملف أو المستخدم…"
              className="w-full ps-9 pe-3 py-2 rounded-lg border border-input bg-popover text-sm outline-none focus:ring-2 focus:ring-brand-red/30"
            />
          </div>
          <select
            value={statusF}
            onChange={(e) => setStatusF(e.target.value)}
            className="px-3 py-2 rounded-lg border border-input bg-popover text-sm"
          >
            <option value="">كل الحالات</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-input bg-popover text-sm"
          >
            {RANGES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          {anyFilter && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusF('');
                setRange('all');
              }}
              className="text-xs font-bold text-brand-red hover:underline"
            >
              مسح الفلاتر
            </button>
          )}
        </div>
        {dataUpdatedAt > 0 && (
          <p className="text-[11px] text-muted-foreground">
            آخر تحديث للحالة: {formatDateTime(new Date(dataUpdatedAt).toISOString())}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="bg-card rounded-xl border border-border p-6">
          <TableSkeleton rows={6} cols={6} />
        </div>
      ) : isError ? (
        <div className="bg-card rounded-xl border border-border">
          <ErrorState onRetry={() => refetch()} />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-card rounded-xl border border-border">
          <EmptyState
            icon={<FileSpreadsheet className="w-10 h-10" />}
            title={anyFilter ? 'لا توجد نتائج' : 'لم يتم استيراد أي ملف بعد'}
            description={
              anyFilter
                ? 'جرّب تعديل البحث أو الفلاتر.'
                : 'أي ملف Excel أو CSV تستورده من صفحة المنتجات هيتسجّل هنا بالتفصيل.'
            }
            action={
              <Link to="/products">
                <Button variant="outline">الذهاب للمنتجات</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                <tr className="text-right">
                  <th className="px-3 py-3 font-bold">الملف</th>
                  <th className="px-3 py-3 font-bold">النوع</th>
                  <th className="px-3 py-3 font-bold">المستخدم</th>
                  <th className="px-3 py-3 font-bold">النتيجة</th>
                  <th className="px-3 py-3 font-bold">الحالة</th>
                  <th className="px-3 py-3 font-bold">التاريخ</th>
                  <th className="px-3 py-3 w-20" />
                </tr>
              </thead>
              <tbody>
                {items.map((j) => (
                  <tr key={j.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setDetailId(j.id)}
                        className="inline-flex items-center gap-2 font-bold text-start hover:text-brand-red"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[220px]">{j.fileName}</span>
                      </button>
                    </td>
                    <td className="px-3 py-3 text-xs">{KIND[j.kind] ?? j.kind}</td>
                    <td className="px-3 py-3 text-xs">
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3 text-muted-foreground" />
                        {j.actorName ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1 text-[11px] font-bold">
                        {j.createdCount > 0 && (
                          <span className={`px-1.5 py-0.5 rounded ${TONE.green.badge}`}>
                            +{formatCount(j.createdCount)} جديد
                          </span>
                        )}
                        {j.updatedCount > 0 && (
                          <span className={`px-1.5 py-0.5 rounded ${TONE.blue.badge}`}>
                            {formatCount(j.updatedCount)} تحديث
                          </span>
                        )}
                        {j.skippedCount > 0 && (
                          <span className={`px-1.5 py-0.5 rounded ${TONE.zinc.badge}`}>
                            {formatCount(j.skippedCount)} متخطى
                          </span>
                        )}
                        {j.errorCount > 0 && (
                          <span className={`px-1.5 py-0.5 rounded ${TONE.red.badge}`}>
                            {formatCount(j.errorCount)} خطأ
                          </span>
                        )}
                        {!j.createdCount && !j.updatedCount && !j.skippedCount && !j.errorCount && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={j.status} />
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {formatDateTime(j.startedAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => setDetailId(j.id)}
                          aria-label="عرض التفاصيل"
                          title="عرض التفاصيل"
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDel(j)}
                          aria-label="حذف السجل"
                          title="حذف السجل (المنتجات لا تتأثر)"
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detailId && <ImportDetailDrawer id={detailId} onClose={() => setDetailId(null)} />}
      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title="حذف سجل العملية"
        message={
          confirmDel
            ? `سيتم حذف سجل «${confirmDel.fileName}» فقط. المنتجات اللي اتضافت أو اتعدّلت بالملف ده هتفضل زي ما هي، وسجل كل منتج مش هيتأثر.`
            : ''
        }
        loading={del.isPending}
        onConfirm={() => confirmDel && del.mutate(confirmDel.id)}
      />
    </div>
  );
}

const ROW_ACTION: Record<string, { label: string; tone: Tone }> = {
  create: { label: 'إنشاء', tone: 'green' },
  update: { label: 'تحديث', tone: 'blue' },
  skip: { label: 'تخطي', tone: 'zinc' },
};

function ImportDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [tab, setTab] = useState<'rows' | 'products'>('rows');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'import-jobs', id],
    queryFn: () => api.adminGetImportJob(id),
  });
  const job = data as Row | undefined;

  const { data: touched } = useQuery({
    queryKey: ['admin', 'import-jobs', id, 'products'],
    queryFn: () => api.adminImportJobProducts(id),
    enabled: tab === 'products',
  });

  const rows: Row[] = job?.rows ?? [];
  const errors = rows.filter((r) => r.status === 'error');

  const errorReport = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['رقم الصف', 'المنتج', 'العمود', 'المشكلة', 'القيمة الخاطئة', 'الإجراء المقترح'];
    const lines = errors.map((r) =>
      [
        r.line,
        r.productName,
        r.errorColumn,
        r.errorMessage,
        r.badValue,
        'صحّح القيمة في هذا الصف ثم أعد رفع الملف',
      ]
        .map(esc)
        .join(','),
    );
    downloadBlob(
      new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\n')], {
        type: 'text/csv;charset=utf-8',
      }),
      `أخطاء-${job?.fileName ?? 'استيراد'}.csv`,
    );
  };

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="تفاصيل الاستيراد"
      description={job?.fileName}
    >
      {isLoading ? (
        <TableSkeleton rows={6} cols={3} />
      ) : isError || !job ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Info label="المستخدم" value={job.actorName ?? '—'} icon={User} />
            <Info label="النوع" value={KIND[job.kind] ?? job.kind} icon={FileSpreadsheet} />
            <Info label="البداية" value={formatDateTime(job.startedAt)} icon={Clock} />
            <Info
              label="الانتهاء"
              value={job.finishedAt ? formatDateTime(job.finishedAt) : '—'}
              icon={Clock}
            />
            <Info label="المدة" value={duration(job)} icon={Clock} />
            <div className="rounded-lg border border-border p-2.5">
              <div className="text-muted-foreground mb-1">الحالة</div>
              <StatusBadge status={job.status} />
            </div>
          </div>

          {job.errorMessage && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {job.errorMessage}
            </div>
          )}

          <div className="grid grid-cols-4 gap-2 text-center">
            <Tile tone="zinc" label="إجمالي" value={job.totalRows} />
            <Tile tone="green" label="جديد" value={job.createdCount} />
            <Tile tone="blue" label="تحديث" value={job.updatedCount} />
            <Tile tone="red" label="أخطاء" value={job.errorCount} />
          </div>

          {errors.length > 0 && (
            <Button variant="outline" onClick={errorReport} className="w-full">
              <Download className="w-4 h-4" />
              تحميل تقرير الأخطاء ({formatCount(errors.length)})
            </Button>
          )}

          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs font-bold">
            {(
              [
                ['rows', `الصفوف (${formatCount(rows.length)})`],
                ['products', 'المنتجات المتأثرة'],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 ${tab === k ? 'bg-brand-red text-white' : 'bg-card text-muted-foreground hover:bg-muted'}`}
              >
                {l}
              </button>
            ))}
          </div>

          {tab === 'rows' ? (
            rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد صفوف مسجّلة لهذه العملية.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr className="text-right">
                      <th className="px-2 py-1.5 font-bold">صف</th>
                      <th className="px-2 py-1.5 font-bold">المنتج</th>
                      <th className="px-2 py-1.5 font-bold">الإجراء</th>
                      <th className="px-2 py-1.5 font-bold">النتيجة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const a = ROW_ACTION[r.action] ?? { label: r.action, tone: 'zinc' as Tone };
                      return (
                        <tr key={r.id} className="border-t border-border/50 align-top">
                          <td className="px-2 py-1.5 font-mono">{r.line}</td>
                          <td className="px-2 py-1.5">
                            <div className="font-bold">{r.productName || '—'}</div>
                            {r.sku && (
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {r.sku}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TONE[a.tone].badge}`}
                            >
                              {a.label}
                            </span>
                          </td>
                          <td className="px-2 py-1.5">
                            {r.status === 'ok' ? (
                              <span className="text-green-700 font-bold">تم</span>
                            ) : (
                              <div className="text-destructive">
                                {r.errorColumn && <b>{r.errorColumn}: </b>}
                                {r.errorMessage}
                                {r.badValue && (
                                  <div className="text-[10px] opacity-80">
                                    القيمة: «{r.badValue}»
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="space-y-1.5">
              {((touched as Row[] | undefined) ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">لم يتغيّر أي منتج في هذه العملية.</p>
              ) : (
                ((touched as Row[] | undefined) ?? []).map((t, i) => (
                  <div
                    key={`${t.productId}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs"
                  >
                    <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{t.productName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatDateTime(t.createdAt)}
                      </div>
                    </div>
                    {t.exists ? (
                      <Link
                        to={`/products?search=${encodeURIComponent(t.productName ?? '')}`}
                        className="text-brand-red font-bold hover:underline shrink-0"
                      >
                        فتح
                      </Link>
                    ) : (
                      <span className="text-muted-foreground shrink-0">محذوف</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof User }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="text-muted-foreground mb-0.5 inline-flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="font-bold">{value}</div>
    </div>
  );
}

function Tile({ tone, label, value }: { tone: Tone; label: string; value: number }) {
  return (
    <div className={`rounded-lg p-2 ${TONE[tone].soft}`}>
      <div className="text-base font-black">{formatCount(value ?? 0)}</div>
      <div className="text-[10px] font-bold opacity-80">{label}</div>
    </div>
  );
}
