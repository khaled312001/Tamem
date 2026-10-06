import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  MessageCircle,
  Power,
  RefreshCw,
  Search,
  Send,
  Truck,
  Unlink,
  Users,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { api } from '../lib/api.js';

type Person = {
  id: string;
  name: string;
  phone: string;
  linked: boolean;
  telegramUsername: string | null;
  deepLink: string | null;
};
type TgStatus = {
  tokenSet: boolean;
  tokenSource: 'setting' | 'env' | null;
  botUsername: string | null;
  webhookUrl: string | null;
  webhookExpected: string;
  webhookOk: boolean;
  group: { enabled: boolean; chatId: string | number | null; title: string | null };
  groupCandidate: { chatId: string | number; title: string } | null;
  drivers: Person[];
  linkedCount: number;
  driverCount: number;
  supervisors: Person[];
  supervisorLinkedCount: number;
  supervisorCount: number;
};

export function TelegramPage() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'telegram'],
    queryFn: () => api.raw.get('/admin/telegram').then((r) => r.data.data as TgStatus),
    refetchOnWindowFocus: false,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'telegram'] });

  const setWebhook = useMutation({
    mutationFn: () => api.raw.post('/admin/telegram/webhook', {}).then((r) => r.data.data),
    onSuccess: () => {
      toast.success('تم تفعيل الـ webhook');
      invalidate();
    },
    onError: () => toast.error('فشل تفعيل الـ webhook — راجع التوكن'),
  });
  const saveGroup = useMutation({
    mutationFn: (body: { chatId: string | number | null; enabled: boolean; title?: string }) =>
      api.raw.post('/admin/telegram/group', body).then((r) => r.data.data),
    onSuccess: () => {
      toast.success('تم حفظ إعداد الجروب');
      invalidate();
    },
    onError: () => toast.error('تعذّر الحفظ'),
  });
  const testMsg = useMutation({
    mutationFn: () => api.raw.post('/admin/telegram/test', {}).then((r) => r.data.data),
    onSuccess: () => toast.success('تم إرسال رسالة التجربة للجروب ✅'),
    onError: () => toast.error('فشل الإرسال — تأكد إن البوت موجود في الجروب'),
  });
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const saveToken = useMutation({
    mutationFn: (token: string) =>
      api.raw.post('/admin/telegram/token', { token }).then((r) => r.data.data),
    onSuccess: (d: { botUsername?: string }) => {
      toast.success(`تم تغيير البوت ✅ ${d?.botUsername ? '@' + d.botUsername : ''}`);
      setTokenOpen(false);
      setTokenInput('');
      invalidate();
    },
    onError: () => toast.error('التوكن غير صالح — راجعه من BotFather'),
  });
  const [tab, setTab] = useState<'drivers' | 'supervisors'>('drivers');
  const [search, setSearch] = useState('');
  const unlink = useMutation({
    mutationFn: (p: { kind: 'drivers' | 'supervisors'; id: string }) =>
      api.raw
        .post(
          p.kind === 'drivers'
            ? '/admin/telegram/driver-unlink'
            : '/admin/telegram/supervisor-unlink',
          p.kind === 'drivers' ? { driverId: p.id } : { supervisorId: p.id },
        )
        .then((r) => r.data.data),
    onSuccess: () => {
      toast.success('تم فك الربط');
      invalidate();
    },
  });

  if (isLoading || !data) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="inline h-6 w-6 animate-spin" />
        <div className="mt-2 text-sm">جاري التحميل…</div>
      </div>
    );
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('تم نسخ الرابط — ابعته للشخص على واتساب');
    } catch {
      toast.error('تعذّر النسخ');
    }
  };

  const groupReady = !!data.group.chatId && data.group.enabled;
  const readyCount = [data.tokenSet, data.webhookOk, groupReady].filter(Boolean).length;
  const allReady = readyCount === 3;

  const people = tab === 'drivers' ? data.drivers : data.supervisors;
  const q = search.trim();
  const filtered = q
    ? people.filter((p) => (p.name || '').includes(q) || (p.phone || '').includes(q))
    : people;
  const linkedN = tab === 'drivers' ? data.linkedCount : data.supervisorLinkedCount;
  const totalN = tab === 'drivers' ? data.driverCount : data.supervisorCount;
  const pct = totalN ? Math.round((linkedN / totalN) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* ─── Hero ─── */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-l from-sky-500 to-sky-600 p-5 text-white shadow-lg shadow-sky-500/20">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
              <Send className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xl font-black">تلجرام</div>
              <div className="text-sm text-white/80">
                إشعارات الطلبات للسواقين والمشرفين والجروب
              </div>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            title="تحديث"
            className="rounded-lg bg-white/15 p-2 transition hover:bg-white/25"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-bold">
            <span
              className={`h-2 w-2 rounded-full ${allReady ? 'bg-emerald-300' : 'bg-amber-300'} ${allReady ? '' : 'animate-pulse'}`}
            />
            {data.botUsername ? `@${data.botUsername}` : 'بوت غير متصل'}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold">
            {allReady ? 'جاهز للعمل ✓' : `${readyCount}/3 خطوات مكتملة`}
          </span>
        </div>
      </div>

      {/* ─── Setup: token + webhook ─── */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 text-sm font-black text-muted-foreground">الإعداد</div>
        <div className="space-y-2">
          <SetupRow
            icon={<KeyRound className="h-4 w-4" />}
            title="توكن البوت"
            ok={data.tokenSet}
            okText="مضبوط"
            badText="غير مضبوط"
            action={
              <Button size="sm" variant="outline" onClick={() => setTokenOpen((o) => !o)}>
                {data.tokenSet ? 'تغيير البوت' : 'إضافة توكن'}
              </Button>
            }
          />
          {tokenOpen && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
              <div className="mb-2 text-xs leading-6 text-sky-900/80">
                الصق توكن البوت الجديد من <b>BotFather</b> — هنتأكد منه ونظبط الـ webhook تلقائيًا.
                <br />
                <b>تنبيه:</b> لو غيّرت البوت، كل السواقين والمشرفين لازم يعيدوا الربط على البوت
                الجديد.
              </div>
              <div className="flex gap-2">
                <input
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="123456:ABC-DEF…"
                  dir="ltr"
                  className="flex-1 rounded-lg border border-input bg-popover px-2.5 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-sky-400/40"
                />
                <Button
                  size="sm"
                  onClick={() => saveToken.mutate(tokenInput.trim())}
                  disabled={!tokenInput.trim() || saveToken.isPending}
                >
                  {saveToken.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  حفظ
                </Button>
              </div>
            </div>
          )}
          <SetupRow
            icon={<Link2 className="h-4 w-4" />}
            title="الـ Webhook"
            ok={data.webhookOk}
            okText="مفعّل"
            badText="غير مفعّل"
            action={
              data.webhookOk ? undefined : (
                <Button
                  size="sm"
                  onClick={() => setWebhook.mutate()}
                  disabled={!data.tokenSet || setWebhook.isPending}
                >
                  {setWebhook.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  تفعيل
                </Button>
              )
            }
          />
        </div>
      </section>

      {/* ─── Group ─── */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-black text-muted-foreground">
          <Users className="h-4 w-4" /> جروب الشغل
          <span className="font-normal">· إشعار كل طلب جديد</span>
        </div>

        {data.group.chatId ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="min-w-0">
                <div className="truncate font-bold">{data.group.title || 'جروب مربوط'}</div>
                <div className="text-xs text-muted-foreground" dir="ltr">
                  {String(data.group.chatId)}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                  data.group.enabled ? 'bg-emerald-600 text-white' : 'bg-muted text-foreground'
                }`}
              >
                {data.group.enabled ? 'مُفعّل' : 'موقوف'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={data.group.enabled ? 'outline' : 'primary'}
                onClick={() =>
                  saveGroup.mutate({
                    chatId: data.group.chatId,
                    enabled: !data.group.enabled,
                    title: data.group.title ?? undefined,
                  })
                }
                disabled={saveGroup.isPending}
              >
                <Power className="h-3.5 w-3.5" />{' '}
                {data.group.enabled ? 'إيقاف الإرسال' : 'تفعيل الإرسال'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testMsg.mutate()}
                disabled={testMsg.isPending}
              >
                {testMsg.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MessageCircle className="h-3.5 w-3.5" />
                )}
                رسالة تجربة
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => saveGroup.mutate({ chatId: null, enabled: false })}
                disabled={saveGroup.isPending}
              >
                <X className="h-3.5 w-3.5" /> فك الربط
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <ol className="space-y-1.5 text-sm text-muted-foreground">
              <StepLine n={1}>اعمل جروب تلجرام جديد للشغل.</StepLine>
              <StepLine n={2}>
                ضيف البوت {data.botUsername ? <b dir="ltr">@{data.botUsername}</b> : ''} في الجروب
                (ويفضّل تخليه أدمن).
              </StepLine>
              <StepLine n={3}>ابعت أي رسالة في الجروب، وبعدها اضغط «تحديث» فوق.</StepLine>
            </ol>
            {data.groupCandidate ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
                <div className="min-w-0">
                  <div className="text-xs text-sky-700">جروب تم اكتشافه</div>
                  <div className="truncate font-bold">{data.groupCandidate.title || 'جروب'}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">
                    {String(data.groupCandidate.chatId)}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    saveGroup.mutate({
                      chatId: data.groupCandidate!.chatId,
                      enabled: true,
                      title: data.groupCandidate!.title,
                    })
                  }
                  disabled={saveGroup.isPending}
                >
                  <Link2 className="h-3.5 w-3.5" /> اربط الجروب ده
                </Button>
              </div>
            ) : (
              <p className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
                لسه مفيش جروب متكتشف — ابعت رسالة في الجروب بعد إضافة البوت، واضغط «تحديث».
              </p>
            )}
          </div>
        )}
      </section>

      {/* ─── People linking ─── */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        {/* segmented tabs */}
        <div className="flex rounded-xl bg-muted p-1">
          <SegTab active={tab === 'drivers'} onClick={() => setTab('drivers')}>
            <Truck className="h-4 w-4" /> السائقون
            <Count>
              {data.linkedCount}/{data.driverCount}
            </Count>
          </SegTab>
          <SegTab active={tab === 'supervisors'} onClick={() => setTab('supervisors')}>
            <Users className="h-4 w-4" /> المشرفون
            <Count>
              {data.supervisorLinkedCount}/{data.supervisorCount}
            </Count>
          </SegTab>
        </div>

        {/* progress */}
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-sky-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-bold text-muted-foreground">{pct}% مربوط</span>
        </div>

        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          {tab === 'drivers'
            ? 'انسخ رابط الربط وابعته للسائق على واتساب — يفتحه ويضغط Start فيتربط ويبدأ يستقبل طلباته على تلجرام.'
            : 'انسخ رابط الربط وابعته للمشرف — يفتحه ويضغط Start فيبدأ يستقبل كل الطلبات على تلجرام. (أضِف المشرفين الأول من صفحة «المشرفون».)'}
        </p>

        {/* search */}
        {people.length > 6 && (
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الرقم…"
              className="w-full rounded-lg border border-input bg-popover py-2 pe-3 ps-9 text-sm outline-none focus:ring-2 focus:ring-sky-400/40"
            />
          </div>
        )}

        {/* list */}
        <div className="mt-2 divide-y divide-border">
          {filtered.map((p) => (
            <PersonRow
              key={p.id}
              p={p}
              onCopy={copy}
              onUnlink={() => unlink.mutate({ kind: tab, id: p.id })}
            />
          ))}
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {q
                ? 'مفيش نتائج للبحث'
                : tab === 'drivers'
                  ? 'لا يوجد سائقون'
                  : 'لا يوجد مشرفون — أضفهم من صفحة «المشرفون» الأول'}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SetupRow({
  icon,
  title,
  ok,
  okText,
  badText,
  action,
}: {
  icon: ReactNode;
  title: string;
  ok: boolean;
  okText: string;
  badText: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background/40 p-2.5">
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            ok ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
          }`}
        >
          {icon}
        </div>
        <div>
          <div className="text-sm font-bold">{title}</div>
          <div
            className={`inline-flex items-center gap-1 text-xs font-bold ${
              ok ? 'text-emerald-600' : 'text-amber-600'
            }`}
          >
            {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {ok ? okText : badText}
          </div>
        </div>
      </div>
      {action}
    </div>
  );
}

function StepLine({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-black text-sky-700">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function SegTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition ${
        active ? 'bg-card text-sky-600 shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function Count({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[11px] font-black text-sky-700">
      {children}
    </span>
  );
}

function PersonRow({
  p,
  onCopy,
  onUnlink,
}: {
  p: Person;
  onCopy: (text: string) => void;
  onUnlink: () => void;
}) {
  const initial = (p.name || '؟').trim().charAt(0);
  return (
    <div className="flex items-center justify-between gap-2 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${
            p.linked ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
          }`}
        >
          {initial}
        </div>
        <div className="min-w-0">
          <div className="truncate font-bold">{p.name}</div>
          <div className="text-xs text-muted-foreground" dir="ltr">
            {p.telegramUsername ? `@${p.telegramUsername}` : p.phone}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {p.linked ? (
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-600">
              <Check className="h-3.5 w-3.5" /> مربوط
            </span>
            <Button size="sm" variant="outline" onClick={onUnlink}>
              <Unlink className="h-3.5 w-3.5" /> فك
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => p.deepLink && onCopy(p.deepLink)}
            disabled={!p.deepLink}
          >
            <Copy className="h-3.5 w-3.5" /> نسخ الرابط
          </Button>
        )}
      </div>
    </div>
  );
}
