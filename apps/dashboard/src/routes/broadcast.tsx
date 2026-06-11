/**
 * Broadcast notifications — admin sends a one-off announcement to every
 * user (or a role slice) instantly. Persists Notification rows + fans out
 * FCM push to anyone with a device token. The form keeps a 4-template
 * starter pad and shows a live preview of what the recipient will see.
 */
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Gift,
  Loader2,
  Megaphone,
  Send,
  Sparkles,
  Truck,
  User,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { api } from '../lib/api.js';

type Target = 'ALL' | 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN';
type Kind = 'ANNOUNCEMENT' | 'PROMO' | 'ALERT';

interface BroadcastResponse {
  recipients: number;
  pushSent: number;
  pushFailed: number;
}

const TARGETS: { value: Target; label: string; Icon: typeof Users; hint: string }[] = [
  { value: 'ALL', label: 'الكل', Icon: Users, hint: 'العملاء والتجار والسائقين' },
  { value: 'CUSTOMER', label: 'العملاء', Icon: User, hint: 'مستخدمي التطبيق فقط' },
  { value: 'MERCHANT', label: 'التجار', Icon: Sparkles, hint: 'أصحاب المتاجر' },
  { value: 'DRIVER', label: 'السائقون', Icon: Truck, hint: 'الكباتن' },
];

const KINDS: { value: Kind; label: string; Icon: typeof Bell; tone: string }[] = [
  {
    value: 'ANNOUNCEMENT',
    label: 'إعلان عام',
    Icon: Megaphone,
    tone: 'border-blue-300 bg-blue-50 text-blue-900',
  },
  {
    value: 'PROMO',
    label: 'عرض / تخفيض',
    Icon: Gift,
    tone: 'border-amber-300 bg-amber-50 text-amber-900',
  },
  {
    value: 'ALERT',
    label: 'تنبيه هام',
    Icon: AlertTriangle,
    tone: 'border-red-300 bg-red-50 text-red-900',
  },
];

const TEMPLATES: { label: string; titleAr: string; bodyAr: string; kind: Kind }[] = [
  {
    label: 'خصم 20%',
    titleAr: 'خصم 20% لفترة محدودة',
    bodyAr:
      'استمتع بخصم 20% على أول 3 طلبات اليوم. استخدم كود TAMEM20 في صفحة الدفع. العرض صالح حتى منتصف الليل.',
    kind: 'PROMO',
  },
  {
    label: 'صيانة قصيرة',
    titleAr: 'إيقاف مؤقت للصيانة',
    bodyAr:
      'فيه صيانة قصيرة من 2 لـ 4 صباحاً اليوم. ممكن تواجه بطء في التطبيق خلال الفترة دي. نعتذر عن الإزعاج.',
    kind: 'ALERT',
  },
  {
    label: 'تحديث جديد',
    titleAr: 'تحديث التطبيق متاح',
    bodyAr:
      'حدّث تطبيق تميم لآخر إصدار وتمتع بشاشات أسرع، خريطة محسّنة، ودعم لكل وسائل الدفع المصرية.',
    kind: 'ANNOUNCEMENT',
  },
  {
    label: 'شكر للعملاء',
    titleAr: 'شكراً لاختياركم تميم',
    bodyAr: 'وصلنا لـ 10,000 طلب توصيل ناجح بفضلكم. شكراً لكل عميل ساند تميم.',
    kind: 'ANNOUNCEMENT',
  },
];

export function BroadcastPage() {
  const [titleAr, setTitleAr] = useState('');
  const [bodyAr, setBodyAr] = useState('');
  const [target, setTarget] = useState<Target>('ALL');
  const [kind, setKind] = useState<Kind>('ANNOUNCEMENT');
  const [lastResult, setLastResult] = useState<BroadcastResponse | null>(null);

  const mut = useMutation({
    mutationFn: async (): Promise<BroadcastResponse> => {
      const res = await api.raw.post('/admin/broadcast', { titleAr, bodyAr, target, kind });
      return res.data.data as BroadcastResponse;
    },
    onSuccess: (data) => {
      toast.success(`تم الإرسال إلى ${data.recipients} مستخدم`);
      setLastResult(data);
      setTitleAr('');
      setBodyAr('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    setTitleAr(t.titleAr);
    setBodyAr(t.bodyAr);
    setKind(t.kind);
  };

  const canSubmit = titleAr.trim().length > 2 && bodyAr.trim().length > 5;
  const charsLeft = 1000 - bodyAr.length;

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-brand-red" /> إشعار جماعي
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            أرسل إعلاناً أو عرضاً لكل المستخدمين فوراً — يصل عبر الإشعارات داخل التطبيق + push.
          </p>
        </div>
        <Button onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending} size="lg">
          {mut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          إرسال الآن
        </Button>
      </header>

      {/* Last result banner */}
      {lastResult && !mut.isPending && (
        <div className="rounded-xl border-2 border-green-300 bg-green-50 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-black text-green-900">تم الإرسال بنجاح</div>
            <div className="text-sm text-green-800 mt-0.5">
              وصل لـ <strong>{lastResult.recipients}</strong> مستخدم. تم إرسال{' '}
              <strong>{lastResult.pushSent}</strong> push notification بنجاح
              {lastResult.pushFailed > 0 && (
                <span>
                  {' '}
                  ({lastResult.pushFailed} فشلت — مستخدمين بدون device token أو راحوا من الخدمة)
                </span>
              )}
              .
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Form column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Target */}
          <section className="bg-white rounded-xl border border-border p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-3 flex items-center gap-1.5">
              <Users className="w-4 h-4" /> من سيستلم الإشعار؟
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TARGETS.map((t) => {
                const active = target === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTarget(t.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition text-center ${
                      active
                        ? 'border-brand-red bg-brand-red/5 ring-2 ring-brand-red/30'
                        : 'border-border bg-white hover:border-brand-red/40'
                    }`}
                  >
                    <t.Icon
                      className={`w-6 h-6 ${active ? 'text-brand-red' : 'text-muted-foreground'}`}
                    />
                    <span
                      className={`font-black text-sm ${active ? 'text-brand-red' : 'text-ink'}`}
                    >
                      {t.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{t.hint}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Kind */}
          <section className="bg-white rounded-xl border border-border p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-3 flex items-center gap-1.5">
              <Bell className="w-4 h-4" /> نوع الإشعار
            </div>
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map((k) => {
                const active = kind === k.value;
                return (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 transition ${
                      active
                        ? k.tone + ' border-current ring-2 ring-current/30'
                        : 'border-border bg-white hover:border-current/30'
                    }`}
                  >
                    <k.Icon className="w-5 h-5 shrink-0" />
                    <span className="font-bold text-sm">{k.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Content */}
          <section className="bg-white rounded-xl border border-border p-5 space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5">
              <Megaphone className="w-4 h-4" /> الرسالة
            </div>
            <Field label="العنوان (يظهر كـ Title في الإشعار)" required>
              <Input
                value={titleAr}
                onChange={(e) => setTitleAr(e.target.value)}
                maxLength={120}
                placeholder="مثلاً: خصم 20% لفترة محدودة"
              />
            </Field>
            <Field label="نص الرسالة (يظهر تحت العنوان)" required>
              <Textarea
                value={bodyAr}
                onChange={(e) => setBodyAr(e.target.value)}
                rows={5}
                maxLength={1000}
                placeholder="اكتب الرسالة هنا..."
              />
              <div className="text-xs text-muted-foreground mt-1 text-left" dir="ltr">
                {charsLeft} / 1000
              </div>
            </Field>
          </section>

          {/* Templates */}
          <section className="bg-white rounded-xl border border-border p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-3 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> قوالب جاهزة — اضغط لاستخدامها
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="text-right rounded-lg border border-border p-3 hover:border-brand-red/60 hover:bg-brand-red/5 transition"
                >
                  <div className="font-bold text-sm text-ink">{t.label}</div>
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.titleAr}</div>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Preview column */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5">
              <Bell className="w-4 h-4" /> معاينة
            </div>

            {/* Mobile notification preview */}
            <div className="rounded-2xl border-2 border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-3 shadow-inner">
              <div className="bg-white rounded-xl p-3 shadow-md">
                <div className="flex items-start gap-2.5">
                  <div className="w-10 h-10 rounded-lg bg-brand-red text-white grid place-items-center shrink-0">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-black text-sm text-ink truncate">تميم للتوصيل</div>
                      <div className="text-[10px] text-muted-foreground shrink-0">الآن</div>
                    </div>
                    <div className="font-bold text-sm mt-1 text-ink line-clamp-2">
                      {titleAr || 'عنوان الإشعار'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">
                      {bodyAr || 'نص الرسالة سيظهر هنا...'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>تنبيه:</strong> الإرسال لا يمكن التراجع عنه — راجع المحتوى ثم اضغط "إرسال
                الآن".
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
