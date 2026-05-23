import { TrendingDown, TrendingUp } from 'lucide-react';

const STATS = [
  { label: 'طلبات اليوم', value: '142', change: 12, positive: true },
  { label: 'قيد التنفيذ', value: '28', change: 0, positive: true, hint: 'جارية الآن' },
  { label: 'مكتملة', value: '98', change: 8, positive: true },
  { label: 'ملغاة', value: '6', change: 2, positive: false },
];

const SERVICES_BREAKDOWN = [
  { name: 'دليفري', percent: 62, color: 'bg-brand-red' },
  { name: 'شحن', percent: 28, color: 'bg-brand-orange' },
  { name: 'تجار', percent: 10, color: 'bg-brand-gold' },
];

export function OverviewPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">نظرة عامة</h1>
          <p className="text-sm text-muted-foreground mt-1">ملخص أداء اليوم</p>
        </div>
        <button className="bg-brand-red text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-brand-red/90 transition">
          + طلب يدوي
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-5 shadow-sm border border-border">
            <div className="text-sm text-muted-foreground">{stat.label}</div>
            <div className="text-3xl font-black mt-2">{stat.value}</div>
            {stat.change > 0 && (
              <div
                className={`text-xs mt-2 inline-flex items-center gap-1 ${stat.positive ? 'text-green-600' : 'text-red-600'}`}
              >
                {stat.positive ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {stat.change}% عن أمس
              </div>
            )}
            {stat.hint && <div className="text-xs text-muted-foreground mt-2">{stat.hint}</div>}
          </div>
        ))}
      </div>

      {/* Two columns: chart placeholder + services breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">الطلبات حسب اليوم</h2>
            <span className="text-xs text-muted-foreground">آخر 7 أيام</span>
          </div>
          <div className="h-64 flex items-end gap-2">
            {['سبت', 'أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع'].map((d, i) => (
              <div key={d} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className="w-full bg-brand-red rounded-t-lg transition-all hover:bg-brand-red/80"
                  style={{ height: `${30 + i * 8 + Math.random() * 20}%` }}
                />
                <span className="text-xs text-muted-foreground">{d}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">الإيرادات</h2>
          </div>
          <div className="text-3xl font-black mb-1">8,450 ج.م</div>
          <div className="text-xs text-green-600 mb-6">▲ 14% عن أمس</div>

          <div className="space-y-3">
            {SERVICES_BREAKDOWN.map((s) => (
              <div key={s.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{s.name}</span>
                  <span className="font-bold">{s.percent}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${s.color}`} style={{ width: `${s.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
