import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  ImagePlus,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Save,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { lazy, Suspense, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { PhoneInput } from '../components/ui/PhoneInput.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { uploadFile } from '../lib/uploadFile.js';

// Lazy — Leaflet pulls a large module and on first load triggered a context
// consumer error inside react-router when imported eagerly on this route.
// Loading it only when the dialog opens fixes the crash + speeds up the page.
const MapPicker = lazy(() =>
  import('../components/MapPicker.js').then((m) => ({ default: m.MapPicker })),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export function MerchantsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'merchants'],
    queryFn: () => api.adminListMerchants({ pageSize: 100 }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">التجار</h1>
          <p className="text-sm text-muted-foreground mt-1">{data?.pagination.total ?? 0} متجر</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          إضافة تاجر
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : !data?.items.length ? (
        <EmptyState
          icon={<Store className="w-12 h-12" />}
          title="لا يوجد تجار"
          action={<Button onClick={() => setCreateOpen(true)}>أضف تاجر</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(data.items as Row[]).map((m) => (
            <div key={m.id} className="bg-white rounded-xl border border-border p-5">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-brand-orange text-white flex items-center justify-center font-bold text-lg">
                  {m.storeNameAr?.[0] ?? '?'}
                </div>
                <div className="flex-1">
                  <div className="font-bold">{m.storeNameAr}</div>
                  <div className="text-xs text-muted-foreground">{m.storeName}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.category && <Badge>{m.category.nameAr}</Badge>}
                    {m.isOpen ? (
                      <Badge variant="success">مفتوح</Badge>
                    ) : (
                      <Badge variant="warning">مغلق</Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <div className="text-muted-foreground text-xs">{m.addressLine}</div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المنتجات</span>
                  <span className="font-bold">{m._count?.products ?? 0}</span>
                </div>
                {m.rating && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">التقييم</span>
                    <span>⭐ {Number(m.rating).toFixed(1)}</span>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  onClick={() => setEditing(m)}
                  className="inline-flex items-center gap-1 text-xs text-brand-red hover:underline"
                >
                  <Pencil className="w-3 h-3" /> تعديل البيانات
                </button>
                <Link
                  to={`/merchants/${m.id}/hours`}
                  className="inline-flex items-center gap-1 text-xs text-brand-red hover:underline"
                >
                  <Clock className="w-3 h-3" /> مواعيد العمل
                </Link>
                <Link
                  to={`/merchants/${m.id}/products-api`}
                  className="inline-flex items-center gap-1 text-xs text-brand-red hover:underline"
                >
                  🔗 ربط المنتجات (API)
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && <CreateMerchantDialog onClose={() => setCreateOpen(false)} />}
      {editing && <EditMerchantDialog merchant={editing} onClose={() => setEditing(null)} />}
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

/** Store-profile inputs common to both dialogs. */
function StoreProfileFields({
  form,
  patch,
  categories,
}: {
  form: StoreFields;
  patch: (p: Partial<StoreFields>) => void;
  categories: Row[] | undefined;
}) {
  return (
    <>
      <Field label="التصنيف" required>
        <select
          value={form.categoryId}
          onChange={(e) => patch({ categoryId: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
        >
          <option value="">— اختر —</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameAr}
            </option>
          ))}
        </select>
      </Field>
      <Field label="رقم هاتف المتجر (اختياري)" hint="لو مختلف عن رقم المالك">
        <Input
          value={form.storePhone}
          dir="ltr"
          placeholder="01XXXXXXXXX"
          onChange={(e) => patch({ storePhone: e.target.value })}
        />
      </Field>
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
      <div />
      <div className="col-span-2">
        <Field label="العنوان" required>
          <Input
            value={form.addressLine}
            onChange={(e) => patch({ addressLine: e.target.value })}
          />
        </Field>
      </div>
      <div className="col-span-2">
        <Field label="موقع المتجر على الخريطة" required>
          <Suspense
            fallback={
              <div className="h-48 rounded-lg border border-border bg-muted/40 grid place-items-center text-xs text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            }
          >
            <MapPicker
              lat={form.lat}
              lng={form.lng}
              initialQuery={form.addressLine || form.storeNameAr}
              onChange={({ lat, lng, address }) =>
                patch({ lat, lng, addressLine: form.addressLine || address || form.addressLine })
              }
            />
          </Suspense>
        </Field>
      </div>
      <Field label="المحافظة" required>
        <Input value={form.governorate} onChange={(e) => patch({ governorate: e.target.value })} />
      </Field>
      <Field label="المدينة" required>
        <Input value={form.city} onChange={(e) => patch({ city: e.target.value })} />
      </Field>
    </>
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
    addressLine: form.addressLine.trim(),
    lat: form.lat,
    lng: form.lng,
    governorate: form.governorate.trim(),
    city: form.city.trim(),
  };
}

function toStoreFields(m: Row): StoreFields {
  return {
    storeNameAr: m.storeNameAr ?? '',
    storeName: m.storeName ?? '',
    categoryId: m.categoryId ?? m.category?.id ?? '',
    description: m.description ?? '',
    logoUrl: m.logoUrl ?? '',
    coverUrl: m.coverUrl ?? '',
    storePhone: m.phone ?? '',
    commissionPct: m.commissionPct != null ? String(m.commissionPct) : '',
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
    mutationFn: (data: Record<string, unknown>) => api.adminUpdateMerchant(merchant.id, data),
    onSuccess: () => {
      toast.success('تم حفظ بيانات التاجر');
      qc.invalidateQueries({ queryKey: ['admin', 'merchants'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const patch = (p: Partial<StoreFields>) => setStore((s) => ({ ...s, ...p }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="تعديل بيانات التاجر" size="lg">
      <div className="grid grid-cols-2 gap-3">
        <StoreProfileFields form={store} patch={patch} categories={categories} />

        <div className="col-span-2 pt-2 mt-1 border-t border-border">
          <span className="text-xs font-bold text-muted-foreground">بيانات المالك</span>
        </div>
        <Field label="اسم المالك">
          <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </Field>
        <Field label="رقم المالك الرئيسي (للدخول)">
          <Input value={ownerPhone} dir="ltr" onChange={(e) => setOwnerPhone(e.target.value)} />
        </Field>
        <SecondaryPhonesEditor phones={secondaryPhones} onChange={setSecondaryPhones} />
      </div>

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
  storeNameAr: '',
  storeName: '',
  categoryId: '',
  description: '',
  logoUrl: '',
  coverUrl: '',
  storePhone: '',
  commissionPct: '',
  addressLine: '',
  lat: 26.0297,
  lng: 32.8146,
  governorate: 'قنا',
  city: 'قفط',
};

function CreateMerchantDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
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
      <div className="grid grid-cols-2 gap-3">
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
        <div />

        <div className="col-span-2 pt-2 mt-1 border-t border-border">
          <span className="text-xs font-bold text-muted-foreground">بيانات المتجر</span>
        </div>
        <StoreProfileFields form={store} patch={patch} categories={categories} />
      </div>
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
