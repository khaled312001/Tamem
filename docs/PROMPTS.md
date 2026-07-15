# برومبتات Claude Code — خطة تنفيذ تميم للتوصيل

> **التقسيم الجديد - بالنطاقات (Verticals) لا بالطبقات:**
> كل مطور يأخذ stack كامل (frontend + backend + API) لنطاقه. هذا يلغي dependencies بين المطورين تماماً.
>
> | الفيز       | المطور               | المدة  | النطاق                                                       |
> | ----------- | -------------------- | ------ | ------------------------------------------------------------ |
> | **Phase 1** | **أحمد كمال** (سولو) | 12 يوم | Admin Dashboard + Backend الإداري + Database + APIs الإدارية |
> | **Phase 2** | **خالد أحمد** (سولو) | 12 يوم | Mobile App + Backend الخاص بالعميل + الربط مع الداشبورد      |
> | **Phase 3** | **الاثنان معاً**     | 6 أيام | Landing Page + Integration + QA + النشر + التسليم            |
>
> **كيف تستخدم البرومبتات:** كل مهمة برومبت جاهز انسخه والصقه في Claude Code داخل `e:/Tamem/`.

---

## 🤝 العقد المشترك (Shared Contract) — لتجنّب التعارض

### ما يمتلكه أحمد بشكل حصري (Phase 1):

- `apps/dashboard/**` — الداشبورد كاملاً
- `apps/backend/prisma/schema.prisma` — نموذج البيانات الكامل (أحمد يبنيه يوم 1، خالد يطلب تعديلات عبر issue)
- `apps/backend/prisma/seed.ts`
- `apps/backend/src/config/**`، `src/db/**`، `src/middleware/**`، `src/utils/**`
- `apps/backend/src/modules/admin/**`، `users/**`، `drivers/**`، `merchants/**`، `services/**` (admin endpoints)، `pricing/**` (rules)، `payments/**` (admin confirm)، `alerts/**`، `reports/**`
- `apps/backend/src/modules/orders/transitions.ts` — state machine للـ 12 حالة (مشترك لكن أحمد يبنيه)
- `apps/backend/src/realtime/**` — Socket.IO server + admin rooms
- `apps/backend/openapi.yaml` — يبنيه أحمد، خالد يضيف قسمه في Phase 2

### ما يمتلكه خالد بشكل حصري (Phase 2):

- `apps/mobile/**` — التطبيق كاملاً
- `apps/backend/src/modules/auth/**` — أحمد يضع admin login، خالد يكمل customer register/OTP/Google
- `apps/backend/src/modules/services/services.routes.ts` — الـ public routes (GET) — خالد يضيفهم
- `apps/backend/src/modules/orders/` — customer endpoints (create, mine, get, approve, cancel)
- `apps/backend/src/modules/pricing/pricing.estimate.ts` — endpoint التسعير العام
- `apps/backend/src/modules/uploads/**`
- `apps/backend/src/modules/notifications/**`
- `apps/backend/src/integrations/**` — whatsapp, fcm, googleMaps
- `apps/backend/src/jobs/**` — cron sweeps

### مشترك (الاثنان يستهلكان، أحمد يبني):

- `packages/shared-types/**` — types مشتركة (OrderStatus, Service, User, ...)
- `packages/validators/**` — zod schemas
- `packages/api-client/**` — axios client
- `packages/ui-kit/**` — design tokens

### كيفية التواصل بين المطورين:

1. **أحمد ينتهي من Phase 1** → يدفع PR كبير `phase-1-admin-complete` → خالد يراجع → merge
2. **خالد يبدأ Phase 2 من commit أحمد** → يستهلك schema/state-machine/api-client كما هي
3. لو خالد احتاج تعديل في schema → يفتح issue على GitHub، أحمد يجاوب في < 24 ساعة
4. لو خالد احتاج endpoint admin → نفس الشيء
5. Phase 3 = الاثنان يدمجان عملهما + يصلحان أي تعارضات

---

# 🟦 Phase 1 — أحمد (12 يوم)

### الهدف: لوحة تحكم كاملة تعمل end-to-end مع mock orders، جاهزة لاستقبال طلبات حقيقية من الموبايل في Phase 2.

---

## 👨‍💻 أحمد — يوم 1: تجهيز المشروع + Prisma Schema + Database

**البرومبت:**

```
أنت في مشروع تميم للتوصيل (e:/Tamem/) - monorepo بـ pnpm + Turbo.

اقرأ docs/PROMPTS.md و docs/DECISIONS.md و README.md و docs/BRAND.md.

المهمة اليوم (Phase 1 - Day 1):
1. تأكد أن pnpm install يعمل بدون أخطاء
2. تأكد أن MySQL محلي يعمل (لو غير موجود، أنشئ docker-compose.yml يرفع MySQL 8)
3. عدّل .env بـ DATABASE_URL الصحيح
4. راجع apps/backend/prisma/schema.prisma الموجود - تحقق أن كل النماذج صحيحة لـ:
   - User + DriverProfile + MerchantProfile + Category
   - Service + ServiceField (الديناميكي)
   - Order + OrderItem + OrderPickupPoint + OrderDeliveryPoint + OrderStatusHistory
   - Product + PricingRule + Payment + Notification + Alert + Offer + Setting + RefreshToken
5. شغّل: pnpm --filter @tamem/backend prisma:migrate --name init
6. شغّل seed: pnpm --filter @tamem/backend db:seed
7. افتح Prisma Studio وتأكد البيانات الافتراضية موجودة (admin + 3 services + categories)
8. أضف 3 categories إضافية في seed (مغسلة، ورد، حلويات) + 2 services إضافية
9. أضف اختبار في tests/seed.test.ts يتحقق أن seed idempotent (لا يدبّل البيانات)
10. commit: "feat(db): init prisma schema, migrations, and seed data"

ملاحظة مهمة: أنت تبني schema للجميع. خالد سيستخدم نفس الـ schema في Phase 2 لكتابة customer endpoints. لا تترك أي حقل ناقص.
```

---

## 👨‍💻 أحمد — يوم 2: Auth Module للـ Admin + JWT + RBAC + State Machine

**البرومبت:**

```
سياق: e:/Tamem/. أكمل Phase 1 - Day 2.

المهمة اليوم:
1. راجع apps/backend/src/modules/auth/ - الكود الأولي موجود. تأكد:
   - POST /auth/login يعمل (للأدمن أساساً، خالد سيوسعه لاحقاً للعميل)
   - POST /auth/refresh مع rotation
   - POST /auth/logout يبطل refresh token
2. أكمل GET /me endpoint (يرجع بيانات المستخدم)
3. أكمل apps/backend/src/middleware/auth.ts:
   - requireAuth: يفك JWT ويضع req.user
   - requireRole(...roles): يتحقق من الـ role
4. تأكد أن transitions.ts كامل (في src/modules/orders/transitions.ts):
   - assertTransition(from, to, role) يستخدم ORDER_TRANSITIONS و TRANSITION_ROLES من @tamem/types
   - يرمي InvalidTransitionError لو الانتقال ممنوع
   - يرمي ForbiddenError لو الـ role غير مسموح
5. اكتب tests/auth.test.ts بـ supertest:
   - admin login بصحيح ينجح
   - admin login بخطأ يفشل بـ 401
   - refresh token rotation يعمل
   - non-admin token على /admin/* يعطي 403
6. اكتب tests/transitions.test.ts:
   - NEW → UNDER_REVIEW (admin) ينجح
   - NEW → COMPLETED يفشل (invalid)
   - PRICED → ACCEPTED (driver) يفشل (forbidden role)
7. شغّل pnpm test - يجب يمر كل شيء
8. commit: "feat(auth,orders): admin auth + 12-state machine with tests"
```

---

## 👨‍💻 أحمد — يوم 3: Services CRUD + Service Builder API

**البرومبت:**

```
سياق: e:/Tamem/. Phase 1 - Day 3.

اليوم: بناء نظام الخدمات الديناميكية (الميزة المعمارية الأهم).

1. أكمل apps/backend/src/modules/services/services.controller.ts:
   - GET /admin/services - list مع _count للحقول والطلبات
   - POST /admin/services - إنشاء (validate بـ serviceInputSchema)
   - PATCH /admin/services/:id - تعديل
   - DELETE /admin/services/:id - soft delete (isActive=false)
   - POST /admin/services/:id/duplicate - استنساخ مع كل الحقول
   - POST /admin/services/:id/fields - إضافة حقل
   - PATCH /admin/services/:id/fields/:fieldId - تعديل حقل
   - DELETE /admin/services/:id/fields/:fieldId - حذف
   - PATCH /admin/services/:id/fields/reorder - body: { fieldIds: [] }
2. أضف validation: لا تحذف خدمة فيها orders نشطة (status not in [COMPLETED, CANCELLED, REJECTED])
3. خالد سيضيف الـ public GET endpoints لاحقاً - لا تكتبها أنت
4. اكتب tests/services.test.ts شاملة
5. حدّث apps/backend/openapi.yaml بكل الـ admin endpoints
6. شغّل: pnpm --filter @tamem/backend gen:types
7. commit: "feat(services): full admin CRUD + builder with field operations"
```

---

## 👨‍💻 أحمد — يوم 4: Admin Orders + Pricing Rules + Drivers/Merchants/Products CRUD

**البرومبت:**

```
سياق: e:/Tamem/. Phase 1 - Day 4 - يوم دسم.

1. Admin Orders endpoints (apps/backend/src/modules/orders/orders.admin.controller.ts):
   - GET /admin/orders - filtering كامل (status, category, customerId, driverId, search by orderNumber, date range) + pagination
   - GET /admin/orders/:id - تفاصيل كاملة (include items, points, history, payments, customer, driver)
   - PATCH /admin/orders/:id/status - يستدعي assertTransition + يحدث + ينشئ StatusHistory + emit socket event
   - PATCH /admin/orders/:id/price - يضع quotedPrice
   - PATCH /admin/orders/:id/assign-driver - يضع assignedDriverId + يغير الحالة لـ DRIVER_ASSIGNED
   - POST /admin/orders/:id/note - يضيف ملاحظة داخلية
2. خالد سيكتب POST /orders + GET /orders/mine + GET /orders/:id (customer view) لاحقاً
3. Drivers CRUD (/admin/drivers):
   - GET ?status=AVAILABLE (لاستخدام في dropdown)
   - POST: ينشئ User بـ role=DRIVER + DriverProfile
   - PATCH /admin/drivers/:id (update info)
   - PATCH /admin/drivers/:id/status
4. Merchants CRUD (/admin/merchants):
   - مشابه drivers
5. Products CRUD (/admin/products):
   - بسيط: name, price, merchantId, isAvailable
6. Pricing Rules CRUD (/admin/pricing-rules)
7. tests for everything
8. حدّث openapi.yaml + gen:types
9. commit: "feat(admin): orders mgmt + drivers/merchants/products/pricing CRUD"
```

---

## 👨‍💻 أحمد — يوم 5: Payments + Alerts + Reports + Settings + Socket.IO

**البرومبت:**

```
سياق: e:/Tamem/. Phase 1 - Day 5.

1. Admin Payments (/admin/payments):
   - GET ?status=PENDING|CONFIRMED|REJECTED
   - PATCH /admin/payments/:id/confirm - يحدث Order.paymentStatus=PAID
   - PATCH /admin/payments/:id/reject (مع reason)
2. Alerts module (apps/backend/src/modules/alerts/):
   - GET /admin/alerts?resolved=false
   - PATCH /admin/alerts/:id/resolve (مع note)
   - أنشئ apps/backend/src/jobs/alerts.ts (node-cron كل 5 دقائق):
     • orders بـ status=PRICED أقدم من ساعة → Alert(PENDING_ORDER)
     • drivers بـ status=BUSY مع lastLocationAt أقدم من 25 د → Alert(DRIVER_NOT_RESPONDING)
     • drivers بـ cashOnHand > Setting.driver_cash_limit → Alert(CASH_LIMIT_EXCEEDED)
3. Reports endpoints:
   - GET /admin/reports/revenue?from=&to=&groupBy=day|week|month
   - GET /admin/reports/services
   - GET /admin/reports/drivers
   - GET /admin/reports/customers
   - استخدم Prisma aggregations
4. Settings (/admin/settings) - key/value
5. Categories CRUD (/admin/categories) و Offers/Banners (/admin/offers)
6. Socket.IO setup:
   - راجع apps/backend/src/realtime/ws.ts
   - JWT auth في handshake
   - admin يدخل rooms: admin:orders, admin:alerts
   - أنشئ helpers في channels.ts: emitNewOrder، emitOrderStatusChange، emitNewAlert
   - استدعها من orders controller و alerts cron
7. حدّث openapi.yaml + gen:types + docs/API.md (قسم Socket.IO)
8. commit: "feat(backend): payments+alerts+reports+settings+realtime complete"

نهاية اليوم 5: كل APIs الـ admin جاهزة. ابدأ بناء الداشبورد غداً.
```

---

## 👨‍💻 أحمد — يوم 6: Dashboard Bootstrap + Login + Layout + Overview

**البرومبت:**

```
سياق: e:/Tamem/apps/dashboard موجود scaffold. ابدأ Phase 1 - Day 6.

1. تأكد `pnpm --filter @tamem/dashboard dev` يشغّل على :5173
2. اربط بـ Backend الحقيقي على :4000 (تأكد Backend يعمل في terminal آخر)
3. ركّب shadcn/ui:
   - cd apps/dashboard
   - npx shadcn@latest init (واختر الإعدادات المتوافقة مع tailwind config)
   - add: button input label dialog table dropdown-menu sheet badge card select tabs form toast skeleton avatar
4. حسّن LoginPage:
   - استخدم shadcn Button + Input + Label + Form
   - react-hook-form + zod (loginSchema من @tamem/validators)
   - error messages عربية
   - اللوجو موجود في components/Logo.tsx (لا تغيره)
5. حسّن DashboardLayout:
   - اللوجو في sidebar header
   - استخدم shadcn Sheet للموبايل
6. ابن Overview بـ recharts:
   - KPI cards مع TanStack Query من /admin/overview
   - LineChart للطلبات على 7 أيام (mock أو real data)
   - PieChart توزيع الخدمات
   - skeleton loaders + error states
   - فلتر "اليوم / الأسبوع / الشهر"
   - زر "تحديث" يدوي
7. اربط Socket.IO من src/lib/socket.ts:
   - عند login يتصل
   - يدخل room admin:orders
   - يستمع لـ order:new → toast + badge
8. commit: "feat(dashboard): shadcn + login + layout + overview with realtime"
```

---

## 👨‍💻 أحمد — يوم 7: Dashboard - Orders Table + Filters + Detail Drawer

**البرومبت:**

```
سياق: e:/Tamem/apps/dashboard. Phase 1 - Day 7.

1. ابن /orders صفحة بـ @tanstack/react-table:
   - أعمدة: رقم الطلب، العميل، الخدمة، الحالة (status badge ملوّن), السعر، السائق، التاريخ، إجراءات
   - server-side pagination + sorting
   - status badges بألوان من @tamem/ui (colors.status)
2. فلاتر علوية:
   - tabs: الكل | جديد | المراجعة | في الطريق | مكتمل | ملغي
   - search input (debounce 300ms)
   - date range filter
   - filter بالخدمة
3. OrderDetailDrawer (shadcn Sheet) يفتح من row click:
   - أعلى: orderNumber + status badge كبير
   - قسم العميل (اسم، هاتف مع زر اتصال tel:)، عنوان
   - قسم المسار: pickup → delivery
   - قسم التفاصيل: items, notes, imageUrls (clickable للتكبير)
   - قسم التكلفة: quotedPrice, finalPrice
   - قسم السائق المسند (لو موجود) مع زر تغيير
   - قسم Status History timeline بـ time + role
4. أزرار الإجراءات (visible حسب الـ status - استخدم ORDER_TRANSITIONS من @tamem/types):
   - "مراجعة" (NEW → UNDER_REVIEW)
   - "تسعير" (dialog لإدخال السعر)
   - "تعيين سائق" (dialog مع قائمة drivers AVAILABLE من /admin/drivers?status=AVAILABLE)
   - "تغيير الحالة" (dropdown بالحالات المسموحة فقط)
   - "إلغاء" (dialog مع reason)
5. كل إجراء = useMutation + toast + invalidate queries
6. Socket.IO: استمع لـ order:status → invalidate ['orders']
7. ملاحظة: لا توجد طلبات حقيقية بعد - أنشئ 5 طلبات mock في seed.ts للاختبار
8. commit: "feat(dashboard): orders table + detail drawer + all status actions"
```

---

## 👨‍💻 أحمد — يوم 8: Dashboard - Service Builder + Live Preview

**البرومبت:**

```
سياق: e:/Tamem/apps/dashboard. Phase 1 - Day 8 - أهم شاشة في الداشبورد.

1. /services - list:
   - cards شبكة: icon, name, category badge, fields count, isActive switch
   - زر "+ خدمة جديدة" → /services/new
   - row click → /services/:id/edit
2. /services/new + /services/:id/edit - Service Builder:
   - layout عمودين 40/60:
     **اليمين (40%):**
     - form الخدمة: name, nameAr, category select, pricingMethod, basePrice, image upload, toggles
     - autosave بـ debounce 1s (لـ existing service)
     - للجديد: submit يدوي
     **اليسار (60%):**
     - "الحقول":
       - قائمة FieldEditorCard (drag-free, أسهم ↑↓)
       - زر "+ إضافة حقل"
       - كل بطاقة: key, label, labelAr, type, isRequired switch, options (لـ SELECT), validation collapsible
3. **Live Preview** في شريط سفلي ثابت:
   - يعرض الـ form كما سيظهر في الموبايل
   - أنشئ apps/dashboard/src/features/dynamic-form/ (نسخة web من DynamicForm)
   - 5 field types: TextField, TextAreaField, NumberField, SelectField, BooleanField (الباقي للموبايل)
   - استخدم buildZodSchema من @tamem/validators لضمان نفس الـ validation
   - تحديث فوري عند أي تعديل
4. اربط بـ /admin/services + /admin/services/:id/fields endpoints
5. duplicate, delete (مع confirmation modal)
6. commit: "feat(dashboard): full service builder with autosave + live preview"
```

---

## 👨‍💻 أحمد — يوم 9: Dashboard - Customers + Drivers + Merchants Management

**البرومبت:**

```
سياق: e:/Tamem/apps/dashboard. Phase 1 - Day 9.

1. /customers:
   - shadcn Table مع pagination
   - أعمدة: اسم، هاتف، المدينة، عدد الطلبات، آخر طلب، إجراءات
   - search input
   - row click → modal تفاصيل (مع آخر 10 طلبات للعميل)
2. /drivers:
   - cards grid (مثل تصميم Figma - 4 أعمدة):
     • صورة/أحرف الاسم، اسم، vehicle type, plate
     • status badge ملوّن (متاح/مشغول/غير نشط)
     • عدد طلبات اليوم
   - زر "+ إضافة سائق" يفتح dialog:
     • name, phone, password, vehicleType (select: سيارة، دراجة بخارية، دراجة، نقل)
     • vehiclePlate, nationalId, governorate
     • licenseImage (upload)
   - row click → driver detail drawer مع statistics
3. /merchants:
   - cards مشابه drivers
   - زر "+ إضافة تاجر" مع store info (name, nameAr, category, logo, address, lat/lng map picker, openHours)
4. كل forms بـ react-hook-form + zod + shadcn Form components
5. اربط بـ /admin/customers, /admin/drivers, /admin/merchants
6. commit: "feat(dashboard): customers + drivers + merchants management"
```

---

## 👨‍💻 أحمد — يوم 10: Dashboard - Products + Pricing Rules + Payments

**البرومبت:**

```
سياق: e:/Tamem/apps/dashboard. Phase 1 - Day 10.

1. /products:
   - Table مع filter dropdown بـ merchant
   - inline edit للسعر و isAvailable (toggle)
   - bulk actions (تفعيل/تعطيل متعدد بـ checkboxes)
   - زر "+ منتج" dialog
2. /pricing:
   - tabs لكل service active
   - form لكل service:
     • basePrice, pricePerKm, pricePerKg
     • minPrice, maxPrice
     • fragileSurcharge, expressSurcharge
     • multipliers (weekend, night) مع time picker
     • governorate-specific overrides (table صغير في الأسفل)
   - autosave مع toast confirmation
3. /payments:
   - tabs: pending / confirmed / rejected
   - Table: orderNumber, customer, amount, method, reference, action
   - zoom-able proof image viewer (modal shadcn Dialog)
   - زر "تأكيد" + زر "رفض" (مع reason)
   - filter بـ date range
   - badge في sidebar لو فيه pending (real-time)
4. كل CRUD يربط بـ endpoints أحمد كتبها يوم 4-5
5. commit: "feat(dashboard): products + pricing + payments management"
```

---

## 👨‍💻 أحمد — يوم 11: Dashboard - Reports + Alerts Center + Settings

**البرومبت:**

```
سياق: e:/Tamem/apps/dashboard. Phase 1 - Day 11.

1. /reports:
   - tabs: revenue / services / drivers / customers
   **Revenue tab:**
   - LineChart للإيرادات على الزمن
   - date range filter (default: آخر 30 يوم)
   - groupBy: day / week / month
   - زر "تصدير CSV"
   **Services:**
   - BarChart top خدمات بالعدد
   - PieChart بالإيرادات
   - table بالتفاصيل
   **Drivers:**
   - leaderboard top 10
   - أعمدة: عدد التوصيلات، الإجمالي، التقييم
   **Customers:**
   - top 10 عملاء بعدد الطلبات
2. /alerts (مركز التنبيهات) - مهم جداً:
   - Stats أعلى: # عاجل، # تحذير، # شكاوى، # تم حلها اليوم
   - قائمة alerts مرتبة بـ severity ثم date
   - كل alert card:
     • أيقونة حسب type (⏱ pending، 📵 driver، 💵 cash، 💬 complaint)
     • severity badge (red/orange/yellow)
     • title + description
     • زر action سياقي (مثلاً "سعّر الآن" يأخذ للطلب)
     • زر "حلّ" يفتح dialog لـ resolution note
   - real-time من Socket.IO (room admin:alerts)
   - فلتر: الكل، عاجل، تحذير، شكاوى
3. /settings:
   - tabs: عام / الإشعارات / الدفع / المتقدم
   - عام: storeName, whatsapp number, address
   - الإشعارات: enable/disable channels
   - الدفع: methods toggles
   - المتقدم: driver_cash_limit, alert thresholds
4. commit: "feat(dashboard): reports + alerts center + settings complete"
```

---

## 👨‍💻 أحمد — يوم 12: Polish + Bug Bash + Production Build + Handoff Doc

**البرومبت:**

```
سياق: نهاية Phase 1. تجهيز للتسليم لخالد.

1. Polish عام:
   - empty states في كل قائمة
   - skeleton loaders consistent
   - error boundaries
   - 404 page جميل
   - loading spinners أثناء الـ navigation
2. RTL spot-check:
   - افتح كل صفحة - تحقق alignment, icons, spacing, charts
3. Mobile responsive (التابلت أساساً):
   - sidebar drawer
   - tables تتحول cards
4. Accessibility:
   - keyboard navigation
   - aria-labels على icon-only buttons
5. شغّل: pnpm lint, pnpm typecheck, pnpm test, pnpm build (يجب 100% pass)
6. سجّل demo فيديو 5 دقائق لكل الـ features
7. اكتب docs/PHASE-1-HANDOFF.md - وثيقة للـ Phase 2:
   - ما تم بناؤه (admin endpoints + dashboard)
   - ما لم يُبنى (customer endpoints - مسؤولية خالد)
   - حالة schema (لا تعدّل بدون استشارة أحمد)
   - حالة auth (admin login يعمل، customer endpoints لازمها خالد)
   - mock orders في seed (يمكن حذفهم لما يجي طلبات حقيقية من الموبايل)
   - أي gotchas اكتشفها أحمد
8. افتح PR كبير "phase-1-admin-complete" → خالد يراجع → merge to main
9. commit: "chore(phase-1): polish + handoff doc + production build verified"

🎉 نهاية Phase 1 - الداشبورد كامل ويعمل end-to-end مع mock orders.
```

---

# 🟩 Phase 2 — خالد (12 يوم)

### الهدف: تطبيق العميل كامل + customer-side backend endpoints + الربط مع الداشبورد. في نهاية اليوم 24، طلب من الموبايل يظهر في الداشبورد فوراً.

---

## 👨‍🎨 خالد — يوم 13: Mobile Bootstrap + Customer Auth Backend + Mobile Login

**البرومبت:**

```
سياق: e:/Tamem/. أحمد سلّم Phase 1 (الداشبورد + Backend الإداري).
اقرأ docs/PHASE-1-HANDOFF.md و docs/PROMPTS.md.

ابدأ Phase 2 - Day 1 (Day 13 عام):

1. تأكد أن pnpm install و pnpm dev يشغّل كل شيء
2. تحقق Dashboard يعمل + Backend admin endpoints تستجيب
3. **Backend (customer auth) - extension لما أحمد كتبه:**
   في apps/backend/src/modules/auth/auth.controller.ts (الذي أحمد كتبه):
   - أضف POST /auth/register (للعملاء فقط - role=CUSTOMER) إذا غير موجود/ناقص
   - أضف POST /auth/otp/request (Phase 1: stub يطبع code في log)
   - أضف POST /auth/otp/verify (Phase 1: أي code من 6 أرقام يبدأ بـ 1 ينجح)
   - أضف POST /auth/google (verify Google ID token + upsert user)
   - أضف PATCH /me (تحديث الملف الشخصي)
   - أضف POST /me/fcm-token (لتسجيل FCM token للـ push)
4. اكتب tests لكل endpoint
5. حدّث openapi.yaml بهذه الـ customer endpoints
6. pnpm gen:types
7. **Mobile:**
   - تأكد `pnpm --filter @tamem/mobile dev` يشغّل
   - تأكد RTL يعمل في Expo Go
   - حمّل fonts (Cairo + Tajawal) عبر expo-font في App.tsx
   - حسّن LoginScreen بـ react-hook-form + zod
   - ابن RegisterScreen كامل:
     • الحقول: name, phone, password, city, address (اختياري)
     • validation عربية
     • بعد التسجيل: ينقل لـ OTP screen
   - ابن OtpVerifyScreen (6 خانات منفصلة)
8. اختبر end-to-end: تسجيل مستخدم جديد من الموبايل → يظهر في الـ admin /customers
9. commit: "feat(phase-2-day1): customer auth backend + mobile auth screens"
```

---

## 👨‍🎨 خالد — يوم 14: Public Endpoints + Mobile Home A + Home B

**البرومبت:**

```
سياق: e:/Tamem/. Phase 2 - Day 14.

1. **Backend (public endpoints):**
   - GET /services (public - active فقط، بدون auth)
   - GET /services/:id (public - مع fields[])
   - GET /categories (public)
   - GET /merchants (public - مع filter بـ categoryId, governorate, lat/lng/radius)
   - GET /merchants/:id (public)
   - GET /merchants/:id/products (public)
   - GET /offers (public - active فقط)
   راجع apps/backend/src/modules/services/services.routes.ts - أحمد قسّمها admin/public
   - أكمل publicServicesRouter بكل الـ public endpoints
2. tests + openapi.yaml + gen:types
3. **Mobile:**
   - HomeScreen كامل (يطابق Figma):
     • greeting + city (من useAuth)
     • search bar
     • banner عروض (من /offers)
     • 3 service cards (delivery/shipping/merchant) - tap يفتح قائمة الخدمات لتلك الـ category
     • "الأكثر طلباً" - cards للمحلات
   - HomeBScreen (categories - تظهر بـ scroll down من Home A أو navigation):
     • categories grid
     • زر "المحلات على الخريطة" بارز
   - اربط بـ /services و /categories و /offers بـ TanStack Query
   - skeleton loaders بهوية تميم
4. اختبر: الخدمات التي أضافها أحمد في seed تظهر في الموبايل
5. commit: "feat(phase-2-day2): public endpoints + home A/B screens"
```

---

## 👨‍🎨 خالد — يوم 15: Mobile Map + Stores List + Merchant Detail

**البرومبت:**

```
سياق: e:/Tamem/apps/mobile. Phase 2 - Day 15.

1. NearbyStoresMapScreen:
   - react-native-maps + Google Provider
   - request location permission (expo-location)
   - عرض موقع العميل (blue dot)
   - markers للمحلات من /merchants?lat=&lng=&radius=
   - filter chips علوية: الكل، مطاعم، ماركت، صيدليات
   - bottom sheet (sliding panel) بقائمة المحلات
2. StoresListScreen (بدون خريطة):
   - flat list للمحلات
   - tabs filtering
   - search bar
3. MerchantDetailScreen:
   - cover image كبير
   - معلومات: اسم، تقييم، delivery time, open/closed
   - products list (لو موجودين) من /merchants/:id/products
   - زر "اطلب الآن" → يفتح DynamicServiceFlow أو Delivery Order
4. سجّل الشاشات في navigation (HomeStack)
5. commit: "feat(mobile): nearby map + stores list + merchant detail"
```

---

## 👨‍🎨 خالد — يوم 16: Mobile DynamicForm Core + 5 Field Types + Pricing Engine

**البرومبت:**

```
سياق: الميزة المعمارية الأهم في الموبايل.

1. **Backend - أكمل pricing estimate:**
   - apps/backend/src/modules/pricing/pricing.service.ts
   - calculatePrice(serviceId, params) حسب pricingMethod:
     • FIXED: basePrice
     • DISTANCE: basePrice + (distance * pricePerKm)
     • WEIGHT: basePrice + (weight * pricePerKg)
     • DISTANCE_WEIGHT: combo
     • QUOTE: null (الأدمن يسعّر يدوياً)
   - استشر PricingRule لـ governorate-specific
   - طبّق surcharges + min/max
   - POST /pricing/estimate endpoint (public أو مع auth خفيف)
   - integrations/googleMaps.ts: getDistanceKm() (Haversine إذا لم يكن Google Maps key)
   - tests
2. **Mobile - DynamicForm core:**
   - apps/mobile/src/components/DynamicForm/DynamicForm.tsx:
     • يستقبل { fields, pricingMethod, onSubmit }
     • react-hook-form + zod (buildZodSchema من @tamem/validators)
     • يبني UI ديناميكياً
   - fieldRegistry.ts: map من ServiceFieldType إلى Component
   - 5 field types اليوم:
     • TextField.tsx (مع label, helpText, error)
     • TextAreaField.tsx (multiline)
     • NumberField.tsx (keyboard: numeric)
     • SelectField.tsx (modal picker للموبايل)
     • BooleanField.tsx (Switch)
3. DynamicServiceFlowScreen:
   - يستقبل serviceId
   - يجيب /services/:id
   - يعرض <DynamicForm fields={service.fields} />
4. اختبر مع خدمة "supermarket delivery" من seed أحمد
5. commit: "feat(phase-2-day4): pricing engine + DynamicForm + 5 field types"
```

---

## 👨‍🎨 خالد — يوم 17: Mobile DynamicForm - Remaining Field Types + Uploads

**البرومبت:**

```
سياق: e:/Tamem/. Phase 2 - Day 17.

1. **Backend uploads:**
   - apps/backend/src/modules/uploads/uploads.controller.ts:
     • POST /uploads (multipart, multer)
     • sharp resize إلى max 1600px width + JPEG 85%
     • حفظ في /uploads/{yyyy}/{mm}/{uuid}.jpg
     • يرجع { url: absolute, key }
     • validation: JPG/PNG/WEBP فقط، max 10MB
   - express.static('/uploads', UPLOAD_DIR) في app.ts
   - tests
2. **Mobile - باقي field types:**
   - ImageField.tsx:
     • expo-image-picker (camera + library)
     • expo-image-manipulator (resize قبل الرفع)
     • يرفع لـ /uploads
     • preview thumbnails + زر حذف
     • يحترم validation.maxImages
   - LocationField.tsx:
     • زر "اختر من الخريطة" يفتح modal مع react-native-maps
     • draggable pin
     • reverse geocoding
     • زر "موقعي الحالي"
   - DateField.tsx + TimeField.tsx (datetimepicker + locale ar)
   - PhoneField.tsx (validation مصرية)
   - MultiSelectField.tsx (modal مع checkboxes)
3. سجّل كل field type في fieldRegistry.ts
4. اختبر كل field يعمل في DynamicForm
5. commit: "feat(phase-2-day5): uploads + all dynamic form field types"
```

---

## 👨‍🎨 خالد — يوم 18: Mobile Repeaters + Customer Orders Backend

**البرومبت:**

```
سياق: e:/Tamem/. Phase 2 - Day 18.

1. **Backend customer orders:**
   - apps/backend/src/modules/orders/orders.customer.controller.ts:
     • POST /orders (customer creates - يخدم 3 categories بـ discriminated union من createOrderSchema)
     • category=DELIVERY: يحفظ deliveryAddress + customData + imageUrls
     • category=SHIPPING: يحفظ pickup+delivery + weight + size + speed
     • category=MERCHANT: ينشئ Order + items[] + pickupPoints[] + deliveryPoints[] في transaction
     • بعد الإنشاء: emit socket event 'order:new' لـ admin:orders
     • emit WhatsApp message (server-side dispatch)
   - GET /orders/mine?status=&page=
   - GET /orders/:id (verify ownership أو role=ADMIN)
   - POST /orders/:id/approve (AWAITING_CUSTOMER_APPROVAL → ACCEPTED - role=CUSTOMER)
   - POST /orders/:id/cancel (مع reason)
   - tests شاملة
2. **Mobile repeaters:**
   - PickupPointsRepeater.tsx: قائمة قابلة للإضافة/الحذف، حد أقصى 20
   - DeliveryPointsRepeater.tsx: مع recipientName + phone
   - ProductsRepeater.tsx: name, quantity, pickupPointIndex link
3. عدّل DynamicForm:
   - لو service.supportsMultiplePickups → أعرض PickupPointsRepeater
   - لو service.supportsMultipleDeliveries → DeliveryPointsRepeater
   - لو category === 'MERCHANT' → ProductsRepeater
4. اختبر merchant order end-to-end:
   - من الموبايل: 3 منتجات، 2 pickup، 2 delivery
   - تحقق DB البيانات صحيحة
   - تحقق الطلب يظهر في dashboard /orders
5. commit: "feat(phase-2-day6): customer orders backend + repeaters - merchant flow works"
```

---

## 👨‍🎨 خالد — يوم 19: Order Submission Flow + Live Pricing + WhatsApp Integration

**البرومبت:**

```
سياق: e:/Tamem/. Phase 2 - Day 19.

1. **Backend WhatsApp:**
   - أكمل apps/backend/src/integrations/whatsapp.ts:
     • sendWhatsAppMessage(toPhone, text) باستخدام WhatsApp Cloud API
     • graceful: لو credentials غير موجودة، يطبع warning ولا يفشل
   - في POST /orders: استدعِ sendWhatsAppMessage في خلفية (لا تنتظره في response)
   - templates:
     • order_confirmed: "تم استلام طلبك..."
     • order_priced: "تم تسعير طلبك بـ {price} ج.م"
     • driver_assigned: "السائق {name} في الطريق"
2. **Mobile order submission:**
   - في DynamicForm: Live Pricing Preview:
     • useEffect على form values مع debounce 500ms
     • استدعِ /pricing/estimate
     • أعرض السعر في sticky bar أسفل
     • "السعر التقديري: 45 ج.م" (toLocaleString('ar-EG'))
   - زر "تأكيد الطلب":
     • POST /orders
     • بعد success: openWhatsAppConfirmation() (موجود في src/lib/whatsapp.ts)
     • navigate لـ OrderTrackingScreen
3. ابن MyOrdersScreen:
   - tabs: الحالية / المكتملة
   - cards كل طلب: رقم، خدمة، حالة badge ملوّن، سعر، وقت (نسبي بـ date-fns)
   - pull-to-refresh
   - infinite scroll
   - tap على card → OrderTracking
   - اربط بـ /orders/mine
4. commit: "feat(phase-2-day7): order submission + live pricing + whatsapp + my orders"
```

---

## 👨‍🎨 خالد — يوم 20: Order Tracking + Profile + Socket.IO Realtime

**البرومبت:**

```
سياق: e:/Tamem/. Phase 2 - Day 20.

1. **Backend - Notifications:**
   - apps/backend/src/modules/notifications/notifications.controller.ts:
     • GET /notifications (الـ user الحالي)
     • PATCH /notifications/:id/read
     • PATCH /notifications/read-all
   - helper notify(userId, type, title, body, channel) يحفظ في DB
   - integrations/fcm.ts: sendPush(fcmToken, title, body) - Phase 1 stub
   - عند تغيير حالة الطلب من dashboard: ينادي notify لعميل الطلب
2. **Mobile:**
   - OrderTrackingScreen كامل:
     • top: status badge كبير
     • map: pickup → driver location → delivery (لو السائق معيّن)
     • driver card: اسم، rating، phone (زر اتصال tel:)، ETA
     • timeline: status changes مع time + role
     • زر "دعم" يفتح WhatsApp
   - Socket.IO:
     • عند فتح الشاشة: socket.emit('join', `order:${orderId}`)
     • listen لـ 'order:status' → invalidate query + toast
   - ProfileScreen كامل:
     • بيانات شخصية (editable - زر يفتح EditProfile)
     • عناوين محفوظة (لاحقاً)
     • طرق الدفع المفضلة
     • الإشعارات toggle
     • زر دعم، زر تسجيل خروج (مع confirmation)
   - EditProfileScreen
3. **Test الربط الكامل:**
   - من الموبايل: أنشئ طلب
   - من الداشبورد (terminal آخر): اقبله، سعّره، عيّن سائق، غيّر حالة لـ DELIVERED
   - الموبايل يجب يستلم updates لحظياً عبر Socket.IO
4. commit: "feat(phase-2-day8): tracking + profile + realtime - full e2e works"
```

---

## 👨‍🎨 خالد — يوم 21: Push Notifications + Alerts Cron + Polish

**البرومبت:**

```
سياق: e:/Tamem/. Phase 2 - Day 21.

1. **Backend Jobs:**
   - apps/backend/src/jobs/alerts.ts (يكمل ما بناه أحمد لو ناقص):
     • cron كل 5 دقائق
     • orders بـ status=PRICED أقدم من ساعة → Alert(PENDING_ORDER)
     • drivers بـ status=BUSY مع lastLocationAt > 25min → Alert(DRIVER_NOT_RESPONDING)
   - شغّله في index.ts عند startup
2. **Mobile push:**
   - expo-notifications setup
   - request permissions في first launch
   - register FCM token (Expo notification token)
   - أرسل لـ Backend: POST /me/fcm-token
   - استقبل push messages
   - tap على notification → ينتقل لـ relevant screen (order details)
3. NotificationsScreen (in-app):
   - قائمة من /notifications
   - read/unread states
   - pull-to-refresh
   - tap → ينتقل للـ related order
4. Polish عام:
   - empty states (no orders, no notifications, etc)
   - error states (network error, server error)
   - loading skeletons everywhere
   - haptic feedback (expo-haptics) على الأزرار المهمة
5. commit: "feat(phase-2-day9): push notifications + alerts cron + polish"
```

---

## 👨‍🎨 خالد — يوم 22: Mobile - Bug Bash + RTL Polish + 3 Service Flows E2E

**البرومبت:**

```
سياق: e:/Tamem/. Phase 2 - Day 22.

1. اختبر 3 user journeys end-to-end (موبايل + داشبورد):
   **Journey 1: Delivery order (نص + صورة)**
   - عميل: اختر دليفري → اختر محل → اكتب الطلب نصياً → ارفع صورة → اختر عنوان → اختر دفع → تأكيد
   - WhatsApp confirmation يصل
   - أدمن: يرى الطلب في dashboard
   - أدمن: يراجعه → يسعّره → يعيّن سائق → يغيّر الحالة
   - عميل: يتلقى updates لحظية
   - اختبر كل المسار
   **Journey 2: Shipping (with pricing calculator)**
   - عميل: من قفط إلى الأقصر، طرد 5 كيلو، express
   - السعر يحسب لحظياً
   - تأكيد → ظهور في dashboard
   **Journey 3: Merchant bulk order**
   - عميل: 3 منتجات، 2 pickup points، 2 delivery points
   - dashboard: admin يسعّر يدوياً → moves to AWAITING_CUSTOMER_APPROVAL
   - عميل: يستلم notification → يوافق → ACCEPTED
2. سجّل كل bug في docs/PHASE-2-BUGS.md
3. أصلح كل bug
4. RTL spot-check كل شاشة
5. اختبر offline behavior (إيقاف الـ Wifi مؤقتاً)
6. commit: "fix(phase-2-day10): 3 e2e journeys verified + bugs fixed"
```

---

## 👨‍🎨 خالد — يوم 23: Mobile - Production Build via EAS + Internal Testing

**البرومبت:**

```
سياق: e:/Tamem/apps/mobile. Phase 2 - Day 23.

1. تأكد من Expo account + login (eas login)
2. أضف credentials في app.json:
   - Google Maps API key (Android)
   - EAS projectId
3. تحقق eas.json (preview + production profiles)
4. cd apps/mobile && eas build -p android --profile preview
5. انتظر البناء (10-15 دقيقة)
6. حمّل APK وثبّته على جهاز Android
7. اختبر user journeys على الـ APK الحقيقي:
   - تسجيل، دخول، تصفح، طلب، تتبع
   - تأكد API_URL يشير لـ production (تحديث في app.json/extras)
8. لو يعمل: eas submit للـ Internal Test Track على Play Console
9. وثّق في docs/PHASE-2-BUILD-NOTES.md أي gotchas
10. commit: "build(mobile): first APK + internal track submission"
```

---

## 👨‍🎨 خالد — يوم 24: Polish + Handoff Doc + Final Integration Check

**البرومبت:**

```
سياق: نهاية Phase 2. تجهيز للـ Phase 3 (الاثنان معاً).

1. polish نهائي للموبايل:
   - تأكد splash screen يختفي بعد load كل الـ data الأساسية
   - تأكد كل النصوص العربية
   - تأكد الأرقام بـ Arabic numerals
   - empty/error/loading states كاملة
2. شغّل: pnpm lint, pnpm typecheck, pnpm test, pnpm build (كله يجب يمر)
3. final integration test:
   - شغّل Backend + Dashboard + Mobile معاً
   - أنشئ 3 طلبات (واحد لكل category) من الموبايل
   - تأكد الأدمن يراهم في الـ dashboard
   - أكمل lifecycle كامل لكل واحد
4. اكتب docs/PHASE-2-HANDOFF.md:
   - ما تم بناؤه (Mobile + customer endpoints + integration)
   - ما تبقى لـ Phase 3 (Landing + production deploy + UAT)
   - أي endpoints أحمد بناها كانت ناقصة وتم استكمالها
   - أي bugs مفتوحة معروفة
5. افتح PR كبير "phase-2-mobile-complete" → أحمد يراجع → merge to main
6. commit: "chore(phase-2): polish + handoff doc + full integration verified"

🎉 نهاية Phase 2 - النظام كامل end-to-end: عميل يطلب من الموبايل، أدمن يدير من الداشبورد.
```

---

# 🟪 Phase 3 — الاثنان معاً (6 أيام)

### الهدف: Landing Page + Production Deploy + UAT + Training + Handoff للعميل.

---

## 👥 يوم 25: Landing Page Build + Deploy (الاثنان - قسّماها)

**البرومبت:**

```
سياق: e:/Tamem/apps/landing. Phase 3 - Day 25.

تقسيم اليوم:
- **خالد**: محتوى + screenshots + sections
- **أحمد**: deploy + DNS + Hostinger config

1. apps/landing/src/pages/index.astro موجود بمحتوى أولي. حسّنه:
   - استخدم screenshots حقيقية من الموبايل (من EAS APK build)
   - أكمل sections كاملة:
     • Hero (لوجو + tagline + CTAs)
     • Services (3 cards)
     • How it works (4 steps)
     • Service areas (map قفط/قنا active + الباقي قريباً)
     • Download app (Google Play badge + screenshots)
     • For merchants + For drivers (WhatsApp CTAs)
     • Contact
     • Footer
2. أكمل صفحات privacy.astro + terms.astro بمحتوى حقيقي:
   - تشاور مع العميل/محامي إن أمكن
   - يجب تذكر: ما البيانات اللي تُجمع، لماذا، كيف يحذف الـ user حسابه
3. SEO meta tags + Open Graph + sitemap
4. أضف Google Analytics (gtag placeholder)
5. شغّل: pnpm --filter @tamem/landing build
6. ارفع dist/ إلى Hostinger Shared Hosting (FTP):
   - deliverytamem.com → public_html/
7. اضبط DNS لو لم يكن:
   - deliverytamem.com → IP shared
   - admin.deliverytamem.com → IP VPS
   - api.deliverytamem.com → IP VPS
8. اختبر https://deliverytamem.com يفتح + WhatsApp links تشتغل
9. commit: "feat(landing): production build + hostinger deploy"
```

---

## 👥 يوم 26: Production Deploy (Backend + Dashboard) + DNS + SSL

**البرومبت:**

```
سياق: e:/Tamem/. Phase 3 - Day 26. اتبع docs/DEPLOYMENT.md.

أحمد يقود (Backend خبرته)، خالد يساعد (Dashboard build).

1. **Backend deploy على Hostinger VPS:**
   - SSH إلى VPS
   - git clone repo إلى /var/www/tamem
   - pnpm install --frozen-lockfile
   - cp .env.example .env → عدّل بقيم production
   - pnpm --filter @tamem/backend prisma:deploy
   - pnpm --filter @tamem/backend db:seed (production seed - مع admin الحقيقي للعميل)
   - pnpm --filter @tamem/backend build
   - cd apps/backend && pm2 start ecosystem.config.cjs --env production
   - pm2 save
2. **Dashboard deploy:**
   - pnpm --filter @tamem/dashboard build
   - rsync dist/ إلى VPS:/var/www/tamem/apps/dashboard/dist/
3. **Nginx config (موجود في docs/DEPLOYMENT.md):**
   - api.deliverytamem.com → proxy 127.0.0.1:4000
   - admin.deliverytamem.com → static dashboard/dist
   - /uploads/ → static
4. **SSL مع Let's Encrypt:**
   - certbot --nginx -d deliverytamem.com -d admin.deliverytamem.com -d api.deliverytamem.com
5. **Backup:**
   - أنشئ /etc/cron.daily/tamem-backup (mysqldump + gzip)
6. **Monitoring:**
   - UptimeRobot على /health
   - PM2 monitor
7. اختبر:
   - https://deliverytamem.com يفتح landing
   - https://admin.deliverytamem.com يفتح dashboard
   - https://api.deliverytamem.com/health يرجع 200
   - login من dashboard إلى الـ admin يعمل
8. commit: "ops(deploy): production deploy backend + dashboard + ssl"
```

---

## 👥 يوم 27: Mobile Production Build + Play Store Listing + Integration Test

**البرومبت:**

```
سياق: e:/Tamem/. Phase 3 - Day 27.

خالد يقود (Mobile خبرته)، أحمد يساعد (Play Console + assets).

1. **Mobile - production build:**
   - حدّث apps/mobile/app.json:
     • EXPO_PUBLIC_API_URL=https://api.deliverytamem.com/api/v1
     • EXPO_PUBLIC_WS_URL=https://api.deliverytamem.com
   - eas build -p android --profile production
   - حمّل AAB
2. **Google Play Console listing:**
   - app name: تميم للتوصيل
   - short + full description (4000 char عربي)
   - 5+ screenshots phone
   - icon 512×512
   - graphic banner 1024×500
   - Privacy URL: https://deliverytamem.com/privacy
   - Terms URL: https://deliverytamem.com/terms
   - Category, content rating, target audience
   - Data safety form (location, phone, etc)
3. ارفع AAB → Production track (أو Internal Track للبداية)
4. **Final integration test على بيئة production:**
   - حمّل APK production على جهاز
   - أنشئ test account
   - أكمل user journey (delivery + shipping + merchant)
   - تأكد كل update يصل للداشبورد لحظياً
   - تأكد WhatsApp confirmation يصل
   - تأكد notifications تشتغل
5. commit: "build(release): mobile production AAB + play store ready"
```

---

## 👥 يوم 28: QA Comprehensive + Arabic Proofreading + Bug Fixes

**البرومبت:**

```
سياق: e:/Tamem/. Phase 3 - Day 28.

الاثنان معاً.

1. أنشئ docs/QA-FINAL-CHECKLIST.md - شامل:

   ## Customer Journeys (على APK production)
   - [ ] تسجيل عميل جديد (OTP)
   - [ ] دخول existing user
   - [ ] تصفح الخدمات + المحلات على الخريطة
   - [ ] إنشاء طلب دليفري نصي + بصورة
   - [ ] إنشاء طلب شحن (مع price calculator)
   - [ ] إنشاء طلب تاجر (multi-pickup + multi-delivery)
   - [ ] استلام تأكيد WhatsApp
   - [ ] متابعة الطلب (timeline + Socket.IO)
   - [ ] الموافقة على سعر
   - [ ] إلغاء طلب
   - [ ] تعديل الملف الشخصي + إضافة عنوان
   - [ ] استلام push notification + tap عليها

   ## Admin Journeys (على dashboard production)
   - [ ] دخول admin
   - [ ] رؤية overview بأرقام حقيقية
   - [ ] الطلبات (filters + search + pagination)
   - [ ] فتح طلب + تسعير + تعيين سائق + تغيير الحالة لـ delivered
   - [ ] إضافة خدمة جديدة + رؤيتها في الموبايل فوراً
   - [ ] إضافة سائق + تاجر + منتج
   - [ ] تأكيد payment proof
   - [ ] حلّ alert من Alerts Center
   - [ ] export report CSV

2. شغّل كل journey وسجّل bugs في docs/PHASE-3-BUGS.md
3. صنّفهم: P0 (blocker) / P1 (major) / P2 (minor)
4. أصلح P0 + P1 (كل واحد في خبرته)
5. **Arabic proofreading:**
   - أحضر متحدث عربي (UX writer لو ممكن) لمراجعة:
     • نصوص الموبايل (i18n/ar.json)
     • نصوص الداشبورد
     • WhatsApp templates
   - عدّل النصوص
6. commit: "fix(phase-3): qa walkthrough + arabic proofread + p0/p1 fixed"
```

---

## 👥 يوم 29: UAT مع العميل + Final Polish

**البرومبت:**

```
سياق: e:/Tamem/. Phase 3 - Day 29.

الاثنان معاً مع إدارة تميم.

1. حضّر بيئة UAT:
   - APK مثبت على جهاز للعميل (internal track)
   - حسابات admin للعميل
   - بيانات seed كاملة + production data من اجتماع سابق
2. اجلس مع إدارة تميم لمدة 2-3 ساعات:
   - اشرح كل feature
   - لاحظ أين يتعثرون (يدل على UX bug)
   - سجّل كل feedback
3. أنشئ docs/UAT-FEEDBACK.md
4. صنّف الـ feedback:
   - blocking (لازم قبل الإطلاق - أصلح اليوم)
   - nice-to-have (Phase 4 - بعد الإطلاق)
   - misunderstanding (يحتاج training أو تحسين copy)
5. أصلح الـ blocking
6. للـ nice-to-have: backlog في docs/POST-LAUNCH-BACKLOG.md
7. commit: "feat(phase-3): UAT fixes + client-approved"
```

---

## 👥 يوم 30: Production Cutover + Training + Handoff

**البرومبت (يوم الإطلاق):**

```
سياق: نهاية المشروع. يوم الإطلاق الرسمي.

**الصباح (الاثنان):**
1. final backup للـ DB الحالي
2. deploy آخر نسخة من Backend + Dashboard:
   - git pull origin main
   - pnpm install --frozen-lockfile
   - pnpm --filter @tamem/backend prisma:deploy
   - pnpm --filter @tamem/backend build
   - pm2 reload tamem-api
   - rsync dashboard/dist إلى static path
3. update production seed لو فيه تغييرات (خدمات، تجار، إلخ)
4. smoke tests:
   - /health/ready يرجع 200
   - admin login يعمل
   - test order ينجح
5. DNS verification: deliverytamem.com + admin.* + api.* كلها live
6. Mobile: eas submit إلى production track (لو internal)
7. monitor logs: pm2 logs --lines 100

**بعد الظهر (الاثنان مع إدارة تميم):**
8. جلسة تدريب 2 ساعة - سجّلها فيديو:
   - كيف يضيف خدمة جديدة من Service Builder
   - كيف يدير الطلبات اليومية (review → price → assign → track)
   - كيف يضيف سائق/تاجر
   - كيف يقرأ التقارير
   - ماذا يفعل عند تنبيه من Alerts Center
   - كيف يحلّ شكوى عميل
9. سلّم وثائق:
   - docs/USER-MANUAL.md (للأدمن - اكتبها اليوم)
   - docs/DEPLOYMENT.md (للنشر المستقبلي - موجودة)
   - docs/MAINTENANCE.md (روتين الصيانة - cron backup, log rotation)
10. وقّع acceptance form مع العميل
11. commit final: "chore(release): v1.0.0 — production launch"
12. git tag v1.0.0 + push

🎉 المشروع تم تسليمه!
```

---

# 📝 ملاحظات مهمة لاستخدام البرومبتات

## قبل بدء أي يوم:

```bash
cd e:/Tamem
git pull origin main          # احصل على آخر التغييرات
pnpm install                  # تأكد المكتبات محدّثة
# اقرأ docs/DECISIONS.md و docs/PHASE-*-HANDOFF.md
```

## بعد كل يوم:

```bash
pnpm lint && pnpm typecheck && pnpm test    # تأكد ما كسرت شي
git add . && git commit -m "..."
git push -u origin <branch>
gh pr create                                # افتح PR
```

## ⚠️ قواعد التعارض الذهبية:

### في Phase 1 (أحمد سولو):

- أحمد يبني schema.prisma كاملاً يوم 1 - **لا أحد يعدّل بدونه**
- أحمد يضع admin endpoints فقط في openapi.yaml
- يترك مساحة لـ customer endpoints (سيضيفها خالد)

### في Phase 2 (خالد سولو):

- خالد **يقرأ schema.prisma** ولا يعدّل (لو احتاج تعديل → issue)
- خالد يضيف customer endpoints في openapi.yaml (ملحقة لـ admin endpoints التي أحمد كتبها)
- خالد يستخدم state machine (transitions.ts) كما هي
- خالد يستهلك packages/shared-types و validators بدون تعديل (إلا لو ضرورة قصوى)

### في Phase 3 (الاثنان):

- merge conflicts ممكنة فقط في:
  - `apps/backend/src/app.ts` (إضافة routes - منفصلة عادة)
  - `apps/backend/openapi.yaml` (أقسام منفصلة)
  - `docs/*` (ملف لكل مهمة)
- إذا حدث conflict: اجتماع 15 دقيقة لحله

## 🆘 عند الـ blockers:

| المشكلة                             | الحل                                              |
| ----------------------------------- | ------------------------------------------------- |
| خالد محتاج تعديل schema             | يفتح GitHub issue → أحمد يجاوب < 24h              |
| خالد محتاج endpoint admin غير موجود | issue لأحمد                                       |
| أحمد محتاج اختبار مع طلبات حقيقية   | mock orders في seed (موجودة من Phase 1 day 7)     |
| Backend deploy فشل                  | اتبع docs/DEPLOYMENT.md → استدعاء الزميل لو استمر |

---

**حظ موفق! 🚀 لا تنسوا commit صغير ومستمر.**
