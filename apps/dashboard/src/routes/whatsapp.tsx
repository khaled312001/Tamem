import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  Phone,
  PowerOff,
  QrCode,
  RefreshCw,
  Save,
  Send,
  Users,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Field, Textarea } from '../components/ui/Input.js';
import { PhoneInput } from '../components/ui/PhoneInput.js';
import { api } from '../lib/api.js';
import { connectSocket } from '../lib/socket.js';

type Status = 'disconnected' | 'qr' | 'connecting' | 'connected';

interface WAStatus {
  status: Status;
  qrDataUrl: string | null;
  phone: string | null;
  startedAt: number | null;
  lastError: string | null;
}

export function WhatsAppPage() {
  const qc = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'whatsapp', 'status'],
    queryFn: () => api.adminWhatsAppStatus(),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      // Poll faster while waiting for QR scan / connecting
      return s === 'qr' || s === 'connecting' ? 2000 : 15_000;
    },
    retry: 1,
  });

  // Live updates via socket
  useEffect(() => {
    const socket = connectSocket();
    const onStatus = (payload: WAStatus) => {
      qc.setQueryData(['admin', 'whatsapp', 'status'], payload);
    };
    socket.on('whatsapp:status', onStatus);
    return () => {
      socket.off('whatsapp:status', onStatus);
    };
  }, [qc]);

  const start = useMutation({
    mutationFn: () => api.adminWhatsAppStart(),
    onSuccess: () => {
      toast.success('جاري تشغيل الجلسة...');
      refetch();
    },
    onError: (err: Error) => toast.error(err.message || 'فشل بدء الجلسة'),
  });

  const stop = useMutation({
    mutationFn: () => api.adminWhatsAppStop(),
    onSuccess: () => {
      toast('تم إنهاء جلسة واتساب');
      refetch();
    },
  });

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-brand-dark">ربط واتساب</h1>
        <p className="text-sm text-muted-foreground mt-1">
          اربط حساب واتساب الإدارة لإرسال إشعارات الطلبات للعملاء تلقائياً
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
          <div className="text-sm text-muted-foreground">
            {(error as Error)?.message || 'تأكد أن خدمة الـ Backend شغّالة على المنفذ 4000'}
          </div>
          <Button onClick={() => refetch()}>إعادة المحاولة</Button>
        </div>
      ) : (
        <ConnectionCard
          data={data}
          onStart={() => start.mutate()}
          onStop={() => stop.mutate()}
          starting={start.isPending}
          stopping={stop.isPending}
        />
      )}

      {data?.status === 'connected' && <OrderGroupCard />}
      {data?.status === 'connected' && <SendTestCard />}

      <InfoCard />
    </div>
  );
}

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
            اختَر جروباً من جروباتك، وأول ما يوصل طلب جديد للوحة التحكم هيتبعت له رسالة تلقائياً.
          </p>
        </div>
      </div>

      {/* Enable toggle */}
      <label className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer">
        <div>
          <div className="font-bold text-sm">تفعيل التنبيه</div>
          <div className="text-xs text-muted-foreground">
            {enabled ? 'مفعّل — الطلبات الجديدة تُرسل للجروب' : 'موقوف'}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? 'bg-green-500' : 'bg-zinc-300'
          }`}
        >
          <span
            className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white shadow transition-[inset-inline-start] ${
              enabled ? 'start-[22px]' : 'start-0.5'
            }`}
          />
        </button>
      </label>

      {/* Group picker */}
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
            مفيش جروبات ظهرت لسه. اتأكد إن الرقم المربوط عضو في الجروب، وبعدين اضغط «تحديث القائمة».
          </p>
        ) : (
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-popover text-sm"
          >
            <option value="">— اختر جروباً —</option>
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
        {invalid && <span className="text-xs text-destructive">اختر جروباً أولاً.</span>}
      </div>
    </div>
  );
}

function ConnectionCard({
  data,
  onStart,
  onStop,
  starting,
  stopping,
}: {
  data: WAStatus;
  onStart: () => void;
  onStop: () => void;
  starting: boolean;
  stopping: boolean;
}) {
  const tone =
    data.status === 'connected'
      ? { color: 'bg-green-100 text-green-700 border-green-200', Icon: CheckCircle2, label: 'متصل' }
      : data.status === 'qr'
        ? {
            color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
            Icon: QrCode,
            label: 'بانتظار المسح',
          }
        : data.status === 'connecting'
          ? {
              color: 'bg-blue-100 text-blue-700 border-blue-200',
              Icon: Loader2,
              label: 'جاري الاتصال',
            }
          : {
              color: 'bg-gray-100 text-gray-700 border-gray-200',
              Icon: XCircle,
              label: 'غير متصل',
            };

  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-green-50 grid place-items-center">
            <MessageCircle className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <div className="font-bold">حالة الاتصال</div>
            <div className="text-xs text-muted-foreground">WhatsApp Web (جلسة الإدارة)</div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold border ${tone.color}`}
        >
          <tone.Icon className={`w-4 h-4 ${data.status === 'connecting' ? 'animate-spin' : ''}`} />
          {tone.label}
        </span>
      </div>

      {data.status === 'connected' && data.phone && (
        <div className="flex items-center gap-2 text-sm bg-green-50 text-green-800 rounded-lg p-3">
          <Phone className="w-4 h-4" />
          <span className="font-mono" dir="ltr">
            +{data.phone}
          </span>
          <span className="text-xs text-green-600">— الرقم المربوط حالياً</span>
        </div>
      )}

      {data.status === 'qr' && data.qrDataUrl && (
        <div className="flex flex-col items-center bg-muted/30 rounded-lg p-6 gap-3">
          <div className="text-sm font-bold">امسح الكود من تطبيق واتساب على هاتفك</div>
          <div className="text-xs text-muted-foreground text-center max-w-md">
            افتح واتساب على الهاتف ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز ← امسح الكود
          </div>
          <img
            src={data.qrDataUrl}
            alt="WhatsApp QR"
            className="w-72 h-72 bg-white p-3 rounded-lg shadow"
          />
        </div>
      )}

      {data.status === 'connecting' && (
        <div className="flex items-center justify-center gap-3 p-6 bg-blue-50 text-blue-700 rounded-lg">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">جاري تشغيل جلسة واتساب — هياخد ٢٠-٤٠ ثانية...</span>
        </div>
      )}

      {data.lastError && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
          <div className="font-bold mb-1">آخر خطأ:</div>
          <div>{data.lastError}</div>
          <div className="text-xs mt-2 text-muted-foreground">
            لو الخطأ &quot;لا يوجد متصفح&quot; ثبّت Google Chrome على السيرفر أو حدد متغير البيئة{' '}
            <code>WPP_CHROME_PATH</code> على مسار Chrome.
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-border">
        {data.status === 'connected' || data.status === 'qr' || data.status === 'connecting' ? (
          <Button variant="danger" onClick={onStop} disabled={stopping}>
            <PowerOff className="w-4 h-4" /> إنهاء الجلسة
          </Button>
        ) : (
          <Button onClick={onStart} disabled={starting}>
            {starting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <QrCode className="w-4 h-4" />
            )}
            بدء جلسة جديدة
          </Button>
        )}
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
      else toast.error('فشل الإرسال — تأكد من رقم العميل');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-brand-red/10 grid place-items-center">
          <Send className="w-5 h-5 text-brand-red" />
        </div>
        <div className="font-bold">إرسال رسالة تجريبية</div>
      </div>
      <Field label="رقم المستلم" hint="اكتب الرقم بدون كود الدولة — مثال: 01010254819">
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
      <div className="font-bold text-blue-900">ملاحظات هامة</div>
      <ul className="list-disc list-inside text-blue-800 space-y-1">
        <li>
          الجلسة بتفضل شغّالة طول ما السيرفر شغّال — لو رجعت أنت أو السيرفر اتعمله ريستارت، الجلسة
          بتلوّد من الكاش بدون مسح QR ثاني.
        </li>
        <li>
          الإشعارات التلقائية بتروح للعميل لما الطلب يتسعّر، يتعيّن سائق، يتسلّم، يبدأ في الطريق، أو
          يكتمل/يتلغي.
        </li>
        <li>الحساب لازم يكون شغّال على واتساب Web من تطبيقك (نفس الـ flow الطبيعي).</li>
        <li>تجنب استخدام نفس الرقم من جهاز تاني في نفس الوقت — هينقطع الاتصال.</li>
      </ul>
    </div>
  );
}
