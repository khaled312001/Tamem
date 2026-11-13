/**
 * «حجز الأماكن» — the office side of the drivers' seat booking.
 *
 * The office decides the seats (per weekday: time windows and how many drivers
 * each needs); drivers take them from their own page (deliverytamem.com/captain/)
 * like bus seats. Here the office sees who sits where, seats or frees a driver,
 * changes seats and hours, sets the rules, and reviews the ID photos drivers
 * upload. A booking is an ordinary «جدول المناديب» shift, so attendance and the
 * bonus/deductions see it with no extra step.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Copy,
  ExternalLink,
  IdCard,
  Loader2,
  Minus,
  Plus,
  Settings2,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { Dialog } from '../components/ui/Dialog.js';
import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';

interface Booking {
  shiftId: string;
  driverId: string;
  name: string | null;
  phone: string | null;
  validFrom: string | null;
}
interface Slot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
  taken: number;
  hours: number;
  bookings: Booking[];
}
interface Driver {
  id: string;
  name: string;
  phone: string | null;
  weeklyHours: number;
  idStatus: 'MISSING' | 'PENDING' | 'APPROVED' | 'REJECTED';
  idNote: string | null;
  idSubmittedAt: string | null;
  idFront: string | null;
  idBack: string | null;
}
interface Rules {
  maxHoursPerDay: number;
  requireIdCard: boolean;
  open: boolean;
  note: string;
}
interface Data {
  slots: Slot[];
  drivers: Driver[];
  rules: Rules;
  days: { dayOfWeek: number; label: string }[];
  portalUrl: string;
}

const KEY = ['admin', 'shift-booking'];
const ID_LABEL: Record<Driver['idStatus'], [string, string]> = {
  MISSING: ['مارفعش', 'bg-muted text-muted-foreground'],
  PENDING: ['مستني مراجعة', 'bg-amber-100 text-amber-800'],
  APPROVED: ['مقبولة', 'bg-emerald-100 text-emerald-800'],
  REJECTED: ['مرفوضة', 'bg-red-100 text-red-700'],
};

function t12(t: string): string {
  const h = Number(t.slice(0, 2));
  const m = t.slice(3, 5);
  if (h === 0 && m === '00') return '12 بالليل';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m !== '00' ? ':' + m : ''} ${h < 12 ? 'ص' : 'م'}`;
}
const errMsg = (e: unknown) => (e as Error)?.message || 'حصلت مشكلة';

export function ShiftBookingPanel() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: () => api.raw.get('/admin/shift-booking').then((r) => r.data.data as Data),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ['admin', 'driver-shifts'] });
  };
  const [view, setView] = useState<'seats' | 'ids'>('seats');
  const [addFor, setAddFor] = useState<number | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  if (isLoading)
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-brand-red" />
      </div>
    );
  if (error || !data) return <p className="text-sm text-destructive">{errMsg(error)}</p>;

  const pendingIds = data.drivers.filter((d) => d.idStatus === 'PENDING').length;

  return (
    <div className="space-y-4">
      <PortalCard url={data.portalUrl} rules={data.rules} onRules={() => setRulesOpen(true)} />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setView('seats')}
          className={cn(
            'rounded-lg border px-3 py-1.5 text-sm font-bold',
            view === 'seats'
              ? 'border-brand-red bg-brand-red/5 text-brand-red'
              : 'border-border bg-card',
          )}
        >
          الأماكن والحجوزات
        </button>
        <button
          onClick={() => setView('ids')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold',
            view === 'ids'
              ? 'border-brand-red bg-brand-red/5 text-brand-red'
              : 'border-border bg-card',
          )}
        >
          <IdCard className="h-4 w-4" /> بطايق المناديب
          {pendingIds > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 text-[11px] text-white">
              {pendingIds}
            </span>
          )}
        </button>
      </div>

      {view === 'ids' ? (
        <IdCards drivers={data.drivers} onDone={refresh} />
      ) : data.slots.length === 0 ? (
        <EmptySeats onDone={refresh} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.days.map((d) => (
              <DayCard
                key={d.dayOfWeek}
                label={d.label}
                today={d.dayOfWeek === new Date().getDay()}
                slots={data.slots.filter((s) => s.dayOfWeek === d.dayOfWeek)}
                drivers={data.drivers}
                onAdd={() => setAddFor(d.dayOfWeek)}
                onDone={refresh}
              />
            ))}
          </div>
          <HoursTable drivers={data.drivers} />
        </>
      )}

      {addFor !== null && (
        <AddSlotDialog
          days={data.days}
          initialDay={addFor}
          onClose={() => setAddFor(null)}
          onDone={refresh}
        />
      )}
      {rulesOpen && (
        <RulesDialog rules={data.rules} onClose={() => setRulesOpen(false)} onDone={refresh} />
      )}
    </div>
  );
}

function PortalCard({ url, rules, onRules }: { url: string; rules: Rules; onRules: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-black">صفحة المناديب</p>
          <p className="text-xs text-muted-foreground">
            ابعت اللينك للمناديب: يدخل باسمه ورقمه، يشوف بياناته، يرفع صورة بطاقته، ويحجز ورديته.
            الصفحة مش بتظهر في جوجل.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRules}>
          <Settings2 className="h-4 w-4" /> قواعد الحجز
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-muted px-3 py-1.5 text-sm" dir="ltr">
          {url}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(url).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => toast.error('انسخه يدوي'),
            );
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} نسخ
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-bold text-brand-red hover:underline"
        >
          <ExternalLink className="h-4 w-4" /> افتح
        </a>
      </div>
      <p className="text-xs text-muted-foreground">
        {rules.open ? '🟢 الحجز مفتوح' : '🔴 الحجز مقفول'} · لحد {rules.maxHoursPerDay} ساعات في
        اليوم للمندوب ·{' '}
        {rules.requireIdCard ? 'لازم يرفع البطاقة قبل ما يحجز' : 'البطاقة مش شرط للحجز'}
        {rules.note ? ` · ملاحظة للمناديب: «${rules.note}»` : ''}
      </p>
    </div>
  );
}

function EmptySeats({ onDone }: { onDone: () => void }) {
  const [cap, setCap] = useState('3');
  const make = useMutation({
    mutationFn: () => api.raw.post('/admin/shift-slots/defaults', { capacity: Number(cap) || 3 }),
    onSuccess: () => {
      toast.success('اتعمل جدول الأماكن');
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center space-y-3">
      <p className="font-black">لسه مفيش أماكن للحجز</p>
      <p className="text-sm text-muted-foreground">
        اعمل الجدول الأساسي لكل أيام الأسبوع: ٨ص–١٢م، ١٢م–٤م، ٤م–٨م، ٨م–١٢ بالليل — وبعدها عدّل أي
        يوم براحتك.
      </p>
      <div className="flex items-center justify-center gap-2 text-sm">
        <span>عدد المناديب في كل وردية:</span>
        <input
          type="number"
          min={1}
          max={50}
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-center"
          dir="ltr"
        />
        <Button onClick={() => make.mutate()} disabled={make.isPending}>
          {make.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          اعمل الجدول
        </Button>
      </div>
    </div>
  );
}

function DayCard({
  label,
  today,
  slots,
  drivers,
  onAdd,
  onDone,
}: {
  label: string;
  today: boolean;
  slots: Slot[];
  drivers: Driver[];
  onAdd: () => void;
  onDone: () => void;
}) {
  const need = slots.reduce((a, s) => a + s.capacity, 0);
  const got = slots.reduce((a, s) => a + s.taken, 0);
  return (
    <div
      className={cn(
        'rounded-2xl border bg-card p-3 space-y-2',
        today ? 'border-brand-red' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between">
        <p className="font-black">
          {label}
          {today && <span className="ms-2 text-xs text-brand-red">النهارده</span>}
        </p>
        <span
          className={cn('text-xs font-bold', got < need ? 'text-amber-700' : 'text-emerald-700')}
        >
          {got}/{need} مكان
        </span>
      </div>
      {slots.map((s) => (
        <SlotRow key={s.id} slot={s} drivers={drivers} onDone={onDone} />
      ))}
      <button
        onClick={onAdd}
        className="w-full rounded-lg border border-dashed border-border py-1.5 text-xs font-bold text-muted-foreground hover:border-brand-red/50"
      >
        + وردية في اليوم ده
      </button>
    </div>
  );
}

function SlotRow({ slot, drivers, onDone }: { slot: Slot; drivers: Driver[]; onDone: () => void }) {
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editTime, setEditTime] = useState(false);
  const [st, setSt] = useState(slot.startTime);
  const [en, setEn] = useState(slot.endTime);
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: onDone,
    onError: (e) => toast.error(errMsg(e)),
  });
  const full = slot.taken >= slot.capacity;
  const seated = new Set(slot.bookings.map((b) => b.driverId));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div
      className={cn(
        'rounded-xl border p-2.5 text-sm',
        full ? 'border-emerald-300 bg-emerald-50/40' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {editTime ? (
          <span className="flex items-center gap-1" dir="ltr">
            <input
              type="time"
              value={st}
              onChange={(e) => setSt(e.target.value)}
              className="rounded border border-border px-1 text-xs"
            />
            –
            <input
              type="time"
              value={en}
              onChange={(e) => setEn(e.target.value)}
              className="rounded border border-border px-1 text-xs"
            />
            <button
              className="text-emerald-700"
              title="حفظ — الساعات الجديدة تبدأ من بكرة"
              onClick={() =>
                run.mutate(() =>
                  api.raw
                    .patch(`/admin/shift-slots/${slot.id}`, { startTime: st, endTime: en })
                    .then(() => {
                      setEditTime(false);
                      toast.success('الساعات الجديدة تبدأ من بكرة');
                    }),
                )
              }
            >
              <Check className="h-4 w-4" />
            </button>
            <button onClick={() => setEditTime(false)} className="text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </span>
        ) : (
          <button
            className="font-black hover:underline"
            title="تعديل الساعات"
            onClick={() => setEditTime(true)}
          >
            {t12(slot.startTime)} ← {t12(slot.endTime)}
          </button>
        )}
        <span className="flex items-center gap-1">
          <button
            title="مكان أقل"
            disabled={slot.capacity <= Math.max(1, slot.taken) || run.isPending}
            onClick={() =>
              run.mutate(() =>
                api.raw.patch(`/admin/shift-slots/${slot.id}`, { capacity: slot.capacity - 1 }),
              )
            }
            className="rounded border border-border p-0.5 disabled:opacity-30"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span
            className={cn(
              'min-w-[3ch] text-center text-xs font-bold',
              full ? 'text-emerald-700' : 'text-amber-700',
            )}
          >
            {slot.taken}/{slot.capacity}
          </span>
          <button
            title="مكان زيادة"
            disabled={slot.capacity >= 50 || run.isPending}
            onClick={() =>
              run.mutate(() =>
                api.raw.patch(`/admin/shift-slots/${slot.id}`, { capacity: slot.capacity + 1 }),
              )
            }
            className="rounded border border-border p-0.5 disabled:opacity-30"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            title="شيل الوردية"
            onClick={() => setConfirmDel(true)}
            className="ms-1 text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {slot.bookings.map((b) => (
          <span
            key={b.shiftId}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-bold"
          >
            {b.name ?? 'مندوب'}
            {b.validFrom && b.validFrom > today && (
              <span className="font-normal text-muted-foreground">
                (من {b.validFrom.slice(5).replace('-', '/')})
              </span>
            )}
            <button
              title="شيله من الوردية"
              onClick={() =>
                run.mutate(() =>
                  api.raw.delete(`/admin/shift-slots/${slot.id}/bookings/${b.driverId}`),
                )
              }
              className="text-muted-foreground hover:text-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {!full &&
          (adding ? (
            <select
              autoFocus
              className="rounded-full border border-border bg-background px-2 py-0.5 text-xs"
              defaultValue=""
              onBlur={() => setAdding(false)}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                setAdding(false);
                run.mutate(() =>
                  api.raw.post(`/admin/shift-slots/${slot.id}/bookings`, { driverId: id }),
                );
              }}
            >
              <option value="">— اختار مندوب —</option>
              {drivers
                .filter((d) => !seated.has(d.id))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-brand-red/50"
            >
              <UserPlus className="h-3 w-3" /> احجز لمندوب
            </button>
          ))}
      </div>
      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title="شيل الوردية دي؟"
        message={
          slot.taken
            ? `فيه ${slot.taken} مندوب حاجزينها — هيتشالوا منها (أيامهم اللي فاتت بتفضل محسوبة زي ما هي).`
            : 'مفيش حد حاجزها.'
        }
        confirmLabel="شيلها"
        loading={run.isPending}
        onConfirm={() =>
          run.mutate(() =>
            api.raw.delete(`/admin/shift-slots/${slot.id}`).then(() => setConfirmDel(false)),
          )
        }
      />
    </div>
  );
}

function AddSlotDialog({
  days,
  initialDay,
  onClose,
  onDone,
}: {
  days: { dayOfWeek: number; label: string }[];
  initialDay: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<number[]>([initialDay]);
  const [st, setSt] = useState('08:00');
  const [en, setEn] = useState('12:00');
  const [cap, setCap] = useState('3');
  const save = useMutation({
    mutationFn: () =>
      api.raw.post('/admin/shift-slots', {
        days: picked,
        startTime: st,
        endTime: en,
        capacity: Number(cap) || 1,
      }),
    onSuccess: (r) => {
      const n = (r.data?.data?.created as number) ?? 0;
      toast.success(n ? `اتضافت ${n} وردية` : 'الوردية دي موجودة بالفعل');
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="وردية جديدة" size="md">
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {days.map((d) => (
            <button
              key={d.dayOfWeek}
              onClick={() =>
                setPicked((p) =>
                  p.includes(d.dayOfWeek)
                    ? p.filter((x) => x !== d.dayOfWeek)
                    : [...p, d.dayOfWeek],
                )
              }
              className={cn(
                'rounded-lg border px-2.5 py-1 text-xs font-bold',
                picked.includes(d.dayOfWeek)
                  ? 'border-brand-red bg-brand-red/5 text-brand-red'
                  : 'border-border',
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2" dir="ltr">
          <input
            type="time"
            value={st}
            onChange={(e) => setSt(e.target.value)}
            className="rounded-lg border border-border px-2 py-1.5"
          />
          <span>→</span>
          <input
            type="time"
            value={en}
            onChange={(e) => setEn(e.target.value)}
            className="rounded-lg border border-border px-2 py-1.5"
          />
        </div>
        <label className="flex items-center gap-2">
          عدد المناديب:
          <input
            type="number"
            min={1}
            max={50}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            className="w-20 rounded-lg border border-border px-2 py-1.5 text-center"
            dir="ltr"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          نهاية ١٢:٠٠ ص يعني لحد نص الليل. اليوم بيقفل الساعة ١٢ بالليل، واللي بعدها بيتحسب على
          اليوم اللي بعده.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => save.mutate()} disabled={!picked.length || save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} أضف
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function RulesDialog({
  rules,
  onClose,
  onDone,
}: {
  rules: Rules;
  onClose: () => void;
  onDone: () => void;
}) {
  const [r, setR] = useState<Rules>(rules);
  useEffect(() => setR(rules), [rules]);
  const save = useMutation({
    mutationFn: () => api.raw.put('/admin/shift-booking/rules', r),
    onSuccess: () => {
      toast.success('اتحفظت القواعد');
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="قواعد الحجز" size="md">
      <div className="space-y-3 text-sm">
        <label className="flex items-center justify-between gap-3">
          <span>
            <b>الحجز مفتوح</b>
            <span className="block text-xs text-muted-foreground">
              لو قفلته، المندوب يشوف ورديّاته بس ومايقدرش يحجز أو يلغي.
            </span>
          </span>
          <input
            type="checkbox"
            checked={r.open}
            onChange={(e) => setR({ ...r, open: e.target.checked })}
            className="h-5 w-5 accent-brand-red"
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>
            <b>لازم يرفع البطاقة الأول</b>
            <span className="block text-xs text-muted-foreground">
              مايقدرش يحجز غير بعد ما يرفع صورة البطاقة وش وضهر.
            </span>
          </span>
          <input
            type="checkbox"
            checked={r.requireIdCard}
            onChange={(e) => setR({ ...r, requireIdCard: e.target.checked })}
            className="h-5 w-5 accent-brand-red"
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>
            <b>أقصى ساعات في اليوم للمندوب</b>
            <span className="block text-xs text-muted-foreground">
              ٤ = وردية واحدة، ٨ = ورديتين. الإدارة تقدر تتخطاها.
            </span>
          </span>
          <input
            type="number"
            min={1}
            max={16}
            value={r.maxHoursPerDay}
            onChange={(e) => setR({ ...r, maxHoursPerDay: Number(e.target.value) || 1 })}
            className="w-20 rounded-lg border border-border px-2 py-1.5 text-center"
            dir="ltr"
          />
        </label>
        <label className="block">
          <b>ملاحظة تظهر للمناديب فوق الحجز</b>
          <input
            value={r.note}
            maxLength={300}
            onChange={(e) => setR({ ...r, note: e.target.value })}
            placeholder="مثال: حجز الأسبوع الجاي بيقفل الخميس ١٠ بالليل"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function HoursTable({ drivers }: { drivers: Driver[] }) {
  const list = [...drivers].sort((a, b) => b.weeklyHours - a.weeklyHours);
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="mb-2 font-black">ساعات كل مندوب في الأسبوع (من الحجز)</p>
      <div className="flex flex-wrap gap-1.5">
        {list.map((d) => (
          <span
            key={d.id}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-bold',
              d.weeklyHours === 0
                ? 'bg-muted text-muted-foreground'
                : 'bg-emerald-50 text-emerald-800',
            )}
          >
            {d.name} · {d.weeklyHours} س
          </span>
        ))}
      </div>
    </div>
  );
}

/** An ID photo kept off the public web: fetched with the admin's token, shown from a blob. */
export function PrivateImage({
  refId,
  alt,
  className,
  link = true,
}: {
  refId: string;
  alt: string;
  className?: string;
  link?: boolean;
}) {
  const { data: src, isError } = useQuery({
    queryKey: ['private-file', refId],
    queryFn: () =>
      api.raw
        .get('/admin/private-file', { params: { ref: refId }, responseType: 'blob' })
        .then((r) => URL.createObjectURL(r.data as Blob)),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  });
  if (isError)
    return (
      <div className={cn('grid place-items-center text-xs text-muted-foreground', className)}>
        تعذّر التحميل
      </div>
    );
  if (!src)
    return (
      <div className={cn('grid place-items-center', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  if (!link) return <img src={src} alt={alt} className={className} />;
  return (
    <a href={src} target="_blank" rel="noreferrer">
      <img src={src} alt={alt} className={className} />
    </a>
  );
}

function IdThumb({ value, alt }: { value: string | null; alt: string }) {
  const cls = 'h-24 w-full rounded-lg border border-border object-cover bg-muted';
  if (!value)
    return (
      <div className={cn(cls, 'grid place-items-center text-xs text-muted-foreground')}>مفيش</div>
    );
  if (value.startsWith('private:')) return <PrivateImage refId={value} alt={alt} className={cls} />;
  return (
    <a href={value} target="_blank" rel="noreferrer">
      <img src={value} alt={alt} className={cls} />
    </a>
  );
}

function IdCards({ drivers, onDone }: { drivers: Driver[]; onDone: () => void }) {
  const [filter, setFilter] = useState<'all' | Driver['idStatus']>('PENDING');
  const order: Driver['idStatus'][] = ['PENDING', 'REJECTED', 'MISSING', 'APPROVED'];
  const list = drivers
    .filter((d) => filter === 'all' || d.idStatus === filter)
    .sort((a, b) => order.indexOf(a.idStatus) - order.indexOf(b.idStatus));
  const [rejecting, setRejecting] = useState<Driver | null>(null);
  const [note, setNote] = useState('');
  const review = useMutation({
    mutationFn: (v: { id: string; status: 'APPROVED' | 'REJECTED'; note?: string }) =>
      api.raw.post(`/admin/drivers/${v.id}/id-review`, { status: v.status, note: v.note }),
    onSuccess: (_r, v) => {
      toast.success(
        v.status === 'APPROVED' ? 'البطاقة اتقبلت' : 'اترفضت — المندوب هيشوف السبب في صفحته',
      );
      setRejecting(null);
      setNote('');
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 text-xs">
        {(['PENDING', 'REJECTED', 'MISSING', 'APPROVED', 'all'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn(
              'rounded-lg border px-2.5 py-1 font-bold',
              filter === k
                ? 'border-brand-red bg-brand-red/5 text-brand-red'
                : 'border-border bg-card',
            )}
          >
            {k === 'all' ? 'الكل' : ID_LABEL[k][0]} (
            {k === 'all' ? drivers.length : drivers.filter((d) => d.idStatus === k).length})
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="text-sm text-muted-foreground">مفيش مناديب هنا.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((d) => (
          <div key={d.id} className="rounded-2xl border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-black">{d.name}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {d.phone}
                </p>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-bold',
                  ID_LABEL[d.idStatus][1],
                )}
              >
                {ID_LABEL[d.idStatus][0]}
              </span>
            </div>
            {d.idStatus !== 'MISSING' && (
              <div className="grid grid-cols-2 gap-2">
                <IdThumb value={d.idFront} alt="وش البطاقة" />
                <IdThumb value={d.idBack} alt="ضهر البطاقة" />
              </div>
            )}
            {d.idStatus === 'REJECTED' && d.idNote && (
              <p className="text-xs text-red-700">السبب: {d.idNote}</p>
            )}
            {(d.idStatus === 'PENDING' ||
              d.idStatus === 'REJECTED' ||
              d.idStatus === 'APPROVED') && (
              <div className="flex gap-2">
                {d.idStatus !== 'APPROVED' && (
                  <Button
                    size="sm"
                    onClick={() => review.mutate({ id: d.id, status: 'APPROVED' })}
                    disabled={review.isPending}
                  >
                    <Check className="h-4 w-4" /> قبول
                  </Button>
                )}
                {d.idStatus !== 'REJECTED' && (
                  <Button size="sm" variant="outline" onClick={() => setRejecting(d)}>
                    <X className="h-4 w-4" /> رفض
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {rejecting && (
        <Dialog
          open
          onOpenChange={(o) => !o && setRejecting(null)}
          title={`رفض بطاقة ${rejecting.name}`}
          size="sm"
        >
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              السبب بيظهر للمندوب في صفحته عشان يصوّرها تاني صح.
            </p>
            <input
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: الصورة مش واضحة / ناقص ضهر البطاقة"
              className="w-full rounded-lg border border-border px-3 py-2"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejecting(null)}>
                إلغاء
              </Button>
              <Button
                variant="danger"
                disabled={!note.trim() || review.isPending}
                onClick={() =>
                  review.mutate({ id: rejecting.id, status: 'REJECTED', note: note.trim() })
                }
              >
                رفض
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
