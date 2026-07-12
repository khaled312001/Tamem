/**
 * Builds two files from the two templates by inlining both logos as
 * base64 data URIs:
 *   - tamem-barmagly-agreement.html  (full 13-page contract)
 *   - tamem-barmagly-summary.html    (4-page summary)
 */
const fs = require('fs');
const path = require('path');

const tamem = fs.readFileSync(path.resolve(__dirname, '../apps/landing/public/logo.png'));
const barmagly = fs.readFileSync(path.resolve(__dirname, '../apps/landing/public/barmagly-logo.jpg'));

const tamemUri = 'data:image/png;base64,' + tamem.toString('base64');
const barmaglyUri = 'data:image/jpeg;base64,' + barmagly.toString('base64');

const targets = [
  { src: 'agreement.template.html', out: 'tamem-barmagly-agreement.html' },
  { src: 'summary.template.html', out: 'tamem-barmagly-summary.html' },
];

for (const t of targets) {
  const srcPath = path.resolve(__dirname, t.src);
  if (!fs.existsSync(srcPath)) {
    console.log(`⊘ skip ${t.src} (not found)`);
    continue;
  }
  const html = fs.readFileSync(srcPath, 'utf8');
  const out = html
    .replace(/__TAMEM_LOGO__/g, tamemUri)
    .replace(/__BARMAGLY_LOGO__/g, barmaglyUri);
  const outPath = path.resolve(__dirname, t.out);
  fs.writeFileSync(outPath, out);
  console.log(`✓ built ${outPath} (${out.length} chars)`);
}
