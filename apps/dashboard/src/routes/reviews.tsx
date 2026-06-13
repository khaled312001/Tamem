/**
 * Admin reviews center — single page that answers three questions:
 *   1. "Which drivers / merchants are getting low ratings?" (leaderboards)
 *   2. "What did customers actually say?" (the comment feed)
 *   3. "Who reviewed this specific order?" (search + filter)
 *
 * Drivers / merchants are computed client-side from the latest review batch
 * because the backend's average lives on DriverProfile.rating already, so a
 * dedicated stats endpoint would be redundant.
 */
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, MessageSquare, Search, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Input } from '../components/ui/Input.js';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReviewRow = any;

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} من 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          style={{ fontSize: size, lineHeight: 1, color: i <= rating ? '#F2A93B' : '#D1D5DB' }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export function ReviewsPage() {
  const [search, setSearch] = useState('');
  const [minRating, setMinRating] = useState<number | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reviews', minRating],
    queryFn: () =>
      api.adminListReviews({
        pageSize: 200,
        ...(minRating ? { minRating } : {}),
      }),
  });

  const reviews = (data?.items as ReviewRow[]) ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reviews;
    return reviews.filter(
      (r) =>
        r.order?.orderNumber?.toLowerCase().includes(q) || r.comment?.toLowerCase().includes(q),
    );
  }, [reviews, search]);

  // Leaderboards — group by driverId / merchantId, average the breakout
  // ratings (not the overall, because the overall mixes both targets).
  const driverStats = useMemo(() => groupAverage(reviews, 'driverId', 'driverRating'), [reviews]);
  const merchantStats = useMemo(
    () => groupAverage(reviews, 'merchantId', 'merchantRating'),
    [reviews],
  );

  const overallAvg = useMemo(() => {
    const nums = reviews.map((r) => Number(r.rating)).filter((n) => Number.isFinite(n));
    if (nums.length === 0) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }, [reviews]);

  const negativeCount = reviews.filter((r) => Number(r.rating) <= 2).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">التقييمات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.pagination.total ?? 0} تقييم — متابعة سعادة العملاء وأداء السائقين والتجار
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="المتوسط العام"
          value={overallAvg != null ? overallAvg.toFixed(2) : '—'}
          tone="amber"
          subtitle="من 5 نجوم"
        />
        <StatCard
          label="إجمالي التقييمات"
          value={String(reviews.length)}
          tone="blue"
          subtitle="ضمن آخر النتائج"
        />
        <StatCard
          label="تقييمات سلبية"
          value={String(negativeCount)}
          tone="red"
          subtitle="≤ ★★ — تحتاج متابعة"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-border p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="ابحث برقم الطلب أو نص التعليق..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-10"
          />
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground mx-1">حد أدنى:</span>
          {[undefined, 5, 4, 3, 2, 1].map((r) => (
            <button
              key={r ?? 'all'}
              onClick={() => setMinRating(r)}
              className={`px-2 py-1 rounded font-bold transition ${
                minRating === r
                  ? 'bg-brand-red text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {r ? `${'★'.repeat(r)}+` : 'الكل'}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Leaderboard title="🏆 السائقون" rows={driverStats} accent="text-brand-red" />
        <Leaderboard title="🏪 التجار" rows={merchantStats} accent="text-brand-orange" />
      </div>

      {/* Reviews feed */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border font-bold flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-brand-red" />
          آخر التقييمات
        </div>
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={6} cols={1} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Star className="w-10 h-10" />} title="لا توجد تقييمات" />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => (
              <li key={r.id} className="p-4 hover:bg-muted/30 transition">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <Stars rating={Number(r.rating)} size={16} />
                      <span className="font-bold">{Number(r.rating)}/5</span>
                      {r.order?.orderNumber && (
                        <Link
                          to={`/orders/${r.order.id}`}
                          className="font-mono text-xs text-brand-red hover:underline ms-1"
                        >
                          #{r.order.orderNumber}
                        </Link>
                      )}
                      <span className="text-xs text-muted-foreground ms-auto">
                        {new Date(r.createdAt).toLocaleDateString('ar-EG')}
                      </span>
                    </div>
                    {(r.driverRating != null || r.merchantRating != null) && (
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {r.driverRating != null && (
                          <span className="inline-flex items-center gap-1">
                            السائق:
                            <Stars rating={Number(r.driverRating)} size={12} />
                            <span className="font-bold">{r.driverRating}</span>
                          </span>
                        )}
                        {r.merchantRating != null && (
                          <span className="inline-flex items-center gap-1">
                            التاجر:
                            <Stars rating={Number(r.merchantRating)} size={12} />
                            <span className="font-bold">{r.merchantRating}</span>
                          </span>
                        )}
                      </div>
                    )}
                    {r.comment && (
                      <p className="mt-2 text-sm italic bg-amber-50 border border-amber-100 rounded-lg p-2">
                        "{r.comment}"
                      </p>
                    )}
                  </div>
                  {r.order?.id && (
                    <Link
                      to={`/orders/${r.order.id}`}
                      className="text-muted-foreground hover:text-brand-red shrink-0"
                      title="افتح الطلب"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface Stat {
  id: string;
  count: number;
  avg: number;
}

function groupAverage(reviews: ReviewRow[], groupKey: string, ratingKey: string): Stat[] {
  const map = new Map<string, { sum: number; count: number }>();
  for (const r of reviews) {
    const id = r[groupKey];
    const v = Number(r[ratingKey]);
    if (!id || !Number.isFinite(v)) continue;
    const cur = map.get(id) ?? { sum: 0, count: 0 };
    cur.sum += v;
    cur.count += 1;
    map.set(id, cur);
  }
  return Array.from(map.entries())
    .map(([id, v]) => ({ id, count: v.count, avg: v.sum / v.count }))
    .sort((a, b) => b.avg - a.avg);
}

function Leaderboard({ title, rows, accent }: { title: string; rows: Stat[]; accent: string }) {
  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div className={`px-4 py-3 border-b border-border font-bold ${accent}`}>{title}</div>
      {rows.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground text-center">لا توجد تقييمات بعد</div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.slice(0, 10).map((r, i) => (
            <li
              key={r.id}
              className="px-4 py-2 flex items-center justify-between text-sm hover:bg-muted/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-muted-foreground w-5">#{i + 1}</span>
                <span className="font-mono text-xs text-muted-foreground truncate">
                  {r.id.slice(-8)}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Stars rating={Math.round(r.avg)} />
                <span className="font-bold">{r.avg.toFixed(2)}</span>
                <span className="text-xs text-muted-foreground">({r.count})</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string;
  value: string;
  subtitle: string;
  tone: 'red' | 'amber' | 'blue';
}) {
  const toneMap: Record<typeof tone, string> = {
    red: 'border-red-200 bg-red-50 text-red-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
  };
  return (
    <div className={`rounded-xl border p-4 ${toneMap[tone]}`}>
      <div className="text-xs font-bold opacity-80">{label}</div>
      <div className="text-3xl font-black mt-1">{value}</div>
      <div className="text-xs opacity-70 mt-1">{subtitle}</div>
    </div>
  );
}
