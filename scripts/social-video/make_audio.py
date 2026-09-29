# -*- coding: utf-8 -*-
"""Builds soundtrack.wav: the music bed plus effects locked to the timeline."""
import os

import numpy as np

import audio as A
from timeline import SCENES, STARTS, DURATION

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "soundtrack.wav")


def main():
    n = int(DURATION * A.SR)
    bed = A.music(DURATION)
    fx = np.zeros(n)

    for i, (sc, t0) in enumerate(zip(SCENES, STARTS)):
        kind = sc["kind"]

        if i > 0:
            # the scene change itself
            A.place(fx, A.whoosh(0.42, level=0.42), t0 - 0.22)

        if kind == "cover":
            A.place(fx, A.impact(0.55), t0 + 0.35)
            A.place(fx, A.pop(620, 0.26), t0 + 1.75)
            A.place(fx, A.pop(820, 0.26), t0 + 2.25)
        elif kind == "download":
            for k in range(3):
                A.place(fx, A.whoosh(0.30, level=0.26), t0 + 0.7 + k * 0.75)
                A.place(fx, A.tick(0.22), t0 + 0.92 + k * 0.75)
        elif kind == "journey":
            for k in range(len(sc.get("items", []))):
                A.place(fx, A.pop(700 + k * 90, 0.20), t0 + 1.05 + k * 0.33)
        elif kind == "whatsapp":
            for k in range(4):                     # one per message bubble
                A.place(fx, A.pop(880 - k * 40, 0.26), t0 + 1.05 + k * 0.85)
        elif kind == "email":
            A.place(fx, A.tick(0.22), t0 + 1.1)
            A.place(fx, A.pop(640, 0.20), t0 + 2.3)
        elif kind == "cta":
            A.place(fx, A.riser(1.6, 0.30), t0 - 1.6)
            A.place(fx, A.impact(0.45), t0 + 0.15)
            A.place(fx, A.chime(76, 0.32), t0 + 0.5)

        if sc.get("slug") == "success":
            A.place(fx, A.chime(72, 0.30), t0 + 0.9)

    stereo = A.master(bed, fx, DURATION, bed_peak_db=-12.0, fx_peak_db=-6.0)
    A.write_wav(OUT, stereo)

    peak = np.abs(stereo).max()
    rms = float(np.sqrt((stereo ** 2).mean()))
    print("duration %.2fs  peak %.1f dBFS  rms %.1f dBFS  -> %s"
          % (DURATION, A.db(peak), A.db(rms), OUT))


if __name__ == "__main__":
    main()
