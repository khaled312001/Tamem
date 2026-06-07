/**
 * Merchant product-API integration page.
 *
 * URL: /merchants/:id/products-api
 *
 * Sections:
 *   1. Connection form (URL, method, auth, headers, body, products path)
 *   2. Test connection → shows sample items + leaf fields
 *   3. Field mapping (source field → app field)
 *   4. Sync settings (interval, missing-policy)
 *   5. Sync history (50 most recent runs)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  Loader2,
  PlayCircle,
  RefreshCcw,
  Save,
  TestTube2,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { api } from '../lib/api.js';

type Method = 'GET' | 'POST';
type AuthType = 'NONE' | 'API_KEY' | 'BEARER' | 'BASIC';
type Interval = 'DISABLED' | 'EVERY_15_MIN' | 'EVERY_30_MIN' | 'HOURLY' | 'DAILY';
type MissingPolicy = 'IGNORE' | 'MARK_UNAVAILABLE' | 'HIDE' | 'DELETE';

interface ApiConfig {
  apiUrl: string;
  method: Method;
  authType: AuthType;
  authHeaderName: string | null;
  hasToken: boolean;
  tokenMasked: string;
  extraHeaders: Record<string, string> | null;
  requestBody: Record<string, unknown> | null;
  productsPath: string | null;
  fieldMapping: Record<string, string> | null;
  syncInterval: Interval;
  missingPolicy: MissingPolicy;
  isActive: boolean;
  isConnected: boolean;
  lastError: string | null;
  lastSyncedAt: string | null;
}

interface TestResult {
  ok: boolean;
  fetchedCount: number;
  error?: string;
  sampleItems?: unknown[];
  sampleFields?: string[];
}

interface SyncLog {
  id: string;
  trigger: 'MANUAL' | 'AUTO' | 'WEBHOOK';
  status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
  startedAt: string;
  finishedAt: string | null;
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  hiddenCount: number;
  errorMessage: string | null;
}

const APP_FIELDS = [
  { key: 'nameAr', label: 'اسم المنتج (عربي)' },
  { key: 'name', label: 'اسم المنتج (إنجليزي)' },
  { key: 'description', label: 'الوصف' },
  { key: 'price', label: 'السعر' },
  { key: 'salePrice', label: 'سعر الخصم' },
  { key: 'imageUrl', label: 'صورة المنتج' },
  { key: 'imageUrls', label: 'صور إضافية' },
  { key: 'categoryName', label: 'التصنيف' },
  { key: 'stock', label: 'الكمية' },
  { key: 'isAvailable', label: 'حالة التوفر' },
  { key: 'sku', label: 'SKU' },
  { key: 'externalId', label: 'External ID' },
  { key: 'barcode', label: 'الباركود' },
  { key: 'weight', label: 'الوزن' },
] as const;

const INTERVAL_LABELS: Record<Interval, string> = {
  DISABLED: 'إيقاف',
  EVERY_15_MIN: 'كل 15 دقيقة',
  EVERY_30_MIN: 'كل 30 دقيقة',
  HOURLY: 'كل ساعة',
  DAILY: 'مرة يومياً',
};

const POLICY_LABELS: Record<MissingPolicy, string> = {
  IGNORE: 'تجاهل (إبقاء المنتجات كما هي)',
  MARK_UNAVAILABLE: 'جعلها غير متاحة',
  HIDE: 'إخفاؤها من التطبيق',
  DELETE: 'حذف نهائي',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ar-EG');
  } catch {
    return iso;
  }
}

export function MerchantProductsApiPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const merchantId = id!;

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['admin', 'merchant-api', merchantId],
    queryFn: () => api.adminMerchantApiConfig(merchantId) as Promise<ApiConfig | null>,
  });

  const { data: logs } = useQuery({
    queryKey: ['admin', 'merchant-api', merchantId, 'logs'],
    queryFn: () => api.adminMerchantSyncLogs(merchantId) as Promise<SyncLog[]>,
  });

  // Local form state
  const [apiUrl, setApiUrl] = useState('');
  const [method, setMethod] = useState<Method>('GET');
  const [authType, setAuthType] = useState<AuthType>('NONE');
  const [authHeaderName, setAuthHeaderName] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [productsPath, setProductsPath] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [syncInterval, setSyncInterval] = useState<Interval>('DISABLED');
  const [missingPolicy, setMissingPolicy] = useState<MissingPolicy>('MARK_UNAVAILABLE');
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [test, setTest] = useState<TestResult | null>(null);

  // Hydrate form when config loads
  useEffect(() => {
    if (!cfg) return;
    setApiUrl(cfg.apiUrl);
    setMethod(cfg.method);
    setAuthType(cfg.authType);
    setAuthHeaderName(cfg.authHeaderName ?? '');
    setProductsPath(cfg.productsPath ?? '');
    setHeadersText(cfg.extraHeaders ? JSON.stringify(cfg.extraHeaders, null, 2) : '');
    setBodyText(cfg.requestBody ? JSON.stringify(cfg.requestBody, null, 2) : '');
    setSyncInterval(cfg.syncInterval);
    setMissingPolicy(cfg.missingPolicy);
    setFieldMapping(cfg.fieldMapping ?? {});
  }, [cfg]);

  /** Parse JSON text without crashing — returns undefined on parse error. */
  const parseJsonField = (
    raw: string,
    name: string,
  ): { ok: boolean; value: Record<string, unknown> | null } => {
    if (!raw.trim()) return { ok: true, value: null };
    try {
      const v = JSON.parse(raw);
      if (typeof v !== 'object' || v == null || Array.isArray(v)) {
        toast.error(`${name} لازم يكون JSON object`);
        return { ok: false, value: null };
      }
      return { ok: true, value: v as Record<string, unknown> };
    } catch {
      toast.error(`${name} ليس JSON صحيح`);
      return { ok: false, value: null };
    }
  };

  const buildPayload = (overrides: Partial<{ token: string | null }> = {}) => {
    const headers = parseJsonField(headersText, 'الهيدرز');
    if (!headers.ok) return null;
    const body = parseJsonField(bodyText, 'الـ Body');
    if (!body.ok) return null;
    return {
      apiUrl: apiUrl.trim(),
      method,
      authType,
      authHeaderName: authHeaderName.trim() || null,
      // null = keep existing; "" = clear; non-empty = update
      token: overrides.token !== undefined ? overrides.token : token === '' ? null : token,
      extraHeaders: headers.value as Record<string, string> | null,
      requestBody: body.value,
      productsPath: productsPath.trim() || null,
      fieldMapping,
      syncInterval,
      missingPolicy,
      isActive: true,
    };
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = buildPayload();
      if (!payload) throw new Error('بيانات غير صحيحة');
      return api.adminSaveMerchantApiConfig(merchantId, payload);
    },
    onSuccess: () => {
      toast.success('تم حفظ إعدادات API');
      setToken(''); // clear so the field doesn't keep the plaintext after save
      qc.invalidateQueries({ queryKey: ['admin', 'merchant-api', merchantId] });
    },
    onError: (err: Error) => toast.error(err.message || 'فشل الحفظ'),
  });

  const testMut = useMutation({
    mutationFn: async () => {
      // Save first if there are unsaved changes — otherwise the test fires
      // against the old config and the result misleads.
      const payload = buildPayload();
      if (!payload) throw new Error('بيانات غير صحيحة');
      await api.adminSaveMerchantApiConfig(merchantId, payload);
      const res = (await api.adminTestMerchantApi(merchantId)) as TestResult;
      setTest(res);
      return res;
    },
    onSuccess: (res: TestResult) => {
      if (res.ok) toast.success(`✓ الاتصال ناجح — ${res.fetchedCount} منتج`);
      else toast.error(`✕ فشل الاتصال — ${res.error ?? 'خطأ غير معروف'}`);
      qc.invalidateQueries({ queryKey: ['admin', 'merchant-api', merchantId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const syncMut = useMutation({
    mutationFn: () => api.adminSyncMerchantProducts(merchantId),
    onSuccess: (res: unknown) => {
      const r = res as {
        ok: boolean;
        createdCount: number;
        updatedCount: number;
        failedCount: number;
      };
      if (r.ok) {
        toast.success(
          `✓ تمت المزامنة — ${r.createdCount} جديد + ${r.updatedCount} محدّث${
            r.failedCount > 0 ? ` (${r.failedCount} فشل)` : ''
          }`,
        );
      } else {
        toast.error('فشلت المزامنة');
      }
      qc.invalidateQueries({ queryKey: ['admin', 'merchant-api', merchantId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <div className="p-6 text-center">جاري التحميل...</div>;
  }

  const status = cfg?.isConnected
    ? { label: 'متصل', color: 'bg-green-100 text-green-700' }
    : cfg?.lastError
      ? { label: 'فشل الاتصال', color: 'bg-red-100 text-red-700' }
      : { label: 'لم يتم الربط بعد', color: 'bg-gray-100 text-gray-600' };

  return (
    <div className="space-y-4 max-w-5xl">
      <button
        onClick={() => navigate('/merchants')}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-red"
      >
        <ArrowRight className="w-4 h-4" />
        العودة لقائمة التجار
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-brand-dark inline-flex items-center gap-2">
            <Database className="w-6 h-6" />
            ربط منتجات التاجر عبر API
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            اربط API خارجي لسحب المنتجات تلقائياً. إذا لم يكن لديك API، أضف المنتجات يدوياً من قسم
            المنتجات.
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${status.color}`}>
          {status.label}
        </span>
      </div>

      {/* ── Connection details ─────────────────────────────── */}
      <Section title="بيانات الربط">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Field label="رابط API" required>
              <Input
                type="url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://example.com/api/products"
                dir="ltr"
              />
            </Field>
          </div>
          <div>
            <Field label="نوع الطلب">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Field label="نوع المصادقة">
              <select
                value={authType}
                onChange={(e) => setAuthType(e.target.value as AuthType)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
              >
                <option value="NONE">بدون</option>
                <option value="API_KEY">API Key</option>
                <option value="BEARER">Bearer Token</option>
                <option value="BASIC">Basic Auth</option>
              </select>
            </Field>
          </div>

          {authType === 'API_KEY' && (
            <div>
              <Field label="اسم هيدر المفتاح">
                <Input
                  value={authHeaderName}
                  onChange={(e) => setAuthHeaderName(e.target.value)}
                  placeholder="X-API-Key"
                  dir="ltr"
                />
              </Field>
            </div>
          )}

          {authType !== 'NONE' && (
            <div className="md:col-span-1">
              <Field
                label={authType === 'BASIC' ? 'username:password' : 'قيمة Token / API Key'}
                hint={
                  cfg?.hasToken
                    ? `محفوظ: ${cfg.tokenMasked} — اتركها فاضية للإبقاء، أو اكتب قيمة جديدة`
                    : undefined
                }
              >
                <div className="relative">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={cfg?.hasToken ? '••••••••' : 'أدخل القيمة'}
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((s) => !s)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>
            </div>
          )}
        </div>

        <Field
          label="مسار المنتجات داخل الاستجابة"
          hint='مثل "products" أو "data" أو "result.products". اتركه فارغ لو الرد قائمة مباشرة.'
        >
          <Input
            value={productsPath}
            onChange={(e) => setProductsPath(e.target.value)}
            placeholder="products"
            dir="ltr"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="هيدرز إضافية (JSON)" hint='مثل: {"Accept": "application/json"}'>
            <Textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              rows={3}
              placeholder="{}"
              dir="ltr"
            />
          </Field>
          {method === 'POST' && (
            <Field label="Body (JSON)" hint="يُرسل مع POST فقط">
              <Textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={3}
                placeholder="{}"
                dir="ltr"
              />
            </Field>
          )}
        </div>

        {cfg?.lastError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded p-2 text-sm">
            ⚠ آخر خطأ: {cfg.lastError}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} size="md">
            {saveMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            حفظ الإعدادات
          </Button>
          <Button
            variant="outline"
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending}
            size="md"
          >
            {testMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <TestTube2 className="w-4 h-4" />
            )}
            اختبار الاتصال
          </Button>
        </div>
      </Section>

      {/* ── Test result ──────────────────────────────────── */}
      {test && (
        <Section title="نتيجة اختبار الاتصال">
          {test.ok ? (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 text-green-800 rounded p-3 inline-flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                نجح الاتصال — تم العثور على <strong className="mx-1">
                  {test.fetchedCount}
                </strong>{' '}
                منتج
              </div>

              {test.sampleItems && test.sampleItems.length > 0 && (
                <div>
                  <div className="text-sm font-bold mb-2">عينة من المنتجات (أول 3):</div>
                  <pre
                    className="bg-muted/50 rounded p-3 text-xs overflow-x-auto max-h-64"
                    dir="ltr"
                  >
                    {JSON.stringify(test.sampleItems, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 inline-flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              فشل: {test.error ?? 'خطأ غير معروف'}
            </div>
          )}
        </Section>
      )}

      {/* ── Field mapping ─────────────────────────────────── */}
      {test?.ok && test.sampleFields && test.sampleFields.length > 0 && (
        <Section
          title="مطابقة الحقول"
          hint="حدد أي حقل من API يقابل كل حقل داخل التطبيق. النظام يحفظ المطابقة مع كل عملية حفظ."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {APP_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center gap-2">
                <label className="text-sm font-bold w-32 shrink-0">{f.label}</label>
                <span className="text-muted-foreground">←</span>
                <select
                  value={fieldMapping[f.key] ?? ''}
                  onChange={(e) =>
                    setFieldMapping((prev) => {
                      const next = { ...prev };
                      if (e.target.value) next[f.key] = e.target.value;
                      else delete next[f.key];
                      return next;
                    })
                  }
                  className="flex-1 px-2 py-1 rounded border border-input text-sm bg-white"
                >
                  <option value="">— تجاهل —</option>
                  {(test.sampleFields ?? []).map((sf) => (
                    <option key={sf} value={sf}>
                      {sf}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            ⓘ الحقول الإلزامية: اسم المنتج (عربي) + السعر. الباقي اختياري.
          </p>
        </Section>
      )}

      {/* ── Sync settings ─────────────────────────────────── */}
      <Section title="المزامنة">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="المزامنة التلقائية">
            <select
              value={syncInterval}
              onChange={(e) => setSyncInterval(e.target.value as Interval)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
            >
              {(Object.keys(INTERVAL_LABELS) as Interval[]).map((i) => (
                <option key={i} value={i}>
                  {INTERVAL_LABELS[i]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="المنتجات المحذوفة من API">
            <select
              value={missingPolicy}
              onChange={(e) => setMissingPolicy(e.target.value as MissingPolicy)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
            >
              {(Object.keys(POLICY_LABELS) as MissingPolicy[]).map((p) => (
                <option key={p} value={p}>
                  {POLICY_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="bg-muted/30 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-muted-foreground">
            آخر مزامنة:{' '}
            <strong className="text-foreground">{fmtDate(cfg?.lastSyncedAt ?? null)}</strong>
          </div>
          <Button onClick={() => syncMut.mutate()} disabled={syncMut.isPending || !cfg} size="md">
            {syncMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4" />
            )}
            جلب المنتجات الآن
          </Button>
        </div>
      </Section>

      {/* ── Sync logs ─────────────────────────────────────── */}
      <Section
        title="سجل المزامنة"
        rightSlot={
          <button
            onClick={() =>
              qc.invalidateQueries({
                queryKey: ['admin', 'merchant-api', merchantId, 'logs'],
              })
            }
            className="inline-flex items-center gap-1 text-xs text-brand-red hover:underline"
          >
            <RefreshCcw className="w-3 h-3" />
            تحديث
          </button>
        }
      >
        {!logs || logs.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-3">
            لا يوجد سجل مزامنة بعد
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-right">
                  <th className="px-3 py-2 font-bold">الوقت</th>
                  <th className="px-3 py-2 font-bold">النوع</th>
                  <th className="px-3 py-2 font-bold">الحالة</th>
                  <th className="px-3 py-2 font-bold">المدة</th>
                  <th className="px-3 py-2 font-bold">جلب</th>
                  <th className="px-3 py-2 font-bold">جديد</th>
                  <th className="px-3 py-2 font-bold">محدّث</th>
                  <th className="px-3 py-2 font-bold">فشل</th>
                  <th className="px-3 py-2 font-bold">مخفي</th>
                  <th className="px-3 py-2 font-bold">الخطأ</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const dur = l.finishedAt
                    ? Math.round(
                        (new Date(l.finishedAt).getTime() - new Date(l.startedAt).getTime()) / 1000,
                      )
                    : null;
                  return (
                    <tr key={l.id} className="border-b border-border/40">
                      <td className="px-3 py-2 text-xs">{fmtDate(l.startedAt)}</td>
                      <td className="px-3 py-2 text-xs">
                        {l.trigger === 'MANUAL'
                          ? 'يدوي'
                          : l.trigger === 'AUTO'
                            ? 'تلقائي'
                            : 'Webhook'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                            l.status === 'SUCCESS'
                              ? 'bg-green-100 text-green-700'
                              : l.status === 'PARTIAL'
                                ? 'bg-amber-100 text-amber-700'
                                : l.status === 'FAILED'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {l.status === 'SUCCESS'
                            ? 'نجاح'
                            : l.status === 'PARTIAL'
                              ? 'جزئي'
                              : l.status === 'FAILED'
                                ? 'فشل'
                                : 'جارٍ'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">{dur != null ? `${dur} ث` : '—'}</td>
                      <td className="px-3 py-2">{l.fetchedCount}</td>
                      <td className="px-3 py-2 text-green-700 font-bold">{l.createdCount}</td>
                      <td className="px-3 py-2 text-blue-700">{l.updatedCount}</td>
                      <td className="px-3 py-2 text-red-700">{l.failedCount}</td>
                      <td className="px-3 py-2 text-muted-foreground">{l.hiddenCount}</td>
                      <td
                        className="px-3 py-2 text-xs text-red-700 max-w-[200px] truncate"
                        title={l.errorMessage ?? ''}
                      >
                        {l.errorMessage ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Danger zone */}
      {cfg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-bold text-red-700 mb-2">منطقة الخطر</h3>
          <p className="text-sm text-muted-foreground mb-2">
            حذف الربط يوقف المزامنة. المنتجات اللي تم جلبها هتفضل في DB.
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (!confirm('متأكد من حذف الربط؟')) return;
              api
                .adminDeleteMerchantApiConfig(merchantId)
                .then(() => {
                  toast.success('تم حذف الربط');
                  qc.invalidateQueries({ queryKey: ['admin', 'merchant-api', merchantId] });
                })
                .catch((err) => toast.error(err.message));
            }}
          >
            <Trash2 className="w-3 h-3" />
            حذف الربط
          </Button>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  rightSlot,
  children,
}: {
  title: string;
  hint?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}
