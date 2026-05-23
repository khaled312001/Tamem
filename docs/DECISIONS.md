# Architecture Decision Records (ADR)

سجل القرارات المعمارية لمشروع تميم للتوصيل. كل قرار له رقم وتاريخ وسياق. **append-only** — لا يُعدّل قرار قديم، بل يُضاف قرار جديد ينقضه.

---

## ADR-001 — اختيار Stack المشروع

**Date:** 2026-05-23
**Status:** Accepted
**Context:** بدء مشروع جديد، فريق من شخصين، مدة 30 يوم، عميل يطلب React Native + MySQL على Hostinger.
**Decision:**

- **Mobile:** React Native + Expo (managed) + EAS Build
- **Backend:** Node 20 + Express + Prisma + TypeScript
- **Dashboard:** React 18 + Vite + TailwindCSS + shadcn/ui
- **Landing:** Astro static
- **DB:** MySQL 8 على Hostinger VPS
- **Repo:** Monorepo بـ pnpm workspaces + Turborepo
- **State (mobile):** Zustand + TanStack Query
- **Realtime:** Socket.IO

**Consequences:**

- المطورون يكتبون TS في كل مكان → مشاركة الأنواع سهلة
- Expo managed يلغي تعقيد native modules في Phase 1 (لا حاجة لـ Android Studio/Xcode للبناء)

---

## ADR-002 — Monorepo + API Contract-First

**Date:** 2026-05-23
**Status:** Accepted
**Context:** فريقان يعملان بالتوازي، مطور Frontend يحتاج يبني واجهات قبل ما يجهز Backend الـ endpoints.
**Decision:**

- `apps/backend/openapi.yaml` هو المصدر الوحيد للعقد
- `pnpm gen:types` يولّد `packages/shared-types/src/api/`
- خالد يستخدم MSW لمحاكاة الـ endpoints حتى ينتهي أحمد
- أي endpoint جديد = PR يحدّث openapi.yaml أولاً، ثم التنفيذ

**Consequences:**

- لا انحراف بين عقد الـ API والكود
- خالد لا يتعطل أبداً بسبب backend غير جاهز
- إضافة خطوة بسيطة (تحديث openapi.yaml) لكل endpoint

---

## ADR-003 — نموذج الخدمات الديناميكية الهجين

**Date:** 2026-05-23
**Status:** Accepted
**Context:** الأدمن يحتاج إضافة خدمات جديدة (اسم، حقول، تسعير) بدون أي تغيير في الكود.
**Decision:**

- جدول `Service` + جدول `ServiceField[]` للتعريف الـ normalized (قابل للاستعلام والترتيب)
- عمود `Order.customData JSON` لتخزين قيم الحقول المُدخلة (مرونة بدون migrations)
- مولد `<DynamicForm>` على الموبايل + معاينة حية في الداشبورد، الاثنان يستخدمان نفس `buildZodSchema()` من `@tamem/validators`

**Consequences:**

- إضافة خدمة جديدة = صف في DB، صفر كود
- لا فقدان للنوعية: الحقول الـ well-known (location, weight, ...) لها أعمدة top-level في Order
- المعاينة الحية في Builder تضمن أن الأدمن يرى ما سيراه العميل

---

## ADR-004 — JWT (15m) + Refresh Token (30d) Hashed

**Date:** 2026-05-23
**Status:** Accepted
**Context:** نحتاج auth يعمل على web (dashboard) و mobile، مع إمكانية revoke.
**Decision:**

- Access token: JWT 15 دقيقة، لا تخزين على السيرفر
- Refresh token: 30 يوم، مخزن hashed (SHA-256) في DB → يمكن revoke
- Rotation عند كل refresh
- Mobile: `expo-secure-store` · Web: `localStorage` (مع plan لرفع الأمان لاحقاً)

**Consequences:**

- توازن بين الأمان والـ UX
- يمكن لـ admin تسجيل خروج أي user من أي device

---

## ADR-005 — WhatsApp Deep-Link كأولوية، Cloud API كإضافة

**Date:** 2026-05-23
**Status:** Accepted
**Context:** WhatsApp Business API (Cloud API) يحتاج موافقة Meta (2-4 أسابيع)، لا نريد أن يكون على المسار الحرج.
**Decision:**

- Phase 1: التطبيق يفتح WhatsApp بـ deep-link (`whatsapp://send`) من جهاز العميل
- Cloud API يُضاف بشكل parallel (server-side dispatch) إذا تمت الموافقة، لكن ليس blocker
- رقم WhatsApp الرسمي في `Setting.whatsapp_business_number`

**Consequences:**

- صفر مخاطر إطلاق
- العميل يحتفظ برسالة WhatsApp كسند موّثق للطلب (طلب صريح من العميل)

---

## ADR-006 — Order State Machine في `transitions.ts`

**Date:** 2026-05-23
**Status:** Accepted
**Context:** 12 حالة للطلب، كل انتقال له role-based permissions.
**Decision:**

- خريطة الانتقالات في `packages/shared-types/src/orderStates.ts` (مشتركة FE+BE)
- Backend يستدعي `assertTransition(from, to, role)` في كل status update
- الانتقالات غير المسموحة ترمي `InvalidTransitionError` (422)
- روبوت الـ admin يمكنه تجاوز قيود الأدوار، لكن ليس قيود الـ FSM

**Consequences:**

- مستحيل وضع طلب في حالة غير صحيحة عبر API
- Frontend يستخدم نفس الخريطة لإخفاء الأزرار غير المتاحة

---

## كيفية إضافة قرار جديد

1. ARP-NNN — Title
2. Date, Status (Proposed/Accepted/Superseded)
3. Context (لماذا نتخذ قراراً؟)
4. Decision (ماذا قررنا؟)
5. Consequences (إيجابيات + سلبيات)
