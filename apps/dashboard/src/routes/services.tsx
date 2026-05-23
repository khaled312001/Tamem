import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceRow = any;

const CATEGORY_LABELS: Record<string, string> = {
  DELIVERY: 'دليفري',
  SHIPPING: 'شحن',
  MERCHANT: 'تاجر',
};

export function ServicesPage() {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<ServiceRow | null>(null);

  const { data: services, isLoading } = useQuery({
    queryKey: ['admin', 'services'],
    queryFn: () => api.adminListServices() as Promise<ServiceRow[]>,
  });

  const dupMut = useMutation({
    mutationFn: (id: string) => api.adminDuplicateService(id),
    onSuccess: () => {
      toast.success('تم استنساخ الخدمة');
      qc.invalidateQueries({ queryKey: ['admin', 'services'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.adminDeleteService(id),
    onSuccess: () => {
      toast.success('تم تعطيل الخدمة');
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ['admin', 'services'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">الخدمات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {services?.length ?? 0} خدمة — الخدمات هي قلب التطبيق
          </p>
        </div>
        <Link to="/services/new">
          <Button>
            <Plus className="w-4 h-4" />
            خدمة جديدة
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : !services?.length ? (
        <EmptyState
          icon={<Sparkles className="w-12 h-12" />}
          title="لا توجد خدمات بعد"
          description="أضف أول خدمة لبدء استقبال الطلبات"
          action={
            <Link to="/services/new">
              <Button>أضف خدمة</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-xl border border-border p-5 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <Link
                    to={`/services/${s.id}/edit`}
                    className="font-bold text-lg block hover:text-brand-red"
                  >
                    {s.nameAr}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.name}</div>
                </div>
                {!s.isActive && <Badge variant="warning">معطّلة</Badge>}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Badge>{CATEGORY_LABELS[s.category] ?? s.category}</Badge>
                <Badge>{s.pricingMethod}</Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-3 space-y-1">
                <div>الحقول: {s._count?.fields ?? 0}</div>
                <div>الطلبات: {s._count?.orders ?? 0}</div>
              </div>
              <div className="flex gap-2 mt-4">
                <Link to={`/services/${s.id}/edit`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    تعديل
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dupMut.mutate(s.id)}
                  title="استنساخ"
                >
                  {dupMut.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(s)} title="تعطيل">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <Dialog
          open
          onOpenChange={(o) => !o && setConfirmDelete(null)}
          title={`تعطيل خدمة "${confirmDelete.nameAr}"؟`}
          description="سيتم تعطيل الخدمة وعدم إظهارها في الموبايل. لا تحذف خدمة عليها طلبات نشطة."
        >
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="md" onClick={() => setConfirmDelete(null)}>
              تراجع
            </Button>
            <Button variant="danger" onClick={() => deleteMut.mutate(confirmDelete.id)}>
              تأكيد التعطيل
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
