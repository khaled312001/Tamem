/**
 * النصوص اللي الإدارة بتعدّلها من الداشبورد — الأسئلة الشائعة، مواعيد الدعم،
 * محاور صفحة «عن تَميم»، وشريط الإعلانات.
 *
 * اللي هنا افتراضي/أوفلاين بس. وقت التشغيل التطبيق بيجيب نفس الشكل من
 * GET /app-content (زي ما بيعمل مع /settings/contacts)، فتغيير أي نص بيحصل
 * من لوحة الإدارة من غير نسخة جديدة على المتجر.
 *
 * القيم دي لازم تفضل مطابقة لـ appContentDefaults() في
 * apps/backend/dist-bundle/api.php — دي النسخة المرجعية.
 */

export interface Faq {
  q: string;
  a: string;
}

export interface AboutPillar {
  titleAr: string;
  bodyAr: string;
}

export interface Announcement {
  enabled: boolean;
  titleAr: string;
  bodyAr: string;
  variant: 'info' | 'warn';
}

export interface AppContent {
  supportHoursAr: string;
  workingHoursAr: string;
  supportEmail: string;
  websiteUrl: string;
  aboutTaglineAr: string;
  faqs: Faq[];
  pillars: AboutPillar[];
  announcement: Announcement;
}

export const DEFAULT_APP_CONTENT: AppContent = {
  supportHoursAr: 'فريق تميم متاح يومياً من 10 ص حتى 1 بعد منتصف الليل',
  workingHoursAr: 'كل يوم من 10 صباحاً إلى 1 بعد منتصف الليل',
  supportEmail: 'info@deliverytamem.com',
  websiteUrl: 'https://deliverytamem.com',
  aboutTaglineAr: 'منصة التوصيل والشحن في قفط',
  faqs: [
    {
      q: 'كم يستغرق الطلب للوصول؟',
      a: 'الطلبات الداخل قفط بتوصل خلال 30-45 دقيقة. الشحن بين المناطق ياخد من 2-6 ساعات حسب المسافة.',
    },
    {
      q: 'إيه طرق الدفع المتاحة؟',
      a: 'كاش عند الاستلام، فودافون كاش، إنستا باي. الدفع بالبطاقة قريباً.',
    },
    {
      q: 'هل أقدر ألغي الطلب؟',
      a: 'تقدر تلغي الطلب طول ما لسه ما اتأكدش من السائق. بعد كده تواصل مع الإدارة.',
    },
    {
      q: 'إزاي أتابع طلبي؟',
      a: 'افتح «طلباتي» واضغط على الطلب — هتشوف الحالة الحالية وكل التحديثات.',
    },
  ],
  pillars: [
    {
      titleAr: 'سرعة موثوقة',
      bodyAr:
        'توصيل داخل قفط خلال 30 دقيقة، وشحن بين المحافظات في يومه. نختار أقرب سائق متاح لطلبك تلقائياً.',
    },
    {
      titleAr: 'أمان وضمان',
      bodyAr:
        'كل طلب مؤمَّن بالكامل. السائقون موثّقون بهويات وطنية، وفي حالة أي مشكلة الإدارة جاهزة على واتساب.',
    },
    {
      titleAr: 'مكافآت الولاء',
      bodyAr: 'احصل على 5% من قيمة كل طلب في محفظتك كنقاط ولاء، تُستخدم في طلباتك القادمة.',
    },
    {
      titleAr: 'تجربة عربية أصيلة',
      bodyAr:
        'صُمِّم التطبيق من الصفر للمستخدم العربي — لا ترجمة، لا اقتباس. واجهة سلسة وردود إدارة بلهجتك.',
    },
  ],
  announcement: { enabled: false, titleAr: '', bodyAr: '', variant: 'info' },
};
