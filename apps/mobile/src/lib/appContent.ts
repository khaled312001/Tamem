import { useQuery } from '@tanstack/react-query';

import { DEFAULT_APP_CONTENT, type AppContent } from '../config/appContent';
import { api } from './api';

/**
 * محتوى التطبيق القابل للتعديل من الداشبورد.
 *
 * نفس فكرة useContacts: كل النصوص اللي الإدارة محتاجة تغيّرها (الأسئلة
 * الشائعة، مواعيد الدعم، محاور «عن تَميم»، شريط إعلان) بتيجي من
 * GET /app-content، و DEFAULT_APP_CONTENT احتياطي أوفلاين.
 *
 * الـ endpoint نفسه مكاش على السيرفر 5 دقايق عشان ما يستهلكش سقف الاتصالات،
 * فالتعديل من اللوحة بيظهر في التطبيق خلال 5 دقايق بالكتير (الحفظ بيمسح
 * الكاش فوراً، والباقي هو staleTime بتاع العميل هنا).
 */
export function useAppContent(): AppContent {
  const { data } = useQuery<Partial<AppContent>>({
    queryKey: ['app-content'],
    queryFn: () => api.raw.get('/app-content').then((r) => r.data.data),
    staleTime: 30 * 60_000,
  });

  // Field by field, not a spread: the server may answer with an older or
  // partial shape and a missing key must fall back, not render blank.
  // Lists are the exception — an empty list from the server is the admin
  // having deleted every row, which the screens honour by collapsing.
  return {
    supportHoursAr: data?.supportHoursAr || DEFAULT_APP_CONTENT.supportHoursAr,
    workingHoursAr: data?.workingHoursAr || DEFAULT_APP_CONTENT.workingHoursAr,
    supportEmail: data?.supportEmail || DEFAULT_APP_CONTENT.supportEmail,
    websiteUrl: data?.websiteUrl || DEFAULT_APP_CONTENT.websiteUrl,
    aboutTaglineAr: data?.aboutTaglineAr || DEFAULT_APP_CONTENT.aboutTaglineAr,
    faqs: Array.isArray(data?.faqs) ? data.faqs : DEFAULT_APP_CONTENT.faqs,
    pillars: Array.isArray(data?.pillars) ? data.pillars : DEFAULT_APP_CONTENT.pillars,
    announcement: data?.announcement?.enabled
      ? data.announcement
      : DEFAULT_APP_CONTENT.announcement,
  };
}
