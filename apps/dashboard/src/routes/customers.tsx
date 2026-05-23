import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

import { StatusBadge } from '../components/ui/Badge.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Input } from '../components/ui/Input.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export function CustomersPage() {
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

function CustomerDetailDialog({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
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
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="الهاتف">
              <span dir="ltr">{data.phone}</span>
            </Detail>
            <Detail label="الإيميل">{data.email ?? '—'}</Detail>
            <Detail label="المدينة">{data.city ?? '—'}</Detail>
            <Detail label="المحافظة">{data.governorate ?? '—'}</Detail>
          </div>
          {data.defaultAddress && <Detail label="العنوان">{data.defaultAddress}</Detail>}

          <div>
            <div className="text-xs uppercase font-bold text-muted-foreground mb-2">
              آخر الطلبات
            </div>
            {data.customerOrders?.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                لا توجد طلبات بعد
              </div>
            ) : (
              <div className="space-y-1">
                {data.customerOrders.map((o: Row) => (
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
        </div>
      )}
    </Dialog>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}
