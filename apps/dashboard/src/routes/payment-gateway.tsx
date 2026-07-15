import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Save,
  TestTube2,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Field, Input } from '../components/ui/Input.js';
import { CardSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

/**
 * The EasyKash payment-options enum, with the labels we surface in the
 * dashboard checklist. Numbers come from EasyKash's docs example
 * `paymentOptions: [2,3,4,5,6]`. Admin checks the ones they want enabled.
 */
const ALL_METHODS: Array<{ value: number; label: string; note: string }> = [
  { value: 2, label: 'Visa / MasterCard (بطاقة)', note: 'الدفع المباشر بالبطاقة' },
  { value: 3, label: 'فودافون كاش', note: 'محفظة Vodafone Cash' },
  { value: 4, label: 'InstaPay', note: 'تحويل بنكي عبر InstaPay' },
  { value: 5, label: 'Meeza', note: 'بطاقة ميزة الوطنية' },
  { value: 6, label: 'Visa Premium', note: 'بطاقات Visa المتميزة' },
];

export function PaymentGatewayPage() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'gateway'],
    queryFn: () => api.adminGatewayStatus(),
  });

  const test = useMutation({
    mutationFn: () => api.adminGatewayTest(),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message ?? 'الاتصال ناجح');
      } else {
        toast.error(res.reason ?? 'فشل الاتصال');
      }
      refetch();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-brand-dark">بوابة الدفع — EasyKash</h1>
        <p className="text-sm text-muted-foreground mt-1">
          فعّل فودافون كاش، InstaPay، فيزا، ماستركارد وميزة عبر EasyKash
        </p>
      </div>

      {isLoading ? (
        <CardSkeleton />
      ) : (
        <>
          <StatusCard
            data={data!}
            onTest={() => test.mutate()}
            testing={test.isPending}
            testResult={test.data}
          />
          <EditCard
            initial={data!}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ['admin', 'gateway'] });
            }}
          />
          <SetupGuide />
        </>
      )}
    </div>
  );
}

function StatusCard({
  data,
  onTest,
  testing,
  testResult,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  onTest: () => void;
  testing: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  testResult: any;
}) {
  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-500 to-amber-500 grid place-items-center shadow-md shadow-fuchsia-300/40">
            <CreditCard className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="font-bold">حالة الاتصال بـ EasyKash</div>
            <div className="text-xs text-muted-foreground">
              المزود الوحيد للدفع الإلكتروني في تميم
            </div>
          </div>
        </div>
        <StatusPill ok={data.configured} />
      </div>

      <div className="flex justify-end pt-3 border-t border-border">
        <Button onClick={onTest} disabled={testing || !data.configured}>
          {testing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <TestTube2 className="w-4 h-4" />
          )}
          اختبار الاتصال
        </Button>
      </div>

      {testResult && (
        <div
          className={`rounded-lg p-3 text-sm border ${
            testResult.ok
              ? 'bg-green-50 text-green-800 border-green-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <div className="font-bold flex items-center gap-2">
            {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {testResult.ok ? 'الاتصال ناجح' : 'فشل الاتصال'}
          </div>
          <div className="mt-1 text-xs">
            {testResult.message ?? testResult.reason}
            {testResult.preview && (
              <a
                href={testResult.preview}
                target="_blank"
                rel="noreferrer"
                className="underline ms-2 inline-flex items-center gap-1"
                dir="ltr"
              >
                معاينة الرابط
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EditCard({
  initial,
  onSaved,
}: {
  initial: {
    paymentOptions: number[];
    keys: { apiKey: string | null; hmacSecret: string | null };
  };
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [hmacSecret, setHmacSecret] = useState('');
  const [paymentOptions, setPaymentOptions] = useState<number[]>(initial.paymentOptions ?? []);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    setPaymentOptions(initial.paymentOptions ?? []);
  }, [initial.paymentOptions]);

  const toggleMethod = (value: number) => {
    setPaymentOptions((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value].sort((a, b) => a - b),
    );
  };

  const save = useMutation({
    mutationFn: () => {
      const body: { apiKey?: string; hmacSecret?: string; paymentOptions?: number[] } = {};
      if (apiKey) body.apiKey = apiKey;
      if (hmacSecret) body.hmacSecret = hmacSecret;
      // Always send paymentOptions so toggling a method off persists.
      body.paymentOptions = paymentOptions;
      return api.adminGatewaySave(body);
    },
    onSuccess: () => {
      toast.success('تم الحفظ ✓');
      setApiKey('');
      setHmacSecret('');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'فشل الحفظ'),
  });

  const apiKeyHas = !!initial.keys.apiKey;
  const hmacHas = !!initial.keys.hmacSecret;

  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold">إدخال بيانات EasyKash</div>
          <div className="text-xs text-muted-foreground mt-1">
            تتخزن في قاعدة البيانات وتسري فوراً بدون إعادة تشغيل
          </div>
        </div>
        <button
          onClick={() => setShowSecrets((s) => !s)}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          {showSecrets ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showSecrets ? 'إخفاء' : 'إظهار'} الأسرار
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field
          label="API Key"
          hint={apiKeyHas ? `محفوظ: ${initial.keys.apiKey}` : 'من EasyKash → Integration Settings'}
        >
          <Input
            type={showSecrets ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={apiKeyHas ? '— اتركه فارغ للإبقاء —' : '1si4c9...'}
            dir="ltr"
          />
        </Field>
        <Field
          label="HMAC Secret"
          hint={
            hmacHas
              ? `محفوظ: ${initial.keys.hmacSecret}`
              : 'يظهر بعد اختيار طرق الدفع وحفظها في EasyKash'
          }
        >
          <Input
            type={showSecrets ? 'text' : 'password'}
            value={hmacSecret}
            onChange={(e) => setHmacSecret(e.target.value)}
            placeholder={hmacHas ? '— اتركه فارغ للإبقاء —' : '••••••••••'}
            dir="ltr"
          />
        </Field>
      </div>

      <div>
        <div className="font-bold text-sm mb-2">طرق الدفع المُفعّلة</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {ALL_METHODS.map((m) => {
            const on = paymentOptions.includes(m.value);
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => toggleMethod(m.value)}
                className={`flex items-start gap-3 p-3 rounded-lg border text-start ${
                  on ? 'border-green-300 bg-green-50' : 'border-border bg-gray-50/50'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded border grid place-items-center mt-0.5 ${
                    on ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-border'
                  }`}
                >
                  {on && <CheckCircle2 className="w-3 h-3" />}
                </div>
                <div>
                  <div className="font-bold text-sm">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{m.note}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end pt-3 border-t border-border">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || (!apiKey && !hmacSecret && paymentOptions.length === 0)}
        >
          {save.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          حفظ البيانات
        </Button>
      </div>
    </div>
  );
}

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border ${
        ok
          ? 'bg-green-100 text-green-700 border-green-200'
          : 'bg-gray-100 text-gray-700 border-gray-200'
      }`}
    >
      {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {ok ? 'مفعّل' : 'غير مفعّل'}
    </span>
  );
}

function SetupGuide() {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 space-y-3 text-sm">
      <div className="font-bold text-blue-900">خطوات تفعيل EasyKash</div>
      <ol className="list-decimal list-inside space-y-1.5 text-blue-800">
        <li>
          ادخل على{' '}
          <a
            href="https://back.easykash.net"
            target="_blank"
            rel="noreferrer"
            className="underline inline-flex items-center gap-1"
          >
            back.easykash.net <ExternalLink className="w-3 h-3" />
          </a>{' '}
          واتبع الـ{' '}
          <a
            href="https://easykash.gitbook.io/easykash-apis-documentation"
            target="_blank"
            rel="noreferrer"
            className="underline inline-flex items-center gap-1"
          >
            Documentation <ExternalLink className="w-3 h-3" />
          </a>
          .
        </li>
        <li>
          من <strong>Integration Settings</strong> انسخ الـ <strong>API Key</strong> والصقه أعلاه.
        </li>
        <li>
          في خانة <strong>Callback URL</strong> في EasyKash، أدخل:
          <code className="font-mono text-xs ms-1 bg-blue-100 px-1 rounded" dir="ltr">
            https://api.deliverytamem.com/api/v1/payments/webhook/easykash
          </code>
        </li>
        <li>اختر طرق الدفع المطلوبة (Visa / فودافون كاش / InstaPay / Meeza) واضغط حفظ.</li>
        <li>
          بعد الحفظ سيظهر <strong>HMAC Secret Key</strong> — انسخه والصقه أعلاه.
        </li>
        <li>
          أجب على أسئلة الـ <em>fees</em> والـ <em>VAT</em> حسب الاتفاق مع العميل (تضاف على العميل
          أو على المشتري).
        </li>
        <li>اضغط Submit في EasyKash ثم اضغط "اختبار الاتصال" أعلى الصفحة للتأكد.</li>
      </ol>
    </div>
  );
}
