/**
 * Tamem's real contact channels (mirror of apps/landing/src/config/contact.ts).
 *
 * These are the defaults. At runtime the mobile app fetches the same shape
 * from GET /settings/contacts so the admin can rotate numbers from the
 * dashboard without rebuilding the app — these consts are the cache /
 * offline fallback.
 */

export interface ContactLine {
  key: 'delivery1' | 'delivery2' | 'shipping' | 'support';
  phone: string;
  whatsapp: string;
  labelAr: string;
  descAr: string;
}

function wa(phone: string, message = ''): string {
  const digits = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

export const DEFAULT_CONTACTS: ContactLine[] = [
  {
    key: 'delivery1',
    phone: '+201070750167',
    whatsapp: wa('+201070750167', 'أهلاً، أريد طلب توصيل'),
    labelAr: 'خدمة الدليفري — خط 1',
    descAr: 'مطاعم، صيدليات، سوبر ماركت',
  },
  {
    key: 'delivery2',
    phone: '+201070750168',
    whatsapp: wa('+201070750168', 'أهلاً، أريد طلب توصيل'),
    labelAr: 'خدمة الدليفري — خط 2',
    descAr: 'خط بديل لخدمة التوصيل',
  },
  {
    key: 'shipping',
    phone: '+201070750165',
    whatsapp: wa('+201070750165', 'أهلاً، أريد طلب شحن'),
    labelAr: 'خدمة الشحن',
    descAr: 'الشحن بين المحافظات',
  },
  {
    key: 'support',
    phone: '+201070750169',
    whatsapp: wa('+201070750169', 'أهلاً، عندي شكوى/استفسار للإدارة'),
    labelAr: 'الشكاوى والإدارة',
    descAr: 'استفسارات وشكاوى',
  },
];

export const TAMEM_PRIMARY_PHONE = DEFAULT_CONTACTS[0]!.phone;
export const TAMEM_PRIMARY_WHATSAPP = DEFAULT_CONTACTS[0]!.whatsapp;
export const TAMEM_ADDRESS_AR = 'المقر الرئيسي — مدينة قفط، محافظة قنا';
