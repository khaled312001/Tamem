import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input } from '../components/ui/Input.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export function PricingPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: services } = useQuery({
    queryKey: ['admin', 'services'],
    queryFn: () => api.adminListServices() as Promise<Row[]>,
  });

  const { data: rules, isLoading } = useQuery({
    queryKey: ['admin', 'pricing-rules'],
    queryFn: () => api.adminListPricingRules() as Promise<Row[]>,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.adminDeletePricingRule(id),
    onSuccess: () => {
      toast.success('تم الحذف');
      qc.invalidateQueries({ queryKey: ['admin', 'pricing-rules'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">قواعد التسعير</h1>
          <p className="text-sm text-muted-foreground mt-1">
            قواعد تسعير حسب الخدمة والمحافظة — تطبق فوق سعر الخدمة الافتراضي
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          قاعدة جديدة
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={5} cols={5} />
          </div>
        ) : !rules?.length ? (
          <EmptyState
            icon={<DollarSign className="w-12 h-12" />}
            title="لا توجد قواعد تسعير"
            description="السعر الافتراضي من الخدمة يُستخدم إلى أن تُضاف قواعد."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-right">
                  <th className="px-3 py-3 font-bold">الخدمة</th>
                  <th className="px-3 py-3 font-bold">المحافظة</th>
                  <th className="px-3 py-3 font-bold">أساسي</th>
                  <th className="px-3 py-3 font-bold">/كم</th>
                  <th className="px-3 py-3 font-bold">/كجم</th>
                  <th className="px-3 py-3 font-bold">الحد الأدنى</th>
                  <th className="px-3 py-3 font-bold">السريع</th>
                  <th className="px-3 py-3 w-12" />
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="px-3 py-3">{r.service?.nameAr ?? '—'}</td>
                    <td className="px-3 py-3">{r.governorate ?? 'الكل'}</td>
                    <td className="px-3 py-3">{Number(r.basePrice)}</td>
                    <td className="px-3 py-3">{Number(r.pricePerKm)}</td>
                    <td className="px-3 py-3">{Number(r.pricePerKg)}</td>
                    <td className="px-3 py-3">{Number(r.minPrice)}</td>
                    <td className="px-3 py-3">+{Number(r.expressSurcharge)}</td>
                    <td className="px-3 py-3">
                      <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(r.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createOpen && (
        <CreateRuleDialog services={services ?? []} onClose={() => setCreateOpen(false)} />
      )}
    </div>
  );
}

function CreateRuleDialog({ services, onClose }: { services: Row[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    serviceId: services[0]?.id ?? '',
    governorate: '',
    basePrice: 0,
    pricePerKm: 0,
    pricePerKg: 0,
    minPrice: 0,
    fragileSurcharge: 0,
    expressSurcharge: 0,
  });
  const mut = useMutation({
    mutationFn: () => api.adminCreatePricingRule(form),
    onSuccess: () => {
      toast.success('تم إنشاء القاعدة');
      qc.invalidateQueries({ queryKey: ['admin', 'pricing-rules'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="قاعدة تسعير جديدة" size="lg">
      <div className="grid grid-cols-2 gap-3">
        <Field label="الخدمة" required>
          <select
            value={form.serviceId}
            onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameAr}
              </option>
            ))}
          </select>
        </Field>
        <Field label="المحافظة (فارغ = الكل)">
          <Input
            value={form.governorate}
            onChange={(e) => setForm({ ...form, governorate: e.target.value })}
            placeholder="قنا"
          />
        </Field>
        <Field label="السعر الأساسي" required>
          <Input
            type="number"
            value={form.basePrice}
            onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })}
          />
        </Field>
        <Field label="السعر / كم">
          <Input
            type="number"
            value={form.pricePerKm}
            onChange={(e) => setForm({ ...form, pricePerKm: Number(e.target.value) })}
          />
        </Field>
        <Field label="السعر / كجم">
          <Input
            type="number"
            value={form.pricePerKg}
            onChange={(e) => setForm({ ...form, pricePerKg: Number(e.target.value) })}
          />
        </Field>
        <Field label="الحد الأدنى">
          <Input
            type="number"
            value={form.minPrice}
            onChange={(e) => setForm({ ...form, minPrice: Number(e.target.value) })}
          />
        </Field>
        <Field label="إضافة هشّ">
          <Input
            type="number"
            value={form.fragileSurcharge}
            onChange={(e) => setForm({ ...form, fragileSurcharge: Number(e.target.value) })}
          />
        </Field>
        <Field label="إضافة سريع">
          <Input
            type="number"
            value={form.expressSurcharge}
            onChange={(e) => setForm({ ...form, expressSurcharge: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          حفظ
        </Button>
      </div>
    </Dialog>
  );
}
