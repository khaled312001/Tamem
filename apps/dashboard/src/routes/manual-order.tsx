/**
 * «إنشاء طلب يدوي» — the screen a phone agent uses while the customer is on
 * the line.
 *
 * Design notes, because the obvious shape is the wrong one here:
 *
 * - It is ONE screen, not a wizard. An agent takes the same call dozens of
 *   times a day; making them click "next" six times per call is slower, not
 *   clearer. The sections are ordered the way the conversation goes and the
 *   running total is pinned beside them.
 *
 * - It creates ONE order even when the basket spans stores. Every line carries
 *   its own merchantId, so the per-store breakdown survives — see the note in
 *   /orders/cart for why a child order per store was removed.
 *
 * - A missing zone tariff never blocks the order. The agent can type a fee or
 *   leave it to be set later; either way the order goes in, and the override
 *   (who, how much, why) is recorded on the order.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  Loader2,
  MapPin,
  Plus,
  Search,
  Store,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input, Textarea } from '../components/ui/Input.js';
import { api } from '../lib/api.js';
import { formatMoney } from '../lib/format.js';
import { cn } from '../lib/utils.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const PAYMENTS = [
  { key: 'CASH', label: 'كاش عند الاستلام' },
  { key: 'VODAFONE_CASH', label: 'فودافون كاش' },
  { key: 'INSTAPAY', label: 'إنستا باي' },
] as const;

interface Line {
  key: string;
  productId: string | null;
  nameAr: string;
  unitPrice: number;
  quantity: number;
  notes: string;
  variantId?: string | null;
  variantName?: string | null;
  addonIds: string[];
  addonNames: string[];
}

interface Basket {
  merchantId: string;
  merchantName: string;
  lines: Line[];
}

/**
 * One «مجموعة توصيل» — the goods leaving from one place.
 *
 * A basket that mixes a قفط shop with a قنا shop is two journeys: two riders,
 * two schedules, two fees. The server returns one of these per journey so the
 * screen can show the agent exactly what the customer is being charged for.
 */
interface QuoteGroup {
  key: string;
  kind: 'LOCAL' | 'INTERCITY';
  label: string;
  city: string | null;
  fee: number;
  localFee: number;
  intercityFee: number;
  merchantIds: string[];
  merchantNames: string[];
  windows: { label?: string; cutoff?: string; delivery?: string }[];
}

interface Quote {
  price?: number | string;
  groups?: QuoteGroup[];
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function ManualOrderDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  // ── customer ──
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  // Typed on the call so the customer's emailed copy can go out from the same
  // click. Saved to the account only when it has none.
  const [email, setEmail] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [debPhone, setDebPhone] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebPhone(phone.trim()), 350);
    return () => clearTimeout(t);
  }, [phone]);

  // Look the caller up as they type — most phone orders are repeat customers,
  // and finding them brings their saved addresses with it.
  const { data: found, isFetching: searching } = useQuery({
    queryKey: ['manual-order', 'customer', debPhone],
    queryFn: () => api.adminListCustomers({ search: debPhone, pageSize: 5 }),
    enabled: debPhone.replace(/\D/g, '').length >= 6,
  });
  const matches = ((found?.items ?? []) as Row[]).filter((c) => c.role !== 'DRIVER');

  const { data: customer } = useQuery({
    queryKey: ['manual-order', 'customer-detail', customerId],
    queryFn: () => api.adminGetCustomer(customerId!) as Promise<Row>,
    enabled: !!customerId,
  });
  const savedAddresses: Row[] = customer?.savedAddresses ?? [];

  // ── address + zone ──
  const [address, setAddress] = useState('');
  const [cityId, setCityId] = useState('');
  const [villageId, setVillageId] = useState('');
  const [areaId, setAreaId] = useState('');

  const { data: cities } = useQuery({
    queryKey: ['manual-order', 'cities'],
    queryFn: () => api.raw.get('/zones/cities').then((r) => r.data.data as Row[]),
  });
  const { data: villages } = useQuery({
    queryKey: ['manual-order', 'villages', cityId],
    queryFn: () =>
      api.raw.get(`/zones/cities/${cityId}/villages`).then((r) => r.data.data as Row[]),
    enabled: !!cityId,
  });
  const { data: areas } = useQuery({
    queryKey: ['manual-order', 'areas', villageId],
    queryFn: () =>
      api.raw.get(`/zones/villages/${villageId}/areas`).then((r) => r.data.data as Row[]),
    enabled: !!villageId,
  });

  // ── baskets ──
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [pickMerchant, setPickMerchant] = useState(false);

  // The tariff for the chosen area. `NO_PRICE` is a normal outcome, not an
  // error — the agent is offered a manual fee instead.
  //
  // EVERY store is sent, not the first one. A basket with a قفط shop and a قنا
  // shop is two journeys with two fees, and quoting it from whichever store the
  // agent happened to add first made the same order cost 20 or 70 depending on
  // the order of two clicks. The server groups them and returns the split.
  const merchantIds = baskets.map((b) => b.merchantId);
  const merchantKey = [...merchantIds].sort().join(',');

  const { data: quote, isFetching: quoting } = useQuery({
    queryKey: ['manual-order', 'fee', cityId, villageId, areaId, merchantKey],
    queryFn: () =>
      api.raw
        .post('/zones/quote-delivery', {
          cityId,
          villageId,
          areaId,
          ...(merchantIds.length ? { merchantIds } : {}),
        })
        .then((r) => r.data.data as Quote)
        .catch(() => ({ price: undefined }) as Quote),
    enabled: !!(cityId && villageId && areaId),
  });
  // Groups only matter when there is more than one — a single-origin order is
  // the ordinary case and gets the ordinary single driver picker.
  const groups: QuoteGroup[] = quote?.groups ?? [];
  const multiGroup = groups.length > 1;
  // Tolerate a stringified decimal: MySQL DECIMAL comes back as a string
  // through PDO, and an older API build is still allowed to say "20.00".
  const zoneFee = (() => {
    const n = Number(quote?.price);
    return quote?.price != null && Number.isFinite(n) ? n : null;
  })();
  const zoneMissing = !!(cityId && villageId && areaId) && !quoting && zoneFee === null;

  const [manualFee, setManualFee] = useState('');
  const [feeReason, setFeeReason] = useState('');
  const [feeLater, setFeeLater] = useState(false);

  const pickSaved = (a: Row) => {
    setAddress(a.address ?? '');
    setCityId(a.cityId ?? '');
    setVillageId(a.villageId ?? '');
    setAreaId(a.areaId ?? '');
  };

  const { data: merchants } = useQuery({
    queryKey: ['manual-order', 'merchants'],
    queryFn: () =>
      api.raw
        .get('/admin/merchants', { params: { pageSize: 200 } })
        .then((r) => r.data.data as Row[]),
    enabled: pickMerchant,
  });

  const addBasket = (m: Row) => {
    if (baskets.some((b) => b.merchantId === m.id)) {
      toast.error('التاجر ده مضاف بالفعل');
      return;
    }
    setBaskets((prev) => [
      ...prev,
      { merchantId: m.id, merchantName: m.storeNameAr ?? m.storeName ?? 'متجر', lines: [] },
    ]);
    setPickMerchant(false);
  };

  const patchBasket = (merchantId: string, fn: (b: Basket) => Basket) =>
    setBaskets((prev) => prev.map((b) => (b.merchantId === merchantId ? fn(b) : b)));

  // ── totals ──
  const merchantTotals = baskets.map((b) => ({
    merchantId: b.merchantId,
    merchantName: b.merchantName,
    subtotal: b.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
  }));
  const goods = merchantTotals.reduce((s, m) => s + m.subtotal, 0);
  const effectiveFee = feeLater ? null : manualFee.trim() !== '' ? Number(manualFee) || 0 : zoneFee;
  const computed = goods + (effectiveFee ?? 0);

  const [agreed, setAgreed] = useState('');
  const [agreedReason, setAgreedReason] = useState('');
  const agreedNum = agreed.trim() !== '' ? Number(agreed) || 0 : null;
  const diff = agreedNum !== null ? agreedNum - computed : 0;

  const [payment, setPayment] = useState<string>('CASH');
  const [notes, setNotes] = useState('');
  // Assigning here saves the agent creating the order, reopening it, and
  // assigning from a second screen while the customer is still on the line.
  // The server does the real assignment (availability, BUSY, fee share,
  // notification) and tells us if the driver could not take it.
  const [driverId, setDriverId] = useState('');
  // …and one per delivery group when the basket spans cities, because the قنا
  // half and the قفط half are carried by different people.
  const [legDrivers, setLegDrivers] = useState<Record<string, string>>({});
  const { data: drivers } = useQuery({
    queryKey: ['manual-order', 'drivers'],
    queryFn: () => api.adminListDrivers({ pageSize: 100 }) as Promise<{ items: Row[] }>,
  });
  const [review, setReview] = useState(false);

  const { data: services } = useQuery({
    queryKey: ['manual-order', 'services'],
    queryFn: () => api.adminListServices() as Promise<Row[]>,
  });
  // Products come from stores, so this is a delivery order; fall back to the
  // first active service when there is no DELIVERY one configured.
  const serviceId = useMemo(() => {
    const list = (services ?? []).filter((s: Row) => s.isActive !== false);
    return (list.find((s: Row) => s.category === 'DELIVERY') ?? list[0])?.id ?? '';
  }, [services]);

  const create = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        serviceId,
        customerId: customerId ?? undefined,
        customerPhone: customerId ? undefined : phone.trim(),
        customerName: name.trim() || undefined,
        customerEmail: email.trim() || undefined,
        deliveryAddress: address.trim(),
        cityId: cityId || undefined,
        villageId: villageId || undefined,
        areaId: areaId || undefined,
        paymentMethod: payment,
        // One driver for a one-journey order; a driver per group otherwise.
        assignedDriverId: multiGroup ? undefined : driverId || undefined,
        legDrivers: multiGroup
          ? Object.fromEntries(Object.entries(legDrivers).filter(([, v]) => v))
          : undefined,
        notes: notes.trim() || undefined,
        merchants: baskets.map((b) => ({
          merchantId: b.merchantId,
          items: b.lines.map((l) => ({
            productId: l.productId ?? undefined,
            nameAr: l.productId ? undefined : l.nameAr,
            unitPrice: l.productId ? undefined : l.unitPrice,
            quantity: l.quantity,
            variantId: l.variantId ?? undefined,
            addonIds: l.addonIds.length ? l.addonIds : undefined,
            notes: l.notes.trim() || undefined,
          })),
        })),
      };
      // Only send a fee when the agent actually decided one; "later" leaves it
      // null so the order is still created and priced afterwards.
      if (!feeLater && manualFee.trim() !== '') {
        body.deliveryFee = Number(manualFee) || 0;
        body.deliveryFeeReason = feeReason.trim() || undefined;
      }
      if (agreedNum !== null) {
        body.quotedPrice = agreedNum;
        body.quotedPriceReason = agreedReason.trim() || undefined;
      }
      const res = await api.raw.post('/admin/orders', body);
      return res.data.data as Row;
    },
    onSuccess: (o) => {
      // What actually left, not what was hoped for — a customer with no address
      // on file gets no email, and the agent needs to know that while they are
      // still on the call.
      const sent: string[] = o?.notified ?? [];
      toast.success(
        sent.length
          ? `تم إنشاء الطلب #${o?.orderNumber ?? ''} — اتبعت: ${sent.join('، ')}`
          : `تم إنشاء الطلب #${o?.orderNumber ?? ''}`,
      );
      // The order always goes in; the driver is best-effort. Saying so beats a
      // silent unassigned order the agent thinks is on its way.
      if (o?.driverNote) toast.warning(String(o.driverNote));
      onCreated();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasItems = baskets.some((b) => b.lines.length > 0);
  /*
   * A free-text line starts empty and at zero, and nothing stopped either from
   * being saved: a real order went out carrying "صنف يدوي — 0 ج.م" twice. A
   * line with no name cannot be picked or packed, and one at zero silently
   * undercharges, so neither may leave this screen.
   */
  const badLines = baskets.flatMap((b) =>
    b.lines
      .filter((l) => !l.nameAr.trim() || !(l.unitPrice > 0) || !(l.quantity > 0))
      .map((l) => ({ merchant: b.merchantName, name: l.nameAr.trim() })),
  );

  const canCreate =
    !!serviceId &&
    (customerId || phone.trim().length >= 8) &&
    address.trim().length >= 2 &&
    hasItems &&
    badLines.length === 0 &&
    !create.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="إنشاء طلب يدوي" size="xl">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* ── main column ── */}
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pe-1">
          {/* 1 — customer */}
          <Section icon={User} title="بيانات العميل">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="رقم الهاتف" required>
                <Input
                  dir="ltr"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setCustomerId(null);
                  }}
                  placeholder="01xxxxxxxxx"
                  autoFocus
                />
              </Field>
              <Field label="الاسم" hint={customerId ? 'عميل مسجّل' : 'هيتعمل له حساب تلقائي'}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اسم العميل"
                />
              </Field>
              <Field
                label="الإيميل (اختياري)"
                hint="عشان يوصله الطلب بالتفصيل — لو مالوش إيميل محفوظ هيتحفظ له"
              >
                <Input
                  dir="ltr"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </Field>
            </div>

            {searching && <p className="text-xs text-muted-foreground">جاري البحث…</p>}
            {!customerId && !searching && phone.trim().length >= 8 && matches.length === 0 && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                عميل جديد — هيتعمل له حساب بالرقم ده. لو حبّ ينزّل التطبيق بعد كده، يدخل بنفس الرقم
                من «نسيت كلمة المرور» عشان يعيّن كلمة سر، وطلباته دي هيلاقيها في حسابه.
              </p>
            )}
            {!customerId && matches.length > 0 && (
              <div className="rounded-lg border border-border divide-y divide-border">
                {matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCustomerId(c.id);
                      setName(c.name ?? '');
                      setPhone(c.phone ?? phone);
                      setEmail(c.email ?? '');
                    }}
                    className="w-full text-start px-3 py-2 hover:bg-muted/50 transition text-sm"
                  >
                    <span className="font-bold">{c.name ?? 'بدون اسم'}</span>
                    <span className="text-muted-foreground" dir="ltr">
                      {' '}
                      {c.phone}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {customerId && (
              <p className="text-xs text-emerald-700 font-bold inline-flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> عميل مسجّل — عناوينه محفوظة تحت
              </p>
            )}
          </Section>

          {/* 2 — address */}
          <Section icon={MapPin} title="العنوان">
            {savedAddresses.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {savedAddresses.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => pickSaved(a)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-bold border transition',
                      address === a.address
                        ? 'bg-brand-red text-white border-brand-red'
                        : 'bg-card border-border hover:border-brand-red/50',
                    )}
                  >
                    {a.label || 'عنوان'} — {String(a.address ?? '').slice(0, 28)}
                  </button>
                ))}
              </div>
            )}

            <Field label="العنوان بالتفصيل" required>
              <Textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="اسم الشارع، علامة مميزة، رقم الدور…"
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <ZoneSelect
                label="المدينة"
                value={cityId}
                rows={cities}
                onChange={(v) => {
                  setCityId(v);
                  setVillageId('');
                  setAreaId('');
                }}
              />
              <ZoneSelect
                label="القرية"
                value={villageId}
                rows={villages}
                disabled={!cityId}
                onChange={(v) => {
                  setVillageId(v);
                  setAreaId('');
                }}
              />
              <ZoneSelect
                label="المنطقة"
                value={areaId}
                rows={areas}
                disabled={!villageId}
                onChange={setAreaId}
              />
            </div>

            {zoneMissing && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  لا توجد تسعيرة توصيل مسجلة لهذه المنطقة
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="رسوم التوصيل يدوياً">
                    <Input
                      type="number"
                      min="0"
                      dir="ltr"
                      value={manualFee}
                      onChange={(e) => {
                        setManualFee(e.target.value);
                        setFeeLater(false);
                      }}
                      placeholder="0"
                      className="w-32"
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-sm font-bold pb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={feeLater}
                      onChange={(e) => {
                        setFeeLater(e.target.checked);
                        if (e.target.checked) setManualFee('');
                      }}
                      className="w-4 h-4 accent-brand-red"
                    />
                    تُحدَّد لاحقاً
                  </label>
                </div>
                {manualFee.trim() !== '' && (
                  <Field label="سبب التحديد اليدوي" hint="بيتسجّل على الطلب باسمك">
                    <Input
                      value={feeReason}
                      onChange={(e) => setFeeReason(e.target.value)}
                      placeholder="مثال: منطقة بعيدة متفق عليها مع العميل"
                    />
                  </Field>
                )}
              </div>
            )}
          </Section>

          {/* 3 — merchants + products */}
          <Section icon={Store} title="تفاصيل الطلب">
            {baskets.map((b) => (
              <MerchantBasket
                key={b.merchantId}
                basket={b}
                onRemove={() => setBaskets((p) => p.filter((x) => x.merchantId !== b.merchantId))}
                onChange={(fn) => patchBasket(b.merchantId, fn)}
              />
            ))}

            <Button variant="outline" onClick={() => setPickMerchant(true)} className="w-full">
              <Plus className="w-4 h-4" />
              {baskets.length ? 'إضافة تاجر آخر' : 'اختر التاجر'}
            </Button>
          </Section>

          {/* 4 — payment */}
          <Section icon={Check} title="طريقة الدفع">
            <div className="flex flex-wrap gap-2">
              {PAYMENTS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPayment(p.key)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-bold border transition',
                    payment === p.key
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'bg-card border-border hover:border-brand-red/50',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {multiGroup ? (
              <div className="space-y-2">
                <p className="text-xs font-bold text-brand-dark">
                  الطلب ده {groups.length} مجموعات توصيل — لكل مجموعة مندوبها
                </p>
                {groups.map((g) => (
                  <Field
                    key={g.key}
                    label={`مندوب: ${g.label}`}
                    hint={g.merchantNames.join('، ') || 'بدون متاجر'}
                  >
                    <select
                      value={legDrivers[g.key] ?? ''}
                      onChange={(e) => setLegDrivers((p) => ({ ...p, [g.key]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm outline-none focus:border-brand-red"
                    >
                      <option value="">— يتحدد لاحقاً —</option>
                      {(drivers?.items ?? []).map((d: Row) => (
                        <option key={d.id} value={String(d.userId ?? d.id)}>
                          {d.user?.name ?? d.name ?? 'مندوب'} — {d.user?.phone ?? d.phone ?? ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
            ) : (
              <Field
                label="المندوب"
                hint="سيبه فاضي عشان توزّعه بعدين — لو اخترته دلوقتي هيتبعتله الطلب على طول"
              >
                <select
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm outline-none focus:border-brand-red"
                >
                  <option value="">— يتحدد لاحقاً —</option>
                  {(drivers?.items ?? []).map((d: Row) => (
                    <option key={d.id} value={String(d.userId ?? d.id)}>
                      {d.user?.name ?? d.name ?? 'مندوب'} — {d.user?.phone ?? d.phone ?? ''}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="ملاحظات على الطلب">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </Section>
        </div>

        {/* ── sticky summary ── */}
        <aside className="lg:sticky lg:top-0 h-fit space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
          <p className="font-black text-brand-dark">ملخص الحساب</p>

          {merchantTotals.length === 0 ? (
            <p className="text-sm text-muted-foreground">اختر تاجر وأضف منتجات.</p>
          ) : (
            <div className="space-y-1.5 text-sm">
              {merchantTotals.map((m) => (
                <div key={m.merchantId} className="flex justify-between">
                  <span className="text-muted-foreground truncate">{m.merchantName}</span>
                  <span className="font-bold">{formatMoney(m.subtotal)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-1.5">
                <span>إجمالي المنتجات</span>
                <span className="font-bold">{formatMoney(goods)}</span>
              </div>
              <div className="flex justify-between">
                <span>رسوم التوصيل</span>
                <span className="font-bold">
                  {feeLater ? (
                    <span className="text-amber-700">تُحدَّد لاحقاً</span>
                  ) : effectiveFee === null ? (
                    <span className="text-amber-700">—</span>
                  ) : (
                    formatMoney(effectiveFee)
                  )}
                </span>
              </div>
              {/* Why the fee is what it is. A single number over a basket that
                  spans cities looks like a mistake to the agent on the phone —
                  and they are the one who has to justify it to the customer. */}
              {!feeLater && groups.length > 0 && (
                <div className="rounded-lg bg-card border border-border p-2 space-y-1.5">
                  {groups.map((g) => (
                    <div key={g.key} className="text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="font-bold text-brand-dark truncate">{g.label}</span>
                        <span className="font-bold shrink-0">{formatMoney(g.fee)}</span>
                      </div>
                      {g.merchantNames.length > 0 && (
                        <p className="text-muted-foreground truncate">
                          {g.merchantNames.join('، ')}
                        </p>
                      )}
                      {g.intercityFee > 0 && g.localFee > 0 && (
                        <p className="text-muted-foreground">
                          نقل من {g.city}: {formatMoney(g.intercityFee)} + توصيل للعنوان:{' '}
                          {formatMoney(g.localFee)}
                        </p>
                      )}
                      {g.windows.map((w, i) => (
                        <p key={i} className="text-muted-foreground">
                          ⏰ {w.label} — آخر طلب {w.cutoff}، تسليم {w.delivery}
                        </p>
                      ))}
                    </div>
                  ))}
                  {multiGroup && (
                    <p className="text-[11px] leading-relaxed text-amber-800 border-t border-border pt-1.5">
                      الطلب هيتقسم {groups.length} مجموعات، كل واحدة برحلة ومندوب لوحدها — وعشان كده
                      الرسوم مجموعة على بعضها.
                    </p>
                  )}
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1.5 text-base">
                <span className="font-black">الإجمالي</span>
                <span className="font-black text-brand-red">{formatMoney(computed)}</span>
              </div>
            </div>
          )}

          {/* Replaces the old free-floating "السعر المتفق عليه" box: the number
              is optional, and any difference from the computed total is shown
              and must be explained. */}
          <div className="pt-2 border-t border-border space-y-2">
            <Field label="تعديل الإجمالي النهائي (اختياري)">
              <Input
                type="number"
                min="0"
                dir="ltr"
                value={agreed}
                onChange={(e) => setAgreed(e.target.value)}
                placeholder={String(Math.round(computed))}
              />
            </Field>
            {agreedNum !== null && Math.abs(diff) > 0.009 && (
              <>
                <p
                  className={cn(
                    'text-xs font-bold',
                    diff < 0 ? 'text-emerald-700' : 'text-amber-700',
                  )}
                >
                  الفرق عن المحسوب: {diff > 0 ? '+' : ''}
                  {formatMoney(diff)}
                </p>
                <Field label="سبب التعديل">
                  <Input
                    value={agreedReason}
                    onChange={(e) => setAgreedReason(e.target.value)}
                    placeholder="مثال: خصم استثنائي"
                  />
                </Field>
              </>
            )}
          </div>

          {badLines.length > 0 && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs font-bold leading-relaxed text-amber-900">
              في {badLines.length} صنف ناقص اسم أو سعره صفر — اكتب الاسم والسعر قبل ما تكمّل.
            </p>
          )}
          <Button className="w-full" disabled={!canCreate} onClick={() => setReview(true)}>
            مراجعة وإنشاء الطلب
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            إلغاء
          </Button>
        </aside>
      </div>

      {/* merchant picker */}
      {pickMerchant && (
        <Dialog
          open
          onOpenChange={(o) => !o && setPickMerchant(false)}
          title="اختر التاجر"
          size="md"
        >
          <MerchantPicker rows={merchants} onPick={addBasket} />
        </Dialog>
      )}

      {/* final review */}
      {review && (
        <Dialog open onOpenChange={(o) => !o && setReview(false)} title="مراجعة نهائية" size="md">
          <div className="space-y-2 text-sm">
            <Line2 k="العميل" v={`${name || 'بدون اسم'} — ${phone}`} />
            <Line2 k="العنوان" v={address} />
            {baskets.map((b) => (
              <div key={b.merchantId} className="rounded-lg border border-border p-2">
                <p className="font-bold">{b.merchantName}</p>
                {b.lines.map((l) => (
                  <p key={l.key} className="text-xs text-muted-foreground">
                    {l.quantity}× {l.nameAr}
                    {l.variantName ? ` (${l.variantName})` : ''} —{' '}
                    {formatMoney(l.unitPrice * l.quantity)}
                  </p>
                ))}
              </div>
            ))}
            <Line2
              k="رسوم التوصيل"
              v={
                feeLater
                  ? 'تُحدَّد لاحقاً'
                  : effectiveFee === null
                    ? '—'
                    : formatMoney(effectiveFee)
              }
            />
            {multiGroup &&
              groups.map((g) => {
                const drv = (drivers?.items ?? []).find(
                  (d: Row) => String(d.userId ?? d.id) === legDrivers[g.key],
                );
                return (
                  <Line2
                    key={g.key}
                    k={g.label}
                    v={`${formatMoney(g.fee)} — ${drv ? (drv.user?.name ?? drv.name ?? 'مندوب') : 'بدون مندوب'}`}
                  />
                );
              })}
            <Line2 k="طريقة الدفع" v={PAYMENTS.find((p) => p.key === payment)?.label ?? ''} />
            <Line2 k="الإجمالي" v={formatMoney(agreedNum ?? computed)} />

            {/* What the confirm button is about to send, before it is pressed —
                so the agent can promise it to the customer who is still on the
                line, instead of finding out from a toast afterwards. */}
            <div className="rounded-lg bg-muted/40 border border-border p-2.5 text-xs leading-relaxed">
              <p className="font-bold text-foreground mb-1">التأكيد هيبعت:</p>
              <p className="text-muted-foreground">
                • واتساب للعميل{driverId || multiGroup ? ' وللمندوب' : ''} ولجروب الإدارة
              </p>
              <p className="text-muted-foreground">
                •{' '}
                {email.trim() ? (
                  <>
                    الطلب بالتفصيل على <span dir="ltr">{email.trim()}</span>
                  </>
                ) : (
                  <span className="text-amber-700">
                    الإيميل مش هيتبعت — اكتب إيميل العميل فوق لو عايزه يوصله
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                تأكيد وإنشاء وإرسال
              </Button>
              <Button variant="ghost" onClick={() => setReview(false)} className="ms-auto">
                رجوع
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </Dialog>
  );
}

// ─── small pieces ──────────────────────────────────────────────────────
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof User;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border p-3 space-y-3">
      <p className="font-black text-brand-dark flex items-center gap-2">
        <Icon className="w-4 h-4 text-brand-red" />
        {title}
      </p>
      {children}
    </section>
  );
}

function Line2({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{k}</span>
      <span className="font-bold text-end break-words">{v}</span>
    </div>
  );
}

function ZoneSelect({
  label,
  value,
  rows,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  rows?: Row[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm disabled:bg-muted outline-none focus:border-brand-red"
      >
        <option value="">— اختر —</option>
        {(rows ?? []).map((r) => (
          <option key={r.id} value={r.id}>
            {r.nameAr}
          </option>
        ))}
      </select>
    </Field>
  );
}

function MerchantPicker({ rows, onPick }: { rows?: Row[]; onPick: (m: Row) => void }) {
  const [q, setQ] = useState('');
  const list = (rows ?? []).filter((m) =>
    `${m.storeNameAr ?? ''} ${m.storeName ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <div className="space-y-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ابحث عن تاجر…"
        autoFocus
      />
      <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
        {list.slice(0, 60).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m)}
            className="w-full text-start px-3 py-2 hover:bg-muted/50 text-sm font-bold"
          >
            {m.storeNameAr ?? m.storeName}
          </button>
        ))}
        {list.length === 0 && <p className="p-3 text-sm text-muted-foreground">لا توجد نتائج</p>}
      </div>
    </div>
  );
}

/** One store's card: product search scoped to it, its lines, and its subtotal. */
function MerchantBasket({
  basket,
  onRemove,
  onChange,
}: {
  basket: Basket;
  onRemove: () => void;
  onChange: (fn: (b: Basket) => Basket) => void;
}) {
  const [q, setQ] = useState('');
  const [deb, setDeb] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDeb(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Only this store's menu — searching the whole catalogue is how the wrong
  // shop's item ends up on an order.
  const { data: products } = useQuery({
    queryKey: ['manual-order', 'products', basket.merchantId, deb],
    queryFn: () =>
      api.adminListProducts({
        merchantId: basket.merchantId,
        search: deb || undefined,
        pageSize: 20,
        isAvailable: true,
      }),
    enabled: deb.length >= 1,
  });
  const hits = (products?.items ?? []) as Row[];

  const [optionsFor, setOptionsFor] = useState<Row | null>(null);

  const addLine = (l: Line) => onChange((b) => ({ ...b, lines: [...b.lines, l] }));
  const patchLine = (key: string, patch: Partial<Line>) =>
    onChange((b) => ({
      ...b,
      lines: b.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }));

  const subtotal = basket.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  return (
    <div className="rounded-xl border border-border p-3 space-y-3 bg-card">
      <div className="flex items-center gap-2">
        <Store className="w-4 h-4 text-brand-red" />
        <p className="font-black flex-1">{basket.merchantName}</p>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث في منيو التاجر… (مثال: بيتزا)"
          className="ps-9"
        />
        {deb && hits.length > 0 && (
          <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-white shadow-lg divide-y divide-border">
            {hits.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setOptionsFor(p);
                  setQ('');
                }}
                className="w-full text-start px-3 py-2 hover:bg-muted/50 text-sm flex items-center gap-2"
              >
                <span className="flex-1 font-bold truncate">{p.nameAr}</span>
                <span className="text-brand-red font-bold">{formatMoney(Number(p.price))}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {basket.lines.map((l) => (
        <div key={l.key} className="rounded-lg border border-border p-2 space-y-2">
          <div className="flex items-center gap-2">
            {/* A line off the menu is fixed — its name and price come from the
                catalogue and must not drift. A free-text line has neither yet,
                and used to render as unchangeable text, so "صنف يدوي — 0 ج.م"
                was the only thing it could ever be. */}
            {l.productId ? (
              <span className="flex-1 font-bold text-sm">
                {l.nameAr}
                {l.variantName ? (
                  <span className="text-muted-foreground"> — {l.variantName}</span>
                ) : null}
              </span>
            ) : (
              <Input
                value={l.nameAr}
                onChange={(e) => patchLine(l.key, { nameAr: e.target.value })}
                placeholder="اسم الصنف (مثال: طلب فول)"
                className={cn('flex-1', !l.nameAr.trim() && 'border-amber-400')}
              />
            )}
            <Input
              type="number"
              min="1"
              dir="ltr"
              value={String(l.quantity)}
              onChange={(e) =>
                patchLine(l.key, { quantity: Math.max(1, Number(e.target.value) || 1) })
              }
              className="w-16"
            />
            {l.productId ? (
              <span className="w-24 text-end font-bold">
                {formatMoney(l.unitPrice * l.quantity)}
              </span>
            ) : (
              <Input
                type="number"
                min="0"
                step="0.5"
                dir="ltr"
                value={l.unitPrice ? String(l.unitPrice) : ''}
                onChange={(e) => patchLine(l.key, { unitPrice: Number(e.target.value) || 0 })}
                placeholder="السعر"
                className={cn('w-24', !(l.unitPrice > 0) && 'border-amber-400')}
              />
            )}
            <button
              type="button"
              onClick={() =>
                onChange((b) => ({ ...b, lines: b.lines.filter((x) => x.key !== l.key) }))
              }
              className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {l.addonNames.length > 0 && (
            <p className="text-[11px] text-muted-foreground">إضافات: {l.addonNames.join('، ')}</p>
          )}
          <Input
            value={l.notes}
            onChange={(e) => patchLine(l.key, { notes: e.target.value })}
            placeholder="ملاحظة على الصنف (بدون بصل…)"
          />
        </div>
      ))}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            addLine({
              key: uid(),
              productId: null,
              nameAr: '',
              unitPrice: 0,
              quantity: 1,
              notes: '',
              addonIds: [],
              addonNames: [],
            })
          }
          className="text-xs font-bold text-brand-red hover:underline"
        >
          + إضافة منتج غير موجود
        </button>
        <span className="text-sm font-black">{formatMoney(subtotal)}</span>
      </div>

      {optionsFor && (
        <ProductOptionsDialog
          product={optionsFor}
          onClose={() => setOptionsFor(null)}
          onAdd={(line) => {
            addLine(line);
            setOptionsFor(null);
          }}
        />
      )}
    </div>
  );
}

/** Size + extras for one product. Mirrors the server's rule: a size REPLACES
 *  the base price, extras ADD to it — so the preview matches what is charged. */
function ProductOptionsDialog({
  product,
  onClose,
  onAdd,
}: {
  product: Row;
  onClose: () => void;
  onAdd: (l: Line) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['manual-order', 'options', product.id],
    queryFn: () => api.adminGetProductOptions(product.id) as Promise<Row>,
  });

  const variants: Row[] = (data?.variants ?? []).filter((v: Row) => v.isActive !== false);
  const linked: string[] = data?.linkedAddonIds ?? [];
  const addons: Row[] = (data?.merchantAddons ?? []).filter((a: Row) => linked.includes(a.id));

  const [variantId, setVariantId] = useState<string>('');
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [qty, setQty] = useState('1');

  useEffect(() => {
    if (variants.length && !variantId) setVariantId(String(variants[0].id));
  }, [variants, variantId]);

  const base = Number(product.price) || 0;
  const chosen = variants.find((v) => String(v.id) === variantId);
  const unit =
    (chosen ? Number(chosen.price) || 0 : base) +
    addons.filter((a) => addonIds.includes(a.id)).reduce((s, a) => s + (Number(a.price) || 0), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={product.nameAr} size="sm">
      {isLoading ? (
        <div className="h-24 rounded-lg bg-muted animate-pulse" />
      ) : (
        <div className="space-y-3">
          {variants.length > 0 && (
            <Field label="الحجم">
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariantId(String(v.id))}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-bold border transition',
                      String(v.id) === variantId
                        ? 'bg-brand-red text-white border-brand-red'
                        : 'bg-card border-border',
                    )}
                  >
                    {v.nameAr} — {formatMoney(Number(v.price))}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {addons.length > 0 && (
            <Field label="الإضافات">
              <div className="flex flex-wrap gap-2">
                {addons.map((a) => {
                  const on = addonIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() =>
                        setAddonIds((p) => (on ? p.filter((x) => x !== a.id) : [...p, a.id]))
                      }
                      className={cn(
                        'px-3 py-1.5 rounded-full text-sm font-bold border transition',
                        on ? 'bg-brand-red text-white border-brand-red' : 'bg-card border-border',
                      )}
                    >
                      {a.nameAr} +{formatMoney(Number(a.price))}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          <div className="flex items-end gap-2">
            <Field label="الكمية">
              <Input
                type="number"
                min="1"
                dir="ltr"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-20"
              />
            </Field>
            <p className="pb-2 font-black text-brand-red">
              {formatMoney(unit * (Number(qty) || 1))}
            </p>
          </div>

          <Button
            className="w-full"
            onClick={() =>
              onAdd({
                key: uid(),
                productId: product.id,
                nameAr: product.nameAr,
                unitPrice: unit,
                quantity: Math.max(1, Number(qty) || 1),
                notes: '',
                variantId: chosen ? String(chosen.id) : null,
                variantName: chosen ? String(chosen.nameAr) : null,
                addonIds,
                addonNames: addons
                  .filter((a) => addonIds.includes(a.id))
                  .map((a) => String(a.nameAr)),
              })
            }
          >
            <Plus className="w-4 h-4" />
            أضف للطلب
          </Button>
        </div>
      )}
    </Dialog>
  );
}
