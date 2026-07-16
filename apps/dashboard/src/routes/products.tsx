import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Box,
  CheckCircle2,
  Copy,
  Download,
  GripVertical,
  Image as ImageIcon,
  ImageOff,
  ImagePlus,
  Loader2,
  MoreVertical,
  Package,
  PackageX,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { StatCard } from '../components/ui/StatCard.js';
import { ErrorState } from '../components/ui/States.js';
import { api } from '../lib/api.js';
import { formatCount, formatMoney } from '../lib/format.js';
import type { Tone } from '../lib/statusRegistry.js';
import { TONE } from '../lib/statusRegistry.js';
import { uploadFile } from '../lib/uploadFile.js';

const LOW_STOCK = 5;

type StockState = 'in' | 'low' | 'out' | 'unknown';

function firstImage(p: Row): string | null {
  if (typeof p.imageUrl === 'string' && p.imageUrl) return p.imageUrl;
  const list = toImageList(p.imageUrls);
  return list[0] ?? null;
}

function stockState(p: Row): StockState {
  if (p.stock === null || p.stock === undefined) return 'unknown';
  const s = Number(p.stock);
  if (!Number.isFinite(s)) return 'unknown';
  if (s <= 0) return 'out';
  if (s <= LOW_STOCK) return 'low';
  return 'in';
}

const STOCK_META: Record<StockState, { label: string; tone: Tone }> = {
  in: { label: 'متوفر', tone: 'green' },
  low: { label: 'منخفض', tone: 'amber' },
  out: { label: 'نفد', tone: 'red' },
  unknown: { label: '—', tone: 'zinc' },
};

/** Soft pill for stock / status (reuses the design-system TONE map). */
function TonePill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${TONE[tone].badge}`}
    >
      {children}
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const MAX_IMAGES = 5;

/**
 * Coerce whatever `imageUrls` shape the API returned (legacy JSON, null,
 * already-array) into a clean string[] capped at MAX_IMAGES. The list view
 * + the form both read through here so a corrupt row can't blow up the UI.
 */
function toImageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .slice(0, MAX_IMAGES);
}

type StatusFilter = 'all' | 'available' | 'disabled';
type StockFilter = 'all' | 'in' | 'low' | 'out';
type ImageFilter = 'all' | 'with' | 'without';
type SortKey = 'name' | 'price' | 'stock' | null;

export function ProductsPage() {
  const qc = useQueryClient();
  // ── filters ──
  const [merchantFilter, setMerchantFilter] = useState('');
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState<StatusFilter>('all');
  const [stockF, setStockF] = useState<StockFilter>('all');
  const [imageF, setImageF] = useState<ImageFilter>('all');
  // ── table ──
  const [sortBy, setSortBy] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [dense, setDense] = useState(false);
  // ── selection + dialogs ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [confirmDel, setConfirmDel] = useState<Row | null>(null);
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const { data: merchants } = useQuery({
    queryKey: ['admin', 'merchants', 'all'],
    queryFn: () => api.adminListMerchants({ pageSize: 100 }),
  });
  const selectedMerchant = (merchants?.items as Row[] | undefined)?.find(
    (m) => m.id === merchantFilter,
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'products', merchantFilter, search],
    queryFn: () =>
      api.adminListProducts({
        pageSize: 200,
        ...(merchantFilter ? { merchantId: merchantFilter } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      }),
  });

  const all = (data?.items as Row[] | undefined) ?? [];

  const stats = useMemo(
    () => ({
      total: all.length,
      available: all.filter((p) => p.isAvailable).length,
      disabled: all.filter((p) => !p.isAvailable).length,
      out: all.filter((p) => stockState(p) === 'out').length,
      low: all.filter((p) => stockState(p) === 'low').length,
      noImage: all.filter((p) => !firstImage(p)).length,
    }),
    [all],
  );

  const filtered = useMemo(() => {
    let r = all;
    if (statusF !== 'all')
      r = r.filter((p) => (statusF === 'available' ? p.isAvailable : !p.isAvailable));
    if (stockF !== 'all') r = r.filter((p) => stockState(p) === stockF);
    if (imageF !== 'all')
      r = r.filter((p) => (imageF === 'with' ? !!firstImage(p) : !firstImage(p)));
    if (sortBy) {
      const dir = sortDir === 'asc' ? 1 : -1;
      r = [...r].sort((a, b) => {
        if (sortBy === 'name')
          return dir * String(a.nameAr ?? '').localeCompare(String(b.nameAr ?? ''), 'ar');
        if (sortBy === 'price') return dir * (Number(a.price || 0) - Number(b.price || 0));
        return dir * (Number(a.stock ?? -1) - Number(b.stock ?? -1));
      });
    }
    return r;
  }, [all, statusF, stockF, imageF, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const pageItems = filtered.slice((pageClamped - 1) * pageSize, pageClamped * pageSize);
  const from = filtered.length === 0 ? 0 : (pageClamped - 1) * pageSize + 1;
  const to = Math.min(pageClamped * pageSize, filtered.length);

  const anyFilter =
    statusF !== 'all' ||
    stockF !== 'all' ||
    imageF !== 'all' ||
    !!merchantFilter ||
    !!search.trim();
  const clearFilters = () => {
    setStatusF('all');
    setStockF('all');
    setImageF('all');
    setMerchantFilter('');
    setSearch('');
    setPage(1);
  };
  const resetPage = () => setPage(1);

  // ── mutations ──
  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: unknown }) => api.adminUpdateProduct(id, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'products'] }),
    onError: (err: Error) => toast.error(err.message),
  });
  const toggleAvail = (p: Row) => {
    updateMut.mutate({ id: p.id, data: { isAvailable: !p.isAvailable } });
    toast.success(!p.isAvailable ? 'تم تفعيل المنتج' : 'تم تعطيل المنتج');
  };
  const bulkMut = useMutation({
    mutationFn: ({ ids, isAvailable }: { ids: string[]; isAvailable: boolean }) =>
      api.adminBulkProductAvailability(ids, isAvailable),
    onSuccess: (_r, v) => {
      toast.success(v.isAvailable ? 'تم تفعيل المنتجات' : 'تم تعطيل المنتجات');
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.adminDeleteProduct(id),
    onSuccess: () => {
      toast.success('تم حذف المنتج');
      setConfirmDel(null);
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await api.adminDeleteProduct(id);
    },
    onSuccess: () => {
      toast.success('تم حذف المنتجات المحددة');
      setSelected(new Set());
      setConfirmBulkDel(false);
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const duplicateMut = useMutation({
    mutationFn: (p: Row) =>
      api.adminCreateProduct({
        merchantId: p.merchantId ?? p.merchant?.id,
        name: `${p.name ?? ''} (نسخة)`.trim(),
        nameAr: `${p.nameAr ?? ''} (نسخة)`.trim(),
        description: p.description ?? '',
        price: Number(p.price) || 0,
        imageUrls: toImageList(p.imageUrls),
        imageUrl: firstImage(p) ?? undefined,
        stock: p.stock ?? undefined,
        unit: p.unit ?? undefined,
      }),
    onSuccess: () => {
      toast.success('تم نسخ المنتج');
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── selection ──
  const pageIds = pageItems.map((p) => p.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;
  const toggleSel = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const toggleAllPage = () => {
    const next = new Set(selected);
    if (allPageSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    setSelected(next);
  };

  const exportCsv = (rows: Row[]) => {
    const head = ['الاسم', 'English', 'SKU', 'التاجر', 'السعر', 'المخزون', 'متاح'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((p) =>
      [
        p.nameAr,
        p.name,
        p.sku,
        p.merchant?.storeNameAr,
        p.price,
        p.stock,
        p.isAvailable ? 'نعم' : 'لا',
      ]
        .map(esc)
        .join(','),
    );
    const csv = '﻿' + [head.map(esc).join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `products-${rows.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setSort = (key: Exclude<SortKey, null>) => {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const cellPad = dense ? 'px-3 py-1.5' : 'px-3 py-3';

  return (
    <div className="space-y-4">
      <PageHeader
        title="إدارة المنتجات"
        subtitle={`${formatCount(all.length)} منتج${merchantFilter ? ' لهذا التاجر' : ''}`}
        icon={Package}
        actions={
          <>
            <Button
              variant="outline"
              size="md"
              onClick={() => exportCsv(filtered)}
              disabled={!filtered.length}
            >
              <Download className="w-4 h-4" />
              تصدير
            </Button>
            <Button size="md" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              إضافة منتج
            </Button>
          </>
        }
      />

      {/* ── Stat cards (clickable → filter) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="إجمالي المنتجات" value={formatCount(stats.total)} icon={Box} tone="zinc" />
        <button
          type="button"
          onClick={() => {
            setStatusF('available');
            setStockF('all');
            setImageF('all');
            resetPage();
          }}
          className="text-start"
        >
          <StatCard
            label="متاح"
            value={formatCount(stats.available)}
            icon={CheckCircle2}
            tone="green"
          />
        </button>
        <button
          type="button"
          onClick={() => {
            setStatusF('disabled');
            setStockF('all');
            setImageF('all');
            resetPage();
          }}
          className="text-start"
        >
          <StatCard label="معطّل" value={formatCount(stats.disabled)} icon={XCircle} tone="zinc" />
        </button>
        <button
          type="button"
          onClick={() => {
            setStockF('out');
            setStatusF('all');
            setImageF('all');
            resetPage();
          }}
          className="text-start"
        >
          <StatCard
            label="نفد المخزون"
            value={formatCount(stats.out)}
            icon={PackageX}
            tone="red"
            emphasis={stats.out > 0}
          />
        </button>
        <button
          type="button"
          onClick={() => {
            setStockF('low');
            setStatusF('all');
            setImageF('all');
            resetPage();
          }}
          className="text-start"
        >
          <StatCard
            label="مخزون منخفض"
            value={formatCount(stats.low)}
            icon={Package}
            tone="amber"
            emphasis={stats.low > 0}
          />
        </button>
        <button
          type="button"
          onClick={() => {
            setImageF('without');
            setStatusF('all');
            setStockF('all');
            resetPage();
          }}
          className="text-start"
        >
          <StatCard
            label="بدون صور"
            value={formatCount(stats.noImage)}
            icon={ImageOff}
            tone="purple"
          />
        </button>
      </div>

      {/* ── Toolbar: search + filters ── */}
      <div className="bg-card rounded-xl border border-border p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              placeholder="ابحث بالاسم أو الكود (SKU)…"
              className="w-full ps-9 pe-3 py-2 rounded-lg border border-input bg-popover text-sm outline-none focus:ring-2 focus:ring-brand-red/30"
            />
          </div>
          <select
            value={merchantFilter}
            onChange={(e) => {
              setMerchantFilter(e.target.value);
              resetPage();
            }}
            className="px-3 py-2 rounded-lg border border-input bg-popover text-sm min-w-[160px]"
          >
            <option value="">جميع التجار</option>
            {(merchants?.items as Row[] | undefined)?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.storeNameAr}
              </option>
            ))}
          </select>
          <Button variant="outline" size="md" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUpDown className="w-4 h-4" />
            )}
            تحديث
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterGroup
            label="الحالة"
            value={statusF}
            onChange={(v) => {
              setStatusF(v as StatusFilter);
              resetPage();
            }}
            options={[
              ['all', 'الكل'],
              ['available', 'متاح'],
              ['disabled', 'معطّل'],
            ]}
          />
          <FilterGroup
            label="المخزون"
            value={stockF}
            onChange={(v) => {
              setStockF(v as StockFilter);
              resetPage();
            }}
            options={[
              ['all', 'الكل'],
              ['in', 'متوفر'],
              ['low', 'منخفض'],
              ['out', 'نفد'],
            ]}
          />
          <FilterGroup
            label="الصورة"
            value={imageF}
            onChange={(v) => {
              setImageF(v as ImageFilter);
              resetPage();
            }}
            options={[
              ['all', 'الكل'],
              ['with', 'بصورة'],
              ['without', 'بدون'],
            ]}
          />
          {anyFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="ms-auto inline-flex items-center gap-1 text-xs font-bold text-brand-red hover:underline"
            >
              <X className="w-3.5 h-3.5" /> مسح الفلاتر
            </button>
          )}
        </div>
      </div>

      {selectedMerchant && (
        <MerchantMenuPanel key={selectedMerchant.id} merchant={selectedMerchant} />
      )}

      {/* ── Bulk actions bar (sticky) ── */}
      {someSelected && (
        <div className="sticky top-16 z-20 bg-brand-dark text-white rounded-xl shadow-lg px-4 py-2.5 flex flex-wrap items-center gap-2">
          <span className="font-bold text-sm">{formatCount(selected.size)} محدد</span>
          <div className="h-4 w-px bg-white/20 mx-1" />
          <button
            onClick={() => bulkMut.mutate({ ids: [...selected], isAvailable: true })}
            className="text-xs font-bold px-2 py-1 rounded hover:bg-white/10"
          >
            تفعيل
          </button>
          <button
            onClick={() => bulkMut.mutate({ ids: [...selected], isAvailable: false })}
            className="text-xs font-bold px-2 py-1 rounded hover:bg-white/10"
          >
            تعطيل
          </button>
          <button
            onClick={() => exportCsv(filtered.filter((p) => selected.has(p.id)))}
            className="text-xs font-bold px-2 py-1 rounded hover:bg-white/10 inline-flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            تصدير
          </button>
          <button
            onClick={() => setConfirmBulkDel(true)}
            className="text-xs font-bold px-2 py-1 rounded hover:bg-red-500/30 text-red-200 inline-flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            حذف
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ms-auto text-xs px-2 py-1 rounded hover:bg-white/10"
          >
            إلغاء التحديد
          </button>
        </div>
      )}

      {/* ── Content ── */}
      {isLoading ? (
        <div className="bg-card rounded-xl border border-border p-6">
          <TableSkeleton rows={8} cols={6} />
        </div>
      ) : isError ? (
        <div className="bg-card rounded-xl border border-border">
          <ErrorState onRetry={() => refetch()} />
        </div>
      ) : all.length === 0 ? (
        <div className="bg-card rounded-xl border border-border">
          <EmptyState
            icon={<Box className="w-10 h-10" />}
            title="لا توجد منتجات"
            description="ابدأ بإضافة أول منتج لهذا التاجر."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                إضافة منتج
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border">
          <EmptyState
            icon={<Search className="w-10 h-10" />}
            title="لا توجد نتائج مطابقة"
            description="جرّب تعديل البحث أو الفلاتر."
            action={
              <Button variant="outline" onClick={clearFilters}>
                مسح الفلاتر
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                  <tr className="text-right">
                    <th className={cellPad + ' w-8'}>
                      <input
                        type="checkbox"
                        className="accent-brand-red w-4 h-4"
                        checked={allPageSelected}
                        onChange={toggleAllPage}
                        aria-label="تحديد الكل"
                      />
                    </th>
                    <th className={cellPad + ' w-14'} />
                    <SortableTh
                      label="المنتج"
                      active={sortBy === 'name'}
                      dir={sortDir}
                      onClick={() => setSort('name')}
                      className={cellPad}
                    />
                    <th className={cellPad + ' font-bold'}>التاجر</th>
                    <SortableTh
                      label="السعر"
                      active={sortBy === 'price'}
                      dir={sortDir}
                      onClick={() => setSort('price')}
                      className={cellPad}
                    />
                    <SortableTh
                      label="المخزون"
                      active={sortBy === 'stock'}
                      dir={sortDir}
                      onClick={() => setSort('stock')}
                      className={cellPad}
                    />
                    <th className={cellPad + ' font-bold'}>الحالة</th>
                    <th className={cellPad + ' w-24'} />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((p) => {
                    const img = firstImage(p);
                    const ss = stockState(p);
                    return (
                      <tr
                        key={p.id}
                        className={`border-b border-border/50 hover:bg-muted/30 ${selected.has(p.id) ? 'bg-brand-red/5' : ''}`}
                      >
                        <td className={cellPad}>
                          <input
                            type="checkbox"
                            className="accent-brand-red w-4 h-4"
                            checked={selected.has(p.id)}
                            onChange={() => toggleSel(p.id)}
                          />
                        </td>
                        <td className={cellPad}>
                          <ProductThumb src={img} onClick={() => img && setPreview(img)} />
                        </td>
                        <td className={cellPad}>
                          <div className="font-bold text-foreground">{p.nameAr}</div>
                          <div className="text-xs text-muted-foreground" dir="ltr">
                            {p.name}
                          </div>
                          {p.sku && (
                            <div className="text-[10px] text-muted-foreground/70 font-mono">
                              SKU: {p.sku}
                            </div>
                          )}
                        </td>
                        <td className={cellPad + ' text-xs'}>{p.merchant?.storeNameAr ?? '—'}</td>
                        <td className={cellPad}>
                          <PriceEdit
                            value={Number(p.price) || 0}
                            onSave={(v) => updateMut.mutate({ id: p.id, data: { price: v } })}
                          />
                        </td>
                        <td className={cellPad}>
                          <StockEdit
                            value={p.stock}
                            state={ss}
                            onSave={(v) => updateMut.mutate({ id: p.id, data: { stock: v } })}
                          />
                        </td>
                        <td className={cellPad}>
                          <StatusToggle on={!!p.isAvailable} onChange={() => toggleAvail(p)} />
                        </td>
                        <td className={cellPad}>
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              type="button"
                              onClick={() => setEditing(p)}
                              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                              aria-label="تعديل"
                              title="تعديل"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <RowMenu
                              onDuplicate={() => duplicateMut.mutate(p)}
                              onDelete={() => setConfirmDel(p)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {pageItems.map((p) => {
              const img = firstImage(p);
              return (
                <div
                  key={p.id}
                  className={`bg-card rounded-xl border p-3 flex gap-3 ${selected.has(p.id) ? 'border-brand-red/40 bg-brand-red/5' : 'border-border'}`}
                >
                  <input
                    type="checkbox"
                    className="accent-brand-red w-4 h-4 mt-1"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSel(p.id)}
                  />
                  <ProductThumb src={img} onClick={() => img && setPreview(img)} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{p.nameAr}</div>
                    <div className="text-xs text-muted-foreground truncate" dir="ltr">
                      {p.name}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="font-black text-sm">{formatMoney(p.price)}</span>
                      <TonePill tone={STOCK_META[stockState(p)].tone}>
                        {stockState(p) === 'unknown'
                          ? '—'
                          : `${STOCK_META[stockState(p)].label}${p.stock != null ? ` (${formatCount(p.stock)})` : ''}`}
                      </TonePill>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {p.merchant?.storeNameAr ?? '—'}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusToggle on={!!p.isAvailable} onChange={() => toggleAvail(p)} />
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditing(p)}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDel(p)}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Pagination + density ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>
                عرض {formatCount(from)}–{formatCount(to)} من {formatCount(filtered.length)}
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  resetPage();
                }}
                className="px-2 py-1 rounded border border-input bg-popover text-xs"
              >
                {[20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}/صفحة
                  </option>
                ))}
              </select>
              <button
                onClick={() => setDense((d) => !d)}
                className="text-xs px-2 py-1 rounded border border-input hover:bg-muted"
              >
                {dense ? 'كثافة مريحة' : 'كثافة مضغوطة'}
              </button>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  disabled={pageClamped <= 1}
                  onClick={() => setPage(pageClamped - 1)}
                  className="px-3 py-1.5 rounded-lg border border-input disabled:opacity-40 hover:bg-muted"
                >
                  السابق
                </button>
                <span className="px-2 text-muted-foreground">
                  {formatCount(pageClamped)} / {formatCount(totalPages)}
                </span>
                <button
                  disabled={pageClamped >= totalPages}
                  onClick={() => setPage(pageClamped + 1)}
                  className="px-3 py-1.5 rounded-lg border border-input disabled:opacity-40 hover:bg-muted"
                >
                  التالي
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Dialogs ── */}
      {createOpen && (
        <ProductFormDialog
          mode="create"
          merchants={(merchants?.items as Row[]) ?? []}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {editing && (
        <ProductFormDialog
          mode="edit"
          product={editing}
          merchants={(merchants?.items as Row[]) ?? []}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title="حذف المنتج"
        message={confirmDel ? `سيتم حذف "${confirmDel.nameAr}" نهائياً. لا يمكن التراجع.` : ''}
        loading={deleteMut.isPending}
        onConfirm={() => confirmDel && deleteMut.mutate(confirmDel.id)}
      />
      <ConfirmDialog
        open={confirmBulkDel}
        onOpenChange={(o) => !o && setConfirmBulkDel(false)}
        title="حذف المنتجات المحددة"
        message={`سيتم حذف ${formatCount(selected.size)} منتج نهائياً. لا يمكن التراجع.`}
        loading={bulkDeleteMut.isPending}
        onConfirm={() => bulkDeleteMut.mutate([...selected])}
      />
      {preview && (
        <Dialog open onOpenChange={(o) => !o && setPreview(null)} size="lg">
          <img src={preview} alt="" className="w-full max-h-[75vh] object-contain rounded-lg" />
        </Dialog>
      )}
    </div>
  );
}

// ── Small building blocks ──

function FilterGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-xs font-bold text-muted-foreground">{label}:</span>
      <div className="inline-flex rounded-lg border border-border overflow-hidden">
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`px-2.5 py-1 text-xs font-bold transition ${value === v ? 'bg-brand-red text-white' : 'bg-card text-muted-foreground hover:bg-muted'}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={`${className} font-bold`}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
        )}
      </button>
    </th>
  );
}

function ProductThumb({ src, onClick }: { src: string | null; onClick?: () => void }) {
  if (!src) {
    return (
      <div className="w-11 h-11 rounded-lg bg-muted grid place-items-center text-muted-foreground/50 shrink-0">
        <ImageOff className="w-4 h-4" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-11 h-11 rounded-lg overflow-hidden border border-border shrink-0 hover:ring-2 hover:ring-brand-red/40"
    >
      <img src={src} alt="" className="w-full h-full object-cover" />
    </button>
  );
}

function StatusToggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      title={on ? 'متاح — اضغط للتعطيل' : 'معطّل — اضغط للتفعيل'}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${on ? 'bg-green-500' : 'bg-zinc-300'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${on ? 'translate-x-1' : 'translate-x-6'}`}
      />
    </button>
  );
}

function PriceEdit({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="number"
        defaultValue={value}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (v !== value) onSave(v);
        }}
        className="w-20 px-2 py-1 rounded border border-input bg-popover text-sm text-left"
        dir="ltr"
      />
      <span className="text-[10px] text-muted-foreground">ج.م</span>
    </div>
  );
}

function StockEdit({
  value,
  state,
  onSave,
}: {
  value: unknown;
  state: StockState;
  onSave: (v: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <input
        type="number"
        defaultValue={value == null ? '' : Number(value)}
        placeholder="—"
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (raw === '') return;
          const v = Number(raw);
          if (v !== Number(value)) onSave(v);
        }}
        className="w-16 px-2 py-1 rounded border border-input bg-popover text-sm text-center"
        dir="ltr"
      />
      {state !== 'unknown' && (
        <TonePill tone={STOCK_META[state].tone}>{STOCK_META[state].label}</TonePill>
      )}
    </div>
  );
}

function RowMenu({ onDuplicate, onDelete }: { onDuplicate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
        aria-label="المزيد"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute end-0 mt-1 z-40 w-40 bg-popover rounded-lg border border-border shadow-lg py-1 text-sm">
            <button
              onClick={() => {
                setOpen(false);
                onDuplicate();
              }}
              className="w-full text-start px-3 py-2 hover:bg-muted inline-flex items-center gap-2"
            >
              <Copy className="w-4 h-4" /> نسخ المنتج
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="w-full text-start px-3 py-2 hover:bg-destructive/10 text-destructive inline-flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> حذف
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Menu-image mode, surfaced on the products page. When a merchant is selected
 * in the filter, the admin can upload photo(s) of that merchant's paper menu
 * instead of entering products one by one. Saves to the merchant's menuImages.
 */
function MerchantMenuPanel({ merchant }: { merchant: Row }) {
  const qc = useQueryClient();
  const [images, setImages] = useState<string[]>(() => toImageList(merchant.menuImages));
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const save = useMutation({
    mutationFn: (next: string[]) => api.adminUpdateMerchant(merchant.id, { menuImages: next }),
    onSuccess: () => {
      toast.success('تم حفظ منيو المتجر');
      qc.invalidateQueries({ queryKey: ['admin', 'merchants'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const commit = (next: string[]) => {
    setImages(next);
    save.mutate(next);
  };

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = 8 - images.length;
    if (remaining <= 0) {
      toast.error('الحد الأقصى 8 صور');
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const results = await Promise.all(picked.map((f) => uploadFile(f)));
      commit([...images, ...results.map((r) => r.url)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل رفع الصورة');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const hasMenu = images.length > 0;

  return (
    <div
      className={`rounded-xl border p-4 md:p-5 ${
        hasMenu ? 'border-brand-red/30 bg-brand-red/5' : 'border-dashed border-border bg-muted/20'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand-red/10 text-brand-red shrink-0">
          <ImageIcon className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-brand-dark">منيو المتجر — {merchant.storeNameAr}</div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-5">
            {hasMenu
              ? 'هذا التاجر يعرض صورة منيو للعميل ويطلب منها مباشرة. (أي منتجات فردية بالأسفل تظهر كمان.)'
              : 'للتجار اللي بيبعتوا صورة منيو بدل إدخال منتج-منتج. ارفع صور المنيو هنا، أو استخدم الجدول بالأسفل لإضافة منتجات فردية.'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        {images.map((url, idx) => (
          <div
            key={`${url}-${idx}`}
            className="relative w-24 h-24 rounded-lg overflow-hidden border border-border group bg-white"
          >
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => commit(images.filter((_, i) => i !== idx))}
              disabled={save.isPending}
              className="absolute top-1 end-1 p-1 rounded-md bg-white/90 text-destructive opacity-0 group-hover:opacity-100 transition shadow disabled:opacity-50"
              aria-label="حذف"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {images.length < 8 && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || save.isPending}
            className="w-24 h-24 rounded-lg border-2 border-dashed border-border grid place-items-center text-muted-foreground hover:border-brand-red hover:text-brand-red transition disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span className="flex flex-col items-center gap-1">
                <ImagePlus className="w-5 h-5" />
                <span className="text-[10px] font-bold">رفع منيو</span>
              </span>
            )}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void pick(e.target.files)}
        />
      </div>

      {save.isPending && (
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> جارٍ الحفظ…
        </div>
      )}
    </div>
  );
}

interface ProductFormState {
  merchantId: string;
  name: string;
  nameAr: string;
  description: string;
  price: number;
  unit: string;
  sku: string;
  discount: string; // kept as string so the field can be empty
  availableFrom: string;
  availableTo: string;
  imageUrls: string[];
  isAvailable: boolean;
}

function initialFromProduct(product: Row | undefined, merchants: Row[]): ProductFormState {
  if (!product) {
    return {
      merchantId: merchants[0]?.id ?? '',
      name: '',
      nameAr: '',
      description: '',
      price: 0,
      unit: '',
      sku: '',
      discount: '',
      availableFrom: '',
      availableTo: '',
      imageUrls: [],
      isAvailable: true,
    };
  }
  // Legacy rows may only have `imageUrl` (singular). Hoist it into the gallery
  // so the admin can drag/reorder it like any other image.
  const gallery = toImageList(product.imageUrls);
  if (gallery.length === 0 && typeof product.imageUrl === 'string' && product.imageUrl) {
    gallery.push(product.imageUrl);
  }
  return {
    merchantId: product.merchantId ?? merchants[0]?.id ?? '',
    name: product.name ?? '',
    nameAr: product.nameAr ?? '',
    description: product.description ?? '',
    price: Number(product.price ?? 0),
    unit: product.unit ?? '',
    sku: product.sku ?? '',
    discount: product.discount == null ? '' : String(product.discount),
    availableFrom: product.availableFrom ?? '',
    availableTo: product.availableTo ?? '',
    imageUrls: gallery,
    isAvailable: product.isAvailable ?? true,
  };
}

interface ProductFormDialogProps {
  mode: 'create' | 'edit';
  product?: Row;
  merchants: Row[];
  onClose: () => void;
}

function ProductFormDialog({ mode, product, merchants, onClose }: ProductFormDialogProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ProductFormState>(() => initialFromProduct(product, merchants));

  // Submit-time payload: strip empty optionals so the backend treats them as
  // "not set" instead of validating them as malformed strings.
  const payload = useMemo(() => {
    const out: Record<string, unknown> = {
      merchantId: form.merchantId,
      name: form.name.trim(),
      nameAr: form.nameAr.trim(),
      price: Number(form.price) || 0,
      isAvailable: form.isAvailable,
      imageUrls: form.imageUrls,
      // First image becomes the legacy `imageUrl` so older surfaces (cart
      // thumbnails, mobile detail screen) keep rendering without a migration.
      imageUrl: form.imageUrls[0],
    };
    if (form.description.trim()) out.description = form.description.trim();
    if (form.unit.trim()) out.unit = form.unit.trim();
    if (form.sku.trim()) out.sku = form.sku.trim();
    if (form.discount !== '') {
      const n = Number(form.discount);
      if (Number.isFinite(n)) out.discount = n;
    }
    if (form.availableFrom) out.availableFrom = form.availableFrom;
    if (form.availableTo) out.availableTo = form.availableTo;
    return out;
  }, [form]);

  const mut = useMutation({
    mutationFn: async () => {
      if (mode === 'create') return api.adminCreateProduct(payload);
      // Don't send merchantId on edit — backend update schema strips it anyway,
      // but being explicit avoids confusing 400s if the schema ever changes.
      const { merchantId: _omit, ...patch } = payload;
      void _omit;
      return api.adminUpdateProduct(product!.id, patch);
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? 'تم إنشاء المنتج' : 'تم حفظ التغييرات');
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Soft client-side guard: prevent saving a window where end < start so the
  // admin gets immediate feedback instead of a confused 400 from Prisma.
  const windowError = useMemo(() => {
    if (form.availableFrom && form.availableTo && form.availableTo <= form.availableFrom) {
      return 'وقت النهاية يجب أن يكون بعد وقت البداية';
    }
    return null;
  }, [form.availableFrom, form.availableTo]);

  const discountNum = form.discount === '' ? 0 : Number(form.discount);
  const afterDiscount =
    Number.isFinite(discountNum) && discountNum > 0
      ? Number(form.price) * (1 - discountNum / 100)
      : null;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={mode === 'create' ? 'منتج جديد' : 'تعديل المنتج'}
      size="lg"
    >
      <div className="space-y-3">
        <Field label="التاجر" required>
          <select
            value={form.merchantId}
            onChange={(e) => setForm({ ...form, merchantId: e.target.value })}
            disabled={mode === 'edit'}
            className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm disabled:bg-muted"
          >
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.storeNameAr}
              </option>
            ))}
          </select>
        </Field>

        <ImageGalleryField
          value={form.imageUrls}
          onChange={(imageUrls) => setForm({ ...form, imageUrls })}
        />

        <Field label="الاسم (ع)" required>
          <Input
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
          />
        </Field>
        <Field label="الاسم (En)" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            dir="ltr"
          />
        </Field>
        <Field label="الوصف">
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder="مكونات، حجم العبوة، تفاصيل إضافية..."
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="السعر" required>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            />
          </Field>
          <Field label="الوحدة">
            <Input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="كيلو / علبة / حبة..."
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="نسبة الخصم %"
            hint={
              afterDiscount !== null
                ? `بعد الخصم: ${afterDiscount.toFixed(2)}`
                : 'اختياري — من 0 إلى 90'
            }
          >
            <Input
              type="number"
              min={0}
              max={90}
              step="1"
              value={form.discount}
              onChange={(e) => setForm({ ...form, discount: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="SKU" hint="اختياري — يستخدم للمزامنة مع API التاجر">
            <Input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              dir="ltr"
              placeholder="مثال: MILK-1L"
            />
          </Field>
        </div>

        <Field
          label="ساعات الإتاحة (يومياً)"
          hint="اتركها فارغة لتكون متاح دائماً"
          error={windowError ?? undefined}
        >
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="time"
              value={form.availableFrom}
              onChange={(e) => setForm({ ...form, availableFrom: e.target.value })}
              aria-label="من"
            />
            <Input
              type="time"
              value={form.availableTo}
              onChange={(e) => setForm({ ...form, availableTo: e.target.value })}
              aria-label="إلى"
            />
          </div>
        </Field>

        <label className="flex items-center gap-2 text-sm font-bold pt-1">
          <input
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
          />
          متاح للطلب
        </label>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button
          onClick={() => mut.mutate()}
          disabled={
            mut.isPending || !!windowError || !form.merchantId || !form.nameAr || !form.name
          }
        >
          {mode === 'create' ? 'إضافة' : 'حفظ'}
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Up to MAX_IMAGES image URLs with upload + reorder + remove. Reorder uses the
 * native HTML5 drag-and-drop API with a small grip handle so the row itself
 * stays clickable for image preview.
 */
function ImageGalleryField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dragIndex = useRef<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const handlePick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - value.length;
    if (remaining <= 0) {
      toast.error(`الحد الأقصى ${MAX_IMAGES} صور`);
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const results = await Promise.all(picked.map((f) => uploadFile(f)));
      onChange([...value, ...results.map((r) => r.url)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل رفع الصورة');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= value.length) return;
    const next = value.slice();
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <Field
      label={`الصور (حتى ${MAX_IMAGES})`}
      hint="أول صورة هي الصورة الرئيسية. اسحب المقبض لإعادة الترتيب."
    >
      <div className="space-y-2">
        {value.length > 0 && (
          <ul className="space-y-2">
            {value.map((url, idx) => (
              <li
                key={`${url}-${idx}`}
                draggable
                onDragStart={() => {
                  dragIndex.current = idx;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragIndex.current;
                  dragIndex.current = null;
                  if (from !== null) move(from, idx);
                }}
                className="flex items-center gap-2 p-2 rounded-lg border border-border bg-white"
              >
                <button
                  type="button"
                  className="p-1 text-muted-foreground cursor-grab active:cursor-grabbing"
                  aria-label="إعادة ترتيب"
                  // Mouse-down on the handle is enough; HTML5 drag is started
                  // by the parent <li draggable> being grabbed from this child.
                >
                  <GripVertical className="w-4 h-4" />
                </button>
                <img
                  src={url}
                  alt=""
                  className="w-12 h-12 object-cover rounded-md border border-border"
                />
                <div className="flex-1 min-w-0 text-xs text-muted-foreground truncate" dir="ltr">
                  {url}
                </div>
                {idx === 0 && <Badge variant="success">رئيسية</Badge>}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, i) => i !== idx))}
                  className="p-1.5 rounded-md text-destructive hover:bg-destructive/10"
                  aria-label="حذف الصورة"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void handlePick(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading || value.length >= MAX_IMAGES}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImagePlus className="w-4 h-4" />
            )}
            {uploading ? 'جارٍ الرفع...' : 'رفع صورة'}
          </Button>
          <span className="text-xs text-muted-foreground">
            {value.length}/{MAX_IMAGES}
          </span>
        </div>
      </div>
    </Field>
  );
}
