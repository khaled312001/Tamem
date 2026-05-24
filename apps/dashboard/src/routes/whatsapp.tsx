import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  Phone,
  PowerOff,
  QrCode,
  Send,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
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

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'whatsapp', 'status'],
    queryFn: () => api.adminWhatsAppStatus(),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      // Poll faster while waiting for QR scan / connecting
      return s === 'qr' || s === 'connecting' ? 2000 : 15_000;
    },
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
      ) : (
        <ConnectionCard
          data={data!}
          onStart={() => start.mutate()}
          onStop={() => stop.mutate()}
          starting={start.isPending}
          stopping={stop.isPending}
        />
      )}

      {data?.status === 'connected' && <SendTestCard />}

      <InfoCard />
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
      <Field label="رقم المستلم" hint="مع كود الدولة (مثلاً +201010254819)">
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+201XXXXXXXXX"
          dir="ltr"
          type="tel"
        />
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
