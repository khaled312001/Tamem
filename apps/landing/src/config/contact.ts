/**
 * Single source of truth for Tamem's real contact channels.
 *
 * All components in apps/landing/src/components/* import from here so
 * a phone-number rotation is one edit, not a search-and-replace across
 * the codebase. Each entry exposes:
 *   - phone: the dial-able phone (E.164 with +20 country prefix)
 *   - whatsapp: a wa.me link pre-built with the international format
 *   - label / labelAr: rendering copy
 *
 * If a new line is added, follow the same shape and the chips
 * components will pick it up via the contacts array iteration.
 */

export interface ContactLine {
  key: 'delivery1' | 'delivery2' | 'shipping' | 'support';
  /** E.164 phone, e.g. "+201070750167" */
  phone: string;
  /** wa.me link pre-built */
  whatsapp: string;
  labelAr: string;
  descAr: string;
}

function wa(phone: string, message = ''): string {
  const digits = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

export const TAMEM_CONTACTS: ContactLine[] = [
  {
    key: 'delivery1',
    phone: '+201070750167',
    whatsapp: wa('+201070750167', 'أهلاً، أريد طلب توصيل'),
    labelAr: 'خدمة الدليفري — خط 1',
    descAr: 'طلبات داخل المدينة (مطاعم، صيدليات، سوبر ماركت)',
  },
  {
    key: 'delivery2',
    phone: '+201070750168',
    whatsapp: wa('+201070750168', 'أهلاً، أريد طلب توصيل'),
    labelAr: 'خدمة الدليفري — خط 2',
    descAr: 'خط بديل لخدمة التوصيل داخل المدينة',
  },
  {
    key: 'shipping',
    phone: '+201070750165',
    whatsapp: wa('+201070750165', 'أهلاً، أريد طلب شحن'),
    labelAr: 'خدمة الشحن',
    descAr: 'الشحن بين المحافظات والمناطق',
  },
  {
    key: 'support',
    phone: '+201070750169',
    whatsapp: wa('+201070750169', 'أهلاً، عندي شكوى/استفسار للإدارة'),
    labelAr: 'الشكاوى والتواصل مع الإدارة',
    descAr: 'لأي استفسار أو شكوى أو تواصل إداري',
  },
];

/** Primary general-purpose WhatsApp (delivery line 1). Used by callers that
 *  only need a single contact point (Hero CTAs, sign-up flows). */
export const TAMEM_PRIMARY_PHONE = TAMEM_CONTACTS[0].phone;
export const TAMEM_PRIMARY_WHATSAPP = TAMEM_CONTACTS[0].whatsapp;

// Qift is a markaz, not a madina — the owner's own wording, and the form that
// matches how people actually search for it locally.
export const TAMEM_ADDRESS_AR = 'المقر الرئيسي — مركز قفط، محافظة قنا';
