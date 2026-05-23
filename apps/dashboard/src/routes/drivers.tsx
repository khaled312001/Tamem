import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Truck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { DriverStatusBadge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input } from '../components/ui/Input.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const VEHICLE_TYPES = ['دراجة بخارية', 'سيارة', 'دراجة', 'نقل خفيف', 'نقل ثقيل'];

export function DriversPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

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
            </div>
          ))}
        </div>
      )}

      {createOpen && <CreateDriverDialog onClose={() => setCreateOpen(false)} />}
    </div>
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
          <Input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            dir="ltr"
          />
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
