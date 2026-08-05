/**
 * Merchant portal: bulk upload from a sheet, and the store's own request log.
 *
 * The sheet is parsed and validated in the browser with the SAME
 * `productsSheet.ts` the admin import uses, so a merchant gets identical
 * columns, validation and error reporting. The difference is the write: instead
 * of a per-row loop straight into the catalogue, every valid row is posted once
 * as a single change request, so the admin approves an upload in one decision.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from './../components/ui/Button.js';
import { Dialog } from './../components/ui/Dialog.js';
import { EmptyState } from './../components/ui/Skeleton.js';
import { api } from './../lib/api.js';
import {
  buildImportWorkbook,
  downloadBlob,
  readProductsFile,
  type ParsedSheet,
} from './../lib/productsSheet.js';
import { cn } from './../lib/utils.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

// ─── Bulk upload ───────────────────────────────────────────────────────
export function MerchantImportDialog({
  merchantId,
  storeName,
  onClose,
  onDone,
}: {
  merchantId: string;
  storeName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);

  // Every id this store owns, so a row carrying an ID is treated as an update
  // and an unknown ID falls back to a create instead of failing.
  const { data: mine } = useQuery({
    queryKey: ['merchant', 'all-product-ids'],
    queryFn: () => api.merchantListProducts({ page: 1, pageSize: 100 }),
    staleTime: 60_000,
  });
  const knownIds = useMemo(
    () => new Set(((mine?.items as Row[]) ?? []).map((p) => String(p.id))),
    [mine],
  );

  const template = (mode: 'blank' | 'example') => {
    const wb = buildImportWorkbook({
      mode,
      withId: false,
      products: [],
      merchantNames: [storeName],
    });
    void wb.then((blob: Blob) => downloadBlob(blob, `تميم-قالب-المنتجات.xlsx`));
  };

  const read = async (f: File) => {
    setReading(true);
    setFileName(f.name);
    try {
      const parsed = await readProductsFile(f, {
        // Only this store is resolvable, so a row naming someone else's shop is
        // reported as an unknown merchant instead of writing into it.
        merchantsByName: new Map([[storeName.trim().toLowerCase(), merchantId]]),
        knownIds,
        defaultMerchantId: merchantId,
        defaultMerchantName: storeName,
      });
      setSheet(parsed);
      if (parsed.fatal) toast.error(parsed.fatal);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّرت قراءة الملف');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const send = useMutation({
    mutationFn: async () => {
      const rows = (sheet?.valid ?? []).map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        ...r.data,
      }));
      return api.merchantImportProducts(rows, fileName);
    },
    onSuccess: (res: unknown) => {
      const r = res as { pending?: boolean };
      toast.success(r?.pending ? 'تم إرسال الملف للإدارة للمراجعة' : 'تم رفع المنتجات بنجاح');
      onDone();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = sheet?.valid.length ?? 0;
  const invalid = sheet?.invalid.length ?? 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="رفع منتجات من ملف" size="lg">
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
          <p className="text-sm font-bold">١. نزّل القالب واملأه</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => template('blank')}>
              <Download className="w-4 h-4" />
              قالب فارغ
            </Button>
            <Button size="sm" variant="outline" onClick={() => template('example')}>
              <Download className="w-4 h-4" />
              قالب فيه مثال
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            الأعمدة المطلوبة: الاسم بالعربية، السعر، الحالة. عمود «التاجر» بيتملى تلقائياً بمتجرك.
          </p>
        </div>

        <div className="rounded-xl border border-border p-3 space-y-2">
          <p className="text-sm font-bold">٢. ارفع الملف</p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void read(f);
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={reading}>
            {reading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            اختر ملف Excel أو CSV
          </Button>
          {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
        </div>

        {sheet && !sheet.fatal && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs text-emerald-800">صفوف صالحة</p>
                <p className="text-2xl font-black text-emerald-700">{valid}</p>
              </div>
              <div
                className={cn(
                  'rounded-xl border p-3',
                  invalid ? 'border-red-200 bg-red-50' : 'border-border bg-muted/30',
                )}
              >
                <p className="text-xs text-muted-foreground">صفوف بها أخطاء</p>
                <p className={cn('text-2xl font-black', invalid ? 'text-red-600' : '')}>
                  {invalid}
                </p>
              </div>
            </div>

            {invalid > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 max-h-40 overflow-auto">
                <p className="text-xs font-bold text-red-800 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  الصفوف دي هتتجاهل:
                </p>
                <ul className="text-[11px] text-red-700 space-y-0.5">
                  {sheet.invalid.slice(0, 15).map((r) => (
                    <li key={r.line}>
                      سطر {r.line}: {r.errors.map((e) => `${e.column} — ${e.message}`).join('، ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {valid > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                هيتبعت طلب واحد للإدارة فيه {valid} منتج. المنتجات مش هتظهر في التطبيق غير بعد
                الموافقة.
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={() => send.mutate()} disabled={!valid || send.isPending}>
            {send.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            إرسال {valid ? `(${valid} منتج)` : ''}
          </Button>
          <Button variant="ghost" onClick={onClose} className="ms-auto">
            إلغاء
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ─── The store's own requests ──────────────────────────────────────────
const REQ_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'بانتظار موافقة الإدارة', tone: 'bg-amber-100 text-amber-900' },
  APPROVED: { label: 'تمت الموافقة', tone: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'مرفوض', tone: 'bg-red-100 text-red-800' },
  CANCELLED: { label: 'ملغي', tone: 'bg-zinc-100 text-zinc-600' },
};

const REQ_TYPE: Record<string, string> = {
  PRODUCT_CREATE: 'إضافة منتج',
  PRODUCT_UPDATE: 'تعديل منتج',
  PRODUCT_DELETE: 'حذف منتج',
  PRODUCT_IMPORT: 'رفع ملف منتجات',
  SECTION_CREATE: 'إضافة قسم',
  SECTION_RENAME: 'تعديل قسم',
  SECTION_DELETE: 'حذف قسم',
};

export function MerchantRequestsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['merchant', 'requests'],
    queryFn: () => api.merchantListRequests({ pageSize: 50 }),
    refetchInterval: 30_000,
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.merchantCancelRequest(id),
    onSuccess: () => {
      toast.success('تم إلغاء الطلب');
      qc.invalidateQueries({ queryKey: ['merchant', 'requests'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = (data?.items as Row[] | undefined) ?? [];

  if (isLoading) return <div className="h-40 rounded-2xl bg-muted animate-pulse" />;
  if (!items.length) {
    return (
      <div className="bg-card rounded-2xl border border-border">
        <EmptyState
          icon={<ClipboardList className="w-10 h-10" />}
          title="لا توجد طلبات"
          description="أي إضافة أو تعديل أو حذف هيظهر هنا بحالته لحد ما الإدارة تراجعه."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((r) => {
        const st = REQ_STATUS[r.status] ?? { label: r.status, tone: 'bg-zinc-100 text-zinc-700' };
        return (
          <div key={r.id} className="bg-card rounded-2xl border border-border p-4">
            <div className="flex flex-wrap items-start gap-2">
              <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-bold', st.tone)}>
                {st.label}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-muted text-muted-foreground">
                {REQ_TYPE[r.type] ?? r.type}
              </span>
              <span className="text-xs text-muted-foreground ms-auto">
                {new Date(r.createdAt).toLocaleString('ar-EG')}
              </span>
            </div>
            <p className="font-bold mt-2 break-words">{r.title}</p>

            {r.status === 'REJECTED' && r.rejectionReason && (
              <div className="mt-2 text-sm rounded-lg border border-red-200 bg-red-50 text-red-800 px-3 py-2">
                <strong>سبب الرفض:</strong> {r.rejectionReason}
              </div>
            )}
            {r.status === 'APPROVED' && (
              <p className="mt-2 text-xs text-emerald-700 font-bold inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                تم التنفيذ
              </p>
            )}
            {r.status === 'PENDING' && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => cancelMut.mutate(r.id)}
                disabled={cancelMut.isPending}
              >
                <X className="w-3.5 h-3.5" />
                سحب الطلب
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { FileSpreadsheet };
