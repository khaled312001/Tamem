# تميم للتوصيل — Tamem Delivery

> منصة توصيل وشحن متكاملة تخدم قفط وقنا أولاً، ثم تتوسع للمحافظات.

**فريق التنفيذ:** خالد أحمد · أحمد كمال
**العميل:** إدارة تميم للتوصيل
**المدة:** 30 يوم عمل (Phase 1 MVP)

---

## 📦 المكونات (Monorepo)

| الجزء                   | المسار                                                                  | التقنية                         | الـ Phase         |
| ----------------------- | ----------------------------------------------------------------------- | ------------------------------- | ----------------- |
| لوحة الإدارة            | [apps/dashboard/](apps/dashboard/)                                      | React + Vite + shadcn/ui        | Phase 1 (أحمد)    |
| Backend - admin side    | [apps/backend/](apps/backend/) (admin/\* endpoints + schema)            | Node + Express + Prisma + MySQL | Phase 1 (أحمد)    |
| تطبيق العميل            | [apps/mobile/](apps/mobile/)                                            | React Native + Expo             | Phase 2 (خالد)    |
| Backend - customer side | [apps/backend/](apps/backend/) (auth + orders + uploads + integrations) | نفس السيرفر، endpoints مختلفة   | Phase 2 (خالد)    |
| اللاندنج بيج            | [apps/landing/](apps/landing/)                                          | Astro                           | Phase 3 (الاثنان) |

### مكتبات مشتركة (packages)

- [packages/shared-types/](packages/shared-types/) — أنواع TypeScript مشتركة (مولّدة من OpenAPI)
- [packages/validators/](packages/validators/) — zod schemas مشتركة بين الفرونت والباك
- [packages/api-client/](packages/api-client/) — typed HTTP client مولّد
- [packages/ui-kit/](packages/ui-kit/) — design tokens للويب (ألوان، خطوط، tailwind preset)
- [packages/eslint-config/](packages/eslint-config/) — قواعد ESLint
- [packages/tsconfig/](packages/tsconfig/) — قواعد TypeScript الأساسية

---

## 🚀 البدء السريع (Quick Start)

### المتطلبات

- **Node.js** 20.11.0+ (`nvm use` يستخدم [.nvmrc](.nvmrc))
- **pnpm** 11+ (`npm i -g pnpm`)
- **MySQL** 8.0+ (محلي أو Docker)
- **Git**

### الإعداد

```bash
# 1. استنساخ المشروع
git clone <repo-url> tamem && cd tamem

# 2. تثبيت كل المكتبات (لكل الـ apps + packages في مرة واحدة)
pnpm install

# 3. نسخ ملف البيئة
cp .env.example .env
# عدّل القيم في .env (DB، JWT secrets، Google keys، ...)

# 4. تجهيز قاعدة البيانات
pnpm --filter @tamem/backend prisma migrate dev
pnpm --filter @tamem/backend prisma db seed

# 5. تشغيل كل شيء بالتوازي
pnpm dev
```

### تشغيل جزء واحد

```bash
pnpm --filter @tamem/backend dev      # Backend فقط على :4000
pnpm --filter @tamem/dashboard dev    # Dashboard فقط على :5173
pnpm --filter @tamem/mobile dev       # Expo dev server
pnpm --filter @tamem/landing dev      # Landing على :4321
```

---

## 🛠️ سكربتات الجذر

| الأمر            | الوظيفة                           |
| ---------------- | --------------------------------- |
| `pnpm dev`       | تشغيل كل التطبيقات بالتوازي       |
| `pnpm build`     | بناء كل الـ apps للإنتاج          |
| `pnpm lint`      | فحص الـ ESLint لكل الكود          |
| `pnpm typecheck` | فحص الـ TypeScript                |
| `pnpm test`      | تشغيل كل الاختبارات               |
| `pnpm format`    | تنسيق كل الكود بـ Prettier        |
| `pnpm clean`     | حذف كل الـ outputs و node_modules |

---

## 📚 الوثائق

- [docs/DECISIONS.md](docs/DECISIONS.md) — سجل القرارات المعمارية (ADR)
- [docs/BRAND.md](docs/BRAND.md) — الهوية البصرية (ألوان، خطوط)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — دليل النشر على Hostinger
- [docs/ONBOARDING.md](docs/ONBOARDING.md) — دليل المطور الجديد
- [docs/API.md](docs/API.md) — توثيق الـ API (Swagger UI)
- [docs/brief/](docs/brief/) — ملفات العرض والتصميم من العميل

---

## 👥 آلية العمل — تقسيم بالنطاقات (Verticals) لتجنّب التعارض تماماً

**التقسيم على 3 فيزات متتالية:**

| الفيز       | المطور             | المدة  | النطاق                                             |
| ----------- | ------------------ | ------ | -------------------------------------------------- |
| **Phase 1** | **أحمد كمال** سولو | 12 يوم | Dashboard + Admin Backend + Database + Admin APIs  |
| **Phase 2** | **خالد أحمد** سولو | 12 يوم | Mobile App + Customer Backend + الربط مع الداشبورد |
| **Phase 3** | **الاثنان معاً**   | 6 أيام | Landing + Production Deploy + UAT + Handoff        |

**لماذا هذا التقسيم؟**

- كل مطور يأخذ stack كامل (frontend + backend + DB + API) لنطاقه
- لا dependencies بين المطورين في Phase 1 و Phase 2
- في Phase 3 يلتقي الاثنان والنظام كله موّحد على نفس الـ DB ونفس الـ Backend codebase
- التفاصيل الكاملة في [docs/PROMPTS.md](docs/PROMPTS.md)

**ملكية المجلدات حسب الفيز:**

| المجلد                                                                                                                                                       | Phase 1 (أحمد)                           | Phase 2 (خالد)                                | Phase 3 (مشترك) |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------- | --------------- |
| `apps/dashboard/**`                                                                                                                                          | ✅ يبني                                  | يقرأ فقط                                      | تعديلات polish  |
| `apps/backend/prisma/schema.prisma`                                                                                                                          | ✅ يبنيه                                 | يقرأ - تعديل عبر issue                        | -               |
| `apps/backend/src/modules/admin/**`، `users/`، `drivers/`، `merchants/`، `services/` (admin)، `pricing/` (rules)، `payments/` (admin)، `alerts/`، `reports/` | ✅ يبني                                  | يقرأ ويستهلك                                  | -               |
| `apps/backend/src/modules/orders/transitions.ts`                                                                                                             | ✅ يبنيه (state machine)                 | يستهلك                                        | -               |
| `apps/backend/src/realtime/**`                                                                                                                               | ✅ يبني (Socket.IO server + admin rooms) | يضيف customer rooms                           | -               |
| `apps/backend/openapi.yaml`                                                                                                                                  | ✅ admin endpoints                       | يضيف customer endpoints                       | -               |
| `apps/mobile/**`                                                                                                                                             | -                                        | ✅ يبنيه كاملاً                               | تعديلات polish  |
| `apps/backend/src/modules/auth/**`                                                                                                                           | admin login فقط                          | ✅ يكمل customer (register/OTP/Google)        | -               |
| `apps/backend/src/modules/services/services.routes.ts` (public GET)                                                                                          | -                                        | ✅ يضيفه                                      | -               |
| `apps/backend/src/modules/orders/` (customer endpoints)                                                                                                      | -                                        | ✅ يبنيه (create, mine, get, approve, cancel) | -               |
| `apps/backend/src/modules/uploads/**`، `notifications/**`، `integrations/**`، `jobs/**`                                                                      | -                                        | ✅ يبني                                       | -               |
| `apps/landing/**`                                                                                                                                            | -                                        | -                                             | ✅ الاثنان      |

**Git workflow:**

- أحمد ينتهي Phase 1 → PR `phase-1-admin-complete` → خالد يراجع → merge
- خالد يبدأ Phase 2 من commit أحمد → يستهلك schema/state-machine كما هي
- خالد ينتهي Phase 2 → PR `phase-2-mobile-complete` → أحمد يراجع → merge
- Phase 3 = الاثنان يدمجان عملهما + يصلحان أي تعارضات (نادرة)

**عند الـ blocker:**

- خالد محتاج تعديل schema → issue → أحمد يجاوب خلال 24h
- خالد محتاج endpoint admin → issue
- داخل كل فيز: المطور سولو، لا انتظار

---

## 🎨 الهوية البصرية

| العنصر    | القيمة          |
| --------- | --------------- |
| أحمر تميم | `#E0301E`       |
| برتقالي   | `#EC7A2C`       |
| ذهبي      | `#F2A93B`       |
| رمادي     | `#58595B`       |
| داكن      | `#241310`       |
| العناوين  | Cairo Black 900 |
| النصوص    | Tajawal 400/800 |
| الاتجاه   | RTL (عربي)      |

التفاصيل في [docs/BRAND.md](docs/BRAND.md).

---

## 📝 الرخصة

ملكية خاصة — إدارة تميم للتوصيل · تنفيذ شركة برمجلي.
