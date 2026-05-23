# Pull Request

## What

<!-- ماذا تم تغييره؟ (1-2 جمل) -->

## Why

<!-- لماذا؟ (ربط بـ issue/task) -->

## How

<!-- كيف تم التنفيذ — نقاط معمارية مهمة فقط -->

## Affected areas

- [ ] Backend API (`apps/backend`)
- [ ] Mobile app (`apps/mobile`)
- [ ] Dashboard (`apps/dashboard`)
- [ ] Landing page (`apps/landing`)
- [ ] Shared packages (`packages/*`)
- [ ] Database schema (Prisma migration)
- [ ] API contract (`openapi.yaml`)

## Test plan

<!-- كيف نتحقق أن التغيير يعمل؟ -->

- [ ]
- [ ]

## Screenshots (للـ UI changes)

<!-- ارفق صور قبل/بعد للشاشات المتأثرة -->

## Checklist

- [ ] الكود يمر `pnpm lint`، `pnpm typecheck`، `pnpm test`
- [ ] لو غيّرت `openapi.yaml` أو `schema.prisma` → نبّهت الفريق
- [ ] لو غيّرت ملف مهم (env, deployment, schema) → حدّثت `docs/DECISIONS.md`
- [ ] RTL يعمل بشكل صحيح (إن وُجد UI)
- [ ] لا توجد console.log/debugger متبقية
- [ ] الـ PR يستهدف `main` ومدّته ≤ 24 ساعة
