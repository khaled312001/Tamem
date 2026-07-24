import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Loader2, Package, Pencil, Percent, Search, Tag, Timer, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input } from '../components/ui/Input.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { ErrorState } from '../components/ui/States.js';
import { api } from '../lib/api.js';
import { formatCount, formatMoney } from '../lib/format.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** UTC ISO → datetime-local value in the admin's local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The offer price a row resolves to (mirrors productPrice on the client). */
function offerPrice(p: Row): number {
  const list = Number(p.price) || 0;
  if (p.expired) return list;
  const sale = p.salePrice != null ? Number(p.salePrice) : null;
  if (sale != null && sale > 0 && sale < list) return sale;
  const pct = Number(p.discount) || 0;
  if (pct > 0) return Math.round(list * (1 - Math.min(90, pct) / 100) * 100) / 100;
  return list;
}

/**
 * "عروض اليوم" — one place to run product discounts.
 *
 * An offer is just a discount on a product (a % or an after-discount price) with
 * an optional expiry. This page is a focused view over exactly those three
 * fields, so the admin never has to open a product's full edit form to run a
 * sale. Timed offers revert automatically the moment they end (no cron) — the
 * server ignores an expired saleEndsAt everywhere.
 */
export function DealsPage() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Row | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'deals'],
    queryFn: () => api.adminListDeals() as Promise<Row[]>,
  });
  const deals = (data ?? []) as Row[];
  const liveCount = deals.filter((d) => !d.expired).length;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'deals'] });
    qc.invalidateQueries({ queryKey: ['admin', 'products'] });
  };

  const removeMut = useMutation({
    mutationFn: (id: string) =>
      api.adminUpdateProduct(id, { discount: 0, salePrice: null, saleEndsAt: null }),
    onSuccess: () => {
      toast.success('تم إنهاء العرض — رجع السعر لأصله');
      setConfirmRemove(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="عروض اليوم"
        subtitle={`${formatCount(liveCount)} عرض ساري — تظهر في الصفحة الرئيسية بالتطبيق`}
        icon={Tag}
        actions={
          <Button size="md" onClick={() => setAddOpen(true)}>
            <Percent className="w-4 h-4" />
            أضف عرض
          </Button>
        }
      />

      {isLoading ? (
        <div className="bg-card rounded-xl border border-border p-6">
          <TableSkeleton rows={6} cols={5} />
        </div>
      ) : isError ? (
        <div className="bg-card rounded-xl border border-border">
          <ErrorState onRetry={() => refetch()} />
        </div>
      ) : deals.length === 0 ? (
        <div className="bg-card rounded-xl border border-border">
          <EmptyState
            icon={<Tag className="w-10 h-10" />}
            title="لا توجد عروض"
            description="أضف أول عرض ليظهر في «عروض اليوم» بالتطبيق."
            action={
              <Button onClick={() => setAddOpen(true)}>
                <Percent className="w-4 h-4" />
                أضف عرض
              </Button>
            }
          />
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                <tr className="text-right">
                  <th className="px-3 py-3 font-bold">المنتج</th>
                  <th className="px-3 py-3 font-bold">السعر الأصلي</th>
                  <th className="px-3 py-3 font-bold">العرض</th>
                  <th className="px-3 py-3 font-bold">المؤقّت</th>
                  <th className="px-3 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr
                    key={d.id}
                    className={`border-b border-border/50 hover:bg-muted/30 ${d.expired ? 'opacity-60' : ''}`}
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {d.imageUrl || d.merchant?.logoUrl ? (
                          <img
                            src={d.imageUrl || d.merchant?.logoUrl}
                            alt=""
                            loading="lazy"
                            className="w-9 h-9 rounded-lg object-cover border border-border"
                          />
                        ) : (
                          <span className="w-9 h-9 rounded-lg bg-muted grid place-items-center text-muted-foreground/50">
                            <Package className="w-4 h-4" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-foreground truncate">{d.nameAr}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {d.merchant?.storeNameAr ?? '—'}
                            {d.hasVariants && ' · بأحجام'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground line-through">
                      {formatMoney(Number(d.price) || 0)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-brand-red">
                          {formatMoney(offerPrice(d))}
                        </span>
                        {Number(d.discount) > 0 && (
                          <span className="text-[11px] font-bold bg-brand-red/10 text-brand-red rounded px-1.5 py-0.5">
                            -{Math.round(Number(d.discount))}%
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {d.saleEndsAt ? (
                        d.expired ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-zinc-100 text-zinc-500 rounded px-1.5 py-0.5">
                            <Clock className="w-3 h-3" /> منتهي
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
                            <Timer className="w-3 h-3" />
                            {new Date(d.saleEndsAt).toLocaleString('ar-EG', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">دائم</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditing(d)}
                          aria-label="تعديل"
                          title="تعديل العرض"
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(d)}
                          aria-label="إنهاء العرض"
                          title="إنهاء العرض"
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

      <p className="text-xs text-muted-foreground leading-5">
        العرض بمؤقّت يرجع لسعره الأصلي تلقائياً بعد انتهاء الوقت ويختفي من «عروض اليوم». المنتج ذو
        الأحجام: الخصم بيتطبق كنسبة على كل حجم، والإضافات بسعرها الكامل.
      </p>

      {addOpen && <OfferDialog mode="add" onClose={() => setAddOpen(false)} />}
      {editing && <OfferDialog mode="edit" product={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
        title="إنهاء العرض"
        message={
          confirmRemove ? `سيرجع سعر «${confirmRemove.nameAr}» لأصله ويختفي من عروض اليوم.` : ''
        }
        loading={removeMut.isPending}
        onConfirm={() => confirmRemove && removeMut.mutate(confirmRemove.id)}
      />
    </div>
  );
}

type Mode = 'add' | 'edit';
type DiscType = 'percent' | 'fixed';

function OfferDialog({
  mode,
  product,
  onClose,
}: {
  mode: Mode;
  product?: Row;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Row | null>(product ?? null);
  const [search, setSearch] = useState('');

  const hasVariants = !!picked?.hasVariants;

  // Seed the form from the product being edited.
  const [discType, setDiscType] = useState<DiscType>(() =>
    product?.salePrice != null && Number(product.salePrice) > 0 && !product?.hasVariants
      ? 'fixed'
      : 'percent',
  );
  const [pct, setPct] = useState(() =>
    product?.discount != null && Number(product.discount) > 0 ? String(product.discount) : '',
  );
  const [fixed, setFixed] = useState(() =>
    product?.salePrice != null && Number(product.salePrice) > 0 ? String(product.salePrice) : '',
  );
  const [timed, setTimed] = useState(!!product?.saleEndsAt);
  const [endsAt, setEndsAt] = useState(
    product?.saleEndsAt ? toLocalInput(String(product.saleEndsAt)) : '',
  );

  // Product search (add mode only).
  const { data: searchRes, isFetching } = useQuery({
    queryKey: ['admin', 'products', 'offer-search', search],
    queryFn: () => api.adminListProducts({ search, pageSize: 12 }),
    enabled: mode === 'add' && search.trim().length >= 2,
    staleTime: 30_000,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: Row[] = ((searchRes as any)?.items as Row[]) ?? [];

  // Fixed price makes no sense for a product with sizes (which size?) — force %.
  const effType: DiscType = hasVariants ? 'percent' : discType;

  const list = Number(picked?.price) || 0;
  const preview = useMemo(() => {
    if (!picked) return null;
    if (effType === 'percent') {
      const n = Number(pct);
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.round(list * (1 - Math.min(90, n) / 100) * 100) / 100;
    }
    const n = Number(fixed);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }, [picked, effType, pct, fixed, list]);

  const save = useMutation({
    mutationFn: () => {
      if (!picked) throw new Error('اختر منتجاً أولاً');
      const saleEndsAt = timed && endsAt ? new Date(endsAt).toISOString() : null;
      const patch: Record<string, unknown> =
        effType === 'percent'
          ? { discount: Number(pct) || 0, salePrice: null, saleEndsAt }
          : { salePrice: Number(fixed) || 0, discount: 0, saleEndsAt };
      return api.adminUpdateProduct(picked.id, patch);
    },
    onSuccess: () => {
      toast.success(mode === 'add' ? 'تم إضافة العرض' : 'تم حفظ العرض');
      qc.invalidateQueries({ queryKey: ['admin', 'deals'] });
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valueValid =
    effType === 'percent'
      ? Number(pct) > 0 && Number(pct) <= 90
      : Number(fixed) > 0 && Number(fixed) < list;
  const invalid = !picked || !valueValid || (timed && !endsAt) || save.isPending;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={mode === 'add' ? 'أضف عرض' : 'تعديل العرض'}
      size="md"
    >
      <div className="space-y-4">
        {/* Product picker (add mode) */}
        {mode === 'add' && !picked && (
          <Field label="اختر المنتج" required>
            <div className="relative">
              <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث باسم المنتج…"
                className="ps-9"
                autoFocus
              />
            </div>
            {search.trim().length >= 2 && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {isFetching && (
                  <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> جاري البحث…
                  </div>
                )}
                {!isFetching && results.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">لا توجد نتائج</div>
                )}
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setPicked(r)}
                    className="w-full flex items-center gap-2 p-2 hover:bg-muted/50 text-right"
                  >
                    {r.imageUrl || r.merchant?.logoUrl ? (
                      <img
                        src={r.imageUrl || r.merchant?.logoUrl}
                        alt=""
                        className="w-8 h-8 rounded object-cover border border-border"
                      />
                    ) : (
                      <span className="w-8 h-8 rounded bg-muted grid place-items-center text-muted-foreground/50">
                        <Package className="w-4 h-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{r.nameAr}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.merchant?.storeNameAr ?? '—'} · {formatMoney(Number(r.price) || 0)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}

        {picked && (
          <>
            {/* Chosen product */}
            <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-2">
              {picked.imageUrl || picked.merchant?.logoUrl ? (
                <img
                  src={picked.imageUrl || picked.merchant?.logoUrl}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover border border-border"
                />
              ) : (
                <span className="w-10 h-10 rounded-lg bg-muted grid place-items-center text-muted-foreground/50">
                  <Package className="w-4 h-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold truncate">{picked.nameAr}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {picked.merchant?.storeNameAr ?? '—'} · السعر {formatMoney(list)}
                  {hasVariants && ' · المنتج بأحجام'}
                </div>
              </div>
              {mode === 'add' && (
                <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
                  تغيير
                </Button>
              )}
            </div>

            {/* Discount type */}
            <Field label="نوع الخصم">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDiscType('percent')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-bold transition ${
                    effType === 'percent'
                      ? 'border-brand-red bg-brand-red/5 text-brand-red'
                      : 'border-input text-muted-foreground'
                  }`}
                >
                  نسبة %
                </button>
                <button
                  type="button"
                  disabled={hasVariants}
                  onClick={() => setDiscType('fixed')}
                  title={hasVariants ? 'المنتج بأحجام — استخدم النسبة' : undefined}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                    effType === 'fixed'
                      ? 'border-brand-red bg-brand-red/5 text-brand-red'
                      : 'border-input text-muted-foreground'
                  }`}
                >
                  سعر بعد الخصم
                </button>
              </div>
              {hasVariants && (
                <p className="text-xs text-amber-700 mt-1">
                  المنتج له أحجام — النسبة بتتطبق على كل حجم. السعر الثابت لا يصلح هنا.
                </p>
              )}
            </Field>

            {effType === 'percent' ? (
              <Field
                label="نسبة الخصم %"
                hint={preview != null ? `السعر بعد الخصم: ${formatMoney(preview)}` : 'من 1 إلى 90'}
                error={pct !== '' && !valueValid ? 'نسبة غير صالحة (1–90)' : undefined}
              >
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  placeholder="مثال: 20"
                  autoFocus={mode === 'edit'}
                />
              </Field>
            ) : (
              <Field
                label="السعر بعد الخصم"
                hint={`لازم يكون أقل من السعر الأصلي (${formatMoney(list)})`}
                error={fixed !== '' && !valueValid ? 'لازم يكون أقل من السعر الأصلي' : undefined}
              >
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={fixed}
                  onChange={(e) => setFixed(e.target.value)}
                  placeholder="مثال: 45"
                />
              </Field>
            )}

            {/* Timer */}
            <div className="rounded-lg border border-input p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={timed}
                  onChange={(e) => setTimed(e.target.checked)}
                />
                <Timer className="w-4 h-4 text-brand-red" />
                عرض مؤقّت (يرجع للسعر الأصلي بعد انتهاء الوقت)
              </label>
              {timed && (
                <Input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              )}
              {!timed && (
                <p className="text-xs text-muted-foreground">
                  بدون مؤقّت — العرض يفضل شغّال لحد ما تشيله بنفسك.
                </p>
              )}
            </div>
          </>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={() => save.mutate()} disabled={invalid}>
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'add' ? 'تفعيل العرض' : 'حفظ'}
          </Button>
          <Button variant="ghost" onClick={onClose} className="ms-auto">
            إلغاء
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
