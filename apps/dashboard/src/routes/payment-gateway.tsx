import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Save,
  Smartphone,
  TestTube2,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Field, Input } from '../components/ui/Input.js';
import { CardSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

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
        <h1 className="text-2xl font-black text-brand-dark">بوابة الدفع</h1>
        <p className="text-sm text-muted-foreground mt-1">
          فعّل فودافون كاش وإنستاباي عن طريق ربط حساب Paymob الخاص بشركتك
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
            initial={data!.keys}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ['admin', 'gateway'] });
            }}
          />
          <MethodsCard methods={data!.methods} />
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
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 grid place-items-center shadow-md shadow-purple-300/40">
            <CreditCard className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="font-bold">حالة الاتصال بـ Paymob</div>
            <div className="text-xs text-muted-foreground">
              المزود الفعلي لفودافون كاش وإنستاباي في مصر
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
            {testResult.tokenPreview && (
              <span className="font-mono ms-2" dir="ltr">
                token: {testResult.tokenPreview}
              </span>
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
    apiKey: string | null;
    walletIntegrationId: number | null;
    instapayIntegrationId: number | null;
    iframeId: number | null;
    hmac: string | null;
  };
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [wallet, setWallet] = useState('');
  const [insta, setInsta] = useState('');
  const [iframe, setIframe] = useState('');
  const [hmac, setHmac] = useState('');
  const [showSecrets, setShowSecrets] = useState(false);

  // Prefill the integer fields from the current stored values
  // (sensitive secrets remain blank — user re-types only to change them).
  useEffect(() => {
    if (initial.walletIntegrationId != null) setWallet(String(initial.walletIntegrationId));
    if (initial.instapayIntegrationId != null) setInsta(String(initial.instapayIntegrationId));
    if (initial.iframeId != null) setIframe(String(initial.iframeId));
  }, [initial]);

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, string | number> = {};
      if (apiKey) body.apiKey = apiKey;
      if (wallet) body.walletIntegrationId = wallet;
      if (insta) body.instapayIntegrationId = insta;
      if (iframe) body.iframeId = iframe;
      if (hmac) body.hmac = hmac;
      return api.adminGatewaySave(body);
    },
    onSuccess: () => {
      toast.success('تم الحفظ بنجاح ✓');
      setApiKey('');
      setHmac('');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'فشل الحفظ'),
  });

  const apiKeyHas = !!initial.apiKey;
  const hmacHas = !!initial.hmac;

  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold">إدخال بيانات Paymob</div>
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
          hint={
            apiKeyHas ? `محفوظ: ${initial.apiKey}` : 'انسخه من Paymob → Settings → Account Info'
          }
        >
          <Input
            type={showSecrets ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={apiKeyHas ? '— اتركه فارغ للإبقاء —' : 'ZXlKaGJHY2lPaUpJ...'}
            dir="ltr"
          />
        </Field>
        <Field label="HMAC Secret" hint={hmacHas ? `محفوظ: ${initial.hmac}` : 'لتأكيد webhooks'}>
          <Input
            type={showSecrets ? 'text' : 'password'}
            value={hmac}
            onChange={(e) => setHmac(e.target.value)}
            placeholder={hmacHas ? '— اتركه فارغ للإبقاء —' : '••••••••••'}
            dir="ltr"
          />
        </Field>
        <Field label="Wallet Integration ID" hint="فودافون كاش / أورنج / إيتيسالات">
          <Input
            type="number"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="123456"
            dir="ltr"
          />
        </Field>
        <Field label="InstaPay Integration ID" hint="من Paymob → Integrations">
          <Input
            type="number"
            value={insta}
            onChange={(e) => setInsta(e.target.value)}
            placeholder="123456"
            dir="ltr"
          />
        </Field>
        <Field label="Iframe ID (لـ InstaPay)" hint="من Paymob → Iframes">
          <Input
            type="number"
            value={iframe}
            onChange={(e) => setIframe(e.target.value)}
            placeholder="999999"
            dir="ltr"
          />
        </Field>
      </div>

      <div className="flex justify-end pt-3 border-t border-border">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || (!apiKey && !wallet && !insta && !iframe && !hmac)}
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

function MethodsCard({ methods }: { methods: { vodafoneCash: boolean; instapay: boolean } }) {
  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <div className="font-bold mb-3">طرق الدفع المتاحة للعميل</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MethodTile label="كاش عند الاستلام" enabled icon="💵" hint="دايماً متاح" />
        <MethodTile
          label="فودافون كاش"
          enabled={methods.vodafoneCash}
          icon={<Smartphone className="w-5 h-5" />}
          hint={methods.vodafoneCash ? 'مفعّل' : 'محتاج Wallet Integration ID'}
        />
        <MethodTile
          label="InstaPay"
          enabled={methods.instapay}
          icon={<Smartphone className="w-5 h-5" />}
          hint={methods.instapay ? 'مفعّل' : 'محتاج InstaPay Integration ID'}
        />
      </div>
    </div>
  );
}

function MethodTile({
  label,
  enabled,
  icon,
  hint,
}: {
  label: string;
  enabled: boolean;
  icon: React.ReactNode;
  hint: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        enabled ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50/50'
      }`}
    >
      <div className="flex items-center gap-2 font-bold">
        <span className={enabled ? 'text-green-700' : 'text-gray-500'}>{icon}</span>
        <span className={enabled ? 'text-green-800' : 'text-gray-700'}>{label}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </div>
  );
}

function SetupGuide() {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 space-y-3 text-sm">
      <div className="font-bold text-blue-900">إزاي أربط Paymob؟</div>
      <ol className="list-decimal list-inside space-y-1.5 text-blue-800">
        <li>
          سجّل حساب على{' '}
          <a
            href="https://accept.paymob.com/portal2/en/login"
            target="_blank"
            rel="noreferrer"
            className="underline inline-flex items-center gap-1"
          >
            accept.paymob.com <ExternalLink className="w-3 h-3" />
          </a>{' '}
          ورفع السجل التجاري (تستغرق المراجعة 1-3 أيام).
        </li>
        <li>
          من لوحة Paymob، روح <strong>Developers ← API Keys</strong> وانسخ الـ API Key.
        </li>
        <li>
          من <strong>Integrations</strong>، فعّل <strong>Mobile Wallets</strong> (لفودافون كاش) و{' '}
          <strong>InstaPay</strong>، وكل واحد منهم هيدّيك Integration ID.
        </li>
        <li>
          من <strong>Settings ← HMAC</strong>، انسخ الـ HMAC Secret (لازم لتأكيد webhooks).
        </li>
        <li>
          ضع كل القيم دي في ملف <code className="font-mono text-xs">apps/backend/.env</code>:
          <pre
            className="bg-blue-100 text-blue-900 p-2 mt-1 rounded text-xs overflow-x-auto"
            dir="ltr"
          >{`PAYMOB_API_KEY=<your-key>
PAYMOB_WALLET_INTEGRATION_ID=<id-from-wallet-integration>
PAYMOB_INSTAPAY_INTEGRATION_ID=<id-from-instapay-integration>
PAYMOB_HMAC=<your-hmac-secret>`}</pre>
        </li>
        <li>
          أعد تشغيل الخادم (
          <code className="font-mono text-xs">pnpm --filter @tamem/backend dev</code>) ثم اضغط{' '}
          <strong>اختبار الاتصال</strong> أعلى الصفحة.
        </li>
        <li>
          الفلوس بتروح للحساب البنكي اللى ربطته في Paymob، التحويل خلال 1-2 يوم عمل، Paymob بتاخد
          عمولة تقريباً 2.5-3%.
        </li>
      </ol>
    </div>
  );
}
