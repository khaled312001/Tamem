import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input } from '../components/ui/Input.js';
import { TableSkeleton } from '../components/ui/Skeleton.js';
import {
  DynamicFormPreview,
  type PreviewField,
} from '../features/dynamic-form/DynamicFormPreview.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceRow = any;

const CATEGORIES = [
  { value: 'DELIVERY', label: 'دليفري' },
  { value: 'SHIPPING', label: 'شحن' },
  { value: 'MERCHANT', label: 'تاجر / موزّع' },
];

const PRICING_METHODS = [
  { value: 'FIXED', label: 'سعر ثابت' },
  { value: 'DISTANCE', label: 'حسب المسافة' },
  { value: 'WEIGHT', label: 'حسب الوزن' },
  { value: 'DISTANCE_WEIGHT', label: 'مسافة + وزن' },
  { value: 'QUOTE', label: 'تسعير يدوي (Quote)' },
];

const FIELD_TYPES = [
  { value: 'TEXT', label: 'نص قصير' },
  { value: 'TEXTAREA', label: 'نص طويل' },
  { value: 'NUMBER', label: 'رقم' },
  { value: 'SELECT', label: 'قائمة منسدلة' },
  { value: 'MULTISELECT', label: 'قائمة متعددة' },
  { value: 'IMAGE', label: 'صورة' },
  { value: 'LOCATION', label: 'موقع' },
  { value: 'DATE', label: 'تاريخ' },
  { value: 'TIME', label: 'وقت' },
  { value: 'BOOLEAN', label: 'نعم / لا' },
  { value: 'PHONE', label: 'رقم هاتف' },
];

interface ServiceForm {
  key: string;
  name: string;
  nameAr: string;
  category: string;
  pricingMethod: string;
  basePrice?: number;
  pricePerKm?: number;
  pricePerKg?: number;
  requiresPickupLocation: boolean;
  requiresDeliveryLocation: boolean;
  requiresImageUpload: boolean;
  allowsTextNote: boolean;
  supportsMultiplePickups: boolean;
  supportsMultipleDeliveries: boolean;
  isActive: boolean;
}

const blankForm = (): ServiceForm => ({
  key: '',
  name: '',
  nameAr: '',
  category: 'DELIVERY',
  pricingMethod: 'FIXED',
  basePrice: 0,
  requiresPickupLocation: false,
  requiresDeliveryLocation: true,
  requiresImageUpload: false,
  allowsTextNote: true,
  supportsMultiplePickups: false,
  supportsMultipleDeliveries: false,
  isActive: true,
});

export function ServiceEditPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: service, isLoading } = useQuery({
    queryKey: ['admin', 'service', id],
    queryFn: () => api.adminGetService(id!) as Promise<ServiceRow>,
    enabled: !!id,
  });

  const [form, setForm] = useState<ServiceForm>(blankForm());
  const [editingField, setEditingField] = useState<PreviewField | null>(null);

  useEffect(() => {
    if (service) {
      setForm({
        key: service.key,
        name: service.name,
        nameAr: service.nameAr,
        category: service.category,
        pricingMethod: service.pricingMethod,
        basePrice: service.basePrice ? Number(service.basePrice) : undefined,
        pricePerKm: service.pricePerKm ? Number(service.pricePerKm) : undefined,
        pricePerKg: service.pricePerKg ? Number(service.pricePerKg) : undefined,
        requiresPickupLocation: service.requiresPickupLocation,
        requiresDeliveryLocation: service.requiresDeliveryLocation,
        requiresImageUpload: service.requiresImageUpload,
        allowsTextNote: service.allowsTextNote,
        supportsMultiplePickups: service.supportsMultiplePickups,
        supportsMultipleDeliveries: service.supportsMultipleDeliveries,
        isActive: service.isActive,
      });
    }
  }, [service]);

  const fields: PreviewField[] = useMemo(
    () => (service?.fields ?? []) as PreviewField[],
    [service],
  );

  const saveMut = useMutation({
    mutationFn: () => (isNew ? api.adminCreateService(form) : api.adminUpdateService(id!, form)),
    onSuccess: (res) => {
      toast.success(isNew ? 'تم إنشاء الخدمة' : 'تم الحفظ');
      qc.invalidateQueries({ queryKey: ['admin', 'services'] });
      if (isNew) {
        const newId = (res as ServiceRow)?.id;
        if (newId) navigate(`/services/${newId}/edit`, { replace: true });
      } else {
        qc.invalidateQueries({ queryKey: ['admin', 'service', id] });
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addFieldMut = useMutation({
    mutationFn: (payload: PreviewField) => api.adminAddServiceField(id!, payload),
    onSuccess: () => {
      toast.success('تمت إضافة الحقل');
      qc.invalidateQueries({ queryKey: ['admin', 'service', id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateFieldMut = useMutation({
    mutationFn: ({ fieldId, payload }: { fieldId: string; payload: PreviewField }) =>
      api.adminUpdateServiceField(id!, fieldId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'service', id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteFieldMut = useMutation({
    mutationFn: (fieldId: string) => api.adminDeleteServiceField(id!, fieldId),
    onSuccess: () => {
      toast.success('تم حذف الحقل');
      qc.invalidateQueries({ queryKey: ['admin', 'service', id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reorderFieldsMut = useMutation({
    mutationFn: (fieldIds: string[]) => api.adminReorderServiceFields(id!, fieldIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'service', id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const moveField = (idx: number, dir: -1 | 1) => {
    const next = [...fields];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    reorderFieldsMut.mutate(next.map((f) => f.id!).filter(Boolean));
  };

  if (id && isLoading) {
    return <TableSkeleton rows={6} cols={2} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-brand-dark">
          {isNew ? 'خدمة جديدة' : `تعديل: ${form.nameAr || form.name}`}
        </h1>
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          حفظ
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Form column (40%) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-border rounded-xl p-5 space-y-4">
            <h2 className="font-bold">معلومات الخدمة</h2>
            <Field label="المفتاح (Key)" required hint="استخدم حروف صغيرة و -">
              <Input
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                disabled={!isNew}
                dir="ltr"
                placeholder="delivery-pharmacy"
              />
            </Field>
            <Field label="الاسم بالعربية" required>
              <Input
                value={form.nameAr}
                onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                placeholder="مثال: توصيل صيدلية"
              />
            </Field>
            <Field label="الاسم بالإنجليزية" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                dir="ltr"
                placeholder="Pharmacy Delivery"
              />
            </Field>
            <Field label="التصنيف" required>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="طريقة التسعير" required>
              <select
                value={form.pricingMethod}
                onChange={(e) => setForm({ ...form, pricingMethod: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
              >
                {PRICING_METHODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            {form.pricingMethod !== 'QUOTE' && (
              <Field label="السعر الأساسي (ج.م)">
                <Input
                  type="number"
                  value={form.basePrice ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      basePrice: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </Field>
            )}
            {(form.pricingMethod === 'DISTANCE' || form.pricingMethod === 'DISTANCE_WEIGHT') && (
              <Field label="السعر لكل كم">
                <Input
                  type="number"
                  value={form.pricePerKm ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      pricePerKm: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </Field>
            )}
            {(form.pricingMethod === 'WEIGHT' || form.pricingMethod === 'DISTANCE_WEIGHT') && (
              <Field label="السعر لكل كجم">
                <Input
                  type="number"
                  value={form.pricePerKg ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      pricePerKg: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </Field>
            )}
          </div>

          <div className="bg-white border border-border rounded-xl p-5 space-y-2">
            <h2 className="font-bold">خيارات الخدمة</h2>
            <Toggle
              label="موقع استلام مطلوب"
              checked={form.requiresPickupLocation}
              onChange={(v) => setForm({ ...form, requiresPickupLocation: v })}
            />
            <Toggle
              label="موقع توصيل مطلوب"
              checked={form.requiresDeliveryLocation}
              onChange={(v) => setForm({ ...form, requiresDeliveryLocation: v })}
            />
            <Toggle
              label="صور مطلوبة"
              checked={form.requiresImageUpload}
              onChange={(v) => setForm({ ...form, requiresImageUpload: v })}
            />
            <Toggle
              label="السماح بنص حر"
              checked={form.allowsTextNote}
              onChange={(v) => setForm({ ...form, allowsTextNote: v })}
            />
            <Toggle
              label="نقاط استلام متعددة"
              checked={form.supportsMultiplePickups}
              onChange={(v) => setForm({ ...form, supportsMultiplePickups: v })}
            />
            <Toggle
              label="نقاط توصيل متعددة"
              checked={form.supportsMultipleDeliveries}
              onChange={(v) => setForm({ ...form, supportsMultipleDeliveries: v })}
            />
            <Toggle
              label="نشطة (تظهر في الموبايل)"
              checked={form.isActive}
              onChange={(v) => setForm({ ...form, isActive: v })}
            />
          </div>
        </div>

        {/* Middle column: fields editor (40%) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold">الحقول الديناميكية</h2>
              {!isNew && (
                <Button size="sm" onClick={() => setEditingField({} as PreviewField)}>
                  <Plus className="w-4 h-4" />
                  حقل
                </Button>
              )}
            </div>
            {isNew ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                احفظ الخدمة أولاً لإضافة الحقول
              </div>
            ) : fields.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                لا توجد حقول. أضف حقلاً لاستقبال بيانات إضافية من العميل.
              </div>
            ) : (
              <div className="space-y-2">
                {fields.map((f, idx) => (
                  <div
                    key={f.id}
                    className="border border-border rounded-lg p-3 flex items-start gap-3"
                  >
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => moveField(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 hover:bg-muted rounded disabled:opacity-30"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => moveField(idx, 1)}
                        disabled={idx === fields.length - 1}
                        className="p-1 hover:bg-muted rounded disabled:opacity-30"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-sm">{f.labelAr}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.key} · <Badge>{f.type}</Badge>{' '}
                        {f.isRequired && <Badge variant="warning">مطلوب</Badge>}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEditingField(f)}>
                      تعديل
                    </Button>
                    <button
                      onClick={() => f.id && deleteFieldMut.mutate(f.id)}
                      className="p-2 hover:bg-destructive/10 rounded text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Live Preview column */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-border rounded-xl p-5 sticky top-4">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4" />
              <h2 className="font-bold text-sm">معاينة حية (موبايل)</h2>
            </div>
            <DynamicFormPreview fields={fields} />
          </div>
        </div>
      </div>

      {editingField && (
        <FieldEditorDialog
          field={editingField}
          onClose={() => setEditingField(null)}
          onSave={(payload) => {
            if (editingField.id) {
              updateFieldMut.mutate({ fieldId: editingField.id, payload });
            } else {
              addFieldMut.mutate(payload);
            }
            setEditingField(null);
          }}
        />
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between py-1 cursor-pointer">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4"
      />
    </label>
  );
}

function FieldEditorDialog({
  field,
  onSave,
  onClose,
}: {
  field: PreviewField;
  onSave: (f: PreviewField) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PreviewField>({
    key: field.key ?? '',
    label: field.label ?? '',
    labelAr: field.labelAr ?? '',
    type: field.type ?? 'TEXT',
    isRequired: field.isRequired ?? false,
    placeholderAr: field.placeholderAr,
    helpTextAr: field.helpTextAr,
    options: field.options ?? [],
    validation: field.validation,
  });
  const needsOptions = draft.type === 'SELECT' || draft.type === 'MULTISELECT';

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={field.id ? 'تعديل حقل' : 'حقل جديد'}
      size="lg"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="المفتاح" required hint="حروف صغيرة وأرقام و _">
          <Input
            value={draft.key}
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
            dir="ltr"
            disabled={!!field.id}
          />
        </Field>
        <Field label="النوع" required>
          <select
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="التسمية (ع)" required>
          <Input
            value={draft.labelAr}
            onChange={(e) => setDraft({ ...draft, labelAr: e.target.value })}
          />
        </Field>
        <Field label="التسمية (En)" required>
          <Input
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            dir="ltr"
          />
        </Field>
        <Field label="Placeholder (ع)">
          <Input
            value={draft.placeholderAr ?? ''}
            onChange={(e) => setDraft({ ...draft, placeholderAr: e.target.value })}
          />
        </Field>
        <Field label="نص مساعد (ع)">
          <Input
            value={draft.helpTextAr ?? ''}
            onChange={(e) => setDraft({ ...draft, helpTextAr: e.target.value })}
          />
        </Field>
      </div>

      <Toggle
        label="حقل مطلوب"
        checked={!!draft.isRequired}
        onChange={(v) => setDraft({ ...draft, isRequired: v })}
      />

      {needsOptions && (
        <div className="mt-3 space-y-2">
          <div className="text-sm font-bold">الخيارات</div>
          {(draft.options ?? []).map((opt, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={opt.value}
                placeholder="value"
                onChange={(e) => {
                  const next = [...(draft.options ?? [])];
                  next[i] = { ...next[i]!, value: e.target.value };
                  setDraft({ ...draft, options: next });
                }}
                className="flex-1"
                dir="ltr"
              />
              <Input
                value={opt.labelAr ?? ''}
                placeholder="التسمية بالعربية"
                onChange={(e) => {
                  const next = [...(draft.options ?? [])];
                  next[i] = { ...next[i]!, labelAr: e.target.value };
                  setDraft({ ...draft, options: next });
                }}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = (draft.options ?? []).filter((_, j) => j !== i);
                  setDraft({ ...draft, options: next });
                }}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft({
                ...draft,
                options: [...(draft.options ?? []), { value: '', label: '', labelAr: '' }],
              })
            }
          >
            <Plus className="w-3 h-3" />
            خيار
          </Button>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="md" onClick={onClose}>
          إلغاء
        </Button>
        <Button
          onClick={() => onSave(draft)}
          disabled={!draft.key || !draft.labelAr || !draft.label}
        >
          حفظ الحقل
        </Button>
      </div>
    </Dialog>
  );
}
