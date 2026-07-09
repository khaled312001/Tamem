/**
 * Builds tamem-barmagly-agreement.html by inlining both logos as base64
 * and dropping them into the HTML template. Keeps the final file self-
 * contained so it publishes cleanly as an Artifact.
 */
const fs = require('fs');
const path = require('path');

const tamem = fs.readFileSync(path.resolve(__dirname, '../apps/landing/public/logo.png'));
const barmagly = fs.readFileSync(path.resolve(__dirname, '../apps/landing/public/barmagly-logo.jpg'));

const tamemUri = 'data:image/png;base64,' + tamem.toString('base64');
const barmaglyUri = 'data:image/jpeg;base64,' + barmagly.toString('base64');

const html = fs.readFileSync(path.resolve(__dirname, 'agreement.template.html'), 'utf8');
const out = html
  .replace(/__TAMEM_LOGO__/g, tamemUri)
  .replace(/__BARMAGLY_LOGO__/g, barmaglyUri);

fs.writeFileSync(path.resolve(__dirname, 'tamem-barmagly-agreement.html'), out);
console.log('✓ built', path.resolve(__dirname, 'tamem-barmagly-agreement.html'));
console.log('  size:', out.length, 'chars');
