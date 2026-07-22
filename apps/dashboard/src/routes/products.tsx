import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Box,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  FileUp,
  GripVertical,
  HelpCircle,
  History,
  Image as ImageIcon,
  ImageOff,
  ImagePlus,
  LayoutGrid,
  List,
  Loader2,
  MoreVertical,
  Package,
  PackageX,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { Dialog, Drawer } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { ProductHistoryDrawer } from '../components/ProductHistoryDrawer.js';
import { ProductOptionsPanel } from '../components/ProductOptionsPanel.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Pagination } from '../components/ui/Pagination.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { StatCard } from '../components/ui/StatCard.js';
import { ErrorState } from '../components/ui/States.js';
import { api } from '../lib/api.js';
import { formatCount, formatMoney } from '../lib/format.js';
import { useListState } from '../lib/useListQuery.js';
import type { ParsedSheet } from '../lib/productsSheet.js';
import {
  buildArchiveWorkbook,
  buildErrorCsv,
  buildImportWorkbook,
  downloadBlob,
  readProductsFile,
} from '../lib/productsSheet.js';
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
type ViewMode = 'table' | 'grid';

const VIEW_KEY = 'tamem-products-view';

/** Table vs grid is a per-admin habit — remember it across sessions. */
function readView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'table';
  } catch {
    return 'table';
  }
}

export function ProductsPage() {
  const qc = useQueryClient();
  // ── filters + paging live in the URL ──
  // Every filter, the page and the sort are query params, so opening a product
  // and pressing back restores the exact view (and the view is shareable). The
  // search box is debounced before it reaches the query key, and ALL filtering /
  // sorting / paging now happens in SQL — this page used to pull 200 rows and
  // filter them in the browser, which silently hid everything past row 200.
  const ls = useListState(['merchantId', 'status', 'stock', 'image', 'sortBy', 'sortDir'], 50);
  const merchantFilter = ls.get('merchantId');
  const setMerchantFilter = (v: string) => ls.set('merchantId', v);
  const search = ls.search;
  const setSearch = ls.setSearch;
  const statusF = (ls.get('status') || 'all') as StatusFilter;
  const setStatusF = (v: StatusFilter) => ls.set('status', v === 'all' ? '' : v);
  const stockF = (ls.get('stock') || 'all') as StockFilter;
  const setStockF = (v: StockFilter) => ls.set('stock', v === 'all' ? '' : v);
  const imageF = (ls.get('image') || 'all') as ImageFilter;
  const setImageF = (v: ImageFilter) => ls.set('image', v === 'all' ? '' : v);
  const sortBy = (ls.get('sortBy') || null) as SortKey;
  const sortDir: 'asc' | 'desc' = ls.get('sortDir') === 'desc' ? 'desc' : 'asc';
  const setSortBy = (v: SortKey) => ls.set('sortBy', v ?? '');
  const setSortDir = (v: 'asc' | 'desc') => ls.set('sortDir', v);
  const page = ls.page;
  const setPage = ls.setPage;
  const pageSize = ls.pageSize;
  const setPageSize = ls.setPageSize;
  // ── table ──
  const [dense, setDense] = useState(false);
  const [view, setView] = useState<ViewMode>(readView);
  // ── selection + dialogs ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [quickEdit, setQuickEdit] = useState<Row | null>(null);
  const [historyFor, setHistoryFor] = useState<Row | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Row | null>(null);
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const changeView = (v: ViewMode) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode — keep the in-memory choice */
    }
  };

  const { data: merchants } = useQuery({
    queryKey: ['admin', 'merchants', 'all'],
    queryFn: () => api.adminListMerchants({ pageSize: 100 }),
  });
  const selectedMerchant = (merchants?.items as Row[] | undefined)?.find(
    (m) => m.id === merchantFilter,
  );

  // Filters that the SQL understands. Kept in one object so the query key and
  // the export-all walker always agree on what "the current view" means.
  const queryFilters = useMemo(
    () => ({
      ...(merchantFilter ? { merchantId: merchantFilter } : {}),
      ...(ls.debouncedSearch.trim() ? { search: ls.debouncedSearch.trim() } : {}),
      ...(statusF !== 'all' ? { isAvailable: statusF === 'available' } : {}),
      ...(stockF !== 'all' ? { stock: stockF } : {}),
      ...(imageF !== 'all' ? { hasImage: imageF === 'with' ? 'yes' : 'no' } : {}),
      ...(sortBy ? { sortBy, sortDir } : {}),
    }),
    [merchantFilter, ls.debouncedSearch, statusF, stockF, imageF, sortBy, sortDir],
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'products', { ...queryFilters, page, pageSize }],
    queryFn: () => api.adminListProducts({ ...queryFilters, page, pageSize }),
    // Keep the previous page on screen while the next one loads — no flash of
    // skeleton on every page change.
    placeholderData: (prev) => prev,
  });

  // Stat cards come from a SQL aggregate over the whole filtered set, so they
  // stay correct no matter which page is open (they used to count only the rows
  // that happened to be loaded).
  const { data: statsData } = useQuery({
    queryKey: ['admin', 'products', 'stats', merchantFilter, ls.debouncedSearch],
    queryFn: () =>
      api.adminProductStats({
        ...(merchantFilter ? { merchantId: merchantFilter } : {}),
        ...(ls.debouncedSearch.trim() ? { search: ls.debouncedSearch.trim() } : {}),
      }) as Promise<Row>,
    staleTime: 30_000,
  });
  const stats = {
    total: Number(statsData?.total ?? 0),
    available: Number(statsData?.available ?? 0),
    disabled: Number(statsData?.disabled ?? 0),
    out: Number(statsData?.out ?? 0),
    low: Number(statsData?.low ?? 0),
    noImage: Number(statsData?.noImage ?? 0),
  };

  const pageItems = (data?.items as Row[] | undefined) ?? [];
  const total = data?.pagination.total ?? 0;
  // Legacy alias: the JSX below uses `filtered` for "rows on screen".
  const filtered = pageItems;

  /** Walk every page of the CURRENT filter set — used by export so it always
   *  covers the whole result, not just the page being viewed. */
  const fetchAllMatching = async (): Promise<Row[]> => {
    const out: Row[] = [];
    for (let p = 1; p <= 100; p++) {
      const r = await api.adminListProducts({ ...queryFilters, page: p, pageSize: 200 });
      out.push(...((r.items as Row[]) ?? []));
      if (!r.items.length || p >= (r.pagination?.totalPages ?? 1)) break;
    }
    return out;
  };

  const anyFilter =
    statusF !== 'all' ||
    stockF !== 'all' ||
    imageF !== 'all' ||
    !!merchantFilter ||
    !!search.trim();
  const clearFilters = () => {
    // Single navigation — calling the setters one by one clobbers each other
    // (react-router doesn't chain sequential setSearchParams). `reset()` clears
    // search + every registered filter key + the page in one go.
    setSearch('');
    ls.reset();
  };

  // ── mutations ──
  /**
   * Patch one row inside every cached products page instead of refetching the
   * whole list. Toggling availability on row 3 used to re-request the entire
   * page (and the stats) — now the cached row is updated in place and nothing
   * goes over the wire.
   */
  const patchCachedProduct = (id: string, changes: Record<string, unknown>) => {
    qc.setQueriesData({ queryKey: ['admin', 'products'] }, (old: unknown) => {
      const o = old as { items?: Row[] } | undefined;
      if (!o?.items) return old;
      let hit = false;
      const items = o.items.map((it) => {
        if (it?.id !== id) return it;
        hit = true;
        return { ...it, ...changes };
      });
      return hit ? { ...o, items } : old;
    });
  };

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: unknown }) => api.adminUpdateProduct(id, d),
    // Optimistic single-row patch; only the stat cards are refreshed, because
    // availability/stock counts change and they're a tiny aggregate call.
    onMutate: ({ id, data: d }) => patchCachedProduct(id, d as Record<string, unknown>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'products', 'stats'] }),
    onError: (err: Error) => {
      toast.error(err.message);
      qc.invalidateQueries({ queryKey: ['admin', 'products'] }); // resync after a failed patch
    },
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

  /** Export always goes through the dialog — the file's shape depends on what
   *  the admin plans to do with it, which only they know. */
  const [exportRows, setExportRows] = useState<Row[] | null>(null);

  const setSort = (key: Exclude<SortKey, null>) => {
    if (sortBy === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
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
        subtitle={`${formatCount(total)} منتج${merchantFilter ? ' لهذا التاجر' : ''}`}
        icon={Package}
        actions={
          <>
            <Button variant="outline" size="md" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4" />
              استيراد
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={async () => setExportRows(await fetchAllMatching())}
              disabled={total === 0}
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
          onClick={() => ls.setMany({ status: 'available', stock: '', image: '' })}
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
          onClick={() => ls.setMany({ status: 'disabled', stock: '', image: '' })}
          className="text-start"
        >
          <StatCard label="معطّل" value={formatCount(stats.disabled)} icon={XCircle} tone="zinc" />
        </button>
        <button
          type="button"
          onClick={() => ls.setMany({ stock: 'out', status: '', image: '' })}
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
          onClick={() => ls.setMany({ stock: 'low', status: '', image: '' })}
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
          onClick={() => ls.setMany({ image: 'without', status: '', stock: '' })}
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
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الكود (SKU)…"
              className="w-full ps-9 pe-3 py-2 rounded-lg border border-input bg-popover text-sm outline-none focus:ring-2 focus:ring-brand-red/30"
            />
          </div>
          <select
            value={merchantFilter}
            onChange={(e) => setMerchantFilter(e.target.value)}
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
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => changeView('table')}
              title="عرض جدول"
              aria-pressed={view === 'table'}
              className={`p-2 transition ${view === 'table' ? 'bg-brand-red text-white' : 'bg-card text-muted-foreground hover:bg-muted'}`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => changeView('grid')}
              title="عرض بطاقات"
              aria-pressed={view === 'grid'}
              className={`p-2 transition ${view === 'grid' ? 'bg-brand-red text-white' : 'bg-card text-muted-foreground hover:bg-muted'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterGroup
            label="الحالة"
            value={statusF}
            onChange={(v) => setStatusF(v as StatusFilter)}
            options={[
              ['all', 'الكل'],
              ['available', 'متاح'],
              ['disabled', 'معطّل'],
            ]}
          />
          <FilterGroup
            label="المخزون"
            value={stockF}
            onChange={(v) => setStockF(v as StockFilter)}
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
            onChange={(v) => setImageF(v as ImageFilter)}
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
            onClick={() => setExportRows(filtered.filter((p) => selected.has(p.id)))}
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
      ) : total === 0 ? (
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
          {view === 'grid' ? (
            <ProductGrid
              items={pageItems}
              selected={selected}
              onToggleSel={toggleSel}
              onPreview={setPreview}
              onQuickEdit={setQuickEdit}
              onToggleAvail={toggleAvail}
              onDelete={setConfirmDel}
            />
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
                            <td className={cellPad + ' text-xs'}>
                              {p.merchant?.storeNameAr ?? '—'}
                            </td>
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
                                  onClick={() => setQuickEdit(p)}
                                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                                  aria-label="تعديل سريع"
                                  title="تعديل سريع"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <RowMenu
                                  onDuplicate={() => duplicateMut.mutate(p)}
                                  onHistory={() => setHistoryFor(p)}
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
                            onClick={() => setQuickEdit(p)}
                            aria-label="تعديل سريع"
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
            </>
          )}

          {/* ── Pagination (server-side) + density ── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {view === 'table' && (
              <button
                onClick={() => setDense((d) => !d)}
                className="text-xs px-2 py-1 rounded border border-input hover:bg-muted"
              >
                {dense ? 'كثافة مريحة' : 'كثافة مضغوطة'}
              </button>
            )}
            <div className="flex-1 min-w-[280px]">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                disabled={isFetching}
              />
            </div>
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
      {quickEdit && (
        <QuickEditDrawer
          key={quickEdit.id}
          product={quickEdit}
          onClose={() => setQuickEdit(null)}
          onFullEdit={() => {
            const p = quickEdit;
            setQuickEdit(null);
            setEditing(p);
          }}
          onPreview={setPreview}
        />
      )}
      {historyFor && (
        <ProductHistoryDrawer
          key={historyFor.id}
          product={historyFor}
          onClose={() => setHistoryFor(null)}
        />
      )}
      {importOpen && (
        <ImportDialog
          merchants={(merchants?.items as Row[]) ?? []}
          products={filtered}
          defaultMerchantId={merchantFilter}
          onClose={() => setImportOpen(false)}
        />
      )}
      {exportRows && (
        <ExportDialog
          products={exportRows}
          merchantNames={((merchants?.items as Row[]) ?? []).map((m) =>
            String(m.storeNameAr ?? ''),
          )}
          onClose={() => setExportRows(null)}
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
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
      />
    </button>
  );
}

/**
 * Availability switch. The knob is placed with the logical `start` offset, not
 * translate-x: transforms are physical, so under the dashboard's dir="rtl" a
 * translated knob slides straight out of its track.
 */
function StatusToggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      title={on ? 'متاح — اضغط للتعطيل' : 'معطّل — اضغط للتفعيل'}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 focus-visible:ring-offset-2 ${
        on ? 'bg-green-500 hover:bg-green-600' : 'bg-zinc-300 hover:bg-zinc-400'
      }`}
    >
      <span
        className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-[inset-inline-start] duration-200 ${
          on ? 'start-[22px]' : 'start-0.5'
        }`}
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

function RowMenu({
  onDuplicate,
  onHistory,
  onDelete,
}: {
  onDuplicate: () => void;
  onHistory: () => void;
  onDelete: () => void;
}) {
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
                onHistory();
              }}
              className="w-full text-start px-3 py-2 hover:bg-muted inline-flex items-center gap-2"
            >
              <History className="w-4 h-4" /> سجل التغييرات
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

/** Card view — image-first, for scanning a catalogue visually. */
function ProductGrid({
  items,
  selected,
  onToggleSel,
  onPreview,
  onQuickEdit,
  onToggleAvail,
  onDelete,
}: {
  items: Row[];
  selected: Set<string>;
  onToggleSel: (id: string) => void;
  onPreview: (url: string) => void;
  onQuickEdit: (p: Row) => void;
  onToggleAvail: (p: Row) => void;
  onDelete: (p: Row) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {items.map((p) => {
        const img = firstImage(p);
        const ss = stockState(p);
        const isSel = selected.has(p.id);
        return (
          <div
            key={p.id}
            className={`bg-card rounded-xl border overflow-hidden transition hover:shadow-md ${
              isSel ? 'border-brand-red ring-1 ring-brand-red/30' : 'border-border'
            } ${p.isAvailable ? '' : 'opacity-70'}`}
          >
            <div className="relative aspect-square bg-muted">
              {img ? (
                <button
                  type="button"
                  onClick={() => onPreview(img)}
                  className="w-full h-full"
                  aria-label="معاينة الصورة"
                >
                  <img
                    src={img}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </button>
              ) : (
                <div className="w-full h-full grid place-items-center text-muted-foreground/40">
                  <ImageOff className="w-8 h-8" />
                </div>
              )}
              <input
                type="checkbox"
                checked={isSel}
                onChange={() => onToggleSel(p.id)}
                aria-label={`تحديد ${p.nameAr ?? ''}`}
                className="absolute top-2 start-2 accent-brand-red w-4 h-4"
              />
              {!p.isAvailable && (
                <span className="absolute top-2 end-2 px-2 py-0.5 rounded-full bg-zinc-900/75 text-white text-[10px] font-bold">
                  معطّل
                </span>
              )}
            </div>
            <div className="p-2.5 space-y-1.5">
              <div className="font-bold text-sm truncate" title={p.nameAr}>
                {p.nameAr}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {p.merchant?.storeNameAr ?? '—'}
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="font-black text-sm">{formatMoney(p.price)}</span>
                <TonePill tone={STOCK_META[ss].tone}>
                  {ss === 'unknown'
                    ? '—'
                    : `${STOCK_META[ss].label}${p.stock != null ? ` (${formatCount(p.stock)})` : ''}`}
                </TonePill>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-border/60">
                <StatusToggle on={!!p.isAvailable} onChange={() => onToggleAvail(p)} />
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => onQuickEdit(p)}
                    aria-label="تعديل سريع"
                    title="تعديل سريع"
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(p)}
                    aria-label="حذف"
                    title="حذف"
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Side panel for the edits that happen all day (price, stock, name, status).
 * Only changed fields are sent, so a no-op save doesn't touch the row. Moving
 * a merchant / editing images stays in the full form.
 */
function QuickEditDrawer({
  product,
  onClose,
  onFullEdit,
  onPreview,
}: {
  product: Row;
  onClose: () => void;
  onFullEdit: () => void;
  onPreview: (url: string) => void;
}) {
  const qc = useQueryClient();
  const [nameAr, setNameAr] = useState(String(product.nameAr ?? ''));
  const [name, setName] = useState(String(product.name ?? ''));
  const [price, setPrice] = useState(String(Number(product.price) || 0));
  const [stock, setStock] = useState(product.stock == null ? '' : String(product.stock));
  const [isAvailable, setIsAvailable] = useState(!!product.isAvailable);
  const img = firstImage(product);

  const save = useMutation({
    mutationFn: () => {
      const data: Record<string, unknown> = {};
      if (nameAr.trim() !== String(product.nameAr ?? '')) data.nameAr = nameAr.trim();
      if (name.trim() !== String(product.name ?? '')) data.name = name.trim();
      const pNum = Number(price);
      if (Number.isFinite(pNum) && pNum !== (Number(product.price) || 0)) data.price = pNum;
      const sRaw = stock.trim();
      const sWas = product.stock == null ? '' : String(product.stock);
      if (sRaw !== sWas && sRaw !== '' && Number.isFinite(Number(sRaw))) data.stock = Number(sRaw);
      if (isAvailable !== !!product.isAvailable) data.isAvailable = isAvailable;
      if (Object.keys(data).length === 0) return Promise.resolve(null);
      return api.adminUpdateProduct(product.id, data);
    },
    onSuccess: (r) => {
      toast.success(r ? 'تم حفظ التعديلات' : 'لا يوجد تغيير');
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const invalid = !nameAr.trim() || !Number.isFinite(Number(price)) || Number(price) < 0;

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="تعديل سريع"
      description={product.merchant?.storeNameAr ?? undefined}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <ProductThumb src={img} onClick={() => img && onPreview(img)} />
          <p className="text-xs text-muted-foreground leading-5">
            {img
              ? 'اضغط الصورة للمعاينة. لتغيير الصور استخدم «تعديل كامل».'
              : 'لا توجد صورة — أضفها من «تعديل كامل».'}
          </p>
        </div>

        <Field label="الاسم بالعربية" required>
          <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        </Field>
        <Field label="الاسم بالإنجليزية">
          <Input value={name} onChange={(e) => setName(e.target.value)} dir="ltr" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="السعر (ج.م)" required>
            <Input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              dir="ltr"
            />
          </Field>
          <Field label="المخزون" hint="اتركه فارغاً لو غير محدد">
            <Input
              type="number"
              min="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="—"
              dir="ltr"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <div className="font-bold text-sm">الحالة</div>
            <div className="text-xs text-muted-foreground">
              {isAvailable ? 'متاح للعملاء' : 'مخفي عن العملاء'}
            </div>
          </div>
          <StatusToggle on={isAvailable} onChange={() => setIsAvailable((v) => !v)} />
        </div>

        <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground leading-5">
          التاجر:{' '}
          <span className="font-bold text-foreground">{product.merchant?.storeNameAr ?? '—'}</span>{' '}
          — لنقل المنتج لتاجر آخر أو تعديل الوصف والصور استخدم «تعديل كامل».
        </p>

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={() => save.mutate()} disabled={save.isPending || invalid}>
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            حفظ
          </Button>
          <Button variant="outline" onClick={onFullEdit}>
            <Pencil className="w-4 h-4" />
            تعديل كامل
          </Button>
          <Button variant="ghost" onClick={onClose} className="ms-auto">
            إلغاء
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

// ── Export / import ──

/**
 * Two very different jobs sit behind one "export" button: keeping a readable
 * copy, or producing a file the admin edits and uploads back. Only the second
 * may carry the product id, so the choice is asked rather than guessed.
 */
function ExportDialog({
  products,
  merchantNames,
  onClose,
}: {
  products: Row[];
  merchantNames: string[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'archive' | 'reimport'>('archive');
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      if (mode === 'archive') {
        downloadBlob(await buildArchiveWorkbook(products), 'تميم-المنتجات.xlsx');
      } else {
        downloadBlob(
          await buildImportWorkbook({ mode: 'data', withId: true, products, merchantNames }),
          'تميم-المنتجات-للتعديل.xlsx',
        );
      }
      toast.success(`تم تصدير ${formatCount(products.length)} منتج`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل التصدير');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="تصدير المنتجات"
      description="اختر طريقة استخدام الملف بعد تنزيله."
      size="lg"
    >
      <div className="space-y-3">
        <ChoiceCard
          checked={mode === 'archive'}
          onSelect={() => setMode('archive')}
          icon={<Archive className="w-5 h-5" />}
          title="تصدير عادي للاحتفاظ بالبيانات"
          desc="للمراجعة أو الأرشفة. أعمدة واضحة للقراءة بدون حقول تقنية داخلية."
        />
        <ChoiceCard
          checked={mode === 'reimport'}
          onSelect={() => setMode('reimport')}
          icon={<FileUp className="w-5 h-5" />}
          title="تصدير للتعديل وإعادة الاستيراد"
          desc="نزّل المنتجات، عدّلها في Excel، ثم ارفع الملف مرة أخرى لتحديث المنتجات الحالية."
        />

        {mode === 'reimport' && (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 leading-5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              سيتم تضمين المعرّف الفريد لكل منتج لضمان تحديث المنتجات الحالية عند إعادة استيراد
              الملف. <b>لا تقم بحذف أو تعديل هذا العمود.</b> (العمود مقفول داخل الملف.)
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setHelp((h) => !h)}
          className="inline-flex items-center gap-1 text-xs font-bold text-brand-red hover:underline"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          ما الفرق بين النوعين؟
        </button>
        {help && (
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground leading-6 space-y-1">
            <div>
              • <b className="text-foreground">التصدير العادي</b> مناسب للحفظ والمراجعة — لا يُستخدم
              لتحديث البيانات مرة أخرى.
            </div>
            <div>
              • <b className="text-foreground">التصدير المتوافق مع الاستيراد</b> مناسب للتعديل
              الجماعي وتحديث المنتجات الحالية، وأعمدته وترتيبها مطابقة تماماً لشاشة الاستيراد.
            </div>
          </div>
        )}

        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          هيتم تصدير <b>{formatCount(products.length)}</b> منتج (حسب الفلاتر الحالية).
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={() => void run()} disabled={busy || !products.length}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            تنزيل الملف
          </Button>
          <Button variant="ghost" onClick={onClose} className="ms-auto">
            إلغاء
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ChoiceCard({
  checked,
  onSelect,
  icon,
  title,
  desc,
}: {
  checked: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`w-full text-start flex gap-3 rounded-xl border p-3 transition ${
        checked
          ? 'border-brand-red bg-brand-red/5 ring-1 ring-brand-red/30'
          : 'border-border hover:bg-muted/40'
      }`}
    >
      <span
        className={`grid place-items-center w-9 h-9 rounded-lg shrink-0 ${
          checked ? 'bg-brand-red text-white' : 'bg-muted text-muted-foreground'
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-sm">{title}</span>
        <span className="block text-xs text-muted-foreground mt-0.5 leading-5">{desc}</span>
      </span>
      <span
        className={`mt-1 w-4 h-4 rounded-full border-2 shrink-0 ${
          checked ? 'border-brand-red bg-brand-red' : 'border-input'
        }`}
      />
    </button>
  );
}

/**
 * Spreadsheet import. The file is fully validated and previewed before a
 * single request is sent: the admin sees how many rows will be created vs
 * updated, every per-cell problem, and can download the bad rows to fix.
 */
function ImportDialog({
  merchants,
  products,
  defaultMerchantId,
  onClose,
}: {
  merchants: Row[];
  products: Row[];
  defaultMerchantId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [merchantId, setMerchantId] = useState(defaultMerchantId);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [busyTpl, setBusyTpl] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    fail: string[];
    cancelled?: boolean;
    jobId?: string;
  } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // A ref, not state: the import loop reads it between rows and must see the
  // latest value without waiting for a re-render.
  const cancelRef = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const merchantNames = useMemo(
    () => merchants.map((m) => String(m.storeNameAr ?? '')).filter(Boolean),
    [merchants],
  );

  // Ids are matched against the whole catalogue, not the filtered page — an
  // admin can export one merchant and import the file while another is
  // selected, and those rows must still be recognised as updates. The API
  // caps pageSize at 200, so walk every page rather than asking for one big
  // one (which 400s, leaving every row wrongly marked "new").
  const { data: knownIds, isLoading: idsLoading } = useQuery({
    queryKey: ['admin', 'products', 'known-ids'],
    queryFn: async () => {
      const ids = new Set<string>();
      for (let page = 1; page <= 50; page++) {
        const r = await api.adminListProducts({ page, pageSize: 200 });
        (r.items as Row[]).forEach((p) => ids.add(String(p.id)));
        if (!r.items.length || page >= (r.pagination?.totalPages ?? 1)) break;
      }
      return ids;
    },
    // This walks EVERY page of the catalogue, so it must never join the global
    // 120s poll — that re-ran the whole multi-page sweep every two minutes for
    // as long as the import dialog stayed open, and the shared MySQL user is
    // capped at 500 connections/hour. The id set only has to be correct at the
    // moment the file is matched; the dialog is short-lived.
    refetchInterval: false,
    refetchOnMount: false,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });

  const template = async (mode: 'blank' | 'example' | 'data') => {
    setBusyTpl(true);
    try {
      const blob = await buildImportWorkbook({
        mode,
        withId: mode === 'data',
        products,
        merchantNames,
      });
      downloadBlob(
        blob,
        mode === 'data'
          ? 'تميم-المنتجات-للتعديل.xlsx'
          : mode === 'example'
            ? 'تميم-قالب-مع-مثال.xlsx'
            : 'تميم-قالب-فارغ.xlsx',
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشل تجهيز القالب');
    } finally {
      setBusyTpl(false);
    }
  };

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    // Without the id set every row would look new and re-importing an edited
    // export would duplicate the catalogue instead of updating it.
    if (!knownIds) {
      toast.error('لم يتم تحميل قائمة المنتجات بعد — انتظر لحظة وحاول مرة أخرى.');
      return;
    }
    setFileName(f.name);
    setResult(null);
    setSheet(null);
    setReading(true);
    try {
      const parsed = await readProductsFile(f, {
        merchantsByName: new Map(
          merchants.map((m) => [String(m.storeNameAr ?? '').toLowerCase(), String(m.id)]),
        ),
        knownIds: knownIds ?? new Set<string>(),
        defaultMerchantId: merchantId,
        defaultMerchantName: merchants.find((m) => m.id === merchantId)?.storeNameAr ?? '',
      });
      setSheet(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'فشلت قراءة الملف');
    } finally {
      setReading(false);
    }
  };

  const run = useMutation({
    mutationFn: async () => {
      const valid = sheet?.valid ?? [];
      const invalid = sheet?.invalid ?? [];

      // Open the job BEFORE touching a single product: if this run dies halfway
      // (tab closed, network drops) the record still exists and says so, rather
      // than leaving changes nobody can trace.
      const job = (await api.adminCreateImportJob({
        fileName,
        status: 'PROCESSING',
        kind: creates && updates ? 'MIXED' : creates ? 'CREATE' : 'UPDATE',
        totalRows: valid.length + invalid.length,
      })) as Row;
      const jobId = String(job.id);

      // Attribution only — the server writes the audit record either way.
      const headers = { 'X-Import-Job': jobId, 'X-Import-File': encodeURIComponent(fileName) };

      const rowLogs: Row[] = invalid.map((r) => ({
        line: r.line,
        productName: String(r.data.nameAr ?? ''),
        sku: r.data.sku ? String(r.data.sku) : undefined,
        action: 'skip',
        status: 'error',
        errorColumn: r.errors[0]?.column,
        errorMessage: r.errors[0]?.message,
      }));

      const fail: string[] = [];
      let created = 0;
      let updated = 0;
      let cancelled = false;

      for (const [i, r] of valid.entries()) {
        if (cancelRef.current) {
          cancelled = true;
          break;
        }
        setProgress({ done: i, total: valid.length });
        try {
          let productId = r.id;
          if (r.action === 'update' && r.id) {
            await api.adminUpdateProduct(r.id, { ...r.data, merchantId: r.merchantId }, headers);
            updated++;
          } else {
            const made = (await api.adminCreateProduct(
              { ...r.data, merchantId: r.merchantId },
              headers,
            )) as Row;
            productId = made?.id;
            created++;
          }
          rowLogs.push({
            line: r.line,
            productId,
            productName: String(r.data.nameAr ?? ''),
            sku: r.data.sku ? String(r.data.sku) : undefined,
            action: r.action,
            status: 'ok',
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'فشل';
          fail.push(`صف ${r.line} (${r.data.nameAr}): ${msg}`);
          rowLogs.push({
            line: r.line,
            productName: String(r.data.nameAr ?? ''),
            action: r.action,
            status: 'error',
            errorMessage: msg,
          });
        }
      }
      setProgress({ done: valid.length, total: valid.length });

      const status = cancelled
        ? 'CANCELLED'
        : fail.length && !created && !updated
          ? 'FAILED'
          : fail.length || invalid.length
            ? 'PARTIAL'
            : 'COMPLETED';

      // Bookkeeping must never lose the run itself: if writing the log fails,
      // the products are already imported and the admin still needs the result.
      try {
        if (rowLogs.length) await api.adminLogImportRows(jobId, rowLogs);
        await api.adminUpdateImportJob(jobId, {
          status,
          createdCount: created,
          updatedCount: updated,
          skippedCount: invalid.length,
          errorCount: fail.length,
        });
      } catch {
        toast.error('تم الاستيراد لكن تعذّر حفظ سجل العملية');
      }

      return { created, updated, fail, cancelled, jobId };
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      qc.invalidateQueries({ queryKey: ['admin', 'import-jobs'] });
      if (r.cancelled) toast.info(`تم الإلغاء بعد ${formatCount(r.created + r.updated)} صف`);
      else if (r.created || r.updated)
        toast.success(`تم إنشاء ${formatCount(r.created)} وتحديث ${formatCount(r.updated)}`);
      if (r.fail.length) toast.error(`فشل ${formatCount(r.fail.length)} صف`);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      cancelRef.current = false;
    },
  });

  const creates = sheet?.valid.filter((r) => r.action === 'create').length ?? 0;
  const updates = sheet?.valid.filter((r) => r.action === 'update').length ?? 0;
  const canRun = !!sheet?.valid.length && !run.isPending && !result;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="استيراد المنتجات"
      description="نزّل قالباً جاهزاً، املأ بياناتك، ثم ارفع الملف."
      size="xl"
    >
      <div className="space-y-4">
        {/* ── 1. templates ── */}
        <div>
          <div className="text-sm font-bold mb-2">١. نزّل قالباً</div>
          <div className="grid md:grid-cols-3 gap-2">
            <TemplateBtn
              busy={busyTpl}
              onClick={() => void template('blank')}
              icon={<FileSpreadsheet className="w-4 h-4" />}
              title="قالب فارغ"
              desc="لإضافة منتجات جديدة من البداية."
            />
            <TemplateBtn
              busy={busyTpl}
              onClick={() => void template('example')}
              icon={<FileText className="w-4 h-4" />}
              title="قالب مع مثال"
              desc="يحتوي صفاً نموذجياً يوضح طريقة الإدخال."
            />
            <TemplateBtn
              busy={busyTpl}
              onClick={() => void template('data')}
              icon={<FileUp className="w-4 h-4" />}
              title="المنتجات الحالية للتعديل"
              desc={`${formatCount(products.length)} منتج مع المعرّف الفريد للتحديث.`}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-5">
            حمّل نموذجاً جاهزاً يحتوي على الأعمدة المطلوبة ومثالاً توضيحياً، ثم املأ بياناتك وارفع
            الملف. كل قالب فيه شيت «Instructions» بشرح كل عمود.
          </p>
        </div>

        {/* ── 2. default merchant ── */}
        <div>
          <div className="text-sm font-bold mb-2">٢. التاجر الافتراضي</div>
          <select
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-popover text-sm"
          >
            <option value="">— بدون —</option>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.storeNameAr}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            يُستخدم فقط للصفوف اللي عمود «التاجر» فيها فاضي.
          </p>
        </div>

        {/* ── 3. upload ── */}
        <div>
          <div className="text-sm font-bold mb-2">٣. ارفع الملف</div>
          <div className="rounded-lg border border-dashed border-border p-4 text-center space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,text/csv"
              className="hidden"
              onChange={(e) => void readFile(e.target.files?.[0])}
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={idsLoading || reading}
            >
              {reading || idsLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              اختر ملف Excel أو CSV
            </Button>
            <p className="text-xs text-muted-foreground">{fileName || 'لم يتم اختيار ملف بعد.'}</p>
          </div>
        </div>

        {sheet?.fatal && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {sheet.fatal}
          </div>
        )}

        {/* ── report ── */}
        {sheet && !sheet.fatal && !result && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <ReportTile tone="green" label="منتجات جديدة" value={creates} />
              <ReportTile tone="blue" label="تحديث لموجود" value={updates} />
              <ReportTile tone="red" label="صفوف بها أخطاء" value={sheet.invalid.length} />
            </div>

            {sheet.invalid.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-destructive">
                    الصفوف دي هتتخطى — صحّحها وارفع الملف تاني:
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      downloadBlob(
                        new Blob([buildErrorCsv(sheet)], { type: 'text/csv;charset=utf-8' }),
                        'تميم-أخطاء-الاستيراد.csv',
                      )
                    }
                    className="text-xs font-bold text-brand-red hover:underline inline-flex items-center gap-1 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    تنزيل ملف الأخطاء
                  </button>
                </div>
                <div className="max-h-32 overflow-y-auto text-xs space-y-0.5">
                  {sheet.invalid.slice(0, 25).map((r) =>
                    r.errors.map((e, i) => (
                      <div key={`${r.line}-${i}`}>
                        <b>صف {formatCount(r.line)}</b> — <b>{e.column}</b>: {e.message}
                      </div>
                    )),
                  )}
                  {sheet.invalid.length > 25 && (
                    <div className="text-muted-foreground">
                      … وغيرها. نزّل ملف الأخطاء للقائمة الكاملة.
                    </div>
                  )}
                </div>
              </div>
            )}

            {sheet.valid.length > 0 && (
              <div>
                <div className="text-xs font-bold mb-1">
                  معاينة أول {Math.min(5, sheet.valid.length)} صفوف:
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr className="text-right">
                        <th className="px-2 py-1.5 font-bold">الإجراء</th>
                        <th className="px-2 py-1.5 font-bold">الاسم</th>
                        <th className="px-2 py-1.5 font-bold">التاجر</th>
                        <th className="px-2 py-1.5 font-bold">السعر</th>
                        <th className="px-2 py-1.5 font-bold">المخزون</th>
                        <th className="px-2 py-1.5 font-bold">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.valid.slice(0, 5).map((r) => (
                        <tr key={r.line} className="border-t border-border/50">
                          <td className="px-2 py-1.5">
                            <TonePill tone={r.action === 'create' ? 'green' : 'blue'}>
                              {r.action === 'create' ? 'جديد' : 'تحديث'}
                            </TonePill>
                          </td>
                          <td className="px-2 py-1.5 font-bold">{String(r.data.nameAr ?? '')}</td>
                          <td className="px-2 py-1.5">{r.merchantName || '—'}</td>
                          <td className="px-2 py-1.5">{formatMoney(Number(r.data.price ?? 0))}</td>
                          <td className="px-2 py-1.5">
                            {r.data.stock == null ? '—' : formatCount(Number(r.data.stock))}
                          </td>
                          <td className="px-2 py-1.5">{r.data.isAvailable ? 'متاح' : 'معطّل'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-border p-3 text-sm space-y-1">
            <div className="font-bold text-green-700">
              ✓ تم إنشاء {formatCount(result.created)} منتج وتحديث {formatCount(result.updated)}.
            </div>
            {result.fail.length > 0 && (
              <div className="text-xs text-destructive space-y-0.5 max-h-32 overflow-y-auto">
                <div className="font-bold">فشل {formatCount(result.fail.length)}:</div>
                {result.fail.slice(0, 20).map((f) => (
                  <div key={f}>• {f}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {run.isPending && progress && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold">
                جارٍ الاستيراد… {formatCount(progress.done)} / {formatCount(progress.total)}
              </span>
              <button
                type="button"
                onClick={() => {
                  cancelRef.current = true;
                }}
                className="font-bold text-brand-red hover:underline"
              >
                إلغاء العملية
              </button>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-brand-red transition-[width] duration-200"
                style={{
                  width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              الصفوف اللي خلصت اتحفظت بالفعل — الإلغاء بيوقف الباقي بس.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {!result && (
            <Button onClick={() => run.mutate()} disabled={!canRun}>
              {run.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {run.isPending
                ? 'جارٍ الاستيراد…'
                : `استيراد ${sheet?.valid.length ? formatCount(sheet.valid.length) + ' صف' : ''}`}
            </Button>
          )}
          <Button variant={result ? 'primary' : 'ghost'} onClick={onClose} className="ms-auto">
            {result ? 'تم' : 'إلغاء'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function TemplateBtn({
  busy,
  onClick,
  icon,
  title,
  desc,
}: {
  busy: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="text-start rounded-lg border border-border p-2.5 hover:bg-muted/40 hover:border-brand-red/40 transition disabled:opacity-60"
    >
      <span className="inline-flex items-center gap-1.5 font-bold text-sm text-brand-dark">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
        {title}
      </span>
      <span className="block text-[11px] text-muted-foreground mt-0.5 leading-4">{desc}</span>
    </button>
  );
}

function ReportTile({ tone, label, value }: { tone: Tone; label: string; value: number }) {
  return (
    <div className={`rounded-lg p-2.5 ${TONE[tone].soft}`}>
      <div className="text-lg font-black">{formatCount(value)}</div>
      <div className="text-[11px] font-bold opacity-80">{label}</div>
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
            <img
              src={url}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
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
  categoryName: string; // in-store section, e.g. بيتزا / مشويات
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
      categoryName: '',
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
    categoryName: product.categoryName ?? '',
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
  // Sizes/add-ons live on their own endpoint, but the admin shouldn't have to
  // press two save buttons. The panel hands us its writer and we run it right
  // after the product itself saves.
  const saveOptionsRef = useRef<(() => Promise<void>) | null>(null);

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
    // Always sent (even empty) so clearing the box actually removes the
    // section — a truthy-only check would make it un-clearable.
    out.categoryName = form.categoryName.trim() || null;
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
      const saved = await api.adminUpdateProduct(product!.id, patch);
      await saveOptionsRef.current?.();
      return saved;
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

  /**
   * Section names this merchant already uses, for the datalist below.
   *
   * Uses the same public endpoint the mobile store page filters with, so the
   * suggestions are exactly the chips a customer will see — no chance of
   * offering a name the app doesn't render.
   */
  const { data: sections } = useQuery({
    queryKey: ['merchant-sections', form.merchantId],
    queryFn: () => api.getMerchantProductSections(form.merchantId) as Promise<{ name: string }[]>,
    enabled: !!form.merchantId,
    staleTime: 5 * 60_000,
  });

  // Shared, cross-merchant sections for THIS merchant's type (e.g. every
  // restaurant's مشويات), so a new store is offered the unified taxonomy the app
  // filters by — not just the names it happens to have typed already.
  const selectedMerchant = merchants.find((m) => m.id === form.merchantId);
  const merchantCategoryId: string | undefined =
    selectedMerchant?.category?.id ?? selectedMerchant?.categoryId ?? undefined;
  const { data: sharedSections } = useQuery({
    queryKey: ['shared-sections', merchantCategoryId ?? 'all'],
    queryFn: () =>
      api.raw
        .get('/product-sections', {
          params: merchantCategoryId ? { merchantCategoryId } : {},
        })
        .then((r) => r.data.data as { name: string }[]),
    staleTime: 5 * 60_000,
  });

  // Merchant's own sections first (most relevant), then the shared list, deduped.
  const sectionSuggestions = Array.from(
    new Set([...(sections ?? []).map((x) => x.name), ...(sharedSections ?? []).map((x) => x.name)]),
  ).filter(Boolean);

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

        {/* In-store section. Free text with suggestions drawn from what this
            merchant already uses — typing "بيتزا" when "بيتزا " exists would
            create a second chip in the app, so the datalist nudges toward
            reusing a name rather than inventing one. */}
        <Field
          label="القسم داخل المتجر"
          hint="يظهر كفلتر في صفحة المتجر بالتطبيق — مثال: بيتزا، كريب، مشويات"
        >
          <Input
            list="product-sections"
            value={form.categoryName}
            onChange={(e) => setForm({ ...form, categoryName: e.target.value })}
            placeholder="اتركه فارغاً لو المتجر مفيهوش أقسام"
          />
          <datalist id="product-sections">
            {sectionSuggestions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>

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

        {/* Only after the product exists — both endpoints are keyed by product
            id, and a merchant's add-on list can't be linked to a row that
            hasn't been created yet. */}
        {mode === 'edit' && product?.id ? (
          <div className="pt-2">
            <h3 className="text-sm font-bold mb-2">الأحجام والإضافات</h3>
            <ProductOptionsPanel
              productId={product.id}
              merchantId={form.merchantId}
              basePrice={Number(form.price) || 0}
              registerSave={(fn) => {
                saveOptionsRef.current = fn;
              }}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground pt-2">
            الأحجام والإضافات بتتضاف بعد حفظ المنتج — افتح تعديل المنتج تاني.
          </p>
        )}
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
