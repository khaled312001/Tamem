import { useCallback, useEffect, useMemo, useState } from 'react';

// ── Partner settlement (private) ────────────────────────────────────────────
// A silent, standalone page for the delivery partner's revenue share: 20% of
// realized delivery fees over the one-year agreement that began 2026-08-01.
// It lives OUTSIDE the admin layout on purpose — no sidebar entry, no
// permission key, nothing the client can stumble onto. The passphrase is never
// stored in this bundle; it is typed once, kept in localStorage, and checked by
// the backend (which answers 404 without it, hiding the route).
//
// The report breaks the same money down four ways — daily, weekly, monthly and
// quarterly — plus running totals, an average, and a projection for the quarter
// in progress.

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';
const KEY_STORE = 'tmm_partner_key';

type Quarter = {
  index: number;
  label: string;
  start: string;
  end: string;
  delivery: number;
  orders: number;
  share: number;
  state: 'past' | 'current' | 'future';
};
type MonthRow = Omit<Quarter, 'index'>;
type WeekRow = {
  index: number;
  label: string;
  start: string;
  end: string;
  delivery: number;
  orders: number;
  share: number;
};
type DayRow = { date: string; delivery: number; orders: number; share: number };
type OrderItem = {
  number: string;
  date: string;
  time: string;
  status: string;
  statusLabel: string;
  delivery: number;
};
type OrderReport = { count: number; delivery: number; capped: boolean; orders: OrderItem[] };

type Current = Quarter & {
  daysElapsed: number;
  daysTotal: number;
  projectedDelivery: number;
  projectedShare: number;
};

type Settlement = {
  startDate: string;
  endDate: string;
  sharePct: number;
  currency: string;
  nowCairo: string;
  generatedAt: string;
  totals: { delivery: number; orders: number; share: number; avgFeePerOrder: number };
  current: Current | null;
  quarters: Quarter[];
  months: MonthRow[];
  weeks: WeekRow[];
  days: DayRow[];
  pending: OrderReport;
  cancelled: OrderReport;
};

type Tab = 'day' | 'week' | 'month' | 'quarter' | 'pending' | 'cancelled' | 'calc';
type Row = {
  key: string;
  title: string;
  sub: string;
  delivery: number;
  orders: number;
  share: number;
  state?: string;
};

const egp = (n: number) =>
  `${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const num = (n: number) => Number(n || 0).toLocaleString('en-US');

const arDate = (s: string) => {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
};
const arWeekday = (s: string) => {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('ar-EG', { weekday: 'long' });
};

export function PartnerSettlementPage() {
  const [key, setKey] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY_STORE) ?? '';
    } catch {
      return '';
    }
  });
  const [input, setInput] = useState('');
  const [data, setData] = useState<Settlement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('month');

  const load = useCallback(async (k: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${baseURL}/partner/settlement?key=${encodeURIComponent(k)}`);
      if (res.status === 404 || res.status === 401 || res.status === 403) {
        setData(null);
        setError('كلمة السر غير صحيحة');
        try {
          localStorage.removeItem(KEY_STORE);
        } catch {
          /* ignore */
        }
        setKey('');
        return;
      }
      if (!res.ok) throw new Error('server');
      const json = await res.json();
      setData((json.data ?? json) as Settlement);
    } catch {
      setError('تعذّر تحميل البيانات، حاول تاني');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (key) load(key);
  }, [key, load]);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    if (tab === 'quarter')
      return data.quarters.map((q) => ({
        key: `q${q.index}`,
        title: q.label,
        sub: `${arDate(q.start)} — ${arDate(q.end)}`,
        delivery: q.delivery,
        orders: q.orders,
        share: q.share,
        state: q.state,
      }));
    if (tab === 'month')
      return data.months.map((m) => ({
        key: m.start,
        title: m.label,
        sub: `${arDate(m.start)} — ${arDate(m.end)}`,
        delivery: m.delivery,
        orders: m.orders,
        share: m.share,
        state: m.state,
      }));
    if (tab === 'week')
      return data.weeks.map((w) => ({
        key: `w${w.index}`,
        title: w.label,
        sub: `${arDate(w.start)} — ${arDate(w.end)}`,
        delivery: w.delivery,
        orders: w.orders,
        share: w.share,
      }));
    if (tab === 'day')
      return data.days.map((d) => ({
        key: d.date,
        title: arWeekday(d.date),
        sub: arDate(d.date),
        delivery: d.delivery,
        orders: d.orders,
        share: d.share,
      }));
    return [];
  }, [data, tab]);

  const maxDelivery = useMemo(() => Math.max(0, ...rows.map((r) => r.delivery)), [rows]);

  const submit = () => {
    const k = input.trim();
    if (!k) return;
    try {
      localStorage.setItem(KEY_STORE, k);
    } catch {
      /* ignore */
    }
    setKey(k);
    setInput('');
  };

  const forget = () => {
    try {
      localStorage.removeItem(KEY_STORE);
    } catch {
      /* ignore */
    }
    setKey('');
    setData(null);
    setError(null);
  };

  // ── Gate ────────────────────────────────────────────────────────────────────
  if (!key || (!data && !loading)) {
    return (
      <div style={S.page}>
        <div style={S.gate}>
          <div style={S.lock}>🔒</div>
          <p style={S.gateHint}>اكتب كلمة السر عشان تدخل</p>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="كلمة السر"
            autoFocus
            style={S.input}
          />
          <button onClick={submit} style={S.primaryBtn}>
            دخول
          </button>
          {error && <div style={S.gateErr}>{error}</div>}
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div style={S.page}>
        <div style={{ ...S.gate, color: '#cbd5e1' }}>جاري التحميل…</div>
      </div>
    );
  }

  if (!data) return null;

  const c = data.current;
  const progress =
    c && c.daysTotal > 0 ? Math.min(100, Math.round((c.daysElapsed / c.daysTotal) * 100)) : 0;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'day', label: 'يومي' },
    { id: 'week', label: 'أسبوعي' },
    { id: 'month', label: 'شهري' },
    { id: 'quarter', label: 'ربع سنوي' },
    { id: 'pending', label: `معلقة (${num(data.pending.count)})` },
    { id: 'cancelled', label: `ملغية (${num(data.cancelled.count)})` },
    { id: 'calc', label: '🧮 صافي الربح' },
  ];

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <header style={S.header}>
          <div>
            <h1 style={S.title}>تقرير الشراكة — حصتنا من التوصيل</h1>
            <p style={S.sub}>
              الاتفاق من {arDate(data.startDate)} إلى {arDate(data.endDate)} · حصتنا {data.sharePct}
              % من رسوم التوصيل · الطلبات المكتملة فقط
            </p>
          </div>
          <div style={S.headActions}>
            <button onClick={() => load(key)} style={S.ghostBtn} disabled={loading}>
              {loading ? '…' : '↻ تحديث'}
            </button>
            <button onClick={forget} style={S.ghostBtn}>
              قفل
            </button>
          </div>
        </header>

        {/* Summary */}
        <div style={S.summary}>
          <Stat label="إجمالي التوصيل" value={egp(data.totals.delivery)} tone="#f8fafc" />
          <Stat
            label={`حصتنا (${data.sharePct}%)`}
            value={egp(data.totals.share)}
            tone="#4ade80"
            big
          />
          <Stat label="عدد الطلبات المكتملة" value={num(data.totals.orders)} tone="#f8fafc" />
          <Stat
            label="متوسط التوصيل / طلب"
            value={egp(data.totals.avgFeePerOrder)}
            tone="#f8fafc"
          />
        </div>

        {/* Current quarter progress */}
        {c && (
          <div style={S.progressCard}>
            <div style={S.progressHead}>
              <span style={S.progressTitle}>
                الربع الحالي — {c.label}{' '}
                <span style={S.progressDates}>
                  ({arDate(c.start)} — {arDate(c.end)})
                </span>
              </span>
              <span style={S.progressDays}>
                مرّ {c.daysElapsed} من {c.daysTotal} يوم
              </span>
            </div>
            <div style={S.bar}>
              <div style={{ ...S.barFill, width: `${progress}%` }} />
            </div>
            <div style={S.progressGrid}>
              <div style={S.pCell}>
                <span style={S.pLabel}>التوصيل حتى الآن</span>
                <span style={S.pVal}>{egp(c.delivery)}</span>
              </div>
              <div style={S.pCell}>
                <span style={S.pLabel}>حصتنا حتى الآن</span>
                <span style={{ ...S.pVal, color: '#4ade80' }}>{egp(c.share)}</span>
              </div>
              <div style={S.pCell}>
                <span style={S.pLabel}>متوقّع بنهاية الربع</span>
                <span style={S.pVal}>{egp(c.projectedDelivery)}</span>
              </div>
              <div style={S.pCell}>
                <span style={S.pLabel}>حصتنا المتوقّعة</span>
                <span style={{ ...S.pVal, color: '#fbbf24' }}>{egp(c.projectedShare)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={S.tabs}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{ ...S.tab, ...(tab === t.id ? S.tabOn : {}) }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div style={S.list}>
          {tab === 'calc' ? (
            <ProfitCalc data={data} />
          ) : tab === 'pending' || tab === 'cancelled' ? (
            <OrderList report={tab === 'pending' ? data.pending : data.cancelled} kind={tab} />
          ) : rows.length === 0 ? (
            <div style={S.empty}>لا توجد بيانات</div>
          ) : (
            rows.map((r) => {
              const w = maxDelivery > 0 ? Math.round((r.delivery / maxDelivery) * 100) : 0;
              const isCurrent = r.state === 'current';
              const isFuture = r.state === 'future';
              const zero = r.delivery === 0;
              return (
                <div
                  key={r.key}
                  style={{
                    ...S.row,
                    ...(isCurrent ? S.rowCurrent : {}),
                    ...(isFuture || zero ? S.rowDim : {}),
                  }}
                >
                  <div style={S.rowMain}>
                    <div style={S.rowTitleWrap}>
                      <span style={S.rowTitle}>{r.title}</span>
                      {r.state && (
                        <span
                          style={{
                            ...S.chip,
                            ...(isCurrent ? S.chipCurrent : isFuture ? S.chipFuture : S.chipPast),
                          }}
                        >
                          {isCurrent ? 'جاري' : isFuture ? 'قادم' : 'منتهي'}
                        </span>
                      )}
                    </div>
                    <span style={S.rowSub}>{r.sub}</span>
                    <div style={S.miniBar}>
                      <div style={{ ...S.miniFill, width: `${w}%` }} />
                    </div>
                  </div>
                  <div style={S.rowNums}>
                    <div style={S.rowDelivery}>{egp(r.delivery)}</div>
                    <div style={S.rowOrders}>{num(r.orders)} طلب</div>
                    <div style={S.rowShare}>حصتنا {egp(r.share)}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <footer style={S.footer}>
          آخر تحديث: {data.nowCairo} (توقيت القاهرة) · حصة التوصيل محسوبة من الطلبات
          المكتملة/المسلّمة · تبويبات «معلقة/ملغية» بتعرض رسوم التوصيل للطلبات المفتوحة والملغية ·
          «المتوقّع» تقدير على أساس متوسط الأيام اللي فاتت
        </footer>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone: string;
  big?: boolean;
}) {
  return (
    <div style={S.stat}>
      <span style={S.statLabel}>{label}</span>
      <span style={{ ...S.statVal, color: tone, fontSize: big ? 26 : 22 }}>{value}</span>
    </div>
  );
}

function OrderList({ report, kind }: { report: OrderReport; kind: 'pending' | 'cancelled' }) {
  const isCancel = kind === 'cancelled';
  return (
    <>
      <div style={S.orderSummary}>
        <div style={S.orderSumCell}>
          <span style={S.statLabel}>عدد الطلبات</span>
          <span style={{ ...S.statVal, fontSize: 24, color: isCancel ? '#f87171' : '#f8fafc' }}>
            {num(report.count)}
          </span>
        </div>
        <div style={S.orderSumDivider} />
        <div style={S.orderSumCell}>
          <span style={S.statLabel}>إجمالي رسوم التوصيل</span>
          <span style={{ ...S.statVal, fontSize: 24, color: isCancel ? '#fca5a5' : '#fbbf24' }}>
            {egp(report.delivery)}
          </span>
        </div>
      </div>
      {report.capped && (
        <div style={S.cappedNote}>بيظهر أحدث 300 طلب فقط — الإجمالي فوق بيحسب كل الطلبات</div>
      )}
      {report.orders.length === 0 ? (
        <div style={S.empty}>مفيش طلبات</div>
      ) : (
        report.orders.map((o) => {
          const red = o.status === 'CANCELLED' || o.status === 'REJECTED';
          return (
            <div key={o.number} style={S.orderRow}>
              <div style={S.rowMain}>
                <div style={S.rowTitleWrap}>
                  <span style={S.orderNum}>{o.number}</span>
                  <span style={{ ...S.chip, ...(red ? S.chipRed : S.chipNeutral) }}>
                    {o.statusLabel}
                  </span>
                </div>
                <span style={S.rowSub}>
                  {arDate(o.date)} · {o.time}
                </span>
              </div>
              <div style={S.orderAmt}>{egp(o.delivery)}</div>
            </div>
          );
        })
      )}
    </>
  );
}

// Net-profit calculator. The partner's real share is 20% of NET profit, not
// gross delivery fees — so rent, salaries and other costs (none of which live
// in the system) are entered by hand here and subtracted from a revenue figure
// that defaults to the report's delivery total. Everything is kept in the
// browser so the figures survive a refresh without ever leaving the device.
const CALC_STORE = 'tmm_partner_calc';
const rid = () => Math.random().toString(36).slice(2, 9);
const defaultExps = () => [
  { id: rid(), label: 'إيجار', amount: '' },
  { id: rid(), label: 'مرتبات', amount: '' },
];

function ProfitCalc({ data }: { data: Settlement }) {
  const pct = data.sharePct;
  const [revenue, setRevenue] = useState('');
  const [exps, setExps] = useState<{ id: string; label: string; amount: string }[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let init: { revenue?: string; exps?: { id: string; label: string; amount: string }[] } | null =
      null;
    try {
      const raw = localStorage.getItem(CALC_STORE);
      if (raw) init = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    if (init && typeof init.revenue === 'string') {
      setRevenue(init.revenue);
      setExps(init.exps && init.exps.length ? init.exps : defaultExps());
    } else {
      setRevenue(String(data.totals.delivery));
      setExps(defaultExps());
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(CALC_STORE, JSON.stringify({ revenue, exps }));
    } catch {
      /* ignore */
    }
  }, [revenue, exps, ready]);

  const rev = parseFloat(revenue) || 0;
  const totalExp = exps.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const net = rev - totalExp;
  const share = (net * pct) / 100;

  const setExp = (id: string, patch: Partial<{ label: string; amount: string }>) =>
    setExps((xs) => xs.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const addExp = () => setExps((xs) => [...xs, { id: rid(), label: '', amount: '' }]);
  const delExp = (id: string) => setExps((xs) => xs.filter((e) => e.id !== id));
  const reset = () => {
    setRevenue(String(data.totals.delivery));
    setExps(defaultExps());
  };

  return (
    <div style={S.calcWrap}>
      <div style={S.calcSection}>
        <label style={S.calcLabel}>الإيراد (رسوم التوصيل)</label>
        <input
          type="number"
          inputMode="decimal"
          value={revenue}
          onChange={(e) => setRevenue(e.target.value)}
          style={S.calcInput}
        />
        <div style={S.quickChips}>
          <button style={S.quickChip} onClick={() => setRevenue(String(data.totals.delivery))}>
            إجمالي التوصيل: {egp(data.totals.delivery)}
          </button>
          {data.current && (
            <button style={S.quickChip} onClick={() => setRevenue(String(data.current!.delivery))}>
              الربع الحالي: {egp(data.current.delivery)}
            </button>
          )}
        </div>
      </div>

      <div style={S.calcSection}>
        <div style={S.calcSecHead}>
          <label style={S.calcLabel}>المصروفات</label>
          <button style={S.addBtn} onClick={addExp}>
            + إضافة مصروف
          </button>
        </div>
        {exps.map((e) => (
          <div key={e.id} style={S.expRow}>
            <input
              value={e.label}
              placeholder="نوع المصروف"
              onChange={(ev) => setExp(e.id, { label: ev.target.value })}
              style={{ ...S.calcInput, flex: 1, minWidth: 0 }}
            />
            <input
              type="number"
              inputMode="decimal"
              value={e.amount}
              placeholder="0"
              onChange={(ev) => setExp(e.id, { amount: ev.target.value })}
              style={{ ...S.calcInput, width: 120, flexShrink: 0 }}
            />
            <button style={S.delBtn} onClick={() => delExp(e.id)} aria-label="حذف">
              ✕
            </button>
          </div>
        ))}
      </div>

      <div style={S.calcResults}>
        <ResRow label="الإيراد" value={egp(rev)} />
        <ResRow label="إجمالي المصروفات" value={`− ${egp(totalExp)}`} tone="#f87171" />
        <div style={S.resDivider} />
        <ResRow label="صافي الربح" value={egp(net)} tone={net < 0 ? '#f87171' : '#f8fafc'} big />
        <div style={S.shareResult}>
          <span style={S.shareResLabel}>نسبتك ({pct}%) من صافي الربح</span>
          <span style={{ ...S.shareResVal, color: net < 0 ? '#f87171' : '#4ade80' }}>
            {egp(share)}
          </span>
        </div>
      </div>

      <button style={S.resetCalc} onClick={reset}>
        إعادة تعيين
      </button>
      <p style={S.calcHint}>
        الإيجار والمرتبات وباقي المصروفات بتتكتب يدويًا لأنها مش موجودة في السيستم. أي رقم تكتبه
        بيتحفظ في المتصفح عندك بس، ومحدش تاني بيشوفه.
      </p>
    </div>
  );
}

function ResRow({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone?: string;
  big?: boolean;
}) {
  return (
    <div style={S.resRow}>
      <span style={{ ...S.resLabel, fontSize: big ? 15 : 13 }}>{label}</span>
      <span style={{ ...S.resVal, fontSize: big ? 22 : 15, color: tone ?? '#e2e8f0' }}>
        {value}
      </span>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    direction: 'rtl',
    minHeight: '100vh',
    background: 'radial-gradient(1200px 600px at 50% -10%, #1e293b 0%, #0f172a 55%, #0b1120 100%)',
    color: '#e2e8f0',
    fontFamily: "'Tajawal', system-ui, -apple-system, 'Segoe UI', sans-serif",
    padding: '24px 16px',
    boxSizing: 'border-box',
  },
  wrap: { maxWidth: 1040, margin: '0 auto' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 18,
  },
  title: { fontSize: 24, fontWeight: 800, margin: 0, color: '#f8fafc' },
  sub: { fontSize: 13, color: '#94a3b8', margin: '6px 0 0', lineHeight: 1.6 },
  headActions: { display: 'flex', gap: 8 },

  summary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
    marginBottom: 16,
  },
  stat: {
    background: 'linear-gradient(135deg, #111c33 0%, #16223d 100%)',
    border: '1px solid #24324e',
    borderRadius: 16,
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  statLabel: { fontSize: 12, color: '#94a3b8' },
  statVal: { fontWeight: 800, lineHeight: 1.15 },

  progressCard: {
    background: 'linear-gradient(160deg, #1a1608 0%, #0f1a2e 60%)',
    border: '1px solid #b4790f',
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
  },
  progressHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  progressTitle: { fontSize: 16, fontWeight: 800, color: '#fde68a' },
  progressDates: { fontSize: 12, fontWeight: 400, color: '#94a3b8' },
  progressDays: { fontSize: 12, color: '#cbd5e1' },
  bar: {
    height: 8,
    background: '#1e293b',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 14,
  },
  barFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
    borderRadius: 999,
  },
  progressGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
  },
  pCell: { display: 'flex', flexDirection: 'column', gap: 4 },
  pLabel: { fontSize: 12, color: '#94a3b8' },
  pVal: { fontSize: 18, fontWeight: 800, color: '#f8fafc' },

  tabs: {
    display: 'flex',
    gap: 6,
    background: '#0f1a2e',
    border: '1px solid #1e2b45',
    borderRadius: 14,
    padding: 5,
    marginBottom: 14,
    overflowX: 'auto',
  },
  tab: {
    flex: '1 0 auto',
    whiteSpace: 'nowrap',
    padding: '9px 14px',
    borderRadius: 10,
    border: 'none',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  tabOn: { background: '#f59e0b', color: '#1a1608' },

  orderSummary: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 8,
    background: 'linear-gradient(135deg, #111c33 0%, #16223d 100%)',
    border: '1px solid #24324e',
    borderRadius: 16,
    padding: '16px 18px',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  orderSumCell: { flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 6 },
  orderSumDivider: { width: 1, background: '#24324e' },
  cappedNote: {
    fontSize: 12,
    color: '#fbbf24',
    background: '#1a1608',
    border: '1px solid #b4790f55',
    borderRadius: 10,
    padding: '8px 12px',
    textAlign: 'center',
  },
  orderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    background: '#0f1a2e',
    border: '1px solid #1e2b45',
    borderRadius: 12,
    padding: '10px 14px',
  },
  orderNum: {
    fontSize: 14,
    fontWeight: 800,
    color: '#e2e8f0',
    fontFamily: "'Courier New', monospace",
    direction: 'ltr',
  },
  orderAmt: { fontSize: 16, fontWeight: 800, color: '#f8fafc', flexShrink: 0 },
  chipNeutral: { background: '#1e3a5f', color: '#93c5fd' },
  chipRed: { background: '#3f1d1d', color: '#fca5a5' },

  // Calculator
  calcWrap: { display: 'flex', flexDirection: 'column', gap: 14 },
  calcSection: {
    background: '#0f1a2e',
    border: '1px solid #1e2b45',
    borderRadius: 16,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  calcSecHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  calcLabel: { fontSize: 13, fontWeight: 800, color: '#cbd5e1' },
  calcInput: {
    boxSizing: 'border-box',
    padding: '11px 13px',
    borderRadius: 10,
    border: '1px solid #2a3a58',
    background: '#0b1220',
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: 700,
    outline: 'none',
    fontFamily: 'inherit',
  },
  quickChips: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  quickChip: {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid #2a3a58',
    background: '#0b1220',
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  expRow: { display: 'flex', gap: 8, alignItems: 'center' },
  addBtn: {
    padding: '6px 12px',
    borderRadius: 10,
    border: '1px solid #2a3a58',
    background: 'transparent',
    color: '#4ade80',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  delBtn: {
    width: 34,
    height: 34,
    flexShrink: 0,
    borderRadius: 9,
    border: '1px solid #3f1d1d',
    background: '#1a0e0e',
    color: '#f87171',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
  },
  calcResults: {
    background: 'linear-gradient(135deg, #111c33 0%, #16223d 100%)',
    border: '1px solid #24324e',
    borderRadius: 16,
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  resRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  resLabel: { color: '#94a3b8' },
  resVal: { fontWeight: 800 },
  resDivider: { height: 1, background: '#24324e', margin: '2px 0' },
  shareResult: {
    marginTop: 6,
    background: '#0b2016',
    border: '1px solid #14532d',
    borderRadius: 12,
    padding: '14px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  shareResLabel: { fontSize: 14, fontWeight: 800, color: '#86efac' },
  shareResVal: { fontSize: 24, fontWeight: 800 },
  resetCalc: {
    alignSelf: 'flex-start',
    padding: '8px 16px',
    borderRadius: 10,
    border: '1px solid #2a3a58',
    background: 'transparent',
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  calcHint: { fontSize: 12, color: '#64748b', lineHeight: 1.7, margin: 0 },

  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  empty: { textAlign: 'center', color: '#64748b', padding: 40 },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    background: '#0f1a2e',
    border: '1px solid #1e2b45',
    borderRadius: 14,
    padding: '12px 16px',
  },
  rowCurrent: {
    border: '1px solid #f59e0b',
    background: 'linear-gradient(160deg, #1a1608 0%, #0f1a2e 70%)',
  },
  rowDim: { opacity: 0.55 },
  rowMain: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 },
  rowTitleWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: 800, color: '#f1f5f9' },
  rowSub: { fontSize: 12, color: '#94a3b8' },
  miniBar: {
    height: 5,
    background: '#16223d',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 3,
  },
  miniFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3b82f6, #22d3ee)',
    borderRadius: 999,
  },
  rowNums: { textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 },
  rowDelivery: { fontSize: 16, fontWeight: 800, color: '#f8fafc' },
  rowOrders: { fontSize: 12, color: '#94a3b8' },
  rowShare: { fontSize: 13, fontWeight: 700, color: '#4ade80' },

  footer: { marginTop: 20, fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 1.7 },

  // Gate
  gate: {
    maxWidth: 360,
    margin: '12vh auto 0',
    background: '#0f1a2e',
    border: '1px solid #1e2b45',
    borderRadius: 20,
    padding: 28,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  lock: { fontSize: 40 },
  gateHint: { fontSize: 14, color: '#94a3b8', margin: 0 },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #2a3a58',
    background: '#0b1220',
    color: '#f8fafc',
    fontSize: 15,
    textAlign: 'center',
    outline: 'none',
  },
  primaryBtn: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 12,
    border: 'none',
    background: '#f59e0b',
    color: '#1a1608',
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
  },
  ghostBtn: {
    padding: '8px 14px',
    borderRadius: 10,
    border: '1px solid #2a3a58',
    background: 'transparent',
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  gateErr: { color: '#f87171', fontSize: 13 },
  chip: { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999 },
  chipCurrent: { background: '#f59e0b', color: '#1a1608' },
  chipPast: { background: '#1e2b45', color: '#94a3b8' },
  chipFuture: { background: '#1e2b45', color: '#64748b' },
};
