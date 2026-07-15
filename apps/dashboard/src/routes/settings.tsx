import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Lock, MapPin, Plus, Save, Sliders, User as UserIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Field, Input } from '../components/ui/Input.js';
import { PhoneInput } from '../components/ui/PhoneInput.js';
import { CardSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import type { User } from '@tamem/types';

type TabKey = 'account' | 'system';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SettingRow = any;

// All known system settings — typed, labeled, with sensible inputs.
// Anything else from the backend renders as a generic key/value text input below.
type SettingKind = 'number' | 'text' | 'tel' | 'list';

const KNOWN_SETTINGS: {
  key: string;
  label: string;
  hint?: string;
  kind: SettingKind;
  unit?: string;
  itemPlaceholder?: string;
}[] = [
  {
    key: 'driver_cash_limit',
    label: 'حد الكاش الأقصى للسائق',
    hint: 'لما يفوت السائق دا، ينحظر استلام طلبات كاش',
    kind: 'number',
    unit: 'ج.م',
  },
  {
    key: 'order_pending_alert_minutes',
    label: 'تنبيه على الطلبات المعلقة بعد',
    hint: 'لو طلب فضل بدون مراجعة دقايق أكتر من كده، تنبيه تلقائي',
    kind: 'number',
    unit: 'دقيقة',
  },
  {
    key: 'driver_idle_alert_minutes',
    label: 'تنبيه على السائق الخامل بعد',
    hint: 'لو السائق متاح ومش بياخد طلب لمدة كده',
    kind: 'number',
    unit: 'دقيقة',
  },
  {
    key: 'cancellation_window_minutes',
    label: 'مهلة إلغاء العميل',
    hint: 'العميل يقدر يلغي الطلب طول ما لسه قبل المهلة دي',
    kind: 'number',
    unit: 'دقيقة',
  },
  {
    key: 'whatsapp_business_number',
    label: 'رقم WhatsApp الرسمي',
    hint: 'مع كود الدولة، مثلاً +201010254819',
    kind: 'tel',
  },
  {
    key: 'service_areas',
    label: 'المناطق المدعومة للخدمة',
    hint: 'اكتب اسم المنطقة واضغط Enter لإضافتها',
    kind: 'list',
    itemPlaceholder: 'مثال: قفط',
  },
];

export function SettingsPage() {
  const [tab, setTab] = useState<TabKey>('account');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-brand-dark">الإعدادات</h1>

      <div className="bg-white rounded-xl border border-border p-2 inline-flex gap-1">
        <TabButton active={tab === 'account'} onClick={() => setTab('account')}>
          <UserIcon className="w-4 h-4" /> حسابي
        </TabButton>
        <TabButton active={tab === 'system'} onClick={() => setTab('system')}>
          <Sliders className="w-4 h-4" /> إعدادات النظام
        </TabButton>
      </div>

      {tab === 'account' ? <AccountSection /> : <SystemSection />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition ${
        active ? 'bg-brand-red text-white font-bold' : 'hover:bg-muted'
      }`}
    >
      {children}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Account section
// ────────────────────────────────────────────────────────────────────────────────

function AccountSection() {
  const qc = useQueryClient();
  const setUser = useAuth((s) => s.setUser);

  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me() as Promise<User & { email?: string }>,
  });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (me) {
      setName(me.name ?? '');
      setPhone(me.phone ?? '');
      setEmail(me.email ?? '');
    }
  }, [me]);

  const profileMut = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = {};
      if (name.trim() && name !== me?.name) body.name = name.trim();
      if (phone.trim() && phone !== me?.phone) body.phone = phone.trim();
      if (email.trim() && email !== me?.email) body.email = email.trim();
      if (Object.keys(body).length === 0) return Promise.resolve(me as User);
      return api.updateMe(body);
    },
    onSuccess: (updated) => {
      if (updated) setUser(updated as User);
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('تم تحديث بياناتك');
    },
    onError: (err: Error) => toast.error(err.message || 'فشل التحديث'),
  });

  // Password
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const passMut = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      toast.success('تم تغيير كلمة السر بنجاح');
      setCurrent('');
      setNext('');
      setConfirm('');
    },
    onError: (err: Error) => toast.error(err.message || 'فشل التغيير'),
  });

  const passwordReady = current.length >= 1 && next.length >= 8 && next === confirm;

  if (isLoading) return <CardSkeleton />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
      {/* Profile card */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-10 h-10 rounded-full bg-brand-red/10 grid place-items-center">
            <UserIcon className="w-5 h-5 text-brand-red" />
          </div>
          <div>
            <div className="font-bold">بياناتي الشخصية</div>
            <div className="text-xs text-muted-foreground">الاسم، الهاتف، والإيميل</div>
          </div>
        </div>

        <Field label="الاسم">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسمك بالكامل"
          />
        </Field>

        <Field label="رقم الهاتف" hint="اكتب الرقم بدون كود الدولة — مثال: 01010254819">
          <PhoneInput value={phone} onChange={setPhone} />
        </Field>

        <Field label="البريد الإلكتروني" hint="اختياري — يُستخدم لاستعادة كلمة السر">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            dir="ltr"
            type="email"
          />
        </Field>

        <div className="flex justify-end pt-2">
          <Button onClick={() => profileMut.mutate()} disabled={profileMut.isPending}>
            <Save className="w-4 h-4" /> حفظ التغييرات
          </Button>
        </div>
      </div>

      {/* Password card */}
      <div className="bg-white rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-10 h-10 rounded-full bg-brand-red/10 grid place-items-center">
            <Lock className="w-5 h-5 text-brand-red" />
          </div>
          <div>
            <div className="font-bold">تغيير كلمة السر</div>
            <div className="text-xs text-muted-foreground">8 أحرف على الأقل</div>
          </div>
        </div>

        <Field label="كلمة السر الحالية">
          <div className="relative">
            <Input
              type={showCurrent ? 'text' : 'password'}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="••••••••"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((p) => !p)}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>

        <Field label="كلمة السر الجديدة">
          <div className="relative">
            <Input
              type={showNext ? 'text' : 'password'}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="••••••••"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowNext((p) => !p)}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>

        <Field
          label="تأكيد كلمة السر الجديدة"
          hint={next && confirm && next !== confirm ? 'الكلمتان غير متطابقتين' : undefined}
        >
          <Input
            type={showNext ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            dir="ltr"
          />
        </Field>

        <div className="flex justify-end pt-2">
          <Button onClick={() => passMut.mutate()} disabled={!passwordReady || passMut.isPending}>
            <Lock className="w-4 h-4" /> تغيير كلمة السر
          </Button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// System settings section
// ────────────────────────────────────────────────────────────────────────────────

function SystemSection() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.adminListSettings() as Promise<SettingRow[]>,
  });

  // draftScalar — for number/text/tel; draftList — for list kind
  const [draftScalar, setDraftScalar] = useState<Record<string, string>>({});
  const [draftList, setDraftList] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!settings) return;
    const scalars: Record<string, string> = {};
    const lists: Record<string, string[]> = {};
    for (const s of settings) {
      if (Array.isArray(s.value)) {
        lists[s.key] = s.value.map(String);
      } else if (typeof s.value === 'string') {
        scalars[s.key] = s.value;
      } else {
        scalars[s.key] = JSON.stringify(s.value);
      }
    }
    setDraftScalar(scalars);
    setDraftList(lists);
  }, [settings]);

  const mut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      api.adminUpsertSetting(key, value),
    onSuccess: (_d, vars) => {
      toast.success('تم الحفظ');
      setDirty((d) => ({ ...d, [vars.key]: false }));
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (err: Error) => toast.error(err.message || 'فشل الحفظ'),
  });

  const knownKeys = new Set(KNOWN_SETTINGS.map((k) => k.key));
  const unknownSettings = settings?.filter((s) => !knownKeys.has(s.key)) ?? [];

  if (isLoading) return <CardSkeleton />;

  const onScalarChange = (key: string, value: string) => {
    setDraftScalar((d) => ({ ...d, [key]: value }));
    setDirty((d) => ({ ...d, [key]: true }));
  };
  const onListChange = (key: string, items: string[]) => {
    setDraftList((d) => ({ ...d, [key]: items }));
    setDirty((d) => ({ ...d, [key]: true }));
  };
  const saveScalar = (key: string, kind: SettingKind) => {
    const raw = draftScalar[key] ?? '';
    let value: unknown = raw;
    if (kind === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        toast.error('قيمة رقمية غير صحيحة');
        return;
      }
      value = n;
    }
    mut.mutate({ key, value });
  };
  const saveList = (key: string) => mut.mutate({ key, value: draftList[key] ?? [] });

  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-5 max-w-3xl">
      <div className="flex items-center gap-3 pb-3 border-b border-border">
        <div className="w-10 h-10 rounded-full bg-brand-red/10 grid place-items-center">
          <Sliders className="w-5 h-5 text-brand-red" />
        </div>
        <div>
          <div className="font-bold">إعدادات النظام</div>
          <div className="text-xs text-muted-foreground">
            تتحكم في كيفية عمل التنبيهات والمهل والحدود
          </div>
        </div>
      </div>

      {KNOWN_SETTINGS.map((k) => {
        if (k.kind === 'list') {
          return (
            <Field key={k.key} label={k.label} hint={k.hint}>
              <ChipsEditor
                items={draftList[k.key] ?? []}
                placeholder={k.itemPlaceholder ?? 'اكتب واضغط Enter'}
                onChange={(items) => onListChange(k.key, items)}
                onSave={() => saveList(k.key)}
                dirty={!!dirty[k.key]}
                saving={mut.isPending}
              />
            </Field>
          );
        }

        const exists = settings?.find((s) => s.key === k.key);
        return (
          <Field key={k.key} label={k.label} hint={k.hint}>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Input
                  type={k.kind === 'number' ? 'number' : k.kind === 'tel' ? 'tel' : 'text'}
                  value={draftScalar[k.key] ?? ''}
                  onChange={(e) => onScalarChange(k.key, e.target.value)}
                  placeholder={!exists ? '— لم يُضبط بعد —' : ''}
                  dir={k.kind === 'tel' ? 'ltr' : undefined}
                  className={k.unit ? 'pl-12' : undefined}
                />
                {k.unit && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    {k.unit}
                  </span>
                )}
              </div>
              <Button
                onClick={() => saveScalar(k.key, k.kind)}
                disabled={mut.isPending || !dirty[k.key]}
                variant={dirty[k.key] ? 'primary' : 'outline'}
                title="حفظ"
              >
                <Save className="w-4 h-4" />
              </Button>
            </div>
          </Field>
        );
      })}

      {unknownSettings.length > 0 && (
        <>
          <div className="pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground mb-3">إعدادات متقدمة</div>
          </div>
          {unknownSettings.map((s) => (
            <Field key={s.key} label={s.key} hint={s.description ?? undefined}>
              <div className="flex gap-2">
                <Input
                  value={draftScalar[s.key] ?? ''}
                  onChange={(e) => onScalarChange(s.key, e.target.value)}
                />
                <Button
                  onClick={() => saveScalar(s.key, 'text')}
                  disabled={mut.isPending || !dirty[s.key]}
                  variant={dirty[s.key] ? 'primary' : 'outline'}
                >
                  <Save className="w-4 h-4" />
                </Button>
              </div>
            </Field>
          ))}
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// ChipsEditor — for list/array settings. No more raw JSON typing.
// ────────────────────────────────────────────────────────────────────────────────

function ChipsEditor({
  items,
  placeholder,
  onChange,
  onSave,
  dirty,
  saving,
}: {
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
  onSave: () => void;
  dirty: boolean;
  saving: boolean;
}) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.includes(v)) {
      toast.warning('موجود بالفعل');
      setDraft('');
      return;
    }
    onChange([...items, v]);
    setDraft('');
  };
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 min-h-[2.5rem] p-2 border border-border rounded-lg bg-muted/30">
        {items.length === 0 && (
          <span className="text-xs text-muted-foreground self-center">لا يوجد عناصر بعد</span>
        )}
        {items.map((it, i) => (
          <span
            key={`${it}-${i}`}
            className="inline-flex items-center gap-1 bg-brand-red/10 text-brand-red px-2 py-1 rounded-full text-sm font-bold"
          >
            <MapPin className="w-3 h-3" />
            {it}
            <button
              type="button"
              onClick={() => remove(i)}
              className="ml-1 p-0.5 rounded hover:bg-brand-red/20"
              aria-label={`حذف ${it}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Input
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Backspace' && draft === '' && items.length > 0) {
                onChange(items.slice(0, -1));
              }
            }}
          />
        </div>
        <Button type="button" variant="outline" onClick={commit} disabled={!draft.trim()}>
          <Plus className="w-4 h-4" /> إضافة
        </Button>
        <Button
          onClick={onSave}
          disabled={!dirty || saving}
          variant={dirty ? 'primary' : 'outline'}
        >
          <Save className="w-4 h-4" /> حفظ القائمة
        </Button>
      </div>
    </div>
  );
}
