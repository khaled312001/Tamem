import { z } from 'zod';

const phoneRegex = /^(\+?20)?1[0125]\d{8}$/;

export const phoneSchema = z.string().trim().regex(phoneRegex, 'رقم هاتف مصري غير صحيح');

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
