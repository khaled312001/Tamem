import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Store } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

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
            </div>
          ))}
        </div>
      )}

      {createOpen && <CreateMerchantDialog onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function CreateMerchantDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: categories } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => api.adminListCategories() as Promise<Row[]>,
  });
  const [form, setForm] = useState({
    ownerName: '',
    phone: '+20',
    password: '',
    storeName: '',
    storeNameAr: '',
    categoryId: '',
    description: '',
    addressLine: '',
    lat: 26.0297,
    lng: 32.8146,
    governorate: 'قنا',
    city: 'قفط',
  });
  const mut = useMutation({
    mutationFn: () => api.adminCreateMerchant(form),
    onSuccess: () => {
      toast.success('تم إضافة التاجر');
      qc.invalidateQueries({ queryKey: ['admin', 'merchants'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="إضافة تاجر" size="lg">
      <div className="grid grid-cols-2 gap-3">
        <Field label="اسم المالك" required>
          <Input
            value={form.ownerName}
            onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
          />
        </Field>
        <Field label="هاتف المالك" required>
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
        <Field label="التصنيف" required>
          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
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
        <Field label="اسم المتجر (ع)" required>
          <Input
            value={form.storeNameAr}
            onChange={(e) => setForm({ ...form, storeNameAr: e.target.value })}
          />
        </Field>
        <Field label="اسم المتجر (En)" required>
          <Input
            value={form.storeName}
            onChange={(e) => setForm({ ...form, storeName: e.target.value })}
            dir="ltr"
          />
        </Field>
        <div className="col-span-2">
          <Field label="الوصف">
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="العنوان" required>
            <Input
              value={form.addressLine}
              onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
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
                  setForm((f) => ({
                    ...f,
                    lat,
                    lng,
                    // Auto-fill address line only if empty (don't clobber typed input)
                    addressLine: f.addressLine || address || f.addressLine,
                  }))
                }
              />
            </Suspense>
          </Field>
        </div>
        <Field label="المحافظة" required>
          <Input
            value={form.governorate}
            onChange={(e) => setForm({ ...form, governorate: e.target.value })}
          />
        </Field>
        <Field label="المدينة" required>
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
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
