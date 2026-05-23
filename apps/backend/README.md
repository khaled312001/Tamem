# @tamem/backend

Backend API لمنصة تميم للتوصيل.

**Stack:** Node 20 · Express · Prisma · MySQL · Socket.IO · TypeScript
**Owner:** أحمد كمال

## التشغيل المحلي

```bash
# من جذر الـ monorepo
pnpm install

# اضبط .env (من .env.example في الجذر)

# جهّز DB
pnpm --filter @tamem/backend prisma:generate
pnpm --filter @tamem/backend prisma:migrate
pnpm --filter @tamem/backend db:seed

# شغّل في وضع التطوير
pnpm --filter @tamem/backend dev
```

API على http://localhost:4000 — صحة على /health.

## السكربتات

| الأمر            | الوظيفة                                                  |
| ---------------- | -------------------------------------------------------- |
| `dev`            | tsx watch — تطوير                                        |
| `build`          | بناء TypeScript للإنتاج                                  |
| `start`          | تشغيل dist/                                              |
| `prisma:migrate` | إنشاء/تطبيق migration                                    |
| `prisma:studio`  | فتح Prisma Studio (GUI للـ DB)                           |
| `db:seed`        | تعبئة بيانات أولية (admin + خدمات)                       |
| `gen:types`      | توليد TS types من openapi.yaml إلى packages/shared-types |
| `test`           | vitest                                                   |

## الهيكل

```
src/
├── index.ts                # bootstrap (http + socket.io + prisma)
├── app.ts                  # express factory
├── config/env.ts           # zod-validated env
├── db/prisma.ts            # PrismaClient singleton
├── middleware/             # auth, validate, errorHandler
├── modules/
│   ├── auth/               # register, login, refresh, OTP
│   ├── services/           # ⭐ dynamic services CRUD
│   ├── orders/             # ⭐ 12-state machine (transitions.ts)
│   └── ...                 # (إضافة تدريجية)
├── realtime/               # Socket.IO rooms & events
├── integrations/           # whatsapp, fcm, google maps
├── jobs/                   # node-cron (alerts sweep)
└── utils/                  # logger, errors, response helpers

prisma/
├── schema.prisma           # ⭐ نموذج البيانات الكامل
├── seed.ts                 # admin + 3 services + categories
└── migrations/

openapi.yaml                # ⭐ عقد الـ API (single source of truth)
```

## القرارات الجوهرية

- **JWT access (15m) + Refresh (30d)** مخزن hashed في DB
- **Soft delete للخدمات** (تعطيل بدل الحذف للحفاظ على سجل الطلبات)
- **Order Status Machine** في `src/modules/orders/transitions.ts` — الكل يمر عبر `assertTransition()`
- **OpenAPI أولاً**: أي endpoint جديد يبدأ بتحديث `openapi.yaml` ثم `pnpm gen:types`
