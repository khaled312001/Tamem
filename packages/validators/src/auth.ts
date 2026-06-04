import { z } from 'zod';

// Egyptian mobile numbers — accept all three formats the customer might type
// and normalize to E.164 (`+20XXXXXXXXXX`) so the DB only ever stores one
// canonical shape. Without this, a user who registers as `01060049287`
// could never log in as `+201060049287` and we'd ship duplicate accounts.
//
// Accepted inputs:
//   1060049287          raw 10-digit
//   01060049287         local format (leading zero — what people actually type)
//   201060049287        country code, no plus
//   +201060049287       full E.164
// Carriers covered: 10 (Vodafone), 11 (Etisalat), 12 (Orange), 15 (WE).
const phoneRegex = /^(?:\+?20|0)?(1[0125]\d{8})$/;

export const phoneSchema = z
  .string()
  .trim()
  // Strip everything the user might type for readability (spaces, dashes, etc.)
  // BEFORE we hit the regex, so "010 6004 9287" still validates.
  .transform((v) => v.replace(/[\s\-()]/g, ''))
  .refine((v) => phoneRegex.test(v), 'رقم هاتف مصري غير صحيح')
  // Single canonical form — `+20` followed by the 10-digit subscriber number.
  .transform((v) => `+20${v.match(phoneRegex)![1]}`);

export const passwordSchema = z.string().min(8, 'كلمة المرور 8 أحرف على الأقل').max(72);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: phoneSchema,
  password: passwordSchema,
  city: z.string().trim().min(2).max(100),
  address: z.string().trim().max(255).optional(),
});

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1),
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(10),
});

export const otpRequestSchema = z.object({
  phone: phoneSchema,
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{4,6}$/, 'كود التحقق يجب أن يكون 4-6 أرقام'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
