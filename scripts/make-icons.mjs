// Draws the app icon (a hot spot on a thermal camera, on the app's dark background) and writes
// the PNG sizes the manifest and iOS need. Its colours are the stops of the temperature gradient
// in src/ui/temperature.ts, hottest at the centre. Keep public/favicon.svg in step with it.
// Run with `node scripts/make-icons.mjs` after changing the design.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BACKGROUND = [0x12, 0x12, 0x12];
/** Colour by distance from the centre, as a share of the ember's radius. */
const RAMP = [
  [0.0, [0xfd, 0xf9, 0xd2]], // white-hot
  [0.2, [0xfb, 0xd9, 0x50]], // yellow
  [0.38, [0xf9, 0x8f, 0x2b]], // orange
  [0.55, [0xed, 0x49, 0x52]], // crimson
  [0.7, [0xc1, 0x31, 0x9d]], // magenta
  [0.85, [0x79, 0x2f, 0xb5]], // violet
  [1.0, [0x44, 0x3d, 0x96]], // indigo
  [1.2, [0x28, 0x1f, 0x67]],
  [1.5, BACKGROUND],
];
/** Ember radius as a share of the icon's width; small enough to survive a maskable crop. */
const RADIUS = 0.3;

function colourAt(distance) {
  for (let i = 1; i < RAMP.length; i++) {
    const [end, to] = RAMP[i];
    if (distance > end) continue;
    const [start, from] = RAMP[i - 1];
    const share = (distance - start) / (end - start);
    return from.map((channel, index) => Math.round(channel + (to[index] - channel) * share));
  }
  return BACKGROUND;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function png(size) {
  const rows = Buffer.alloc(size * (1 + size * 3));
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    const offset = y * (1 + size * 3);
    rows[offset] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - centre, y - centre) / (size * RADIUS);
      const [r, g, b] = colourAt(distance);
      rows.set([r, g, b], offset + 1 + x * 3);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(join(OUT, name), png(size));
  console.log(`wrote public/${name}`);
}
