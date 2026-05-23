# دليل المطور الجديد

دليل سريع لتشغيل المشروع محلياً والبدء في المساهمة. مدة الإعداد: ~30 دقيقة.

---

## 1. المتطلبات

- **Node.js** 20.11.0 → استخدم `nvm install && nvm use` (يأخذ من `.nvmrc`)
- **pnpm** 11+ → `npm i -g pnpm`
- **MySQL** 8 — محلي أو Docker
- **Git**
- (للموبايل) **Expo Go** على هاتفك أو Android Emulator

اختياري لكن مفيد:

- **Prisma Studio** (يأتي مع التثبيت) — GUI للـ DB
- **Postman** أو **Insomnia** — اختبار API

---

## 2. الإعداد

```bash
# 1. clone
git clone <repo-url> tamem
cd tamem

# 2. install
pnpm install

# 3. env
cp .env.example .env
# عدّل القيم — على الأقل:
# - DATABASE_URL
# - JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (أي string عشوائي طويل)

# 4. DB
pnpm --filter @tamem/backend prisma:migrate    # ينشئ الجداول
pnpm --filter @tamem/backend db:seed           # admin + خدمات

# 5. dev (كل شيء بالتوازي)
pnpm dev
```

التطبيقات على:

- Backend API: http://localhost:4000
- Dashboard: http://localhost:5173
- Landing: http://localhost:4321
- Mobile: Expo dev server — افتح Expo Go وامسح QR

---

## 3. حساب الـ Admin الافتراضي

بعد `db:seed`:

- **Phone:** `+201010254819`
- **Password:** `admin123!`

---

## 4. هيكل المشروع

اقرأ [README.md](../README.md) و [DECISIONS.md](DECISIONS.md) لفهم القرارات المعمارية.

```
apps/
├── backend/      ← Node + Express + Prisma + MySQL  (أحمد)
├── dashboard/    ← React + Vite + shadcn            (خالد)
├── mobile/       ← React Native + Expo               (خالد)
└── landing/      ← Astro static                      (أحمد)

packages/
├── shared-types/ ← TS types مشتركة
├── validators/   ← zod schemas مشتركة
├── api-client/   ← axios client مولّد
├── ui-kit/       ← design tokens للويب
├── eslint-config/
└── tsconfig/
```

---

## 5. آلية العمل

### الفرع والـ commit

```bash
# فرع جديد
git checkout -b be/<topic>   # أحمد
git checkout -b fe/<topic>   # خالد

# اشتغل، commit بـ conventional commits
git commit -m "feat(orders): add status update endpoint"

# رفع
git push -u origin <branch>
gh pr create   # أو من واجهة GitHub
```

### قبل الـ PR

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format
```

CI سيشغّلهم تلقائياً، لكن تشغيلهم محلياً يوفّر الوقت.

### لو غيّرت schema

```bash
# 1. عدّل apps/backend/prisma/schema.prisma
# 2. أنشئ migration
pnpm --filter @tamem/backend prisma:migrate
# 3. commit الـ migration files مع التغيير
```

### لو غيّرت openapi.yaml

```bash
pnpm --filter @tamem/backend gen:types
# commit packages/shared-types/src/api/ مع openapi.yaml
```

---

## 6. اختصارات pnpm مفيدة

```bash
# تشغيل أمر على workspace واحد
pnpm --filter @tamem/backend dev
pnpm --filter @tamem/dashboard add lodash      # تثبيت مكتبة في الداشبورد

# تشغيل أمر على الكل
pnpm -r build                # كل الـ packages
pnpm -r --parallel dev       # كل الـ dev servers

# Turbo (مع cache)
pnpm build                   # turbo build — لن يعيد بناء ما لم يتغيّر
```

---

## 7. مشاكل شائعة

### "Cannot find module '@tamem/types'"

```bash
pnpm install
# إن استمر: pnpm clean && pnpm install
```

### Prisma client outdated

```bash
pnpm --filter @tamem/backend prisma:generate
```

### Expo بطيء / لا يفتح

```bash
pnpm --filter @tamem/mobile dev -- --clear
```

### RTL لا يعمل على الموبايل بعد أول تثبيت

أعد فتح التطبيق (kill + restart). Expo يحتاج reload كامل لتطبيق `forceRTL`.

---

## 8. أين تجد ماذا

| تحتاج                   | اذهب إلى                                                                  |
| ----------------------- | ------------------------------------------------------------------------- |
| فهم القرارات المعمارية  | [DECISIONS.md](DECISIONS.md)                                              |
| الهوية البصرية والألوان | [BRAND.md](BRAND.md)                                                      |
| نشر إنتاجي              | [DEPLOYMENT.md](DEPLOYMENT.md)                                            |
| نموذج البيانات          | [apps/backend/prisma/schema.prisma](../apps/backend/prisma/schema.prisma) |
| عقد الـ API             | [apps/backend/openapi.yaml](../apps/backend/openapi.yaml)                 |
| نطاق المشروع الأصلي     | [docs/brief/](brief/)                                                     |

---

## 9. اتصل بـ

- **Backend & Landing:** أحمد كمال
- **Mobile & Dashboard:** خالد أحمد
- **PM/العميل:** عبر القناة المخصصة في Slack
