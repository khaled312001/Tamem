/**
 * Merchant business-hours editor.
 *
 * The admin picks a merchant and edits 7-row weekly schedule + manual status
 * override. Auto-default schedule (Sat-Thu 10am-10pm, Fri closed) is offered
 * for fresh setups.
 *
 * URL: /merchants/:id/hours
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { api } from '../lib/api.js';

interface BusinessHourRow {
  id?: string;
  dayOfWeek: number;
  openMin: number;
  closeMin: number;
  isClosed: boolean;
}

type ManualStatus = 'OPEN' | 'CLOSED' | 'TEMPORARILY_CLOSED';

interface HoursPayload {
  merchant: { id: string; storeNameAr: string; manualStatus: ManualStatus; timezone: string };
  windows: BusinessHourRow[];
  openness: {
    isOpenNow: boolean;
    reason: string | null;
    nextOpenAt: string | null;
    message: string | null;
  };
}

const DAY_LABELS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// 10:00 → 22:00 default
const DEFAULT_OPEN_MIN = 10 * 60;
const DEFAULT_CLOSE_MIN = 22 * 60;

function minToHHMM(m: number): string {
  const norm = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const mi = norm % 60;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

function hhmmToMin(s: string): number {
  const [h, m] = s.split(':').map((x) => Number(x) || 0);
  return Math.max(0, Math.min(2880, (h ?? 0) * 60 + (m ?? 0)));
}

export function MerchantHoursPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'merchant-hours', id],
    queryFn: () => api.adminMerchantHours(id!) as Promise<HoursPayload>,
    enabled: !!id,
  });

  // Local state — one row per weekday. We coalesce multi-window days down
  // to the first window since the dashboard UI keeps it simple; the
  // backend still accepts more.
  const [rows, setRows] = useState<BusinessHourRow[]>([]);
  const [status, setStatus] = useState<ManualStatus>('OPEN');

  useEffect(() => {
    if (!data) return;
    setStatus(data.merchant.manualStatus);
    // Build a 7-row schedule, defaulting unset days to closed.
    const next: BusinessHourRow[] = [];
    for (let d = 0; d < 7; d++) {
      const existing = data.windows.find((w) => w.dayOfWeek === d);
      if (existing) next.push({ ...existing });
      else next.push({ dayOfWeek: d, openMin: 0, closeMin: 0, isClosed: true });
    }
    setRows(next);
  }, [data]);

  const saveHours = useMutation({
    mutationFn: (windows: BusinessHourRow[]) => api.adminSetMerchantHours(id!, windows),
    onSuccess: () => {
      toast.success('تم حفظ مواعيد العمل');
      qc.invalidateQueries({ queryKey: ['admin', 'merchant-hours', id] });
    },
    onError: (err: Error) => toast.error(err.message || 'فشل الحفظ'),
  });

  const setStatusMut = useMutation({
    mutationFn: (s: ManualStatus) => api.adminSetMerchantStatus(id!, s),
    onSuccess: () => {
      toast.success('تم تحديث حالة المتجر');
      qc.invalidateQueries({ queryKey: ['admin', 'merchant-hours', id] });
    },
    onError: (err: Error) => toast.error(err.message || 'فشل التحديث'),
  });

  const applyDefault = () => {
    setRows(
      Array.from({ length: 7 }, (_, d) => ({
        dayOfWeek: d,
        openMin: DEFAULT_OPEN_MIN,
        closeMin: DEFAULT_CLOSE_MIN,
        isClosed: d === 5, // Friday closed by default
      })),
    );
  };

  const updateRow = (i: number, patch: Partial<BusinessHourRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const onSave = () => {
    // Strip out closed days entirely so the backend doesn't carry rows that
    // don't actually open. Validate that closeMin > openMin on the rest.
    const cleaned = rows.filter((r) => !r.isClosed);
    for (const r of cleaned) {
      if (r.closeMin <= r.openMin) {
        toast.error(`وقت الإغلاق لازم يكون بعد وقت الفتح في ${DAY_LABELS[r.dayOfWeek]}`);
        return;
      }
    }
    saveHours.mutate(cleaned);
  };

  if (isLoading || !data) {
    return <div className="p-6">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <button
        onClick={() => navigate(`/merchants`)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-red"
      >
        <ArrowRight className="w-4 h-4" /> العودة لقائمة التجار
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">مواعيد العمل</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.merchant.storeNameAr} · {data.merchant.timezone}
          </p>
        </div>
        <Button size="md" onClick={onSave} disabled={saveHours.isPending}>
          {saveHours.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          حفظ
        </Button>
      </div>

      {/* Current openness banner */}
      <div
        className={`rounded-xl p-4 ${
          data.openness.isOpenNow
            ? 'bg-green-50 border border-green-200'
            : 'bg-amber-50 border border-amber-200'
        }`}
      >
        <div className="font-bold">
          {data.openness.isOpenNow ? '✓ المتجر مفتوح حالياً' : (data.openness.message ?? 'مغلق')}
        </div>
      </div>

      {/* Manual status override */}
      <div className="bg-white rounded-xl border border-border p-4">
        <h2 className="font-bold mb-2">حالة المتجر</h2>
        <p className="text-xs text-muted-foreground mb-3">
          استخدم "مغلق" لإيقاف الطلبات بشكل دائم، أو "مغلق مؤقتاً" لإيقاف سريع (لحالات الطوارئ).
          "مفتوح" يعتمد على مواعيد العمل بالأسفل.
        </p>
        <div className="flex gap-2 flex-wrap">
          {[
            {
              v: 'OPEN' as const,
              label: '✓ مفتوح (حسب المواعيد)',
              color: 'bg-green-100 text-green-800',
            },
            {
              v: 'TEMPORARILY_CLOSED' as const,
              label: '⏸ مغلق مؤقتاً',
              color: 'bg-amber-100 text-amber-800',
            },
            { v: 'CLOSED' as const, label: '✕ مغلق', color: 'bg-red-100 text-red-800' },
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => {
                setStatus(opt.v);
                setStatusMut.mutate(opt.v);
              }}
              disabled={setStatusMut.isPending}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                status === opt.v
                  ? `${opt.color} ring-2 ring-brand-red`
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly schedule */}
      <div className="bg-white rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">المواعيد الأسبوعية</h2>
          <button
            onClick={applyDefault}
            className="inline-flex items-center gap-1 text-xs text-brand-red hover:underline"
          >
            <RotateCcw className="w-3 h-3" /> تطبيق مواعيد افتراضية (10ص-10م، الجمعة إجازة)
          </button>
        </div>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div
              key={i}
              className={`grid grid-cols-12 gap-3 items-center p-3 rounded-lg border ${
                row.isClosed ? 'bg-muted/30 border-border' : 'bg-white border-border'
              }`}
            >
              <div className="col-span-2 font-bold text-sm">{DAY_LABELS[i]}</div>
              <div className="col-span-2">
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!row.isClosed}
                    onChange={(e) => updateRow(i, { isClosed: !e.target.checked })}
                    className="w-4 h-4 accent-brand-red"
                  />
                  {row.isClosed ? 'مغلق' : 'مفتوح'}
                </label>
              </div>
              <div className="col-span-3">
                <label className="text-xs text-muted-foreground">من:</label>
                <input
                  type="time"
                  disabled={row.isClosed}
                  value={minToHHMM(row.openMin)}
                  onChange={(e) => updateRow(i, { openMin: hhmmToMin(e.target.value) })}
                  className="w-full px-2 py-1 border border-input rounded text-sm disabled:bg-muted"
                />
              </div>
              <div className="col-span-3">
                <label className="text-xs text-muted-foreground">إلى:</label>
                <input
                  type="time"
                  disabled={row.isClosed}
                  value={minToHHMM(row.closeMin)}
                  onChange={(e) => updateRow(i, { closeMin: hhmmToMin(e.target.value) })}
                  className="w-full px-2 py-1 border border-input rounded text-sm disabled:bg-muted"
                />
              </div>
              <div className="col-span-2 text-end">
                {!row.isClosed && (
                  <button
                    onClick={() => updateRow(i, { isClosed: true })}
                    title="جعله إجازة"
                    className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> إجازة
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
