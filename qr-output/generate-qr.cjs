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

/* ------------------------------------------------------------------ */
/* Combined "all-channels" QR — one QR that opens the linktree page    */
/* with Tamem logo center + Facebook / TikTok / WhatsApp icons in the  */
/* footer of the frame, each in its platform-brand circle.             */
/* ------------------------------------------------------------------ */

const PLATFORMS = [
  {
    name: 'facebook',
    color: '#1877F2',
    // Facebook "f" mark (Simple Icons path).
    path:
      'M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.128 22 16.991 22 12z',
  },
  {
    name: 'tiktok',
    color: '#000000',
    path:
      'M16.6 5.82s.51.5 0 0A4.278 4.278 0 0 1 15.54 3h-3.09v12.4a2.592 2.592 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6c0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64c0 3.33 2.76 5.7 5.69 5.7c3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48',
  },
  {
    name: 'whatsapp',
    color: '#25D366',
    // Simplified WhatsApp glyph (Simple Icons path).
    path:
      'M17.498 14.382c-.301-.15-1.767-.867-2.04-.966c-.273-.101-.473-.15-.673.15c-.197.295-.771.964-.944 1.162c-.175.195-.349.21-.646.075c-.3-.15-1.263-.465-2.403-1.485c-.888-.795-1.484-1.77-1.66-2.07c-.174-.3-.019-.465.13-.615c.136-.135.301-.345.451-.523c.146-.181.194-.301.297-.496c.1-.21.049-.375-.025-.524c-.075-.15-.672-1.62-.922-2.206c-.24-.584-.487-.51-.672-.51c-.172-.015-.371-.015-.571-.015c-.2 0-.523.074-.797.359c-.273.3-1.045 1.02-1.045 2.475c0 1.455 1.07 2.865 1.219 3.075c.149.195 2.105 3.195 5.1 4.485c.714.3 1.27.48 1.704.629c.715.227 1.365.195 1.88.121c.574-.091 1.767-.721 2.016-1.426c.255-.705.255-1.29.18-1.425c-.074-.135-.27-.21-.57-.345m-5.446 7.443h-.016a9.87 9.87 0 0 1-5.031-1.378l-.361-.214l-3.741.982l.998-3.648l-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884c2.64 0 5.122 1.03 6.988 2.898a9.83 9.83 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.81 11.81 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.88 11.88 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.48-8.413',
  },
];

async function buildCombined({
  file = 'tamem-all-links-qr.png',
  url = 'https://deliverytamem.com/links',
} = {}) {
  // The combined card is taller because of the bottom platform-icon row.
  const C_SIZE_W = 1500;
  const C_SIZE_H = 1750;
  const C_PADDING = 80;
  const C_FRAME_STROKE = 16;
  const C_FRAME_RADIUS = 64;
  const C_INNER_RADIUS = 40;
  const C_TITLE_STRIP = 140; // top: "تابعنا على كل المنصات"
  const C_QR_SIZE = 1100;
  const C_QR_X = (C_SIZE_W - C_QR_SIZE) / 2;
  const C_QR_Y = C_PADDING + C_TITLE_STRIP + 10;
  const C_ICONS_Y = C_QR_Y + C_QR_SIZE + 60;
  const C_ICON_CIRCLE = 130;
  const C_ICON_GAP = 60;
  const C_ICON_TOTAL_W = C_ICON_CIRCLE * PLATFORMS.length + C_ICON_GAP * (PLATFORMS.length - 1);
  const C_ICON_START_X = (C_SIZE_W - C_ICON_TOTAL_W) / 2;
  const C_LOGO_BOX = Math.round(C_QR_SIZE * 0.22);
  const C_LOGO_PAD = Math.round(C_LOGO_BOX * 0.12);
  const C_LOGO_IMG = C_LOGO_BOX - C_LOGO_PAD * 2;
  const C_LOGO_X = (C_SIZE_W - C_LOGO_BOX) / 2;
  const C_LOGO_Y = C_QR_Y + (C_QR_SIZE - C_LOGO_BOX) / 2;

  const out = path.join(OUT_DIR, file);

  const qrBuffer = await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: C_QR_SIZE,
    margin: 1,
    color: { dark: INK, light: '#FFFFFF' },
  });

  // Top frame + title bar (brand red→gold gradient outline + heading).
  const frameSvg = Buffer.from(`
    <svg width="${C_SIZE_W}" height="${C_SIZE_H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#E0301E"/>
          <stop offset="0.5" stop-color="#F2A93B"/>
          <stop offset="1" stop-color="#EC7A2C"/>
        </linearGradient>
      </defs>
      <rect width="${C_SIZE_W}" height="${C_SIZE_H}" fill="#FFFFFF"/>
      <rect x="${C_FRAME_STROKE / 2}" y="${C_FRAME_STROKE / 2}"
            width="${C_SIZE_W - C_FRAME_STROKE}" height="${C_SIZE_H - C_FRAME_STROKE}"
            rx="${C_FRAME_RADIUS}" ry="${C_FRAME_RADIUS}"
            fill="none" stroke="url(#g)" stroke-width="${C_FRAME_STROKE}"/>
      <rect x="${C_FRAME_STROKE + 20}" y="${C_FRAME_STROKE + 20}"
            width="${C_SIZE_W - (C_FRAME_STROKE + 20) * 2}"
            height="${C_SIZE_H - (C_FRAME_STROKE + 20) * 2}"
            rx="${C_INNER_RADIUS}" ry="${C_INNER_RADIUS}"
            fill="none" stroke="#E0301E" stroke-width="2" stroke-opacity="0.18"/>
    </svg>
  `);

  const titleSvg = Buffer.from(`
    <svg width="${C_SIZE_W}" height="${C_TITLE_STRIP}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .ar { font: 900 84px 'Cairo','Segoe UI','Tahoma',sans-serif; fill: ${INK}; }
        .sub { font: 500 32px 'Segoe UI',sans-serif; fill: #58595B; letter-spacing: 1px; }
      </style>
      <text x="${C_SIZE_W / 2}" y="86" text-anchor="middle" class="ar">تابعنا على كل المنصات</text>
      <text x="${C_SIZE_W / 2}" y="128" text-anchor="middle" class="sub">FOLLOW US EVERYWHERE</text>
    </svg>
  `);

  // White rounded knockout for the logo so it doesn't get lost in the QR.
  const logoBgSvg = Buffer.from(`
    <svg width="${C_LOGO_BOX}" height="${C_LOGO_BOX}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${C_LOGO_BOX}" height="${C_LOGO_BOX}"
            rx="${Math.round(C_LOGO_BOX * 0.18)}" ry="${Math.round(C_LOGO_BOX * 0.18)}"
            fill="#FFFFFF" stroke="#E0301E" stroke-width="6"/>
    </svg>
  `);

  const logoResized = await sharp(LOGO)
    .resize(C_LOGO_IMG, C_LOGO_IMG, { fit: 'contain', background: '#FFFFFF' })
    .png()
    .toBuffer();

  // 3 platform circles in a row. Each rendered as its own SVG buffer
  // because sharp's compositor needs raster/SVG buffers, not nested SVG.
  const iconSize = 70;
  const iconOffset = (C_ICON_CIRCLE - iconSize) / 2;
  const iconBuffers = PLATFORMS.map((p) => {
    const svg = `
      <svg width="${C_ICON_CIRCLE}" height="${C_ICON_CIRCLE}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
            <feOffset dx="0" dy="6" result="off"/>
            <feComponentTransfer><feFuncA type="linear" slope="0.25"/></feComponentTransfer>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="${C_ICON_CIRCLE / 2}" cy="${C_ICON_CIRCLE / 2}"
                r="${C_ICON_CIRCLE / 2 - 4}" fill="${p.color}" filter="url(#shadow)"/>
        <g transform="translate(${iconOffset},${iconOffset}) scale(${iconSize / 24})" fill="#FFFFFF">
          <path d="${p.path}"/>
        </g>
      </svg>
    `;
    return Buffer.from(svg);
  });

  // URL label below the icons.
  const urlSvg = Buffer.from(`
    <svg width="${C_SIZE_W}" height="100" xmlns="http://www.w3.org/2000/svg">
      <style>
        .url { font: 600 30px 'Segoe UI',sans-serif; fill: #E0301E; letter-spacing: 1.5px; }
        .sub { font: 400 24px 'Segoe UI',sans-serif; fill: #58595B; }
      </style>
      <text x="${C_SIZE_W / 2}" y="44" text-anchor="middle" class="url">deliverytamem.com/links</text>
      <text x="${C_SIZE_W / 2}" y="80" text-anchor="middle" class="sub">امسح الكود · صفحة واحدة · كل القنوات</text>
    </svg>
  `);

  const composites = [
    { input: frameSvg, top: 0, left: 0 },
    { input: titleSvg, top: C_PADDING, left: 0 },
    { input: qrBuffer, top: Math.round(C_QR_Y), left: Math.round(C_QR_X) },
    { input: logoBgSvg, top: Math.round(C_LOGO_Y), left: Math.round(C_LOGO_X) },
    {
      input: logoResized,
      top: Math.round(C_LOGO_Y + C_LOGO_PAD),
      left: Math.round(C_LOGO_X + C_LOGO_PAD),
    },
    ...iconBuffers.map((buf, i) => ({
      input: buf,
      top: Math.round(C_ICONS_Y),
      left: Math.round(C_ICON_START_X + i * (C_ICON_CIRCLE + C_ICON_GAP)),
    })),
    { input: urlSvg, top: Math.round(C_ICONS_Y + C_ICON_CIRCLE + 30), left: 0 },
  ];

  const meta = await sharp({
    create: { width: C_SIZE_W, height: C_SIZE_H, channels: 4, background: '#FFFFFF' },
  })
    .composite(composites)
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(out);

  return { file: out, url, ...meta };
}

(async () => {
  void BRAND_RED;
  const results = [];
  for (const t of TARGETS) {
    results.push(await buildOne(t));
  }
  results.push(await buildCombined());
  console.log(JSON.stringify({ ok: true, generated: results }, null, 2));
})().catch((err) => {
  console.error('QR generation failed:', err);
  process.exit(1);
});
