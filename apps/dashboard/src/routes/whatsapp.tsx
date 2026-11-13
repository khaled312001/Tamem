import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Loader2,
  Megaphone,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  PowerOff,
  QrCode,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { BroadcastDialog, type BroadcastOffer } from '../components/whatsapp/BroadcastDialog.js';
import { Button } from '../components/ui/Button.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { PhoneInput } from '../components/ui/PhoneInput.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';

type Status = 'disconnected' | 'qr' | 'connecting' | 'connected' | 'idle';

interface Line {
  id: string;
  label: string;
  main: boolean;
  offers: boolean;
  bulkPerDay: number;
  status: Status;
  qrDataUrl: string | null;
  phone: string | null;
  lastError: string | null;
  pendingMessages: number;
  pendingBulk: number;
  bulkSentToday: number;
}

interface LinesData {
  lines: Line[];
  maxLines: number;
  confirm: { enabled: boolean; line: string; text: string; defaultText: string };
  optOuts: number;
}

interface BroadcastLog {
  log: {
    id: string;
    at: string;
    title: string;
    count: number;
    perLine: Record<string, number>;
    audience: string;
    withImage: boolean;
  }[];
  pendingBulk: number;
  sentToday: number;
  optOuts: number;
}

const KEY = ['admin', 'whatsapp', 'lines'] as const;

function errMsg(e: unknown): string {
  const r = (e as { response?: { data?: { error?: { message?: string } } } }).response;
  return r?.data?.error?.message || (e as Error).message || 'حصل خطأ';
}

function useLines() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.raw.get('/admin/whatsapp/lines').then((r) => r.data.data as LinesData),
    // Fast while someone is scanning a code or a session is coming up.
    refetchInterval: (q) =>
      q.state.data?.lines.some((l) => l.status === 'qr' || l.status === 'connecting')
        ? 2500
        : 15_000,
    retry: 1,
  });
}

export function WhatsAppPage() {
  const me = useAuth((s) => s.user) as { role?: string } | null;
  const isSuper = me?.role === 'SUPER_ADMIN';
  const { data, isLoading, isError, error, refetch } = useLines();
  const main = data?.lines.find((l) => l.main);

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-brand-dark">ربط واتساب</h1>
        <p className="text-sm text-muted-foreground mt-1">
          اربط أكتر من رقم: رقم يبعت للعميل رسالة تأكيد الأوردر، وأرقام تانية تبعت العروض.
        </p>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-border p-10 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : isError || !data ? (
        <div className="bg-white rounded-xl border border-destructive/30 p-6 text-center space-y-3">
          <XCircle className="w-8 h-8 text-destructive mx-auto" />
          <div className="font-bold">تعذّر الاتصال بالسيرفر</div>
          <div className="text-sm text-muted-foreground">{errMsg(error)}</div>
          <Button onClick={() => refetch()}>إعادة المحاولة</Button>
        </div>
      ) : (
        <>
          <LinesSection data={data} isSuper={isSuper} />
          <ConfirmCard data={data} isSuper={isSuper} />
          <OffersCard data={data} isSuper={isSuper} />
        </>
      )}

      {main?.status === 'connected' && <OrderGroupCard />}
      {main?.status === 'connected' && <SendTestCard />}

      <InfoCard />
    </div>
  );
}

// ── Numbers ───────────────────────────────────────────────────────────────

function LinesSection({ data, isSuper }: { data: LinesData; isSuper: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [offers, setOffers] = useState(true);
  const extras = data.lines.filter((l) => !l.main).length;

  const add = useMutation({
    mutationFn: () =>
      api.raw
        .post('/admin/whatsapp/lines', { label, offers })
        .then((r) => r.data.data as LinesData),
    onSuccess: (d) => {
      qc.setQueryData(KEY, d);
      setAdding(false);
      setLabel('');
      toast.success('اتضاف الرقم. كود الربط هيظهر في ثواني، امسحه من الموبايل اللي عليه الرقم');
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-black text-brand-dark">الأرقام المربوطة</div>
        {isSuper && (
          <Button size="sm" onClick={() => setAdding(true)} disabled={extras >= data.maxLines}>
            <Plus className="w-4 h-4" /> إضافة رقم
          </Button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2 items-start">
        {data.lines.map((l) => (
          <LineCard key={l.id} line={l} data={data} isSuper={isSuper} />
        ))}
      </div>

      <Dialog open={adding} onOpenChange={setAdding} title="إضافة رقم واتساب" size="sm">
        <div className="space-y-3">
          <Field label="اسم الرقم" hint="عشان تفرّق بين الأرقام، مثلاً: عروض 1">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              placeholder="عروض 1"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={offers} onChange={(e) => setOffers(e.target.checked)} />
            يستخدم في إرسال العروض
          </label>
          <p className="text-xs text-muted-foreground leading-5">
            بعد الإضافة هيظهر كود QR. افتح واتساب على الموبايل اللي عليه الرقم ← الأجهزة المرتبطة ←
            ربط جهاز، وامسح الكود.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>
              إلغاء
            </Button>
            <Button onClick={() => add.mutate()} disabled={add.isPending}>
              {add.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              إضافة
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

const TONE: Record<Status, { color: string; Icon: typeof CheckCircle2; label: string }> = {
  connected: {
    color: 'bg-green-100 text-green-700 border-green-200',
    Icon: CheckCircle2,
    label: 'متصل',
  },
  qr: {
    color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    Icon: QrCode,
    label: 'مستني المسح',
  },
  connecting: { color: 'bg-blue-100 text-blue-700 border-blue-200', Icon: Loader2, label: 'بيتصل' },
  idle: { color: 'bg-gray-100 text-gray-700 border-gray-200', Icon: PowerOff, label: 'مش مربوط' },
  disconnected: {
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    Icon: XCircle,
    label: 'غير متصل',
  },
};

function LineCard({ line, data, isSuper }: { line: Line; data: LinesData; isSuper: boolean }) {
  const qc = useQueryClient();
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(line.label);
  const [cap, setCap] = useState(String(line.bulkPerDay));
  useEffect(() => setCap(String(line.bulkPerDay)), [line.bulkPerDay]);
  const tone = TONE[line.status] ?? TONE.disconnected;
  const confirms = data.confirm.enabled && data.confirm.line === line.id;

  const done = (d: LinesData) => qc.setQueryData(KEY, d);
  const patch = useMutation({
    mutationFn: (b: Partial<Pick<Line, 'label' | 'offers' | 'bulkPerDay'>>) =>
      api.raw.patch(`/admin/whatsapp/lines/${line.id}`, b).then((r) => r.data.data as LinesData),
    onSuccess: (d) => {
      done(d);
      setEditing(false);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const control = useMutation({
    mutationFn: (action: 'start' | 'logout') =>
      api.raw
        .post(`/admin/whatsapp/lines/${line.id}/${action}`)
        .then((r) => r.data.data as LinesData),
    onSuccess: (d, action) => {
      done(d);
      setConfirmOut(false);
      toast.success(
        action === 'start'
          ? 'كود الربط هيظهر في ثواني'
          : 'اتقفلت الجلسة، امسح كود جديد عشان تربط تاني',
      );
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: () =>
      api.raw.delete(`/admin/whatsapp/lines/${line.id}`).then((r) => r.data.data as LinesData),
    onSuccess: (d) => {
      done(d);
      setConfirmDel(false);
      toast.success('اتمسح الرقم');
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="bg-white rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-green-50 grid place-items-center shrink-0">
            <MessageCircle className="w-5 h-5 text-green-600" />
          </span>
          <div className="min-w-0">
            {editing ? (
              <div className="flex items-center gap-1">
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={40}
                  className="h-8"
                />
                <Button
                  size="sm"
                  onClick={() => patch.mutate({ label })}
                  disabled={patch.isPending || !label.trim()}
                >
                  <Save className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="font-bold flex items-center gap-1">
                <span className="truncate">{line.label}</span>
                {isSuper && !line.main && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-muted-foreground hover:text-foreground"
                    title="تغيير الاسم"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-1 mt-1">
              {line.main && <Tag>أساسي (أكواد التفعيل والتنبيهات)</Tag>}
              {confirms && <Tag tone="green">بيبعت تأكيد الأوردر</Tag>}
              {line.offers && <Tag tone="red">للعروض</Tag>}
            </div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shrink-0 ${tone.color}`}
        >
          <tone.Icon
            className={`w-3.5 h-3.5 ${line.status === 'connecting' ? 'animate-spin' : ''}`}
          />
          {tone.label}
        </span>
      </div>

      {line.status === 'connected' && line.phone && (
        <div className="flex items-center gap-2 text-sm bg-green-50 text-green-800 rounded-lg p-2.5">
          <Phone className="w-4 h-4" />
          <span className="font-mono" dir="ltr">
            +{line.phone}
          </span>
        </div>
      )}

      {line.status === 'qr' && line.qrDataUrl && (
        <div className="flex flex-col items-center bg-muted/30 rounded-lg p-4 gap-2">
          <div className="text-xs text-muted-foreground text-center">
            واتساب على الموبايل ← الأجهزة المرتبطة ← ربط جهاز ← امسح الكود
          </div>
          <img
            src={line.qrDataUrl}
            alt="WhatsApp QR"
            className="w-56 h-56 bg-white p-2 rounded-lg shadow"
          />
        </div>
      )}

      {line.status === 'idle' && (
        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground leading-5 space-y-2">
          <div>الرقم ده مش مربوط. اضغط «اعرض كود الربط» وامسحه من الموبايل اللي عليه الرقم.</div>
          <Button size="sm" onClick={() => control.mutate('start')} disabled={control.isPending}>
            <QrCode className="w-4 h-4" /> اعرض كود الربط
          </Button>
        </div>
      )}

      {line.status === 'connecting' && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-lg text-xs">
          <Loader2 className="w-4 h-4 animate-spin" /> بيجهز الجلسة، ممكن ياخد 20 لـ 40 ثانية
        </div>
      )}

      {line.lastError && line.status !== 'idle' && (
        <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-2.5">
          {line.lastError}
        </div>
      )}

      {line.offers && (
        <div className="text-xs text-muted-foreground">
          عروض النهارده: {line.bulkSentToday} من {line.bulkPerDay}
          {line.pendingBulk > 0 && <> · مستني {line.pendingBulk}</>}
        </div>
      )}

      {isSuper && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={line.offers}
              onChange={(e) => patch.mutate({ offers: e.target.checked })}
              disabled={patch.isPending}
            />
            للعروض
          </label>
          {line.offers && (
            <label className="flex items-center gap-1 text-xs">
              أقصى في اليوم
              <input
                type="number"
                min={10}
                max={300}
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                onBlur={() => +cap !== line.bulkPerDay && patch.mutate({ bulkPerDay: +cap })}
                className="w-16 px-1.5 py-1 rounded border border-input text-xs"
              />
            </label>
          )}
          <div className="flex-1" />
          {line.status !== 'idle' && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmOut(true)}>
              <PowerOff className="w-3.5 h-3.5" /> إنهاء الجلسة
            </Button>
          )}
          {!line.main && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmDel(true)}
            >
              <Trash2 className="w-3.5 h-3.5" /> حذف
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOut}
        onOpenChange={setConfirmOut}
        title={`إنهاء جلسة «${line.label}»؟`}
        message={
          line.main
            ? 'أكواد التفعيل وتنبيهات الطلبات هتقف لحد ما تمسح كود جديد.'
            : 'الرقم هيتفصل عن السيستم لحد ما تمسح كود جديد.'
        }
        confirmLabel="إنهاء الجلسة"
        loading={control.isPending}
        onConfirm={() => control.mutate('logout')}
      />
      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title={`حذف «${line.label}»؟`}
        message={
          confirms
            ? 'الرقم ده بيبعت تأكيد الأوردر. بعد الحذف التأكيد هيتبعت من الرقم الأساسي. العروض اللي مستنية عليه مش هتتبعت.'
            : 'هيتفصل من واتساب ويتمسح من السيستم. العروض اللي مستنية عليه مش هتتبعت.'
        }
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}

function Tag({ children, tone }: { children: ReactNode; tone?: 'green' | 'red' }) {
  const c =
    tone === 'green'
      ? 'bg-green-100 text-green-800'
      : tone === 'red'
        ? 'bg-brand-red/10 text-brand-red'
        : 'bg-muted text-muted-foreground';
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c}`}>{children}</span>;
}

// ── Order confirmation ────────────────────────────────────────────────────

const VARS: { key: string; label: string; sample: string }[] = [
  { key: 'customerName', label: 'اسم العميل', sample: 'أحمد' },
  { key: 'orderNumber', label: 'رقم الأوردر', sample: '12345' },
  { key: 'price', label: 'الإجمالي', sample: '150 ج.م' },
  { key: 'deliveryAddress', label: 'العنوان', sample: 'شارع الجمهورية' },
  { key: 'serviceName', label: 'الخدمة', sample: 'توصيل' },
  { key: 'paymentMethod', label: 'طريقة الدفع', sample: 'كاش' },
];

function renderSample(tpl: string): string {
  const map = Object.fromEntries(VARS.map((v) => [v.key, v.sample]));
  return tpl.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, k: string) => map[k] ?? '');
}

function ConfirmCard({ data, isSuper }: { data: LinesData; isSuper: boolean }) {
  const qc = useQueryClient();
  const cf = data.confirm;
  const [enabled, setEnabled] = useState(cf.enabled);
  const [line, setLine] = useState(cf.line);
  const [text, setText] = useState(cf.text || cf.defaultText);
  const [testPhone, setTestPhone] = useState('');
  useEffect(() => {
    setEnabled(cf.enabled);
    setLine(cf.line);
    setText(cf.text || cf.defaultText);
  }, [cf.enabled, cf.line, cf.text, cf.defaultText]);

  const chosen = data.lines.find((l) => l.id === line);
  const dirty =
    enabled !== cf.enabled ||
    line !== cf.line ||
    text.trim() !== (cf.text || cf.defaultText).trim();

  const save = useMutation({
    mutationFn: () =>
      api.raw
        .put('/admin/whatsapp/confirm', { enabled, line, text })
        .then((r) => r.data.data as LinesData),
    onSuccess: (d) => {
      qc.setQueryData(KEY, d);
      toast.success(
        enabled ? 'اتحفظ. كل أوردر جديد هياخد رسالة تأكيد' : 'اتحفظ. رسالة التأكيد متوقفة',
      );
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const test = useMutation({
    mutationFn: () =>
      api.raw
        .post('/admin/whatsapp/confirm/test', { phone: testPhone, line, text })
        .then((r) => r.data.data),
    onSuccess: () => toast.success('اتبعتت رسالة تجربة'),
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-green-500/10 text-green-600 shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-brand-dark">رسالة تأكيد الأوردر للعميل</div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-5">
            دي الرسالة الوحيدة اللي العميل بياخدها على واتساب للأوردر. بتتبعت مرة واحدة أول ما
            الأوردر يتأكد، وباقي التحديثات بتوصله إشعار على التطبيق وإيميل.
          </p>
        </div>
      </div>

      <label className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer">
        <span className="font-bold text-sm">{enabled ? 'شغالة' : 'متوقفة'}</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!isSuper}
          onClick={() => setEnabled((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${enabled ? 'bg-green-500' : 'bg-zinc-300'}`}
        >
          <span
            className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white shadow transition-[inset-inline-start] ${enabled ? 'start-[22px]' : 'start-0.5'}`}
          />
        </button>
      </label>

      <Field label="الرقم اللي يبعتها">
        <select
          value={line}
          disabled={!isSuper}
          onChange={(e) => setLine(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-input bg-popover text-sm"
        >
          {data.lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
              {l.phone ? ` (+${l.phone})` : ''} · {TONE[l.status]?.label ?? l.status}
            </option>
          ))}
        </select>
      </Field>
      {enabled && chosen && chosen.status !== 'connected' && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          الرقم ده مش متصل دلوقتي. الرسايل هتستنى لحد 3 ساعات وبعدها تتلغي، فاربطه أو اختار رقم
          تاني.
        </div>
      )}
      {enabled && chosen?.offers && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          الأفضل رقم التأكيد ميبقاش رقم عروض: لو واتساب قفل رقم العروض، التأكيدات هتقف معاه.
        </div>
      )}

      <div>
        <Field label="نص الرسالة">
          <Textarea
            value={text}
            disabled={!isSuper}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={1000}
          />
        </Field>
        {isSuper && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {VARS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setText((t) => `${t}{{${v.key}}}`)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-border hover:bg-muted"
              >
                + {v.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setText(cf.defaultText)}
              className="text-[11px] px-2 py-0.5 rounded-full text-brand-red hover:underline"
            >
              رجّع النص الأصلي
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-[#e7ffdb] border border-green-200 p-3 text-sm whitespace-pre-wrap leading-6">
        {renderSample(text)}
      </div>

      {isSuper && (
        <div className="flex flex-wrap items-end gap-2">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            {save.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            حفظ
          </Button>
          <div className="flex-1" />
          <div className="w-48">
            <PhoneInput value={testPhone} onChange={setTestPhone} />
          </div>
          <Button
            variant="outline"
            onClick={() => test.mutate()}
            disabled={!testPhone.trim() || test.isPending}
          >
            <Send className="w-4 h-4" /> ابعت تجربة
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Offers over WhatsApp ──────────────────────────────────────────────────

function OffersCard({ data, isSuper }: { data: LinesData; isSuper: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [offer, setOffer] = useState<BroadcastOffer | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const log = useQuery({
    queryKey: ['admin', 'whatsapp', 'broadcasts'],
    queryFn: () =>
      api.raw.get('/admin/whatsapp/broadcasts').then((r) => r.data.data as BroadcastLog),
    refetchInterval: 30_000,
  });
  const offers = useQuery({
    queryKey: ['admin-offers'],
    queryFn: () => api.adminListOffers() as Promise<BroadcastOffer[]>,
    enabled: isSuper,
  });
  const cancel = useMutation({
    mutationFn: () =>
      api.raw
        .post('/admin/whatsapp/broadcast/cancel')
        .then((r) => r.data.data as { cancelled: number }),
    onSuccess: (r) => {
      toast.success(`اتلغت ${r.cancelled} رسالة كانت مستنية`);
      setConfirmCancel(false);
      void qc.invalidateQueries({ queryKey: ['admin', 'whatsapp'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const offerLines = data.lines.filter((l) => l.offers);
  const labelOf = useMemo(
    () => Object.fromEntries(data.lines.map((l) => [l.id, l.label])),
    [data.lines],
  );
  const L = log.data;

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand-red/10 text-brand-red shrink-0">
          <Megaphone className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-brand-dark">العروض على واتساب</div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-5">
            بتتبعت من الأرقام المتعلّمة «للعروض» بس (
            {offerLines.length ? offerLines.map((l) => l.label).join('، ') : 'مفيش لسه'}). صورة
            العرض ووصفه تحتها، باسم كل عميل.
          </p>
        </div>
      </div>

      {L && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat n={L.sentToday} label="اتبعت النهارده" />
          <Stat n={L.pendingBulk} label="مستني" />
          <Stat n={L.optOuts} label="طلبوا إيقاف" />
        </div>
      )}

      {isSuper && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-input bg-popover text-sm"
            value={offer?.id ?? ''}
            onChange={(e) =>
              setOffer((offers.data ?? []).find((o) => o.id === e.target.value) ?? null)
            }
          >
            <option value="">بدون صورة (نص بس)</option>
            {(offers.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.titleAr}
              </option>
            ))}
          </select>
          <Button onClick={() => setOpen(true)}>
            <Send className="w-4 h-4" /> ابعت عرض
          </Button>
          {(L?.pendingBulk ?? 0) > 0 && (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmCancel(true)}
            >
              إلغاء اللي مستني
            </Button>
          )}
        </div>
      )}

      {L && L.log.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-start">
                <th className="text-start py-1.5 font-bold">التاريخ</th>
                <th className="text-start py-1.5 font-bold">العرض</th>
                <th className="text-start py-1.5 font-bold">العدد</th>
                <th className="text-start py-1.5 font-bold">من</th>
              </tr>
            </thead>
            <tbody>
              {L.log.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="py-1.5 whitespace-nowrap">
                    {new Date(b.at).toLocaleString('ar-EG', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-1.5 truncate max-w-[220px]">{b.title}</td>
                  <td className="py-1.5">{b.count}</td>
                  <td className="py-1.5">
                    {Object.keys(b.perLine)
                      .map((id) => labelOf[id] ?? 'رقم اتمسح')
                      .join('، ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BroadcastDialog open={open} onOpenChange={setOpen} offer={offer} />
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="إلغاء العروض اللي لسه متبعتتش؟"
        message={`${L?.pendingBulk ?? 0} رسالة هتتشال من الطابور. اللي اتبعت خلاص مش هيتأثر.`}
        confirmLabel="إلغاء الإرسال"
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
      />
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className="text-lg font-black">{n}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

// ── Main number: order group + test message ──────────────────────────────

/**
 * Pick a WhatsApp group to receive a message whenever a new order lands in the
 * dashboard. The group list comes from the connected account itself (the bridge
 * publishes it), so only groups this number is actually in can be chosen.
 */
function OrderGroupCard() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>('');
  const [enabled, setEnabled] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'whatsapp', 'groups'],
    queryFn: () => api.adminWhatsAppGroups(),
  });

  // Seed the controls from the saved config once, then let the admin drive.
  if (data && !seeded) {
    setSelected(data.config.groupId ?? '');
    setEnabled(data.config.enabled);
    setSeeded(true);
  }

  const refresh = useMutation({
    mutationFn: () => api.adminWhatsAppRefreshGroups(),
    onSuccess: async () => {
      toast.info('يتم تحديث قائمة الجروبات…');
      // The bridge re-scans asynchronously; give it a moment then reload.
      setTimeout(() => refetch(), 6000);
    },
  });

  const save = useMutation({
    mutationFn: () => api.adminWhatsAppSaveGroup({ enabled, groupId: selected || null }),
    onSuccess: (cfg) => {
      toast.success(
        cfg.enabled ? `تم الربط بجروب «${cfg.groupName ?? ''}»` : 'تم إيقاف تنبيه الجروب',
      );
      qc.invalidateQueries({ queryKey: ['admin', 'whatsapp', 'groups'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groups = data?.groups ?? [];
  const invalid = enabled && !selected;

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-green-500/10 text-green-600 shrink-0">
          <Users className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-brand-dark">تنبيه الطلبات على جروب واتساب</div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-5">
            من الرقم الأساسي. اختار جروب من جروباته، وأول ما يوصل طلب جديد هيتبعت له رسالة.
          </p>
        </div>
      </div>

      <label className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer">
        <div>
          <div className="font-bold text-sm">تفعيل التنبيه</div>
          <div className="text-xs text-muted-foreground">
            {enabled ? 'مفعّل، الطلبات الجديدة بتتبعت للجروب' : 'موقوف'}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? 'bg-green-500' : 'bg-zinc-300'}`}
        >
          <span
            className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white shadow transition-[inset-inline-start] ${enabled ? 'start-[22px]' : 'start-0.5'}`}
          />
        </button>
      </label>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-bold">الجروب</span>
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending || isFetching}
            className="text-xs font-bold text-brand-red hover:underline inline-flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refresh.isPending || isFetching ? 'animate-spin' : ''}`}
            />
            تحديث القائمة
          </button>
        </div>
        {isLoading ? (
          <div className="h-10 rounded-lg bg-muted/40 animate-pulse" />
        ) : groups.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground leading-5">
            مفيش جروبات ظهرت لسه. اتأكد إن الرقم الأساسي عضو في الجروب، وبعدين اضغط «تحديث القائمة».
          </p>
        ) : (
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-popover text-sm"
          >
            <option value="">اختار جروب</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.size} عضو)
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={invalid || save.isPending}>
          {save.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          حفظ
        </Button>
        {invalid && <span className="text-xs text-destructive">اختار جروب الأول.</span>}
      </div>
    </div>
  );
}

function SendTestCard() {
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('رسالة تجريبية من تميم للتوصيل ✓');

  const send = useMutation({
    mutationFn: () => api.adminWhatsAppSendTest(phone.trim(), msg),
    onSuccess: (res) => {
      if (res.sent) toast.success('تم الإرسال بنجاح');
      else toast.error('فشل الإرسال، اتأكد من الرقم');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-brand-red/10 grid place-items-center">
          <Send className="w-5 h-5 text-brand-red" />
        </div>
        <div className="font-bold">رسالة تجريبية من الرقم الأساسي</div>
      </div>
      <Field label="رقم المستلم" hint="اكتب الرقم من غير كود الدولة، مثلاً: 01070750167">
        <PhoneInput value={phone} onChange={setPhone} />
      </Field>
      <Field label="نص الرسالة">
        <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} />
      </Field>
      <div className="flex justify-end">
        <Button
          onClick={() => send.mutate()}
          disabled={!phone.trim() || !msg.trim() || send.isPending}
        >
          <Send className="w-4 h-4" /> إرسال
        </Button>
      </div>
    </div>
  );
}

function InfoCard() {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-sm space-y-2">
      <div className="font-bold text-blue-900">ملاحظات</div>
      <ul className="list-disc list-inside text-blue-800 space-y-1">
        <li>
          الجلسات بتفضل شغالة لوحدها، ولو السيرفر عمل ريستارت بترجع من غير ما تمسح الكود تاني.
        </li>
        <li>
          العميل بياخد على واتساب رسالة واحدة بس للأوردر (التأكيد). باقي التحديثات إشعار وإيميل.
        </li>
        <li>الرقم الأساسي هو اللي بيبعت أكواد التفعيل وتنبيهات الجروب والمشرف.</li>
        <li>متستخدمش نفس الرقم من جهاز كمبيوتر تاني (واتساب ويب) في نفس الوقت، الجلسة هتقع.</li>
        <li>العروض بتطلع ببطء ومن أرقام العروض بس، عشان واتساب ميقفلش الرقم.</li>
      </ul>
    </div>
  );
}
