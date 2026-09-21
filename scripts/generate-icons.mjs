// Run with `node scripts/generate-icons.mjs`; sharp is installed by miniflare.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = new URL('../public/', import.meta.url);
const icon = await readFile(new URL('favicon.svg', publicDir), 'utf8');
const social = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f5f5f7"/>
  ${icon.replace('<svg ', '<svg x="80" y="72" width="48" height="48" ')}
  <g font-family="Arial, Helvetica, sans-serif">
    <text x="146" y="106" font-size="27" font-weight="600" fill="#1d1d1f">Vergil Calendar</text>
    <text x="76" y="285" font-size="80" font-weight="700" letter-spacing="-3" fill="#1d1d1f">Your classes.</text>
    <text x="76" y="379" font-size="80" font-weight="700" letter-spacing="-3" fill="#0066cc">In your calendar.</text>
    <text x="80" y="532" font-size="25" fill="#6e6e73">A simpler way to sync your Columbia schedule.</text>
  </g>
  ${icon.replace('<svg ', '<svg x="884" y="213" width="228" height="228" ')}
</svg>`;

for (const [name, source, width, height] of [
  ['favicon-32.png', icon, 32, 32],
  ['apple-touch-icon.png', icon, 180, 180],
  ['icon-192.png', icon, 192, 192],
  ['icon-512.png', icon, 512, 512],
  ['og-image.png', social, 1200, 630],
]) {
  const path = fileURLToPath(new URL(name, publicDir));
  await sharp(Buffer.from(source)).resize(width, height).png().toFile(path);
  const metadata = await sharp(path).metadata();
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, height);
}
