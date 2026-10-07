import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Clock,
  Copy,
  Loader2,
  Plus,
  Power,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { api } from '../lib/api.js';

// Arabic week, Saturday-first. dayOfWeek matches PHP 'w' (0=Sun … 6=Sat).
const DAYS: { d: number; l: string }[] = [
  { d: 6, l: 'السبت' },
  { d: 0, l: 'الأحد' },
  { d: 1, l: 'الإثنين' },
  { d: 2, l: 'الثلاثاء' },
  { d: 3, l: 'الأربعاء' },
  { d: 4, l: 'الخميس' },
  { d: 5, l: 'الجمعة' },
];

type Shift = { id: string; startTime: string; endTime: string };
type GridDriver = {
  id: string;
  name: string;
  phone: string;
  days: Record<string, Shift[]>;
  weeklyHours: number;
};
type TodayDriver = {
  id: string;
  name: string;
  phone: string;
  status: string;
  scheduledToday: boolean;
  scheduledLabel: string;
  scheduledNow: boolean;
  onShift: boolean;
  startedAt: string | null;
  offSchedule: boolean;
};

function fmt12(t: string): string {
  const parts = t.split(':');
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  const ap = h < 12 ? 'ص' : 'م';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')}${ap}`;
}
function toMin(t: string): number {
  const p = t.split(':');
  return Number(p[0] ?? 0) * 60 + Number(p[1] ?? 0);
}
function isOvernight(s: { startTime: string; endTime: string }): boolean {
  return toMin(s.endTime) <= toMin(s.startTime);
}
function sinceLabel(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime();
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}س ${m}د` : `${m}د`;
}

export function DriverShiftsPage() {
  const [tab, setTab] = useState<'today' | 'week'>('today');
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-2 text-xl font-black">
        <CalendarDays className="h-6 w-6 text-brand-red" /> ورديات المناديب
      </div>
      <div className="flex gap-2">
        <TabBtn active={tab === 'today'} onClick={() => setTab('today')}>
          <Clock className="h-4 w-4" /> اليوم
        </TabBtn>
        <TabBtn active={tab === 'week'} onClick={() => setTab('week')}>
          <CalendarDays className="h-4 w-4" /> الجدول الأسبوعي
        </TabBtn>
      </div>
      {tab === 'today' ? <TodayBoard /> : <WeeklyGrid />}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-bold transition ${
        active
          ? 'bg-brand-red text-white border-brand-red'
          : 'bg-card text-muted-foreground border-border hover:border-foreground/30'
      }`}
    >
      {children}
    </button>
  );
}

// ───────────────────────── Today board ─────────────────────────
function TodayBoard() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'shifts-today'],
    queryFn: () =>
      api.raw.get('/admin/shifts/today').then((r) => r.data.data as { drivers: TodayDriver[] }),
    refetchInterval: 30_000,
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'shifts-today'] });
    qc.invalidateQueries({ queryKey: ['admin', 'drivers'] });
  };
  const toggle = useMutation({
    mutationFn: (p: { id: string; action: 'start' | 'end' }) =>
      api.raw.post(`/admin/drivers/${p.id}/shift/${p.action}`, {}).then((r) => r.data.data),
    onSuccess: (_d, v) => {
      toast.success(v.action === 'start' ? 'بدأت الوردية ✅' : 'انتهت الوردية');
      invalidate();
    },
    onError: () => toast.error('تعذّر التنفيذ'),
  });

  const drivers = data?.drivers ?? [];
  const q = search.trim();
  const match = (d: TodayDriver) => !q || d.name.includes(q) || (d.phone || '').includes(q);
  const onShift = drivers.filter((d) => d.onShift && match(d));
  const expected = drivers.filter((d) => !d.onShift && d.scheduledToday && match(d));
  const rest = drivers.filter((d) => !d.onShift && !d.scheduledToday && match(d));
  const freeForOrders = onShift.filter((d) => d.status === 'AVAILABLE').length;

  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Loader2 className="inline h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* summary */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="على الوردية" value={onShift.length} tone="emerald" />
        <Stat label="متاحين لطلب" value={freeForOrders} tone="sky" />
        <Stat label="متوقّعين لسه" value={expected.length} tone="amber" />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم المندوب أو رقمه…"
          className="w-full rounded-lg border border-input bg-popover py-2 pe-3 ps-9 text-sm outline-none focus:ring-2 focus:ring-brand-red/30"
        />
      </div>

      {expected.length > 0 && (
        <Section title="متوقّعين النهاردة — مبدأوش" accent="text-amber-600">
          {expected.map((d) => (
            <Row key={d.id} d={d} busy={toggle.isPending}>
              <Button size="sm" onClick={() => toggle.mutate({ id: d.id, action: 'start' })}>
                <Power className="h-3.5 w-3.5" /> بدأ الوردية
              </Button>
            </Row>
          ))}
        </Section>
      )}

      {onShift.length > 0 && (
        <Section title="على الوردية الآن" accent="text-emerald-600">
          {onShift.map((d) => (
            <Row key={d.id} d={d} busy={toggle.isPending}>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toggle.mutate({ id: d.id, action: 'end' })}
              >
                <Power className="h-3.5 w-3.5" /> إنهاء
              </Button>
            </Row>
          ))}
        </Section>
      )}

      {rest.length > 0 && (
        <Section title="باقي المناديب (خارج جدول النهاردة)" accent="text-muted-foreground">
          {rest.map((d) => (
            <Row key={d.id} d={d} busy={toggle.isPending}>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toggle.mutate({ id: d.id, action: 'start' })}
              >
                <Power className="h-3.5 w-3.5" /> بدأ (خارج الجدول)
              </Button>
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <div className={`rounded-xl border p-3 text-center ${map[tone]}`}>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-xs font-bold">{label}</div>
    </div>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className={`mb-2 text-xs font-black ${accent}`}>{title}</div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({ d, busy, children }: { d: TodayDriver; busy: boolean; children: React.ReactNode }) {
  const initial = (d.name || '؟').trim().charAt(0);
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${
            d.onShift ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
          }`}
        >
          {initial}
        </div>
        <div className="min-w-0">
          <div className="truncate font-bold">{d.name}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {d.onShift ? (
              <span className="text-emerald-600">
                شغّال منذ {sinceLabel(d.startedAt)}
                {d.offSchedule ? ' · خارج الجدول' : ''}
              </span>
            ) : d.scheduledLabel ? (
              <span>ميعاده: {d.scheduledLabel.split('، ').map(fmtRange).join('، ')}</span>
            ) : (
              <span dir="ltr">{d.phone}</span>
            )}
            {d.onShift && d.status === 'BUSY' && (
              <span className="rounded bg-orange-100 px-1 font-bold text-orange-700">
                مشغول بطلب
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="shrink-0" style={{ opacity: busy ? 0.6 : 1 }}>
        {children}
      </div>
    </div>
  );
}
function fmtRange(r: string): string {
  const [a, b] = r.split('–');
  return a && b ? `${fmt12(a)}–${fmt12(b)}` : r;
}

// ───────────────────────── Weekly grid (sheet) ─────────────────────────
function WeeklyGrid() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'driver-shifts'],
    queryFn: () =>
      api.raw.get('/admin/driver-shifts').then((r) => r.data.data as { drivers: GridDriver[] }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'driver-shifts'] });
  const [adding, setAdding] = useState<{ driver: GridDriver; day: number } | null>(null);
  const [copyFrom, setCopyFrom] = useState<GridDriver | null>(null);
  const [sendDriver, setSendDriver] = useState<GridDriver | null>(null);

  const del = useMutation({
    mutationFn: (id: string) =>
      api.raw.delete(`/admin/driver-shifts/${id}`).then((r) => r.data.data),
    onSuccess: () => {
      toast.success('اتحذفت');
      invalidate();
    },
  });
  const sendAll = useMutation({
    mutationFn: () =>
      api.raw
        .post('/admin/driver-shifts/send', {})
        .then((r) => r.data.data as { messages: number }),
    onSuccess: (d) =>
      toast.success(`اتبعت الجدول للجروب ✅${d?.messages > 1 ? ` (${d.messages} رسائل)` : ''}`),
    onError: (e) => toast.error(sendErr(e)),
  });

  if (isLoading || !data) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Loader2 className="inline h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          الجدول بيكرّر نفسه كل أسبوع — دوس على خانة اليوم عشان تضيف وردية. تقدر تضيف نفس الوردية
          لأكتر من يوم مرة واحدة.
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              if (confirm('إرسال جدول كل المناديب على جروب التلجرام؟')) sendAll.mutate();
            }}
            disabled={sendAll.isPending}
          >
            {sendAll.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            إرسال الجدول للجروب
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCopyFrom(data.drivers[0] ?? null)}>
            <Copy className="h-3.5 w-3.5" /> نسخ جدول مندوب
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="sticky right-0 z-10 bg-muted/50 p-2 text-start font-black">المندوب</th>
              {DAYS.map((day) => (
                <th key={day.d} className="min-w-[96px] p-2 font-bold">
                  {day.l}
                </th>
              ))}
              <th className="p-2 font-bold">ساعات</th>
            </tr>
          </thead>
          <tbody>
            {data.drivers.map((dr) => (
              <tr key={dr.id} className="border-t border-border">
                <td className="sticky right-0 z-10 bg-card p-2 font-bold">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSendDriver(dr)}
                      title="إرسال جدول المندوب على تلجرام"
                      className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-sky-100 hover:text-sky-700"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                    <span className="truncate max-w-[110px]">{dr.name}</span>
                  </div>
                </td>
                {DAYS.map((day) => {
                  const shifts = dr.days[String(day.d)] ?? [];
                  // overnight shifts from the PREVIOUS day spill into this cell
                  const carry = (dr.days[String((day.d + 6) % 7)] ?? []).filter(isOvernight);
                  return (
                    <td
                      key={day.d}
                      className="group cursor-pointer p-1 align-top hover:bg-brand-red/5"
                      onClick={() => setAdding({ driver: dr, day: day.d })}
                    >
                      <div className="flex min-h-[32px] flex-col gap-1">
                        {shifts.map((s) => (
                          <button
                            key={s.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`حذف وردية ${fmt12(s.startTime)}–${fmt12(s.endTime)}؟`))
                                del.mutate(s.id);
                            }}
                            className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800 hover:bg-red-100 hover:text-red-700"
                            title={
                              isOvernight(s)
                                ? 'وردية ليلية تعدّي نص الليل — اضغط للحذف'
                                : 'اضغط للحذف'
                            }
                          >
                            {fmt12(s.startTime)}–{fmt12(s.endTime)}
                            {isOvernight(s) ? ' 🌙' : ''}
                          </button>
                        ))}
                        {carry.map((s) => (
                          <span
                            key={'c' + s.id}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground/70"
                            title="امتداد وردية ليلية من اليوم اللي قبله"
                          >
                            ⟵ حتى {fmt12(s.endTime)}
                          </span>
                        ))}
                        {shifts.length === 0 && carry.length === 0 && (
                          <span className="text-center text-muted-foreground/40 opacity-0 group-hover:opacity-100">
                            +
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="p-2 text-center font-black text-muted-foreground">
                  {dr.weeklyHours}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <AddShiftDialog
          driver={adding.driver}
          day={adding.day}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            invalidate();
          }}
        />
      )}
      {copyFrom && (
        <CopyDriverDialog
          drivers={data.drivers}
          initialFrom={copyFrom}
          onClose={() => setCopyFrom(null)}
          onSaved={() => {
            setCopyFrom(null);
            invalidate();
          }}
        />
      )}
      {sendDriver && <SendScheduleDialog driver={sendDriver} onClose={() => setSendDriver(null)} />}
    </div>
  );
}

// Pulls the backend's Arabic error message when a send fails (e.g. the driver
// hasn't linked Telegram), falling back to a generic line.
function sendErr(e: unknown): string {
  const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data
    ?.error?.message;
  return msg || 'تعذّر الإرسال — اتأكد إن التلجرام متظبط';
}

// Send ONE driver's week: to the group, or privately to that driver's DM.
function SendScheduleDialog({ driver, onClose }: { driver: GridDriver; onClose: () => void }) {
  const send = useMutation({
    mutationFn: (to: 'group' | 'dm') =>
      api.raw
        .post('/admin/driver-shifts/send', { driverId: driver.id, to })
        .then((r) => r.data.data),
    onSuccess: (_d, to) => {
      toast.success(to === 'dm' ? 'اتبعت للمندوب خاص ✅' : 'اتبعت للجروب ✅');
      onClose();
    },
    onError: (e) => toast.error(sendErr(e)),
  });
  const empty = Object.keys(driver.days ?? {}).length === 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`إرسال جدول — ${driver.name}`}>
      <div className="space-y-3">
        {empty && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            المندوب ده لسه مالوش ورديات على الجدول — هيوصله «لا توجد ورديات مسجّلة».
          </div>
        )}
        <p className="text-xs text-muted-foreground">تحب تبعت جدول {driver.name} فين؟</p>
        <button
          onClick={() => send.mutate('group')}
          disabled={send.isPending}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-start transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-60"
        >
          <Users className="h-5 w-5 text-sky-600" />
          <div>
            <div className="font-bold">على جروب التلجرام</div>
            <div className="text-xs text-muted-foreground">
              كل اللي في الجروب يشوف ميعاد المندوب
            </div>
          </div>
        </button>
        <button
          onClick={() => send.mutate('dm')}
          disabled={send.isPending}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-start transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-60"
        >
          <Send className="h-5 w-5 text-emerald-600" />
          <div>
            <div className="font-bold">خاص للمندوب</div>
            <div className="text-xs text-muted-foreground">
              رسالة خاصة للمندوب على تلجرام (لازم يكون رابط البوت)
            </div>
          </div>
        </button>
        {send.isPending && (
          <div className="text-center text-xs text-muted-foreground">
            <Loader2 className="inline h-4 w-4 animate-spin" /> جاري الإرسال…
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4" /> إغلاق
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function AddShiftDialog({
  driver,
  day,
  onClose,
  onSaved,
}: {
  driver: GridDriver;
  day: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [days, setDays] = useState<number[]>([day]);
  const [start, setStart] = useState('16:00');
  const [end, setEnd] = useState('00:00');
  const save = useMutation({
    mutationFn: () =>
      api.raw
        .post('/admin/driver-shifts', { driverId: driver.id, days, startTime: start, endTime: end })
        .then((r) => r.data.data),
    onSuccess: () => {
      toast.success('اتضافت الوردية');
      onSaved();
    },
    onError: () => toast.error('تعذّر الحفظ'),
  });
  const toggleDay = (d: number) =>
    setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`وردية — ${driver.name}`}>
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-sm font-bold">الأيام</div>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((dd) => (
              <button
                key={dd.d}
                onClick={() => toggleDay(dd.d)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                  days.includes(dd.d)
                    ? 'bg-brand-red text-white border-brand-red'
                    : 'bg-muted text-muted-foreground border-border'
                }`}
              >
                {dd.l}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <div className="mb-1 font-bold">من</div>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-lg border border-input bg-popover px-2 py-2"
              dir="ltr"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 font-bold">إلى</div>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-lg border border-input bg-popover px-2 py-2"
              dir="ltr"
            />
          </label>
        </div>
        {toMin(end) <= toMin(start) ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-2 text-xs leading-6 text-sky-800">
            🌙 <b>وردية ليلية:</b> بتبدأ {fmt12(start)} وتنتهي {fmt12(end)} من{' '}
            <b>اليوم اللي بعده</b>. اكتبها مرة واحدة هنا بس — النظام بيفهمها صح، وهتبان في اليومين
            على الجدول.
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            لو خليت وقت النهاية أصغر من البداية، معناها الوردية بتعدّي نص الليل (مثلًا ٨م–٢ص).
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4" /> إلغاء
          </Button>
          <Button onClick={() => save.mutate()} disabled={!days.length || save.isPending}>
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            حفظ
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CopyDriverDialog({
  drivers,
  initialFrom,
  onClose,
  onSaved,
}: {
  drivers: GridDriver[];
  initialFrom: GridDriver;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [from, setFrom] = useState(initialFrom.id);
  const [to, setTo] = useState('');
  const copy = useMutation({
    mutationFn: () =>
      api.raw
        .post('/admin/driver-shifts/copy', { fromDriverId: from, toDriverId: to })
        .then((r) => r.data.data),
    onSuccess: () => {
      toast.success('اتنسخ الجدول');
      onSaved();
    },
    onError: () => toast.error('تعذّر النسخ — اختر مندوبين مختلفين'),
  });
  const sel = 'w-full rounded-lg border border-input bg-popover px-2 py-2 text-sm';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="نسخ جدول مندوب لمندوب">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          هينسخ كل ورديات الأسبوع من المصدر للهدف (وهيمسح جدول الهدف القديم).
        </p>
        <label className="block text-sm">
          <div className="mb-1 font-bold">من (المصدر)</div>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={sel}>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <div className="mb-1 font-bold">إلى (الهدف)</div>
          <select value={to} onChange={(e) => setTo(e.target.value)} className={sel}>
            <option value="">— اختر —</option>
            {drivers
              .filter((d) => d.id !== from)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => copy.mutate()} disabled={!to || copy.isPending}>
            {copy.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            نسخ
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
