# -*- coding: utf-8 -*-
"""Renders the walkthrough video and muxes it with the synthesised soundtrack.

Frames are composited in Pillow and piped straight into ffmpeg as raw RGB --
no intermediate PNG sequence, which would have been several gigabytes.
"""
import math
import os
import subprocess
import sys
import time

from PIL import Image, ImageDraw, ImageFilter

import video_scenes as vs
from timeline import SCENES, STARTS, DURATION, FPS
from video_scenes import W, H, GOLD, GOLD_LT, WHITE, pd

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "tamem-walkthrough.mp4")
AUDIO = os.path.join(HERE, "soundtrack.wav")
EXIT_FADE = 0.28


# ------------------------------------------------------------------ easings
def clamp01(x):
    return 0.0 if x < 0 else (1.0 if x > 1 else x)


def ease_out(x):
    return 1 - (1 - x) ** 3


def ease_out_back(x, s=1.45):
    x -= 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2


def fade(img, a):
    if a >= 0.999:
        return img
    lut = [int(i * a) for i in range(256)]
    out = img.copy()
    out.putalpha(out.getchannel("A").point(lut))
    return out


# ------------------------------------------------------------- static pieces
def make_background():
    bg = pd.background((W, H))
    return pd.grain(bg, 5).convert("RGBA")


def make_glow(radius=430, colour=(255, 186, 96), alpha=54):
    g = Image.new("RGBA", (radius * 2, radius * 2), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse([0, 0, radius * 2 - 1, radius * 2 - 1],
                              fill=colour + (alpha,))
    return g.filter(ImageFilter.GaussianBlur(radius * 0.55))


def make_sweep():
    """Soft diagonal light band, slid across the frame on every scene change."""
    s = Image.new("RGBA", (460, H + 700), (0, 0, 0, 0))
    d = ImageDraw.Draw(s)
    for i in range(460):
        a = int(70 * math.sin(math.pi * i / 460) ** 2)
        d.line([(i, 0), (i, s.height)], fill=(255, 235, 205, a))
    return s.rotate(-18, expand=True, resample=Image.BICUBIC)


def make_header():
    c = Image.new("RGBA", (W, 260), (0, 0, 0, 0))
    lg = pd.logo(104)
    pw, ph = lg.width + 38, lg.height + 30
    px, py = W - 60 - pw, 56
    plate = Image.new("RGBA", (pw, ph), (255, 255, 255, 238))
    c.alpha_composite(pd.rounded(plate, 30), (px, py))
    c.alpha_composite(lg, (px + 19, py + 15))
    bb = c.getbbox()
    return c.crop(bb), (bb[0], bb[1])


def make_chip(i, total):
    f = pd.font(pd.F_BOLD, 32)
    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    label = "%d / %d" % (i, total)
    tw = probe.textlength(label, font=f)
    cw, ch = int(tw + 54), 66
    chip = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    d = ImageDraw.Draw(chip)
    d.rounded_rectangle([0, 0, cw - 1, ch - 1], radius=33, fill=(255, 255, 255, 40),
                        outline=(255, 255, 255, 95), width=2)
    d.text((27, 15), label, font=f, fill=GOLD_LT)
    return chip


# ------------------------------------------------------------------- drawing
def place_element(canvas, e, t, scene_dur):
    p = clamp01((t - e.t_in) / e.d_in) if e.d_in > 0 else 1.0
    if p <= 0:
        return
    k = ease_out(p)

    out_a = 1.0
    left = scene_dur - t
    if left < EXIT_FADE:
        out_a = clamp01(left / EXIT_FADE)

    img = e.img
    x, y = e.pos
    a = k * out_a

    if e.mode == "up":
        y += int((1 - k) * 80)
    elif e.mode == "right":
        x += int((1 - k) * 70)
    elif e.mode == "pop":
        s = 0.88 + 0.12 * ease_out_back(p)
        a = clamp01(p * 1.7) * out_a
        if abs(s - 1.0) > 0.002:
            nw, nh = max(1, int(img.width * s)), max(1, int(img.height * s))
            x -= (nw - img.width) // 2
            y -= (nh - img.height) // 2
            img = img.resize((nw, nh), Image.BILINEAR)

    if e.kb:                                  # slow push in, anchored top-centre
        s = 1.0 + 0.035 * clamp01(t / max(0.1, scene_dur))
        nw, nh = int(img.width * s), int(img.height * s)
        x -= (nw - img.width) // 2
        img = img.resize((nw, nh), Image.BILINEAR)

    if a < 0.999:
        img = fade(img, a)
    canvas.alpha_composite(img, (int(x), int(y)))


def progress(canvas, frac):
    d = ImageDraw.Draw(canvas)
    y = H - 46
    d.rounded_rectangle([70, y, W - 70, y + 9], radius=5, fill=(255, 255, 255, 46))
    w = int((W - 140) * clamp01(frac))
    if w > 10:
        d.rounded_rectangle([70, y, 70 + w, y + 9], radius=5, fill=GOLD + (235,))


def main():
    total_frames = int(DURATION * FPS)
    print("building scenes...")
    built = [vs.build(sc) for sc in SCENES]
    bg = make_background()
    glow = make_glow()
    sweep = make_sweep()
    header, header_pos = make_header()
    chips = [make_chip(i + 1, len(SCENES)) for i in range(len(SCENES))]

    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (W, H),
           "-r", str(FPS), "-i", "-",
           "-i", AUDIO,
           "-c:v", "libx264", "-preset", "slow", "-crf", "18",
           "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.2",
           "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
           "-movflags", "+faststart", "-shortest", OUT]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    t_start = time.time()
    si = 0
    for f in range(total_frames):
        t = f / float(FPS)
        while si + 1 < len(SCENES) and t >= STARTS[si + 1]:
            si += 1
        sc = SCENES[si]
        local = t - STARTS[si]
        els, _dev = built[si]

        canvas = bg.copy()

        # a slow drifting warm glow keeps the background from feeling frozen
        gx = int(W * 0.5 + W * 0.42 * math.sin(t * 0.20))
        gy = int(H * 0.30 + H * 0.22 * math.sin(t * 0.13 + 1.1))
        canvas.alpha_composite(glow, (gx - glow.width // 2, gy - glow.height // 2))

        for e in els:
            place_element(canvas, e, local, sc["dur"])

        # light sweep over the cut itself
        since = local
        until = sc["dur"] - local
        for edge, ref in ((since, 1), (until, -1)):
            if edge < 0.45:
                q = edge / 0.45 if ref == 1 else 1 - edge / 0.45
                x = int(-sweep.width + (W + sweep.width) * q)
                canvas.alpha_composite(fade(sweep, 0.55), (x, -350))
                break

        canvas.alpha_composite(header, header_pos)
        chip = chips[si]
        ca = clamp01(local / 0.3) * clamp01((sc["dur"] - local) / 0.3)
        canvas.alpha_composite(fade(chip, ca), (60, 56 + (134 - chip.height) // 2))
        progress(canvas, t / DURATION)

        proc.stdin.write(canvas.convert("RGB").tobytes())

        if f % 150 == 0:
            el_ = time.time() - t_start
            print("  frame %4d/%d  %.0fs elapsed" % (f, total_frames, el_),
                  flush=True)

    proc.stdin.close()
    rc = proc.wait()
    print("ffmpeg exit %d, %.0fs total -> %s" % (rc, time.time() - t_start, OUT))
    return rc


if __name__ == "__main__":
    sys.exit(main())
