# تميم للتوصيل — Tamem Delivery

> منصة توصيل وشحن متكاملة تخدم قفط وقنا أولاً، ثم تتوسع للمحافظات.

**فريق التنفيذ:** خالد أحمد · أحمد كمال
**العميل:** إدارة تميم للتوصيل
**المدة:** 30 يوم عمل (Phase 1 MVP)

---

## 📦 المكونات (Monorepo)

| الجزء        | المسار                             | التقنية                         | المسؤول |
| ------------ | ---------------------------------- | ------------------------------- | ------- |
| تطبيق العميل | [apps/mobile/](apps/mobile/)       | React Native + Expo             | خالد    |
| لوحة الإدارة | [apps/dashboard/](apps/dashboard/) | React + Vite + shadcn/ui        | خالد    |
| Backend API  | [apps/backend/](apps/backend/)     | Node + Express + Prisma + MySQL | أحمد    |
| اللاندنج بيج | [apps/landing/](apps/landing/)     | Astro                           | أحمد    |

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

## 👥 آلية العمل (تجنّب التعارض)

**ملكية المجلدات:**

- `apps/mobile/**` + `apps/dashboard/**` + `packages/ui-kit/**` → **خالد**
- `apps/backend/**` + `apps/landing/**` + `prisma/schema.prisma` + `openapi.yaml` → **أحمد**
- `packages/shared-types/**` + `packages/validators/**` + `packages/api-client/**` → أحمد يكتب، الاثنان يستهلكون
- `docs/**` → الاثنان (ملف لكل ميزة)

**Git:**

- أسماء الفروع: `be/<topic>` (أحمد) · `fe/<topic>` (خالد)
- Trunk-based: الفرع يعيش ≤ 24 ساعة
- كل PR يحتاج موافقة الآخر (لا self-merge)
- Conventional Commits: `feat(orders): ...`

**العقد قبل الكود (Contract-First):**

1. أحمد يحدّث [apps/backend/openapi.yaml](apps/backend/openapi.yaml) **قبل** كتابة أي endpoint
2. CI يولّد `packages/shared-types/src/api/`
3. خالد يستهلك الـ types فوراً + يحاكي بـ MSW حتى يجهز التنفيذ

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
