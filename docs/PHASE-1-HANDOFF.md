# Phase 1 Handoff — أحمد ← خالد

> **Status:** Phase 1 (Admin Backend + Dashboard) جاهز للاستهلاك.
> Phase 2 (Mobile) متكامل تماماً مع نفس الـ DB ونفس الـ Backend — لا قواعد بيانات منفصلة.

---

## 🔗 كيف الـ Dashboard + Mobile مربوطين

```
┌─────────────────┐   ┌─────────────────┐
│  Dashboard      │   │  Mobile App     │
│  (Vite :5173)   │   │  (Expo Go)      │
└────────┬────────┘   └────────┬────────┘
         │  HTTP+WS            │  HTTP+WS
         ↓                     ↓
       ┌───────────────────────────┐
       │  Backend API :4000        │
       │  (Express + Socket.IO)    │
       └────────────┬──────────────┘
                    │ Prisma
                    ↓
            ┌─────────────────┐
            │  MySQL 8 :3306  │   ← قاعدة بيانات واحدة
            │  tamem          │
            └─────────────────┘
```

**تطبيق العميل + لوحة التحكم يقرآن ويكتبان على نفس قاعدة البيانات**، عبر نفس الـ Backend. لا يوجد API منفصل أو DB منفصلة. كل أمر يصدر من الـ dashboard ينتشر فوراً للموبايل عبر Socket.IO، والعكس.

### دورة طلب كاملة (مثبتة في الكود)

1. عميل في الموبايل يضغط "تأكيد" → `POST /api/v1/orders`
2. Backend يحفظ Order + OrderStatusHistory في DB
3. Backend يرسل `order:new` socket event → admin:orders room
4. Backend يرسل WhatsApp confirmation للعميل (لو credentials متاحة)
5. Dashboard يلتقط الـ event ويُحدّث `/orders` فوراً + toast
6. Admin يفتح drawer ويضغط "مراجعة" → `PATCH /api/v1/admin/orders/:id/status`
7. Backend → `dispatchOrderStatusChanged()` (في `orders/orderEvents.ts`):
   - يحدّث DB
   - ينشئ Notification record للعميل
   - يرسل `order:status` socket event على user:`<customerId>` + order:`<id>` + admin:orders
   - يرسل WhatsApp message (لو الحالة تتطلّب)
8. الموبايل يلتقط الـ event ويُحدّث `OrdersScreen` + `OrderTrackingScreen` فوراً
9. الموبايل يجيب الـ Notification الجديدة من `/notifications` ويعرضها في `NotificationsScreen`

### Single Source of Truth Files (لا تكرّر منطقها)

| Concern            | الملف                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| State Machine      | `packages/shared-types/src/orderStates.ts` (FE+BE) + `apps/backend/src/modules/orders/transitions.ts` (guard)                                        |
| Order side-effects | `apps/backend/src/modules/orders/orderEvents.ts` — أي تغيير حالة يمر بـ `dispatchOrderStatusChanged()`                                               |
| Socket rooms       | `apps/backend/src/realtime/channels.ts` + `realtime/ws.ts` (server) — `apps/dashboard/src/lib/socket.ts` + `apps/mobile/src/lib/socket.ts` (clients) |
| API client         | `packages/api-client/src/index.ts` (الـ dashboard يستخدم الـ typed methods، الموبايل يستخدم `api.raw.*`)                                             |
| Validation         | `packages/validators/src/**` (نفس zod schemas للموبايل والداشبورد والباك)                                                                            |

---

## ✅ ما تم بناؤه

### Database (Prisma + MySQL 8)

- `apps/backend/prisma/schema.prisma` — كامل، 12 حالة طلب، Service+ServiceField الديناميكي، Order متعدد النقاط، Payment، Alert، Offer، Setting، RefreshToken
- `apps/backend/prisma/seed.ts` — admin + mock customer + driver + 3 merchants + 9 categories + 5 services + 6 settings + 5 mock orders + 1 offer
- `apps/backend/tests/seed.test.ts` — Idempotency + unique key checks
- `docker-compose.yml` — MySQL 8 + phpMyAdmin (profile=tools)

### Backend (Express + Prisma)

#### Public (لا تحتاج auth)

- `GET /health`
- `GET /api/v1/services` + `GET /api/v1/services/:id`
- `GET /api/v1/categories`
- `GET /api/v1/merchants` (مع lat/lng/radius)
- `GET /api/v1/merchants/:id`
- `GET /api/v1/offers`

#### Auth

- `POST /api/v1/auth/register` (CUSTOMER)
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh` (مع rotation)
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/google` (Google ID token verify + upsert)
- `POST /api/v1/auth/otp/request` (stub)
- `POST /api/v1/auth/otp/verify` (stub — code يبدأ بـ `1` ينجح)

#### Authenticated

- `GET/PATCH /api/v1/me`
- `POST /api/v1/me/fcm-token`
- `POST /api/v1/orders` (create — customer)
- `GET /api/v1/orders/mine`
- `GET /api/v1/orders/:id` (مع التحقق من الملكية)
- `POST /api/v1/orders/:id/approve`
- `POST /api/v1/orders/:id/cancel`
- `POST /api/v1/pricing/estimate` (Haversine + base + per-km/kg + surcharges)
- `POST /api/v1/uploads` (multer + sharp resize إلى 1600px JPEG 85%)
- `GET /api/v1/notifications` + `/unread-count` + `PATCH /:id/read` + `PATCH /read-all`

#### Admin only (role=ADMIN)

- `GET /api/v1/admin/overview?range=today|week|month` — KPIs + 7-day trend
- **Services** — `GET/POST/PATCH/DELETE/duplicate` + field CRUD + reorder
- **Orders** — `GET ?status&category&customerId&driverId&search&from&to` + detail + `status` + `price` + `assign-driver` + `note` + `cancel`
- **Drivers** — full CRUD + status update
- **Merchants** — full CRUD (creates User+MerchantProfile)
- **Customers** — list + detail (with last 10 orders)
- **Products** — CRUD + bulk availability toggle
- **Pricing Rules** — CRUD
- **Payments** — list + confirm + reject
- **Alerts** — list + resolve
- **Reports** — `/revenue?groupBy=day|week|month` + `/services` + `/drivers` + `/customers`
- **Settings** — list + get + upsert + bulk
- **Categories** — CRUD
- **Offers** — CRUD

### Realtime (Socket.IO)

`apps/backend/src/realtime/ws.ts` — JWT في handshake.

**Rooms:**

- `admin:orders` — يستقبل `order:new`, `order:status` (تدخل تلقائياً لو role=ADMIN)
- `admin:alerts` — يستقبل `alert:new`
- `user:<userId>` — يستقبل order updates للمستخدم نفسه
- `order:<orderId>` — اشترك عبر `socket.emit('order:subscribe', orderId)` لمتابعة طلب معين

### Background Jobs (node-cron)

`apps/backend/src/jobs/alerts.ts` — يشتغل كل 5 دقائق ويولّد:

- `PENDING_ORDER` لو طلب `PRICED` بقاله أكثر من `order_pending_alert_minutes`
- `DRIVER_NOT_RESPONDING` لو سائق `BUSY` ومالوش location update أكثر من `driver_idle_alert_minutes`
- `CASH_LIMIT_EXCEEDED` لو `driver.cashOnHand > driver_cash_limit`

### Dashboard (React + Vite + TailwindCSS)

كل الصفحات شغّالة ومربوطة بالـ backend الحقيقي:

- `/login` — phone + password
- `/overview` — KPIs + LineChart الطلبات + PieChart الخدمات + BarChart الإيرادات (مع Socket toast)
- `/orders` — جدول كامل + filters + search debounced + drawer مع كل الإجراءات + Socket auto-refresh
- `/services` — grid cards + duplicate + soft-delete
- `/services/new` و `/services/:id/edit` — Service Builder مع:
  - عمود الفورم (40%)
  - عمود الحقول مع reorder
  - **معاينة حية** للموبايل بـ DynamicFormPreview (11 field type)
- `/customers` — table + search + detail dialog
- `/drivers` — grid cards + status toggle + add dialog
- `/merchants` — grid cards + add dialog
- `/products` — table مع inline edit للسعر + checkbox bulk availability
- `/pricing` — قواعد التسعير مع add dialog
- `/payments` — tabs (PENDING/PAID/FAILED) + proof zoom + confirm/reject
- `/reports` — 4 tabs (revenue/services/drivers/customers) + CSV export
- `/alerts` — مركز التنبيهات مع filter بـ severity + Socket auto-refresh + resolve
- `/settings` — qkeys/values editable
- `/*` (404) — صفحة جميلة بـ زر رجوع

### shared packages

- `@tamem/api-client` — تم تمديده بـ ~50 endpoint method (كل admin + كل public)
- `@tamem/types` — أنواع OrderStatus، UserRole، ORDER_TRANSITIONS، canTransition...

---

## ⚠️ ما لم يُبنَ (مسؤولية Phase 2 — خالد)

### Mobile app كامل

- React Native (Expo)
- DynamicForm component (5 field types الأساسية + الباقي)
- Home A/B screens
- Map screen (react-native-maps)
- Order tracking
- Profile + EditProfile
- Push notifications
- WhatsApp deep-link integration

### Backend extensions (خالد يضيفها داخل نفس الـ modules)

- `POST /auth/otp/request` و `/otp/verify` — حالياً stubs، خالد يربطهم بـ SMS gateway
- WhatsApp Cloud API الحقيقي (الـ stub موجود في `integrations/whatsapp.ts`)
- FCM push real implementation (`integrations/fcm.ts` لم يُكتب بعد)
- Google Maps client (`integrations/googleMaps.ts` لم يُكتب بعد — حالياً Haversine fallback)

---

## 🔒 Schema Rules — قبل ما تعدّل!

> **خالد:** لو احتجت أي تعديل في `schema.prisma` افتح GitHub issue. أحمد يجاوب خلال 24h.

### الحقول التي قد تحتاجها وموجودة بالفعل (لا تكررها):

| ما تحتاجه                 | موجود في                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| FCM token للـ push        | `User.fcmToken`                                                                                   |
| OTP verified              | `User.isPhoneVerified`                                                                            |
| Google ID                 | `User.googleId` (unique)                                                                          |
| تعليق العميل في الـ order | `Order.notes`                                                                                     |
| صور الـ order             | `Order.imageUrls` (JSON array)                                                                    |
| بيانات حقول ديناميكية     | `Order.customData` (JSON)                                                                         |
| timestamps lifecycle      | `pickedUpAt`, `deliveredAt`, `completedAt`, `cancelledAt`, `customerApprovedAt`, `whatsappSentAt` |
| تعدد نقاط استلام / توصيل  | `OrderPickupPoint[]` + `OrderDeliveryPoint[]` (مع sortOrder)                                      |
| سجل تغيير الحالات         | `OrderStatusHistory`                                                                              |
| إثبات الدفع               | `Payment.proofImageUrl`                                                                           |
| ساعات عمل التاجر          | `MerchantProfile.openHours` (JSON)                                                                |
| تقييم سائق/تاجر           | `DriverProfile.rating`, `MerchantProfile.rating`                                                  |

### State machine (لا تعدّلها — استهلكها):

```typescript
import { ORDER_TRANSITIONS, canRoleTransition, OrderStatus, UserRole } from '@tamem/types';
// أو من backend:
import { assertTransition } from 'apps/backend/src/modules/orders/transitions.ts';
```

---

## 🧪 الاختبارات

```bash
pnpm --filter @tamem/backend test
```

موجود:

- `tests/seed.test.ts` — idempotency
- `tests/auth.test.ts` — login + register + refresh + RBAC + /me
- `tests/services.test.ts` — Services CRUD + fields + duplicate + soft delete + 409 on active orders
- `tests/transitions.test.ts` — كل الانتقالات الـ 12 + role checks

> **محتاج MySQL شغّال علشان تختبر** auth/services/seed (transitions pure).

---

## 🚀 التشغيل

```bash
# 1. MySQL
docker compose up -d

# 2. Backend (terminal 1)
cd apps/backend
pnpm prisma migrate dev --name init   # أول مرة فقط
pnpm db:seed
pnpm dev                              # على :4000

# 3. Dashboard (terminal 2)
pnpm --filter @tamem/dashboard dev    # على :5173
```

### حسابات الاختبار

| Role          | Phone               | Password      |
| ------------- | ------------------- | ------------- |
| ADMIN         | `+201010254819`     | `admin123!`   |
| CUSTOMER      | `+201000000001`     | `customer123` |
| DRIVER        | `+201000000002`     | `driver123`   |
| MERCHANT (×3) | `+201000000010..12` | `merchant123` |

---

## 🐛 Gotchas

1. **Prisma + ESM:** كل imports داخل `apps/backend/src/**` لازم تنتهي بـ `.js` حتى لو الملف `.ts` (متطلّب NodeNext).
2. **Socket.IO JWT:** الـ token لازم يكون في `socket.handshake.auth.token` أو `?token=`. يحدث 401 لو missing.
3. **Order status updates** من dashboard — controller يستدعي `assertTransition` ثم `emitOrderStatusChange` تلقائياً → الموبايل يستلم event على `order:<id>` و `user:<customerId>`.
4. **Pricing estimate (`POST /pricing/estimate`)** الآن public — خالد يقدر يستخدمه قبل الـ login.
5. **Mock orders** في seed (`TMM-MOCK-*`) للاختبار في الـ dashboard. احذفهم لما الطلبات الحقيقية تجي من الموبايل.
6. **Categories `id`** هو نفسه الـ slug (مثال: `restaurants`). دي قرار مقصود لتسهيل seed وretrieve.
7. **Notifications endpoint** يستخدم `paginated` helper — اللي بيرجع `data + meta.pagination` (مش `unread` count). للـ unread استخدم `/notifications/unread-count`.

---

🎉 **Phase 1 done. ready for Phase 2.**
