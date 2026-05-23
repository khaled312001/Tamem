import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export function ProductsPage() {
  const qc = useQueryClient();
  const [merchantFilter, setMerchantFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: merchants } = useQuery({
    queryKey: ['admin', 'merchants', 'all'],
    queryFn: () => api.adminListMerchants({ pageSize: 100 }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'products', merchantFilter],
    queryFn: () =>
      api.adminListProducts({
        pageSize: 100,
        ...(merchantFilter ? { merchantId: merchantFilter } : {}),
      }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: unknown }) => api.adminUpdateProduct(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkMut = useMutation({
    mutationFn: ({ ids, isAvailable }: { ids: string[]; isAvailable: boolean }) =>
      api.adminBulkProductAvailability(ids, isAvailable),
    onSuccess: () => {
      toast.success('تم التحديث');
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleSel = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">المنتجات</h1>
          <p className="text-sm text-muted-foreground mt-1">{data?.pagination.total ?? 0} منتج</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          منتج
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-border p-4 flex items-center gap-3">
        <label className="text-sm font-bold">التاجر:</label>
        <select
          value={merchantFilter}
          onChange={(e) => setMerchantFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-input bg-white text-sm"
        >
          <option value="">جميع التجار</option>
          {(merchants?.items as Row[] | undefined)?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.storeNameAr}
            </option>
          ))}
        </select>
        {selected.size > 0 && (
          <div className="ms-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkMut.mutate({ ids: Array.from(selected), isAvailable: true })}
            >
              تفعيل ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkMut.mutate({ ids: Array.from(selected), isAvailable: false })}
            >
              تعطيل ({selected.size})
            </Button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={6} cols={5} />
          </div>
        ) : !data?.items.length ? (
          <EmptyState icon={<Box className="w-10 h-10" />} title="لا توجد منتجات" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-right">
                  <th className="px-3 py-3 w-8" />
                  <th className="px-3 py-3 font-bold">المنتج</th>
                  <th className="px-3 py-3 font-bold">التاجر</th>
                  <th className="px-3 py-3 font-bold">السعر</th>
                  <th className="px-3 py-3 font-bold">متاح</th>
                  <th className="px-3 py-3 font-bold">المخزون</th>
                </tr>
              </thead>
              <tbody>
                {(data.items as Row[]).map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSel(p.id)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.nameAr}</div>
                      <div className="text-xs text-muted-foreground">{p.name}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{p.merchant?.storeNameAr ?? '—'}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        defaultValue={Number(p.price)}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== Number(p.price))
                            updateMut.mutate({ id: p.id, data: { price: v } });
                        }}
                        className="w-24 px-2 py-1 rounded border border-input bg-white text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={p.isAvailable}
                          onChange={(e) =>
                            updateMut.mutate({
                              id: p.id,
                              data: { isAvailable: e.target.checked },
                            })
                          }
                        />
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      {p.stock !== null ? <Badge>{p.stock}</Badge> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createOpen && (
        <CreateProductDialog
          merchants={(merchants?.items as Row[]) ?? []}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

function CreateProductDialog({ merchants, onClose }: { merchants: Row[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    merchantId: merchants[0]?.id ?? '',
    name: '',
    nameAr: '',
    description: '',
    price: 0,
    unit: '',
    isAvailable: true,
  });
  const mut = useMutation({
    mutationFn: () => api.adminCreateProduct(form),
    onSuccess: () => {
      toast.success('تم إنشاء المنتج');
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="منتج جديد">
      <div className="space-y-3">
        <Field label="التاجر" required>
          <select
            value={form.merchantId}
            onChange={(e) => setForm({ ...form, merchantId: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
          >
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.storeNameAr}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الاسم (ع)" required>
          <Input
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
          />
        </Field>
        <Field label="الاسم (En)" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            dir="ltr"
          />
        </Field>
        <Field label="الوصف">
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="السعر" required>
            <Input
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            />
          </Field>
          <Field label="الوحدة">
            <Input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="كيلو / علبة / حبة..."
            />
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          إضافة
        </Button>
      </div>
    </Dialog>
  );
}
