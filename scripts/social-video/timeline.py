# -*- coding: utf-8 -*-
"""One timeline, read by both the soundtrack and the picture.

Durations are in seconds. Keeping them here is what lets a whoosh land exactly
on a scene change and the chime land on the order-confirmed screen.
"""

FPS = 30
W, H = 1080, 1920

# kind: "journey" uses a screenshot + bullets; the rest are hand-drawn scenes.
SCENES = [
    dict(kind="cover", dur=5.0, slug="cover"),
    dict(kind="download", dur=5.6, slug="download"),

    dict(kind="hero", dur=3.0, slug="splash", shot="raw_splash",
         kicker="البداية", head="أول ما تفتح التطبيق",
         sub="شاشة واحدة، وبعدها على طول أنت جوه"),

    dict(kind="journey", dur=3.8, slug="register", shot="raw_register",
         kicker="الحساب", head="أنشئ حسابك في دقيقة",
         sub="اسمك، رقمك، ومدينتك — وخلاص",
         items=[("رقم عليه واتساب", "كل تأكيدات الطلب توصلك عليه"),
                ("كلمة مرور بسيطة", "٨ أحرف على الأقل"),
                ("أو ادخل بجوجل", "بضغطة واحدة")]),

    dict(kind="journey", dur=4.0, slug="home", shot="raw_home",
         kicker="الرئيسية", head="كل حاجة في مكان واحد",
         sub="المتاجر والخدمات والعروض قدامك من أول ثانية",
         items=[("بحث فوري", "اكتب اسم منتج أو متجر"),
                ("عروض وخصومات", "أول حاجة تشوفها"),
                ("خدمات تميم", "دليفري وشحن وخدمة التجار")]),

    dict(kind="journey", dur=3.6, slug="search", shot="raw_search",
         kicker="البحث", head="دوّر على اللي انت عايزه",
         sub="النتائج بتظهر وانت بتكتب",
         items=[("متاجر ومنتجات", "نتيجتين في بحث واحد"),
                ("السعر واضح", "قبل ما تدخل أصلاً"),
                ("بحث بالصوت", "اضغط المايك وقول")]),

    dict(kind="journey", dur=3.6, slug="categories", shot="raw_service",
         kicker="الأقسام", head="اختار القسم اللي يناسبك",
         sub="عشرة أقسام تغطي طلبات اليوم كله",
         items=[("مطاعم وصيدليات", "أشهر الأقسام في الأول"),
                ("سوبر ماركت ومخابز", "طلب البيت كله"),
                ("لحوم وخضار وعطارة", "وبن وقهوة كمان")]),

    dict(kind="journey", dur=3.6, slug="stores", shot="raw_stores",
         kicker="المتاجر", head="شوف المتاجر القريبة منك",
         sub="فلتر بالمدينة والقسم",
         items=[("مفتوح أو مقفول", "علامة واضحة على كل متجر"),
                ("فلترة بالمدينة", "قفط، قنا، أو المحافظة"),
                ("أقسام جوه المتجر", "بيتزا، كريب، وجبات")]),

    dict(kind="journey", dur=3.6, slug="store", shot="raw_store",
         kicker="داخل المتجر", head="ادخل المتجر وشوف المنيو",
         sub="صور المنيو الحقيقية وكل الأصناف",
         items=[("منيو بالصور", "اضغط للتكبير والزوم"),
                ("العنوان والمواعيد", "تعرف هو فاتح ولا لأ"),
                ("شارك المتجر", "ابعت اللينك لأي حد")]),

    dict(kind="journey", dur=3.8, slug="product", shot="raw_product",
         kicker="المنتج", head="اختار المنتج والحجم",
         sub="الوصف والمكوّنات والسعر قبل ما تضيف",
         items=[("أحجام وأسعار", "السعر بيتغير معاك"),
                ("وصف كامل", "تعرف المكوّنات"),
                ("أضف للسلة أو اطلب", "زرارين حسب ما يريحك")]),

    dict(kind="journey", dur=4.0, slug="quick", shot="raw_quick",
         kicker="اطلب أي حاجة", head="مش لاقي اللي انت عايزه؟",
         sub="اطلب بأي طريقة تريحك — واحنا نجيبهولك",
         items=[("اكتب طلبك", "٢ كيلو سكر، نوتة… زي ما تحب"),
                ("ارفع صورة", "روشتة أو قائمة مكتوبة"),
                ("سجّل صوتي", "لحد ٦٠ ثانية")]),

    dict(kind="journey", dur=3.8, slug="form", shot="raw_form",
         kicker="تفاصيل الطلب", head="اكتب التفاصيل وحدّد العنوان",
         sub="كله في شاشة واحدة",
         items=[("أرفق لحد ٣ صور", "علشان يوصل مظبوط"),
                ("موقعك الحالي", "ضغطة واحدة و GPS ياخد مكانك"),
                ("فوري أو بجدولة", "اختار الوقت")]),

    dict(kind="journey", dur=3.6, slug="cart", shot="raw_cart",
         kicker="السلة", head="راجع سلتك قبل ما تكمّل",
         sub="عدّل الكميات وشوف الإجمالي لحظة بلحظة",
         items=[("تعديل وحذف", "زوّد، قلّل، أو شيل"),
                ("مقترحات تكمّل طلبك", "من نفس المتجر"),
                ("إجمالي واضح", "لكل متجر وإجمالي كلي")]),

    dict(kind="journey", dur=4.0, slug="checkout", shot="raw_checkout",
         kicker="إتمام الطلب", head="عنوانك وطريقة الدفع",
         sub="ورسوم التوصيل قدامك قبل ما تأكد",
         items=[("كاش عند الاستلام", "مفيش أي دفع مقدم"),
                ("رسوم توصيل واضحة", "بتتحسب حسب منطقتك"),
                ("إجمالي قبل التأكيد", "تشوف كل جنيه")]),

    dict(kind="journey", dur=4.0, slug="success", shot="raw_success",
         kicker="التأكيد", head="تم استلام طلبك",
         sub="رقم طلب خاص بيك، وتأكيد فوري",
         items=[("رقم الطلب", "احتفظ بيه للمتابعة"),
                ("مراجعة فورية", "الإدارة بتراجع في دقائق"),
                ("تأكيد على واتساب", "ومعاه نسخة على الإيميل")]),

    dict(kind="whatsapp", dur=6.0, slug="whatsapp"),
    dict(kind="email", dur=4.6, slug="email"),

    dict(kind="journey", dur=3.8, slug="track", shot="raw_track",
         kicker="التتبع", head="تابع طلبك خطوة بخطوة",
         sub="من الاستلام للتسعير للطريق للتسليم",
         items=[("أربع مراحل واضحة", "تعرف طلبك فين بالظبط"),
                ("السعر والخدمة", "مكتوبين فوق"),
                ("مسار التوصيل", "العنوان اللي رايحله")]),

    dict(kind="journey", dur=3.4, slug="account", shot="raw_profile",
         kicker="حسابك", head="كل حاجة متسجّلة ليك",
         sub="طلباتك وعناوينك ومفضلتك",
         items=[("سجل طلباتك", "الحالية والمكتملة"),
                ("عناوين محفوظة", "اطلب تاني من غير كتابة"),
                ("المفضلة والعروض", "متاجرك وكوبوناتك")]),

    dict(kind="cta", dur=6.0, slug="cta"),
]

STARTS = []
_t = 0.0
for _s in SCENES:
    STARTS.append(_t)
    _t += _s["dur"]
DURATION = _t
