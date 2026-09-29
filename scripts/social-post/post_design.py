# -*- coding: utf-8 -*-
"""Social-post frames for the Tamem customer journey.

Arabic goes through arabic_reshaper + python-bidi (Pillow has no raqm here) and
is drawn in Tahoma Bold, which carries the presentation forms those two emit.
Every frame shares one background, one header lockup and one device treatment,
so the carousel reads as a set.
"""
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

HERE = os.environ.get("TAMEM_POST_ROOT",
                      os.path.dirname(os.path.abspath(__file__)))
REPO = r"E:\Tamem"
SHOTS = os.path.join(HERE, "shots")
ASSETS = os.path.join(HERE, "assets")

F_BOLD = "C:/Windows/Fonts/tahomabd.ttf"
F_REG = "C:/Windows/Fonts/tahoma.ttf"

RED = (224, 48, 30)
RED_DEEP = (95, 17, 7)
RED_DARK = (138, 26, 10)
GOLD = (242, 169, 59)
GOLD_LT = (252, 222, 163)
INK = (24, 12, 10)
WHITE = (255, 255, 255)
CREAM = (255, 238, 230)

W, H = 1080, 1350


def ar(s):
    return get_display(arabic_reshaper.reshape(s))


def font(path, size):
    return ImageFont.truetype(path, size)


def wrap(draw, text, fnt, max_w):
    out, cur = [], []
    for w in text.split():
        trial = cur + [w]
        if draw.textlength(ar(" ".join(trial)), font=fnt) <= max_w or not cur:
            cur = trial
        else:
            out.append(" ".join(cur))
            cur = [w]
    if cur:
        out.append(" ".join(cur))
    return out


def text_c(draw, cx, y, s, fnt, fill, shadow=True):
    t = ar(s)
    w = draw.textlength(t, font=fnt)
    if shadow:
        draw.text((cx - w / 2 + 2, y + 3), t, font=fnt, fill=(60, 8, 2, 120))
    draw.text((cx - w / 2, y), t, font=fnt, fill=fill)
    return w


def text_r(draw, right, y, s, fnt, fill):
    """Draw RTL text ending at `right`."""
    t = ar(s)
    w = draw.textlength(t, font=fnt)
    draw.text((right - w, y), t, font=fnt, fill=fill)
    return w


def _gradient(size, stops):
    w, h = size
    strip = Image.new("RGB", (1, h))
    px = strip.load()
    for y in range(h):
        t = y / max(1, h - 1)
        for i in range(len(stops) - 1):
            a, ca = stops[i]
            b, cb = stops[i + 1]
            if a <= t <= b:
                k = (t - a) / max(1e-6, b - a)
                px[0, y] = tuple(int(ca[j] + (cb[j] - ca[j]) * k) for j in range(3))
                break
    return strip.resize(size, Image.BILINEAR)


def _glow(img, center, radius, colour, alpha):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=colour + (alpha,))
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(radius * 0.6)))


def grain(img, amount=6):
    rnd = random.Random(7)
    noise = Image.new("L", (img.width // 2, img.height // 2))
    noise.putdata([rnd.randint(128 - amount, 128 + amount)
                   for _ in range(noise.width * noise.height)])
    noise = noise.resize(img.size, Image.BILINEAR)
    base = img.convert("RGB")
    out = ImageChops.overlay(base, Image.merge("RGB", (noise, noise, noise)))
    return out.convert("RGBA")


def background(size=(W, H)):
    w, h = size
    canvas = _gradient(size, [(0.0, RED), (0.45, RED_DARK), (1.0, RED_DEEP)]).convert("RGBA")

    # dotted field, very low contrast -- gives the flat gradient some tooth
    dots = Image.new("RGBA", size, (0, 0, 0, 0))
    dd = ImageDraw.Draw(dots)
    for y in range(0, h, 26):
        for x in range(0, w, 26):
            dd.ellipse([x, y, x + 2, y + 2], fill=(255, 255, 255, 14))
    canvas.alpha_composite(dots)

    # one wide diagonal light streak
    streak = Image.new("RGBA", size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(streak)
    sd.polygon([(-200, h * 0.18), (w * 0.55, -160), (w * 0.78, -160), (-200, h * 0.44)],
               fill=(255, 255, 255, 16))
    canvas.alpha_composite(streak.filter(ImageFilter.GaussianBlur(40)))

    _glow(canvas, (int(w * 0.92), int(h * 0.04)), int(w * 0.46), GOLD, 52)
    _glow(canvas, (int(w * 0.04), int(h * 0.62)), int(w * 0.44), (255, 120, 70), 40)
    _glow(canvas, (int(w * 0.5), int(h * 1.02)), int(w * 0.6), (40, 6, 2), 90)
    return canvas


def rounded(img, r):
    """Round the corners, keeping whatever alpha the image already had.

    Replacing the alpha outright turned a transparent overlay into a solid
    black slab -- the sheen layer is mostly alpha 0 and must stay that way.
    """
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1],
                                           radius=r, fill=255)
    out = img.convert("RGBA")
    out.putalpha(ImageChops.multiply(out.getchannel("A"), mask))
    return out


def rounded_top(img, r):
    """Round only the top corners -- for header strips that sit on a card."""
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1 + r],
                                           radius=r, fill=255)
    out = img.convert("RGBA")
    out.putalpha(ImageChops.multiply(out.getchannel("A"), mask))
    return out


_logo_cache = {}


def logo(height):
    if height in _logo_cache:
        return _logo_cache[height]
    src = Image.open(os.path.join(REPO, "apps", "mobile", "src", "assets",
                                  "logo-clean.png")).convert("RGBA")
    w = int(src.width * height / src.height)
    _logo_cache[height] = src.resize((w, height), Image.LANCZOS)
    return _logo_cache[height]


def header(canvas, step=None, total=None):
    """Logo lockup on the right, step counter on the left. Same on every frame."""
    d = ImageDraw.Draw(canvas)
    lg = logo(96)
    plate_w, plate_h = lg.width + 34, lg.height + 26
    px, py = W - 56 - plate_w, 44
    plate = Image.new("RGBA", (plate_w, plate_h), (255, 255, 255, 235))
    canvas.alpha_composite(rounded(plate, 26), (px, py))
    canvas.alpha_composite(lg, (px + 17, py + 13))

    if step is not None:
        f = font(F_BOLD, 30)
        label = "%d / %d" % (step, total)
        tw = d.textlength(label, font=f)
        cw, ch = int(tw + 48), 60
        cx, cy = 56, py + (plate_h - ch) // 2
        chip = Image.new("RGBA", (cw, ch), (255, 255, 255, 38))
        canvas.alpha_composite(rounded(chip, 30), (cx, cy))
        d.rounded_rectangle([cx, cy, cx + cw, cy + ch], radius=30,
                            outline=(255, 255, 255, 90), width=2)
        d.text((cx + 24, cy + 13), label, font=f, fill=GOLD_LT)
    return py + plate_h


def device(canvas, shot_path, top, width=620, keep=1.0, cx=None,
           status_crop=58, fit_h=None):
    """Screenshot in a phone body, running off the bottom of the frame.

    A whole 1080x2400 screen scaled to fit 1350px of canvas leaves the app's
    own text unreadable, so we show the top `keep` of it at a usable size and
    let the body bleed past the edge -- which also stops every frame from
    looking like a phone floating in the middle of a poster.
    """
    shot = Image.open(shot_path).convert("RGB")
    shot = shot.crop((0, status_crop, shot.width, shot.height))
    if keep < 1.0:
        shot = shot.crop((0, 0, shot.width, int(shot.height * keep)))

    bez, edge = 11, 5
    if fit_h:                      # show the whole handset inside `fit_h`
        scale = (fit_h - 2 * (bez + edge)) / shot.height
        width = int(shot.width * scale) + 2 * (bez + edge)
    inner = width - 2 * (bez + edge)
    scale = inner / shot.width
    dw, dh = inner, int(shot.height * scale)
    shot = shot.resize((dw, dh), Image.LANCZOS)

    fw, fh = width, dh + 2 * (bez + edge)
    fx = int((cx if cx is not None else W / 2) - fw / 2)
    fy = top
    radius = 54

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [fx + 8, fy + 28, fx + fw - 8, min(canvas.size[1] + 400, fy + fh + 28)],
        radius=radius, fill=(28, 4, 1, 180))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(34)))

    body = Image.new("RGBA", (fw, fh), (26, 12, 9, 255))
    plate = Image.new("RGBA", (dw + 2 * bez, dh + 2 * bez), WHITE + (255,))
    plate.alpha_composite(rounded(shot, radius - bez - edge), (bez, bez))
    body.alpha_composite(rounded(plate, radius - edge), (edge, edge))

    sheen = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    ImageDraw.Draw(sheen).polygon(
        [(0, int(fw * 0.16)), (fw, -int(fw * 0.42)), (fw, int(fw * 0.16)), (0, int(fw * 0.74))],
        fill=(255, 255, 255, 30))
    body.alpha_composite(rounded(sheen.filter(ImageFilter.GaussianBlur(14)), radius))

    body = rounded(body, radius)
    ImageDraw.Draw(body).rounded_rectangle([0, 0, fw - 1, fh - 1], radius=radius,
                                           outline=(248, 206, 140, 130), width=2)

    # clip whatever hangs off the canvas, then paste
    vis_h = min(fh, canvas.size[1] - fy)
    if vis_h < fh:
        body = body.crop((0, 0, fw, vis_h))
    canvas.alpha_composite(body, (fx, fy))
    return fx, fy, fw, min(fh, vis_h)


def callout(canvas, text, anchor, point_to, side="left", max_w=430):
    """Gold pill with a stub arrow -- the thing that makes it an explainer."""
    d = ImageDraw.Draw(canvas)
    f = font(F_BOLD, 29)
    lines = wrap(d, text, f, max_w)
    tw = max(d.textlength(ar(l), font=f) for l in lines)
    pw, ph = int(tw + 52), 28 + 44 * len(lines)
    ax, ay = anchor
    if side == "left":
        ax -= pw
    ax = max(30, min(ax, W - 30 - pw))   # never let a pill slide off the frame

    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([ax, ay + 8, ax + pw, ay + ph + 8],
                                         radius=22, fill=(30, 4, 1, 150))
    canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)))

    pill = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    ImageDraw.Draw(pill).rounded_rectangle([0, 0, pw - 1, ph - 1], radius=22,
                                           fill=GOLD + (252,),
                                           outline=(255, 238, 205, 230), width=2)
    canvas.alpha_composite(pill, (int(ax), int(ay)))

    pd = ImageDraw.Draw(canvas)
    for i, l in enumerate(lines):
        t = ar(l)
        lw = pd.textlength(t, font=f)
        pd.text((ax + (pw - lw) / 2, ay + 14 + 44 * i), t, font=f, fill=(58, 24, 4))

    sx = ax + pw if side == "left" else ax
    sy = ay + ph / 2
    pd.line([(sx, sy), point_to], fill=GOLD + (230,), width=5)
    r = 11
    pd.ellipse([point_to[0] - r, point_to[1] - r, point_to[0] + r, point_to[1] + r],
               outline=GOLD, width=5)


def title_block(canvas, top, headline, sub, kicker=None, width=None):
    d = ImageDraw.Draw(canvas)
    y = top
    if kicker:
        text_c(d, W / 2, y, kicker, font(F_BOLD, 30), GOLD, shadow=False)
        y += 48
    fh_ = font(F_BOLD, 56)
    for line in wrap(d, headline, fh_, width or (W - 150)):
        text_c(d, W / 2, y, line, fh_, WHITE)
        y += 74
    y += 20   # clear the descenders; the rule was cutting through them
    d.rounded_rectangle([(W - 140) / 2, y, (W + 140) / 2, y + 7], radius=4, fill=GOLD)
    y += 28
    if sub:
        fs = font(F_REG, 32)
        for line in wrap(d, sub, fs, width or (W - 190)):
            text_c(d, W / 2, y, line, fs, CREAM, shadow=False)
            y += 46
    return y


def bullets(canvas, right, top, items, width=390):
    """Right-aligned Arabic bullet stack -- the reading column beside the phone."""
    d = ImageDraw.Draw(canvas)
    fb = font(F_BOLD, 34)
    fs = font(F_REG, 27)
    y = top
    for title, note in items:
        d.ellipse([right - 18, y + 12, right - 2, y + 28], fill=GOLD)
        d.ellipse([right - 25, y + 5, right + 5, y + 35], outline=(242, 169, 59, 110), width=2)
        for line in wrap(d, title, fb, width - 44):
            text_r(d, right - 44, y, line, fb, WHITE)
            y += 44
        if note:
            y += 2
            for line in wrap(d, note, fs, width - 44):
                text_r(d, right - 44, y, line, fs, (255, 214, 196))
                y += 38
        y += 30
    return y


def caption(canvas, top, text, width=860):
    """One frosted strip of explanation, centred."""
    d = ImageDraw.Draw(canvas)
    f = font(F_REG, 31)
    lines = wrap(d, text, f, width - 80)
    bh = 34 + 44 * len(lines)
    bx = (W - width) // 2
    card = Image.new("RGBA", (width, bh), (255, 255, 255, 30))
    canvas.alpha_composite(rounded(card, 28), (bx, top))
    d.rounded_rectangle([bx, top, bx + width, top + bh], radius=28,
                        outline=(255, 255, 255, 70), width=2)
    for i, line in enumerate(lines):
        text_c(d, W / 2, top + 17 + 44 * i, line, f, CREAM, shadow=False)
    return top + bh


def footer(canvas, text="deliverytamem.com"):
    d = ImageDraw.Draw(canvas)
    d.line([(90, H - 78), (W - 90, H - 78)], fill=(255, 255, 255, 40), width=2)
    # goes through text_c so an Arabic footer is reshaped, not written backwards
    text_c(d, W / 2, H - 60, text, font(F_REG, 26), (255, 220, 205), shadow=False)


def save(canvas, path):
    out = grain(canvas).convert("RGB")
    out.save(path, quality=96)
    return path
