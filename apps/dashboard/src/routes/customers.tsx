import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Phone, Plus, Save, Search, Trash2, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { StatusBadge } from '../components/ui/Badge.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Input } from '../components/ui/Input.js';
import { PhoneInput } from '../components/ui/PhoneInput.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

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
}

export function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'customers', debounced],
    queryFn: () => api.adminListCustomers({ search: debounced || undefined, pageSize: 50 }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.raw.delete(`/admin/customers/${id}`),
    onSuccess: () => {
      toast.success('تم حذف العميل');
      qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">العملاء</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.pagination.total ?? 0} عميل مسجّل
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border p-4">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="ابحث بالاسم أو رقم الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-10"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={8} cols={5} />
          </div>
        ) : !data?.items.length ? (
          <EmptyState icon={<Users className="w-10 h-10" />} title="لا يوجد عملاء" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-right">
                  <th className="px-4 py-3 font-bold">الاسم</th>
                  <th className="px-4 py-3 font-bold">الهاتف</th>
                  <th className="px-4 py-3 font-bold">المدينة</th>
                  <th className="px-4 py-3 font-bold">عدد الطلبات</th>
                  <th className="px-4 py-3 font-bold">تاريخ التسجيل</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {(data.items as Row[]).map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3" dir="ltr">
                      {c.phone}
                    </td>
                    <td className="px-4 py-3">{c.city ?? '—'}</td>
                    <td className="px-4 py-3">{c._count?.customerOrders ?? 0}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(c.id);
                          }}
                          title="تعديل"
                          className="p-1.5 rounded hover:bg-muted text-brand-red"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`حذف العميل "${c.name}"؟`)) deleteMut.mutate(c.id);
                          }}
                          title="حذف"
                          className="p-1.5 rounded hover:bg-muted text-destructive"
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
        )}
      </div>

      {selectedId && (
        <CustomerDetailDialog customerId={selectedId} onClose={() => setSelectedId(null)} />
      )}
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={data?.name ?? '...'} size="lg">
      {isLoading || !data ? (
        <TableSkeleton rows={6} cols={1} />
      ) : (
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex border-b border-border">
            {(
              [
                { key: 'info', label: 'البيانات الأساسية' },
                { key: 'addresses', label: `العناوين (${data.savedAddresses?.length ?? 0})` },
                { key: 'orders', label: 'آخر الطلبات' },
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
              {data.customerOrders?.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  لا توجد طلبات بعد
                </div>
              ) : (
                <div className="space-y-1">
                  {(data.customerOrders ?? []).map((o: Row) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between p-2 border-b border-border/50 text-sm"
                    >
                      <div>
                        <div className="font-mono text-xs">{o.orderNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(o.createdAt).toLocaleDateString('ar-EG')}
                        </div>
                      </div>
                      <StatusBadge status={o.status} />
                      <div className="font-bold">
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

function CustomerInfoForm({ customer, customerId }: { customer: Row; customerId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState<string>(customer.name ?? '');
  const [phone, setPhone] = useState<string>(customer.phone ?? '');
  const [email, setEmail] = useState<string>(customer.email ?? '');
  const [city, setCity] = useState<string>(customer.city ?? '');
  const [governorate, setGovernorate] = useState<string>(customer.governorate ?? '');
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

  const onSave = () => {
    const cleaned = secondaryPhones.map((p) => p.trim()).filter(Boolean);
    mut.mutate({
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || null,
      city: city.trim() || null,
      governorate: governorate.trim() || null,
      secondaryPhones: cleaned,
    });
  };

  return (
    <div className="space-y-3">
      <Field label="الاسم">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="رقم الهاتف الرئيسي">
        <PhoneInput value={phone} onChange={setPhone} />
      </Field>
      <Field label="الإيميل">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
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
          disabled={mut.isPending}
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

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'customer', customerId] });
  };

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
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{a.address}</div>
                {a.notes && (
                  <div className="text-xs text-muted-foreground mt-0.5 italic">{a.notes}</div>
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
