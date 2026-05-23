# Phase 2 Handoff — تطبيق العميل + customer-side backend

> **خالد سلّم Phase 2 — تطبيق العميل وكل backend الخاص بالعميل + الربط مع داشبورد أحمد.**
> الحالة: 44/44 backend tests passing · mobile + backend typecheck clean · جاهز للتكامل مع Phase 1.

---

## ما تم بناؤه

### 🔌 Backend — customer-side endpoints

| Endpoint                  | Method    | الوصف                                                       |
| ------------------------- | --------- | ----------------------------------------------------------- |
| `/auth/register`          | POST      | تسجيل عميل جديد (role=CUSTOMER)                             |
| `/auth/login`             | POST      | دخول بـ phone + password                                    |
| `/auth/google`            | POST      | Google OAuth (graceful بدون credentials)                    |
| `/auth/otp/request`       | POST      | طلب OTP (stub — أي 6 أرقام تبدأ بـ 1)                       |
| `/auth/otp/verify`        | POST      | تأكيد OTP + إصدار tokens                                    |
| `/auth/refresh`           | POST      | تجديد access + refresh مع rotation                          |
| `/auth/logout`            | POST      | إلغاء refresh token                                         |
| `/me`                     | GET/PATCH | بيانات الـ user + تحديث                                     |
| `/me/fcm-token`           | POST      | تسجيل Expo push token                                       |
| `/services`               | GET       | كل الخدمات النشطة (public)                                  |
| `/services/:id`           | GET       | خدمة + fields (للـ DynamicForm)                             |
| `/categories`             | GET       | كل التصنيفات (public)                                       |
| `/merchants`              | GET       | بحث + فلتر بـ lat/lng/radius                                |
| `/merchants/:id`          | GET       | تفاصيل تاجر + منتجاته + openHours                           |
| `/merchants/:id/products` | GET       | منتجات التاجر                                               |
| `/offers`                 | GET       | البانرات النشطة                                             |
| `/orders`                 | POST      | إنشاء طلب (discriminated union: DELIVERY/SHIPPING/MERCHANT) |
| `/orders/mine`            | GET       | طلباتي + filter بالحالة                                     |
| `/orders/:id`             | GET       | تفاصيل (ownership check)                                    |
| `/orders/:id/approve`     | POST      | الموافقة على السعر                                          |
| `/orders/:id/cancel`      | POST      | إلغاء بـ reason                                             |
| `/pricing/estimate`       | POST      | حساب السعر (Haversine + surcharges)                         |
| `/uploads`                | POST      | رفع صورة (multer + sharp 1600px JPEG q85)                   |

### 📱 Mobile screens (تطابق `docs/brief/design-tamem.html` بدقة)

| Screen                 | الميزات                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Splash**             | Gradient 4 stops (red→dark)، لوجو مع pulsing gold glow، animated dots، TAMEM + DELIVERY brand text                  |
| **Login**              | IconField (Phone/Lock)، GradientButton، Google placeholder، link to Register                                        |
| **Register**           | 5 IconFields (User/Phone/MapPin/Home/Lock)، hint card، Hook Form + zod validation                                   |
| **OtpVerify**          | 6 خانات منفصلة مع auto-advance + RTL ordering، resend cooldown 30s                                                  |
| **Home**               | GradientHeader + search + offers banner + 3 service cards بـ gradient icons + top merchants live + dark promo strip |
| **StoresList**         | filter chips + search + cards مع rating/distance/open status                                                        |
| **NearbyMap**          | react-native-maps Google + user location + merchant pins + bottom sheet                                             |
| **MerchantDetail**     | cover + info card + products list + sticky "اطلب الآن"                                                              |
| **DynamicServiceFlow** | يعرض أي خدمة admin-defined عبر DynamicForm، live pricing preview، WhatsApp confirmation                             |
| **MyOrders**           | tabs (current/completed)، status badges بألوان semantic، pull-to-refresh                                            |
| **OrderTracking**      | placeholder حالياً — يحتاج Phase 3 (driver app + GPS)                                                               |
| **Profile**            | avatar + stats row + grouped rows + logout confirmation                                                             |
| **Notifications**      | empty state branded                                                                                                 |

### 🧩 Mobile shared components

- `IconField` — input بـ leading icon (تطابق `.pfield`)
- `GradientButton` — brand / gold / outline variants
- `GradientHeader` — top brand bar مع greeting + location + bell
- `DynamicForm` — orchestrator يستخدم `buildZodSchema` من `@tamem/validators`
- `DynamicForm/fields.tsx` — 10 field renderers (TEXT, TEXTAREA, NUMBER, PHONE, BOOLEAN, SELECT, IMAGE, LOCATION, DATE, TIME)

### 🎨 Design system match

تم نسخ الـ palette الدافئ من `docs/brief/design-tamem.html`:

- Surface `#FCF8F4`, soft `#F7EFE7`, line `#F0E4DA`, ink `#2B2622`
- Gradients: brand (red→orange)، brandGold (orange→gold)، splash (red→dark)
- Fonts: Cairo (400/700/800/900) + Tajawal (400/500/700/800) عبر `@expo-google-fonts/*`

### 🔔 Push Notifications

`lib/push.ts`:

- يطلب permission تلقائياً بعد login (في `RootNavigator`)
- Android channel مخصص بلون Tamem (`#E0301E`)
- يسجل Expo push token عبر `POST /me/fcm-token`

### 💬 WhatsApp Integration

- Mobile: `lib/whatsapp.ts` يفتح WhatsApp deep-link بعد إنشاء الطلب
- Backend: `integrations/whatsapp.ts` يدعم Cloud API (gracefully no-op بدون credentials)

### 🔄 Realtime (Socket.IO)

`realtime/channels.ts` — helpers: `emitNewOrder`, `emitOrderStatusChange`, `emitNewAlert`

- Customer mobile سيستلم events على room `user:{userId}` + `order:{orderId}` (يحتاج wiring في OrderTracking screen في Phase 3)

---

## ما لم يُبنى (للـ Phase 3 المشترك أو ما بعد الإطلاق)

| Feature                                          | السبب                                                               | الأولوية    |
| ------------------------------------------------ | ------------------------------------------------------------------- | ----------- |
| Order Tracking screen كامل                       | يحتاج driver location + GPS realtime                                | Phase 3     |
| Repeaters (PickupPoints/DeliveryPoints/Products) | merchant order يعمل من backend، لكن mobile UI للـ multi-points مؤجل | Post-launch |
| Edit Profile screen                              | placeholder — استخدم backend `PATCH /me`                            | Post-launch |
| Saved Addresses CRUD                             | لا يوجد schema model له بعد                                         | Post-launch |
| Landing page                                     | Phase 3 المشترك                                                     |             |
| EAS Build / Play Store submission                | Phase 3 المشترك                                                     |             |

---

## كيفية اختبار end-to-end الآن

1. **Backend:** `pnpm --filter @tamem/backend dev` (port 4000)
2. **Mobile:** `pnpm --filter @tamem/mobile dev` (Expo)
3. **Dashboard** (شغل أحمد): `pnpm --filter @tamem/dashboard dev` (port 5173)

**User journey:**

1. سجّل عميل جديد من الموبايل → استلم OTP code (أي رقم 6 أرقام يبدأ بـ 1 يعمل) → دخول
2. Home → اختر خدمة → املأ DynamicForm → اضغط "تأكيد الطلب"
3. WhatsApp يفتح بنفسه برسالة تأكيد جاهزة
4. الطلب يظهر في dashboard `/admin/orders` (شغل أحمد)
5. الـ admin يضغط "تسعير" → الموبايل (في تبويب "طلباتي") سيرى الـ status badge `PRICED`
6. عميل يضغط "الموافقة" → الطلب يصبح `ACCEPTED`
7. admin يعيّن سائق ويغير الحالات حتى `DELIVERED` → `COMPLETED`

---

## ⚠️ ملاحظات لـ Phase 3 (الاثنان معاً)

### Conflicts متوقعة

- `apps/backend/src/app.ts`: خالد أضاف routes (orders/pricing/uploads/catalog). أحمد سيضيف admin routes. الـ merge آمن (سطور مختلفة).
- `apps/backend/openapi.yaml`: خالد أضاف customer endpoints، أحمد يضيف /admin/\*. آمن.
- `apps/backend/src/realtime/channels.ts`: خالد أنشأه، أحمد سيستهلكه. آمن.

### Schema غير معدّل

لم أعدّل `prisma/schema.prisma`. كل الـ fields التي احتجتها كانت موجودة من Day 1.

### Backend دمج

- خالد أضاف 4 modules: `catalog/`, `orders/orders.customer.controller.ts`, `uploads/`, integrations (`whatsapp.ts`)
- أحمد سيضيف: `orders/orders.admin.controller.ts`, `drivers/`, `merchants/`, `products/`, `pricing/` (rules), `payments/`, `alerts/`, `reports/`, `settings/`

### Known gotchas

1. **Customer auth وقت الـ Google OAuth:** يحتاج GOOGLE_CLIENT_ID في .env — placeholder حالياً
2. **WhatsApp Cloud API:** يحتاج credentials Meta — gracefully no-op بدونها (mobile deep-link الـ primary)
3. **Pricing estimate لـ DISTANCE يستخدم Haversine** (تقريب). تبديل لـ Google Distance Matrix في Phase 3 لو احتجنا دقة.
4. **OrderTracking screen** placeholder — لما يتبني driver app، نضيف هنا live map + status timeline live

---

## 📊 الإحصائيات

- **Files added (Phase 2):** ~25 file
- **Backend tests:** 44/44 passing
- **TypeScript:** نظيف على mobile + backend + كل packages
- **Dependencies added:** `@expo-google-fonts/cairo`, `@expo-google-fonts/tajawal`, `expo-font`, `expo-linear-gradient`, `expo-haptics`, `lucide-react-native`, `react-native-svg`, `google-auth-library`

---

**خالد · مايو 2026 · Phase 2 Complete ✅**
