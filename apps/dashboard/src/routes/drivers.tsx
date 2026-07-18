import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IdCard,
  ImagePlus,
  Loader2,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Save,
  Star,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

import { DriverStatusBadge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input } from '../components/ui/Input.js';
import { PhoneInput } from '../components/ui/PhoneInput.js';
import { Pagination } from '../components/ui/Pagination.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { useDebounced } from '../lib/useListQuery.js';
import { uploadFile } from '../lib/uploadFile.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const VEHICLE_TYPES = ['دراجة بخارية', 'سيارة', 'دراجة', 'نقل خفيف', 'نقل ثقيل'];

/** Clamp a free-text percentage into a valid 0–100 number for the API. */
function clampPct(v: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

/** Live "driver X% · company Y%" hint under the share input. */
function ShareHint({ value }: { value: string }) {
  const d = clampPct(value);
  const c = Math.round((100 - d) * 100) / 100;
  return (
    <div className="mt-1 flex items-center gap-3 text-xs">
      <span className="font-bold text-emerald-600">نسبة السائق: {d}%</span>
      <span className="text-muted-foreground">·</span>
      <span className="font-bold text-brand-red">نسبة الشركة: {c}%</span>
    </div>
  );
}

/** Grouped section wrapper for the driver forms — a titled block with a divider. */
function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-black text-brand-red border-b border-border pb-1">{title}</div>
      {children}
    </div>
  );
}

/** Reusable image picker: click-to-upload with preview, spinner, and remove.
 *  Uploads via POST /uploads and stores the returned URL. */
function ImageUploadField({
  label,
  value,
  onChange,
  icon,
  aspect = 'square',
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  icon?: ReactNode;
  aspect?: 'square' | 'card';
}) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const box = aspect === 'card' ? 'aspect-[16/10]' : 'aspect-square';
  const onFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('من فضلك اختر صورة');
      return;
    }
    setBusy(true);
    try {
      const r = await uploadFile(file);
      onChange(r.url);
    } catch (e) {
      toast.error((e as Error).message || 'فشل رفع الصورة');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="text-xs font-bold text-muted-foreground mb-1">{label}</div>
      <label
        htmlFor={inputId}
        className={`relative ${box} w-full rounded-xl border-2 border-dashed border-border overflow-hidden flex items-center justify-center cursor-pointer bg-muted/30 hover:border-brand-red/60 transition`}
      >
        {value ? (
          <img src={value} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            {icon ?? <ImagePlus className="w-6 h-6" />}
            <span className="text-[11px]">اضغط للرفع</span>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-brand-red" />
          </div>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>
      {value && (
        <button
          onClick={() => onChange('')}
          className="mt-1 inline-flex items-center gap-1 text-[11px] text-destructive hover:underline"
        >
          <X className="w-3 h-3" /> إزالة
        </button>
      )}
    </div>
  );
}

export function DriversPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [viewingReviews, setViewingReviews] = useState<Row | null>(null);

  // Server-side search + paging. This screen used to request one capped page of
  // 100 drivers with no search box and no way to reach anyone past row 100.
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const debouncedSearch = useDebounced(search, 300);
  useEffect(() => setPage(1), [debouncedSearch, pageSize]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'drivers', debouncedSearch, page, pageSize],
    queryFn: () =>
      api.adminListDrivers({
        page,
        pageSize,
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      }),
    placeholderData: (prev) => prev,
  });
  const total = data?.pagination.total ?? 0;

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'AVAILABLE' | 'BUSY' | 'OFFLINE' }) =>
      api.adminUpdateDriverStatus(id, status),
    onSuccess: () => {
      toast.success('تم تحديث الحالة');
      qc.invalidateQueries({ queryKey: ['admin', 'drivers'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.adminDeleteDriver(id),
    onSuccess: () => {
      toast.success('تم حذف السائق');
      qc.invalidateQueries({ queryKey: ['admin', 'drivers'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">السائقون</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} سائق</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          إضافة سائق
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-border p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو رقم الهاتف…"
          className="w-full"
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : !data?.items.length ? (
        <EmptyState
          icon={<Truck className="w-12 h-12" />}
          title="لا يوجد سائقون"
          action={<Button onClick={() => setCreateOpen(true)}>أضف سائق</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(data.items as Row[]).map((d) => (
            <div key={d.id} className="bg-white rounded-xl border border-border p-5">
              <div className="flex items-start gap-3">
                {d.avatarUrl ? (
                  <img
                    src={d.avatarUrl}
                    alt={d.name}
                    className="w-12 h-12 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-brand-red text-white flex items-center justify-center font-bold">
                    {d.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <div className="flex-1">
                  <div className="font-bold">{d.name}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">
                    {d.phone}
                  </div>
                  <div className="mt-2">
                    <DriverStatusBadge status={d.driverProfile?.status ?? 'OFFLINE'} />
                  </div>
                </div>
              </div>
              <div className="mt-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المركبة</span>
                  <span>
                    {d.driverProfile?.vehicleType} {d.driverProfile?.vehiclePlate}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المحافظة</span>
                  <span>{d.driverProfile?.governorate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">التوصيلات</span>
                  <span className="font-bold">{d.driverProfile?.totalDeliveries ?? 0}</span>
                </div>
                {d.driverProfile?.rating && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">التقييم</span>
                    <span>⭐ {Number(d.driverProfile.rating).toFixed(1)}</span>
                  </div>
                )}
              </div>
              <div className="mt-4 flex gap-1">
                {(['AVAILABLE', 'BUSY', 'OFFLINE'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatusMut.mutate({ id: d.id, status: s })}
                    disabled={updateStatusMut.isPending || d.driverProfile?.status === s}
                    className={`flex-1 text-xs py-1 rounded transition ${d.driverProfile?.status === s ? 'bg-brand-red text-white font-bold' : 'bg-muted hover:bg-muted/70'}`}
                  >
                    {s === 'AVAILABLE' ? 'متاح' : s === 'BUSY' ? 'مشغول' : 'غير متصل'}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  onClick={() => setEditing(d)}
                  className="inline-flex items-center gap-1 text-xs text-brand-red hover:underline"
                >
                  <Pencil className="w-3 h-3" /> تعديل البيانات
                </button>
                <button
                  onClick={() => setViewingReviews(d)}
                  className="inline-flex items-center gap-1 text-xs text-brand-orange hover:underline"
                >
                  <Star className="w-3 h-3" /> التقييمات
                </button>
                <button
                  onClick={() => {
                    if (confirm(`حذف السائق "${d.name}"؟`)) deleteMut.mutate(d.id);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                >
                  <Trash2 className="w-3 h-3" /> حذف
                </button>
              </div>
            </div>
          ))}
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

      {createOpen && <CreateDriverDialog onClose={() => setCreateOpen(false)} />}
      {editing && <EditDriverDialog driver={editing} onClose={() => setEditing(null)} />}
      {viewingReviews && (
        <DriverReviewsDialog driver={viewingReviews} onClose={() => setViewingReviews(null)} />
      )}
    </div>
  );
}

function EditDriverDialog({ driver, onClose }: { driver: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: driver.name ?? '',
    phone: driver.phone ?? '',
    governorate: driver.driverProfile?.governorate ?? '',
    vehicleType: driver.driverProfile?.vehicleType ?? '',
    vehiclePlate: driver.driverProfile?.vehiclePlate ?? '',
    nationalId: driver.driverProfile?.nationalId ?? '',
    notes: driver.driverProfile?.notes ?? '',
    deliverySharePct: String(driver.driverProfile?.deliverySharePct ?? 0),
    avatarUrl: driver.avatarUrl ?? driver.driverProfile?.avatarUrl ?? '',
    vehicleImageUrl: driver.driverProfile?.vehicleImageUrl ?? '',
    idCardFrontUrl: driver.driverProfile?.idCardFrontUrl ?? '',
    idCardBackUrl: driver.driverProfile?.idCardBackUrl ?? '',
  });
  const [secondaryPhones, setSecondaryPhones] = useState<string[]>(
    Array.isArray(driver.secondaryPhones) ? driver.secondaryPhones : [],
  );
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.adminUpdateDriver(driver.id, data),
    onSuccess: () => {
      toast.success('تم حفظ بيانات السائق');
      qc.invalidateQueries({ queryKey: ['admin', 'drivers'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="تعديل بيانات السائق" size="lg">
      <DriverForm
        f={f}
        set={set}
        secondaryPhones={secondaryPhones}
        setSecondaryPhones={setSecondaryPhones}
        submitting={mut.isPending}
        submitLabel="حفظ التغييرات"
        onSubmit={() =>
          mut.mutate({
            name: f.name.trim() || undefined,
            phone: f.phone.trim() || undefined,
            nationalId: f.nationalId.trim() || undefined,
            governorate: f.governorate.trim() || undefined,
            vehicleType: f.vehicleType.trim() || undefined,
            vehiclePlate: f.vehiclePlate.trim() || undefined,
            notes: f.notes.trim() || undefined,
            deliverySharePct: clampPct(f.deliverySharePct),
            avatarUrl: f.avatarUrl,
            vehicleImageUrl: f.vehicleImageUrl,
            idCardFrontUrl: f.idCardFrontUrl,
            idCardBackUrl: f.idCardBackUrl,
            secondaryPhones: secondaryPhones.map((p) => p.trim()).filter(Boolean),
          })
        }
      />
    </Dialog>
  );
}

/** Shared body for add + edit — the sectioned, image-friendly driver form. */
type DriverFormState = {
  name: string;
  phone: string;
  governorate: string;
  vehicleType: string;
  vehiclePlate: string;
  nationalId: string;
  notes: string;
  deliverySharePct: string;
  avatarUrl: string;
  vehicleImageUrl: string;
  idCardFrontUrl: string;
  idCardBackUrl: string;
};

function DriverForm({
  f,
  set,
  secondaryPhones,
  setSecondaryPhones,
  submitting,
  submitLabel,
  onSubmit,
  usePhoneComponent = true,
}: {
  f: DriverFormState;
  set: (k: keyof DriverFormState) => (v: string) => void;
  secondaryPhones: string[];
  setSecondaryPhones: (v: string[]) => void;
  submitting: boolean;
  submitLabel: string;
  onSubmit: () => void;
  usePhoneComponent?: boolean;
}) {
  return (
    <div className="space-y-5">
      {/* Basic info + driver photo */}
      <FormSection title="البيانات الأساسية">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="w-28 shrink-0">
            <ImageUploadField label="صورة السائق" value={f.avatarUrl} onChange={set('avatarUrl')} />
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="الاسم" required>
              <Input value={f.name} onChange={(e) => set('name')(e.target.value)} />
            </Field>
            <Field label="رقم الهاتف (للدخول)" required>
              {usePhoneComponent ? (
                <PhoneInput value={f.phone} onChange={set('phone')} />
              ) : (
                <Input dir="ltr" value={f.phone} onChange={(e) => set('phone')(e.target.value)} />
              )}
            </Field>
            <Field label="الرقم القومي">
              <Input
                dir="ltr"
                value={f.nationalId}
                onChange={(e) => set('nationalId')(e.target.value)}
              />
            </Field>
            <Field label="المحافظة" required>
              <Input value={f.governorate} onChange={(e) => set('governorate')(e.target.value)} />
            </Field>
          </div>
        </div>
      </FormSection>

      {/* Vehicle */}
      <FormSection title="بيانات المركبة">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
            <Field label="نوع المركبة" required>
              <select
                value={f.vehicleType}
                onChange={(e) => set('vehicleType')(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-white"
              >
                <option value="">— اختر —</option>
                {VEHICLE_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="رقم اللوحة" required>
              <Input value={f.vehiclePlate} onChange={(e) => set('vehiclePlate')(e.target.value)} />
            </Field>
          </div>
          <div className="w-full sm:w-44 shrink-0">
            <ImageUploadField
              label="صورة المركبة"
              value={f.vehicleImageUrl}
              onChange={set('vehicleImageUrl')}
              icon={<Truck className="w-6 h-6" />}
              aspect="card"
            />
          </div>
        </div>
      </FormSection>

      {/* ID documents */}
      <FormSection title="صور البطاقة (وش وضهر)">
        <div className="grid grid-cols-2 gap-3">
          <ImageUploadField
            label="البطاقة — الوجه"
            value={f.idCardFrontUrl}
            onChange={set('idCardFrontUrl')}
            icon={<IdCard className="w-6 h-6" />}
            aspect="card"
          />
          <ImageUploadField
            label="البطاقة — الظهر"
            value={f.idCardBackUrl}
            onChange={set('idCardBackUrl')}
            icon={<IdCard className="w-6 h-6" />}
            aspect="card"
          />
        </div>
      </FormSection>

      {/* Revenue share */}
      <FormSection title="نسبة السائق">
        <Field label="نسبة السائق من رسوم التوصيل (%)">
          <Input
            type="number"
            dir="ltr"
            min={0}
            max={100}
            step="0.01"
            value={f.deliverySharePct}
            onChange={(e) => set('deliverySharePct')(e.target.value)}
            placeholder="0 - 100"
          />
          <ShareHint value={f.deliverySharePct} />
        </Field>
      </FormSection>

      {/* Extra numbers + notes */}
      <FormSection title="أرقام احتياطية وملاحظات">
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
          {secondaryPhones.map((p, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
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
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <Field label="ملاحظات">
          <Input value={f.notes} onChange={(e) => set('notes')(e.target.value)} />
        </Field>
      </FormSection>

      <div className="flex justify-end pt-2 border-t border-border sticky bottom-0 bg-white">
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {submitting ? 'جاري الحفظ…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          style={{ fontSize: size, lineHeight: 1, color: i <= rating ? '#F2A93B' : '#D1D5DB' }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function DriverReviewsDialog({ driver, onClose }: { driver: Row; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'driver', driver.id, 'with-reviews'],
    queryFn: () => api.adminGetDriver(driver.id) as Promise<Row>,
  });

  const reviews: Row[] = data?.reviews ?? [];
  const avg = data?.stats?.averageRating;
  const count = data?.stats?.reviewCount ?? 0;
  const dist: Record<string, number> = data?.stats?.distribution ?? {};

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`تقييمات السائق · ${driver.name}`}
      size="lg"
    >
      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin inline" /> جاري التحميل…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="text-xs font-bold text-amber-900/70">المتوسط</div>
              <div className="flex items-center gap-2 mt-1">
                <Stars rating={Math.round(avg ?? 0)} size={20} />
                <span className="text-2xl font-black text-amber-900">
                  {avg != null ? Number(avg).toFixed(2) : '—'}
                </span>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="text-xs font-bold text-blue-900/70">عدد التقييمات</div>
              <div className="text-2xl font-black text-blue-900 mt-1">{count}</div>
            </div>
          </div>

          {/* Star distribution — 5 → 1 */}
          {count > 0 && (
            <div className="bg-white border border-border rounded-xl p-4 space-y-1.5">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                توزيع التقييمات
              </div>
              {[5, 4, 3, 2, 1].map((star) => {
                const n = dist[String(star)] ?? 0;
                const pct = count > 0 ? Math.round((n / count) * 100) : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-8 text-muted-foreground shrink-0">{star} ★</span>
                    <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-end font-bold shrink-0">{n}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Reviews list */}
          {reviews.length === 0 ? (
            <div className="bg-muted/30 rounded-xl p-8 text-center text-sm text-muted-foreground">
              لا توجد تقييمات بعد لهذا السائق
            </div>
          ) : (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> آخر التقييمات
              </div>
              <ul className="space-y-2 max-h-[400px] overflow-y-auto">
                {reviews.map((r) => (
                  <li key={r.id} className="bg-white border border-border rounded-xl p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Stars rating={Number(r.driverRating ?? r.rating)} size={14} />
                      <span className="font-bold">{Number(r.driverRating ?? r.rating)}/5</span>
                      {r.order?.orderNumber && (
                        <span className="font-mono text-xs text-brand-red ms-1">
                          #{r.order.orderNumber}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ms-auto">
                        {new Date(r.createdAt).toLocaleDateString('ar-EG')}
                      </span>
                    </div>
                    {r.comment && (
                      <p className="mt-2 text-sm italic bg-amber-50 border border-amber-100 rounded p-2">
                        "{r.comment}"
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function CreateDriverDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setFState] = useState<DriverFormState>({
    name: '',
    phone: '+20',
    governorate: 'قنا',
    vehicleType: VEHICLE_TYPES[0]!,
    vehiclePlate: '',
    nationalId: '',
    notes: '',
    deliverySharePct: '0',
    avatarUrl: '',
    vehicleImageUrl: '',
    idCardFrontUrl: '',
    idCardBackUrl: '',
  });
  const [secondaryPhones, setSecondaryPhones] = useState<string[]>([]);
  const set = (k: keyof DriverFormState) => (v: string) => setFState((p) => ({ ...p, [k]: v }));

  const mut = useMutation({
    // No password field: the backend auto-generates one; the driver signs in
    // via OTP / reset. We just send the profile + uploaded image URLs.
    mutationFn: () =>
      api.adminCreateDriver({
        name: f.name.trim(),
        phone: f.phone.trim(),
        governorate: f.governorate.trim(),
        vehicleType: f.vehicleType.trim(),
        vehiclePlate: f.vehiclePlate.trim(),
        nationalId: f.nationalId.trim() || undefined,
        notes: f.notes.trim() || undefined,
        deliverySharePct: clampPct(f.deliverySharePct),
        avatarUrl: f.avatarUrl || undefined,
        vehicleImageUrl: f.vehicleImageUrl || undefined,
        idCardFrontUrl: f.idCardFrontUrl || undefined,
        idCardBackUrl: f.idCardBackUrl || undefined,
        secondaryPhones: secondaryPhones.map((p) => p.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      toast.success('تم إضافة السائق');
      qc.invalidateQueries({ queryKey: ['admin', 'drivers'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="إضافة سائق" size="lg">
      <DriverForm
        f={f}
        set={set}
        secondaryPhones={secondaryPhones}
        setSecondaryPhones={setSecondaryPhones}
        submitting={mut.isPending}
        submitLabel="إضافة السائق"
        onSubmit={() => {
          if (
            !f.name.trim() ||
            !f.phone.trim() ||
            !f.vehicleType.trim() ||
            !f.vehiclePlate.trim()
          ) {
            toast.error('الاسم، الهاتف، نوع المركبة، ورقم اللوحة مطلوبين');
            return;
          }
          mut.mutate();
        }}
      />
    </Dialog>
  );
}
