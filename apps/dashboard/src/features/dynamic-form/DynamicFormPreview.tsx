/**
 * Web preview of the mobile DynamicForm. Same field types render here so the admin
 * sees exactly what the customer will see in the app while editing the Service Builder.
 */
import { Field, Input, Textarea } from '../../components/ui/Input.js';

export interface PreviewField {
  id?: string;
  key: string;
  label: string;
  labelAr: string;
  type: string;
  isRequired?: boolean;
  placeholder?: string;
  placeholderAr?: string;
  helpTextAr?: string;
  options?: Array<{ value: string; label?: string; labelAr?: string }>;
  validation?: Record<string, unknown>;
}

export function DynamicFormPreview({ fields }: { fields: PreviewField[] }) {
  if (fields.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground border-2 border-dashed border-border rounded-xl">
        لا توجد حقول بعد — أضف حقلاً لتشاهد المعاينة هنا.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {fields.map((f, i) => (
        <Field
          key={f.id ?? `${f.key}-${i}`}
          label={f.labelAr || f.label || f.key}
          required={f.isRequired}
          hint={f.helpTextAr}
        >
          <FieldInput field={f} />
        </Field>
      ))}
    </div>
  );
}

function FieldInput({ field }: { field: PreviewField }) {
  switch (field.type) {
    case 'TEXTAREA':
      return <Textarea rows={3} placeholder={field.placeholderAr ?? field.placeholder} disabled />;
    case 'NUMBER':
      return (
        <Input
          type="number"
          placeholder={field.placeholderAr ?? field.placeholder ?? '0'}
          disabled
        />
      );
    case 'SELECT':
      return (
        <select
          disabled
          className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
        >
          <option>— اختر —</option>
          {(field.options ?? []).map((o, i) => (
            <option key={i} value={o.value}>
              {o.labelAr ?? o.label ?? o.value}
            </option>
          ))}
        </select>
      );
    case 'MULTISELECT':
      return (
        <div className="space-y-1">
          {(field.options ?? []).map((o, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled />
              <span>{o.labelAr ?? o.label ?? o.value}</span>
            </label>
          ))}
        </div>
      );
    case 'BOOLEAN':
      return (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" disabled />
          <span>نعم</span>
        </label>
      );
    case 'DATE':
      return <Input type="date" disabled />;
    case 'TIME':
      return <Input type="time" disabled />;
    case 'PHONE':
      return <Input type="tel" placeholder="+201XXXXXXXXX" dir="ltr" disabled />;
    case 'IMAGE':
      return (
        <div className="p-4 border-2 border-dashed border-border rounded-lg text-center text-xs text-muted-foreground">
          📷 رفع صورة (حتى {(field.validation?.maxImages as number | undefined) ?? 5})
        </div>
      );
    case 'LOCATION':
      return (
        <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground text-center">
          📍 اختر من الخريطة
        </div>
      );
    case 'TEXT':
    default:
      return <Input type="text" placeholder={field.placeholderAr ?? field.placeholder} disabled />;
  }
}
