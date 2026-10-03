# Walkthrough video generator

Renders `tamem-walkthrough.mp4` — 1080×1920, 30 fps, about 83 seconds — that
walks a customer through the app from finding it on Google Play to the order
arriving, with an original soundtrack. Vertical, so it fits Reels, TikTok,
Shorts and WhatsApp Status without recropping.

| file              | what it does                                                      |
| ----------------- | ----------------------------------------------------------------- |
| `timeline.py`     | the single source of truth: scene order, copy and durations       |
| `audio.py`        | the synthesiser — instruments, effects, mixing                    |
| `make_audio.py`   | builds `soundtrack.wav` with effects locked to the timeline       |
| `video_scenes.py` | turns each scene into pre-rendered RGBA layers with entrance cues |
| `make_video.py`   | composites the frames and pipes them into ffmpeg                  |

Both the music and the effects are synthesised from scratch — nothing sampled
or downloaded — so the track is ours to publish. It is a C–G–Am–F loop at
96 BPM with pad, pluck, bass and drums, sidechained to the kick, mixed to about
−21 LUFS so it stays under the visuals rather than over them.

## Running it

```
pip install pillow arabic-reshaper python-bidi numpy scipy      # plus ffmpeg on PATH
set TAMEM_POST_ROOT=E:/Tamem/.work/post
python scripts/social-video/make_audio.py                        # ~30 s
python scripts/social-video/make_video.py                        # ~4½ min
```

`TAMEM_POST_ROOT` is the folder holding `shots/` and `assets/`, exactly as
[../social-post/README.md](../social-post/README.md) describes — this generator
reuses that toolkit for the background, the Arabic shaping and the device
mockups, but at 1080×1920 instead of 1080×1350.

## How the motion works

Every scene is reduced to a list of `Element`s, each a pre-rendered RGBA layer
with an entrance time and one of four styles (`up`, `right`, `pop`, `fade`).
Per frame we only paste and fade those, which is what keeps 2 500 frames inside
a few minutes — compositing each scene from scratch every frame would not.

Scenes do not cross-fade into each other. The content of the outgoing scene
fades over its last 0.28 s while the background, the logo and the progress bar
stay put, and a soft diagonal light sweep crosses the frame on the cut. The
result reads as a deliberate beat rather than a hard edit, and it costs one
paste instead of rendering two scenes at once.
