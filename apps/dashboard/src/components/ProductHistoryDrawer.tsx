import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  FileSpreadsheet,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  User,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import type { Tone } from '../lib/statusRegistry.js';
import { TONE } from '../lib/statusRegistry.js';
import { Drawer } from './ui/Dialog.js';
import { EmptyState, TableSkeleton } from './ui/Skeleton.js';
import { ErrorState } from './ui/States.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

type Action = 'CREATE' | 'UPDATE' | 'DELETE' | 'ACTIVATE' | 'DEACTIVATE' | 'ARCHIVE' | 'RESTORE';

const ACTION_META: Record<Action, { label: string; tone: Tone; icon: typeof Pencil }> = {
  CREATE: { label: 'إضافة', tone: 'green', icon: Plus },
  UPDATE: { label: 'تعديل', tone: 'blue', icon: Pencil },
  DELETE: { label: 'حذف', tone: 'red', icon: Trash2 },
  ACTIVATE: { label: 'تفعيل', tone: 'green', icon: CheckCircle2 },
  DEACTIVATE: { label: 'تعطيل', tone: 'zinc', icon: XCircle },
  ARCHIVE: { label: 'أرشفة', tone: 'amber', icon: Trash2 },
  RESTORE: { label: 'استعادة', tone: 'teal', icon: RotateCcw },
};
const UNKNOWN_ACTION = { label: 'تغيير', tone: 'zinc' as Tone, icon: History };

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: 'تعديل يدوي',
  IMPORT: 'استيراد ملف',
  API_SYNC: 'مزامنة API',
  SYSTEM: 'النظام',
};

/** Arabic labels for the fields the trail records. Keyed by the Product column
 *  name the backend stores, so a new field shows its key rather than vanishing. */
const FIELD_LABEL: Record<string, string> = {
  nameAr: 'الاسم بالعربية',
  name: 'الاسم بالإنجليزية',
  price: 'السعر',
  salePrice: 'سعر الخصم',
  discount: 'نسبة الخصم',
  stock: 'المخزون',
  sku: 'كود المنتج (SKU)',
  barcode: 'الباركود',
  categoryName: 'التصنيف',
  merchantId: 'التاجر',
  description: 'الوصف',
  imageUrl: 'الصورة',
  unit: 'الوحدة',
  isAvailable: 'الحالة',
  isHidden: 'مخفي',
};

/** Raw column values are typed for MySQL, not for reading. */
function display(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'isAvailable') return v ? 'متاح' : 'معطّل';
  if (field === 'isHidden') return v ? 'مخفي' : 'ظاهر';
  if (field === 'price' || field === 'salePrice') return `${Number(v)} ج.م`;
  const s = String(v);
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

export function ProductHistoryDrawer({
  product,
  onClose,
  onOpenImport,
}: {
  product: Row;
  onClose: () => void;
  onOpenImport?: (jobId: string) => void;
}) {
  const [actionF, setActionF] = useState('');
  const [sourceF, setSourceF] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'product-history', product.id, actionF, sourceF],
    queryFn: () =>
      api.adminProductHistory(String(product.id), {
        pageSize: 100,
        ...(actionF ? { action: actionF } : {}),
        ...(sourceF ? { source: sourceF } : {}),
      }),
  });

  const items = (data?.items as Row[] | undefined) ?? [];

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="سجل التغييرات"
      description={product.nameAr}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <select
            value={actionF}
            onChange={(e) => setActionF(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-input bg-popover text-xs"
          >
            <option value="">كل العمليات</option>
            {(Object.keys(ACTION_META) as Action[]).map((a) => (
              <option key={a} value={a}>
                {ACTION_META[a].label}
              </option>
            ))}
          </select>
          <select
            value={sourceF}
            onChange={(e) => setSourceF(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-input bg-popover text-xs"
          >
            <option value="">كل المصادر</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {(actionF || sourceF) && (
            <button
              type="button"
              onClick={() => {
                setActionF('');
                setSourceF('');
              }}
              className="text-xs font-bold text-brand-red hover:underline"
            >
              مسح الفلاتر
            </button>
          )}
        </div>

        {isLoading ? (
          <TableSkeleton rows={5} cols={2} />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<History className="w-10 h-10" />}
            title="لا يوجد سجل"
            description={
              actionF || sourceF
                ? 'مافيش عمليات مطابقة للفلتر.'
                : 'لسه مفيش تغييرات مسجّلة على المنتج ده. أي تعديل من دلوقتي هيظهر هنا.'
            }
          />
        ) : (
          <ol className="relative space-y-0">
            {items.map((h, i) => {
              const meta = ACTION_META[h.action as Action] ?? UNKNOWN_ACTION;
              const Icon = meta.icon;
              const changes: Row[] = Array.isArray(h.changes) ? h.changes : [];
              const last = i === items.length - 1;
              return (
                <li key={h.id} className="relative flex gap-3 pb-5">
                  {/* the rail */}
                  {!last && (
                    <span
                      className="absolute top-8 bottom-0 start-[15px] w-px bg-border"
                      aria-hidden
                    />
                  )}
                  <span
                    className={`relative z-10 grid place-items-center w-8 h-8 rounded-full shrink-0 ${TONE[meta.tone].soft}`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>

                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-bold text-sm">{meta.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(h.createdAt)}
                      </span>
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {h.actorName || 'غير معروف'}
                      </span>
                      <span aria-hidden>·</span>
                      {h.source === 'IMPORT' ? (
                        <button
                          type="button"
                          disabled={!h.importJobId || !onOpenImport}
                          onClick={() => h.importJobId && onOpenImport?.(String(h.importJobId))}
                          className="inline-flex items-center gap-1 font-bold text-brand-red hover:underline disabled:no-underline disabled:text-muted-foreground"
                        >
                          <FileSpreadsheet className="w-3 h-3" />
                          {h.importFileName || 'استيراد ملف'}
                        </button>
                      ) : (
                        <span>{SOURCE_LABEL[h.source] ?? h.source}</span>
                      )}
                    </div>

                    {changes.length > 0 && (
                      <div className="mt-2 rounded-lg border border-border overflow-hidden">
                        {changes.map((c, ci) => (
                          <div
                            key={`${c.field}-${ci}`}
                            className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 text-xs ${
                              ci ? 'border-t border-border/60' : ''
                            }`}
                          >
                            <span className="font-bold">{FIELD_LABEL[c.field] ?? c.field}</span>
                            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 line-through decoration-red-300">
                              {display(c.field, c.old)}
                            </span>
                            <span className="text-muted-foreground" aria-hidden>
                              ←
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-bold">
                              {display(c.field, c.new)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Drawer>
  );
}
