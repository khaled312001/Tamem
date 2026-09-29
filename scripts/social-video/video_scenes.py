# -*- coding: utf-8 -*-
"""Scene construction for the walkthrough video.

Every scene is reduced to a list of pre-rendered RGBA `Element`s with an
entrance time and an entrance style. Per frame we only paste and fade those,
which is what keeps 2500 frames of 1080x1920 inside a couple of minutes.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

# the still-frame toolkit lives next door; the screenshots and badges it reads
# are large, so they sit outside git -- point TAMEM_POST_ROOT at them.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                os.pardir, "social-post"))
if "TAMEM_POST_ROOT" not in os.environ:
    raise SystemExit("set TAMEM_POST_ROOT to the folder holding shots/ and assets/")

import post_design as pd                                    # noqa: E402

pd.W, pd.H = 1080, 1920                                     # 9:16 for the video

import make_post as mp                                      # noqa: E402

W, H = pd.W, pd.H
GOLD, GOLD_LT, WHITE, CREAM = pd.GOLD, pd.GOLD_LT, pd.WHITE, pd.CREAM
F_BOLD, F_REG = pd.F_BOLD, pd.F_REG
ar, font, wrap, text_c, text_r = pd.ar, pd.font, pd.wrap, pd.text_c, pd.text_r
rounded = pd.rounded


# ------------------------------------------------------------------ elements
class Element(object):
    __slots__ = ("img", "pos", "t_in", "d_in", "mode", "kb", "hold")

    def __init__(self, img, pos, t_in=0.0, d_in=0.5, mode="up", kb=False):
        self.img = img
        self.pos = pos
        self.t_in = t_in
        self.d_in = d_in
        self.mode = mode
        self.kb = kb


def mklayer(fn):
    """Draw onto a transparent full canvas, then crop to what was drawn."""
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fn(c)
    bb = c.getbbox()
    if bb is None:
        return None, (0, 0)
    return c.crop(bb), (bb[0], bb[1])


def el(fn, **kw):
    img, pos = mklayer(fn)
    return Element(img, pos, **kw) if img else None


# ------------------------------------------------------------- shared pieces
def title_layer(kicker, head, sub, top=250):
    def draw(c):
        pd.title_block(c, top, head, sub, kicker)
    return draw


def bullet_layers(items, right=1030, top=780, width=380):
    """One Element per bullet so they can arrive one after another."""
    out = []
    y = top
    for n, (title, note) in enumerate(items):
        probe = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(probe)
        end = pd.bullets(probe, right, y, [(title, note)], width)

        def draw(c, yy=y, t=title, nn=note):
            pd.bullets(c, right, yy, [(t, nn)], width)

        out.append(el(draw, t_in=1.05 + n * 0.33, d_in=0.45, mode="right"))
        y = end
    return out


def device_element(shot_name, top, fit_h=None, width=None, cx=None, t_in=0.35):
    def draw(c):
        pd.device(c, os.path.join(mp.SHOTS, shot_name + ".png"), top,
                  width=width or 620, fit_h=fit_h, cx=cx)
    return el(draw, t_in=t_in, d_in=0.6, mode="up", kb=True)


# ------------------------------------------------------------------- scenes
def build_journey(sc):
    els = [el(title_layer(sc["kicker"], sc["head"], sc["sub"]),
              t_in=0.05, d_in=0.5, mode="up")]
    dev = device_element(sc["shot"], 620, fit_h=1180, cx=316)
    if dev:
        els.append(dev)
    els += [e for e in bullet_layers(sc["items"], top=760) if e]
    return els, dev


def build_hero(sc):
    els = [el(title_layer(sc["kicker"], sc["head"], sc["sub"]),
              t_in=0.05, d_in=0.5, mode="up")]
    dev = device_element(sc["shot"], 600, fit_h=1240, cx=W // 2, t_in=0.3)
    if dev:
        els.append(dev)
    return els, dev


def build_cover(sc):
    els = []

    def logo_(c):
        lg = pd.logo(280)
        plate = Image.new("RGBA", (lg.width + 64, lg.height + 54), (255, 255, 255, 242))
        px = (W - plate.width) // 2
        c.alpha_composite(rounded(plate, 50), (px, 210))
        c.alpha_composite(lg, (px + 32, 237))
    els.append(el(logo_, t_in=0.25, d_in=0.7, mode="pop"))

    def words(c):
        d = ImageDraw.Draw(c)
        text_c(d, W / 2, 600, "تميم للتوصيل", font(F_BOLD, 96), WHITE)
        text_c(d, W / 2, 728, "اطلب أي حاجة من أي مكان — وتوصلك لحد باب البيت",
               font(F_REG, 38), CREAM, shadow=False)
        d.rounded_rectangle([(W - 200) / 2, 806, (W + 200) / 2, 814], radius=4, fill=GOLD)
    els.append(el(words, t_in=0.85, d_in=0.6, mode="up"))

    qw, qy = 420, 900
    qx = (W - qw) // 2

    def qr_(c):
        mp.card(c, (qx - 22, qy - 22, qx + qw + 22, qy + qw + 86), radius=40)
        mp.paste_fit(c, mp.QR, qw, (qx, qy))
        d = ImageDraw.Draw(c)
        text_c(d, W / 2, qy + qw + 18, "امسح الكود ونزّل التطبيق",
               font(F_BOLD, 32), (120, 30, 14), shadow=False)
    els.append(el(qr_, t_in=1.55, d_in=0.55, mode="pop"))

    def badge_(c):
        bw = 380
        _, bh = mp.paste_fit(c, mp.BADGE, bw, ((W - bw) // 2, 1470))
        d = ImageDraw.Draw(c)
        f = font(F_REG, 26)
        y = 1470 + bh + 30
        for line in (mp.PLAY_URL[:38], mp.PLAY_URL[38:]):
            text_c(d, W / 2, y, line, f, (255, 226, 212), shadow=False)
            y += 36
        text_c(d, W / 2, y + 14, mp.LINKS_URL, font(F_BOLD, 32), GOLD, shadow=False)
    els.append(el(badge_, t_in=2.15, d_in=0.55, mode="up"))
    return [e for e in els if e], None


def build_download(sc):
    els = [el(title_layer("التنزيل", "نزّل التطبيق بثلاث طرق",
                          "اختار أسهل طريقة ليك"), t_in=0.05, d_in=0.5, mode="up")]
    rows = [("١", "من متجر Google Play", "ابحث عن «تميم للتوصيل» واضغط تثبيت", "badge"),
            ("٢", "من بحث جوجل", "اكتب «تميم للتوصيل» وادخل أول نتيجة", "search"),
            ("٣", "بمسح رمز الـ QR", "افتح الكاميرا ووجّهها على الكود", "qr")]
    ch_, gap, top = 300, 40, 700
    for n, (num, title, note, kind) in enumerate(rows):
        def draw(c, n=n, num=num, title=title, note=note, kind=kind):
            y0 = top + n * (ch_ + gap)
            mp.card(c, (70, y0, W - 70, y0 + ch_), radius=34,
                    fill=(255, 255, 255, 32), outline=(255, 255, 255, 76))
            d = ImageDraw.Draw(c)
            bx, by = W - 70 - 34 - 88, y0 + 34
            d.ellipse([bx, by, bx + 88, by + 88], fill=GOLD)
            fnum = font(F_BOLD, 50)
            nw = d.textlength(ar(num), font=fnum)
            d.text((bx + (88 - nw) / 2, by + 14), ar(num), font=fnum, fill=(70, 26, 4))
            tx = bx - 28
            text_r(d, tx, y0 + 46, title, font(F_BOLD, 42), WHITE)
            ny = y0 + 110
            for line in wrap(d, note, font(F_REG, 29), 420):
                text_r(d, tx, ny, line, font(F_REG, 29), (255, 214, 196))
                ny += 42
            if kind == "badge":
                mp.paste_fit(c, mp.BADGE, 300, (108, y0 + 106))
            elif kind == "search":
                sx, sy, sw, sh_ = 108, y0 + 112, 330, 76
                mp.card(c, (sx, sy, sx + sw, sy + sh_), radius=38,
                        fill=(255, 255, 255, 250), shadow=False)
                d.ellipse([sx + sw - 58, sy + 22, sx + sw - 26, sy + 54],
                          outline=(120, 120, 128), width=4)
                d.line([(sx + sw - 33, sy + 50), (sx + sw - 21, sy + 62)],
                       fill=(120, 120, 128), width=4)
                text_r(d, sx + sw - 76, sy + 20, "تميم للتوصيل", font(F_REG, 30),
                       (70, 70, 76))
            else:
                mp.card(c, (108, y0 + 40, 108 + 220, y0 + 260), radius=22,
                        fill=(255, 255, 255, 255), shadow=False)
                mp.paste_fit(c, mp.QR, 196, (120, y0 + 52))
        els.append(el(draw, t_in=0.7 + n * 0.75, d_in=0.5, mode="right"))
    return [e for e in els if e], None


def build_whatsapp(sc):
    els = [el(title_layer("الإشعارات", "تابع طلبك على واتساب",
                          "كل تغيير في حالة الطلب يوصلك رسالة فورية"),
              t_in=0.05, d_in=0.5, mode="up")]
    x0, x1 = 90, W - 90
    y0, y1 = 700, H - 130

    def shell(c):
        mp.card(c, (x0, y0, x1, y1), radius=44, fill=(255, 255, 255, 255))
        bar = pd.rounded_top(Image.new("RGBA", (x1 - x0, 132), mp.WA_GREEN + (255,)), 44)
        c.alpha_composite(bar, (x0, y0))
        av = 88
        ax, ay = x1 - 30 - av, y0 + 22
        circ = Image.new("RGBA", (av, av), (255, 255, 255, 255))
        lg = pd.logo(av - 16)
        circ.alpha_composite(lg, ((av - lg.width) // 2, 8))
        m = Image.new("L", (av, av), 0)
        ImageDraw.Draw(m).ellipse([0, 0, av - 1, av - 1], fill=255)
        circ.putalpha(m)
        c.alpha_composite(circ, (ax, ay))
        d = ImageDraw.Draw(c)
        text_r(d, ax - 22, y0 + 32, "تميم للتوصيل", font(F_BOLD, 36), WHITE)
        text_r(d, ax - 22, y0 + 80, "متصل الآن", font(F_REG, 24), (196, 230, 222))
        chat = Image.new("RGBA", (x1 - x0, y1 - y0 - 132), mp.WA_BG + (255,))
        cd = ImageDraw.Draw(chat)
        for gx in range(0, chat.width, 46):
            for gy in range(0, chat.height, 46):
                cd.ellipse([gx, gy, gx + 3, gy + 3], fill=(216, 207, 198, 255))
        chat = rounded(chat, 44)
        ImageDraw.Draw(chat).rectangle([0, 0, chat.width, 48], fill=mp.WA_BG + (255,))
        c.alpha_composite(chat, (x0, y0 + 132))
    els.append(el(shell, t_in=0.3, d_in=0.55, mode="up"))

    msgs = [([("تميم للتوصيل", True),
              ("استلمنا طلبك رقم " + mp.ORDER_NO + " وجارٍ مراجعته", False)],
             "\U0001F69A", "٣:٤٠ م"),
            ([("تميم للتوصيل", True), ("تم قبول طلبك وجارٍ تجهيزه.", False)],
             "\u2705", "٣:٤٦ م"),
            ([("تميم للتوصيل", True),
              ("الكابتن محمود في الطريق لطلبك — للتواصل: ٠١٠٠٠٠٠٠٠٠٠", False)],
             "\U0001F69A", "٤:٠٢ م"),
            ([("تميم للتوصيل", True),
              ("تم توصيل طلبك بنجاح — شكراً لاختيارك تميم", False)],
             "\u2705", "٤:٢١ م")]

    by = y0 + 172
    for n, (lines, e_, t_) in enumerate(msgs):
        probe = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        bh = mp.wa_bubble(probe, x0 + 48, by, lines, e_, t_, max_w=x1 - x0 - 150)

        def draw(c, yy=by, L=lines, E=e_, T=t_):
            mp.wa_bubble(c, x0 + 48, yy, L, E, T, max_w=x1 - x0 - 150)

        els.append(el(draw, t_in=1.05 + n * 0.85, d_in=0.4, mode="pop"))
        by += bh + 26
    return [e for e in els if e], None


def build_email(sc):
    els = [el(title_layer("الإشعارات", "وإيميل بتفاصيل الطلب",
                          "نسخة كاملة من طلبك وفلوسه على بريدك"),
              t_in=0.05, d_in=0.5, mode="up")]
    x0, x1 = 90, W - 90
    y0, y1 = 700, H - 130

    def body(c):
        mp.card(c, (x0, y0, x1, y1), radius=44, fill=(252, 250, 249, 255))
        d = ImageDraw.Draw(c)
        strip = Image.new("RGBA", (x1 - x0, 150), (0, 0, 0, 0))
        sd = ImageDraw.Draw(strip)
        for px_ in range(strip.width):
            k = px_ / strip.width
            sd.line([(px_, 0), (px_, 150)],
                    fill=(int(224 - 60 * k), int(48 - 14 * k), int(30 - 10 * k), 255))
        c.alpha_composite(pd.rounded_top(strip, 44), (x0, y0))
        lg = pd.logo(96)
        c.alpha_composite(lg, (x1 - 34 - lg.width, y0 + 27))
        text_r(d, x1 - 46 - lg.width, y0 + 36, "تميم للتوصيل", font(F_BOLD, 38), WHITE)
        text_r(d, x1 - 46 - lg.width, y0 + 88, "no-reply@deliverytamem.com",
               font(F_REG, 23), (255, 214, 200))

        yy = y0 + 188
        text_r(d, x1 - 44, yy, "الموضوع", font(F_REG, 24), (150, 120, 112))
        yy += 38
        text_r(d, x1 - 44, yy, "استلمنا طلبك — تميم " + mp.ORDER_NO,
               font(F_BOLD, 36), (40, 20, 16))
        yy += 66
        d.line([(x0 + 44, yy), (x1 - 44, yy)], fill=(232, 222, 216), width=2)
        yy += 30
        ib = 268
        mp.card(c, (x0 + 44, yy, x1 - 44, yy + ib), radius=20,
                fill=(250, 247, 245, 255), shadow=False,
                outline=(236, 230, 226), width=2)
        hx = x1 - 68
        mp.emo(d, (hx - 38, yy + 22), "\U0001F6D2", 36)
        text_r(d, hx - 52, yy + 22, "تفاصيل الطلب", font(F_BOLD, 32), (60, 28, 22))
        iy = yy + 86
        for nm, qty, pr in [("بيتزا بسطرمة — حجم صغير", 1, 85),
                            ("بيتزا تشيكن باربكيو — حجم صغير", 1, 85)]:
            text_r(d, hx, iy, "%s  ×%s" % (nm, mp.ind(qty)), font(F_REG, 28),
                   (58, 40, 36))
            d.text((x0 + 68, iy), ar("%s ج.م" % mp.ind(pr)), font=font(F_BOLD, 28),
                   fill=(184, 36, 20))
            iy += 60
        text_r(d, hx, iy, "من متجر: مطعم تيك بريك", font(F_REG, 25), (140, 112, 104))
    els.append(el(body, t_in=0.35, d_in=0.55, mode="up"))

    def totals(c):
        d = ImageDraw.Draw(c)
        yy = y0 + 188 + 38 + 66 + 30 + 268 + 30
        for label, val, strong in [("قيمة الطلب", "١٧٠ ج.م", False),
                                   ("رسوم التوصيل", "توصيل مجاني", False),
                                   ("الإجمالي الكلي", "١٧٠ ج.م", True)]:
            f = font(F_BOLD, 34) if strong else font(F_REG, 29)
            col = (40, 20, 16) if strong else (92, 70, 64)
            if strong:
                d.line([(x0 + 44, yy - 10), (x1 - 44, yy - 10)],
                       fill=(232, 222, 216), width=2)
                yy += 14
            text_r(d, x1 - 68, yy, label, f, col)
            d.text((x0 + 68, yy), ar(val), font=f,
                   fill=(184, 36, 20) if strong
                   else (46, 130, 72) if "مجاني" in val else col)
            yy += 58
        bw_, bh_ = 440, 84
        bx_ = (W - bw_) // 2
        mp.card(c, (bx_, yy + 12, bx_ + bw_, yy + 12 + bh_), radius=42,
                fill=(224, 48, 30, 255), shadow=False)
        text_c(d, W / 2, yy + 34, "تابع طلبك من التطبيق", font(F_BOLD, 33), WHITE,
               shadow=False)
    els.append(el(totals, t_in=1.5, d_in=0.5, mode="up"))
    return [e for e in els if e], None


def build_cta(sc):
    els = []

    def logo_(c):
        lg = pd.logo(240)
        plate = Image.new("RGBA", (lg.width + 58, lg.height + 50), (255, 255, 255, 242))
        px = (W - plate.width) // 2
        c.alpha_composite(rounded(plate, 46), (px, 250))
        c.alpha_composite(lg, (px + 29, 275))
    els.append(el(logo_, t_in=0.15, d_in=0.7, mode="pop"))

    def words(c):
        d = ImageDraw.Draw(c)
        text_c(d, W / 2, 600, "نزّل تميم دلوقتي", font(F_BOLD, 92), WHITE)
        text_c(d, W / 2, 728, "وخلي أي طلب يوصلك وانت مكانك", font(F_REG, 38),
               CREAM, shadow=False)
        d.rounded_rectangle([(W - 200) / 2, 806, (W + 200) / 2, 814], radius=4, fill=GOLD)
    els.append(el(words, t_in=0.6, d_in=0.6, mode="up"))

    qw, qy = 420, 900
    qx = (W - qw) // 2

    def qr_(c):
        mp.card(c, (qx - 22, qy - 22, qx + qw + 22, qy + qw + 22), radius=40)
        mp.paste_fit(c, mp.QR, qw, (qx, qy))
    els.append(el(qr_, t_in=1.1, d_in=0.55, mode="pop"))

    def tail(c):
        bw = 380
        _, bh = mp.paste_fit(c, mp.BADGE, bw, ((W - bw) // 2, 1400))
        d = ImageDraw.Draw(c)
        y = 1400 + bh + 34
        for line in (mp.PLAY_URL[:38], mp.PLAY_URL[38:]):
            text_c(d, W / 2, y, line, font(F_REG, 26), (255, 226, 212), shadow=False)
            y += 36
        text_c(d, W / 2, y + 16, mp.LINKS_URL, font(F_BOLD, 34), GOLD, shadow=False)
        text_c(d, W / 2, y + 78, "تميم للتوصيل — قفط، قنا", font(F_REG, 27),
               (255, 214, 196), shadow=False)
    els.append(el(tail, t_in=1.6, d_in=0.55, mode="up"))
    return [e for e in els if e], None


BUILDERS = {
    "journey": build_journey,
    "hero": build_hero,
    "cover": build_cover,
    "download": build_download,
    "whatsapp": build_whatsapp,
    "email": build_email,
    "cta": build_cta,
}


def build(sc):
    return BUILDERS[sc["kind"]](sc)
