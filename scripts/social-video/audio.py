# -*- coding: utf-8 -*-
"""Soundtrack for the Tamem walkthrough, synthesised from scratch.

Nothing here is sampled or downloaded, so the track is ours to publish. It is a
warm C-G-Am-F loop at 96 BPM -- pad, pluck arpeggio, bass, kick, hats -- plus
the whooshes, pops and chimes the edit needs. Music sits deliberately low; the
mix targets about -20 dBFS peak for the bed against -10 for the effects.
"""
import numpy as np
from scipy import signal

SR = 44100
BPM = 96.0
BEAT = 60.0 / BPM          # 0.625 s
BAR = 4 * BEAT             # 2.5 s


def n2f(midi):
    return 440.0 * 2 ** ((midi - 69) / 12.0)


def t_of(n):
    return np.arange(n, dtype=np.float64) / SR


def env_ad(n, attack, decay, curve=2.5):
    """Percussive attack/decay envelope."""
    e = np.zeros(n)
    a = max(1, int(attack * SR))
    if a < n:
        e[:a] = np.linspace(0, 1, a)
        rest = n - a
        e[a:] = np.exp(-curve * np.linspace(0, 1, rest) * (1.0 / max(1e-6, decay)) * 0.5)
    else:
        e[:] = np.linspace(0, 1, n)
    return e


def env_asr(n, attack, release):
    e = np.ones(n)
    a = min(n, max(1, int(attack * SR)))
    r = min(n - a, max(1, int(release * SR)))
    e[:a] = np.linspace(0, 1, a) ** 1.6
    if r > 0:
        e[n - r:] = np.linspace(1, 0, r) ** 1.4
    return e


def lowpass(x, cutoff, order=4):
    b, a = signal.butter(order, min(0.99, cutoff / (SR / 2)), btype="low")
    return signal.lfilter(b, a, x)


def highpass(x, cutoff, order=4):
    b, a = signal.butter(order, min(0.99, cutoff / (SR / 2)), btype="high")
    return signal.lfilter(b, a, x)


def bandpass(x, lo, hi, order=4):
    b, a = signal.butter(order, [max(1e-4, lo / (SR / 2)), min(0.99, hi / (SR / 2))],
                         btype="band")
    return signal.lfilter(b, a, x)


# ---------------------------------------------------------------- instruments
def saw(freq, n, detune=0.0):
    """Band-limited-ish saw by summing a handful of harmonics."""
    t = t_of(n)
    out = np.zeros(n)
    f = freq * (1 + detune)
    for h in range(1, 13):
        if f * h > SR / 2.2:
            break
        out += np.sin(2 * np.pi * f * h * t) / h
    return out * 0.5


def pad_chord(notes, dur, level=0.20):
    n = int(dur * SR)
    out = np.zeros(n)
    for m in notes:
        f = n2f(m)
        for det in (-0.004, 0.0, 0.005):
            out += saw(f, n, det) * 0.33
        t = t_of(n)
        out += np.sin(2 * np.pi * f * 0.5 * t) * 0.08     # a hint of sub, no more
        out += np.sin(2 * np.pi * f * 2 * t) * 0.16       # shimmer, carries on a phone
    out = lowpass(out, 1500)
    return out * env_asr(n, 0.35, 0.45) * (level / max(1, len(notes)))


def pluck(midi, dur, level=0.24):
    n = int(dur * SR)
    t = t_of(n)
    f = n2f(midi)
    body = (np.sin(2 * np.pi * f * t)
            + 0.45 * np.sin(2 * np.pi * f * 2 * t)
            + 0.18 * np.sin(2 * np.pi * f * 3 * t)
            + 0.08 * np.sin(2 * np.pi * f * 4.2 * t))
    return body * env_ad(n, 0.004, 0.26) * level


def bass(midi, dur, level=0.30):
    n = int(dur * SR)
    t = t_of(n)
    f = n2f(midi)
    x = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(2 * np.pi * f * 2 * t)
    return lowpass(x, 400) * env_asr(n, 0.01, 0.12) * level


def kick(level=0.55):
    n = int(0.22 * SR)
    t = t_of(n)
    f = 118 * np.exp(-t * 26) + 44
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    x *= np.exp(-t * 15)
    click = np.random.default_rng(3).normal(0, 1, n) * np.exp(-t * 320) * 0.30
    knock = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 60) * 0.35
    return (x + click + knock) * level


def hat(level=0.10, closed=True):
    n = int((0.035 if closed else 0.12) * SR)
    rng = np.random.default_rng(11 if closed else 12)
    x = rng.normal(0, 1, n)
    x = highpass(x, 7000)
    return x * np.exp(-t_of(n) * (240 if closed else 45)) * level


def clap(level=0.22):
    n = int(0.18 * SR)
    rng = np.random.default_rng(5)
    x = bandpass(rng.normal(0, 1, n), 900, 4200)
    e = np.exp(-t_of(n) * 22)
    for d in (0.008, 0.017, 0.026):          # three quick slaps = a clap
        k = int(d * SR)
        e[k:] += np.exp(-t_of(n - k) * 22) * 0.7
    return x * e / 2.4 * level


# ------------------------------------------------------------------- effects
def whoosh(dur=0.45, level=0.5, up=True):
    n = int(dur * SR)
    rng = np.random.default_rng(21)
    x = rng.normal(0, 1, n)
    out = np.zeros(n)
    steps = 24
    for i in range(steps):
        a, b = i * n // steps, (i + 1) * n // steps
        k = i / (steps - 1.0)
        lo = 250 + (3200 - 250) * (k if up else 1 - k)
        out[a:b] = bandpass(x[a:b], lo, lo * 2.6)
    e = np.sin(np.linspace(0, np.pi, n)) ** 1.3
    return out * e * level


def pop(freq=760, level=0.30):
    n = int(0.09 * SR)
    t = t_of(n)
    f = freq * np.exp(-t * 16) + freq * 0.55
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return x * np.exp(-t * 48) * level


def tick(level=0.22):
    n = int(0.045 * SR)
    rng = np.random.default_rng(7)
    x = bandpass(rng.normal(0, 1, n), 1800, 6500)
    return x * np.exp(-t_of(n) * 150) * level


def chime(root=76, level=0.34):
    """Three ascending bells -- the order-confirmed sound."""
    total = int(1.5 * SR)
    out = np.zeros(total)
    for i, m in enumerate((root, root + 4, root + 7)):
        n = int(1.2 * SR)
        t = t_of(n)
        f = n2f(m)
        x = np.zeros(n)
        for mult, amp, dec in ((1.0, 1.0, 3.2), (2.76, 0.42, 5.0),
                               (5.40, 0.18, 7.5), (8.93, 0.07, 10.0)):
            x += amp * np.sin(2 * np.pi * f * mult * t) * np.exp(-t * dec)
        s = int(i * 0.13 * SR)
        out[s:s + n] += x[:total - s] * (0.9 ** i)
    return out * level / 1.6


def riser(dur=1.8, level=0.34):
    n = int(dur * SR)
    t = t_of(n)
    rng = np.random.default_rng(31)
    noise = rng.normal(0, 1, n)
    out = np.zeros(n)
    steps = 40
    for i in range(steps):
        a, b = i * n // steps, (i + 1) * n // steps
        k = i / (steps - 1.0)
        lo = 300 + 5200 * k ** 1.7
        out[a:b] = bandpass(noise[a:b], lo, lo * 1.9)
    tone = np.sin(2 * np.pi * np.cumsum(180 * np.exp(t * 1.1)) / SR) * 0.35
    e = np.linspace(0, 1, n) ** 2.0
    return (out + tone) * e * level


def impact(level=0.5):
    n = int(0.9 * SR)
    t = t_of(n)
    f = 90 * np.exp(-t * 9) + 38
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5)
    rng = np.random.default_rng(41)
    air = lowpass(rng.normal(0, 1, n), 2500) * np.exp(-t * 11) * 0.22
    return (x + air) * level


# ------------------------------------------------------------------ the bed
PROG = [
    (48, [60, 64, 67]),   # C
    (43, [59, 62, 67]),   # G
    (45, [57, 60, 64]),   # Am
    (41, [57, 60, 65]),   # F
]


def music(duration, build_at=None):
    """The loop, arranged so it grows instead of just repeating."""
    n = int(duration * SR) + SR
    pad = np.zeros(n)
    arp = np.zeros(n)
    bas = np.zeros(n)
    drm = np.zeros(n)

    def add(track, seg, at):
        s0 = int(at * SR)
        if s0 >= len(track) or s0 < 0:
            return
        e0 = min(len(track), s0 + len(seg))
        track[s0:e0] += seg[: e0 - s0]

    bars = int(duration / BAR) + 2
    for b in range(bars):
        t0 = b * BAR
        s0 = int(t0 * SR)
        root, chord = PROG[b % 4]

        add(pad, pad_chord(chord, BAR * 1.02, level=0.22), t0)

        # arpeggio: eighth notes, up then down, an octave above the chord
        tones = [m + 12 for m in chord] + [chord[1] + 12]
        for i in range(8):
            m = tones[[0, 1, 2, 3, 2, 1, 0, 1][i] % len(tones)]
            add(arp, pluck(m, 0.42, level=0.18 if b < 2 else 0.23),
                t0 + i * BEAT / 2)

        if b >= 1:                                   # bass joins after a bar
            for i, off in enumerate((0.0, 1.5 * BEAT, 2.5 * BEAT)):
                add(bas, bass(root if i != 2 else root + 7, BEAT * 0.9), t0 + off)

        if b >= 2:                                   # drums after two
            for beat in range(4):
                if beat in (0, 2):
                    add(drm, kick(), t0 + beat * BEAT)
                if b >= 4 and beat in (1, 3):
                    add(drm, clap(), t0 + beat * BEAT)
            for i in range(8):
                add(drm, hat(level=0.08 if i % 2 == 0 else 0.12), t0 + i * BEAT / 2)

    # sidechain: duck the sustained layers on every kick, the motivational tic
    duck = np.ones(n)
    for b in range(bars):
        for beat in (0, 2):
            s = int((b * BAR + beat * BEAT) * SR)
            if s >= n:
                break
            L = int(0.34 * SR)
            e = min(n, s + L)
            duck[s:e] = np.minimum(duck[s:e],
                                   0.45 + 0.55 * np.linspace(0, 1, e - s) ** 0.6)
    pad *= duck
    bas *= duck * 0.85 + 0.15

    mix = pad * 0.85 + arp * 1.25 + bas * 0.9 + drm * 0.95
    mix = reverb(mix, wet=0.24)
    mix = lowpass(mix, 13500)
    mix = highpass(mix, 78)                    # drop what a phone cannot reproduce
    mix = mix + highpass(mix, 2200) * 0.38     # presence shelf, so it cuts through

    out = mix[:int(duration * SR)]
    # ease the very start and the very end
    fi = int(1.2 * SR)
    out[:fi] *= np.linspace(0, 1, fi) ** 1.5
    fo = int(2.2 * SR)
    out[-fo:] *= np.linspace(1, 0, fo) ** 1.2
    return out


def reverb(x, wet=0.25, tail=1.7):
    n = int(tail * SR)
    rng = np.random.default_rng(99)
    ir = rng.normal(0, 1, n) * np.exp(-np.linspace(0, 6.5, n))
    ir = lowpass(ir, 4200)
    ir[: int(0.012 * SR)] = 0
    ir /= np.abs(ir).sum() / 12.0
    w = signal.fftconvolve(x, ir)[: len(x)]
    return x * (1 - wet) + w * wet


# ------------------------------------------------------------------- mixing
def place(track, clip, at, gain=1.0):
    s = int(at * SR)
    if s >= len(track):
        return
    e = min(len(track), s + len(clip))
    track[s:e] += clip[: e - s] * gain


def db(x):
    return 20 * np.log10(max(1e-12, x))


def master(bed, fx, duration, bed_peak_db=-20.0, fx_peak_db=-9.0):
    def norm(x, target_db):
        p = np.abs(x).max()
        return x * (10 ** (target_db / 20.0) / p) if p > 0 else x

    bed = norm(bed, bed_peak_db)
    fx = norm(fx, fx_peak_db)
    mix = bed + fx
    mix = np.tanh(mix * 1.25) / 1.25          # gentle limiting, no hard clip
    # a touch of stereo width: the bed only, effects stay centred
    left = mix + 0.04 * np.roll(bed, 220)
    right = mix - 0.04 * np.roll(bed, 220)
    st = np.stack([left, right], axis=1)
    st /= max(1.0, np.abs(st).max() / 0.97)
    return st


def write_wav(path, stereo):
    data = (np.clip(stereo, -1, 1) * 32767).astype(np.int16)
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
