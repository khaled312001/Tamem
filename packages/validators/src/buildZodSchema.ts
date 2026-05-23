import { z, type ZodTypeAny } from 'zod';

import { type ServiceField, ServiceFieldType } from '@tamem/types';

/**
 * Builds a zod schema dynamically from a Service's fields.
 * Used by the mobile DynamicForm and dashboard live preview to validate
 * admin-defined service forms without code changes.
 */
export function buildZodSchema(fields: ReadonlyArray<ServiceField>): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, ZodTypeAny> = {};

  for (const field of fields) {
    let schema = baseSchemaForType(field);

    if (field.validation) {
      schema = applyValidation(schema, field);
    }

    if (!field.isRequired) {
      schema = schema.optional();
    }

    shape[field.key] = schema;
  }

  return z.object(shape);
}

function baseSchemaForType(field: ServiceField): ZodTypeAny {
  switch (field.type) {
    case ServiceFieldType.TEXT:
    case ServiceFieldType.TEXTAREA:
      return z.string().trim();

    case ServiceFieldType.PHONE:
      return z
        .string()
        .trim()
        .regex(/^(\+?20)?1[0125]\d{8}$/, 'رقم هاتف غير صحيح');

    case ServiceFieldType.NUMBER:
      return z.number();

    case ServiceFieldType.BOOLEAN:
      return z.boolean();

    case ServiceFieldType.SELECT: {
      const values = (field.options ?? []).map((o): string => o.value);
      if (values.length === 0) return z.string();
      return z.enum(values as [string, ...string[]]);
    }

    case ServiceFieldType.MULTISELECT: {
      const values = (field.options ?? []).map((o): string => o.value);
      if (values.length === 0) return z.array(z.string());
      return z.array(z.enum(values as [string, ...string[]])).min(0);
    }

    case ServiceFieldType.IMAGE:
      return z.array(z.string().url());

    case ServiceFieldType.LOCATION:
      return z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        address: z.string().optional(),
      });

    case ServiceFieldType.DATE:
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صحيح');

    case ServiceFieldType.TIME:
      return z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'وقت غير صحيح');

    default:
      return z.unknown();
  }
}

function applyValidation(schema: ZodTypeAny, field: ServiceField): ZodTypeAny {
  const v = field.validation;
  if (!v) return schema;

  if (field.type === ServiceFieldType.TEXT || field.type === ServiceFieldType.TEXTAREA) {
    let s = schema as z.ZodString;
    if (v.minLength !== undefined) s = s.min(v.minLength);
    if (v.maxLength !== undefined) s = s.max(v.maxLength);
    if (v.regex) s = s.regex(new RegExp(v.regex));
    return s;
  }

  if (field.type === ServiceFieldType.NUMBER) {
    let s = schema as z.ZodNumber;
    if (v.min !== undefined) s = s.min(v.min);
    if (v.max !== undefined) s = s.max(v.max);
    return s;
  }

  if (field.type === ServiceFieldType.IMAGE && v.maxImages !== undefined) {
    return (schema as z.ZodArray<z.ZodString>).max(v.maxImages);
  }

  return schema;
}
