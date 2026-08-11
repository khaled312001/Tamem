/**
 * «طلب يدوي مخصص» — a point-to-point courier job.
 *
 * The other manual-order screen starts from a STORE: pick a merchant, pick
 * products, price the basket. That is the wrong shape for "take this from here
 * to there" — there is no catalogue, nothing to price per line, and forcing the
 * agent to invent a merchant just to open the form was the complaint.
 *
 * So this one starts from the two addresses and treats everything else as free
 * text the agent types while the customer is on the phone. A merchant can still
 * be attached when the pickup happens to be a shop we know, but it is optional
 * and changes nothing about how the order is priced.
 *
 * It posts to the same POST /admin/orders as the other screen, so the resulting
 * order is an ordinary order: same statuses, same tracking, same messages.
 *
 * ONE step, deliberately. The agent picks the driver here, and the single
 * button creates the order, assigns them, and sends the WhatsApp round and the
 * customer's email. The old shape — create, close, find the order, open it,
 * assign, wait — was four screens of clicking with a customer on the line.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, CheckCircle2, Loader2, MapPin, Search, Truck, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { api } from '../lib/api.js';
import { formatMoney } from '../lib/format.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const PAYMENTS = [
  { key: 'CASH', label: 'كاش عند الاستلام' },
  { key: 'VODAFONE_CASH', label: 'فودافون كاش' },
  { key: 'INSTAPAY', label: 'إنستا باي' },
] as const;

/**
 * How far this one click takes the order.
 *
 * Not the full twelve-state FSM — an agent on the phone needs the four answers
 * they actually give ("لسه", "مع المندوب", "في الطريق", "خلص"), and the order
 * page still has the granular walk for anything else.
 */
const STAGES = [
  { key: 'NEW', label: 'جديد', needsDriver: false },
  { key: 'DRIVER_ASSIGNED', label: 'مع المندوب', needsDriver: true },
  { key: 'IN_ROUTE', label: 'في الطريق', needsDriver: true },
  { key: 'COMPLETED', label: 'خلص وتسلّم', needsDriver: false },
] as const;

export function CustomOrderDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  // ── customer ──
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  // Typed on the call. Saved to the account only when it has none — a
  // customer's own address is theirs — but always used for this order's copy,
  // which is what «ابعتله الإيميل» means when they just said it out loud.
  const [email, setEmail] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [debPhone, setDebPhone] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebPhone(phone.trim()), 350);
    return () => clearTimeout(t);
  }, [phone]);

  const { data: found, isFetching: searching } = useQuery({
    queryKey: ['custom-order', 'customer', debPhone],
    queryFn: () => api.adminListCustomers({ search: debPhone, pageSize: 5 }),
    enabled: debPhone.replace(/\D/g, '').length >= 6,
  });
  const matches = ((found?.items ?? []) as Row[]).filter((c) => c.role !== 'DRIVER');

  // ── the trip ──
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [what, setWhat] = useState('');

  // ── money ──
  const [fee, setFee] = useState('');
  const [goods, setGoods] = useState('');
  const [payment, setPayment] = useState<string>('CASH');
  const [notes, setNotes] = useState('');

  // ── who runs it ──
  const [driverId, setDriverId] = useState('');
  const { data: drivers } = useQuery({
    queryKey: ['custom-order', 'drivers'],
    queryFn: () => api.adminListDrivers({ pageSize: 100 }) as Promise<{ items: Row[] }>,
  });

  /*
   * Where the order should END UP, decided here.
   *
   * A courier job is usually written down after it happened: the agent knows
   * who took it and that it arrived. Forcing them to create it, close the
   * dialog, find it in the list, open it and walk six statuses is five screens
   * of clicking to record something already finished.
   */
  const [stage, setStage] = useState<'NEW' | 'DRIVER_ASSIGNED' | 'IN_ROUTE' | 'COMPLETED'>('NEW');
  const [markPaid, setMarkPaid] = useState(true);
  // Clearing the driver after picking "مع المندوب" would otherwise submit a
  // stage that contradicts the form.
  useEffect(() => {
    if (!driverId && (stage === 'DRIVER_ASSIGNED' || stage === 'IN_ROUTE')) setStage('NEW');
  }, [driverId, stage]);

  // ── optional store ──
  const [merchantId, setMerchantId] = useState('');
  const { data: merchants } = useQuery({
    queryKey: ['custom-order', 'merchants'],
    queryFn: () => api.adminListMerchants({ pageSize: 200 }) as Promise<{ items: Row[] }>,
  });

  // The service this order files under. A courier job is a DELIVERY, so it
  // lands in the same queue the delivery team already watches.
  const { data: services } = useQuery({
    queryKey: ['custom-order', 'services'],
    queryFn: () => api.adminListServices() as Promise<Row[]>,
  });
  const serviceId = useMemo(() => {
    const list = services ?? [];
    return (
      list.find((s) => s.category === 'DELIVERY' && s.isActive)?.id ??
      list.find((s) => s.isActive)?.id ??
      ''
    );
  }, [services]);

  const feeNum = fee.trim() === '' ? 0 : Number(fee) || 0;
  const goodsNum = goods.trim() === '' ? 0 : Number(goods) || 0;
  const total = feeNum + goodsNum;

  const create = useMutation({
    mutationFn: () =>
      api.raw.post('/admin/orders', {
        serviceId,
        customerId: customerId ?? undefined,
        customerPhone: customerId ? undefined : phone.trim(),
        customerName: name.trim() || undefined,
        customerEmail: email.trim() || undefined,
        pickupAddress: pickup.trim(),
        deliveryAddress: dropoff.trim(),
        // What is being moved has no catalogue behind it, so it rides in the
        // notes where the driver and the WhatsApp message already read from.
        notes: [what.trim(), notes.trim()].filter(Boolean).join('\n'),
        deliveryFee: feeNum,
        // Nothing is priced per line here, so the agreed total IS the price.
        quotedPrice: total > 0 ? total : undefined,
        paymentMethod: payment,
        assignedDriverId: driverId || undefined,
        merchantId: merchantId || undefined,
        advanceTo: stage === 'NEW' ? undefined : stage,
        markPaid: stage === 'COMPLETED' ? markPaid : undefined,
      }),
    onSuccess: (res) => {
      const d = (
        res as {
          data?: { data?: { driverNote?: string; notified?: string[]; orderNumber?: string } };
        }
      )?.data?.data;
      // Report what actually left, not what was hoped for: a customer with no
      // address on file gets no email, and the agent has to know that now —
      // not when the customer phones back asking where it is.
      const sent = d?.notified ?? [];
      const head =
        stage === 'COMPLETED'
          ? `الطلب #${d?.orderNumber ?? ''} اتسجّل مكتمل`
          : `تم إنشاء الطلب #${d?.orderNumber ?? ''}`;
      toast.success(sent.length ? `${head} — اتبعت: ${sent.join('، ')}` : head);
      // The order always goes in; the driver is best-effort.
      if (d?.driverNote) toast.warning(String(d.driverNote));
      onCreated();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || 'تعذّر إنشاء الطلب'),
  });

  /*
   * Everything on this form is optional except the phone, and that is not a
   * style choice: an order has to belong to somebody. The server refuses one
   * with no customer, so blocking here is kinder than letting the agent fill
   * the whole form and collect an error on submit.
   *
   * The addresses and the fee are deliberately NOT required — an agent taking
   * a call often has the phone and half the story, and can fill the rest in
   * once the order exists rather than keeping the customer waiting.
   */
  const valid = !!serviceId && (!!customerId || phone.trim().length >= 8);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="طلب يدوي مخصص">
      <div className="space-y-4">
        <p className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          توصيلة من مكان لمكان من غير ما تختار تاجر ولا منتجات — اكتب المطلوب بنفسك، حدد السعر
          والمندوب، واقفل الطلب كله من هنا لو خلص. ضغطة واحدة تنشئ الطلب وتحدّث حالته وتبعت الواتساب
          والإيميل. كل الخانات اختيارية غير رقم الهاتف عشان الطلب يبقى لحد.
        </p>

        {/* 1 — customer */}
        <section className="space-y-2">
          <SectionTitle icon={User} title="العميل" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="رقم الهاتف" hint="لازم رقم عشان الطلب يبقى لحد">
              <Input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setCustomerId(null);
                }}
                placeholder="01XXXXXXXXX"
                dir="ltr"
              />
            </Field>
            <Field
              label="الاسم (اختياري)"
              hint={customerId ? 'عميل مسجّل' : 'هيتعمل له حساب تلقائي'}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Field
            label="الإيميل (اختياري)"
            hint="عشان يوصله الطلب بالتفصيل على الإيميل — لو العميل مالوش إيميل محفوظ هيتحفظ له"
          >
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              dir="ltr"
              type="email"
            />
          </Field>
          {searching && <p className="text-xs text-muted-foreground">جاري البحث…</p>}
          {!customerId && matches.length > 0 && (
            <div className="rounded-lg border border-border divide-y divide-border">
              {matches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCustomerId(String(c.id));
                    setName(String(c.name ?? ''));
                    setPhone(String(c.phone ?? ''));
                    // Their address on file, so the agent can see there is one
                    // (or that there isn't) instead of guessing.
                    setEmail(String(c.email ?? ''));
                  }}
                  className="w-full px-3 py-2 text-start text-sm hover:bg-muted/50"
                >
                  <span className="font-bold">{c.name ?? 'بدون اسم'}</span>{' '}
                  <span className="text-muted-foreground" dir="ltr">
                    {c.phone}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 2 — the trip */}
        <section className="space-y-2">
          <SectionTitle icon={ArrowLeftRight} title="الرحلة" />
          <Field label="من (مكان الاستلام)">
            <Input
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              placeholder="مثال: قفط — شارع المحطة، أمام الصيدلية"
            />
          </Field>
          <Field label="إلى (مكان التسليم)">
            <Input
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
              placeholder="مثال: قنا — شارع الجمهورية، برج النيل"
            />
          </Field>
          <Field label="المطلوب" hint="بيوصل للمندوب وفي رسالة الواتساب">
            <Textarea
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              rows={2}
              placeholder="مثال: ظرف أوراق — يتسلّم من الأستاذ محمد"
            />
          </Field>
        </section>

        {/* 3 — money */}
        <section className="space-y-2">
          <SectionTitle icon={Truck} title="الحساب" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="رسوم التوصيل">
              <Input
                type="number"
                inputMode="decimal"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="مثال: 50"
              />
            </Field>
            <Field label="قيمة المطلوب (اختياري)" hint="لو المندوب هيدفع تمن حاجة">
              <Input
                type="number"
                inputMode="decimal"
                value={goods}
                onChange={(e) => setGoods(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            {PAYMENTS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPayment(p.key)}
                className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                  payment === p.key
                    ? 'border-brand-red bg-brand-red/5 text-brand-red'
                    : 'border-border hover:bg-muted/40'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-brand-red/5 px-3 py-2 text-sm font-black">
            <span>الإجمالي المطلوب تحصيله</span>
            <span className="text-brand-red">{formatMoney(total)}</span>
          </div>
        </section>

        {/* 4 — who runs it */}
        <section className="space-y-2">
          <SectionTitle icon={MapPin} title="التنفيذ" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="المندوب (اختياري)" hint="سيبه فاضي عشان توزّعه بعدين">
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:border-brand-red"
              >
                <option value="">— يتحدد لاحقاً —</option>
                {(drivers?.items ?? []).map((d) => (
                  <option key={d.id} value={String(d.userId ?? d.id)}>
                    {d.user?.name ?? d.name ?? 'مندوب'} — {d.user?.phone ?? d.phone ?? ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="اربطه بتاجر (اختياري)" hint="لو الاستلام من محل معروف عندنا">
              <select
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:border-brand-red"
              >
                <option value="">— بدون تاجر —</option>
                {(merchants?.items ?? []).map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.storeNameAr ?? m.storeName}
                    {m.city ? ` — ${m.city}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="ملاحظات داخلية (اختياري)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        </section>

        {/* 5 — where it ends up */}
        <section className="space-y-2">
          <SectionTitle icon={CheckCircle2} title="حالة الطلب" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            لو التوصيلة اتعملت خلاص، اقفلها من هنا على طول — مش لازم تفتح الطلب بعدين وتمشّي الحالات
            واحدة واحدة.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STAGES.map((s) => {
              const blocked = s.needsDriver && !driverId;
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={blocked}
                  onClick={() => setStage(s.key)}
                  title={blocked ? 'اختر المندوب الأول' : undefined}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                    stage === s.key
                      ? 'border-brand-red bg-brand-red/5 text-brand-red'
                      : blocked
                        ? 'border-border text-muted-foreground/50 cursor-not-allowed'
                        : 'border-border hover:bg-muted/40'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          {stage === 'COMPLETED' && (
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={markPaid}
                onChange={(e) => setMarkPaid(e.target.checked)}
                className="h-4 w-4 accent-brand-red"
              />
              <span>
                الفلوس اتحصّلت <span className="text-muted-foreground">({formatMoney(total)})</span>
              </span>
            </label>
          )}
        </section>

        {/* 6 — what the one button is about to do.
            Spelled out BEFORE the click, not reported after it: the agent is on
            the phone and has to be able to say "تمام، هيوصلك رسالة دلوقتي"
            while the customer is still listening. */}
        <section className="rounded-xl border border-border bg-muted/30 p-3 text-xs leading-relaxed">
          <p className="font-bold text-sm text-foreground mb-1">الضغطة الواحدة دي هتعمل:</p>
          <ul className="space-y-0.5 text-muted-foreground">
            <li>• تنشئ الطلب{driverId ? ' وتسنده للمندوب المختار' : ''}</li>
            {stage !== 'NEW' && (
              <li>
                • تحطه على «{STAGES.find((s) => s.key === stage)?.label}»
                {stage === 'COMPLETED' && markPaid ? ' وتسجّل إنه اتدفع' : ''}
              </li>
            )}
            <li>• تبعت واتساب للعميل{driverId ? ' وللمندوب' : ''} ولجروب الإدارة</li>
            <li>
              •{' '}
              {email.trim() ? (
                <>
                  تبعت الطلب بالتفصيل على <span dir="ltr">{email.trim()}</span>
                </>
              ) : (
                <span className="text-amber-700">
                  الإيميل مش هيتبعت — اكتب إيميل العميل فوق لو عايزه يوصله
                </span>
              )}
            </li>
          </ul>
        </section>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => create.mutate()} disabled={!valid || create.isPending}>
            {create.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : stage === 'COMPLETED' ? (
              'سجّل الطلب مكتمل وابعت'
            ) : (
              'أنشئ الطلب وابعته'
            )}
          </Button>
        </div>

        {!serviceId && (
          <p className="text-xs text-destructive">
            مفيش خدمة توصيل مفعّلة — فعّل واحدة من «الخدمات» الأول.
          </p>
        )}
      </div>
    </Dialog>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Search; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-black text-foreground">
      <Icon className="w-4 h-4 text-brand-red" />
      {title}
    </div>
  );
}
