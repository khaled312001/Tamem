# الهوية البصرية — Brand Guidelines

> الهوية الرسمية لمنصة تميم للتوصيل. أي شاشة جديدة تلتزم بهذه المعايير.

---

## الألوان

| الاسم         | HEX       | الاستخدام                                       |
| ------------- | --------- | ----------------------------------------------- |
| **أحمر تميم** | `#E0301E` | اللون الرئيسي · الأزرار الأساسية · الـ branding |
| **برتقالي**   | `#EC7A2C` | اللون الثانوي · accents · شارات                 |
| **ذهبي**      | `#F2A93B` | تأكيدات · highlights · شعارات gold              |
| **رمادي**     | `#58595B` | نصوص ثانوية · أيقونات                           |
| **داكن**      | `#241310` | خلفيات داكنة · نصوص main · splash               |

### Status Colors (لحالات الطلب الـ 12)

| الحالة                     | لون                      |
| -------------------------- | ------------------------ |
| NEW                        | `#3B82F6` (أزرق)         |
| UNDER_REVIEW               | `#8B5CF6` (بنفسجي)       |
| PRICED                     | `#0EA5E9` (سماوي)        |
| AWAITING_CUSTOMER_APPROVAL | `#EAB308` (أصفر)         |
| ACCEPTED                   | `#10B981` (أخضر فاتح)    |
| DRIVER_ASSIGNED            | `#06B6D4` (turquoise)    |
| PICKED_UP                  | `#14B8A6` (teal)         |
| IN_ROUTE                   | `#F59E0B` (برتقالي زاهي) |
| DELIVERED                  | `#22C55E` (أخضر)         |
| COMPLETED                  | `#16A34A` (أخضر داكن)    |
| CANCELLED                  | `#71717A` (رمادي)        |
| REJECTED                   | `#EF4444` (أحمر)         |

---

## الخطوط (Typography)

| المستوى         | الخط    | الوزن         | الاستخدام           |
| --------------- | ------- | ------------- | ------------------- |
| Display (H1)    | Cairo   | 900 Black     | عناوين صفحات رئيسية |
| Heading (H2-H3) | Cairo   | 800 ExtraBold | عناوين أقسام        |
| Subheading      | Tajawal | 800 ExtraBold | عناوين فرعية        |
| Body            | Tajawal | 400 Regular   | نصوص عادية          |
| Bold body       | Tajawal | 700 Bold      | تأكيد نصي           |

### تحميل الخطوط

- **Web (Dashboard + Landing):** Google Fonts CDN في `<head>`
  ```html
  https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800;900&family=Tajawal:wght@400;500;700;800&display=swap
  ```
- **Mobile (RN):** تحميل عبر `expo-font` في `App.tsx` (سيُضاف في Phase 2)

---

## الاتجاه (RTL)

- **اللغة الأساسية:** عربي (RTL)
- **اللغة الثانية (Phase 3):** إنجليزي (LTR)
- Mobile: `I18nManager.forceRTL(true)` في `App.tsx`
- Web: `<html dir="rtl" lang="ar">`
- في CSS/Tailwind: استخدم `paddingStart`/`paddingEnd` و `marginStart`/`marginEnd` بدلاً من `left/right`

---

## الـ Spacing & Radii

### Spacing

```
xs:  4px   sm: 8px    md: 12px   lg: 16px   xl: 24px   xxl: 32px
```

### Border Radius

```
sm: 6px    md: 10px   lg: 14px   xl: 20px   pill: 999px (للأزرار الدائرية)
```

---

## استخدام اللوجو

- **شكل اللوجو:** حرف "ت" أبيض داخل مربع بألوان tamem (red→orange→gold gradient أو red فقط)
- **الحجم الأدنى:** 40×40px
- **مسافة آمنة (safe area):** على الأقل 50% من حجم اللوجو
- **خلفيات مسموحة:** أبيض، داكن (`#241310`), أحمر (`#E0301E`)
- **ممنوع:** تشويه النسب، إضافة ظل ثقيل، تغيير ألوان اللوجو

---

## مبادئ التصميم

1. **Mobile-first:** كل شاشة تُصمَّم للموبايل أولاً، ثم تتكيف
2. **Touch-friendly:** أهداف اللمس ≥ 44×44px
3. **Clarity over decoration:** الوظيفة قبل الزخرفة
4. **Arabic typography first:** التباعد والسطور تُختار لتلائم العربية أولاً
5. **Accessible contrast:** نسبة تباين ≥ 4.5:1 للنصوص العادية، ≥ 3:1 للنصوص الكبيرة

---

## المصادر التقنية

- **Tokens مشتركة:** `packages/ui-kit/src/tokens.ts` (للويب) + `apps/mobile/src/theme/tokens.ts` (للموبايل)
- **Tailwind Preset:** `packages/ui-kit/src/tailwind-preset.ts` — يُستخدم في Dashboard و Landing
- **Shadcn CSS variables:** `apps/dashboard/src/styles/globals.css`
