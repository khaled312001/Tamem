/**
 * Supervisors management — admins configure on-shift supervisors who get
 * the WhatsApp dispatch for every NEW order. Single page packs three
 * concerns: the current on-shift banner (so admins see at a glance whether
 * any order is being received now), the supervisors CRUD list (with an
 * inline shifts panel per row), and a dispatch reports dialog.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { PhoneInput } from '../components/ui/PhoneInput.js';
import { CardSkeleton, EmptyState } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';

// ────────────────────────────────────────────────────────────────────────────
// Types — kept loose since backend wiring is in flight; we only depend on
// the shapes documented in the design endpoints.
// ────────────────────────────────────────────────────────────────────────────

type ShiftKind = 'MORNING' | 'EVENING' | 'CUSTOM';

interface Shift {
  id: string;
  supervisorId: string;
  kind: ShiftKind;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  daysOfWeek: number[]; // 0..6, empty = all days
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface Supervisor {
  id: string;
  name: string;
  whatsappPhone: string;
  isActive: boolean;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  shifts?: Shift[];
  isOnShiftNow?: boolean;
}

interface ListResponse {
  supervisors: Supervisor[];
}

interface CurrentResponse {
  supervisor:
    | (Pick<Supervisor, 'id' | 'name' | 'whatsappPhone' | 'isActive'> & {
        shift?: Pick<Shift, 'kind' | 'startTime' | 'endTime'> | null;
      })
    | null;
}

interface ReportResponse {
  supervisorId: string;
  period: 'daily' | 'weekly' | 'monthly';
  totalDispatches: number;
  successCount: number;
  failureCount: number;
  breakdown: { date: string; count: number; status?: string }[];
}

// ────────────────────────────────────────────────────────────────────────────
// Constants — Arabic labels match brand voice; days indexed 0=Sunday.
// ────────────────────────────────────────────────────────────────────────────

const DAY_LABELS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const SHIFT_KIND_META: Record<ShiftKind, { label: string; tone: string }> = {
  MORNING: { label: 'صباحي', tone: 'bg-amber-100 text-amber-800 border-amber-200' },
  EVENING: { label: 'مسائي', tone: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  CUSTOM: { label: 'مخصص', tone: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
};

// Loose E.164-ish: optional +, then 8..15 digits. Accepts local Egyptian
// format too (01xxxxxxxxx) since the backend normalises on its side.
const PHONE_RE = /^\+?\d{8,15}$/;

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export function SupervisorsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supervisor | null>(null);
  const [shiftsTarget, setShiftsTarget] = useState<Supervisor | null>(null);
  const [reportsTarget, setReportsTarget] = useState<Supervisor | null>(null);
  const [expandedShiftsId, setExpandedShiftsId] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['admin', 'supervisors'],
    queryFn: async (): Promise<Supervisor[]> => {
      const res = await api.raw.get('/admin/supervisors');
      // The PHP shim returns a bare paginated array ({ data: [...], meta });
      // the Node backend returns { supervisors: [...] }. Handle both so the
      // list actually renders the rows that were saved.
      const body = res.data?.data ?? res.data;
      if (Array.isArray(body)) return body as Supervisor[];
      return ((body as ListResponse)?.supervisors as Supervisor[]) ?? [];
    },
  });

  const currentQ = useQuery({
    queryKey: ['admin', 'supervisors', 'current'],
    queryFn: async (): Promise<CurrentResponse['supervisor']> => {
      const res = await api.raw.get('/admin/supervisors/current');
      const body = (res.data?.data ?? res.data) as CurrentResponse;
      return body.supervisor ?? null;
    },
    // The duty supervisor can flip every few minutes as shifts roll over;
    // refresh quietly so the banner stays honest.
    refetchInterval: 60_000,
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.raw.delete(`/admin/supervisors/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('تم تعطيل المشرف');
      qc.invalidateQueries({ queryKey: ['admin', 'supervisors'] });
      qc.invalidateQueries({ queryKey: ['admin', 'supervisors', 'current'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const supervisors = listQ.data ?? [];

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-brand-red" /> المشرفون
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            عيّن مشرفين بشيفتات يومية — يستلم كل واحد طلبات الـ NEW على واتساب أثناء شيفته.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="lg">
          <Plus className="w-4 h-4" />
          إضافة مشرف
        </Button>
      </header>

      {/* Current-on-shift banner */}
      <CurrentBanner loading={currentQ.isLoading} current={currentQ.data ?? null} />

      {/* List */}
      <section className="space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5">
          <Users className="w-4 h-4" /> كل المشرفين
        </div>

        {listQ.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : !supervisors.length ? (
          <div className="bg-white rounded-xl border border-border">
            <EmptyState
              icon={<UserCheck className="w-12 h-12" />}
              title="لا يوجد مشرفون بعد"
              description="أضف أول مشرف وحدد شيفته ليبدأ في استلام طلبات الـ NEW على واتساب."
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="w-4 h-4" /> إضافة مشرف
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-2">
            {supervisors.map((s) => (
              <SupervisorRow
                key={s.id}
                supervisor={s}
                expanded={expandedShiftsId === s.id}
                onToggleExpand={() => setExpandedShiftsId((p) => (p === s.id ? null : s.id))}
                onEdit={() => setEditTarget(s)}
                onShifts={() => setShiftsTarget(s)}
                onReports={() => setReportsTarget(s)}
                onDeactivate={() => {
                  if (window.confirm(`تعطيل المشرف "${s.name}"؟`)) {
                    deactivateMut.mutate(s.id);
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Dialogs */}
      {createOpen && <SupervisorFormDialog onClose={() => setCreateOpen(false)} />}
      {editTarget && (
        <SupervisorFormDialog supervisor={editTarget} onClose={() => setEditTarget(null)} />
      )}
      {shiftsTarget && (
        <ShiftsDialog supervisor={shiftsTarget} onClose={() => setShiftsTarget(null)} />
      )}
      {reportsTarget && (
        <ReportsDialog supervisor={reportsTarget} onClose={() => setReportsTarget(null)} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Current-on-shift banner
// ────────────────────────────────────────────────────────────────────────────

function CurrentBanner({
  loading,
  current,
}: {
  loading: boolean;
  current: CurrentResponse['supervisor'] | null;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border-2 border-border bg-white p-5">
        <CardSkeleton />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-black text-amber-900 text-base">لا يوجد مشرف على الشيفت الآن</div>
          <div className="text-sm text-amber-800 mt-1">
            الطلبات الجديدة لن تُرسل لمشرف. أضف شيفت يغطي الوقت الحالي أو فعّل شيفت موجود.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-green-300 bg-gradient-to-l from-green-50 via-white to-white p-5 flex items-center gap-4 flex-wrap">
      <div className="w-12 h-12 rounded-full bg-green-100 text-green-700 grid place-items-center shrink-0">
        <ShieldCheck className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-[180px]">
        <div className="text-[11px] uppercase tracking-wider text-green-700 font-bold">
          المشرف على الشيفت الآن
        </div>
        <div className="font-black text-xl text-ink mt-0.5">{current.name}</div>
        <a
          href={`tel:${current.whatsappPhone}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground mt-1 hover:text-brand-red transition"
        >
          <Phone className="w-3.5 h-3.5" />
          <span dir="ltr" className="font-mono">
            {current.whatsappPhone}
          </span>
        </a>
      </div>
      {current.shift && (
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              'inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border',
              SHIFT_KIND_META[current.shift.kind].tone,
            )}
          >
            {SHIFT_KIND_META[current.shift.kind].label}
          </span>
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span dir="ltr" className="font-mono">
              {current.shift.startTime} – {current.shift.endTime}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Supervisor row
// ────────────────────────────────────────────────────────────────────────────

function SupervisorRow({
  supervisor,
  expanded,
  onToggleExpand,
  onEdit,
  onShifts,
  onReports,
  onDeactivate,
}: {
  supervisor: Supervisor;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onShifts: () => void;
  onReports: () => void;
  onDeactivate: () => void;
}) {
  const activeShiftCount = (supervisor.shifts ?? []).filter((s) => s.isActive).length;

  return (
    <div
      className={cn(
        'bg-white rounded-xl border-2 transition',
        supervisor.isOnShiftNow ? 'border-green-300 shadow-md shadow-green-100' : 'border-border',
      )}
    >
      <div className="p-4 flex items-center gap-4 flex-wrap">
        <div
          className={cn(
            'w-11 h-11 rounded-full grid place-items-center shrink-0',
            supervisor.isOnShiftNow
              ? 'bg-green-100 text-green-700'
              : supervisor.isActive
                ? 'bg-brand-red/10 text-brand-red'
                : 'bg-zinc-100 text-zinc-500',
          )}
        >
          <UserCheck className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-[180px]">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-black text-base text-ink">{supervisor.name}</div>
            {supervisor.isActive ? (
              <Badge variant="success">نشط</Badge>
            ) : (
              <Badge variant="default">معطّل</Badge>
            )}
            {supervisor.isOnShiftNow && <Badge variant="success">على الشيفت الآن</Badge>}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Phone className="w-3 h-3" />
              <span dir="ltr" className="font-mono">
                {supervisor.whatsappPhone}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {activeShiftCount} شيفت نشط
            </span>
          </div>
          {supervisor.notes && (
            <div className="text-xs text-muted-foreground mt-1 italic line-clamp-1">
              {supervisor.notes}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Button size="sm" variant="outline" onClick={onToggleExpand}>
            <Clock className="w-3.5 h-3.5" />
            {expanded ? 'إخفاء الشيفتات' : 'عرض الشيفتات'}
          </Button>
          <Button size="sm" variant="outline" onClick={onShifts}>
            <Plus className="w-3.5 h-3.5" />
            إدارة الشيفتات
          </Button>
          <Button size="sm" variant="outline" onClick={onReports}>
            <BarChart3 className="w-3.5 h-3.5" />
            التقارير
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit} title="تعديل">
            <Pencil className="w-4 h-4" />
          </Button>
          {supervisor.isActive && (
            <Button size="sm" variant="ghost" onClick={onDeactivate} title="تعطيل">
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/60 px-4 py-3 bg-muted/30">
          <ShiftsInlineList shifts={supervisor.shifts ?? []} />
        </div>
      )}
    </div>
  );
}

function ShiftsInlineList({ shifts }: { shifts: Shift[] }) {
  if (!shifts.length) {
    return (
      <div className="text-xs text-muted-foreground py-1">
        لا توجد شيفتات. اضغط "إدارة الشيفتات" لإضافة شيفت.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {shifts.map((sh) => (
        <ShiftChipRow key={sh.id} shift={sh} />
      ))}
    </div>
  );
}

function ShiftChipRow({ shift }: { shift: Shift }) {
  const days = shift.daysOfWeek ?? [];
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-full font-bold border',
          SHIFT_KIND_META[shift.kind].tone,
        )}
      >
        {SHIFT_KIND_META[shift.kind].label}
      </span>
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Clock className="w-3 h-3" />
        <span dir="ltr" className="font-mono">
          {shift.startTime} – {shift.endTime}
        </span>
      </span>
      <span className="text-muted-foreground">
        {days.length === 0 ? 'كل الأيام' : days.map((d) => DAY_LABELS[d] ?? d).join(' · ')}
      </span>
      {!shift.isActive && <Badge variant="default">معطّل</Badge>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Supervisor create / edit dialog
// ────────────────────────────────────────────────────────────────────────────

function SupervisorFormDialog({
  supervisor,
  onClose,
}: {
  supervisor?: Supervisor;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!supervisor;
  const [form, setForm] = useState({
    name: supervisor?.name ?? '',
    whatsappPhone: supervisor?.whatsappPhone ?? '',
    isActive: supervisor?.isActive ?? true,
    notes: supervisor?.notes ?? '',
  });

  const phoneError =
    form.whatsappPhone.trim().length > 0 && !PHONE_RE.test(form.whatsappPhone.trim())
      ? 'أدخل رقم واتساب صحيح (8–15 رقم، يقبل + في الأول)'
      : undefined;

  const canSave =
    form.name.trim().length >= 2 && form.whatsappPhone.trim().length > 0 && !phoneError;

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        whatsappPhone: form.whatsappPhone.trim(),
        isActive: form.isActive,
        notes: form.notes.trim() || undefined,
      };
      const res = isEdit
        ? await api.raw.patch(`/admin/supervisors/${supervisor!.id}`, payload)
        : await api.raw.post('/admin/supervisors', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success(isEdit ? 'تم تحديث المشرف' : 'تم إضافة المشرف');
      qc.invalidateQueries({ queryKey: ['admin', 'supervisors'] });
      qc.invalidateQueries({ queryKey: ['admin', 'supervisors', 'current'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? 'تعديل المشرف' : 'إضافة مشرف جديد'}
      description="بيانات المشرف الأساسية. أضف شيفتاته من زر إدارة الشيفتات بعد الحفظ."
    >
      <div className="space-y-3">
        <Field label="الاسم" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="مثلاً: محمد سعيد"
            maxLength={100}
          />
        </Field>
        <Field
          label="رقم واتساب"
          required
          hint="اكتب الرقم بدون كود الدولة — مثال: 01010254819"
          error={phoneError}
        >
          <PhoneInput
            value={form.whatsappPhone}
            onChange={(v) => setForm({ ...form, whatsappPhone: v })}
          />
        </Field>
        <Field label="ملاحظات">
          <Textarea
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            maxLength={500}
            placeholder="مثلاً: مسؤول شيفت الصباح + يتحدث الإنجليزية"
          />
        </Field>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="w-4 h-4"
          />
          <span className="text-sm font-bold">نشط — يستلم الطلبات أثناء شيفتاته</span>
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="outline" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => canSave && mut.mutate()} disabled={!canSave || mut.isPending}>
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEdit ? 'حفظ' : 'إضافة'}
        </Button>
      </div>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shifts dialog — list + add/edit/delete
// ────────────────────────────────────────────────────────────────────────────

function ShiftsDialog({ supervisor, onClose }: { supervisor: Supervisor; onClose: () => void }) {
  const qc = useQueryClient();
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // We re-read the supervisor list to get the latest shifts for this row.
  // Cheaper than a per-supervisor fetch and keeps a single source of truth.
  const shifts = useMemo(() => {
    const cached = qc.getQueryData<Supervisor[]>(['admin', 'supervisors']);
    const fresh = cached?.find((s) => s.id === supervisor.id);
    return fresh?.shifts ?? supervisor.shifts ?? [];
  }, [qc, supervisor]);

  const deleteMut = useMutation({
    mutationFn: async (shiftId: string) => {
      const res = await api.raw.delete(`/admin/supervisors/shifts/${shiftId}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('تم حذف الشيفت');
      qc.invalidateQueries({ queryKey: ['admin', 'supervisors'] });
      qc.invalidateQueries({ queryKey: ['admin', 'supervisors', 'current'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`شيفتات: ${supervisor.name}`}
      description="حدد أوقات الدوام بصيغة 24 ساعة. اترك أيام الأسبوع فاضية لتغطية كل الأيام."
      size="lg"
    >
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            شيفت جديد
          </Button>
        </div>

        {!shifts.length ? (
          <div className="rounded-xl border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            لا توجد شيفتات بعد. أضف شيفت ليبدأ المشرف في استلام الطلبات.
          </div>
        ) : (
          <div className="space-y-2">
            {shifts.map((sh) => (
              <div
                key={sh.id}
                className="rounded-xl border border-border bg-white p-3 flex items-center gap-3 flex-wrap"
              >
                <span
                  className={cn(
                    'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border',
                    SHIFT_KIND_META[sh.kind].tone,
                  )}
                >
                  {SHIFT_KIND_META[sh.kind].label}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm font-mono" dir="ltr">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  {sh.startTime} – {sh.endTime}
                </span>
                <div className="flex-1 min-w-[150px] text-xs text-muted-foreground">
                  {(sh.daysOfWeek ?? []).length === 0
                    ? 'كل الأيام'
                    : (sh.daysOfWeek ?? []).map((d) => DAY_LABELS[d]).join(' · ')}
                </div>
                {!sh.isActive && <Badge variant="default">معطّل</Badge>}
                <Button size="sm" variant="ghost" onClick={() => setEditingShift(sh)} title="تعديل">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm('حذف هذا الشيفت؟')) deleteMut.mutate(sh.id);
                  }}
                  title="حذف"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end mt-5">
        <Button variant="outline" onClick={onClose}>
          إغلاق
        </Button>
      </div>

      {(addOpen || editingShift) && (
        <ShiftFormDialog
          supervisorId={supervisor.id}
          shift={editingShift ?? undefined}
          onClose={() => {
            setAddOpen(false);
            setEditingShift(null);
          }}
        />
      )}
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shift create/edit dialog
// ────────────────────────────────────────────────────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function ShiftFormDialog({
  supervisorId,
  shift,
  onClose,
}: {
  supervisorId: string;
  shift?: Shift;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!shift;
  const [form, setForm] = useState({
    kind: (shift?.kind ?? 'MORNING') as ShiftKind,
    startTime: shift?.startTime ?? '08:00',
    endTime: shift?.endTime ?? '16:00',
    daysOfWeek: shift?.daysOfWeek ?? [],
    isActive: shift?.isActive ?? true,
  });

  const toggleDay = (d: number) => {
    setForm((f) => {
      const has = f.daysOfWeek.includes(d);
      return {
        ...f,
        daysOfWeek: has
          ? f.daysOfWeek.filter((x) => x !== d)
          : [...f.daysOfWeek, d].sort((a, b) => a - b),
      };
    });
  };

  const validTimes = TIME_RE.test(form.startTime) && TIME_RE.test(form.endTime);
  const canSave = validTimes;

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        kind: form.kind,
        startTime: form.startTime,
        endTime: form.endTime,
        daysOfWeek: form.daysOfWeek,
        isActive: form.isActive,
      };
      const res = isEdit
        ? await api.raw.patch(`/admin/supervisors/shifts/${shift!.id}`, payload)
        : await api.raw.post(`/admin/supervisors/${supervisorId}/shifts`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success(isEdit ? 'تم تحديث الشيفت' : 'تم إضافة الشيفت');
      qc.invalidateQueries({ queryKey: ['admin', 'supervisors'] });
      qc.invalidateQueries({ queryKey: ['admin', 'supervisors', 'current'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? 'تعديل الشيفت' : 'شيفت جديد'}
      description="اختر نوع الشيفت وأوقاته. للشيفتات اللي تعدّي منتصف الليل، اكتب وقت بداية أكبر من وقت النهاية."
    >
      <div className="space-y-3">
        <Field label="نوع الشيفت" required>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(SHIFT_KIND_META) as ShiftKind[]).map((k) => {
              const active = form.kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setForm({ ...form, kind: k })}
                  className={cn(
                    'rounded-lg border-2 px-3 py-2 text-sm font-bold transition',
                    active
                      ? 'border-brand-red bg-brand-red/5 text-brand-red'
                      : 'border-border bg-white hover:border-brand-red/40',
                  )}
                >
                  {SHIFT_KIND_META[k].label}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="وقت البداية" required>
            <Input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              dir="ltr"
              className="font-mono"
            />
          </Field>
          <Field label="وقت النهاية" required>
            <Input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              dir="ltr"
              className="font-mono"
            />
          </Field>
        </div>

        <Field label="أيام الأسبوع" hint="اترك الكل بدون اختيار لتغطية كل الأيام">
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((lbl, idx) => {
              const active = form.daysOfWeek.includes(idx);
              return (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-bold border-2 transition',
                    active
                      ? 'border-brand-red bg-brand-red text-white'
                      : 'border-border bg-white text-foreground hover:border-brand-red/40',
                  )}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
        </Field>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="w-4 h-4"
          />
          <span className="text-sm font-bold">شيفت نشط</span>
        </label>
      </div>

      <div className="flex justify-end gap-2 mt-5">
        <Button variant="outline" onClick={onClose}>
          إلغاء
        </Button>
        <Button onClick={() => canSave && mut.mutate()} disabled={!canSave || mut.isPending}>
          {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEdit ? 'حفظ' : 'إضافة'}
        </Button>
      </div>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Reports dialog
// ────────────────────────────────────────────────────────────────────────────

function ReportsDialog({ supervisor, onClose }: { supervisor: Supervisor; onClose: () => void }) {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const reportQ = useQuery({
    queryKey: ['admin', 'supervisors', supervisor.id, 'reports', period],
    queryFn: async (): Promise<ReportResponse> => {
      const res = await api.raw.get(`/admin/supervisors/${supervisor.id}/reports?period=${period}`);
      const body = (res.data?.data ?? res.data) as ReportResponse;
      return body;
    },
  });

  const totals = reportQ.data ?? {
    totalDispatches: 0,
    successCount: 0,
    failureCount: 0,
    breakdown: [],
  };

  const successRate =
    totals.totalDispatches > 0
      ? Math.round((totals.successCount / totals.totalDispatches) * 100)
      : 0;

  const maxCount = useMemo(
    () => Math.max(1, ...totals.breakdown.map((b) => b.count)),
    [totals.breakdown],
  );

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`تقارير الإرسال: ${supervisor.name}`}
      description="عدد الطلبات اللي اتبعتت لهذا المشرف على واتساب خلال الفترة المختارة."
      size="lg"
    >
      {/* Period tabs */}
      <div className="flex gap-2 mb-4">
        {(
          [
            { v: 'daily', l: 'يومي' },
            { v: 'weekly', l: 'أسبوعي' },
            { v: 'monthly', l: 'شهري' },
          ] as const
        ).map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setPeriod(t.v)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-bold border-2 transition',
              period === t.v
                ? 'border-brand-red bg-brand-red text-white'
                : 'border-border bg-white text-foreground hover:border-brand-red/40',
            )}
          >
            {t.l}
          </button>
        ))}
      </div>

      {reportQ.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : reportQ.isError ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          تعذّر تحميل التقرير. حاول مرة أخرى لاحقاً.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KpiCard
              label="إجمالي الإرسالات"
              value={totals.totalDispatches}
              tone="border-brand-red/30 bg-brand-red/5 text-brand-red"
              icon={<BarChart3 className="w-4 h-4" />}
            />
            <KpiCard
              label="ناجحة"
              value={totals.successCount}
              tone="border-green-300 bg-green-50 text-green-800"
              icon={<CheckCircle2 className="w-4 h-4" />}
              footer={totals.totalDispatches > 0 ? `${successRate}% من الإجمالي` : undefined}
            />
            <KpiCard
              label="فشل"
              value={totals.failureCount}
              tone="border-red-300 bg-red-50 text-red-800"
              icon={<XCircle className="w-4 h-4" />}
            />
          </div>

          {/* Daily breakdown */}
          <div className="mt-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-2">
              التفصيل اليومي
            </div>
            {!totals.breakdown.length ? (
              <div className="rounded-xl border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                لا توجد إرسالات في هذه الفترة.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr className="text-right">
                      <th className="px-3 py-2 font-bold">التاريخ</th>
                      <th className="px-3 py-2 font-bold">العدد</th>
                      <th className="px-3 py-2 font-bold w-1/2">المعدل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.breakdown.map((b, i) => {
                      const pct = Math.round((b.count / maxCount) * 100);
                      return (
                        <tr key={`${b.date}-${i}`} className="border-b border-border/40">
                          <td className="px-3 py-2 font-mono text-xs" dir="ltr">
                            {b.date}
                          </td>
                          <td className="px-3 py-2 font-bold">{b.count}</td>
                          <td className="px-3 py-2">
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  b.status === 'FAILED' ? 'bg-red-400' : 'bg-brand-red',
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex justify-end mt-5">
        <Button variant="outline" onClick={onClose}>
          إغلاق
        </Button>
      </div>
    </Dialog>
  );
}

function KpiCard({
  label,
  value,
  tone,
  icon,
  footer,
}: {
  label: string;
  value: number;
  tone: string;
  icon: React.ReactNode;
  footer?: string;
}) {
  return (
    <div className={cn('rounded-xl border-2 p-4', tone)}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold opacity-80">
        {icon}
        {label}
      </div>
      <div className="font-black text-3xl mt-1">{value.toLocaleString('ar-EG')}</div>
      {footer && <div className="text-xs opacity-75 mt-0.5">{footer}</div>}
    </div>
  );
}
