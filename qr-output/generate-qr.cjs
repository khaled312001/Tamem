/**
 * Generates a premium QR code PNG for the Tamem Facebook page.
 *
 *  - 1500x1500 final canvas, white background
 *  - Tamem brand-red rounded frame with subtle inner border
 *  - QR with H-level error correction (so the centre logo can punch ~25%)
 *  - Logo composited in a white rounded square in the middle (so the QR
 *    still scans cleanly)
 *  - Small Arabic+Latin label strip under the QR
 */
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const sharp = require('sharp');

const URL = 'https://www.facebook.com/profile.php?id=100064713581319';
const OUT = path.resolve(__dirname, 'tamem-facebook-qr.png');
const LOGO = path.resolve(__dirname, '..', 'apps', 'landing', 'public', 'logo.png');

const RED = '#E0301E';
const GOLD = '#F2A93B';
const INK = '#241310';

// final image dimensions
const SIZE = 1500;
const PADDING = 80; // outer white margin inside the frame
const FRAME_STROKE = 14;
const FRAME_RADIUS = 60;
const INNER_RADIUS = 36;
const LABEL_STRIP = 180; // height reserved for the bottom label

// QR area
const QR_AREA_W = SIZE - PADDING * 2;
const QR_AREA_H = SIZE - PADDING * 2 - LABEL_STRIP;
const QR_SIZE = Math.min(QR_AREA_W, QR_AREA_H);
const QR_X = (SIZE - QR_SIZE) / 2;
const QR_Y = PADDING + 20;

// logo overlay (~22% of QR — H error correction handles up to 30%)
const LOGO_BOX = Math.round(QR_SIZE * 0.22);
const LOGO_PAD = Math.round(LOGO_BOX * 0.12);
const LOGO_IMG = LOGO_BOX - LOGO_PAD * 2;
const LOGO_X = (SIZE - LOGO_BOX) / 2;
const LOGO_Y = QR_Y + (QR_SIZE - LOGO_BOX) / 2;

async function main() {
  // 1. Generate raw QR PNG buffer at the target size, max error correction.
  const qrBuffer = await QRCode.toBuffer(URL, {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: QR_SIZE,
    margin: 1,
    color: { dark: INK, light: '#FFFFFF' },
  });

  // 2. Frame SVG — soft red outer ring + gold inner accent.
  const frameSvg = Buffer.from(`
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${RED}"/>
          <stop offset="1" stop-color="${GOLD}"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="#FFFFFF"/>
      <rect x="${FRAME_STROKE / 2}" y="${FRAME_STROKE / 2}"
            width="${SIZE - FRAME_STROKE}" height="${SIZE - FRAME_STROKE}"
            rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}"
            fill="none" stroke="url(#g)" stroke-width="${FRAME_STROKE}"/>
      <rect x="${FRAME_STROKE + 18}" y="${FRAME_STROKE + 18}"
            width="${SIZE - (FRAME_STROKE + 18) * 2}" height="${SIZE - (FRAME_STROKE + 18) * 2}"
            rx="${INNER_RADIUS}" ry="${INNER_RADIUS}"
            fill="none" stroke="${RED}" stroke-width="2" stroke-opacity="0.18"/>
    </svg>
  `);

  // 3. White rounded "knockout" square that sits behind the logo so the
  //    QR pixels under it stay invisible-but-decoded by error correction.
  const logoBgSvg = Buffer.from(`
    <svg width="${LOGO_BOX}" height="${LOGO_BOX}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${LOGO_BOX}" height="${LOGO_BOX}"
            rx="${Math.round(LOGO_BOX * 0.18)}" ry="${Math.round(LOGO_BOX * 0.18)}"
            fill="#FFFFFF" stroke="${RED}" stroke-width="6"/>
    </svg>
  `);

  // 4. Resize logo to fit, force square + transparent corners.
  const logoResized = await sharp(LOGO)
    .resize(LOGO_IMG, LOGO_IMG, { fit: 'contain', background: '#FFFFFF' })
    .png()
    .toBuffer();

  // 5. Bottom label strip (Arabic + Latin + URL hint).
  const labelY = QR_Y + QR_SIZE + 40;
  const labelSvg = Buffer.from(`
    <svg width="${SIZE}" height="${LABEL_STRIP}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .ar { font: 700 64px 'Cairo','Segoe UI','Tahoma',sans-serif; fill: ${INK}; }
        .en { font: 600 30px 'Segoe UI','Helvetica Neue',sans-serif; fill: ${RED}; letter-spacing: 2px; }
        .sub { font: 400 26px 'Segoe UI',sans-serif; fill: #58595B; }
      </style>
      <text x="${SIZE / 2}" y="78" text-anchor="middle" class="ar">امسح الكود لمتابعتنا</text>
      <text x="${SIZE / 2}" y="122" text-anchor="middle" class="en">TAMEM DELIVERY · FACEBOOK</text>
      <text x="${SIZE / 2}" y="160" text-anchor="middle" class="sub">fb.com/tamem.delivery</text>
    </svg>
  `);

  // 6. Compose everything.
  const out = await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: '#FFFFFF' },
  })
    .composite([
      { input: frameSvg, top: 0, left: 0 },
      { input: qrBuffer, top: Math.round(QR_Y), left: Math.round(QR_X) },
      { input: logoBgSvg, top: Math.round(LOGO_Y), left: Math.round(LOGO_X) },
      {
        input: logoResized,
        top: Math.round(LOGO_Y + LOGO_PAD),
        left: Math.round(LOGO_X + LOGO_PAD),
      },
      { input: labelSvg, top: Math.round(labelY), left: 0 },
    ])
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(OUT);

  console.log(JSON.stringify({ ok: true, file: OUT, ...out }, null, 2));
}

main().catch((err) => {
  console.error('QR generation failed:', err);
  process.exit(1);
});
