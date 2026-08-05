/**
 * Admin review queue for merchant change requests.
 *
 * Every write a merchant makes lands here as a PENDING row and only touches the
 * catalogue when an admin approves it. Approved and rejected rows are kept, so
 * this page is also the audit trail: who asked, for what, when, the verdict and
 * (on a refusal) the reason.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ClipboardList,
  FileSpreadsheet,
  FolderTree,
  Loader2,
  Package,
  PackageX,
  PencilLine,
  Store,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Textarea } from '../components/ui/Input.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { ErrorState } from '../components/ui/States.js';
import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const TABS = [
  { key: 'PENDING', label: 'بانتظار المراجعة' },
  { key: 'APPROVED', label: 'مقبولة' },
  { key: 'REJECTED', label: 'مرفوضة' },
  { key: 'ALL', label: 'الكل' },
] as const;

const TYPES: Record<string, { label: string; Icon: typeof Package; tone: string }> = {
  PRODUCT_CREATE: { label: 'إضافة منتج', Icon: Package, tone: 'bg-emerald-100 text-emerald-800' },
  PRODUCT_UPDATE: { label: 'تعديل منتج', Icon: PencilLine, tone: 'bg-blue-100 text-blue-800' },
  PRODUCT_DELETE: { label: 'حذف منتج', Icon: PackageX, tone: 'bg-red-100 text-red-800' },
  PRODUCT_IMPORT: {
    label: 'رفع ملف منتجات',
    Icon: FileSpreadsheet,
    tone: 'bg-amber-100 text-amber-900',
  },
  SECTION_CREATE: { label: 'إضافة قسم', Icon: FolderTree, tone: 'bg-emerald-100 text-emerald-800' },
  SECTION_RENAME: { label: 'تعديل قسم', Icon: FolderTree, tone: 'bg-blue-100 text-blue-800' },
  SECTION_DELETE: { label: 'حذف قسم', Icon: FolderTree, tone: 'bg-red-100 text-red-800' },
};

const STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'بانتظار المراجعة', tone: 'bg-amber-100 text-amber-900' },
  APPROVED: { label: 'تمت الموافقة', tone: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'مرفوض', tone: 'bg-red-100 text-red-800' },
  CANCELLED: { label: 'ملغي', tone: 'bg-zinc-100 text-zinc-600' },
};

/** Arabic labels for the product columns shown in the diff. */
const FIELD_AR: Record<string, string> = {
  nameAr: 'الاسم بالعربية',
  name: 'الاسم بالإنجليزية',
  description: 'الوصف',
  price: 'السعر',
  salePrice: 'سعر الخصم',
  discount: 'نسبة الخصم %',
  saleEndsAt: 'انتهاء العرض',
  stock: 'المخزون',
  sku: 'SKU',
  barcode: 'الباركود',
  categoryName: 'القسم',
  unit: 'الوحدة',
  isAvailable: 'متاح',
  imageUrl: 'الصورة',
  imageUrls: 'الصور',
  sortOrder: 'الترتيب',
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (Array.isArray(v)) return `${v.length} عنصر`;
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

function when(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ar-EG');
}

export function MerchantRequestsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('PENDING');
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [reason, setReason] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'merchant-requests', tab],
    queryFn: () => api.adminListMerchantRequests({ status: tab, pageSize: 100 }),
    // A merchant can file a request at any moment, so keep the queue fresh.
    refetchInterval: tab === 'PENDING' ? 30_000 : false,
  });

  const { data: stats } = useQuery({
    queryKey: ['admin', 'merchant-requests', 'stats'],
    queryFn: () => api.adminMerchantRequestStats(),
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'merchant-requests'] });
    // The catalogue just changed underneath the products screens.
    qc.invalidateQueries({ queryKey: ['admin', 'products'] });
  };

  const approveMut = useMutation({
    mutationFn: (id: string) => api.adminApproveMerchantRequest(id),
    onSuccess: () => {
      toast.success('تمت الموافقة وتنفيذ التغيير');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) =>
      api.adminRejectMerchantRequest(id, why),
    onSuccess: () => {
      toast.success('تم رفض الطلب');
      setRejecting(null);
      setReason('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = (data?.items as Row[] | undefined) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="طلبات التجّار"
        subtitle="كل تعديل يقوم به التاجر يصل هنا أولاً ولا يُنفَّذ إلا بعد موافقتك"
        icon={ClipboardList}
      />

      {/* Status tabs — pending count is the one that matters at a glance. */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const n = t.key === 'ALL' ? undefined : stats?.[t.key];
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-bold border transition',
                tab === t.key
                  ? 'bg-brand-red text-white border-brand-red'
                  : 'bg-card text-foreground border-border hover:border-brand-red/50',
              )}
            >
              {t.label}
              {n ? (
                <span
                  className={cn(
                    'ms-2 px-1.5 py-0.5 rounded-full text-[11px]',
                    tab === t.key ? 'bg-white/20' : 'bg-muted',
                  )}
                >
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="bg-card rounded-xl border border-border p-6">
          <TableSkeleton rows={5} cols={4} />
        </div>
      ) : isError ? (
        <div className="bg-card rounded-xl border border-border">
          <ErrorState onRetry={() => refetch()} />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-card rounded-xl border border-border">
          <EmptyState
            icon={<ClipboardList className="w-10 h-10" />}
            title={tab === 'PENDING' ? 'لا توجد طلبات بانتظار المراجعة' : 'لا توجد طلبات'}
            description="طلبات التجّار (إضافة/تعديل/حذف/رفع ملفات) هتظهر هنا."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <RequestCard
              key={r.id}
              r={r}
              onApprove={() => approveMut.mutate(r.id)}
              onReject={() => {
                setRejecting(r);
                setReason('');
              }}
              busy={approveMut.isPending}
            />
          ))}
        </div>
      )}

      <Dialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title="رفض الطلب"
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">هيوصل التاجر سبب الرفض في صفحة «طلباتي».</p>
          <Field label="سبب الرفض" required>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: الصور غير واضحة / السعر غير صحيح"
              autoFocus
            />
          </Field>
          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={() =>
                rejecting && rejectMut.mutate({ id: rejecting.id, why: reason.trim() })
              }
              disabled={reason.trim().length < 3 || rejectMut.isPending}
            >
              {rejectMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              تأكيد الرفض
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(null)} className="ms-auto">
              إلغاء
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function RequestCard({
  r,
  onApprove,
  onReject,
  busy,
}: {
  r: Row;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const t = TYPES[r.type] ?? { label: r.type, Icon: Package, tone: 'bg-zinc-100 text-zinc-700' };
  const st = STATUS[r.status] ?? { label: r.status, tone: 'bg-zinc-100 text-zinc-700' };
  const Icon = t.Icon;
  const payload = (r.payload ?? {}) as Record<string, unknown>;
  const before = (r.beforeData ?? {}) as Record<string, unknown>;
  const rows = r.type === 'PRODUCT_IMPORT' ? [] : Object.keys(payload);

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn('p-2 rounded-xl shrink-0', t.tone)}>
          <Icon className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-bold', t.tone)}>
              {t.label}
            </span>
            <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-bold', st.tone)}>
              {st.label}
            </span>
          </div>
          <p className="font-bold text-foreground mt-1 break-words">{r.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
            <span className="inline-flex items-center gap-1">
              <Store className="w-3.5 h-3.5" />
              {r.storeNameAr ?? r.storeName ?? '—'}
            </span>
            <span>بواسطة: {r.requestedByName ?? '—'}</span>
            <span>{when(r.createdAt)}</span>
          </p>
        </div>

        {r.status === 'PENDING' && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onApprove} disabled={busy}>
              <Check className="w-4 h-4" />
              موافقة
            </Button>
            <Button size="sm" variant="outline" onClick={onReject}>
              <X className="w-4 h-4 text-destructive" />
              رفض
            </Button>
          </div>
        )}
      </div>

      {/* What exactly changes */}
      {r.type === 'PRODUCT_IMPORT' ? (
        <div className="text-sm bg-muted/40 rounded-lg px-3 py-2">
          <strong>{Array.isArray(payload.rows) ? (payload.rows as unknown[]).length : 0}</strong> صف
          من الملف «{String(payload.fileName ?? '')}» — الموافقة هتضيف/تعدّل المنتجات دي دفعة واحدة.
        </div>
      ) : rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="text-right">
                <th className="py-1 font-bold">الحقل</th>
                <th className="py-1 font-bold">قبل</th>
                <th className="py-1 font-bold">بعد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((k) => (
                <tr key={k}>
                  <td className="py-1.5 font-bold">{FIELD_AR[k] ?? k}</td>
                  <td className="py-1.5 text-muted-foreground">{fmt(before[k])}</td>
                  <td className="py-1.5 text-emerald-700 font-bold">{fmt(payload[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {r.status === 'REJECTED' && r.rejectionReason && (
        <div className="text-sm rounded-lg border border-red-200 bg-red-50 text-red-800 px-3 py-2">
          <strong>سبب الرفض:</strong> {r.rejectionReason}
          <span className="text-xs text-red-600/80 block mt-0.5">
            بواسطة {r.reviewedByName ?? '—'} · {when(r.reviewedAt)}
          </span>
        </div>
      )}
      {r.status === 'APPROVED' && (
        <p className="text-xs text-muted-foreground">
          نُفّذ بواسطة {r.reviewedByName ?? '—'} · {when(r.reviewedAt)}
          {r.appliedResult && typeof r.appliedResult === 'object'
            ? ` · ${Object.entries(r.appliedResult as Record<string, unknown>)
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join('، ')}`
            : ''}
        </p>
      )}
    </div>
  );
}
