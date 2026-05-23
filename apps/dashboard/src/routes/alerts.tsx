import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, CheckCircle2, DollarSign, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Textarea } from '../components/ui/Input.js';
import { CardSkeleton, EmptyState } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { connectSocket } from '../lib/socket.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const FILTERS = [
  { value: '', label: 'الكل' },
  { value: 'CRITICAL', label: 'حرج' },
  { value: 'HIGH', label: 'عالي' },
  { value: 'MEDIUM', label: 'متوسط' },
] as const;

const TYPE_ICONS: Record<string, React.ReactNode> = {
  PENDING_ORDER: <BellRing className="w-5 h-5" />,
  DRIVER_NOT_RESPONDING: <Truck className="w-5 h-5" />,
  CASH_LIMIT_EXCEEDED: <DollarSign className="w-5 h-5" />,
  COMPLAINT: <AlertTriangle className="w-5 h-5" />,
  PAYMENT_PENDING: <DollarSign className="w-5 h-5" />,
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'border-r-red-500 bg-red-50',
  HIGH: 'border-r-orange-500 bg-orange-50',
  MEDIUM: 'border-r-yellow-500 bg-yellow-50',
  LOW: 'border-r-blue-500 bg-blue-50',
};

const SEVERITY_BADGES: Record<string, 'danger' | 'warning' | 'default'> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'warning',
  LOW: 'default',
};

export function AlertsPage() {
  const qc = useQueryClient();
  const [severity, setSeverity] = useState('');
  const [resolveFor, setResolveFor] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'alerts', severity],
    queryFn: async () => {
      const res = await api.adminListAlerts({
        resolved: 'false',
        ...(severity ? { severity } : {}),
      });
      return res as { data: Row[]; meta?: { stats: Row } } | Row[];
    },
  });

  // Realtime: refresh on new alert
  useEffect(() => {
    const socket = connectSocket();
    const onNew = () => {
      qc.invalidateQueries({ queryKey: ['admin', 'alerts'] });
      toast('⚠️ تنبيه جديد', { description: 'تم إضافة تنبيه إلى المركز' });
    };
    socket.on('alert:new', onNew);
    return () => {
      socket.off('alert:new', onNew);
    };
  }, [qc]);

  // The /alerts response packs stats into `meta`. The api client returns only `.data`,
  // so we re-fetch via raw for stats.
  const items = Array.isArray(data) ? data : ((data as { data?: Row[] })?.data ?? []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">مركز التنبيهات</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length} تنبيه نشط</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border p-3 flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setSeverity(f.value)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm transition ${severity === f.value ? 'bg-brand-red text-white font-bold' : 'hover:bg-muted'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <CardSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="w-12 h-12 text-green-500" />}
          title="لا توجد تنبيهات نشطة"
          description="كل شي على ما يرام 🎉"
        />
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div
              key={a.id}
              className={`bg-white rounded-xl border border-border border-r-4 ${SEVERITY_COLORS[a.severity] ?? ''} p-4 flex items-start gap-4`}
            >
              <div className="text-foreground/80 mt-1">
                {TYPE_ICONS[a.type] ?? <AlertTriangle className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="font-bold">{a.titleAr}</div>
                  <Badge variant={SEVERITY_BADGES[a.severity] ?? 'default'}>{a.severity}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">{a.descriptionAr}</div>
                {a.relatedOrder && (
                  <div className="mt-2 text-xs">
                    الطلب: <span className="font-mono">{a.relatedOrder.orderNumber}</span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(a.createdAt).toLocaleString('ar-EG')}
                </div>
              </div>
              <Button size="sm" onClick={() => setResolveFor(a)}>
                <CheckCircle2 className="w-3 h-3" />
                حلّ
              </Button>
            </div>
          ))}
        </div>
      )}

      {resolveFor && <ResolveDialog alert={resolveFor} onClose={() => setResolveFor(null)} />}
    </div>
  );
}

function ResolveDialog({ alert, onClose }: { alert: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const mut = useMutation({
    mutationFn: () => api.adminResolveAlert(alert.id, note),
    onSuccess: () => {
      toast.success('تم حلّ التنبيه');
      qc.invalidateQueries({ queryKey: ['admin', 'alerts'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={alert.titleAr}>
      <p className="text-sm text-muted-foreground mb-4">{alert.descriptionAr}</p>
      <Field label="ملاحظة الحلّ" required>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="كيف تم حلّ المشكلة..."
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => mut.mutate()} disabled={note.length < 1 || mut.isPending}>
          تأكيد الحلّ
        </Button>
      </div>
    </Dialog>
  );
}
