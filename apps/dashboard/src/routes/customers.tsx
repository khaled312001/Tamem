import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CheckCircle2,
  Filter,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { StatusBadge } from '../components/ui/Badge.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Input } from '../components/ui/Input.js';
import { PhoneInput } from '../components/ui/PhoneInput.js';
import { Pagination } from '../components/ui/Pagination.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { uploadFile } from '../lib/uploadFile.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

interface SavedAddress {
  id: string;
  label: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  isDefault: boolean;
  /** The zone the customer picked in the app — this is what the delivery fee is
   *  quoted from, so an address without it can't be priced. */
  cityName?: string | null;
  villageName?: string | null;
  areaName?: string | null;
  /** Server-joined "مدينة › قرية › منطقة" so every screen prints it the same. */
  zoneLabel?: string | null;
}

// ── Avatar: customer photo with an initial-letter fallback + stable tint ──
const TINTS = [
  'bg-brand-orange',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-teal-500',
  'bg-indigo-500',
];
function tintFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length] as string;
}
function Avatar({
  name,
  url,
  size = 'md',
}: {
  name?: string;
  url?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const [broken, setBroken] = useState(false);
  const cls = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-24 h-24 text-3xl',
  }[size];
  const box = `${cls} rounded-full shrink-0 overflow-hidden grid place-items-center font-black text-white`;
  const letter = (name || '؟').trim().charAt(0) || '؟';
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={`${box} object-cover border border-border bg-white`}
      />
    );
  }
  return <span className={`${box} ${tintFor(name || '?')}`}>{letter}</span>;
}

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('ar-EG') : '—');
const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

interface Filters {
  status: '' | 'active' | 'inactive';
  hasOrders: '' | 'yes' | 'no';
  city: string;
  from: string;
  to: string;
}
const EMPTY_FILTERS: Filters = { status: '', hasOrders: '', city: '', from: '', to: '' };

export function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // Real paging: this screen used to ask for one capped page of 100 with no way
  // to reach row 101. Page resets whenever the search or a filter changes.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  useEffect(() => setPage(1), [debounced, filters, pageSize]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(
    () => ({
      search: debounced || undefined,
      status: filters.status || undefined,
      hasOrders: filters.hasOrders || undefined,
      city: filters.city || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      page,
      pageSize,
    }),
    [debounced, filters, page, pageSize],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'customers', params],
    queryFn: () => api.adminListCustomers(params),
    placeholderData: (prev) => prev,
  });
  const total = data?.pagination.total ?? 0;

  const rows = (data?.items ?? []) as Row[];
  const activeFilterCount =
    (filters.status ? 1 : 0) +
    (filters.hasOrders ? 1 : 0) +
    (filters.city ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0);

  // City options come from a server-wide DISTINCT query so the dropdown lists
  // every city, not just the ones on the current page. Falls back to
  // page-derived cities if the endpoint is unavailable.
  const { data: allCities } = useQuery({
    queryKey: ['admin', 'customers', 'cities'],
    queryFn: () => api.adminCustomerCities(),
    staleTime: 5 * 60_000,
  });
  const cityOptions = useMemo(() => {
    const set = new Set<string>((allCities ?? []) as string[]);
    for (const r of rows) if (r.city) set.add(r.city);
    return Array.from(set).sort();
  }, [allCities, rows]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'customers'] });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.raw.delete(`/admin/customers/${id}`),
    onSuccess: () => {
      toast.success('تم حذف العميل');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const toggleActiveMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.adminUpdateCustomer(id, { isActive }),
    onSuccess: (_r, v) => {
      toast.success(v.isActive ? 'تم تفعيل العميل' : 'تم تعطيل العميل');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const bulkMut = useMutation({
    mutationFn: async ({
      ids,
      action,
    }: {
      ids: string[];
      action: 'delete' | 'activate' | 'deactivate';
    }) => {
      for (const id of ids) {
        if (action === 'delete') await api.raw.delete(`/admin/customers/${id}`);
        else await api.adminUpdateCustomer(id, { isActive: action === 'activate' });
      }
    },
    onSuccess: (_r, v) => {
      toast.success(`تم تنفيذ الإجراء على ${v.ids.length} عميل`);
      setChecked(new Set());
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const allChecked = rows.length > 0 && rows.every((r) => checked.has(r.id));
  const toggleAll = () =>
    setChecked(allChecked ? new Set() : new Set(rows.map((r) => r.id as string)));
  const toggleOne = (id: string) =>
    setChecked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-brand-dark inline-flex items-center gap-2">
            <Users className="w-6 h-6" /> العملاء
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.pagination.total ?? 0} عميل مسجّل
            {isFetching && <Loader2 className="inline w-3 h-3 animate-spin ms-2 align-middle" />}
          </p>
        </div>
      </div>

      {/* Search + filter toggle */}
      <div className="bg-white rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="بحث بالاسم، الهاتف، المدينة/المنطقة، أو رقم العميل…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-10"
            />
          </div>
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition ${
              showFilters || activeFilterCount
                ? 'bg-brand-red/10 border-brand-red/30 text-brand-red'
                : 'border-border text-brand-dark hover:bg-muted'
            }`}
          >
            <Filter className="w-4 h-4" /> فلاتر
            {activeFilterCount > 0 && (
              <span className="bg-brand-red text-white rounded-full w-5 h-5 grid place-items-center text-[10px]">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-border">
            <Select
              label="الحالة"
              value={filters.status}
              onChange={(v) => setFilters((f) => ({ ...f, status: v as Filters['status'] }))}
              options={[
                { v: '', l: 'الكل' },
                { v: 'active', l: 'مفعّل' },
                { v: 'inactive', l: 'معطّل' },
              ]}
            />
            <Select
              label="الطلبات"
              value={filters.hasOrders}
              onChange={(v) => setFilters((f) => ({ ...f, hasOrders: v as Filters['hasOrders'] }))}
              options={[
                { v: '', l: 'الكل' },
                { v: 'yes', l: 'لديه طلبات' },
                { v: 'no', l: 'بدون طلبات' },
              ]}
            />
            <Select
              label="المدينة"
              value={filters.city}
              onChange={(v) => setFilters((f) => ({ ...f, city: v }))}
              options={[{ v: '', l: 'الكل' }, ...cityOptions.map((c) => ({ v: c, l: c }))]}
            />
            <div>
              <div className="text-xs font-bold text-muted-foreground mb-1">التسجيل من</div>
              <Input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-xs font-bold text-muted-foreground mb-1">إلى</div>
              <Input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              />
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="text-xs font-bold text-brand-red hover:underline justify-self-start"
              >
                مسح كل الفلاتر
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {checked.size > 0 && (
        <div className="bg-brand-dark text-white rounded-xl px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="font-bold text-sm">{checked.size} محدّد</span>
          <div className="flex-1" />
          <button
            onClick={() => bulkMut.mutate({ ids: [...checked], action: 'activate' })}
            disabled={bulkMut.isPending}
            className="text-xs font-bold px-3 py-1.5 rounded bg-white/15 hover:bg-white/25 inline-flex items-center gap-1"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> تفعيل
          </button>
          <button
            onClick={() => bulkMut.mutate({ ids: [...checked], action: 'deactivate' })}
            disabled={bulkMut.isPending}
            className="text-xs font-bold px-3 py-1.5 rounded bg-white/15 hover:bg-white/25 inline-flex items-center gap-1"
          >
            <Ban className="w-3.5 h-3.5" /> تعطيل
          </button>
          <button
            onClick={() => {
              if (confirm(`حذف ${checked.size} عميل نهائياً؟`))
                bulkMut.mutate({ ids: [...checked], action: 'delete' });
            }}
            disabled={bulkMut.isPending}
            className="text-xs font-bold px-3 py-1.5 rounded bg-red-500 hover:bg-red-600 inline-flex items-center gap-1"
          >
            {bulkMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}{' '}
            حذف
          </button>
          <button onClick={() => setChecked(new Set())} className="p-1 hover:bg-white/15 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={8} cols={7} />
          </div>
        ) : !rows.length ? (
          <EmptyState
            icon={<Users className="w-10 h-10" />}
            title={debounced || activeFilterCount ? 'لا توجد نتائج مطابقة' : 'لا يوجد عملاء'}
            description={
              debounced || activeFilterCount ? 'جرّب تعديل البحث أو مسح الفلاتر' : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-right">
                  <th className="ps-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-3 font-bold">العميل</th>
                  <th className="px-3 py-3 font-bold">الهاتف</th>
                  <th className="px-3 py-3 font-bold">المدينة</th>
                  <th className="px-3 py-3 font-bold text-center">الطلبات</th>
                  <th className="px-3 py-3 font-bold">التسجيل</th>
                  <th className="px-3 py-3 font-bold">آخر نشاط</th>
                  <th className="px-3 py-3 w-28" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const inactive = c.isActive === false;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={`border-b border-border/50 hover:bg-muted/30 cursor-pointer ${inactive ? 'opacity-60' : ''}`}
                    >
                      <td className="ps-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked.has(c.id)}
                          onChange={() => toggleOne(c.id)}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar name={c.name} url={c.avatarUrl} size="md" />
                          <div className="min-w-0">
                            <div className="font-bold truncate flex items-center gap-1.5">
                              {c.name || '—'}
                              {inactive && (
                                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 rounded">
                                  معطّل
                                </span>
                              )}
                            </div>
                            {c.email && (
                              <div className="text-xs text-muted-foreground truncate">
                                {c.email}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5" dir="ltr">
                        {c.phone}
                      </td>
                      <td className="px-3 py-2.5">{c.city ?? '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`inline-block min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${
                            (c.orderCount ?? 0) > 0
                              ? 'bg-brand-red/10 text-brand-red'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {c.orderCount ?? c._count?.customerOrders ?? 0}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {fmtDate(c.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {fmtDate(c.lastActivityAt)}
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5 justify-end">
                          <IconBtn
                            title="عرض / تعديل"
                            onClick={() => setSelectedId(c.id)}
                            className="text-brand-red"
                          >
                            <Pencil className="w-4 h-4" />
                          </IconBtn>
                          <IconBtn
                            title={inactive ? 'تفعيل' : 'تعطيل'}
                            onClick={() => toggleActiveMut.mutate({ id: c.id, isActive: inactive })}
                            className={inactive ? 'text-emerald-600' : 'text-amber-600'}
                          >
                            {inactive ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : (
                              <Ban className="w-4 h-4" />
                            )}
                          </IconBtn>
                          <IconBtn
                            title="حذف"
                            onClick={() => {
                              if (confirm(`حذف العميل "${c.name}"؟`)) deleteMut.mutate(c.id);
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            disabled={isFetching}
          />
        )}
      </div>

      {selectedId && (
        <CustomerDetailDialog customerId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded hover:bg-muted transition ${className}`}
    >
      {children}
    </button>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div>
      <div className="text-xs font-bold text-muted-foreground mb-1">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/30"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </div>
  );
}

type Tab = 'info' | 'addresses' | 'orders';

function CustomerDetailDialog({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('info');
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'customer', customerId],
    queryFn: () => api.adminGetCustomer(customerId) as Promise<Row>,
  });

  const orders = (data?.customerOrders ?? []) as Row[];
  const lastOrder = orders[0];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={data?.name ?? '...'} size="lg">
      {isLoading || !data ? (
        <TableSkeleton rows={6} cols={1} />
      ) : (
        <div className="space-y-4">
          {/* Header card: avatar + quick stats */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/40 border border-border">
            <Avatar name={data.name} url={data.avatarUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="font-black text-lg flex items-center gap-2">
                {data.name}
                {data.isActive === false && (
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                    معطّل
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground" dir="ltr">
                {data.phone}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center shrink-0">
              <Stat value={data._count?.customerOrders ?? orders.length} label="طلب" />
              <Stat value={fmtDate(lastOrder?.createdAt)} label="آخر طلب" small />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            {(
              [
                { key: 'info', label: 'البيانات' },
                { key: 'addresses', label: `العناوين (${data.savedAddresses?.length ?? 0})` },
                { key: 'orders', label: `الطلبات (${orders.length})` },
              ] as { key: Tab; label: string }[]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-brand-red text-brand-red'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'info' && <CustomerInfoForm customer={data} customerId={customerId} />}
          {tab === 'addresses' && (
            <CustomerAddressesPane
              customerId={customerId}
              addresses={(data.savedAddresses ?? []) as SavedAddress[]}
            />
          )}
          {tab === 'orders' && (
            <div>
              {orders.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  لا توجد طلبات بعد
                </div>
              ) : (
                <div className="space-y-1 max-h-[45vh] overflow-y-auto">
                  {orders.map((o: Row) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between gap-3 p-2.5 border-b border-border/50 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs">{o.orderNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDateTime(o.createdAt)}
                        </div>
                      </div>
                      <StatusBadge status={o.status} />
                      <div className="font-bold whitespace-nowrap">
                        {(o.finalPrice ?? o.quotedPrice)
                          ? `${Number(o.finalPrice ?? o.quotedPrice).toLocaleString('ar-EG')} ج.م`
                          : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Stat({ value, label, small }: { value: React.ReactNode; label: string; small?: boolean }) {
  return (
    <div>
      <div className={`font-black text-brand-red ${small ? 'text-xs' : 'text-xl'}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function CustomerInfoForm({ customer, customerId }: { customer: Row; customerId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState<string>(customer.name ?? '');
  const [phone, setPhone] = useState<string>(customer.phone ?? '');
  const [email, setEmail] = useState<string>(customer.email ?? '');
  const [city, setCity] = useState<string>(customer.city ?? '');
  const [governorate, setGovernorate] = useState<string>(customer.governorate ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string>(customer.avatarUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [secondaryPhones, setSecondaryPhones] = useState<string[]>(
    Array.isArray(customer.secondaryPhones) ? (customer.secondaryPhones as string[]) : [],
  );

  const mut = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.adminUpdateCustomer(customerId, data),
    onSuccess: () => {
      toast.success('تم حفظ البيانات');
      qc.invalidateQueries({ queryKey: ['admin', 'customer', customerId] });
      qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pickAvatar = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadFile(file);
      setAvatarUrl(url);
      toast.success('تم رفع الصورة — اضغط حفظ للتأكيد');
    } catch (e) {
      toast.error((e as Error).message || 'تعذّر رفع الصورة');
    } finally {
      setUploading(false);
    }
  };

  const onSave = () =>
    mut.mutate({
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || null,
      city: city.trim() || null,
      governorate: governorate.trim() || null,
      avatarUrl: avatarUrl || null,
      secondaryPhones: secondaryPhones.map((p) => p.trim()).filter(Boolean),
    });

  return (
    <div className="space-y-3">
      {/* Avatar upload */}
      <div className="flex items-center gap-4">
        <Avatar name={name} url={avatarUrl} size="xl" />
        <div className="space-y-1">
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm font-bold cursor-pointer hover:bg-muted">
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {avatarUrl ? 'تغيير الصورة' : 'رفع صورة'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickAvatar(e.target.files?.[0] ?? null)}
            />
          </label>
          {avatarUrl && (
            <button
              onClick={() => setAvatarUrl('')}
              className="block text-xs text-red-600 hover:underline"
            >
              إزالة الصورة
            </button>
          )}
        </div>
      </div>

      <Field label="الاسم">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="رقم الهاتف الرئيسي">
        <PhoneInput value={phone} onChange={setPhone} />
      </Field>
      <Field label="الإيميل">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" dir="ltr" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="المحافظة">
          <Input value={governorate} onChange={(e) => setGovernorate(e.target.value)} />
        </Field>
        <Field label="المدينة">
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
      </div>

      {/* Secondary phones */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-muted-foreground">أرقام احتياطية</span>
          {secondaryPhones.length < 3 && (
            <button
              onClick={() => setSecondaryPhones([...secondaryPhones, ''])}
              className="text-xs font-bold text-brand-red inline-flex items-center gap-1 hover:underline"
            >
              <Plus className="w-3 h-3" /> إضافة رقم
            </button>
          )}
        </div>
        {secondaryPhones.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">لا توجد أرقام احتياطية</div>
        ) : (
          <div className="space-y-2">
            {secondaryPhones.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <Input
                  dir="ltr"
                  value={p}
                  onChange={(e) =>
                    setSecondaryPhones(
                      secondaryPhones.map((v, idx) => (idx === i ? e.target.value : v)),
                    )
                  }
                  placeholder="01XXXXXXXXX"
                  className="flex-1"
                />
                <button
                  onClick={() => setSecondaryPhones(secondaryPhones.filter((_, idx) => idx !== i))}
                  className="p-1.5 rounded hover:bg-red-50 text-red-600"
                  title="حذف"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <button
          onClick={onSave}
          disabled={mut.isPending || uploading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-red text-white font-bold disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          {mut.isPending ? 'جاري الحفظ…' : 'حفظ التغييرات'}
        </button>
      </div>
    </div>
  );
}

function CustomerAddressesPane({
  customerId,
  addresses,
}: {
  customerId: string;
  addresses: SavedAddress[];
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<SavedAddress | 'new' | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'customer', customerId] });

  const deleteMut = useMutation({
    mutationFn: (addressId: string) => api.adminDeleteCustomerAddress(customerId, addressId),
    onSuccess: () => {
      toast.success('تم حذف العنوان');
      refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground">عناوين العميل المحفوظة</span>
        <button
          onClick={() => setEditing('new')}
          className="text-xs font-bold text-brand-red inline-flex items-center gap-1 hover:underline"
        >
          <Plus className="w-3 h-3" /> إضافة عنوان
        </button>
      </div>

      {addresses.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg">
          لا يوجد عناوين محفوظة
        </div>
      ) : (
        <div className="space-y-2">
          {addresses.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-3 p-3 border border-border rounded-lg hover:bg-muted/30"
            >
              <MapPin
                className={`w-4 h-4 mt-0.5 ${a.isDefault ? 'text-brand-red' : 'text-muted-foreground'}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{a.label}</span>
                  {a.isDefault && (
                    <span className="text-[10px] font-bold text-brand-red bg-brand-red/10 px-1.5 py-0.5 rounded">
                      افتراضي
                    </span>
                  )}
                </div>
                {/* Zone first — "تاني بيت بعد المسجد" only means something once
                    you know which village's mosque. */}
                {a.zoneLabel ? (
                  <div className="text-xs font-medium text-foreground/80 mt-1">{a.zoneLabel}</div>
                ) : (
                  <div className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    بدون منطقة — لا يمكن حساب سعر التوصيل
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-0.5">{a.address}</div>
                {a.notes && (
                  <div className="text-xs text-muted-foreground mt-0.5 italic">{a.notes}</div>
                )}
                {a.lat != null && a.lng != null && (
                  <a
                    href={`https://www.google.com/maps?q=${a.lat},${a.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brand-red hover:underline mt-0.5 inline-block"
                  >
                    فتح الموقع على الخريطة ↗
                  </a>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setEditing(a)}
                  className="px-2 py-1 text-xs font-bold rounded bg-muted hover:bg-muted/80"
                >
                  تعديل
                </button>
                <button
                  onClick={() => {
                    if (confirm(`حذف عنوان "${a.label}"؟`)) deleteMut.mutate(a.id);
                  }}
                  className="p-1.5 rounded hover:bg-red-50 text-red-600"
                  title="حذف"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <AddressEditDialog
          customerId={customerId}
          address={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AddressEditDialog({
  customerId,
  address,
  onClose,
  onSaved,
}: {
  customerId: string;
  address: SavedAddress | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(address?.label ?? '');
  const [text, setText] = useState(address?.address ?? '');
  const [notes, setNotes] = useState(address?.notes ?? '');
  const [isDefault, setIsDefault] = useState(address?.isDefault ?? false);

  const mut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      address
        ? api.adminUpdateCustomerAddress(customerId, address.id, data)
        : api.adminAddCustomerAddress(customerId, data),
    onSuccess: () => {
      toast.success(address ? 'تم تحديث العنوان' : 'تمت إضافة العنوان');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={address ? 'تعديل العنوان' : 'إضافة عنوان'}
      size="md"
    >
      <div className="space-y-3">
        <Field label="التسمية (مثال: البيت، الشغل)">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="العنوان">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/30"
          />
        </Field>
        <Field label="ملاحظات (اختياري)">
          <Input value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          <span className="text-sm">اجعله العنوان الافتراضي</span>
        </label>
        <div className="flex gap-2 justify-end pt-2 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-border text-sm font-bold hover:bg-muted"
          >
            إلغاء
          </button>
          <button
            onClick={() =>
              mut.mutate({
                label: label.trim(),
                address: text.trim(),
                notes: notes.trim() || null,
                isDefault,
              })
            }
            disabled={mut.isPending || !label.trim() || !text.trim()}
            className="px-4 py-1.5 rounded bg-brand-red text-white text-sm font-bold disabled:opacity-60"
          >
            {mut.isPending ? 'جاري الحفظ…' : 'حفظ'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}
