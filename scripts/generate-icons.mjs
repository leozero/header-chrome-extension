// Renders the extension icons (no dependencies): a blue rounded square with
// three "header lines", the first one prefixed by a key-like dot.
// Usage: npm run icons

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor for antialiasing

// Shapes in a 0..1 coordinate space.
const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const bar = (x, y, x0, x1, yc, h) => inRoundRect(x, y, x0, yc - h / 2, x1, yc + h / 2, h / 2);
const dot = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

function sample(x, y) {
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  if (!inRoundRect(x, y, 0.02, 0.02, 0.98, 0.98, 0.22)) return null;
  const white = [255, 255, 255];
  const h = 0.11;
  if (dot(x, y, 0.27, 0.3, 0.075)) return [255, 214, 102];
  if (bar(x, y, 0.4, 0.78, 0.3, h)) return white;
  if (bar(x, y, 0.2, 0.8, 0.5, h)) return white;
  if (bar(x, y, 0.2, 0.62, 0.7, h)) return white;
  // Diagonal gradient #3b82f6 -> #1d4ed8
  const t = (x + y) / 2;
  return [59 + (29 - 59) * t, 130 + (78 - 130) * t, 246 + (216 - 246) * t];
}

// `inset` is the transparent padding in pixels around the artwork.
function render(size, inset = 0) {
  const art = size - 2 * inset;
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((pxl - inset + (sx + 0.5) / SS) / art, (py - inset + (sy + 0.5) / SS) / art);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a++;
        }
      }
      const i = (py * size + pxl) * 4;
      if (a) {
        px[i] = r / a;
        px[i + 1] = g / a;
        px[i + 2] = b / a;
      }
      px[i + 3] = (255 * a) / (SS * SS);
    }
  }
  return encodePng(size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of SIZES) {
  const file = new URL(`../extension/icons/icon-${size}.png`, import.meta.url);
  writeFileSync(file, render(size));
  console.log(`wrote ${file.pathname}`);
}

// Chrome Web Store icon: 96x96 artwork with 16px transparent padding.
const storeIcon = new URL('../store/images/store-icon-128.png', import.meta.url);
mkdirSync(new URL('.', storeIcon), { recursive: true });
writeFileSync(storeIcon, render(128, 16));
console.log(`wrote ${storeIcon.pathname}`);
