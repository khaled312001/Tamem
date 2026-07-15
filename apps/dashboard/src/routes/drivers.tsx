import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquare, Pencil, Phone, Plus, Save, Star, Truck, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { DriverStatusBadge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input } from '../components/ui/Input.js';
import { PhoneInput } from '../components/ui/PhoneInput.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const VEHICLE_TYPES = ['دراجة بخارية', 'سيارة', 'دراجة', 'نقل خفيف', 'نقل ثقيل'];

export function DriversPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [viewingReviews, setViewingReviews] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'drivers'],
    queryFn: () => api.adminListDrivers({ pageSize: 100 }),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'AVAILABLE' | 'BUSY' | 'OFFLINE' }) =>
      api.adminUpdateDriverStatus(id, status),
    onSuccess: () => {
      toast.success('تم تحديث الحالة');
      qc.invalidateQueries({ queryKey: ['admin', 'drivers'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">السائقون</h1>
          <p className="text-sm text-muted-foreground mt-1">{data?.pagination.total ?? 0} سائق</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          إضافة سائق
        </Button>
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
                <div className="w-12 h-12 rounded-full bg-brand-red text-white flex items-center justify-center font-bold">
                  {d.name?.[0]?.toUpperCase() ?? '?'}
                </div>
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
              </div>
            </div>
          ))}
        </div>
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
  const [name, setName] = useState<string>(driver.name ?? '');
  const [phone, setPhone] = useState<string>(driver.phone ?? '');
  const [governorate, setGovernorate] = useState<string>(driver.driverProfile?.governorate ?? '');
  const [vehicleType, setVehicleType] = useState<string>(driver.driverProfile?.vehicleType ?? '');
  const [vehiclePlate, setVehiclePlate] = useState<string>(
    driver.driverProfile?.vehiclePlate ?? '',
  );
  const [nationalId, setNationalId] = useState<string>(driver.driverProfile?.nationalId ?? '');
  const [notes, setNotes] = useState<string>(driver.driverProfile?.notes ?? '');
  const [secondaryPhones, setSecondaryPhones] = useState<string[]>(
    Array.isArray(driver.secondaryPhones) ? driver.secondaryPhones : [],
  );

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
    <Dialog open onOpenChange={(o) => !o && onClose()} title="تعديل بيانات السائق" size="md">
      <div className="space-y-3">
        <Field label="الاسم">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="رقم الهاتف الرئيسي (للدخول)">
          <PhoneInput value={phone} onChange={setPhone} />
        </Field>
        <Field label="الرقم القومي">
          <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
        </Field>
        <Field label="المحافظة">
          <Input value={governorate} onChange={(e) => setGovernorate(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="نوع المركبة">
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm"
            >
              <option value="">—</option>
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="رقم اللوحة">
            <Input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} />
          </Field>
        </div>
        <Field label="ملاحظات">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

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

        <div className="flex justify-end pt-2 border-t border-border">
          <button
            onClick={() =>
              mut.mutate({
                name: name.trim() || undefined,
                phone: phone.trim() || undefined,
                nationalId: nationalId.trim() || undefined,
                governorate: governorate.trim() || undefined,
                vehicleType: vehicleType.trim() || undefined,
                vehiclePlate: vehiclePlate.trim() || undefined,
                notes: notes.trim() || undefined,
                secondaryPhones: secondaryPhones.map((p) => p.trim()).filter(Boolean),
              })
            }
            disabled={mut.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-red text-white font-bold disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {mut.isPending ? 'جاري الحفظ…' : 'حفظ التغييرات'}
          </button>
        </div>
      </div>
    </Dialog>
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
  const [form, setForm] = useState({
    name: '',
    phone: '+20',
    password: '',
    vehicleType: VEHICLE_TYPES[0]!,
    vehiclePlate: '',
    nationalId: '',
    governorate: 'قنا',
  });
  const mut = useMutation({
    mutationFn: () => api.adminCreateDriver(form),
    onSuccess: () => {
      toast.success('تم إضافة السائق');
      qc.invalidateQueries({ queryKey: ['admin', 'drivers'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="إضافة سائق" size="lg">
      <div className="grid grid-cols-2 gap-3">
        <Field label="الاسم" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="الهاتف" required>
          <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        </Field>
        <Field label="كلمة المرور" required>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Field label="نوع المركبة" required>
          <select
            value={form.vehicleType}
            onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
          >
            {VEHICLE_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="رقم اللوحة" required>
          <Input
            value={form.vehiclePlate}
            onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })}
          />
        </Field>
        <Field label="الرقم القومي">
          <Input
            value={form.nationalId}
            onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
          />
        </Field>
        <Field label="المحافظة" required>
          <Input
            value={form.governorate}
            onChange={(e) => setForm({ ...form, governorate: e.target.value })}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
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
