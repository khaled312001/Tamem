import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input } from '../components/ui/Input.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CouponRow = any;

export function CouponsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CouponRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: () => api.adminListCoupons() as Promise<CouponRow[]>,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.adminDeleteCoupon(id),
    onSuccess: () => {
      toast.success('تم تعطيل الكوبون');
      qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.adminUpdateCoupon(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'coupons'] }),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">الكوبونات</h1>
          <p className="text-sm text-muted-foreground mt-1">أكواد خصم تستخدمها للعروض الترويجية</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          كوبون جديد
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : !data?.length ? (
          <EmptyState
            icon={<Tag className="w-12 h-12" />}
            title="لا توجد كوبونات بعد"
            description="أنشئ أول كوبون لبدء الحملات الترويجية"
            action={<Button onClick={() => setCreateOpen(true)}>أنشئ كوبون</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-right">
                  <th className="px-3 py-3 font-bold">الكود</th>
                  <th className="px-3 py-3 font-bold">القيمة</th>
                  <th className="px-3 py-3 font-bold">الحد الأدنى</th>
                  <th className="px-3 py-3 font-bold">الاستخدامات</th>
                  <th className="px-3 py-3 font-bold">الصلاحية</th>
                  <th className="px-3 py-3 font-bold">نشط</th>
                  <th className="px-3 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id} className="border-b border-border/50">
                    <td className="px-3 py-3 font-mono font-bold">{c.code}</td>
                    <td className="px-3 py-3">
                      {c.type === 'PERCENTAGE' ? (
                        <Badge>{Number(c.value)}%</Badge>
                      ) : (
                        <Badge>{Number(c.value)} ج.م</Badge>
                      )}
                      {c.maxDiscount && (
                        <div className="text-xs text-muted-foreground mt-1">
                          أقصى {Number(c.maxDiscount)} ج.م
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {c.minOrderAmount ? `${Number(c.minOrderAmount)} ج.م` : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-bold">{c._count?.redemptions ?? 0}</div>
                      {c.usageLimit && (
                        <div className="text-xs text-muted-foreground">من {c.usageLimit}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {c.validTo
                        ? `حتى ${new Date(c.validTo).toLocaleDateString('ar-EG')}`
                        : 'مفتوح'}
                    </td>
                    <td className="px-3 py-3">
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={c.isActive}
                          onChange={(e) =>
                            toggleMut.mutate({ id: c.id, isActive: e.target.checked })
                          }
                        />
                      </label>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditTarget(c)}
                          title="تعديل"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`حذف الكوبون ${c.code}؟`)) deleteMut.mutate(c.id);
                          }}
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createOpen && <CouponDialog onClose={() => setCreateOpen(false)} />}
      {editTarget && <CouponDialog coupon={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  );
}

function CouponDialog({ coupon, onClose }: { coupon?: CouponRow; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!coupon;
  const [form, setForm] = useState({
    code: coupon?.code ?? '',
    type: (coupon?.type ?? 'PERCENTAGE') as 'PERCENTAGE' | 'FLAT',
    value: Number(coupon?.value ?? 10),
    minOrderAmount: coupon?.minOrderAmount != null ? String(Number(coupon.minOrderAmount)) : '',
    maxDiscount: coupon?.maxDiscount != null ? String(Number(coupon.maxDiscount)) : '',
    usageLimit: coupon?.usageLimit != null ? String(coupon.usageLimit) : '',
    usagePerUser: Number(coupon?.usagePerUser ?? 1),
    description: coupon?.description ?? '',
  });

  const payload = () => ({
    code: form.code.toUpperCase(),
    type: form.type,
    value: Number(form.value),
    minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : null,
    maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
    usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
    usagePerUser: form.usagePerUser,
    description: form.description || null,
  });

  const mut = useMutation({
    mutationFn: () =>
      isEdit ? api.adminUpdateCoupon(coupon!.id, payload()) : api.adminCreateCoupon(payload()),
    onSuccess: () => {
      toast.success(isEdit ? 'تم تحديث الكوبون' : 'تم إنشاء الكوبون');
      qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSave = form.code.length >= 3 && form.value > 0;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? 'تعديل الكوبون' : 'كوبون جديد'}
    >
      <div className="space-y-3">
        <Field label="الكود" required hint="حروف كبيرة وأرقام و _ و -">
          <Input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            dir="ltr"
            placeholder="WELCOME10"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="نوع الخصم" required>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as 'PERCENTAGE' | 'FLAT' })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
            >
              <option value="PERCENTAGE">نسبة مئوية</option>
              <option value="FLAT">مبلغ ثابت</option>
            </select>
          </Field>
          <Field label={form.type === 'PERCENTAGE' ? 'النسبة %' : 'المبلغ ج.م'} required>
            <Input
              type="number"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الحد الأدنى للطلب">
            <Input
              type="number"
              value={form.minOrderAmount}
              onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })}
              placeholder="اختياري"
            />
          </Field>
          {form.type === 'PERCENTAGE' && (
            <Field label="أقصى خصم">
              <Input
                type="number"
                value={form.maxDiscount}
                onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                placeholder="اختياري"
              />
            </Field>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="حد الاستخدامات الكلي">
            <Input
              type="number"
              value={form.usageLimit}
              onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
              placeholder="بلا حد"
            />
          </Field>
          <Field label="استخدام/عميل">
            <Input
              type="number"
              value={form.usagePerUser}
              onChange={(e) => setForm({ ...form, usagePerUser: Number(e.target.value) || 1 })}
            />
          </Field>
        </div>
        <Field label="الوصف (للأدمن فقط)">
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="حملة العام الجديد"
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => canSave && mut.mutate()} disabled={!canSave || mut.isPending}>
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEdit ? 'حفظ' : 'إنشاء'}
        </Button>
      </div>
    </Dialog>
  );
}
