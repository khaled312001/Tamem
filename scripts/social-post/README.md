# Social post generator

Renders the 20-frame Arabic carousel that walks a customer through Tamem, from
finding the app on Google Play to the order arriving at the door. Output is
1080×1350 PNG, brand red gradient, logo lockup on every frame.

- `post_design.py` — the shared look: background, header lockup, device mockup,
  bullet column, callout pills, Arabic shaping.
- `make_post.py` — the 20 frames and their copy.

Frames 1, 2, 16, 17 and 20 are drawn from scratch (Play badge, download QR, the
WhatsApp thread, the order e-mail, the call to action). The other 15 wrap a real
screenshot from the shipped build.

## Running it

Arabic needs reshaping because Pillow here has no raqm, and the text is drawn in
Tahoma Bold, which carries the presentation forms that `arabic_reshaper` emits.

```
pip install pillow arabic-reshaper python-bidi
```

The generator reads and writes next to itself unless `TAMEM_POST_ROOT` points
somewhere else. The working tree it expects:

```
$TAMEM_POST_ROOT/
  shots/    raw_*.png   1080x2400 device captures, status bar in demo mode
  assets/   qr_card.png             cropped from apps/landing/public/qr-play.png
            ar_badge_web_generic.png  official Google Play badge
  frames/   output
```

```
TAMEM_POST_ROOT=E:/Tamem/.work/post python scripts/social-post/make_post.py
```

Captures live outside git (they are ~15 MB); take them from a release build with
the layout pinned RTL, `settings put global sysui_demo_allowed 1` and the
SystemUI demo broadcasts for a clean 9:41 status bar.

The QR must keep its quiet zone — crop it with padding and check it still
decodes at the size it is pasted, not just at full resolution.
