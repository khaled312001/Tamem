import { zodResolver } from '@hookform/resolvers/zod';
import { type Control, type FieldErrors, type FieldValues, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { type ServiceField, ServiceFieldType } from '@tamem/types';
import { buildZodSchema } from '@tamem/validators';

import {
  BooleanFieldInput,
  DateFieldInput,
  ImageFieldInput,
  LocationFieldInput,
  NumberFieldInput,
  PhoneFieldInput,
  SelectFieldInput,
  TextAreaFieldInput,
  TextFieldInput,
  TimeFieldInput,
} from './fields';

export interface DynamicFormHandle {
  submit: () => void;
  values: FieldValues;
}

interface DynamicFormProps {
  fields: ReadonlyArray<ServiceField>;
  onSubmit: (values: FieldValues) => void | Promise<void>;
  onChange?: (values: FieldValues) => void;
  formRef?: (handle: DynamicFormHandle) => void;
}

/**
 * Renders any admin-defined service form using the central field registry.
 * Validation comes from `buildZodSchema(fields)` so backend + dashboard preview
 * + mobile all share one source of truth.
 */
export function DynamicForm({ fields, onSubmit, onChange, formRef }: DynamicFormProps) {
  const schema = buildZodSchema(fields);
  const { control, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
  });

  if (onChange) {
    watch((vals) => onChange(vals));
  }

  if (formRef) {
    formRef({
      submit: handleSubmit(onSubmit),
      values: watch(),
    });
  }

  return (
    <View>
      {fields.map((f) => (
        <FieldRenderer
          key={f.id}
          field={f}
          control={control as unknown as Control<FieldValues>}
          errors={formState.errors as FieldErrors<FieldValues>}
        />
      ))}
    </View>
  );
}

function FieldRenderer({
  field,
  control,
  errors,
}: {
  field: ServiceField;
  control: Control<FieldValues>;
  errors: FieldErrors<FieldValues>;
}) {
  const props = { field, control, errors };
  switch (field.type) {
    case ServiceFieldType.TEXT:
      return <TextFieldInput {...props} />;
    case ServiceFieldType.TEXTAREA:
      return <TextAreaFieldInput {...props} />;
    case ServiceFieldType.NUMBER:
      return <NumberFieldInput {...props} />;
    case ServiceFieldType.PHONE:
      return <PhoneFieldInput {...props} />;
    case ServiceFieldType.BOOLEAN:
      return <BooleanFieldInput {...props} />;
    case ServiceFieldType.SELECT:
    case ServiceFieldType.MULTISELECT:
      return <SelectFieldInput {...props} />;
    case ServiceFieldType.IMAGE:
      return <ImageFieldInput {...props} />;
    case ServiceFieldType.LOCATION:
      return <LocationFieldInput {...props} />;
    case ServiceFieldType.DATE:
      return <DateFieldInput {...props} />;
    case ServiceFieldType.TIME:
      return <TimeFieldInput {...props} />;
    default:
      return null;
  }
}
