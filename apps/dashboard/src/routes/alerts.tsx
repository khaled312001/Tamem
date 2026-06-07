/**
 * Alerts center — operations control surface.
 *
 * Layout:
 *   1. Stats cards (clickable to filter)
 *   2. Severity tabs (all / critical / high / medium / low / resolved)
 *   3. Category chips + date preset + search
 *   4. Cards list, sorted critical → newest
 *   5. Detail side panel (action buttons + order timeline + notes)
 *
 * Real-time: subscribed to socket events `alert:new` and `alert:updated`,
 * invalidates React Query so the cards re-render without polling. A short
 * pulse animation flags new arrivals + an audible chime for critical.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Eye,
  Loader2,
  MessageSquare,
  Phone,
  Search,
  Siren,
  Sparkles,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Dialog } from '../components/ui/Dialog.js';
import { Field, Textarea } from '../components/ui/Input.js';
import { EmptyState } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { connectSocket } from '../lib/socket.js';
import { playNewOrderSound } from '../lib/sound.js';

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type Status = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED' | 'ESCALATED';
type Category =
  | 'ORDER'
  | 'PAYMENT'
  | 'DRIVER'
  | 'MERCHANT'
  | 'CUSTOMER'
  | 'COMPLAINT'
  | 'DELAY'
  | 'SYSTEM';

interface Alert {
  id: string;
  type: string;
  category: Category;
  severity: Severity;
  status: Status;
  titleAr: string;
  descriptionAr: string;
  relatedOrderId: string | null;
  relatedOrder: {
    id: string;
    orderNumber: string;
    status: string;
    updatedAt: string;
    customer?: { id: string; name: string; phone: string };
    assignedDriver?: { id: string; name: string; phone: string };
  } | null;
  merchantName: string | null;
  resolvedBy?: { id: string; name: string } | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  resolutionDurationSec: number | null;
  triggerReason: string | null;
  createdAt: string;
}

interface Stats {
  critical: number;
  high: number;
  medium: number;
  low: number;
  resolvedToday: number;
  totalActive: number;
  byCategory: Record<string, number>;
}

type SeverityTab = 'ALL' | Severity | 'RESOLVED';

const SEVERITY_TABS: { key: SeverityTab; label: string; tone: string }[] = [
  { key: 'ALL', label: 'الكل', tone: 'bg-brand-red text-white' },
  { key: 'CRITICAL', label: 'حرج', tone: 'bg-red-600 text-white' },
  { key: 'HIGH', label: 'عالي', tone: 'bg-orange-500 text-white' },
  { key: 'MEDIUM', label: 'متوسط', tone: 'bg-amber-400 text-amber-900' },
  { key: 'LOW', label: 'منخفض', tone: 'bg-blue-500 text-white' },
  { key: 'RESOLVED', label: 'تم حله', tone: 'bg-green-600 text-white' },
];

const CATEGORY_LABELS: Record<Category, string> = {
  ORDER: 'الطلبات',
  PAYMENT: 'الدفع',
  DRIVER: 'السائقين',
  MERCHANT: 'التجار',
  CUSTOMER: 'العملاء',
  COMPLAINT: 'الشكاوى',
  DELAY: 'التأخير',
  SYSTEM: 'النظام',
};

const SEV_COLOR: Record<Severity, { bg: string; ring: string; text: string; chip: string }> = {
  CRITICAL: {
    bg: 'bg-red-50 border-red-200',
    ring: 'ring-red-400',
    text: 'text-red-700',
    chip: 'bg-red-100 text-red-700',
  },
  HIGH: {
    bg: 'bg-orange-50 border-orange-200',
    ring: 'ring-orange-400',
    text: 'text-orange-700',
    chip: 'bg-orange-100 text-orange-700',
  },
  MEDIUM: {
    bg: 'bg-amber-50 border-amber-200',
    ring: 'ring-amber-300',
    text: 'text-amber-800',
    chip: 'bg-amber-100 text-amber-800',
  },
  LOW: {
    bg: 'bg-blue-50 border-blue-200',
    ring: 'ring-blue-300',
    text: 'text-blue-700',
    chip: 'bg-blue-100 text-blue-700',
  },
};

const SEV_AR: Record<Severity, string> = {
  CRITICAL: 'حرج',
  HIGH: 'عالي',
  MEDIUM: 'متوسط',
  LOW: 'منخفض',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'الآن';
  const min = Math.floor(sec / 60);
  if (min < 60) return `منذ ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `منذ ${hr} ساعة`;
  const day = Math.floor(hr / 24);
  return `منذ ${day} يوم`;
}

function fmtDuration(sec: number | null): string {
  if (!sec) return '—';
  if (sec < 60) return `${sec} ث`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} دقيقة`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return `${hr} س ${remainMin > 0 ? `${remainMin} د` : ''}`;
}

export function AlertsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<SeverityTab>('ALL');
  const [category, setCategory] = useState<Category | ''>('');
  const [preset, setPreset] = useState<'today' | 'week' | ''>('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [soundOn, setSoundOn] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [actionFor, setActionFor] = useState<{
    id: string;
    kind: 'resolve' | 'dismiss' | 'note';
  } | null>(null);
  /** IDs of alerts that just arrived — gets the pulse for 4s. */
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  // Debounce the search field — every keystroke would otherwise rebuild
  // the WHERE clause on the backend.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (tab === 'RESOLVED') p.status = 'RESOLVED';
    else if (tab !== 'ALL') p.severity = tab;
    if (category) p.category = category;
    if (preset) p.preset = preset;
    if (debounced.length >= 2) p.q = debounced;
    return p;
  }, [tab, category, preset, debounced]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'alerts', params],
    queryFn: async () => {
      const res = (await api.adminListAlerts(params)) as {
        alerts: Alert[];
        stats?: Stats;
      };
      return res;
    },
    // Long stale time — sockets push invalidations, polling would waste cycles.
    staleTime: 60_000,
  });

  // Realtime: invalidate the list on new/updated alerts.
  const flashAlert = useCallback((id: string) => {
    setFreshIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setFreshIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 4000);
  }, []);

  useEffect(() => {
    const socket = connectSocket();
    const onNew = (alert: Alert) => {
      qc.invalidateQueries({ queryKey: ['admin', 'alerts'] });
      flashAlert(alert.id);
      if (alert.severity === 'CRITICAL') {
        if (soundOn) playNewOrderSound();
        toast.warning('🚨 تنبيه حرج جديد', {
          description: alert.titleAr,
        });
      }
    };
    const onUpdate = () => {
      qc.invalidateQueries({ queryKey: ['admin', 'alerts'] });
    };
    socket.on('alert:new', onNew);
    socket.on('alert:updated', onUpdate);
    return () => {
      socket.off('alert:new', onNew);
      socket.off('alert:updated', onUpdate);
    };
  }, [qc, flashAlert, soundOn]);

  // Action mutations
  const ackMut = useMutation({
    mutationFn: (id: string) => api.adminAckAlert(id),
    onSuccess: () => {
      toast.success('تم استلام التنبيه');
      qc.invalidateQueries({ queryKey: ['admin', 'alerts'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const escalateMut = useMutation({
    mutationFn: (id: string) => api.adminEscalateAlert(id),
    onSuccess: () => {
      toast.success('تم تصعيد التنبيه');
      qc.invalidateQueries({ queryKey: ['admin', 'alerts'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const alerts = data?.alerts ?? [];
  const stats = data?.stats;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-brand-dark inline-flex items-center gap-2">
            <Siren className="w-6 h-6 text-brand-red" />
            مركز التنبيهات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            متابعة فورية لمشاكل الطلبات والتدخل بسرعة
          </p>
        </div>
        <button
          onClick={() => setSoundOn((s) => !s)}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold ${
            soundOn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
          title={soundOn ? 'صوت التنبيهات الحرجة مفعّل' : 'صوت التنبيهات مكتوم'}
        >
          {soundOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          {soundOn ? 'الصوت مفعّل' : 'مكتوم'}
        </button>
      </div>

      {/* Stats cards — click to filter */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="حرج"
            value={stats.critical}
            tone="red"
            active={tab === 'CRITICAL'}
            onClick={() => setTab(tab === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
            Icon={AlertOctagon}
          />
          <StatCard
            label="عالي"
            value={stats.high}
            tone="orange"
            active={tab === 'HIGH'}
            onClick={() => setTab(tab === 'HIGH' ? 'ALL' : 'HIGH')}
            Icon={AlertTriangle}
          />
          <StatCard
            label="متوسط"
            value={stats.medium}
            tone="amber"
            active={tab === 'MEDIUM'}
            onClick={() => setTab(tab === 'MEDIUM' ? 'ALL' : 'MEDIUM')}
            Icon={Sparkles}
          />
          <StatCard
            label="منخفض"
            value={stats.low}
            tone="blue"
            active={tab === 'LOW'}
            onClick={() => setTab(tab === 'LOW' ? 'ALL' : 'LOW')}
            Icon={Sparkles}
          />
          <StatCard
            label="تم حله اليوم"
            value={stats.resolvedToday}
            tone="green"
            active={tab === 'RESOLVED'}
            onClick={() => setTab(tab === 'RESOLVED' ? 'ALL' : 'RESOLVED')}
            Icon={CheckCircle2}
          />
          <StatCard
            label="إجمالي نشطة"
            value={stats.totalActive}
            tone="brand"
            active={false}
            onClick={() => setTab('ALL')}
            Icon={Siren}
          />
        </div>
      )}

      {/* Severity tabs */}
      <div className="bg-white rounded-xl border border-border p-1 inline-flex flex-wrap gap-1">
        {SEVERITY_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${
                active ? t.tone : 'text-brand-dark hover:bg-muted'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Category chips + date + search */}
      <div className="bg-white rounded-xl border border-border p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">الفئة:</span>
          <button
            onClick={() => setCategory('')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition ${
              category === '' ? 'bg-brand-red text-white' : 'bg-muted hover:bg-muted/80'
            }`}
          >
            الكل
          </button>
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => {
            const active = category === c;
            const count = stats?.byCategory?.[c] ?? 0;
            return (
              <button
                key={c}
                onClick={() => setCategory(active ? '' : c)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold transition ${
                  active ? 'bg-brand-red text-white' : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {CATEGORY_LABELS[c]}
                {count > 0 && <span className="ms-1 text-[10px] opacity-80">({count})</span>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">التاريخ:</span>
          {(
            [
              { v: '', label: 'الكل' },
              { v: 'today', label: 'اليوم' },
              { v: 'week', label: 'آخر ٧ أيام' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.v}
              onClick={() => setPreset(opt.v as 'today' | 'week' | '')}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition ${
                preset === opt.v ? 'bg-brand-red text-white' : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="ابحث برقم الطلب، اسم/هاتف العميل، اسم السائق..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full ps-10 pe-3 py-2 rounded-lg border border-input text-sm"
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : isError ? (
        <div className="bg-white rounded-xl border border-destructive/30 p-6 text-center">
          تعذّر تحميل التنبيهات.
          <button onClick={() => refetch()} className="text-brand-red font-bold ms-2">
            إعادة المحاولة
          </button>
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          title="لا توجد تنبيهات"
          description={
            tab === 'RESOLVED'
              ? 'مفيش تنبيهات تم حلها في الفترة المحددة'
              : '✓ كل التنبيهات تحت السيطرة'
          }
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              isFresh={freshIds.has(a.id)}
              onAck={() => ackMut.mutate(a.id)}
              onResolveOpen={() => setActionFor({ id: a.id, kind: 'resolve' })}
              onDismissOpen={() => setActionFor({ id: a.id, kind: 'dismiss' })}
              onEscalate={() => escalateMut.mutate(a.id)}
              onNoteOpen={() => setActionFor({ id: a.id, kind: 'note' })}
              onOpen={() => setOpenId(a.id)}
              ackPending={ackMut.isPending}
              escalatePending={escalateMut.isPending}
            />
          ))}
        </div>
      )}

      {/* Detail panel */}
      {openId && <DetailPanel id={openId} onClose={() => setOpenId(null)} />}

      {/* Action dialogs */}
      {actionFor && (
        <ActionDialog id={actionFor.id} kind={actionFor.kind} onClose={() => setActionFor(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Stats card
// ─────────────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  tone,
  active,
  onClick,
  Icon,
}: {
  label: string;
  value: number;
  tone: 'red' | 'orange' | 'amber' | 'blue' | 'green' | 'brand';
  active: boolean;
  onClick: () => void;
  Icon: typeof AlertOctagon;
}) {
  const toneClasses: Record<typeof tone, string> = {
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    brand: 'bg-brand-red/10 text-brand-red border-brand-red/20',
  };
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-3 transition text-right ${toneClasses[tone]} ${
        active ? 'ring-2 ring-offset-2 ring-brand-red' : 'hover:scale-[1.02]'
      }`}
    >
      <div className="flex items-center justify-between">
        <Icon className="w-5 h-5 opacity-80" />
        <div className="text-3xl font-black">{value}</div>
      </div>
      <div className="text-xs font-bold mt-1">{label}</div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Alert card
// ─────────────────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  isFresh,
  onAck,
  onResolveOpen,
  onDismissOpen,
  onEscalate,
  onNoteOpen,
  onOpen,
  ackPending,
  escalatePending,
}: {
  alert: Alert;
  isFresh: boolean;
  onAck: () => void;
  onResolveOpen: () => void;
  onDismissOpen: () => void;
  onEscalate: () => void;
  onNoteOpen: () => void;
  onOpen: () => void;
  ackPending: boolean;
  escalatePending: boolean;
}) {
  const isResolved = alert.status === 'RESOLVED' || alert.status === 'DISMISSED';
  const sevTone = isResolved
    ? {
        bg: 'bg-green-50 border-green-200',
        ring: 'ring-green-300',
        text: 'text-green-700',
        chip: 'bg-green-100 text-green-700',
      }
    : SEV_COLOR[alert.severity];
  return (
    <div
      className={`rounded-xl border p-4 transition ${sevTone.bg} ${
        isFresh ? `animate-pulse ring-2 ${sevTone.ring}` : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* Left: title + meta */}
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${sevTone.chip}`}
            >
              {isResolved ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <AlertOctagon className="w-3 h-3" />
              )}
              {isResolved
                ? alert.status === 'DISMISSED'
                  ? 'تم تجاهله'
                  : 'تم حله'
                : SEV_AR[alert.severity]}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/60 text-muted-foreground font-bold">
              {CATEGORY_LABELS[alert.category]}
            </span>
            {alert.status === 'ACKNOWLEDGED' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">
                قيد المتابعة
              </span>
            )}
            {alert.status === 'ESCALATED' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-200 text-red-800 font-bold">
                مُصعَّد
              </span>
            )}
          </div>
          <div className={`font-black text-lg mt-1 ${sevTone.text}`}>{alert.titleAr}</div>
          <div className="text-sm text-muted-foreground mt-0.5">{alert.descriptionAr}</div>

          {alert.relatedOrder && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <Link
                to={`/orders/${alert.relatedOrder.id}`}
                className="font-mono font-bold text-brand-red hover:underline inline-flex items-center gap-1"
              >
                <Truck className="w-3.5 h-3.5" />
                {alert.relatedOrder.orderNumber}
              </Link>
              {alert.relatedOrder.customer && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <User className="w-3.5 h-3.5" />
                  {alert.relatedOrder.customer.name}
                  {' · '}
                  <a
                    href={`tel:${alert.relatedOrder.customer.phone}`}
                    className="text-brand-red"
                    dir="ltr"
                  >
                    {alert.relatedOrder.customer.phone}
                  </a>
                </span>
              )}
              {alert.merchantName && (
                <span className="text-muted-foreground">🏪 {alert.merchantName}</span>
              )}
              {alert.relatedOrder.assignedDriver && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Truck className="w-3.5 h-3.5" />
                  {alert.relatedOrder.assignedDriver.name}
                </span>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {relativeTime(alert.createdAt)}
            </span>
            {alert.resolutionDurationSec && (
              <span>تم حله خلال {fmtDuration(alert.resolutionDurationSec)}</span>
            )}
            {alert.resolvedBy && <span>بواسطة {alert.resolvedBy.name}</span>}
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex flex-wrap gap-1.5 self-start">
          {!isResolved && (
            <>
              {alert.status === 'OPEN' && (
                <button
                  onClick={onAck}
                  disabled={ackPending}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                  title="استلم التنبيه"
                >
                  <Eye className="w-3 h-3" />
                  استلام
                </button>
              )}
              <button
                onClick={onResolveOpen}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700"
              >
                <CheckCircle2 className="w-3 h-3" />
                تم الحل
              </button>
              <button
                onClick={onEscalate}
                disabled={escalatePending || alert.status === 'ESCALATED'}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
              >
                <ArrowRight className="w-3 h-3" />
                تصعيد
              </button>
              <button
                onClick={onDismissOpen}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-200 text-gray-800 text-xs font-bold hover:bg-gray-300"
              >
                <XCircle className="w-3 h-3" />
                تجاهل
              </button>
            </>
          )}
          <button
            onClick={onNoteOpen}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-border text-xs font-bold hover:bg-muted"
          >
            <MessageSquare className="w-3 h-3" />
            ملاحظة
          </button>
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-border text-xs font-bold hover:bg-muted"
          >
            تفاصيل
            <ChevronLeft className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Detail side panel
// ─────────────────────────────────────────────────────────────────────────

function DetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = useQuery<any>({
    queryKey: ['admin', 'alert', id],
    queryFn: () => api.adminGetAlert(id),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="تفاصيل التنبيه" size="lg">
      {isLoading || !data ? (
        <div className="text-center py-8">
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        </div>
      ) : (
        <div className="space-y-4">
          <div
            className={`rounded-lg p-3 ${SEV_COLOR[data.severity as Severity]?.bg ?? 'bg-muted'}`}
          >
            <div className="font-black text-lg">{data.titleAr}</div>
            <div className="text-sm mt-1">{data.descriptionAr}</div>
            {data.triggerReason && (
              <div className="text-xs text-muted-foreground mt-2">السبب: {data.triggerReason}</div>
            )}
          </div>

          <Section title="التوقيتات">
            <KV label="تاريخ الإنشاء">{new Date(data.createdAt).toLocaleString('ar-EG')}</KV>
            <KV label="منذ">{relativeTime(data.createdAt)}</KV>
            {data.ackedAt && (
              <KV label="تم الاستلام">{new Date(data.ackedAt).toLocaleString('ar-EG')}</KV>
            )}
            {data.resolvedAt && (
              <>
                <KV label="تم الحل">{new Date(data.resolvedAt).toLocaleString('ar-EG')}</KV>
                <KV label="مدة الحل">{fmtDuration(data.resolutionDurationSec)}</KV>
                {data.resolvedBy && <KV label="حله">{data.resolvedBy.name}</KV>}
              </>
            )}
          </Section>

          {data.relatedOrder && (
            <Section title="الطلب">
              <KV label="رقم الطلب">
                <Link to={`/orders/${data.relatedOrder.id}`} className="text-brand-red font-bold">
                  {data.relatedOrder.orderNumber}
                </Link>
              </KV>
              <KV label="حالة الطلب">{data.relatedOrder.status}</KV>
              <KV label="آخر تحديث">
                {new Date(data.relatedOrder.updatedAt).toLocaleString('ar-EG')}
              </KV>
              {data.relatedOrder.customer && (
                <>
                  <KV label="العميل">{data.relatedOrder.customer.name}</KV>
                  <KV label="الهاتف">
                    <a
                      href={`tel:${data.relatedOrder.customer.phone}`}
                      className="text-brand-red inline-flex items-center gap-1"
                      dir="ltr"
                    >
                      <Phone className="w-3 h-3" />
                      {data.relatedOrder.customer.phone}
                    </a>
                  </KV>
                </>
              )}
              {data.relatedOrder.assignedDriver && (
                <KV label="السائق">{data.relatedOrder.assignedDriver.name}</KV>
              )}
            </Section>
          )}

          {data.resolutionNotes && (
            <Section title="الملاحظات الداخلية">
              <pre className="whitespace-pre-wrap text-sm font-sans">{data.resolutionNotes}</pre>
            </Section>
          )}

          {Array.isArray(data.relatedOrder?.statusHistory) &&
            data.relatedOrder.statusHistory.length > 0 && (
              <Section title="سجل الطلب">
                <ol className="space-y-2">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {data.relatedOrder.statusHistory.map((h: any) => (
                    <li key={h.id} className="text-sm border-r-2 border-brand-red pe-3">
                      <span className="font-bold">{h.toStatus}</span>
                      <span className="text-xs text-muted-foreground mr-2">
                        {new Date(h.createdAt).toLocaleString('ar-EG')}
                      </span>
                      {h.changedBy && (
                        <span className="text-xs text-muted-foreground"> · {h.changedBy.name}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </Section>
            )}
        </div>
      )}
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold text-end">{children}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Action dialog (resolve / dismiss / note)
// ─────────────────────────────────────────────────────────────────────────

function ActionDialog({
  id,
  kind,
  onClose,
}: {
  id: string;
  kind: 'resolve' | 'dismiss' | 'note';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const mut = useMutation({
    mutationFn: () => {
      if (kind === 'resolve') return api.adminResolveAlert(id, note);
      if (kind === 'dismiss') return api.adminDismissAlert(id, note);
      return api.adminAlertNote(id, note);
    },
    onSuccess: () => {
      toast.success(
        kind === 'resolve'
          ? 'تم حل التنبيه'
          : kind === 'dismiss'
            ? 'تم تجاهل التنبيه'
            : 'تمت إضافة الملاحظة',
      );
      qc.invalidateQueries({ queryKey: ['admin', 'alerts'] });
      qc.invalidateQueries({ queryKey: ['admin', 'alert', id] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const title =
    kind === 'resolve' ? 'تم حل التنبيه' : kind === 'dismiss' ? 'تجاهل التنبيه' : 'إضافة ملاحظة';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={title}>
      <Field
        label={
          kind === 'resolve' ? 'وصف الحل' : kind === 'dismiss' ? 'سبب التجاهل' : 'الملاحظة الداخلية'
        }
        required
      >
        <Textarea
          ref={ref}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={
            kind === 'resolve'
              ? 'مثلاً: تم تعيين سائق آخر وتم التواصل مع العميل'
              : kind === 'dismiss'
                ? 'مثلاً: العميل ألغى الطلب بنفسه'
                : 'مثلاً: حاولت التواصل ولم يرد، سأعيد المحاولة'
          }
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg bg-muted text-sm font-bold hover:bg-muted/80"
        >
          إلغاء
        </button>
        <button
          onClick={() => mut.mutate()}
          disabled={note.length < 2 || mut.isPending}
          className={`px-3 py-1.5 rounded-lg text-white text-sm font-bold disabled:opacity-50 ${
            kind === 'dismiss'
              ? 'bg-gray-700 hover:bg-gray-800'
              : 'bg-brand-red hover:bg-brand-red/90'
          }`}
        >
          {mut.isPending && <Loader2 className="w-3 h-3 animate-spin inline ms-1" />}
          {kind === 'resolve' ? 'تأكيد الحل' : kind === 'dismiss' ? 'تجاهل' : 'حفظ'}
        </button>
      </div>
    </Dialog>
  );
}
