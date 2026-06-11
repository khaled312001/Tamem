/**
 * Generates premium QR code PNGs for Tamem's social/contact channels.
 *
 *   - 1500x1500 final canvas, white background
 *   - Brand-themed gradient frame (different colors per platform)
 *   - Tamem logo composited in a white rounded square in the middle
 *   - Arabic + Latin label strip under the QR
 *
 * Add a new entry to TARGETS to generate more.
 */
const path = require('path');
const QRCode = require('qrcode');
const sharp = require('sharp');

const OUT_DIR = __dirname;
const LOGO = path.resolve(__dirname, '..', 'apps', 'landing', 'public', 'logo.png');

const BRAND_RED = '#E0301E';
const INK = '#241310';

const TARGETS = [
  {
    file: 'tamem-facebook-qr.png',
    url: 'https://www.facebook.com/profile.php?id=100064713581319',
    gradient: ['#E0301E', '#F2A93B'], // brand red → gold
    accent: '#E0301E',
    arabicTitle: 'امسح الكود لمتابعتنا',
    latinTitle: 'TAMEM DELIVERY · FACEBOOK',
    handle: 'fb.com/tamem.delivery',
  },
  {
    file: 'tamem-tiktok-qr.png',
    url: 'https://www.tiktok.com/@deliverytamem0?_r=1&_t=ZS-977CxobNlY2',
    gradient: ['#25F4EE', '#FE2C55'], // tiktok cyan → pink
    accent: '#FE2C55',
    arabicTitle: 'تابعنا على تيك توك',
    latinTitle: 'TAMEM DELIVERY · TIKTOK',
    handle: '@deliverytamem0',
  },
  {
    file: 'tamem-whatsapp-qr.png',
    // local 010... → international +20 (drop leading 0)
    url: 'https://wa.me/201070750167',
    gradient: ['#25D366', '#128C7E'], // whatsapp light green → dark green
    accent: '#128C7E',
    arabicTitle: 'تواصل معنا على واتساب',
    latinTitle: 'TAMEM DELIVERY · WHATSAPP',
    handle: '01070750167',
  },
];

const SIZE = 1500;
const PADDING = 80;
const FRAME_STROKE = 14;
const FRAME_RADIUS = 60;
const INNER_RADIUS = 36;
const LABEL_STRIP = 180;
const QR_AREA_W = SIZE - PADDING * 2;
const QR_AREA_H = SIZE - PADDING * 2 - LABEL_STRIP;
const QR_SIZE = Math.min(QR_AREA_W, QR_AREA_H);
const QR_X = (SIZE - QR_SIZE) / 2;
const QR_Y = PADDING + 20;
const LOGO_BOX = Math.round(QR_SIZE * 0.22);
const LOGO_PAD = Math.round(LOGO_BOX * 0.12);
const LOGO_IMG = LOGO_BOX - LOGO_PAD * 2;
const LOGO_X = (SIZE - LOGO_BOX) / 2;
const LOGO_Y = QR_Y + (QR_SIZE - LOGO_BOX) / 2;

async function buildOne({ file, url, gradient, accent, arabicTitle, latinTitle, handle }) {
  const out = path.join(OUT_DIR, file);

  const qrBuffer = await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: QR_SIZE,
    margin: 1,
    color: { dark: INK, light: '#FFFFFF' },
  });

  const frameSvg = Buffer.from(`
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${gradient[0]}"/>
          <stop offset="1" stop-color="${gradient[1]}"/>
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
            fill="none" stroke="${accent}" stroke-width="2" stroke-opacity="0.18"/>
    </svg>
  `);

  const logoBgSvg = Buffer.from(`
    <svg width="${LOGO_BOX}" height="${LOGO_BOX}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${LOGO_BOX}" height="${LOGO_BOX}"
            rx="${Math.round(LOGO_BOX * 0.18)}" ry="${Math.round(LOGO_BOX * 0.18)}"
            fill="#FFFFFF" stroke="${accent}" stroke-width="6"/>
    </svg>
  `);

  const logoResized = await sharp(LOGO)
    .resize(LOGO_IMG, LOGO_IMG, { fit: 'contain', background: '#FFFFFF' })
    .png()
    .toBuffer();

  const labelY = QR_Y + QR_SIZE + 40;
  const labelSvg = Buffer.from(`
    <svg width="${SIZE}" height="${LABEL_STRIP}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .ar { font: 700 64px 'Cairo','Segoe UI','Tahoma',sans-serif; fill: ${INK}; }
        .en { font: 600 30px 'Segoe UI','Helvetica Neue',sans-serif; fill: ${accent}; letter-spacing: 2px; }
        .sub { font: 400 26px 'Segoe UI',sans-serif; fill: #58595B; }
      </style>
      <text x="${SIZE / 2}" y="78" text-anchor="middle" class="ar">${arabicTitle}</text>
      <text x="${SIZE / 2}" y="122" text-anchor="middle" class="en">${latinTitle}</text>
      <text x="${SIZE / 2}" y="160" text-anchor="middle" class="sub">${handle}</text>
    </svg>
  `);

  const meta = await sharp({
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
    .toFile(out);

  return { file: out, url, ...meta };
}

(async () => {
  // Silence the accent / brand red lint nag for the future.
  void BRAND_RED;
  const results = [];
  for (const t of TARGETS) {
    results.push(await buildOne(t));
  }
  console.log(JSON.stringify({ ok: true, generated: results }, null, 2));
})().catch((err) => {
  console.error('QR generation failed:', err);
  process.exit(1);
});
