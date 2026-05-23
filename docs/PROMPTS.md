# برومبتات Claude Code — خطة تنفيذ تميم للتوصيل

> **كيف تستخدم هذا الملف:**
> كل مهمة هي **برومبت جاهز** تنسخه وتلصقه في Claude Code (داخل مجلد المشروع `e:/Tamem/`).
> Claude Code سينفّذ المهمة بناءً على الهيكل الموجود والـ stack المعتمد.
>
> **قبل بداية أي مهمة:** افتح terminal في `e:/Tamem/`، تأكّد من تشغيل `pnpm install`، ثم انسخ البرومبت.
>
> **القواعد الذهبية (تنطبق على كل برومبت):**
>
> 1. التزم بـ stack المشروع: Node + Express + Prisma + MySQL (Backend) · React Native + Expo (Mobile) · React + Vite + Tailwind + shadcn/ui (Dashboard) · Astro (Landing)
> 2. اتّبع نظام الألوان من [BRAND.md](BRAND.md) — أحمر `#E0301E`، برتقالي `#EC7A2C`، ذهبي `#F2A93B`، رمادي `#58595B`، داكن `#241310`
> 3. الخطوط: Cairo للعناوين · Tajawal للنصوص · RTL إجباري
> 4. كل تغيير لـ API contract يبدأ من `apps/backend/openapi.yaml` ثم `pnpm gen:types`
> 5. كل تغيير في DB يبدأ من `apps/backend/prisma/schema.prisma` ثم `pnpm prisma:migrate`
> 6. كل state transition للطلبات يمر عبر `assertTransition()` في `apps/backend/src/modules/orders/transitions.ts`
> 7. الـ DynamicForm في الموبايل والـ Service Builder في الداشبورد يستخدمان نفس الـ `buildZodSchema()` من `@tamem/validators`

---

## تقسيم العمل

| المطور                        | المسؤوليات                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **أحمد كمال (Backend Lane)**  | `apps/backend/**`, `apps/landing/**`, `packages/shared-types/**`, `packages/validators/**`, `packages/api-client/**`, Prisma schema, openapi.yaml |
| **خالد أحمد (Frontend Lane)** | `apps/mobile/**`, `apps/dashboard/**`, `packages/ui-kit/**`                                                                                       |

---

# 📋 الجدول الزمني (30 يوم)

## Phase 0 — التحليل والتأسيس (أيام 1-5)

أحمد: أيام 1-5 (5 برومبتات)
خالد: أيام 1-5 (5 برومبتات)

## Phase 1 — Backend أساسي + Dashboard أولي (أيام 6-12)

أحمد: أيام 6-12 (7 برومبتات)
خالد: أيام 6-12 (7 برومبتات)

## Phase 2 — تطبيق العميل + تحصين Backend (أيام 13-20)

خالد: أيام 13-20 (8 برومبتات)
أحمد: أيام 13-20 (8 برومبتات)

## Phase 3 — إكمال Dashboard + النشر (أيام 21-26)

خالد: أيام 21-26 (6 برومبتات)
أحمد: أيام 21-26 (6 برومبتات)

## Phase 4 — QA والإطلاق (أيام 27-30)

الاثنان معاً (4 برومبتات)

---

# 🟦 Phase 0 — التأسيس (5 أيام)

## 👨‍💻 أحمد — يوم 1: تجهيز Repo و CI

**البرومبت:**

```
أنت في مشروع تميم للتوصيل (e:/Tamem/) - monorepo بـ pnpm + Turbo.

اقرأ docs/PROMPTS.md و docs/DECISIONS.md و README.md لفهم السياق.

المهمة اليوم (Phase 0 - Day 1 لأحمد):
1. تحقق من أن pnpm install يعمل بدون أخطاء
2. تحقق من أن `pnpm typecheck` يعمل على كل الـ packages
3. تحقق من تشغيل husky hooks (git commit يجب أن يشغّل lint-staged)
4. أنشئ `.github/CODEOWNERS` يحدد:
   - apps/backend/* و apps/landing/* و prisma/* و openapi.yaml = أحمد
   - apps/mobile/* و apps/dashboard/* و packages/ui-kit/* = خالد
   - باقي packages مشتركة
5. أنشئ `.github/workflows/preview-api.yml` يشغّل API على Vercel/Railway للـ PR (اختياري - استبدله بـ note لو معقّد)
6. أضف بادج CI في README.md
7. التزم commit بـ conventional: "chore(repo): finalize CI and CODEOWNERS"

لا تنشئ ملفات إضافية غير ضرورية. ابقَ في scope اليوم فقط.
```

---

## 👨‍💻 أحمد — يوم 2: Prisma Schema + Migrations + Seed

**البرومبت:**

```
سياق: e:/Tamem/ - مشروع تميم. اقرأ apps/backend/prisma/schema.prisma الموجود.

المهمة اليوم (Phase 0 - Day 2 لأحمد):
1. تأكد أن MySQL محلي يعمل (إن لم يكن، أرشد المستخدم بأمر docker-compose بسيط لرفع MySQL 8)
2. حدّث .env بـ DATABASE_URL الصحيح
3. شغّل `pnpm --filter @tamem/backend prisma:migrate --name init` لإنشاء الـ migrations
4. شغّل seed: `pnpm --filter @tamem/backend db:seed`
5. تحقق من Prisma Studio أن الجداول والبيانات الافتراضية موجودة
6. أضف 3 categories إضافية في seed (مغسلة، ورد، حلويات) و 2 services إضافية للتنويع
7. أضف اختبار وحدة في tests/seed.test.ts يتحقق أن seed لا يدبّل البيانات عند إعادة التشغيل
8. وثّق في docs/DECISIONS.md (ADR-007) أي قرار اتخذته بخصوص MySQL setup
9. commit: "feat(db): init prisma schema, migrations, and seed data"
```

---

## 👨‍💻 أحمد — يوم 3: Auth Module + JWT + RBAC

**البرومبت:**

```
سياق: e:/Tamem/apps/backend. apps/backend/src/modules/auth/* موجود كهيكل أولي.

المهمة اليوم (Phase 0 - Day 3 لأحمد):
1. أكمل apps/backend/src/modules/auth/auth.controller.ts:
   - تطبيق Google OAuth (POST /auth/google) باستخدام google-auth-library
   - تطبيق /me endpoint كامل (يجيب بيانات user من DB)
2. أنشئ apps/backend/src/modules/users/users.controller.ts:
   - GET /me - يرجع بيانات المستخدم الحالي
   - PATCH /me - تحديث بيانات (الاسم، العنوان، avatar)
3. سجّل routes في app.ts
4. أنشئ tests/auth.test.ts بـ supertest:
   - تسجيل عميل جديد ينجح
   - تسجيل دخول بكلمة مرور خاطئة يفشل
   - refresh token rotation يعمل
   - /me برمز غير صالح يعطي 401
5. تأكّد أن `pnpm test` يعدّي
6. حدّث openapi.yaml بـ /me و /auth/google
7. شغّل `pnpm gen:types` ووثّق في PR
8. commit: "feat(auth): complete auth module with Google OAuth and /me"
```

---

## 👨‍💻 أحمد — يوم 4: OpenAPI Spec + Swagger UI + Type Generation

**البرومبت:**

```
سياق: e:/Tamem/apps/backend/openapi.yaml موجود كهيكل أولي.

المهمة اليوم (Phase 0 - Day 4 لأحمد):
1. وسّع openapi.yaml ليغطي ALL endpoints الموجودة في خطة Phase 1:
   - Auth (register, login, refresh, logout, google, otp/request, otp/verify)
   - Services (GET list, GET by id with fields)
   - Categories (GET list)
   - Merchants (GET list, GET by id, GET products)
   - Offers (GET list)
   - Orders (POST create with discriminated union، GET mine، GET by id، POST approve، POST cancel)
   - Uploads (POST)
   - Pricing estimate (POST)
   - Admin: overview، orders CRUD، users CRUD، drivers، merchants، services + fields، products، pricing-rules، payments، alerts، reports، settings
2. استخدم schemas مشتركة (Order, User, Service) - لا تكرار
3. ركّب Swagger UI على /api/v1/docs:
   - npm i swagger-ui-express yaml
   - في app.ts: import yaml; const spec = yaml.parse(fs.readFileSync('openapi.yaml', 'utf8')); v1.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
4. شغّل `pnpm gen:types` وتأكد أن packages/shared-types/src/api/ مولّد
5. أنشئ apps/backend/scripts/check-contract.ts يتحقق أن كل route مسجل في Express موثق في openapi
6. أضف pre-commit hook يشغّل check-contract
7. commit: "feat(api): full openapi spec + swagger UI + contract check"
```

---

## 👨‍💻 أحمد — يوم 5: تجهيز Hostinger VPS + نشر Hello World

**البرومبت:**

```
سياق: e:/Tamem/docs/DEPLOYMENT.md يحتوي على دليل النشر.

المهمة اليوم (Phase 0 - Day 5 لأحمد):
1. اقرأ DEPLOYMENT.md بالكامل
2. أنشئ docs/DEPLOYMENT-RUNBOOK.md - checklist عملي لكل خطوة (لا شرح، فقط أوامر مع ✓):
   - [ ] adduser tamem
   - [ ] nvm install 20.11
   - [ ] mysql create db
   - [ ] git clone
   - [ ] pnpm install
   - [ ] prisma deploy
   - [ ] pm2 start
   - [ ] nginx config
   - [ ] certbot
3. أنشئ docker-compose.yml في الجذر للـ local dev (MySQL + Redis مستقبلاً)
4. أنشئ apps/backend/scripts/deploy.sh - سكربت bash يبني وينشر (للاستخدام من laptop عبر SSH)
5. أنشئ apps/backend/nginx.conf.example - مثال nginx config مع كل subdomains
6. حدّث README.md في الجذر بقسم "Production Deployment" يشير لـ DEPLOYMENT.md
7. commit: "docs(deploy): production runbook + docker-compose + deploy script"

ملاحظة: لا تنفذ النشر فعلياً - فقط جهّز الملفات. النشر الفعلي يكون يوم 22.
```

---

## 👨‍🎨 خالد — يوم 1: Figma — wireframes شاشات العميل 1-6

**البرومبت:**

```
سياق: e:/Tamem/. اقرأ docs/brief/02-ui-design.pdf (التصميم المبدئي) و docs/BRAND.md.

المهمة اليوم (Phase 0 - Day 1 لخالد):
1. هذه مهمة تصميم في Figma - ليست برمجة كاملة
2. في Figma، أنشئ ملف "تميم - Customer App" بهوية تميم (ألوان BRAND.md)
3. صمّم wireframes high-fidelity للشاشات 1-6:
   - Splash (01)
   - Login (02)
   - Register (03)
   - Home A - Services (04A)
   - Home B - Categories (04B)
   - Nearby Stores Map (04C)
4. استخدم Cairo للعناوين و Tajawal للنصوص
5. كل الشاشات RTL
6. صدّر screenshots وضعها في docs/design/customer-app/01-splash.png ... 06-nearby.png
7. أنشئ docs/design/README.md يصف كل شاشة في سطرين
8. commit: "design(mobile): high-fidelity wireframes screens 01-06"

ملاحظة: هذه مهمة بصرية - لا تكتب React Native كود اليوم.
```

---

## 👨‍🎨 خالد — يوم 2: Figma — شاشات العميل 7-12 + Dashboard wireframes

**البرومبت:**

```
سياق: نفس بيئة يوم 1.

المهمة اليوم (Phase 0 - Day 2 لخالد):
1. أكمل في Figma شاشات العميل 7-12:
   - Stores List (05)
   - Delivery Order (06)
   - Shipping Order (07)
   - Merchant Order (08)
   - Order Tracking (09)
   - My Orders + Profile (10-11)
   - WhatsApp Confirmation (12)
2. ابدأ Dashboard wireframes للشاشات الرئيسية:
   - Login
   - Overview
   - Orders Management
   - Service Builder (الأهم - drag-free design مع live preview)
3. صدّر إلى docs/design/customer-app/ و docs/design/dashboard/
4. حدّث docs/design/README.md
5. commit: "design(mobile+dashboard): all customer screens + initial dashboard wireframes"
```

---

## 👨‍🎨 خالد — يوم 3: Design System في Figma + تصدير الأيقونات

**البرومبت:**

```
سياق: نفس بيئة يوم 2.

المهمة اليوم (Phase 0 - Day 3 لخالد):
1. في Figma أنشئ صفحة "Design System":
   - Color palette (ألوان BRAND.md)
   - Typography scale (Cairo Black 900 → Tajawal Regular)
   - Components: Button (5 variants)، Input، Card، Badge، Status Pill (12 status colors)، Avatar، Switch
   - Spacing scale (4/8/12/16/24/32)
2. صدّر الأيقونات (delivery, shipping, merchant, store, driver) كـ SVG إلى:
   apps/mobile/src/assets/icons/
   apps/dashboard/src/assets/icons/
3. صدّر logo تميم (3 variants: على أبيض، على داكن، monochrome) إلى:
   apps/mobile/src/assets/logo/
   apps/dashboard/src/assets/logo/
   apps/landing/public/
4. صدّر splash image للموبايل (1024×1024) إلى apps/mobile/src/assets/splash.png
5. صدّر app icon (1024×1024) إلى apps/mobile/src/assets/icon.png
6. حدّث BRAND.md بأي tokens جديدة قررتها
7. commit: "design(system): figma design system + exported icons/logo/splash"
```

---

## 👨‍🎨 خالد — يوم 4: Dashboard high-fidelity كل الـ 12 قسم

**البرومبت:**

```
سياق: نفس بيئة يوم 3.

المهمة اليوم (Phase 0 - Day 4 لخالد):
أكمل Dashboard wireframes لكل الـ 12 قسم:
1. Overview (مع charts و KPIs)
2. Orders Management (table + filters)
3. Order Detail Drawer
4. Customers
5. Drivers (status badges)
6. Merchants
7. Services List
8. Service Builder ⭐ (الأهم - دقّة عالية)
9. Products
10. Pricing Rules
11. Payments (مع proof viewer)
12. Reports

بالإضافة:
- Alerts Center (مهم - مثل Overview لكن أحمر/طوارئ)
- Settings

صدّر كل شيء إلى docs/design/dashboard/
commit: "design(dashboard): high-fidelity all sections + alerts center"
```

---

## 👨‍🎨 خالد — يوم 5: مراجعة العميل + تعديلات

**البرومبت:**

```
سياق: نفس بيئة يوم 4.

المهمة اليوم (Phase 0 - Day 5):
1. صدّر PDF من Figma بكل الشاشات → docs/design/v1-client-review.pdf
2. حضّر اجتماع مع العميل (إدارة تميم) لمراجعة
3. سجّل الملاحظات في docs/design/feedback-v1.md
4. نفّذ التعديلات في Figma
5. صدّر PDF نهائي → docs/design/v2-approved.pdf
6. أنشئ docs/design/HANDOFF.md - وثيقة handoff لخالد نفسه (لما يبدأ يبرمج):
   - أبعاد الشاشات
   - الـ spacings الدقيقة
   - الـ animations المطلوبة
   - الـ states (loading, empty, error)
7. commit: "design(approved): v2 client-approved designs + handoff doc"
```

---

# 🟩 Phase 1 — Backend Core + Dashboard أولي (أيام 6-12)

## 👨‍💻 أحمد — يوم 6: Services CRUD + ServiceFields + Reorder

**البرومبت:**

```
سياق: e:/Tamem/apps/backend. ابدأ Phase 1.

المهمة اليوم (يوم 6):
apps/backend/src/modules/services/* يحتوي على هيكل أولي. أكمله:
1. تحقق أن كل CRUD يعمل (list, get, create, update, soft-delete)
2. أكمل reorder fields - في transaction واحد
3. أضف validation: لا يمكن حذف خدمة لها orders نشطة (status != COMPLETED/CANCELLED/REJECTED)
4. أضف endpoint POST /admin/services/:id/duplicate - يستنسخ خدمة مع كل fields
5. اكتب tests/services.test.ts بـ supertest:
   - admin يقدر يضيف خدمة وحقول
   - reorder يحفظ الترتيب الجديد
   - duplicate ينسخ كل الحقول
   - non-admin يحصل على 403
   - حذف خدمة بطلبات نشطة يفشل بـ 409
6. حدّث openapi.yaml بالتغييرات (especially /duplicate و reorder schema)
7. شغّل `pnpm gen:types`
8. commit: "feat(services): complete CRUD with reorder, duplicate, and tests"
```

---

## 👨‍💻 أحمد — يوم 7: Orders Module + State Machine

**البرومبت:**

```
سياق: e:/Tamem/apps/backend. transitions.ts موجود مع state machine جاهز.

المهمة اليوم (يوم 7) - الأهم في الـ backend:
1. أنشئ apps/backend/src/modules/orders/orders.controller.ts:
   - POST /orders (يخدم 3 categories: DELIVERY/SHIPPING/MERCHANT)
   - استخدم createOrderSchema من @tamem/validators (discriminated union)
   - الـ category تحدد كيف تُحفظ البيانات:
     • DELIVERY: حفظ deliveryLat/Lng/Address + customData + imageUrls
     • SHIPPING: حفظ pickup+delivery + weightKg + sizeCategory + speedTier
     • MERCHANT: حفظ items[] + pickupPoints[] + deliveryPoints[] في relations
   - بعد الإنشاء: اكتب OrderStatusHistory بـ NEW
   - استخدم generateOrderNumber()
2. أنشئ orders.service.ts بـ business logic منفصل عن controller
3. أنشئ PATCH /admin/orders/:id/status:
   - استدعِ assertTransition(from, to, role)
   - حدّث order + أنشئ OrderStatusHistory
   - أطلق Socket.IO event 'order:status' لـ user:{customerId} و order:{id}
4. أنشئ GET /orders/mine و GET /orders/:id
5. اكتب tests/orders.test.ts:
   - إنشاء كل نوع من 3 categories ينجح
   - state machine: NEW → UNDER_REVIEW (admin) ينجح
   - state machine: NEW → COMPLETED (any role) يفشل (invalid transition)
   - state machine: PRICED → ACCEPTED (driver) يفشل (forbidden role)
6. حدّث openapi.yaml
7. commit: "feat(orders): create + state machine + 12 statuses with history"
```

---

## 👨‍💻 أحمد — يوم 8: Orders List + Detail + Status History + Filtering

**البرومبت:**

```
سياق: e:/Tamem/apps/backend. orders module عنده create + status update.

المهمة اليوم (يوم 8):
1. أكمل GET /orders/mine (للعميل):
   - filtering بـ status, category, date range
   - pagination (?page&pageSize)
   - sorting: createdAt desc
   - يرجع شكل مختصر (ليس كل العلاقات)
2. أكمل GET /admin/orders (للأدمن):
   - filtering كامل: status, category, customerId, driverId, merchantId, date range, search by orderNumber
   - يرجع include: customer (name+phone), assignedDriver (name+phone)
   - pagination
3. GET /orders/:id - يرجع كل شيء (items, pickupPoints, deliveryPoints, statusHistory, payments)
4. POST /orders/:id/approve - العميل يوافق على السعر (AWAITING_CUSTOMER_APPROVAL → ACCEPTED)
5. POST /orders/:id/cancel - يقبل reason من body
6. اكتب tests:
   - فلترة بـ status تعمل
   - pagination meta صحيح
   - customer لا يقدر يرى طلبات غيره (403)
   - driver يرى فقط طلباته المسندة
7. أضف database indexes لو نسيت في schema (status+createdAt، customerId+createdAt، driverId+status)
8. commit: "feat(orders): list, detail, approve, cancel with role-based filtering"
```

---

## 👨‍💻 أحمد — يوم 9: Pricing Engine + Distance Matrix Integration

**البرومبت:**

```
سياق: e:/Tamem/apps/backend. أنشئ pricing module جديد.

المهمة اليوم (يوم 9):
1. أنشئ apps/backend/src/modules/pricing/pricing.service.ts:
   - calculatePrice(serviceId, params) — منطق التسعير حسب pricingMethod:
     • FIXED: basePrice
     • DISTANCE: basePrice + (distance * pricePerKm)
     • WEIGHT: basePrice + (weight * pricePerKg)
     • DISTANCE_WEIGHT: combo
     • QUOTE: null (الأدمن يسعّر يدوياً)
   - استشر PricingRule لـ governorate-specific overrides
   - طبّق surcharges (fragile, express, weekend, night)
   - طبّق min/max limits
2. أنشئ apps/backend/src/integrations/googleMaps.ts:
   - getDistanceKm(originLatLng, destLatLng) باستخدام Google Distance Matrix API
   - cache النتيجة في Setting أو ذاكرة (key: hash من origin+dest)
3. أنشئ POST /pricing/estimate endpoint
4. أنشئ /admin/pricing-rules CRUD كامل
5. اكتب tests/pricing.test.ts:
   - FIXED method يرجع basePrice دائماً
   - DISTANCE يحسب صح
   - DISTANCE_WEIGHT مع surcharges يحسب صح
   - QUOTE يرجع null
6. حدّث openapi.yaml + gen:types
7. commit: "feat(pricing): pricing engine + google distance matrix + rules CRUD"

ملاحظة: لو ما عندك Google Maps key، استخدم Haversine formula مؤقتاً وعلّق على الـ TODO.
```

---

## 👨‍💻 أحمد — يوم 10: Uploads + Sharp Resize + Merchants + Drivers + Products CRUD

**البرومبت:**

```
سياق: e:/Tamem/apps/backend.

المهمة اليوم (يوم 10) - مهمة دسمة:
1. أنشئ apps/backend/src/modules/uploads/uploads.controller.ts:
   - POST /uploads (multipart) باستخدام multer
   - بعد الرفع: sharp resize إلى max 1600px width + JPEG 85%
   - حفظ في /uploads/{yyyy}/{mm}/{uuid}.jpg
   - يرجع { url: absolute_url, key }
   - validation: JPG/PNG/WEBP فقط، max 10MB
2. أنشئ static handler في app.ts: app.use('/uploads', express.static(env.UPLOAD_DIR))
3. Merchants CRUD (/admin/merchants):
   - create: ينشئ User بـ role=MERCHANT + MerchantProfile
   - update: تحديث store info
   - delete: soft (isActive=false)
4. Drivers CRUD (/admin/drivers):
   - create: ينشئ User بـ role=DRIVER + DriverProfile + رقم لوحة + نوع مركبة
   - update: status, vehicle info
   - GET ?status=AVAILABLE - للاستخدام في dropdown تعيين سائق
5. Products CRUD (/admin/products):
   - بسيط: name, price, merchantId
6. اكتب tests for each
7. حدّث openapi.yaml
8. commit: "feat(uploads,merchants,drivers,products): CRUD + sharp image processing"
```

---

## 👨‍💻 أحمد — يوم 11: Payments + Notifications + Alerts (Cron)

**البرومبت:**

```
سياق: e:/Tamem/apps/backend.

المهمة اليوم (يوم 11):
1. Payments module:
   - POST /orders/:id/payment-proof (customer يرفع screenshot)
   - GET /admin/payments?status=PENDING (للأدمن لمراجعة)
   - PATCH /admin/payments/:id/confirm - يحدّث Order.paymentStatus=PAID
   - PATCH /admin/payments/:id/reject
2. Notifications module:
   - أنشئ helper notify(userId, type, channel, data) يحفظ في DB
   - integrations/fcm.ts - دالة sendPush(fcmToken, title, body) (Phase 1: stub بـ console.log، Phase 2: integration حقيقي)
   - GET /notifications - notifications المستخدم الحالي
   - PATCH /notifications/:id/read
3. Alerts cron job:
   - أنشئ apps/backend/src/jobs/alerts.ts:
     • كل 5 دقائق: ابحث عن orders بـ status=PRICED تجاوزت ساعة بدون موافقة → ينشئ Alert(PENDING_ORDER)
     • drivers بـ status=BUSY لكن lastLocationAt أقدم من 25 دقيقة → Alert(DRIVER_NOT_RESPONDING)
     • drivers cashOnHand > حد الإعداد → Alert(CASH_LIMIT_EXCEEDED)
   - شغّل cron في index.ts عند startup
4. اكتب tests/alerts.test.ts
5. commit: "feat(payments,notifications,alerts): proof flow + cron sweeps"
```

---

## 👨‍💻 أحمد — يوم 12: Socket.IO Realtime + WhatsApp Cloud API

**البرومبت:**

```
سياق: e:/Tamem/apps/backend. Socket.IO server موجود في index.ts كهيكل.

المهمة اليوم (يوم 12) - ختام Phase 1 لـ Backend:
1. أكمل apps/backend/src/realtime/ws.ts:
   - JWT auth في socket.handshake.auth.token
   - تلقائياً يضم socket لـ user:{userId} room
   - admins يُضمّون أيضاً لـ admin:orders و admin:alerts rooms
2. أنشئ apps/backend/src/realtime/channels.ts بدالة:
   - emitOrderStatusChange(orderId, customerId, driverId)
   - emitNewOrder(order) → admin:orders
   - emitNewAlert(alert) → admin:alerts
3. استدعِ هذه الدوال من orders.controller.ts و alerts cron
4. أنشئ apps/backend/src/integrations/whatsapp.ts:
   - sendWhatsAppMessage(toPhone, templateOrText) باستخدام WhatsApp Cloud API
   - graceful fallback: لو credentials غير موجودة، يطبع warning ولا يرمي خطأ
5. عند POST /orders: استدعِ sendWhatsAppMessage في خلفية (لا تجعل الـ response ينتظره)
6. اكتب tests/realtime.test.ts (يستخدم socket.io-client للاختبار)
7. حدّث docs/API.md بقسم Socket.IO كامل
8. commit: "feat(realtime,whatsapp): socket.io rooms + whatsapp cloud api integration"
```

---

## 👨‍🎨 خالد — يوم 6: Dashboard bootstrap كامل

**البرومبت:**

```
سياق: e:/Tamem/apps/dashboard موجود كـ scaffold. ابدأ Phase 1.

المهمة اليوم (يوم 6) - تأسيس الداشبورد:
1. تحقق أن `pnpm --filter @tamem/dashboard dev` يشغّل على :5173
2. اربط بـ Backend الحقيقي (تأكد Backend يعمل على :4000)
3. ركّب shadcn/ui:
   - npx shadcn@latest init (في apps/dashboard) - واختر settings تتناسب مع tailwind config الحالي
   - أضف components: button, input, label, dialog, table, dropdown-menu, sheet, badge, card, select, tabs, form, toast
4. حسّن LoginPage:
   - استبدل الـ inputs بـ shadcn Input
   - استخدم react-hook-form + zod (loginSchema من @tamem/validators)
   - أضف error messages بصيغة عربية
5. حسّن DashboardLayout:
   - استخدم shadcn Sheet للموبايل (sidebar كـ drawer)
   - أضف توست (sonner) عند الـ logout
6. أنشئ apps/dashboard/src/mocks/handlers.ts (MSW) - mocks للـ endpoints الأساسية
7. أضف EXPO_PUBLIC_USE_MOCKS toggle في .env.example للداشبورد (VITE_USE_MOCKS)
8. commit: "feat(dashboard): shadcn/ui integration + improved login + MSW mocks"
```

---

## 👨‍🎨 خالد — يوم 7: Mobile bootstrap كامل + Auth

**البرومبت:**

```
سياق: e:/Tamem/apps/mobile موجود كـ scaffold.

المهمة اليوم (يوم 7) - تأسيس الموبايل:
1. تحقق أن `pnpm --filter @tamem/mobile dev` يشغّل Expo
2. تأكد RTL يعمل (افتح في Expo Go - النصوص العربية من اليمين)
3. ركّب fonts (Cairo + Tajawal) باستخدام expo-font:
   - حمّل ttf files إلى src/assets/fonts/
   - في App.tsx: useFonts() قبل render
4. حسّن LoginScreen:
   - استخدم react-hook-form + zod (loginSchema)
   - أضف "نسيت كلمة المرور" placeholder
   - أضف زر "إنشاء حساب" يفتح RegisterScreen
5. ابن RegisterScreen كامل بـ react-hook-form:
   - الحقول: name, phone, password, city, address (optional)
   - validation برسائل عربية
   - بعد التسجيل: ينتقل لـ OTP screen (placeholder حالياً)
6. أنشئ src/mocks/handlers.ts بـ MSW (للموبايل)
7. ضع splash background صورة من Figma (designed by خالد يوم 1)
8. commit: "feat(mobile): rtl fonts + react-hook-form auth screens + MSW"
```

---

## 👨‍🎨 خالد — يوم 8: Dashboard - Overview كامل بـ Charts حقيقية

**البرومبت:**

```
سياق: e:/Tamem/apps/dashboard/src/routes/overview.tsx موجود بـ mock data.

المهمة اليوم (يوم 8):
1. استخدم recharts لـ:
   - LineChart للطلبات/الإيرادات على مر 7 أيام
   - PieChart لتوزيع الخدمات (delivery/shipping/merchant)
2. استخدم TanStack Query لجلب data من /admin/overview (مع MSW أو Backend الحقيقي)
3. أضف KPI cards مع:
   - الأرقام الحقيقية
   - skeleton loaders أثناء التحميل
   - error state لو فشل API
4. أضف فلتر "اليوم / الأسبوع / الشهر" أعلى الصفحة
5. أضف زر "تحديث" يدوي مع آخر تحديث (date-fns: "قبل دقيقتين")
6. اربط Socket.IO للـ real-time updates (badge أحمر لو طلب جديد)
7. تأكد كل النصوص العربية + الأرقام بـ Arabic numerals (toLocaleString('ar-EG'))
8. commit: "feat(dashboard): full overview with charts, RQ, and realtime"
```

---

## 👨‍🎨 خالد — يوم 9: Dashboard - Orders Table مع Filtering متقدم

**البرومبت:**

```
سياق: e:/Tamem/apps/dashboard/src/routes/orders/index.tsx (placeholder حالياً).

المهمة اليوم (يوم 9):
1. ابن Orders table باستخدام @tanstack/react-table:
   - أعمدة: رقم الطلب، العميل، الخدمة، الحالة (badge ملوّن من STATUS_COLORS)، السعر، السائق، التاريخ، إجراءات
   - server-side pagination
   - server-side sorting
2. فلاتر علوية:
   - tabs: الكل | جديد | في الطريق | مكتمل | ملغي
   - search input (debounce 300ms)
   - filter بـ date range
   - filter بـ service
3. كل صف clickable → يفتح Order Detail في Sheet/Drawer
4. استخدم MSW handlers (Backend ممكن ما يكون جاهز)
5. RQ infinite query أو pagination
6. responsive: على الموبايل، tabs بدلاً من dropdown
7. status badges بألوان من packages/ui-kit tokens.colors.status
8. commit: "feat(dashboard): orders table with filters, search, pagination"
```

---

## 👨‍🎨 خالد — يوم 10: Dashboard - Order Detail Drawer + Status Actions

**البرومبت:**

```
سياق: Order Detail Drawer من يوم 9 placeholder. ابنه كامل اليوم.

المهمة اليوم (يوم 10):
1. ابن OrderDetailDrawer (shadcn Sheet) يفتح من Orders table:
   - أعلى: رقم الطلب + status badge كبير
   - قسم العميل: اسم، هاتف (مع زر اتصال)، عنوان
   - قسم المسار: pickup → delivery (مع mini-map static placeholder)
   - قسم التفاصيل: items، notes، imageUrls (clickable للتكبير)
   - قسم التكلفة: quotedPrice، finalPrice، breakdown
   - قسم السائق المسند (لو موجود)
   - قسم Status History timeline (مع time + role)
2. أزرار الإجراءات (visible حسب الـ status الحالي - استخدم ORDER_TRANSITIONS من @tamem/types):
   - "مراجعة" (NEW → UNDER_REVIEW)
   - "تسعير" (يفتح dialog لإدخال السعر)
   - "تعيين سائق" (يفتح dialog مع قائمة drivers AVAILABLE)
   - "تغيير الحالة" (dropdown بالحالات المسموحة)
   - "إلغاء الطلب" (dialog مع reason)
3. كل إجراء بعده: toast نجاح + invalidate queries
4. استخدم useMutation من TanStack Query
5. اربط بـ /admin/orders/:id endpoints
6. commit: "feat(dashboard): full order detail drawer with all status actions"
```

---

## 👨‍🎨 خالد — يوم 11: Dashboard - Services List + Service Builder (بداية)

**البرومبت:**

```
سياق: نظام الخدمات الديناميكية - الميزة المعمارية الأهم.

المهمة اليوم (يوم 11):
1. ابن /services list:
   - cards لكل خدمة (icon, name, category badge, fields count, isActive toggle)
   - زر "+ خدمة جديدة" يأخذ لـ /services/new
   - كل card clickable يأخذ لـ /services/:id/edit
2. ابن Service Builder (/services/new و /services/:id/edit) - مهم:
   - layout عمودين (40/60):
     • اليمين: نموذج الخدمة (name, nameAr, category select, pricingMethod, basePrice, image upload، toggles)
     • اليسار: قائمة الحقول
3. قائمة الحقول:
   - بطاقات (FieldEditorCard) قابلة للترتيب بأسهم ↑↓
   - زر "+ إضافة حقل" يفتح dialog
   - كل بطاقة فيها: key, label, labelAr, type (select), isRequired (switch), options (لو SELECT/MULTISELECT)
4. autosave: كل تغيير = PATCH بـ debounce 1s (لـ existing service)
5. للجديدة: حفظ كامل عند الضغط على "حفظ الخدمة"
6. اربط بـ /admin/services + /admin/services/:id/fields endpoints
7. لا تشتغل على Live Preview اليوم - بكره
8. commit: "feat(dashboard): services list + builder with autosave"
```

---

## 👨‍🎨 خالد — يوم 12: Dashboard - Service Builder Live Preview + النشر

**البرومبت:**

```
سياق: Service Builder من يوم 11 ينقصه Live Preview.

المهمة اليوم (يوم 12) - ختام Phase 1 للداشبورد:
1. أكمل Service Builder بـ Live Preview:
   - شريط سفلي ثابت يعرض كيف ستبدو الخدمة في الموبايل
   - استخدم نفس مكونات DynamicForm (نسخة web من apps/mobile/src/components/DynamicForm)
   - استخدم buildZodSchema من @tamem/validators
   - أي تعديل = preview يتحدث فوراً
2. أنشئ apps/dashboard/src/features/dynamic-form/ - مكتبة DynamicForm للويب (web version من mobile DynamicForm):
   - TextField، SelectField، ImageField (preview فقط)، LocationField (input bsata)
3. اربط Backend الحقيقي (لا MSW):
   - تأكد VITE_USE_MOCKS=false
   - تأكد API يستجيب
   - تأكد إنشاء خدمة + حقول + reorder كل شيء يعمل end-to-end
4. حسّن UX: spinners، toasts، error boundaries
5. commit: "feat(dashboard): live preview in service builder + backend integration"

ملاحظة: نهاية اليوم 12 يجب أن تكون قادراً على:
- إنشاء خدمة من الداشبورد
- إضافة 5 حقول مختلفة
- معاينة كيف ستبدو في الموبايل
- حفظها وتظهر في GET /services
```

---

# 🟨 Phase 2 — تطبيق العميل + تحصين Backend (أيام 13-20)

## 👨‍🎨 خالد — يوم 13: Mobile - Home A + Home B + Categories

**البرومبت:**

```
سياق: ابدأ Phase 2 - بناء تطبيق العميل بالكامل.

المهمة اليوم (يوم 13):
1. حسّن HomeScreen ليطابق التصميم من Figma:
   - greeting بالاسم الحقيقي (من useAuth)
   - banner عروض (mock بـ data من /offers)
   - search bar في الأعلى
   - 3 service cards (delivery/shipping/merchant) - tap يفتح list الخدمات لكل category
   - "الأكثر طلباً" - cards للمحلات
2. ابن HomeBScreen (categories):
   - scroll للأسفل من HomeA → categories grid
   - كل category icon + label
   - زر "المحلات على الخريطة" بارز
3. اربط بـ /services و /categories و /offers (mock أو real backend)
4. استخدم TanStack Query بـ proper loading/error states
5. skeleton loaders بتصميم تميم
6. commit: "feat(mobile): home A (services) + home B (categories) screens"
```

---

## 👨‍🎨 خالد — يوم 14: Mobile - Nearby Stores Map + Stores List + Merchant Detail

**البرومبت:**

```
سياق: e:/Tamem/apps/mobile.

المهمة اليوم (يوم 14):
1. NearbyStoresMapScreen:
   - react-native-maps مع Google Provider
   - request location permission
   - عرض موقع العميل (blue dot)
   - markers للمحلات القريبة (من /merchants?lat=&lng=&radius=)
   - filters chips علوية: الكل، مطاعم، ماركت، صيدليات
   - bottom sheet بقائمة المحلات (sliding up panel)
2. StoresListScreen (بدون خريطة):
   - flat list للمحلات
   - tabs filtering مثل Map
   - search bar
3. MerchantDetailScreen:
   - cover image
   - معلومات: اسم، تقييم، وقت توصيل، open/closed
   - products list (من /merchants/:id/products) - لو موجود
   - زر "اطلب الآن" → DynamicServiceFlow أو Delivery Order
4. اربط بـ /merchants و /merchants/:id endpoints
5. commit: "feat(mobile): nearby stores map + list + merchant detail"
```

---

## 👨‍🎨 خالد — يوم 15: Mobile - DynamicForm Core + 5 field types

**البرومبت:**

```
سياق: الميزة المعمارية الأهم في الموبايل.

المهمة اليوم (يوم 15) - DynamicForm:
1. أنشئ apps/mobile/src/components/DynamicForm/DynamicForm.tsx:
   - يستقبل { fields: ServiceField[], pricingMethod, onSubmit }
   - يستخدم react-hook-form + zod (buildZodSchema من @tamem/validators)
   - يبني UI ديناميكياً
2. أنشئ apps/mobile/src/components/DynamicForm/fieldRegistry.ts:
   - map من ServiceFieldType إلى component
3. أنشئ 5 field components اليوم:
   - TextField.tsx (مع label, helpText, error)
   - TextAreaField.tsx (multiline)
   - NumberField.tsx (keyboard: numeric)
   - SelectField.tsx (modal picker للموبايل)
   - BooleanField.tsx (Switch)
4. أنشئ apps/mobile/src/screens/DynamicServiceFlowScreen.tsx:
   - يستقبل serviceId param
   - يجيب /services/:id
   - يعرض <DynamicForm fields={service.fields} />
   - زر "تأكيد الطلب" في الأسفل
5. سجّل الشاشة في navigation
6. اختبر مع خدمة "supermarket delivery" من seed
7. commit: "feat(mobile): dynamic form core + 5 field types"
```

---

## 👨‍🎨 خالد — يوم 16: Mobile - DynamicForm: Image, Location, Date, Time, Phone, MultiSelect

**البرومبت:**

```
سياق: DynamicForm له 5 field types - أضف الباقي اليوم.

المهمة اليوم (يوم 16):
1. ImageField.tsx:
   - expo-image-picker (camera + library)
   - expo-image-manipulator (resize 1600px max قبل الرفع)
   - يرفع إلى /uploads ويخزن URLs في الحقل
   - preview thumbnails مع زر حذف
   - يحترم validation.maxImages
2. LocationField.tsx:
   - زر "اختر من الخريطة" يفتح modal مع react-native-maps
   - draggable pin
   - reverse geocoding للعنوان النصي
   - زر "موقعي الحالي" (expo-location)
3. DateField.tsx + TimeField.tsx:
   - @react-native-community/datetimepicker
   - تنسيق عربي (date-fns/locale ar)
4. PhoneField.tsx:
   - keyboardType: phone-pad
   - validation regex مصرية
   - placeholder: +201XXXXXXXXX
5. MultiSelectField.tsx:
   - modal picker مع checkboxes
   - شيب الـ selected في input
6. اختبر كل field يعمل في DynamicForm
7. commit: "feat(mobile): all dynamic form field types complete"
```

---

## 👨‍🎨 خالد — يوم 17: Mobile - Repeaters (Pickup/Delivery Points + Products) → Merchant Flow

**البرومبت:**

```
سياق: طلب التاجر يحتاج multi-pickup + multi-delivery + multi-products.

المهمة اليوم (يوم 17):
1. أنشئ PickupPointsRepeater.tsx:
   - قائمة قابلة للإضافة/الحذف من النقاط
   - كل نقطة: address + LocationField + contactPhone
   - حد أقصى 20
2. أنشئ DeliveryPointsRepeater.tsx:
   - مشابه لكن مع recipientName + recipientPhone
3. أنشئ ProductsRepeater.tsx:
   - قائمة منتجات
   - كل منتج: name, quantity, pickupPointIndex (link)
4. عدّل DynamicForm:
   - لو service.supportsMultiplePickups → أعرض PickupPointsRepeater
   - لو service.supportsMultipleDeliveries → أعرض DeliveryPointsRepeater
   - لو service.category === 'MERCHANT' → أعرض ProductsRepeater
5. عند submit Merchant order:
   - أرسل POST /orders بـ category: MERCHANT
   - يحوي items[], pickupPoints[], deliveryPoints[]
6. اختبر end-to-end:
   - أنشئ طلب تاجر بـ 3 منتجات، 2 pickup، 2 delivery
   - تحقق DB أن البيانات صحيحة
7. commit: "feat(mobile): repeaters complete + merchant order end-to-end"
```

---

## 👨‍🎨 خالد — يوم 18: Mobile - Order Submission + Live Pricing + WhatsApp + My Orders

**البرومبت:**

```
سياق: الـ DynamicForm جاهز - الآن مسار الطلب الكامل.

المهمة اليوم (يوم 18):
1. عدّل DynamicForm ليعرض Live Pricing Preview:
   - useEffect على form values مع debounce 500ms
   - استدعِ /pricing/estimate
   - أعرض السعر في الأسفل (sticky bar)
   - "السعر التقديري: 45 ج.م" (Arabic numerals)
2. زر "تأكيد الطلب" يقدم الطلب:
   - submit → POST /orders
   - بعد النجاح: openWhatsAppConfirmation() (موجود في src/lib/whatsapp.ts)
   - navigate to OrderTracking screen
3. ابن MyOrdersScreen:
   - tabs: حالية / مكتملة
   - cards كل طلب: رقم، خدمة، حالة (status badge ملوّن)، سعر، وقت
   - pull-to-refresh
   - infinite scroll
   - tap على card → OrderTracking
4. اربط بـ /orders/mine
5. commit: "feat(mobile): order submission + live pricing + whatsapp + my orders"
```

---

## 👨‍🎨 خالد — يوم 19: Mobile - Order Tracking + Profile + Socket.IO

**البرومبت:**

```
سياق: الجزء الأخير من تجربة العميل.

المهمة اليوم (يوم 19):
1. ابن OrderTrackingScreen كامل:
   - top: status badge كبير
   - map: pickup → driver (لو معيّن) → delivery
   - driver card: اسم، تقييم، رقم (زر اتصال)، ETA
   - timeline: كل الـ status changes مع وقت
   - زر "اتصال بالدعم" يفتح WhatsApp
2. اربط Socket.IO:
   - عند فتح الشاشة: socket.emit('join', `order:${orderId}`)
   - استمع لـ 'order:status' → invalidate + toast
3. ابن ProfileScreen كامل (حسّن الموجود):
   - بيانات شخصية (editable في modal منفصل)
   - عناوين محفوظة
   - طرق الدفع المفضلة
   - الإشعارات (toggle)
   - الدعم
   - تسجيل الخروج (مع confirmation)
4. ابن EditProfileScreen
5. ابن AddressesScreen
6. commit: "feat(mobile): order tracking with realtime + complete profile"
```

---

## 👨‍🎨 خالد — يوم 20: Mobile - Push Notifications + Polish + Bug Bash

**البرومبت:**

```
سياق: ختام Phase 2 للموبايل.

المهمة اليوم (يوم 20):
1. expo-notifications setup:
   - request permissions في first launch
   - register FCM token
   - أرسل token لـ Backend (POST /me/fcm-token - أضف endpoint لو ناقص)
   - استقبل push messages
   - tap على notification → ينتقل للـ relevant screen (order details)
2. ابن NotificationsScreen (in-app):
   - قائمة من /notifications
   - read/unread states
   - pull-to-refresh
3. Polish عام:
   - empty states (no orders, no notifications)
   - error states (network error, server error)
   - loading skeletons everywhere
   - haptic feedback على الأزرار المهمة
   - splash screen يختفي بعد load كل الـ data الأساسية
4. Bug bash:
   - اختبر الـ user journeys الـ 3 (delivery, shipping, merchant)
   - اختبر RTL في كل شاشة
   - اختبر offline behavior
5. commit: "feat(mobile): push notifications + notifications screen + polish"
```

---

## 👨‍💻 أحمد — يوم 13: إكمال Endpoints الناقصة + Reports

**البرومبت:**

```
سياق: نهاية Phase 1 ترك بعض endpoints غير مكتملة. تأكد كلها شغّالة.

المهمة اليوم (يوم 13):
1. تحقق من كل endpoint في openapi.yaml له implementation
2. أكمل Reports module (/admin/reports/*):
   - /admin/reports/revenue?from=&to=&groupBy=day|week|month - حسب date range
   - /admin/reports/services - top services + revenue per service
   - /admin/reports/drivers - top drivers بعدد التوصيلات والإيرادات
   - /admin/reports/customers - top customers بعدد الطلبات
3. كل reports تستخدم Prisma aggregation queries
4. اختبر performance: لو slow، أضف indexes أو raw SQL
5. اكتب tests
6. حدّث openapi.yaml + gen:types
7. commit: "feat(reports): full reports module with aggregations"
```

---

## 👨‍💻 أحمد — يوم 14: Settings + Categories + Offers/Banners

**البرومبت:**

```
سياق: e:/Tamem/apps/backend.

المهمة اليوم (يوم 14):
1. Settings module (/admin/settings):
   - GET /admin/settings - كل settings
   - GET /admin/settings/:key
   - PATCH /admin/settings/:key (value JSON)
   - تأكد بعض settings محسوبة كمان (driver_cash_limit, etc)
2. Categories CRUD كامل (/admin/categories)
3. Offers/Banners CRUD (/admin/offers):
   - GET /offers (public - active فقط مع date range)
   - GET/POST/PATCH/DELETE /admin/offers
4. أضف validation: linkType=SERVICE → linkValue يجب أن يكون serviceId موجود
5. tests
6. openapi.yaml + gen:types
7. commit: "feat(settings,categories,offers): admin tunable config + content"
```

---

## 👨‍💻 أحمد — يوم 15: WhatsApp Server-Side Dispatch + Templates

**البرومبت:**

```
سياق: integrations/whatsapp.ts موجود لكن stub.

المهمة اليوم (يوم 15):
1. اقرأ وثائق WhatsApp Cloud API الرسمية
2. أكمل sendWhatsAppMessage() ليرسل فعلياً (لو credentials موجودة):
   - POST إلى graph.facebook.com/v18.0/{phoneNumberId}/messages
   - دعم template messages (لـ initial outreach)
   - دعم free-form messages (لـ replies)
3. أنشئ templates:
   - order_confirmed: "تم استلام طلبك #{orderNumber}..."
   - order_priced: "تم تسعير طلبك بـ {price} ج.م. اضغط للموافقة"
   - driver_assigned: "السائق {name} في الطريق إليك"
   - order_delivered: "تم تسليم طلبك. شكراً لاختيار تميم"
4. integration tests مع sandbox WhatsApp number
5. لو لا توجد credentials: log واضح + لا يفشل
6. وثّق في docs/INTEGRATIONS.md (جديد) كيفية تجهيز WhatsApp Cloud API
7. commit: "feat(whatsapp): full cloud API integration with templates"
```

---

## 👨‍💻 أحمد — يوم 16: Performance — Indexes + Query Optimization

**البرومبت:**

```
سياق: مع تكامل الموبايل، حان وقت الأداء.

المهمة اليوم (يوم 16):
1. راجع كل الـ queries في الـ controllers - ابحث عن:
   - N+1 queries (استخدم include بدلاً من loops)
   - missing indexes (راجع slow query log)
   - over-fetching (استخدم select)
2. أضف composite indexes في schema.prisma لو ناقصة:
   - Order: (customerId, status, createdAt desc)
   - Order: (assignedDriverId, status)
   - Notification: (userId, isRead, sentAt desc)
3. شغّل migration: pnpm prisma migrate dev --name perf-indexes
4. أنشئ apps/backend/scripts/load-test.ts بـ autocannon:
   - test GET /services (يجب < 50ms)
   - test GET /admin/orders (يجب < 200ms)
   - test POST /orders (يجب < 300ms)
5. وثّق أرقام الأداء في docs/PERFORMANCE.md
6. commit: "perf(db): add indexes + optimize queries + load test baseline"
```

---

## 👨‍💻 أحمد — يوم 17: Validation Hardening + Rate Limiting + Sanitization

**البرومبت:**

```
سياق: قبل النشر، تأكد كل endpoint محمي.

المهمة اليوم (يوم 17):
1. راجع كل route - تأكد body/query/params كلها زود مصدّقة
2. أضف rate limiting مخصص:
   - /auth/login: 5 محاولات / دقيقة لكل IP
   - /auth/otp/request: 3 / 10 دقائق لكل phone
   - /uploads: 10 / دقيقة لكل user
3. Sanitize all user inputs:
   - أضف express-mongo-sanitize? لا - استخدم zod transforms
   - HTML escape في أي field نصي يُعرض
4. حد أقصى لـ JSON body: 100KB (الـ uploads منفصل)
5. أضف helmet config محكم:
   - HSTS
   - X-Frame-Options DENY
   - X-Content-Type-Options nosniff
6. اكتب tests لـ rate limiting و sanitization
7. commit: "security: tight rate limits + sanitization + helmet hardening"
```

---

## 👨‍💻 أحمد — يوم 18: Backup Script + Log Rotation + Monitoring

**البرومبت:**

```
سياق: استعداد للإنتاج.

المهمة اليوم (يوم 18):
1. أنشئ apps/backend/scripts/backup.sh:
   - mysqldump → gzip → احفظ في /var/backups/tamem
   - احتفظ بآخر 14 يوم
   - upload to S3 لو AWS_S3_BUCKET موجود (optional)
2. أنشئ scripts/restore.sh للاستعادة
3. اختبر backup + restore على dev DB
4. logrotate config: /etc/logrotate.d/tamem
5. اشترك في UptimeRobot (مجاناً) - اضبط check لـ /health كل 5 دقائق
6. وثّق في DEPLOYMENT.md كيف تستعيد من backup
7. أنشئ apps/backend/src/modules/health/health.controller.ts:
   - /health/live - basic uptime
   - /health/ready - check DB connection
   - /health/version - git SHA + build time
8. commit: "ops: backup/restore + log rotation + health endpoints"
```

---

## 👨‍💻 أحمد — يوم 19: Security Pass — CORS + JWT Rotation + File Validation

**البرومبت:**

```
سياق: مراجعة أمنية شاملة.

المهمة اليوم (يوم 19):
1. CORS lockdown:
   - لا allow * في production
   - فقط origins من env (admin.tamem-delivery.com, tamem-delivery.com)
   - لـ mobile (Expo) - أضف exception أو استخدم بدون CORS
2. JWT secret rotation plan:
   - وثّق في DECISIONS.md (ADR-008): "كيف تغير JWT secrets"
   - تطبيق: عند rotation، token قديم يُرفض → users تسجل دخول جديد
3. File upload validation:
   - validate MIME type بـ magic bytes (لا الـ extension فقط)
   - استخدم npm: file-type
   - reject SVG (يحوي scripts ممكن)
4. SQL injection audit: Prisma immune لكن اختبر raw queries لو موجودة
5. NPM audit + fix
6. وثّق security posture في docs/SECURITY.md (جديد)
7. commit: "security: cors lockdown + file validation + audit"
```

---

## 👨‍💻 أحمد — يوم 20: مراجعة تكاملات Frontend + Fixes + Deploy Backend

**البرومبت:**

```
سياق: نهاية Phase 2 - تكامل final.

المهمة اليوم (يوم 20):
1. اقعد مع خالد:
   - تأكد كل endpoint يستخدمه الموبايل/الداشبورد يعمل صح
   - اختبر end-to-end user journeys معاً
   - اعمل bug list
2. أصلح bugs المكتشفة
3. حدّث openapi.yaml لأي تغييرات
4. شغّل: pnpm gen:types
5. شغّل: pnpm test (يجب 100% pass)
6. شغّل: pnpm typecheck
7. شغّل: pnpm lint
8. شغّل: pnpm build (يجب ينجح)
9. لو كل شيء ينجح: deploy Backend إلى Hostinger VPS:
   - اتبع DEPLOYMENT.md
   - تأكد api.tamem-delivery.com يستجيب
10. commit: "chore(release): phase 2 backend hardening + production deploy"
```

---

# 🟪 Phase 3 — إكمال Dashboard + النشر (أيام 21-26)

## 👨‍🎨 خالد — يوم 21: Dashboard - Customers + Drivers + Merchants

**البرومبت:**

```
سياق: ابدأ Phase 3 - أكمل Dashboard.

المهمة اليوم (يوم 21):
1. /customers:
   - table بـ pagination
   - أعمدة: اسم، هاتف، المدينة، عدد الطلبات، آخر طلب
   - search
   - row click → modal تفاصيل العميل (مع آخر 10 طلبات له)
2. /drivers:
   - cards grid (مثل design Figma) بحالة لكل سائق (متاح/مشغول/غير نشط)
   - زر "+ إضافة سائق" يفتح modal:
     • الحقول: name, phone, password, vehicleType (select), vehiclePlate, nationalId, governorate, licenseImage (upload)
   - row click → driver detail modal
3. /merchants:
   - مشابه drivers لكن للتجار
   - زر "+ إضافة تاجر" مع store info
4. كل forms react-hook-form + zod
5. اربط بـ /admin/customers, /admin/drivers, /admin/merchants
6. commit: "feat(dashboard): customers, drivers, merchants management"
```

---

## 👨‍🎨 خالد — يوم 22: Dashboard - Products + Pricing Rules

**البرومبت:**

```
سياق: e:/Tamem/apps/dashboard.

المهمة اليوم (يوم 22):
1. /products:
   - table مع filter بـ merchant
   - inline edit للسعر و isAvailable
   - bulk actions (تفعيل/تعطيل متعدد)
2. /pricing:
   - tabs لكل service
   - form لكل service يحدد:
     • basePrice, pricePerKm, pricePerKg
     • minPrice, maxPrice
     • fragileSurcharge, expressSurcharge
     • multipliers (weekend, night)
     • governorate-specific overrides (table صغير في الأسفل)
   - autosave مع toast
3. اربط بـ /admin/products و /admin/pricing-rules
4. commit: "feat(dashboard): products + pricing rules"
```

---

## 👨‍🎨 خالد — يوم 23: Dashboard - Payments (مع Proof Viewer)

**البرومبت:**

```
سياق: e:/Tamem/apps/dashboard.

المهمة اليوم (يوم 23):
1. /payments:
   - tabs: pending / confirmed / rejected
   - table: orderNumber, customer, amount, method, reference, action
   - zoom-able proof image viewer (modal مع zoom + rotate)
   - زر "تأكيد" + زر "رفض" (مع reason)
   - فلتر بـ date range
2. كل action confirm/reject:
   - PATCH /admin/payments/:id/confirm أو /reject
   - بعد success: invalidate query + toast
3. badge في الـ sidebar إذا فيه pending payments (real-time من Socket)
4. commit: "feat(dashboard): payments management with proof viewer"
```

---

## 👨‍🎨 خالد — يوم 24: Dashboard - Reports (Charts + Export)

**البرومبت:**

```
سياق: e:/Tamem/apps/dashboard.

المهمة اليوم (يوم 24):
1. /reports:
   - tabs: revenue / services / drivers / customers
2. Revenue tab:
   - LineChart للإيرادات على الزمن
   - date range filter (default: آخر 30 يوم)
   - groupBy: day/week/month
   - export CSV
3. Services tab:
   - BarChart top خدمات بالعدد
   - PieChart بالإيرادات
   - table بالتفاصيل
4. Drivers tab:
   - leaderboard top 10 سائقين
   - أعمدة: عدد، إجمالي، تقييم
5. Customers tab:
   - top 10 عملاء
6. اربط بـ /admin/reports/* endpoints
7. commit: "feat(dashboard): full reports with charts + CSV export"
```

---

## 👨‍🎨 خالد — يوم 25: Dashboard - Alerts Center + Settings

**البرومبت:**

```
سياق: e:/Tamem/apps/dashboard. ميزة مهمة.

المهمة اليوم (يوم 25):
1. /alerts (مركز التنبيهات):
   - Stats أعلى: # عاجل، # تحذير، # شكاوى، # تم حلها اليوم
   - قائمة alerts مرتبة حسب severity ثم تاريخ
   - كل alert card:
     • أيقونة حسب type (⏱ pending، 📵 driver، 💵 cash، 💬 complaint)
     • severity badge (red/orange/yellow)
     • title + description
     • زر action سياقي (مثلاً: "سعّر الآن" يأخذ للطلب)
     • زر "حلّ" يفتح modal لـ resolution note
   - real-time updates من Socket
   - فلتر: الكل، عاجل، تحذير، شكاوى
2. /settings:
   - tabs: عام / الإشعارات / الدفع / المتقدم
   - عام: اسم المتجر، رقم WhatsApp الرسمي، عنوان
   - الإشعارات: enable/disable channels
   - الدفع: enable methods (cash, vodafone, instapay)
   - المتقدم: driver_cash_limit، alert thresholds
   - اربط بـ /admin/settings
3. commit: "feat(dashboard): alerts center + settings"
```

---

## 👨‍🎨 خالد — يوم 26: Polish + RTL Spot Check + Mobile Responsive

**البرومبت:**

```
سياق: نهاية Phase 3 للداشبورد.

المهمة اليوم (يوم 26):
1. polish عام عبر الداشبورد:
   - empty states في كل قائمة
   - skeleton loaders consistent
   - error boundaries
   - 404 page جميل
2. RTL spot-check:
   - افتح كل صفحة وراجع: alignment، icons، spacing
   - أصلح أي bugs (خصوصاً charts و tables)
3. Mobile responsive:
   - sidebar يصبح drawer
   - tables تصبح cards
   - dialog يأخذ full screen
4. Accessibility:
   - keyboard navigation
   - focus indicators
   - aria-labels على icon-only buttons
5. Performance:
   - lighthouse audit (target 90+)
   - code splitting لو bundle كبير
   - lazy load charts
6. commit: "chore(dashboard): polish, rtl fixes, mobile responsive, a11y"
```

---

## 👨‍💻 أحمد — يوم 21: Seed Production Data مع العميل

**البرومبت:**

```
سياق: ابدأ Phase 3 لـ Backend - استعداد للإنتاج.

المهمة اليوم (يوم 21):
1. اجتمع مع العميل (إدارة تميم) لـ:
   - تحديد الخدمات الفعلية المطلوبة (10-15 خدمة)
   - تحديد التسعير الفعلي
   - الحصول على بيانات تجار حقيقيين (5-10 محلات)
   - الحصول على بيانات سائقين أوليين (3-5 سائقين)
2. أنشئ apps/backend/prisma/seed.production.ts:
   - admin account (إدارة تميم)
   - كل الخدمات بحقولها وتسعيرها
   - التجار + منتجاتهم (لو متاحة)
   - السائقين بحسابات
   - pricing rules لقفط، قنا، الأقصر، أسوان
   - الـ settings (cash limit, whatsapp number الرسمي)
3. شغّله على dev DB أولاً للاختبار
4. وثّق في docs/PRODUCTION-DATA.md ما تم seeding
5. commit: "feat(seed): production-ready seed with real client data"
```

---

## 👨‍💻 أحمد — يوم 22: Mobile Build (EAS) + Internal Testing

**البرومبت:**

```
سياق: حان وقت بناء APK وإرساله للـ Play Store.

المهمة اليوم (يوم 22):
1. تأكد من Expo account
2. تأكد من eas.json صحيح (إعدادات preview + production)
3. أضف credentials:
   - Google Maps API key في app.json (Android section)
   - EAS projectId
4. شغّل eas login (لو ما عملت قبل)
5. cd apps/mobile && eas build -p android --profile preview
6. انتظر البناء (10-15 دقيقة)
7. حمّل APK وثبّته على جهاز Android للاختبار
8. اختبر الـ user journey كامل:
   - تسجيل، دخول، تصفح، طلب، تتبع
   - تأكد API_URL في app.json/extras يشير لـ production (api.tamem-delivery.com)
9. لو يعمل: شغّل eas submit للـ Internal Test Track على Play Console
10. commit: "build(mobile): first APK build + internal track submission"
```

---

## 👨‍💻 أحمد — يوم 23: Google Play Console Listing

**البرومبت:**

```
سياق: تجهيز الصفحة في Play Store.

المهمة اليوم (يوم 23):
1. في Google Play Console:
   - أنشئ App Listing (اسم: تميم للتوصيل)
   - أضف descriptions بالعربي:
     • Short description (80 char max)
     • Full description (4000 char max) - وصف 3 خدمات بالتفصيل
2. screenshots (تستخدم من Figma یوم 1-3):
   - phone screenshots (5 على الأقل): home, services, tracking, profile, my orders
   - أبعاد: 1080×1920 أو 1080×2340
3. أيقونة التطبيق (512×512 PNG)
4. graphic banner (1024×500 PNG)
5. Privacy policy URL: https://tamem-delivery.com/privacy
6. Terms URL: https://tamem-delivery.com/terms
7. Category: Food & Drink أو Maps & Navigation
8. Content rating: Everyone
9. Target audience: Adults
10. Data safety form: declare كل البيانات اللي تجمعها (location, phone, etc)
11. commit: "build(playstore): app listing + assets"
```

---

## 👨‍💻 أحمد — يوم 24: Landing Page Build + Hostinger Deploy

**البرومبت:**

```
سياق: apps/landing موجود بمحتوى أولي.

المهمة اليوم (يوم 24):
1. حسّن apps/landing/src/pages/index.astro:
   - استخدم screenshots حقيقية من الموبايل (من EAS APK build)
   - أكمل sections كاملة
   - أضف SEO meta tags صحيحة
   - أضف Google Analytics (placeholder gtag.js)
2. أكمل صفحة Privacy + Terms (محتوى حقيقي):
   - تشاور مع العميل أو محامي لو ممكن
   - يجب تذكر: ما البيانات اللي تُجمع، لماذا، لمن تُشارك، كيف يحذف الـ user حسابه
3. ابن: pnpm --filter @tamem/landing build
4. ارفع dist/ إلى Hostinger Shared Hosting (FTP):
   - tamem-delivery.com → public_html/
5. اضبط DNS (لو لم يكن مضبوطاً):
   - tamem-delivery.com → IP الـ shared
   - admin. → IP الـ VPS
   - api. → IP الـ VPS
6. اختبر:
   - https://tamem-delivery.com يفتح
   - WhatsApp links تشتغل
7. commit: "feat(landing): production build + hostinger deploy"
```

---

## 👨‍💻 أحمد — يوم 25: Migration Plan + Backup Restore Drill

**البرومبت:**

```
سياق: قبل cutover، تجهيز كامل.

المهمة اليوم (يوم 25):
1. أنشئ docs/MIGRATION-PLAN.md - خطة الـ go-live:
   - قبل (T-1 يوم): final tests، backup، announce maintenance window
   - يوم T-0:
     • backup DB الحالي (لو فيه)
     • deploy latest backend
     • run migrations
     • seed production data
     • smoke tests
     • DNS switch
     • announce live
   - بعد (T+1 يوم): monitor logs، address issues
2. backup restore drill:
   - خذ snapshot من dev DB
   - أنشئ DB جديد فاضي
   - استعد من الـ snapshot
   - تحقق أن البيانات كلها صحيحة
   - وثّق الوقت والخطوات
3. أعد kit الـ rollback:
   - script يرجع الـ dist/ القديم
   - script يرجع DB من backup
4. commit: "docs(ops): migration plan + verified backup restore"
```

---

## 👨‍💻 أحمد — يوم 26: Load Testing + DB Profiling

**البرومبت:**

```
سياق: قبل الإنتاج، اختبار أداء حقيقي.

المهمة اليوم (يوم 26):
1. أنشئ scenarios لـ autocannon:
   - 100 req/s على GET /services لمدة 30 ثانية
   - 50 req/s على POST /orders لمدة 1 دقيقة
   - 200 req/s على GET /admin/orders (مع auth)
2. شغّلها على VPS staging:
   - راقب: CPU، RAM، MySQL connections، response p95/p99
3. اعمل قائمة bottlenecks:
   - أي endpoint > 500ms p95
   - أي query > 100ms
4. أصلح أكبر 3 مشاكل
5. أعد الاختبار - تحقق التحسن
6. وثّق في docs/PERFORMANCE.md
7. لو شيء حرج: قرر هل نسف يوم 27 لإصلاحه ولا نؤجل لـ Phase 2 of project
8. commit: "perf: load testing + bottleneck fixes"
```

---

# 🟥 Phase 4 — QA والإطلاق (أيام 27-30) — الاثنان معاً

## 👥 يوم 27: QA Walkthrough — Customer + Admin Journeys

**البرومبت (للاثنين معاً):**

```
سياق: e:/Tamem/. نهاية المسار - QA شامل.

المهمة اليوم (يوم 27):
1. أنشئ docs/QA-CHECKLIST.md - قائمة journeys:

   ## Customer Journeys (مع تطبيق فعلي على جهاز)
   - [ ] تسجيل عميل جديد (OTP)
   - [ ] دخول existing user
   - [ ] تصفح الخدمات
   - [ ] تصفح المحلات على الخريطة
   - [ ] إنشاء طلب دليفري نصي
   - [ ] إنشاء طلب دليفري بصورة
   - [ ] إنشاء طلب شحن (مع price calculator)
   - [ ] إنشاء طلب تاجر (multi-pickup + multi-delivery)
   - [ ] استلام تأكيد على WhatsApp
   - [ ] متابعة الطلب (timeline + status changes)
   - [ ] الموافقة على سعر
   - [ ] إلغاء طلب
   - [ ] تعديل الملف الشخصي
   - [ ] تسجيل خروج

   ## Admin Journeys (في الداشبورد)
   - [ ] دخول admin
   - [ ] رؤية overview مع أرقام حقيقية
   - [ ] رؤية الطلبات (جدول + filters)
   - [ ] فتح طلب + تسعير + تعيين سائق + تغيير الحالة لـ delivered
   - [ ] إضافة خدمة جديدة (مع 3 حقول) + رؤيتها في الموبايل فوراً
   - [ ] إضافة سائق
   - [ ] إضافة تاجر + منتج
   - [ ] تأكيد payment proof
   - [ ] حلّ alert
   - [ ] export report

2. شغّل كل واحد منهم وسجّل كل bug
3. صنّفهم: P0 (blocker) / P1 (major) / P2 (minor)
4. أنشئ docs/BUGS-PHASE4.md
5. commit: "qa: full walkthrough checklist + bug list"
```

---

## 👥 يوم 28: إصلاح P0/P1 + Arabic Proofreading

**البرومبت (للاثنين):**

```
سياق: عندنا قائمة bugs - أصلحها.

المهمة اليوم (يوم 28):
1. كل واحد يأخذ bugs في الـ lane:
   - أحمد: backend + landing + API bugs
   - خالد: mobile + dashboard bugs
2. أصلح كل P0 (blockers) - 100%
3. أصلح أكبر عدد ممكن من P1
4. اترك P2 لـ Phase 2 of project
5. Arabic proofreading:
   - أحضر شخص يتحدث العربية (لو ممكن متخصص UX writing) لمراجعة:
     • نصوص الموبايل
     • نصوص الداشبورد
     • نصوص الـ WhatsApp templates
     • نصوص الإيميل (لو موجودة)
   - عدّل i18n/ar.json
6. شغّل اختبارات شاملة - تأكد ما كسرت شيء
7. commit (each dev): "fix(phase4): resolved P0/P1 bugs + arabic proofread"
```

---

## 👥 يوم 29: UAT مع العميل

**البرومبت (للاثنين):**

```
سياق: العميل يجرب التطبيق + الداشبورد.

المهمة اليوم (يوم 29):
1. حضّر بيئة UAT:
   - APK مثبت على جهاز للعميل (أو internal test track)
   - حسابات admin للعميل (للداشبورد)
   - بيانات seed كاملة
2. اجلس مع إدارة تميم لمدة 2-3 ساعات:
   - اشرح كل feature
   - لاحظ أين يتعثرون (يدل على UX bug)
   - سجّل كل feedback
3. أنشئ docs/UAT-FEEDBACK.md
4. صنّف الـ feedback:
   - blocking (لازم قبل الإطلاق)
   - nice-to-have (Phase 2)
   - misunderstanding (يحتاج training / تحسين copy)
5. أصلح الـ blocking فوراً
6. للـ nice-to-have: أضف لـ backlog
7. للـ misunderstanding: حسّن النص أو الـ flow
8. commit: "feat(phase4): UAT fixes from client"
```

---

## 👥 يوم 30: Production Cutover + Training + Handoff

**البرومبت (للاثنين - يوم الإطلاق):**

```
سياق: نهاية المشروع. يوم الإطلاق الرسمي.

المهمة اليوم (يوم 30) - في الصباح:
1. final backup للـ DB الحالي
2. deploy آخر نسخة من Backend
3. run latest migrations
4. update production seed data لو فيه تغييرات
5. smoke tests على production:
   - /health/ready يرجع 200
   - login بحساب admin يعمل
   - أنشئ test order ينجح
6. DNS verification: tamem-delivery.com + admin.* + api.* كلها live
7. EAS submit (لو لم يكن): production track على Play Store
8. monitor logs بـ pm2 logs --lines 100

المهمة اليوم - بعد الظهر:
9. جلسة تدريب مع إدارة تميم (2 ساعة):
   - كيف يضيف خدمة جديدة
   - كيف يدير الطلبات يومياً
   - كيف يضيف سائق/تاجر
   - كيف يقرأ التقارير
   - ماذا يفعل عند تنبيه
   - كيف يحلّ شكوى عميل
10. سجّل الجلسة (للمراجعة المستقبلية)
11. سلّم وثائق:
    - docs/USER-MANUAL.md (للأدمن)
    - docs/DEPLOYMENT.md (للنشر المستقبلي)
    - docs/MAINTENANCE.md (kontracted)
12. وقّع acceptance form مع العميل
13. commit final: "chore(release): v1.0.0 — production launch"
14. git tag v1.0.0 + push

🎉 المشروع تم تسليمه!
```

---

# 📝 ملاحظات مهمة لاستخدام البرومبتات

## الأمور التي يجب أن يفعلها كل مطور قبل أي يوم:

```bash
cd e:/Tamem
git pull origin main          # احصل على آخر التغييرات
pnpm install                  # تأكد المكتبات محدّثة
# اقرأ docs/DECISIONS.md لو فيه قرارات جديدة
```

## بعد كل يوم:

```bash
pnpm lint && pnpm typecheck && pnpm test    # تأكد ما كسرت شي
git add . && git commit -m "..."
git push -u origin <branch>
gh pr create                                # افتح PR
# انتظر مراجعة الزميل (لا self-merge)
```

## عند الـ blockers:

- لو محتاج endpoint من الـ backend ولم يجهز → استخدم MSW
- لو محتاج schema changes → اطلب من أحمد عبر issue (لا تعدل schema بنفسك لو أنت خالد)
- لو في مشكلة قرار معماري → اقرأ DECISIONS.md، لو غير موجود → اجتمع مع الفريق + أضف ADR جديد

## مراجعة هذا الملف بانتظام:

- كل أسبوع راجع docs/PROMPTS.md لو فيه تعديلات
- لو في برومبت لم يعد دقيق → عدّله
- لو في خطوة فاتت → أضفها

---

**تم بحمد الله. حظ موفق لخالد وأحمد في تنفيذ تميم 🚀**
