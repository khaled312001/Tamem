import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, DollarSign, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Textarea } from '../components/ui/Input.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const TABS = [
  { value: 'PENDING', label: 'بانتظار التأكيد' },
  { value: 'PAID', label: 'مؤكّدة' },
  { value: 'FAILED', label: 'مرفوضة' },
] as const;

export function PaymentsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'PENDING' | 'PAID' | 'FAILED'>('PENDING');
  const [rejectFor, setRejectFor] = useState<Row | null>(null);
  const [zoomProof, setZoomProof] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'payments', status],
    queryFn: () => api.adminListPayments({ status, pageSize: 100 }),
  });

  const confirmMut = useMutation({
    mutationFn: (id: string) => api.adminConfirmPayment(id),
    onSuccess: () => {
      toast.success('تم تأكيد الدفع');
      qc.invalidateQueries({ queryKey: ['admin', 'payments'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">المدفوعات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.pagination.total ?? 0} دفعة في الحالة الحالية
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border p-3 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm transition ${status === t.value ? 'bg-brand-red text-white font-bold' : 'hover:bg-muted'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : !data?.items.length ? (
          <EmptyState icon={<DollarSign className="w-10 h-10" />} title="لا توجد دفعات" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-right">
                  <th className="px-3 py-3 font-bold">الطلب</th>
                  <th className="px-3 py-3 font-bold">العميل</th>
                  <th className="px-3 py-3 font-bold">المبلغ</th>
                  <th className="px-3 py-3 font-bold">الطريقة</th>
                  <th className="px-3 py-3 font-bold">مرجع</th>
                  <th className="px-3 py-3 font-bold">إثبات</th>
                  {status === 'PENDING' && <th className="px-3 py-3 font-bold">إجراء</th>}
                </tr>
              </thead>
              <tbody>
                {(data.items as Row[]).map((p) => (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="px-3 py-3 font-mono text-xs">{p.order?.orderNumber}</td>
                    <td className="px-3 py-3">
                      <div>{p.order?.customer?.name}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {p.order?.customer?.phone}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-bold">
                      {Number(p.amount).toLocaleString('ar-EG')} ج.م
                    </td>
                    <td className="px-3 py-3">
                      <Badge>{p.method}</Badge>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{p.referenceNumber ?? '—'}</td>
                    <td className="px-3 py-3">
                      {p.proofImageUrl ? (
                        <button
                          onClick={() => setZoomProof(p.proofImageUrl)}
                          className="text-brand-red underline text-xs"
                        >
                          عرض
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    {status === 'PENDING' && (
                      <td className="px-3 py-3">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={() => confirmMut.mutate(p.id)}
                            disabled={confirmMut.isPending}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            تأكيد
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setRejectFor(p)}>
                            <XCircle className="w-3 h-3" />
                            رفض
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {zoomProof && (
        <Dialog open onOpenChange={(o) => !o && setZoomProof(null)} title="إثبات الدفع" size="lg">
          <img src={zoomProof} alt="proof" className="w-full rounded-lg" />
        </Dialog>
      )}
      {rejectFor && <RejectDialog payment={rejectFor} onClose={() => setRejectFor(null)} />}
    </div>
  );
}

function RejectDialog({ payment, onClose }: { payment: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: () => api.adminRejectPayment(payment.id, reason),
    onSuccess: () => {
      toast.success('تم رفض الدفعة');
      qc.invalidateQueries({ queryKey: ['admin', 'payments'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="رفض الدفعة">
      <Field label="السبب" required>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="وضّح لماذا تم الرفض..."
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          تراجع
        </Button>
        <Button
          variant="danger"
          disabled={reason.length < 2 || mut.isPending}
          onClick={() => mut.mutate()}
        >
          تأكيد الرفض
        </Button>
      </div>
    </Dialog>
  );
}
