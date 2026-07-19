import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Download,
  ImagePlus,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  MoreVertical,
  Package,
  PackageX,
  Pencil,
  Phone,
  Plug,
  Plus,
  RefreshCw,
  Save,
  Search,
  Store,
  Trash2,
  Unplug,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { MerchantExportDialog, MerchantImportDialog } from '../components/MerchantImportExport.js';
import { MerchantLogo } from '../components/MerchantLogo.js';
import { Button } from '../components/ui/Button.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { PhoneInput } from '../components/ui/PhoneInput.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { StatCard } from '../components/ui/StatCard.js';
import { ErrorState } from '../components/ui/States.js';
import { api } from '../lib/api.js';
import { formatCount, formatDate, formatDateTime } from '../lib/format.js';
import { TONE } from '../lib/statusRegistry.js';
import { uploadFile } from '../lib/uploadFile.js';

// Lazy — Leaflet pulls a large module and on first load triggered a context
// consumer error inside react-router when imported eagerly on this route.
// Loading it only when the dialog opens fixes the crash + speeds up the page.
const MapPicker = lazy(() =>
  import('../components/MapPicker.js').then((m) => ({ default: m.MapPicker })),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

type StatusFilter = '' | 'active' | 'inactive';
type YesNo = '' | 'yes' | 'no';
type ViewMode = 'table' | 'cards';

const VIEW_KEY = 'tamem-merchants-view';
const readView = (): ViewMode => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'table';
  } catch {
    return 'table';
  }
};

export function MerchantsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [view, setView] = useState<ViewMode>(readView);

  // ── filters (server-side: the list is paged, so filtering here would only
  //    ever see the page in hand) ──
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [categoryId, setCategoryId] = useState('');
  const [hasProducts, setHasProducts] = useState<YesNo>('');
  const [hasApi, setHasApi] = useState<YesNo>('');
  const [sort, setSort] = useState('createdAt');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState<Row | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Typing shouldn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const changeView = (v: ViewMode) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode — keep the in-memory choice */
    }
  };

  const filters = { search, status, categoryId, hasProducts, hasApi };
  // Near-static, and every refetch costs a DB connection from the shared
  // 500/hour cap — so no background polling, refreshed on demand instead.
  const { data: stats } = useQuery({
    queryKey: ['admin', 'merchants', 'stats'],
    queryFn: () => api.adminMerchantStats(),
    staleTime: 300_000,
    refetchInterval: false,
  });
  const { data: categories } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => api.adminListCategories(),
    staleTime: 600_000,
    refetchInterval: false,
  });

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'merchants', filters, sort, dir, page, pageSize],
    queryFn: () =>
      api.adminListMerchants({
        page,
        pageSize,
        sort,
        dir,
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(hasProducts ? { hasProducts } : {}),
        ...(hasApi ? { hasApi } : {}),
      }),
    placeholderData: (prev) => prev,
  });

  const items = (data?.items as Row[] | undefined) ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.totalPages ?? 1;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const catName = (id: string) =>
    ((categories as Row[] | undefined) ?? []).find((c) => c.id === id)?.nameAr ?? id;

  const chips: { label: string; clear: () => void }[] = [];
  if (search) chips.push({ label: `بحث: ${search}`, clear: () => setSearchInput('') });
  if (status)
    chips.push({
      label: status === 'active' ? 'نشط' : 'غير نشط',
      clear: () => setStatus(''),
    });
  if (categoryId)
    chips.push({ label: `تصنيف: ${catName(categoryId)}`, clear: () => setCategoryId('') });
  if (hasProducts)
    chips.push({
      label: hasProducts === 'yes' ? 'لديه منتجات' : 'بدون منتجات',
      clear: () => setHasProducts(''),
    });
  if (hasApi)
    chips.push({
      label: hasApi === 'yes' ? 'مرتبط API' : 'غير مرتبط API',
      clear: () => setHasApi(''),
    });

  const clearAll = () => {
    setSearchInput('');
    setStatus('');
    setCategoryId('');
    setHasProducts('');
    setHasApi('');
    setPage(1);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'merchants'] });
  };

  const activeMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.adminUpdateMerchant(id, { isActive }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkActive = useMutation({
    mutationFn: async ({ ids, isActive }: { ids: string[]; isActive: boolean }) => {
      for (const id of ids) await api.adminUpdateMerchant(id, { isActive });
    },
    onSuccess: (_r, v) => {
      toast.success(v.isActive ? 'تم تفعيل التجار المحددين' : 'تم تعطيل التجار المحددين');
      setSelected(new Set());
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.adminDeleteMerchant(id),
    onSuccess: () => {
      toast.success('تم حذف التاجر');
      setConfirmDel(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pageIds = items.map((m) => String(m.id));
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleSel = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    setSelected(next);
  };

  const exportSelected = () => {
    const rows = items.filter((m) => selected.has(String(m.id)));
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['اسم المتجر', 'English', 'التصنيف', 'الهاتف', 'المنطقة', 'المنتجات', 'الحالة'];
    const csv =
      '﻿' +
      [
        head.map(esc).join(','),
        ...rows.map((m) =>
          [
            m.storeNameAr,
            m.storeName,
            m.category?.nameAr,
            m.phone ?? m.user?.phone,
            m.governorate,
            m._count?.products ?? 0,
            m.user?.isActive ? 'نشط' : 'غير نشط',
          ]
            .map(esc)
            .join(','),
        ),
      ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tamem-merchants-${rows.length}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const setSortKey = (key: string) => {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setDir('asc');
    }
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="إدارة التجار"
        subtitle={`${formatCount(total)} تاجر${chips.length ? ' (مفلتر)' : ''}`}
        icon={Store}
        actions={
          <>
            <Button variant="outline" size="md" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4" />
              استيراد
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={() => setExportOpen(true)}
              disabled={!items.length}
            >
              <Download className="w-4 h-4" />
              تصدير
            </Button>
            <Button size="md" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              إضافة تاجر جديد
            </Button>
          </>
        }
      />

      {/* ── stats (whole catalogue, not this page) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatBtn onClick={clearAll}>
          <StatCard
            label="إجمالي التجار"
            value={formatCount(stats?.total ?? 0)}
            icon={Store}
            tone="zinc"
          />
        </StatBtn>
        <StatBtn
          onClick={() => {
            setStatus('active');
            setPage(1);
          }}
        >
          <StatCard
            label="نشط"
            value={formatCount(stats?.active ?? 0)}
            icon={CheckCircle2}
            tone="green"
          />
        </StatBtn>
        <StatBtn
          onClick={() => {
            setStatus('inactive');
            setPage(1);
          }}
        >
          <StatCard
            label="غير نشط"
            value={formatCount(stats?.inactive ?? 0)}
            icon={XCircle}
            tone="zinc"
            emphasis={(stats?.inactive ?? 0) > 0}
          />
        </StatBtn>
        <StatBtn
          onClick={() => {
            setHasProducts('yes');
            setPage(1);
          }}
        >
          <StatCard
            label="لديه منتجات"
            value={formatCount(stats?.withProducts ?? 0)}
            icon={Package}
            tone="blue"
          />
        </StatBtn>
        <StatBtn
          onClick={() => {
            setHasProducts('no');
            setPage(1);
          }}
        >
          <StatCard
            label="بدون منتجات"
            value={formatCount(stats?.withoutProducts ?? 0)}
            icon={PackageX}
            tone="amber"
            emphasis={(stats?.withoutProducts ?? 0) > 0}
          />
        </StatBtn>
        <StatBtn
          onClick={() => {
            setHasApi('no');
            setPage(1);
          }}
        >
          <StatCard
            label="غير مرتبط API"
            value={formatCount(stats?.noApi ?? 0)}
            icon={Unplug}
            tone="purple"
          />
        </StatBtn>
      </div>

      {/* ── search + filters ── */}
      <div className="sticky top-16 z-20 bg-card rounded-xl border border-border p-3 md:p-4 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ابحث بالاسم، الهاتف، الإيميل، المنطقة، أو ID التاجر…"
              className="w-full ps-9 pe-3 py-2 rounded-lg border border-input bg-popover text-sm outline-none focus:ring-2 focus:ring-brand-red/30"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-input bg-popover text-sm"
          >
            <option value="">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">غير نشط</option>
          </select>
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-input bg-popover text-sm min-w-[130px]"
          >
            <option value="">كل التصنيفات</option>
            {((categories as Row[] | undefined) ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameAr}
              </option>
            ))}
          </select>
          <select
            value={hasProducts}
            onChange={(e) => {
              setHasProducts(e.target.value as YesNo);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-input bg-popover text-sm"
          >
            <option value="">المنتجات: الكل</option>
            <option value="yes">لديه منتجات</option>
            <option value="no">بدون منتجات</option>
          </select>
          <select
            value={hasApi}
            onChange={(e) => {
              setHasApi(e.target.value as YesNo);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-input bg-popover text-sm"
          >
            <option value="">API: الكل</option>
            <option value="yes">مرتبط</option>
            <option value="no">غير مرتبط</option>
          </select>
          <Button variant="outline" size="md" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
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
              onClick={() => changeView('cards')}
              title="عرض بطاقات"
              aria-pressed={view === 'cards'}
              className={`p-2 transition ${view === 'cards' ? 'bg-brand-red text-white' : 'bg-card text-muted-foreground hover:bg-muted'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-red/10 text-brand-red text-xs font-bold"
              >
                {c.label}
                <button type="button" onClick={c.clear} aria-label={`إزالة ${c.label}`}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-bold text-muted-foreground hover:text-brand-red hover:underline ms-1"
            >
              مسح كل الفلاتر
            </button>
          </div>
        )}
      </div>

      {/* ── bulk bar ── */}
      {selected.size > 0 && (
        <div className="sticky top-16 z-30 bg-brand-dark text-white rounded-xl shadow-lg px-4 py-2.5 flex flex-wrap items-center gap-2">
          <span className="font-bold text-sm">{formatCount(selected.size)} محدد</span>
          <div className="h-4 w-px bg-white/20 mx-1" />
          <button
            onClick={() => bulkActive.mutate({ ids: [...selected], isActive: true })}
            disabled={bulkActive.isPending}
            className="text-xs font-bold px-2 py-1 rounded hover:bg-white/10 disabled:opacity-50"
          >
            تفعيل
          </button>
          <button
            onClick={() => bulkActive.mutate({ ids: [...selected], isActive: false })}
            disabled={bulkActive.isPending}
            className="text-xs font-bold px-2 py-1 rounded hover:bg-white/10 disabled:opacity-50"
          >
            تعطيل
          </button>
          <button
            onClick={exportSelected}
            className="text-xs font-bold px-2 py-1 rounded hover:bg-white/10 inline-flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            تصدير المحددين
          </button>
          {bulkActive.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <button
            onClick={() => setSelected(new Set())}
            className="ms-auto text-xs px-2 py-1 rounded hover:bg-white/10"
          >
            إلغاء التحديد
          </button>
        </div>
      )}

      {/* ── content ── */}
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
            icon={<Store className="w-10 h-10" />}
            title={chips.length ? 'لا توجد نتائج مطابقة' : 'لا يوجد تجار'}
            description={chips.length ? 'جرّب تعديل البحث أو الفلاتر.' : 'ابدأ بإضافة أول تاجر.'}
            action={
              chips.length ? (
                <Button variant="outline" onClick={clearAll}>
                  مسح الفلاتر
                </Button>
              ) : (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="w-4 h-4" />
                  إضافة تاجر
                </Button>
              )
            }
          />
        </div>
      ) : view === 'table' ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                <tr className="text-right">
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      className="accent-brand-red w-4 h-4"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="تحديد الكل"
                    />
                  </th>
                  <SortTh
                    label="التاجر"
                    active={sort === 'name'}
                    dir={dir}
                    onClick={() => setSortKey('name')}
                  />
                  <th className="px-3 py-3 font-bold">التصنيف</th>
                  <th className="px-3 py-3 font-bold">الهاتف</th>
                  <th className="px-3 py-3 font-bold">المنطقة</th>
                  <SortTh
                    label="المنتجات"
                    active={sort === 'products'}
                    dir={dir}
                    onClick={() => setSortKey('products')}
                  />
                  <th className="px-3 py-3 font-bold">API</th>
                  <th className="px-3 py-3 font-bold">الحالة</th>
                  <SortTh
                    label="الإضافة"
                    active={sort === 'createdAt'}
                    dir={dir}
                    onClick={() => setSortKey('createdAt')}
                  />
                  <th className="px-3 py-3 w-28" />
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr
                    key={m.id}
                    className={`border-b border-border/50 hover:bg-muted/30 ${
                      selected.has(String(m.id)) ? 'bg-brand-red/5' : ''
                    } ${m.user?.isActive ? '' : 'opacity-60'}`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        className="accent-brand-red w-4 h-4"
                        checked={selected.has(String(m.id))}
                        onChange={() => toggleSel(String(m.id))}
                        aria-label={`تحديد ${m.storeNameAr}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <MerchantLogo merchant={m} size="md" />
                        <div className="min-w-0">
                          <div className="font-bold truncate max-w-[180px]">{m.storeNameAr}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {m.user?.name ?? m.storeName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">{m.category?.nameAr ?? '—'}</td>
                    <td className="px-3 py-3 text-xs" dir="ltr">
                      {m.phone ?? m.user?.phone ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {m.governorate || m.city
                        ? `${m.governorate ?? ''} ${m.city ?? ''}`.trim()
                        : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        to={`/products?merchant=${m.id}`}
                        className="inline-flex items-center gap-1 font-bold hover:text-brand-red"
                      >
                        {formatCount(m._count?.products ?? 0)}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      {m.apiConfig ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.apiConfig.isConnected ? TONE.green.badge : TONE.amber.badge
                          }`}
                          title={m.apiConfig.apiUrl ?? ''}
                        >
                          <Plug className="w-3 h-3" />
                          {m.apiConfig.isConnected ? 'متصل' : 'مرتبط'}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <ActiveToggle
                        on={!!m.user?.isActive}
                        onChange={() =>
                          activeMut.mutate({ id: String(m.id), isActive: !m.user?.isActive })
                        }
                      />
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {formatDate(m.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditing(m)}
                          aria-label="تعديل"
                          title="تعديل"
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <MerchantMenu merchant={m} onDelete={() => setConfirmDel(m)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((m) => (
            <div
              key={m.id}
              className={`bg-card rounded-xl border p-4 transition hover:shadow-md ${
                selected.has(String(m.id))
                  ? 'border-brand-red ring-1 ring-brand-red/30'
                  : 'border-border'
              } ${m.user?.isActive ? '' : 'opacity-70'}`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="accent-brand-red w-4 h-4 mt-1"
                  checked={selected.has(String(m.id))}
                  onChange={() => toggleSel(String(m.id))}
                  aria-label={`تحديد ${m.storeNameAr}`}
                />
                <MerchantLogo merchant={m} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{m.storeNameAr}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {m.user?.name ?? '—'}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.category && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TONE.blue.badge}`}
                      >
                        {m.category.nameAr}
                      </span>
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        m.user?.isActive ? TONE.green.badge : TONE.zinc.badge
                      }`}
                    >
                      {m.user?.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                    {m.apiConfig && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TONE.teal.badge}`}
                      >
                        API
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المنتجات</span>
                  <Link
                    to={`/products?merchant=${m.id}`}
                    className="font-bold hover:text-brand-red"
                  >
                    {formatCount(m._count?.products ?? 0)}
                  </Link>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المنطقة</span>
                  <span className="truncate max-w-[150px]">{m.governorate ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">آخر تحديث</span>
                  <span>{formatDate(m.updatedAt ?? m.createdAt)}</span>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-border/60 flex items-center justify-between">
                <ActiveToggle
                  on={!!m.user?.isActive}
                  onChange={() =>
                    activeMut.mutate({ id: String(m.id), isActive: !m.user?.isActive })
                  }
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(m)}
                    aria-label="تعديل"
                    title="تعديل"
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <MerchantMenu merchant={m} onDelete={() => setConfirmDel(m)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── pagination ── */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>
              عرض {formatCount(from)}–{formatCount(to)} من {formatCount(total)}
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 rounded border border-input bg-popover text-xs"
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}/صفحة
                </option>
              ))}
            </select>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1.5 rounded-lg border border-input disabled:opacity-40 hover:bg-muted"
              >
                السابق
              </button>
              <span className="px-2 text-muted-foreground">
                {formatCount(page)} / {formatCount(totalPages)}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1.5 rounded-lg border border-input disabled:opacity-40 hover:bg-muted"
              >
                التالي
              </button>
            </div>
          )}
        </div>
      )}

      {importOpen && (
        <MerchantImportDialog
          merchants={items}
          categories={(categories as Row[]) ?? []}
          onClose={() => setImportOpen(false)}
        />
      )}
      {exportOpen && (
        <MerchantExportDialog
          merchants={items}
          categoryNames={((categories as Row[]) ?? []).map((c) => String(c.nameAr ?? ''))}
          onClose={() => setExportOpen(false)}
        />
      )}
      {createOpen && <CreateMerchantDialog onClose={() => setCreateOpen(false)} />}
      {editing && <EditMerchantDialog merchant={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title="حذف التاجر"
        message={
          confirmDel
            ? `سيتم حذف «${confirmDel.storeNameAr}» و${formatCount(confirmDel._count?.products ?? 0)} من منتجاته نهائياً. لا يمكن التراجع.`
            : ''
        }
        loading={delMut.isPending}
        onConfirm={() => confirmDel && delMut.mutate(String(confirmDel.id))}
      />
    </div>
  );
}

/** Stat cards double as filters — wrapping keeps StatCard itself presentational. */
function StatBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-start">
      {children}
    </button>
  );
}

function SortTh({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-3 font-bold">
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

/** Same logical-offset switch as the products screen — translate-x escapes its
 *  track under dir="rtl". */
function ActiveToggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      title={on ? 'نشط — اضغط للتعطيل' : 'غير نشط — اضغط للتفعيل'}
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

function MerchantMenu({ merchant, onDelete }: { merchant: Row; onDelete: () => void }) {
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
          <div className="absolute end-0 mt-1 z-40 w-48 bg-popover rounded-lg border border-border shadow-lg py-1 text-sm">
            <Link
              to={`/products?merchant=${merchant.id}`}
              onClick={() => setOpen(false)}
              className="w-full text-start px-3 py-2 hover:bg-muted flex items-center gap-2"
            >
              <Package className="w-4 h-4" /> إدارة المنتجات
            </Link>
            <Link
              to={`/merchants/${merchant.id}/hours`}
              onClick={() => setOpen(false)}
              className="w-full text-start px-3 py-2 hover:bg-muted flex items-center gap-2"
            >
              <Clock className="w-4 h-4" /> مواعيد العمل
            </Link>
            <Link
              to={`/merchants/${merchant.id}/products-api`}
              onClick={() => setOpen(false)}
              className="w-full text-start px-3 py-2 hover:bg-muted flex items-center gap-2"
            >
              <Plug className="w-4 h-4" /> ربط API
            </Link>
            <button
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="w-full text-start px-3 py-2 hover:bg-destructive/10 text-destructive flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> حذف التاجر
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared store-profile fields — rendered identically by the Add and Edit
// dialogs so the two forms stay in lockstep. Owner/account fields live in the
// dialogs themselves (they differ: Add creates an account, Edit patches one).
// ─────────────────────────────────────────────────────────────────────────

/** The store-profile slice of state shared between the Add and Edit forms. */
interface StoreFields {
  storeNameAr: string;
  storeName: string;
  categoryId: string;
  description: string;
  logoUrl: string;
  coverUrl: string;
  storePhone: string;
  commissionPct: string; // kept as text for the input; coerced on submit
  prepMin: string; // preparation window, saved via its own endpoint
  prepMax: string;
  menuImages: string[]; // menu-image mode: photos of the paper menu
  addressLine: string;
  lat: number;
  lng: number;
  governorate: string;
  city: string;
}

/** Single-image uploader (logo / cover) — reuses the shared uploadFile flow. */
function SingleImageField({
  label,
  hint,
  value,
  onChange,
  aspect = 'square',
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  aspect?: 'square' | 'wide';
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFile(file);
      onChange(res.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل رفع الصورة');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-3">
        <div
          className={`overflow-hidden rounded-lg border border-border bg-muted/40 grid place-items-center shrink-0 ${
            aspect === 'wide' ? 'w-32 h-16' : 'w-16 h-16'
          }`}
        >
          {value ? (
            <img src={value} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImagePlus className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void pick(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ImagePlus className="w-4 h-4" />
          )}
          {uploading ? 'جارٍ الرفع...' : value ? 'تغيير' : 'رفع صورة'}
        </Button>
        {value && !uploading && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="p-1.5 rounded-md text-destructive hover:bg-destructive/10"
            aria-label="حذف الصورة"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </Field>
  );
}

/**
 * Menu-image mode uploader — a merchant that doesn't list individual products
 * can instead upload photo(s) of their paper menu. The customer app shows these
 * (zoomable) with a free-text order button.
 */
function MenuImagesField({
  values,
  onChange,
  max = 8,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = max - values.length;
    if (remaining <= 0) {
      toast.error(`الحد الأقصى ${max} صور`);
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const results = await Promise.all(picked.map((f) => uploadFile(f)));
      onChange([...values, ...results.map((r) => r.url)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل رفع الصورة');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="col-span-2 rounded-xl border border-dashed border-border bg-muted/20 p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-brand-dark">صور المنيو</span>
        {values.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {values.length}/{max}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        للتجار اللي بيبعتوا صورة منيو بدل إدخال منتج-منتج. لو رفعت صور هنا، هتظهر للعميل ويقدر يطلب
        منها مباشرة.
      </p>
      <div className="flex flex-wrap gap-3">
        {values.map((url, idx) => (
          <div
            key={`${url}-${idx}`}
            className="relative w-24 h-24 rounded-lg overflow-hidden border border-border group"
          >
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(values.filter((_, i) => i !== idx))}
              className="absolute top-1 end-1 p-1 rounded-md bg-white/90 text-destructive opacity-0 group-hover:opacity-100 transition shadow"
              aria-label="حذف"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {values.length < max && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-24 h-24 rounded-lg border-2 border-dashed border-border grid place-items-center text-muted-foreground hover:border-brand-red hover:text-brand-red transition disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ImagePlus className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void pick(e.target.files)}
      />
    </div>
  );
}

/** Store-profile inputs common to both dialogs. */
/**
 * The store form, split into tabs. The panels stay mounted (hidden, not
 * unmounted) so switching tabs never drops a half-typed field — and so the
 * map keeps its instance instead of re-initialising on every visit.
 */
function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string; icon: typeof Store; hint?: string }[];
  active: string;
  onChange: (k: string) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex gap-1 overflow-x-auto border-b border-border -mx-6 px-6 mb-4"
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onChange(t.key)}
            title={t.hint}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold whitespace-nowrap border-b-2 -mb-px transition ${
              on
                ? 'border-brand-red text-brand-red'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Panel({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div className={show ? 'grid grid-cols-2 gap-3' : 'hidden'} role="tabpanel">
      {children}
    </div>
  );
}

/** Tab 1 — identity: what the customer sees. */
function BasicFields({
  form,
  patch,
  categories,
}: {
  form: StoreFields;
  patch: (p: Partial<StoreFields>) => void;
  categories: Row[] | undefined;
}) {
  // A hidden category must not be offered as a choice. The one this merchant is
  // already on stays listed even when hidden, though — dropping it would blank
  // the field and silently re-assign the store on the next save.
  const options = (categories ?? []).filter((c) => c.isActive || c.id === form.categoryId);

  return (
    <>
      <Field label="اسم المتجر (ع)" required>
        <Input value={form.storeNameAr} onChange={(e) => patch({ storeNameAr: e.target.value })} />
      </Field>
      <Field label="اسم المتجر (En)" required>
        <Input
          value={form.storeName}
          dir="ltr"
          onChange={(e) => patch({ storeName: e.target.value })}
        />
      </Field>
      <Field label="التصنيف" required>
        <select
          value={form.categoryId}
          onChange={(e) => patch({ categoryId: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
        >
          <option value="">— اختر —</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameAr}
              {c.isActive ? '' : ' (مخفي)'}
            </option>
          ))}
        </select>
      </Field>
      {/* Prep time is what the customer checks before ordering — it sits next
          to commission because both are operational settings, not branding. */}
      <Field
        label="مدة التجهيز (بالدقائق)"
        hint="تظهر للعميل في صفحة المتجر. اتركها فارغة لإخفائها."
      >
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={600}
            dir="ltr"
            placeholder="من"
            value={form.prepMin}
            onChange={(e) => patch({ prepMin: e.target.value })}
          />
          <span className="text-muted-foreground text-sm">إلى</span>
          <Input
            type="number"
            min={0}
            max={600}
            dir="ltr"
            placeholder="إلى"
            value={form.prepMax}
            onChange={(e) => patch({ prepMax: e.target.value })}
          />
        </div>
      </Field>

      <Field label="نسبة العمولة %" hint="تُترك فارغة لاستخدام النسبة الافتراضية">
        <Input
          type="number"
          min={0}
          max={100}
          step="0.5"
          dir="ltr"
          value={form.commissionPct}
          onChange={(e) => patch({ commissionPct: e.target.value })}
        />
      </Field>
      <SingleImageField
        label="لوجو المتجر"
        hint="يظهر للعميل بجانب اسم المتجر"
        value={form.logoUrl}
        onChange={(logoUrl) => patch({ logoUrl })}
        aspect="square"
      />
      <SingleImageField
        label="صورة الغلاف"
        hint="تظهر في أعلى صفحة المتجر"
        value={form.coverUrl}
        onChange={(coverUrl) => patch({ coverUrl })}
        aspect="wide"
      />
      <div className="col-span-2">
        <Field label="الوصف">
          <Textarea
            value={form.description}
            onChange={(e) => patch({ description: e.target.value })}
            rows={2}
          />
        </Field>
      </div>
      <MenuImagesField values={form.menuImages} onChange={(menuImages) => patch({ menuImages })} />
    </>
  );
}

/** Tab 3 — where the store is. */
function LocationFields({
  form,
  patch,
  active,
}: {
  form: StoreFields;
  patch: (p: Partial<StoreFields>) => void;
  /** Only mount the map once its tab is on screen. Leaflet cannot initialise in
   *  a display:none panel: the container measures 0×0, and the flyTo that
   *  follows divides by that and throws "Invalid LatLng (NaN, NaN)". The text
   *  fields around it stay mounted, so nothing typed is lost. */
  active: boolean;
}) {
  return (
    <>
      <div className="col-span-2">
        <Field label="العنوان" required>
          <Input
            value={form.addressLine}
            onChange={(e) => patch({ addressLine: e.target.value })}
          />
        </Field>
      </div>
      <div className="col-span-2">
        <Field label="موقع المتجر على الخريطة" required hint="ابحث عن المكان أو اسحب الدبوس">
          <Suspense
            fallback={
              <div className="h-48 rounded-lg border border-border bg-muted/40 grid place-items-center text-xs text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            }
          >
            {active && (
              <MapPicker
                lat={form.lat}
                lng={form.lng}
                initialQuery={form.addressLine || form.storeNameAr}
                onChange={({ lat, lng, address }) =>
                  patch({ lat, lng, addressLine: form.addressLine || address || form.addressLine })
                }
              />
            )}
          </Suspense>
        </Field>
      </div>
      <Field label="المحافظة" required>
        <Input value={form.governorate} onChange={(e) => patch({ governorate: e.target.value })} />
      </Field>
      <Field label="المدينة" required>
        <Input value={form.city} onChange={(e) => patch({ city: e.target.value })} />
      </Field>
      <div className="col-span-2 rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
        الإحداثيات المحفوظة:{' '}
        <span className="font-mono" dir="ltr">
          {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
        </span>
      </div>
    </>
  );
}

/** Tab 4 — integration status only. Keys and mapping live on the merchant's own
 *  API screen; this never shows a secret. */
function IntegrationPanel({ merchant }: { merchant: Row }) {
  const cfg = merchant.apiConfig;
  return (
    <div className="col-span-2 space-y-3">
      {cfg ? (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border p-2.5">
              <div className="text-muted-foreground mb-0.5">رابط API</div>
              <div className="font-mono text-[11px] break-all" dir="ltr">
                {cfg.apiUrl ?? '—'}
              </div>
            </div>
            <div className="rounded-lg border border-border p-2.5">
              <div className="text-muted-foreground mb-0.5">حالة الاتصال</div>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  cfg.isConnected ? TONE.green.badge : TONE.amber.badge
                }`}
              >
                <Plug className="w-3 h-3" />
                {cfg.isConnected ? 'متصل' : 'مرتبط — لم يتم الاتصال بنجاح بعد'}
              </span>
            </div>
            <div className="rounded-lg border border-border p-2.5">
              <div className="text-muted-foreground mb-0.5">آخر مزامنة</div>
              <div className="font-bold">
                {cfg.lastSyncedAt ? formatDateTime(cfg.lastSyncedAt) : 'لم تتم بعد'}
              </div>
            </div>
            <div className="rounded-lg border border-border p-2.5">
              <div className="text-muted-foreground mb-0.5">التكامل</div>
              <div className="font-bold">{cfg.isActive ? 'مفعّل' : 'موقوف'}</div>
            </div>
          </div>
          <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground leading-5">
            <b className="text-foreground">المفتاح لا يُعرض هنا ولا في أي مكان</b> — بيتخزن مشفّر
            ولا يُقرأ. لتغييره أو لاختبار الاتصال أو لضبط ربط الحقول، افتح شاشة ربط API.
          </p>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-5 text-center">
          <Unplug className="w-8 h-8 mx-auto text-muted-foreground/50" />
          <div className="font-bold text-sm mt-2">غير مرتبط بـ API</div>
          <p className="text-xs text-muted-foreground mt-1 leading-5">
            التاجر ده بيدخل منتجاته يدوياً. تقدر تربطه بـ API عشان المنتجات تتحدّث تلقائياً.
          </p>
        </div>
      )}
      <Link to={`/merchants/${merchant.id}/products-api`}>
        <Button variant="outline" className="w-full">
          <Plug className="w-4 h-4" />
          {cfg ? 'فتح إعدادات ربط API' : 'ربط التاجر بـ API'}
        </Button>
      </Link>
    </div>
  );
}

/** Tab 5 — the merchant's catalogue at a glance. */
function ProductsPanel({ merchant }: { merchant: Row }) {
  const count = Number(merchant._count?.products ?? 0);
  const menu = Array.isArray(merchant.menuImages) ? merchant.menuImages.length : 0;
  return (
    <div className="col-span-2 space-y-3">
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className={`rounded-lg p-3 ${TONE.blue.soft}`}>
          <div className="text-2xl font-black">{formatCount(count)}</div>
          <div className="text-xs font-bold opacity-80">منتج</div>
        </div>
        <div className={`rounded-lg p-3 ${menu ? TONE.purple.soft : TONE.zinc.soft}`}>
          <div className="text-2xl font-black">{formatCount(menu)}</div>
          <div className="text-xs font-bold opacity-80">صورة منيو</div>
        </div>
      </div>
      {count === 0 && menu === 0 && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-5">
          التاجر ده لسه مالوش أي منتجات ولا صور منيو — يعني مش هيظهرله حاجة في التطبيق.
        </p>
      )}
      <Link to={`/products?merchant=${merchant.id}`}>
        <Button variant="outline" className="w-full">
          <Package className="w-4 h-4" />
          إدارة منتجات التاجر
        </Button>
      </Link>
      <Link to={`/merchants/${merchant.id}/hours`}>
        <Button variant="outline" className="w-full">
          <Clock className="w-4 h-4" />
          مواعيد العمل
        </Button>
      </Link>
    </div>
  );
}

/** Build the API payload for the store-profile slice, dropping empties. */
function storePayload(form: StoreFields): Record<string, unknown> {
  return {
    storeNameAr: form.storeNameAr.trim(),
    storeName: form.storeName.trim(),
    categoryId: form.categoryId || undefined,
    description: form.description.trim() || undefined,
    // '' clears the image server-side; a value sets it.
    logoUrl: form.logoUrl,
    coverUrl: form.coverUrl,
    storePhone: form.storePhone.trim() || undefined,
    commissionPct: form.commissionPct.trim() ? Number(form.commissionPct) : undefined,
    menuImages: form.menuImages,
    addressLine: form.addressLine.trim(),
    lat: form.lat,
    lng: form.lng,
    governorate: form.governorate.trim(),
    city: form.city.trim(),
  };
}

function toStoreFields(m: Row): StoreFields {
  return {
    prepMin: m.prepMinutes?.min != null ? String(m.prepMinutes.min) : '',
    prepMax: m.prepMinutes?.max != null ? String(m.prepMinutes.max) : '',
    storeNameAr: m.storeNameAr ?? '',
    storeName: m.storeName ?? '',
    categoryId: m.categoryId ?? m.category?.id ?? '',
    description: m.description ?? '',
    logoUrl: m.logoUrl ?? '',
    coverUrl: m.coverUrl ?? '',
    storePhone: m.phone ?? '',
    commissionPct: m.commissionPct != null ? String(m.commissionPct) : '',
    menuImages: Array.isArray(m.menuImages)
      ? (m.menuImages.filter(
          (u: unknown): u is string => typeof u === 'string' && u.length > 0,
        ) as string[])
      : [],
    addressLine: m.addressLine ?? '',
    lat: m.lat != null ? Number(m.lat) : 26.0297,
    lng: m.lng != null ? Number(m.lng) : 32.8146,
    governorate: m.governorate ?? 'قنا',
    city: m.city ?? 'قفط',
  };
}

function SecondaryPhonesEditor({
  phones,
  onChange,
}: {
  phones: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="col-span-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-muted-foreground">أرقام احتياطية</span>
        {phones.length < 3 && (
          <button
            type="button"
            onClick={() => onChange([...phones, ''])}
            className="text-xs font-bold text-brand-red inline-flex items-center gap-1 hover:underline"
          >
            <Plus className="w-3 h-3" /> إضافة رقم
          </button>
        )}
      </div>
      {phones.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <Phone className="w-4 h-4 text-muted-foreground" />
          <Input
            dir="ltr"
            value={p}
            onChange={(e) => onChange(phones.map((v, idx) => (idx === i ? e.target.value : v)))}
            placeholder="01XXXXXXXXX"
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => onChange(phones.filter((_, idx) => idx !== i))}
            className="p-1.5 rounded hover:bg-red-50 text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function EditMerchantDialog({ merchant, onClose }: { merchant: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: categories } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => api.adminListCategories() as Promise<Row[]>,
  });
  const [store, setStore] = useState<StoreFields>(() => toStoreFields(merchant));
  const [ownerName, setOwnerName] = useState<string>(merchant.user?.name ?? '');
  const [ownerPhone, setOwnerPhone] = useState<string>(merchant.user?.phone ?? '');
  const [secondaryPhones, setSecondaryPhones] = useState<string[]>(
    Array.isArray(merchant.user?.secondaryPhones) ? merchant.user.secondaryPhones : [],
  );

  const mut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await api.adminUpdateMerchant(merchant.id, data);
      // Prep time has its own endpoint because it isn't a MerchantProfile
      // column yet — it's kept in Setting until the schema change can run.
      // Saved unconditionally so clearing both fields also clears the value.
      await api.adminSetMerchantPrepTime(merchant.id, {
        min: store.prepMin === '' ? null : Number(store.prepMin),
        max: store.prepMax === '' ? null : Number(store.prepMax),
      });
      return res;
    },
    onSuccess: () => {
      toast.success('تم حفظ بيانات التاجر');
      qc.invalidateQueries({ queryKey: ['admin', 'merchants'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const patch = (p: Partial<StoreFields>) => setStore((s) => ({ ...s, ...p }));

  const [tab, setTab] = useState('basic');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="تعديل بيانات التاجر" size="lg">
      <TabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'basic', label: 'البيانات الأساسية', icon: Store },
          { key: 'contact', label: 'بيانات التواصل', icon: Phone },
          { key: 'location', label: 'الموقع', icon: MapPin },
          { key: 'api', label: 'التكامل', icon: Plug },
          { key: 'products', label: 'المنتجات', icon: Package },
        ]}
      />

      <Panel show={tab === 'basic'}>
        <BasicFields form={store} patch={patch} categories={categories} />
      </Panel>
      <Panel show={tab === 'contact'}>
        <Field label="اسم المالك">
          <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </Field>
        <Field label="رقم المالك الرئيسي (للدخول)">
          <Input value={ownerPhone} dir="ltr" onChange={(e) => setOwnerPhone(e.target.value)} />
        </Field>
        <Field label="رقم هاتف المتجر (اختياري)" hint="لو مختلف عن رقم المالك">
          <Input
            value={store.storePhone}
            dir="ltr"
            placeholder="01XXXXXXXXX"
            onChange={(e) => patch({ storePhone: e.target.value })}
          />
        </Field>
        <div />
        <SecondaryPhonesEditor phones={secondaryPhones} onChange={setSecondaryPhones} />
      </Panel>
      <Panel show={tab === 'location'}>
        <LocationFields form={store} patch={patch} active={tab === 'location'} />
      </Panel>
      <Panel show={tab === 'api'}>
        <IntegrationPanel merchant={merchant} />
      </Panel>
      <Panel show={tab === 'products'}>
        <ProductsPanel merchant={merchant} />
      </Panel>

      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button
          onClick={() =>
            mut.mutate({
              ...storePayload(store),
              ownerName: ownerName.trim() || undefined,
              ownerPhone: ownerPhone.trim() || undefined,
              ownerSecondaryPhones: secondaryPhones.map((p) => p.trim()).filter(Boolean),
            })
          }
          disabled={mut.isPending}
        >
          {mut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {mut.isPending ? 'جاري الحفظ…' : 'حفظ التغييرات'}
        </Button>
      </div>
    </Dialog>
  );
}

const BLANK_STORE: StoreFields = {
  prepMin: '',
  prepMax: '',
  storeNameAr: '',
  storeName: '',
  categoryId: '',
  description: '',
  logoUrl: '',
  coverUrl: '',
  storePhone: '',
  commissionPct: '',
  menuImages: [],
  addressLine: '',
  lat: 26.0297,
  lng: 32.8146,
  governorate: 'قنا',
  city: 'قفط',
};

function CreateMerchantDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('basic');
  const { data: categories } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => api.adminListCategories() as Promise<Row[]>,
  });
  const [store, setStore] = useState<StoreFields>(BLANK_STORE);
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('+20');
  const [password, setPassword] = useState('');

  const mut = useMutation({
    mutationFn: () =>
      api.adminCreateMerchant({
        ...storePayload(store),
        ownerName: ownerName.trim(),
        phone,
        password,
      }),
    onSuccess: () => {
      toast.success('تم إضافة التاجر');
      qc.invalidateQueries({ queryKey: ['admin', 'merchants'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const patch = (p: Partial<StoreFields>) => setStore((s) => ({ ...s, ...p }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="إضافة تاجر" size="lg">
      {/* Only three tabs: API config and products both need a merchant that
          already exists, so they belong to Edit. */}
      <TabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'basic', label: 'البيانات الأساسية', icon: Store },
          { key: 'contact', label: 'بيانات التواصل', icon: Phone },
          { key: 'location', label: 'الموقع', icon: MapPin },
        ]}
      />

      <Panel show={tab === 'basic'}>
        <BasicFields form={store} patch={patch} categories={categories} />
      </Panel>
      <Panel show={tab === 'contact'}>
        <div className="col-span-2">
          <span className="text-xs font-bold text-muted-foreground">بيانات المالك (للدخول)</span>
        </div>
        <Field label="اسم المالك" required>
          <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </Field>
        <Field label="هاتف المالك" required>
          <PhoneInput value={phone} onChange={setPhone} />
        </Field>
        <Field label="كلمة المرور" required>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="رقم هاتف المتجر (اختياري)" hint="لو مختلف عن رقم المالك">
          <Input
            value={store.storePhone}
            dir="ltr"
            placeholder="01XXXXXXXXX"
            onChange={(e) => patch({ storePhone: e.target.value })}
          />
        </Field>
      </Panel>
      <Panel show={tab === 'location'}>
        <LocationFields form={store} patch={patch} active={tab === 'location'} />
      </Panel>
      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          إضافة
        </Button>
      </div>
    </Dialog>
  );
}
