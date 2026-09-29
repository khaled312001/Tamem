# تميم للتوصيل — Tamem Delivery

> منصة توصيل وشحن تخدم قفط وقنا، والتطبيق منشور على Google Play باسم
> **Delivery Tamem — تميم للتوصيل** (`com.tamem.delivery`).

**التنفيذ:** خالد أحمد · أحمد كمال — شركة برمجلي · **العميل:** إدارة تميم للتوصيل

---

## المكونات (Monorepo)

| الجزء        | المسار                             | التقنية                         |
| ------------ | ---------------------------------- | ------------------------------- |
| تطبيق العميل | [apps/mobile/](apps/mobile/)       | React Native · Expo SDK 54      |
| لوحة الإدارة | [apps/dashboard/](apps/dashboard/) | React + Vite + shadcn/ui        |
| الباك إند    | [apps/backend/](apps/backend/)     | Node + Express + Prisma + MySQL |
| اللاندنج     | [apps/landing/](apps/landing/)     | Astro                           |

**مكتبات مشتركة:** [shared-types](packages/shared-types/) (مولّدة من OpenAPI) ·
[validators](packages/validators/) (zod) · [api-client](packages/api-client/) ·
[ui-kit](packages/ui-kit/) (design tokens) · [eslint-config](packages/eslint-config/) ·
[tsconfig](packages/tsconfig/)

---

## ⚠️ أهم حاجة تعرفها عن الإنتاج

**السيرفر الحي مش بيشغّل كود Node.** استضافة Hostinger المشتركة بتشغّل PHP بس،
فالـ API الحي كله في ملف واحد:

```
apps/backend/dist-bundle/api.php      ← ده اللي شغال فعلاً على backendtamem.deliverytamem.com
```

الملف ده شيم (shim) بيقلّد endpoints الباك إند: تسجيل الدخول (bcrypt عبر
`password_verify`)، الطلبات، الرفع، قوالب إشعارات واتساب (`notifDefaultCatalog()`)،
وإيميلات الطلبات (`sendOrderEmail()` / `orderEmailHtml()`). أي تعديل في سلوك الـ API
لازم يتعمل هنا كمان، مش في `src/` بس.

- **النشر:** `python scripts/deploy-api.py` (وللوحة: `deploy-dashboard.py`)
- **قاعدة البيانات:** MySQL على نفس السيرفر. `DATABASE_URL` **لازم** يستخدم
  `localhost` — مستخدم `user@%` عليه سقف ٥٠٠ اتصال/ساعة ووقّع الـ API قبل كده.
- **استعلامات القراءة:** `python scripts/db-query.py "SELECT ..."` — للقراءة فقط.

---

## البدء السريع (تطوير محلي)

```bash
pnpm install                       # Node 20.11+ و pnpm 11+
cp .env.example .env               # عدّل DB و JWT secrets و Google keys
pnpm --filter @tamem/backend prisma migrate dev
pnpm dev                           # كل التطبيقات بالتوازي
```

| الأمر            | الوظيفة            |
| ---------------- | ------------------ |
| `pnpm dev`       | تشغيل كل التطبيقات |
| `pnpm build`     | بناء كل الـ apps   |
| `pnpm lint`      | ESLint             |
| `pnpm typecheck` | TypeScript         |
| `pnpm test`      | الاختبارات         |
| `pnpm format`    | Prettier           |

تشغيل جزء واحد: `pnpm --filter @tamem/mobile dev` (وكذلك `backend` / `dashboard` / `landing`).

---

## بناء نسخة الإصدار (Android)

```bash
cd apps/mobile/android
./gradlew.bat bundleRelease assembleRelease
```

المخرجات **مش** تحت `app/build/` — الـ build directory محوَّل لمسار قصير في
[apps/mobile/android/build.gradle](apps/mobile/android/build.gradle) هروباً من حد طول
المسارات في ويندوز:

```
E:/tb/app/outputs/bundle/release/app-release.aab
E:/tb/app/outputs/apk/release/app-release.apk
E:/tb/app/outputs/mapping/release/mapping.txt
```

بعد البناء انسخهم إلى `release/Tamem-Delivery-v<N>.{aab,apk}` مع الـ mapping،
وتأكد إن بصمة التوقيع ما اتغيرتش:

```bash
apksigner verify --print-certs release/Tamem-Delivery-v30.apk
# Signer #1 certificate SHA-256 digest:
# 4d6efae6a2819cf3bf11cc8af7b9ce48b49f3731ca2df787ef7ef2e11cbe0e8c
```

### مطبّات لازم تعرفها

- **الـ mapping مش بيتجدد مع كل بناء.** تغيير كود JS بيعيد توليد
  `index.android.bundle` من غير ما R8 يشتغل تاني، فالـ mapping بيفضل بتاريخه القديم
  وده طبيعي. للتأكد إن الـ AAB فيه آخر كود قارن هاش الـ bundle جوه الـ APK، مش
  تواريخ الملفات.
- **اتجاه RTL متثبّت من الكود الأصلي (native).** `I18nManager.forceRTL` من JS
  بيكتب flag بس، والاتجاه بيتقرأ وقت الإقلاع — عشان كده أول تشغيل بعد التثبيت كان
  بيطلع LTR. التثبيت بيحصل في `MainApplication.onCreate()` عن طريق
  `SharedPreferences`. متشيلهاش.
- **الـ APK للأجهزة الحقيقية بس (arm).** `reactNativeArchitectures` في
  `gradle.properties` مافيهاش x86_64، فمحاكي x86_64 بيقع عند الإقلاع. لتشغيله على
  محاكي: `./gradlew.bat assembleRelease -PreactNativeArchitectures=x86_64` —
  وماترفعش النسخة دي لحد.

---

## المجلدات

| المجلد                                       | فيه إيه                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| [scripts/](scripts/)                         | أدوات النشر والاستعلام والبذور (Python)                        |
| [scripts/social-post/](scripts/social-post/) | مولّد صور البوست والفيديو التعريفي                             |
| [docs/](docs/)                               | القرارات المعمارية والهوية والنشر والـ API                     |
| [legal/](legal/)                             | الاتفاقيات والعقود ومولّدها                                    |
| [store-assets/](store-assets/)               | أيقونات ولقطات وبانرات المتجر ونصوص الوصف                      |
| [qr-output/](qr-output/)                     | أكواد QR للروابط الاجتماعية ومولّدها                           |
| [infra/whatsapp/](infra/whatsapp/)           | خدمة جسر واتساب                                                |
| [backups/](backups/)                         | نسخ SQL احتياطية                                               |
| `release/`                                   | نسخ الإصدار الجاهزة وصور ومقاطع التسويق — **خارج git** (كبيرة) |
| `.work/`                                     | مساحة شغل مؤقتة للتوليد — **خارج git**                         |
| `.secrets/`                                  | مفاتيح وبيانات سرية — **خارج git، ولا تُرفع أبداً**            |

### الملفات السرية (خارج git كلها)

| الملف                                           | فيه إيه                                       |
| ----------------------------------------------- | --------------------------------------------- |
| `HANDOFF.md`                                    | بيانات الدخول والتسليم                        |
| `.secrets/STORE-UPLOAD-GUIDE.md`                | دليل الرفع على المتاجر + بيانات مفتاح التوقيع |
| `.secrets/hostinger-recovery-codes.txt`         | أكواد استرجاع الاستضافة                       |
| `.secrets/client_secret_*.json`                 | OAuth client لجوجل                            |
| `.secrets/tamem-acead-firebase-adminsdk-*.json` | مفتاح خدمة Firebase                           |
| `.env`                                          | إعدادات البيئة المحلية                        |

**مفتاح التوقيع** (`tamem-keystore.jks`) مخزَّن خارج الريبو تماماً — لو ضاع مش هينفع
تحديث التطبيق على المتجر تاني أبداً. خُد منه نسخة احتياطية في مكانين.

---

## الوثائق

- [docs/DECISIONS.md](docs/DECISIONS.md) — سجل القرارات المعمارية
- [docs/BRAND.md](docs/BRAND.md) — الهوية البصرية
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — النشر على Hostinger
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — التشغيل والطوارئ
- [docs/API.md](docs/API.md) — توثيق الـ API
- [docs/ONBOARDING.md](docs/ONBOARDING.md) — دليل المطور الجديد
- [docs/PROMPTS.md](docs/PROMPTS.md) — خطة الفيزات الأصلية (Phase 1/2/3) وتقسيم الملكية
  بين أحمد وخالد — مرجع تاريخي، الفيزات الثلاثة خلصت.

---

## الهوية البصرية

| العنصر    | القيمة          |
| --------- | --------------- |
| أحمر تميم | `#E0301E`       |
| برتقالي   | `#EC7A2C`       |
| ذهبي      | `#F2A93B`       |
| رمادي     | `#58595B`       |
| داكن      | `#241310`       |
| العناوين  | Cairo Black 900 |
| النصوص    | Tajawal 400/800 |
| الاتجاه   | RTL             |

التفاصيل في [docs/BRAND.md](docs/BRAND.md).

---

## الرخصة

ملكية خاصة — إدارة تميم للتوصيل · تنفيذ شركة برمجلي.
