import { useQuery } from '@tanstack/react-query';

import { DEFAULT_CONTACTS, type ContactLine } from '../config/contact';
import { api } from './api';

/**
 * أرقام التواصل — مصدرها السيرفر، مش مبنية جوه التطبيق.
 *
 * قبل كده الرقم كان بييجي من متغيّر بيتحقن وقت البناء، فتغيير رقم واحد كان
 * معناه نسخة جديدة على المتجر وانتظار الناس تحدّث — وفضل رقم شخصي شغال شهور
 * على زراير «تواصل مع الإدارة». دلوقتي بييجي من GET /settings/contacts،
 * واللستة المكتوبة في config/contact هي احتياطي أوفلاين بس.
 */
interface ContactsResponse {
  lines: ContactLine[];
  primaryPhone: string;
  supportWhatsapp: string;
  addressAr?: string;
  email?: string;
}

const FALLBACK: ContactsResponse = {
  lines: DEFAULT_CONTACTS,
  primaryPhone: DEFAULT_CONTACTS[0]!.phone,
  supportWhatsapp: DEFAULT_CONTACTS.find((c) => c.key === 'support')!.phone,
};

export function useContacts(): ContactsResponse {
  const { data } = useQuery<ContactsResponse>({
    queryKey: ['settings-contacts'],
    queryFn: () => api.raw.get('/settings/contacts').then((r) => r.data.data),
    // Numbers change on the order of months; a stale hour is fine and keeps
    // this off the shared-hosting connection budget.
    staleTime: 60 * 60_000,
  });
  const lines = data?.lines?.length ? data.lines : FALLBACK.lines;
  return {
    lines,
    primaryPhone: data?.primaryPhone || FALLBACK.primaryPhone,
    supportWhatsapp: data?.supportWhatsapp || FALLBACK.supportWhatsapp,
    addressAr: data?.addressAr,
    email: data?.email,
  };
}

/** رقم واتساب الإدارة — اللي أزرار الشكوى والاستفسار بتفتح عليه. */
export function useSupportWhatsapp(): string {
  return useContacts().supportWhatsapp;
}

/** يبني لينك واتساب برسالة جاهزة. */
export function waLink(phone: string, message: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
