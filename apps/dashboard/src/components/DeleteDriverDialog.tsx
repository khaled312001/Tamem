import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, Repeat, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

import { ORDER_STATUS_AR } from '@tamem/types';

import { api } from '../lib/api.js';
import { formatMoney } from '../lib/format.js';
import { cn } from '../lib/utils.js';

import { Button } from './ui/Button.js';
import { Dialog } from './ui/Dialog.js';

interface OpenOrder {
  id: string;
  orderNumber: string | null;
  status: string;
  customerName: string | null;
  isMain: boolean;
  otherDrivers: string[];
}
interface Preview {
  driver: { id: string; name: string };
  openCount: number;
  staleCount?: number;
  openOrders: OpenOrder[];
  deliveredCount: number;
  unsettledCount: number;
  unsettledAmount: number;
  otherDrivers: { id: string; name: string; phone: string | null; status: string | null }[];
}
type Mode = 'complete' | 'reassign';

const DRIVER_STATUS_AR: Record<string, string> = {
  AVAILABLE: 'متاح',
  BUSY: 'مشغول',
  OFFLINE: 'غير متصل',
};

/**
 * Permanent driver deletion. A driver still carrying orders cannot just vanish:
 * the admin picks whether those orders are closed as delivered or handed to
 * another registered driver, and the server does that and the deletion in one
 * go (all of it or none of it).
 */
export function DeleteDriverDialog({
  driver,
  onClose,
}: {
  driver: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode | null>(null);
  const [toId, setToId] = useState('');

  useEffect(() => {
    setMode(null);
    setToId('');
  }, [driver?.id]);

  const {
    data: p,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['admin', 'drivers', 'delete-preview', driver?.id],
    queryFn: () =>
      api.raw
        .get(`/admin/drivers/${driver!.id}/delete-preview`)
        .then((r) => r.data.data as Preview),
    enabled: !!driver?.id,
    staleTime: 0,
  });

  const del = useMutation({
    mutationFn: () =>
      api.adminDeleteDriver(
        driver!.id,
        p && p.openCount > 0 && mode
          ? { mode, ...(mode === 'reassign' ? { toDriverId: toId } : {}) }
          : undefined,
      ),
    onSuccess: (r) => {
      const extra =
        r.reassigned && r.to
          ? ` — اتنقل ${r.reassigned} طلب لـ ${r.to.name}`
          : r.completed
            ? ` — اتقفل ${r.completed} طلب «تم التوصيل»`
            : '';
      toast.success(`تم حذف المندوب${extra}`);
      qc.invalidateQueries({ queryKey: ['admin', 'drivers'] });
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message);
      // The list may have changed under us (a new order landed) — show it fresh.
      qc.invalidateQueries({ queryKey: ['admin', 'drivers', 'delete-preview', driver?.id] });
    },
  });

  const hasOpen = !!p && p.openCount > 0;
  const ready = !!p && (!hasOpen || mode === 'complete' || (mode === 'reassign' && toId !== ''));
  const nameOf = (id: string) => p?.otherDrivers.find((d) => d.id === id)?.name ?? 'مندوب تاني';

  return (
    <Dialog
      open={!!driver}
      onOpenChange={(o) => !o && !del.isPending && onClose()}
      title={`حذف المندوب «${driver?.name ?? ''}» نهائيًا`}
      size="lg"
    >
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> بنشوف الطلبات اللي معاه…
        </div>
      )}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {p && (
        <div className="space-y-4 text-sm">
          {!hasOpen ? (
            <p className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-xl p-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              المندوب ملوش أي طلب مفتوح — ينفع يتحذف على طول.
            </p>
          ) : (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="font-bold text-amber-900">
                  المندوب معاه {p.openCount} طلب مش مقفول. اختار هتعمل فيهم إيه عشان يتحذف:
                </p>
                {!!p.staleCount && (
                  <p className="text-xs text-amber-800 mt-1">
                    منهم {p.staleCount} طلب أقدم من يومين — غالبًا اتوصّلت ومحدش قفلها. لو قفلتها،
                    كل طلب بيتسجل بتاريخ آخر حركة عليه مش بتاريخ النهارده، فتقارير النهارده مش
                    هتتأثر.
                  </p>
                )}
                <ul className="mt-2 max-h-40 overflow-y-auto divide-y divide-amber-100">
                  {p.openOrders.map((o) => (
                    <li key={o.id} className="py-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="font-mono font-bold">
                        #{o.orderNumber ?? o.id.slice(-6)}
                      </span>
                      <span>
                        {ORDER_STATUS_AR[o.status as keyof typeof ORDER_STATUS_AR] ?? o.status}
                      </span>
                      {o.customerName && (
                        <span className="text-muted-foreground">{o.customerName}</span>
                      )}
                      {(!o.isMain || o.otherDrivers.length > 0) && (
                        <span className="text-xs text-amber-800">
                          (طلب مشترك — معاه {o.otherDrivers.map(nameOf).join('، ') || 'مندوب تاني'})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {p.openCount > p.openOrders.length && (
                  <p className="text-xs text-amber-800 mt-1">
                    و{p.openCount - p.openOrders.length} طلب كمان…
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  active={mode === 'complete'}
                  onClick={() => setMode('complete')}
                  icon={<CheckCircle2 className="w-5 h-5" />}
                  title="أقفل كل الطلبات «تم التوصيل»"
                  body="كل طلب معاه يتسجل اتوصّل ونصيبه منه يتحسب. لو الطلب ليه جزء مع مندوب تاني، الجزء ده بس اللي يتقفل والباقي يفضل مع المندوب التاني."
                />
                <ChoiceCard
                  active={mode === 'reassign'}
                  onClick={() => setMode('reassign')}
                  icon={<Repeat className="w-5 h-5" />}
                  title="انقل الطلبات لمندوب تاني"
                  body="كل الطلبات المفتوحة اللي معاه تروح للمندوب اللي تختاره بنفس حالتها، ويوصله إشعار بيها."
                />
              </div>

              {mode === 'reassign' && (
                <label className="block">
                  <span className="font-bold">المندوب اللي هتروح له الطلبات</span>
                  <select
                    value={toId}
                    onChange={(e) => setToId(e.target.value)}
                    className="mt-1 w-full h-10 rounded-xl border border-border bg-white px-3"
                  >
                    <option value="">— اختار مندوب —</option>
                    {p.otherDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.status ? ` — ${DRIVER_STATUS_AR[d.status] ?? d.status}` : ''}
                      </option>
                    ))}
                  </select>
                  {p.otherDrivers.length === 0 && (
                    <span className="text-xs text-destructive">
                      مفيش مندوب تاني نشط — استخدم الاختيار الأول.
                    </span>
                  )}
                </label>
              )}
            </>
          )}

          {p.unsettledCount > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-red-50 text-red-800 p-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                ليه {formatMoney(p.unsettledAmount)} من {p.unsettledCount} طلب لسه ماتسوّاش. لو
                محتاج تسوّي حسابه اعملها قبل الحذف — بعده مش هيظهر في تقرير المناديب.
              </span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            طلباته القديمة المقفولة ({p.deliveredCount}) هتفضل زي ما هي في الطلبات والتقارير العامة.
            الحذف مش بيترجع.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={del.isPending}>
              إلغاء
            </Button>
            <Button
              variant="danger"
              onClick={() => del.mutate()}
              disabled={!ready || del.isPending}
            >
              {del.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {hasOpen && mode === 'reassign' && toId
                ? `انقل لـ ${nameOf(toId)} واحذف`
                : hasOpen && mode === 'complete'
                  ? 'اقفل الطلبات واحذف'
                  : 'حذف نهائي'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ChoiceCard({
  active,
  onClick,
  icon,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-start rounded-xl border-2 p-3 transition',
        active ? 'border-brand-red bg-brand-red/5' : 'border-border hover:border-brand-red/40',
      )}
    >
      <span className={cn('flex items-center gap-2 font-bold', active && 'text-brand-red')}>
        {icon}
        {title}
      </span>
      <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">{body}</span>
    </button>
  );
}
