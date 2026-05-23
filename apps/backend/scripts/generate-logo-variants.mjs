// Generates Expo-ready PNG variants from the Tamem logo JPG.
// Run with: node scripts/generate-logo-variants.mjs
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
// script lives at apps/backend/scripts/ — repo root is 3 levels up
const root = resolve(__dirname, '..', '..', '..');
const logoSrc = resolve(root, 'Tamem_Logo.jpg');

const mobileAssets = resolve(root, 'apps/mobile/src/assets');
const dashboardPublic = resolve(root, 'apps/dashboard/public');
const landingPublic = resolve(root, 'apps/landing/public');

if (!existsSync(mobileAssets)) mkdirSync(mobileAssets, { recursive: true });

const TAMEM_DARK = { r: 36, g: 19, b: 16 };
const TAMEM_RED = { r: 224, g: 48, b: 30 };
const WHITE = { r: 255, g: 255, b: 255 };

async function makeIcon(outPath, bg) {
  // Square 1024x1024 with logo centered, padded
  const inner = await sharp(logoSrc).resize({ width: 720, fit: 'contain' }).png().toBuffer();
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: bg },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .png()
    .toFile(outPath);
  console.log(`✓ ${outPath}`);
}

async function makeSplash(outPath, bg) {
  // 1242x2436 portrait (iPhone X-like)
  const inner = await sharp(logoSrc).resize({ width: 800, fit: 'contain' }).png().toBuffer();
  await sharp({
    create: { width: 1242, height: 2436, channels: 4, background: bg },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .png()
    .toFile(outPath);
  console.log(`✓ ${outPath}`);
}

async function makeFavicon(outPath, bg) {
  const inner = await sharp(logoSrc).resize({ width: 96, fit: 'contain' }).png().toBuffer();
  await sharp({
    create: { width: 128, height: 128, channels: 4, background: bg },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .png()
    .toFile(outPath);
  console.log(`✓ ${outPath}`);
}

async function makeOg(outPath) {
  const inner = await sharp(logoSrc).resize({ width: 500, fit: 'contain' }).png().toBuffer();
  await sharp({
    create: { width: 1200, height: 630, channels: 4, background: WHITE },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .png()
    .toFile(outPath);
  console.log(`✓ ${outPath}`);
}

async function main() {
  // Mobile (Expo) - icon white bg (Play Store), splash dark bg
  await makeIcon(resolve(mobileAssets, 'icon.png'), WHITE);
  await makeIcon(resolve(mobileAssets, 'adaptive-icon.png'), TAMEM_RED);
  await makeSplash(resolve(mobileAssets, 'splash.png'), TAMEM_DARK);

  // Dashboard favicon + logo
  await makeFavicon(resolve(dashboardPublic, 'favicon.png'), WHITE);

  // Landing favicon + OG image
  await makeFavicon(resolve(landingPublic, 'favicon.png'), WHITE);
  await makeOg(resolve(landingPublic, 'og-image.png'));

  console.log('\n✅ All logo variants generated.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
