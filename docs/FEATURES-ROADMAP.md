# Tamem Features Roadmap

**خطة احترافية لتطوير التطبيق ليصبح في مستوى Talabat / Uber Eats / inDriver**

---

## 🎯 المبدأ التصميمي

كل ميزة تخدم سؤالاً واحداً: **"كيف نقلّل الاحتكاك بين العميل والطلب؟"**

تطبيقات التوصيل الناجحة لا تتفوق بعدد الميزات، بل بـ **الطلب بأقل عدد ضغطات ممكنة**. الـ Quick Order FAB هو القلب — الباقي يبني حوله.

---

## 🚀 Tier 0 — جاري التنفيذ الآن

### 1. **Quick Order Floating Button** ⭐ (الميزة المميزة)

- زر عائم في كل شاشة (FAB)
- عند الضغط: bottom sheet بـ **3 طرق طلب فورية**:
  - 📝 **اكتب طلبك** — textarea بسيط + موقع التسليم
  - 📸 **ارفع صورة** — صورة + ملاحظات قصيرة
  - 🎙️ **سجّل صوتياً** — تسجيل voice note (max 60s)
- العميل يصل لـ "طلبت" في **3 ضغطات بدلاً من 7**
- الإدارة تستلم الطلب وتراجعه وتسعّره يدوياً

### 2. **شاشات متخصصة لكل category**

- **DeliveryServicesScreen** — قائمة بكل خدمات الدليفري (مطاعم، صيدلية، سوبر ماركت...)
- **ShippingFlowScreen** — flow الشحن كامل (من → إلى + وزن + حجم + بوصلة سعر)
- **MerchantFlowScreen** — flow طلب التاجر (multi-products + multi-pickup + multi-delivery)

---

## 🥇 Tier 1 — Quick wins (أسبوع - أسبوعين)

### 3. **Saved Addresses (دفتر العناوين)**

- "المنزل / العمل / آخر" + GPS pin لكل واحد
- ضغطة واحدة لاختيار في checkout
- مفضلة + ترتيب يدوي

### 4. **Order History + Re-order**

- "اطلب نفس الطلب" — يستنسخ آخر طلب بنفس الأصناف والعنوان
- top 3 طلبات متكررة في top of My Orders

### 5. **Live Order Tracking**

- خريطة حية + موقع السائق (lat/lng من driver app)
- ETA يتحدث كل 30 ثانية
- 12-state timeline visual
- زر اتصال مباشر بالسائق

### 6. **Ratings & Reviews**

- بعد التسليم: 5 نجوم + كومنت اختياري
- يخزن في DB → يظهر تقييم السائق + المحل
- يقلل الطلبات السيئة عن طريق ranking

### 7. **Favorites (المفضلة)**

- ❤️ على كل متجر + منتج
- صفحة /favorites مع filters

### 8. **Search History + Suggestions**

- آخر 10 عمليات بحث في الـ search bar
- اقتراحات popular searches في cold start

### 9. **In-App Notifications Inbox**

- قائمة كل الـ push notifications المستلمة
- read/unread + tap → ينقل لـ relevant order
- زر "Clear all"

---

## 🥈 Tier 2 — UX polish + monetization (3-5 أيام لكل ميزة)

### 10. **Promo Codes & Discounts**

- حقل "كود خصم" في checkout
- types: percent off, fixed off, free delivery, BOGO
- usage limit + expiry + per-user-once

### 11. **Wallet (محفظة تميم)**

- رصيد يتشحن بـ Vodafone Cash / Instapay / بطاقة
- استخدام مباشر في الدفع
- cashback من كل طلب (مثلاً 2%)

### 12. **Loyalty Points (نقاط)**

- نقطة لكل جنيه ينفقه
- 100 نقطة = 10 ج.م خصم
- مستويات: برونزي / فضي / ذهبي

### 13. **Schedule Order (جدولة طلب)**

- "اطلب الآن" أو "اطلب لاحقاً"
- date + time picker
- التطبيق يرسل reminder قبل وقت الطلب بـ 30 دقيقة

### 14. **Order Chat (شات مع السائق)**

- in-app messaging بين العميل والسائق
- preset messages: "وصلت" / "اتأخرت 5 دقايق" / "في الباب"
- send location pin

### 15. **Delivery Instructions**

- بعد العنوان: حقل تعليمات
- شارت إضافية:
  - 🔔 رنّ الجرس
  - 🚪 اترك عند الباب
  - 📞 اتصل قبل الوصول
  - 🏢 اسأل الحارس

### 16. **Order Invoice PDF**

- زر "تحميل فاتورة" بعد إكمال الطلب
- PDF بـ logo تميم + كل التفاصيل
- البريد الإلكتروني يرسلها تلقائياً

### 17. **Multi-Language (عربي + إنجليزي)**

- toggle في الإعدادات
- كل النصوص في i18n/ar.json + en.json
- RTL ↔ LTR ديناميكي

### 18. **Dark Mode**

- toggle + اتباع نظام الجهاز
- ألوان مظلمة لكل العناصر

---

## 🥉 Tier 3 — Advanced (شهر+)

### 19. **AI Voice Assistant**

- "تميم، اطلبلي بيتزا من اسكندراني"
- يفهم النية، يفتح المتجر، يضيف للسلة
- استخدام Whisper API + GPT للـ NLU

### 20. **AR Menu (للمطاعم)**

- وجّه الكاميرا على الطعام → ترى معلومات (سعرات / مكونات)

### 21. **Group Orders (طلب جماعي)**

- شارك link مع أصدقاء → كل واحد يضيف من نفس الطلب
- الفاتورة تنقسم تلقائياً

### 22. **Group Buying (شراء مشترك)**

- طلب موحد للجيران → خصم لكل واحد
- يحتاج 5 طلبات في نفس المنطقة خلال ساعة

### 23. **Subscriptions (اشتراكات شهرية)**

- "تميم بلس": رسوم 49 ج.م/شهر = توصيل مجاني + خصم 10%
- نموذج مثل Talabat Pro

### 24. **Referral Program**

- "ادعو صديق، خد 25 ج.م رصيد + هو يبدأ بـ 25 ج.م"
- referral code unique لكل user

### 25. **Recurring Orders (طلبات متكررة)**

- "كل أسبوع يوم الجمعة، اطلبلي نفس الطلب"
- مثل subscription لكن للطلبات

### 26. **Live Chat Support**

- chat بـ admin مباشرة في التطبيق
- مع typing indicator + read receipts

### 27. **Driver Tipping (بقشيش)**

- بعد التسليم: زر "أعطي بقشيش للسائق"
- 5 / 10 / 20 ج.م أو مبلغ مخصص

### 28. **Smart Home Address (عنوان البيت الذكي)**

- "البيت" يكتشف موقع الـ user تلقائياً (history-based)
- يقترح "اطلب لـ البيت؟" بـ one tap

### 29. **Heatmap للسائقين (للأدمن)**

- خريطة بالطلبات النشطة + توزيع السائقين
- اقتراح "حرّك سائقين من قفط إلى قوص"

### 30. **Predictive Pricing (للأدمن)**

- ML model يقترح سعر مناسب بناءً على التاريخ
- "السعر المقترح: 45 ج.م (متوسط 5 طلبات مشابهة)"

---

## 📊 الأولويات (مقترح للفريق)

| Sprint              | الميزات                                     | Duration |
| ------------------- | ------------------------------------------- | -------- |
| **Sprint 1** (جاري) | Quick Order FAB + 3 Category screens        | 3 أيام   |
| **Sprint 2**        | Saved Addresses + Live Tracking + Re-order  | 5 أيام   |
| **Sprint 3**        | Ratings + Favorites + Notifications Inbox   | 4 أيام   |
| **Sprint 4**        | Promo codes + Wallet + Loyalty              | 7 أيام   |
| **Sprint 5**        | Schedule + Chat + Instructions + Invoice    | 6 أيام   |
| **Sprint 6**        | Multi-language + Dark mode + Polish         | 4 أيام   |
| **Future**          | AI assistant + Subscriptions + Group orders | 1+ شهر   |

**كل Sprint = release جديد على Play Store** → users يشعرون بتحسن مستمر.

---

## 💡 ميزات لا تكلف شيء (Differentiators)

ميزات صغيرة لكنها تخلق فرق كبير في تجربة المستخدم:

- 🎯 **Confetti animation** عند أول طلب
- ⚡ **Haptic feedback** على كل ضغطة مهمة
- 🌗 **Skeleton loaders** بدلاً من spinners
- 🔔 **Sound on order received** (notification sound مخصص)
- 🎨 **Dynamic icon** يتغير حسب الوقت/الموسم
- 📊 **Order stats** في الـ profile: "أنت من أكثر 100 عميل لتميم!"
- 🎁 **Surprise discount** عشوائي للعملاء الأقل نشاطاً (re-engagement)
- 📱 **Smart open** — لو فتح التطبيق وعنده طلب جاري، يفتح على Tracking مباشرة

---

**خالد · 2026-05-23 · Features Roadmap v1**
