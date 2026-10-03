# -*- coding: utf-8 -*-
"""Renders the 20-frame social carousel that walks a customer through Tamem,
from finding the app on Google Play to the order arriving at the door.

Frames 1-2 and 16-17 and 20 are drawn from scratch (store badges, QR, the
WhatsApp thread, the order e-mail); the rest wrap a real v30 screenshot.
"""
import os
import shutil

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from post_design import (W, H, GOLD, GOLD_LT, WHITE, CREAM, RED, RED_DEEP, INK,
                         F_BOLD, F_REG, ar, font, wrap, text_c, text_r, rounded,
                         background, header, device, bullets, caption, footer,
                         logo, save, grain, rounded_top)

TOTAL = 20
HERE = os.environ.get("TAMEM_POST_ROOT",
                      os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "frames")
SHOTS = os.path.join(HERE, "shots")
QR = os.path.join(HERE, "assets", "qr_card.png")
BADGE = os.path.join(HERE, "assets", "ar_badge_web_generic.png")
F_EMO = "C:/Windows/Fonts/seguiemj.ttf"

PLAY_URL = "play.google.com/store/apps/details?id=com.tamem.delivery"
LINKS_URL = "deliverytamem.com/links"

os.makedirs(OUT, exist_ok=True)

AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


def ind(s):
    return str(s).translate(AR_DIGITS)


def ltr(s):
    """Wrap a Latin token so bidi does not fling its '#' to the far side."""
    return "‪" + s + "‬"


ORDER_NO = ltr("#TMM89FE07446")


def shot(name):
    return os.path.join(SHOTS, name + ".png")


def path(i, slug):
    return os.path.join(OUT, "%02d-%s.png" % (i, slug))


def emo(draw, xy, ch, size):
    f = ImageFont.truetype(F_EMO, size)
    draw.text(xy, ch, font=f, embedded_color=True)
    return draw.textlength(ch, font=f)


def rtl_line(draw, right, y, text, fnt, fill, tail_emoji=None, esize=None):
    """Arabic ending at `right`; a trailing emoji lands on the visual left."""
    w = text_r(draw, right, y, text, fnt, fill)
    if tail_emoji:
        es = esize or int(fnt.size * 1.05)
        emo(draw, (right - w - 10 - es, y - 2), tail_emoji, es)
        w += es + 10
    return w


def card(canvas, box, radius=32, fill=(255, 255, 255, 255), shadow=True,
         outline=None, width=2):
    x0, y0, x1, y1 = box
    if shadow:
        sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([x0 + 4, y0 + 16, x1 + 4, y1 + 16],
                                             radius=radius, fill=(26, 4, 1, 150))
        canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(22)))
    layer = Image.new("RGBA", (int(x1 - x0), int(y1 - y0)), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle([0, 0, x1 - x0 - 1, y1 - y0 - 1],
                                            radius=radius, fill=fill,
                                            outline=outline, width=width)
    canvas.alpha_composite(layer, (int(x0), int(y0)))


def paste_fit(canvas, img_path, box_w, xy, alpha=None):
    im = Image.open(img_path).convert("RGBA")
    h = int(im.height * box_w / im.width)
    im = im.resize((box_w, h), Image.LANCZOS)
    if alpha is not None:
        a = im.getchannel("A").point(lambda v: int(v * alpha))
        im.putalpha(a)
    canvas.alpha_composite(im, (int(xy[0]), int(xy[1])))
    return box_w, h


# --------------------------------------------------------------------------
# the plain journey frames: screenshot on the left, reading column on the right
# --------------------------------------------------------------------------
def journey(i, slug, shot_name, kicker, head, sub, items,
            width=500, cx=318, bullet_top=24):
    c = background()
    header(c, i, TOTAL)
    y = title_block_(c, head, sub, kicker)
    top = int(y) + 34
    device(c, shot(shot_name), top, width=width, cx=cx)
    bullets(c, 1020, top + bullet_top, items)
    return save(c, path(i, slug))


def title_block_(c, head, sub, kicker):
    from post_design import title_block
    return title_block(c, 192, head, sub, kicker)


# --------------------------------------------------------------------------
# 1 - cover
# --------------------------------------------------------------------------
def frame_cover(i):
    c = background()
    d = ImageDraw.Draw(c)

    lg = logo(230)
    plate = Image.new("RGBA", (lg.width + 56, lg.height + 46), (255, 255, 255, 240))
    px = (W - plate.width) // 2
    c.alpha_composite(rounded(plate, 44), (px, 92))
    c.alpha_composite(lg, (px + 28, 115))

    y = 92 + plate.height + 30
    text_c(d, W / 2, y, "تميم للتوصيل", font(F_BOLD, 82), WHITE)
    y += 112
    text_c(d, W / 2, y, "اطلب أي حاجة من أي مكان — وتوصلك لحد باب البيت",
           font(F_REG, 34), CREAM, shadow=False)
    y += 90
    d.rounded_rectangle([(W - 180) / 2, y, (W + 180) / 2, y + 7], radius=4, fill=GOLD)
    y += 50

    # QR on the right (RTL: the eye lands there first), badge + links on the left
    qw = 348
    qx, qy = W - 82 - qw, y + 8
    card(c, (qx - 20, qy - 20, qx + qw + 20, qy + qw + 82), radius=34)
    paste_fit(c, QR, qw, (qx, qy))
    text_c(d, qx + qw / 2, qy + qw + 16, "امسح الكود ونزّل التطبيق",
           font(F_BOLD, 27), (120, 30, 14), shadow=False)

    bw, bx = 336, 86
    ly = qy + 6
    text_r(d, bx + bw, ly, "متاح الآن على", font(F_BOLD, 30), GOLD_LT)
    ly += 54
    _, bh = paste_fit(c, BADGE, bw, (bx, ly))
    ly += bh + 36
    fl = font(F_REG, 22)
    d.text((bx, ly), PLAY_URL[:38], font=fl, fill=(255, 226, 212))
    d.text((bx, ly + 32), PLAY_URL[38:], font=fl, fill=(255, 226, 212))
    ly += 92
    text_r(d, bx + bw, ly, "كل الروابط على", font(F_REG, 25), (255, 214, 196))
    d.text((bx, ly + 38), LINKS_URL, font=font(F_BOLD, 28), fill=GOLD)

    band = Image.new("RGBA", (W - 172, 96), (255, 255, 255, 34))
    c.alpha_composite(rounded(band, 28), (86, H - 178))
    text_c(d, W / 2, H - 155, "دليلك الكامل خطوة بخطوة — اسحب لليسار",
           font(F_BOLD, 32), WHITE, shadow=False)
    footer(c)
    return save(c, path(i, "cover"))


# --------------------------------------------------------------------------
# 2 - the three ways to get the app
# --------------------------------------------------------------------------
def frame_download(i):
    c = background()
    header(c, i, TOTAL)
    d = ImageDraw.Draw(c)
    y = title_block_(c, "نزّل التطبيق بثلاث طرق", "اختار أسهل طريقة ليك", "التنزيل")

    top = int(y) + 34
    ch_ = 230
    gap = 26
    rows = [
        ("١", "من متجر Google Play", "افتح المتجر وابحث عن «تميم للتوصيل» واضغط تثبيت", "badge"),
        ("٢", "من بحث جوجل", "اكتب «تميم للتوصيل» في جوجل وادخل على أول نتيجة", "search"),
        ("٣", "بمسح رمز الـ QR", "افتح كاميرا الموبايل ووجّهها على الكود — هيفتح المتجر", "qr"),
    ]
    for n, (num, title, note, kind) in enumerate(rows):
        y0 = top + n * (ch_ + gap)
        card(c, (78, y0, W - 78, y0 + ch_), radius=30,
             fill=(255, 255, 255, 30), outline=(255, 255, 255, 70))

        # number badge, right edge (RTL)
        bx, by = W - 78 - 30 - 74, y0 + 26
        d.ellipse([bx, by, bx + 74, by + 74], fill=GOLD)
        nw = d.textlength(ar(num), font=font(F_BOLD, 42))
        d.text((bx + (74 - nw) / 2, by + 12), ar(num), font=font(F_BOLD, 42), fill=(70, 26, 4))

        tx = bx - 24
        text_r(d, tx, y0 + 34, title, font(F_BOLD, 38), WHITE)
        ny = y0 + 90
        for line in wrap(d, note, font(F_REG, 26), 430):
            text_r(d, tx, ny, line, font(F_REG, 26), (255, 214, 196))
            ny += 38

        # the visual, on the left of the card
        if kind == "badge":
            paste_fit(c, BADGE, 260, (110, y0 + 78))
        elif kind == "search":
            sx, sy, sw, sh_ = 110, y0 + 82, 300, 68
            card(c, (sx, sy, sx + sw, sy + sh_), radius=34, fill=(255, 255, 255, 250),
                 shadow=False)
            d.ellipse([sx + sw - 52, sy + 20, sx + sw - 24, sy + 48],
                      outline=(120, 120, 128), width=4)
            d.line([(sx + sw - 30, sy + 44), (sx + sw - 20, sy + 54)],
                   fill=(120, 120, 128), width=4)
            text_r(d, sx + sw - 70, sy + 18, "تميم للتوصيل", font(F_REG, 28), (70, 70, 76))
        else:
            card(c, (110, y0 + 30, 110 + 170, y0 + 200), radius=20,
                 fill=(255, 255, 255, 255), shadow=False)
            paste_fit(c, QR, 150, (120, y0 + 40))

    footer(c)
    return save(c, path(i, "download"))


# --------------------------------------------------------------------------
# 16 - the WhatsApp thread
# --------------------------------------------------------------------------
WA_GREEN = (7, 94, 84)
WA_BG = (229, 221, 213)


def wa_bubble(canvas, x, y, lines, tail_emoji, time, max_w=560):
    """One incoming WhatsApp bubble. lines[0] is the bold sender line."""
    d = ImageDraw.Draw(canvas)
    fb = font(F_BOLD, 27)
    fr = font(F_REG, 27)
    laid = []
    for n, (txt, strong) in enumerate(lines):
        f = fb if strong else fr
        for l in wrap(d, txt, f, max_w - 46):
            laid.append((l, f))
    tw = max(d.textlength(ar(l), font=f) for l, f in laid)
    if tail_emoji:
        tw += 44
    bw = int(min(max_w, tw + 46))
    bh = 30 + 40 * len(laid) + 26

    card(canvas, (x, y, x + bw, y + bh), radius=20, fill=(255, 255, 255, 255),
         shadow=True)
    d = ImageDraw.Draw(canvas)
    # the little tail on the top-left, the way an incoming bubble has it
    d.polygon([(x, y + 4), (x - 14, y + 4), (x, y + 30)], fill=WHITE)

    ly = y + 18
    for n, (l, f) in enumerate(laid):
        rtl_line(d, x + bw - 22, ly, l, f, (17, 27, 33),
                 tail_emoji if n == 0 else None)
        ly += 40
    ft = font(F_REG, 20)
    d.text((x + 20, y + bh - 34), time, font=ft, fill=(140, 150, 155))
    return bh


def frame_whatsapp(i):
    c = background()
    header(c, i, TOTAL)
    y = title_block_(c, "تابع طلبك على واتساب",
                     "كل تغيير في حالة الطلب يوصلك رسالة فورية", "الإشعارات")

    x0, x1 = 100, W - 100
    y0 = int(y) + 30
    y1 = H - 60
    card(c, (x0, y0, x1, y1), radius=38, fill=(255, 255, 255, 255))

    d = ImageDraw.Draw(c)
    # header bar, clipped to the card's top corners
    bar = rounded_top(Image.new("RGBA", (int(x1 - x0), 118), WA_GREEN + (255,)), 38)
    c.alpha_composite(bar, (x0, y0))

    av = 78
    ax, ay = x1 - 26 - av, y0 + 20
    circ = Image.new("RGBA", (av, av), (255, 255, 255, 255))
    lg = logo(av - 14)
    circ.alpha_composite(lg, ((av - lg.width) // 2, 7))
    mask = Image.new("L", (av, av), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, av - 1, av - 1], fill=255)
    circ.putalpha(mask)
    c.alpha_composite(circ, (ax, ay))
    text_r(d, ax - 20, y0 + 28, "تميم للتوصيل", font(F_BOLD, 32), WHITE)
    text_r(d, ax - 20, y0 + 70, "متصل الآن", font(F_REG, 22), (196, 230, 222))

    # chat field
    chat = Image.new("RGBA", (int(x1 - x0), int(y1 - y0 - 118)), WA_BG + (255,))
    cd = ImageDraw.Draw(chat)
    for gx in range(0, chat.width, 46):
        for gy in range(0, chat.height, 46):
            cd.ellipse([gx, gy, gx + 3, gy + 3], fill=(216, 207, 198, 255))
    chat = rounded(chat, 38)
    ImageDraw.Draw(chat).rectangle([0, 0, chat.width, 44], fill=WA_BG + (255,))
    c.alpha_composite(chat, (x0, y0 + 118))

    msgs = [
        ([("تميم للتوصيل", True),
          ("استلمنا طلبك رقم " + ORDER_NO + " وجارٍ مراجعته. هنطمنك على كل خطوة", False)],
         "\U0001F69A", "٣:٤٠ م"),
        ([("تميم للتوصيل", True),
          ("تم قبول طلبك وجارٍ تجهيزه.", False)], "\u2705", "٣:٤٦ م"),
        ([("تميم للتوصيل", True),
          ("الكابتن محمود في الطريق لطلبك — للتواصل: ٠١٠٠٠٠٠٠٠٠٠", False)],
         "\U0001F69A", "٤:٠٢ م"),
        ([("تميم للتوصيل", True),
          ("تم توصيل طلبك " + ORDER_NO + " بنجاح — شكراً لاختيارك تميم", False)],
         "\u2705", "٤:٢١ م"),
    ]
    by = y0 + 150
    for lines, e, t in msgs:
        by += wa_bubble(c, x0 + 46, by, lines, e, t, max_w=x1 - x0 - 140) + 22
    return save(c, path(i, "whatsapp"))


# --------------------------------------------------------------------------
# 17 - the order e-mail
# --------------------------------------------------------------------------
def frame_email(i):
    c = background()
    header(c, i, TOTAL)
    y = title_block_(c, "وإيميل بتفاصيل الطلب",
                     "نسخة كاملة من طلبك وفلوسه على بريدك", "الإشعارات")

    x0, x1 = 100, W - 100
    y0, y1 = int(y) + 30, H - 60
    card(c, (x0, y0, x1, y1), radius=38, fill=(252, 250, 249, 255))
    d = ImageDraw.Draw(c)

    # brand strip
    strip = Image.new("RGBA", (int(x1 - x0), 130), (0, 0, 0, 0))
    sd = ImageDraw.Draw(strip)
    for px_ in range(strip.width):
        t = px_ / strip.width
        sd.line([(px_, 0), (px_, 130)],
                fill=(int(224 - 60 * t), int(48 - 14 * t), int(30 - 10 * t), 255))
    c.alpha_composite(rounded_top(strip, 38), (x0, y0))
    lg = logo(84)
    c.alpha_composite(lg, (x1 - 30 - lg.width, y0 + 23))
    text_r(d, x1 - 40 - lg.width, y0 + 32, "تميم للتوصيل", font(F_BOLD, 34), WHITE)
    text_r(d, x1 - 40 - lg.width, y0 + 76, "no-reply@deliverytamem.com",
           font(F_REG, 21), (255, 214, 200))

    yy = y0 + 160
    text_r(d, x1 - 40, yy, "الموضوع", font(F_REG, 22), (150, 120, 112))
    yy += 34
    text_r(d, x1 - 40, yy, "استلمنا طلبك — تميم " + ORDER_NO,
           font(F_BOLD, 33), (40, 20, 16))
    yy += 58
    d.line([(x0 + 40, yy), (x1 - 40, yy)], fill=(232, 222, 216), width=2)
    yy += 26

    # items block, the same one orderEmailHtml() sends
    ib_h = 236
    card(c, (x0 + 40, yy, x1 - 40, yy + ib_h), radius=18, fill=(250, 247, 245, 255),
         shadow=False, outline=(236, 230, 226), width=2)
    hx = x1 - 62
    emo(d, (hx - 34, yy + 20), "\U0001F6D2", 32)
    text_r(d, hx - 46, yy + 20, "تفاصيل الطلب", font(F_BOLD, 29), (60, 28, 22))
    iy = yy + 76
    for name, qty, price in [("بيتزا بسطرمة — حجم صغير", 1, 85),
                             ("بيتزا تشيكن باربكيو — حجم صغير", 1, 85)]:
        text_r(d, hx, iy, "%s  ×%s" % (name, ind(qty)), font(F_REG, 26), (58, 40, 36))
        d.text((x0 + 62, iy), ar("%s ج.م" % ind(price)), font=font(F_BOLD, 26),
               fill=(184, 36, 20))
        iy += 54
    text_r(d, hx, iy, "من متجر: مطعم تيك بريك", font(F_REG, 23), (140, 112, 104))
    yy += ib_h + 24

    # money table
    rows = [("قيمة الطلب", "١٧٠ ج.م", False),
            ("رسوم التوصيل", "توصيل مجاني", False),
            ("الإجمالي الكلي", "١٧٠ ج.م", True)]
    for label, val, strong in rows:
        f = font(F_BOLD, 31) if strong else font(F_REG, 27)
        col = (40, 20, 16) if strong else (92, 70, 64)
        if strong:
            d.line([(x0 + 40, yy - 8), (x1 - 40, yy - 8)], fill=(232, 222, 216), width=2)
            yy += 12
        text_r(d, x1 - 62, yy, label, f, col)
        d.text((x0 + 62, yy), ar(val), font=f,
               fill=(184, 36, 20) if strong else (46, 130, 72) if "مجاني" in val else col)
        yy += 52

    yy += 14
    bw_, bh_ = 400, 76
    bx_ = int((W - bw_) / 2)
    card(c, (bx_, yy, bx_ + bw_, yy + bh_), radius=38, fill=(224, 48, 30, 255),
         shadow=False)
    text_c(d, W / 2, yy + 18, "تابع طلبك من التطبيق", font(F_BOLD, 30), WHITE,
           shadow=False)
    yy += bh_ + 26
    d.line([(x0 + 40, yy), (x1 - 40, yy)], fill=(232, 222, 216), width=2)
    text_c(d, W / 2, yy + 18, "تميم للتوصيل — قفط، قنا  ·  deliverytamem.com",
           font(F_REG, 22), (150, 120, 112), shadow=False)
    return save(c, path(i, "email"))


# --------------------------------------------------------------------------
# 20 - call to action
# --------------------------------------------------------------------------
def frame_cta(i):
    c = background()
    d = ImageDraw.Draw(c)
    lg = logo(190)
    plate = Image.new("RGBA", (lg.width + 50, lg.height + 42), (255, 255, 255, 240))
    px = (W - plate.width) // 2
    c.alpha_composite(rounded(plate, 40), (px, 96))
    c.alpha_composite(lg, (px + 25, 117))

    y = 96 + plate.height + 40
    text_c(d, W / 2, y, "نزّل تميم دلوقتي", font(F_BOLD, 76), WHITE)
    y += 104
    text_c(d, W / 2, y, "وخلي أي طلب يوصلك وانت مكانك", font(F_REG, 34), CREAM,
           shadow=False)
    y += 78
    d.rounded_rectangle([(W - 180) / 2, y, (W + 180) / 2, y + 7], radius=4, fill=GOLD)
    y += 40

    qw = 300
    qx = int((W - qw) / 2)
    card(c, (qx - 20, y, qx + qw + 20, y + qw + 40), radius=32)
    paste_fit(c, QR, qw, (qx, y + 20))
    y += qw + 64

    _, bh = paste_fit(c, BADGE, 340, (int((W - 340) / 2), y))
    y += bh + 30
    fl = font(F_REG, 24)
    for line in (PLAY_URL[:38], PLAY_URL[38:]):
        text_c(d, W / 2, y, line, fl, (255, 226, 212), shadow=False)
        y += 32
    y += 14
    text_c(d, W / 2, y, LINKS_URL, font(F_BOLD, 30), GOLD, shadow=False)
    footer(c, "تميم للتوصيل — قفط، قنا")
    return save(c, path(i, "cta"))


# --------------------------------------------------------------------------
def frame_splash(i):
    c = background()
    header(c, i, TOTAL)
    y = title_block_(c, "أول ما تفتح التطبيق",
                     "شاشة واحدة، وبعدها على طول أنت جوه", "البداية")
    top = int(y) + 34
    device(c, shot("raw_splash"), top, width=560)
    return save(c, path(i, "splash"))


def main():
    made = []
    made.append(frame_cover(1))
    made.append(frame_download(2))
    made.append(frame_splash(3))

    made.append(journey(
        4, "register", "raw_register", "الحساب",
        "أنشئ حسابك في دقيقة",
        "اسمك، رقمك، ومدينتك — وخلاص",
        [("رقم عليه واتساب", "كل تأكيدات الطلب هتوصلك عليه"),
         ("كلمة مرور بسيطة", "٨ أحرف على الأقل وحسابك محمي"),
         ("أو ادخل بجوجل", "بضغطة واحدة من غير كلمة مرور")]))

    made.append(journey(
        5, "home", "raw_home", "الرئيسية",
        "كل حاجة في مكان واحد",
        "المتاجر والخدمات والعروض قدامك من أول ثانية",
        [("بحث فوري", "اكتب اسم منتج أو متجر وهو يلاقيهولك"),
         ("عروض وخصومات", "بانرات العروض أول حاجة تشوفها"),
         ("خدمات تميم", "دليفري، شحن بين المحافظات، وخدمة التجار")]))

    made.append(journey(
        6, "search", "raw_search", "البحث",
        "دوّر على اللي انت عايزه",
        "النتائج بتظهر وانت بتكتب — متاجر ومنتجات مع بعض",
        [("متاجر ومنتجات", "نتيجتين في بحث واحد"),
         ("السعر واضح", "تشوف سعر كل منتج قبل ما تدخل"),
         ("بحث بالصوت", "اضغط المايك وقول اللي انت عايزه")]))

    made.append(journey(
        7, "categories", "raw_service", "الأقسام",
        "اختار القسم اللي يناسبك",
        "عشرة أقسام تغطي طلبات اليوم كله",
        [("مطاعم وصيدليات", "أشهر الأقسام في الأول"),
         ("سوبر ماركت ومخابز", "طلب البيت كله من مكان واحد"),
         ("لحوم وخضار وعطارة", "وكمان بن وقهوة ومنتجات أون لاين")]))

    made.append(journey(
        8, "stores", "raw_stores", "المتاجر",
        "شوف المتاجر القريبة منك",
        "فلتر بالمدينة والقسم، والمفتوح دلوقتي باين",
        [("مفتوح أو مقفول", "علامة واضحة على كل متجر"),
         ("فلترة بالمدينة", "قفط، قنا — أو المحافظة كلها"),
         ("الأقسام جوه المتجر", "بيتزا، كريب، وجبات… بعدد الأصناف")]))

    made.append(journey(
        9, "store", "raw_store", "داخل المتجر",
        "ادخل المتجر وشوف المنيو",
        "صور المنيو الحقيقية وكل الأصناف",
        [("منيو بالصور", "اضغط على الصورة للتكبير والزوم"),
         ("العنوان والمواعيد", "تعرف مكانه وهو فاتح ولا لأ"),
         ("شارك المتجر", "ابعت لينك المتجر لأي حد")]))

    made.append(journey(
        10, "product", "raw_product", "المنتج",
        "اختار المنتج والحجم",
        "الوصف والمكوّنات والسعر قبل ما تضيف",
        [("أحجام وأسعار", "صغير، وسط، كبير — السعر بيتغير معاك"),
         ("وصف كامل", "تعرف المكوّنات قبل الطلب"),
         ("أضف للسلة أو اطلب الآن", "زرارين حسب ما يريحك")]))

    made.append(journey(
        11, "quick", "raw_quick", "اطلب أي حاجة",
        "مش لاقي اللي انت عايزه؟",
        "اطلب بأي طريقة تريحك — واحنا نجيبهولك",
        [("اكتب طلبك", "٢ كيلو سكر، نوتة… زي ما تحب"),
         ("ارفع صورة", "روشتة، قائمة مكتوبة، أو صورة منتج"),
         ("سجّل صوتي", "ملاحظة صوتية لحد ٦٠ ثانية")]))

    made.append(journey(
        12, "form", "raw_form", "تفاصيل الطلب",
        "اكتب التفاصيل وحدّد العنوان",
        "صورة، عنوان، وميعاد التوصيل — كله في شاشة واحدة",
        [("أرفق لحد ٣ صور", "علشان الطلب يوصل مظبوط"),
         ("موقعك الحالي", "ضغطة واحدة وياخد GPS مكانك"),
         ("فوري أو بجدولة", "اختار الوقت اللي يناسبك")]))

    made.append(journey(
        13, "cart", "raw_cart", "السلة",
        "راجع سلتك قبل ما تكمّل",
        "عدّل الكميات وشوف الإجمالي لحظة بلحظة",
        [("تعديل وحذف", "زوّد، قلّل، أو شيل أي منتج"),
         ("مقترحات تكمّل طلبك", "«ممكن تحتاج كمان» من نفس المتجر"),
         ("إجمالي كل متجر", "وإجمالي كلي واضح تحت")]))

    made.append(journey(
        14, "checkout", "raw_checkout", "إتمام الطلب",
        "عنوانك وطريقة الدفع",
        "المدينة والمنطقة والقرية — ورسوم التوصيل قدامك",
        [("دفع كاش عند الاستلام", "مفيش أي تحويل أو دفع مقدم"),
         ("رسوم توصيل واضحة", "بتتحسب حسب منطقتك"),
         ("إجمالي قبل التأكيد", "تشوف كل جنيه قبل ما تضغط")]))

    made.append(journey(
        15, "success", "raw_success", "التأكيد",
        "تم استلام طلبك",
        "رقم طلب خاص بيك، وتأكيد على واتساب والإيميل",
        [("رقم الطلب", ORDER_NO + " — احتفظ بيه"),
         ("مراجعة فورية", "الإدارة بتراجع الطلب في دقائق"),
         ("تأكيد على واتساب", "ومعاه نسخة على الإيميل")]))

    made.append(frame_whatsapp(16))
    made.append(frame_email(17))

    made.append(journey(
        18, "track", "raw_track", "التتبع",
        "تابع طلبك خطوة بخطوة",
        "من الاستلام للتسعير للطريق للتسليم",
        [("أربع مراحل واضحة", "تعرف طلبك واقف فين بالظبط"),
         ("سعر وخدمة", "السعر والخدمة مكتوبين فوق"),
         ("مسار التوصيل", "العنوان اللي الطلب رايحله")]))

    made.append(journey(
        19, "account", "raw_profile", "حسابك",
        "كل حاجة متسجّلة ليك",
        "طلباتك وعناوينك ومفضلتك في مكان واحد",
        [("سجل طلباتك", "الحالية والمكتملة والملغاة في تبويبات"),
         ("عناوين محفوظة", "اطلب تاني من غير ما تكتب العنوان"),
         ("المفضلة والعروض", "متاجرك المفضلة وكوبوناتك")]))

    made.append(frame_cta(20))

    print("wrote %d frames" % len(made))
    for m in made:
        print(" ", os.path.basename(m))


if __name__ == "__main__":
    main()
