// Generates the extension's action/store icons.
//
// Chrome renders these at 16px in the toolbar and 128px in the store, so the mark has to be a
// single bold shape on a solid ground — the previous icons were a cropped wallpaper photo, which
// turned into an unreadable smudge at toolbar size and looked nothing like a browser extension.
// The mark is a light orb rising over a horizon: literal for 浮光新页, and legible as two blobs
// even at 16px.
//
// Rendered procedurally (4x supersampled, no dependencies) so the icons can be regenerated from
// source rather than living as opaque binaries nobody can edit.
import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor

// The app's own accent family (see ACCENTS in src/lib/icons.js), so the icon belongs to the
// same product as the tiles it draws.
const TOP = [0x3b, 0x6b, 0xf5];
const BOTTOM = [0x7c, 0x2b, 0xeb];

const mix = (a, b, t) => a.map((channel, i) => Math.round(channel + (b[i] - channel) * t));

function roundedRectCoverage(x, y, size, radius) {
  const inner = size - radius;
  const cx = x < radius ? radius : x > inner ? inner : x;
  const cy = y < radius ? radius : y > inner ? inner : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function renderIcon(size) {
  const dim = size * SS;
  // Chrome's own icons sit on a squircle of roughly this proportion; matching it keeps LumaTab
  // from looking foreign next to the browser's built-in entries.
  const radius = dim * 0.2237;
  const pixels = Buffer.alloc(dim * dim * 4);

  // A disc with the horizon cutting across its lower third: unmistakably a sunrise. An earlier
  // version floated the disc above a separate pill, which is the universal avatar silhouette —
  // it read as a profile picture, not as a new tab.
  const orb = { x: dim * 0.5, y: dim * 0.455, r: dim * 0.225 };
  const horizon = { y: dim * 0.625, half: dim * 0.375, thickness: dim * 0.05 };

  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      const index = (y * dim + x) * 4;
      if (!roundedRectCoverage(x + 0.5, y + 0.5, dim, radius)) continue;

      // Diagonal gradient: the light reads as coming from the upper left.
      const t = Math.min(1, Math.max(0, (x / dim) * 0.35 + (y / dim) * 0.65));
      let [r, g, b] = mix(TOP, BOTTOM, t);

      const dx = x + 0.5 - orb.x;
      const dy = y + 0.5 - orb.y;
      const inOrb = dx * dx + dy * dy <= orb.r * orb.r;
      const spanX = Math.abs(x + 0.5 - dim * 0.5);
      const onHorizon = Math.abs(y + 0.5 - horizon.y) <= horizon.thickness / 2 && spanX <= horizon.half;

      if (onHorizon) {
        // Inside the disc the horizon is a gap in the light; outside it, it is the light.
        [r, g, b] = inOrb ? [r, g, b] : mix([r, g, b], [255, 255, 255], 0.9);
      } else if (inOrb) {
        [r, g, b] = [255, 255, 255];
      }

      pixels[index] = r;
      pixels[index + 1] = g;
      pixels[index + 2] = b;
      pixels[index + 3] = 255;
    }
  }

  // Box-downsample the supersampled buffer; this is where the antialiasing comes from.
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * dim + (x * SS + sx)) * 4;
          const alpha = pixels[i + 3] / 255;
          r += pixels[i] * alpha;
          g += pixels[i + 1] * alpha;
          b += pixels[i + 2] * alpha;
          a += alpha;
        }
      }
      const i = (y * size + x) * 4;
      // Un-premultiply so edge pixels keep their colour instead of darkening toward black.
      out[i] = a ? Math.round(r / a) : 0;
      out[i + 1] = a ? Math.round(g / a) : 0;
      out[i + 2] = a ? Math.round(b / a) : 0;
      out[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return out;
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = resolve(process.argv[2] ?? "public/assets/icons");
await mkdir(outDir, { recursive: true });
for (const size of SIZES) {
  const file = resolve(outDir, `icon-${size}.png`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, encodePng(renderIcon(size), size));
  console.log(`wrote ${file}`);
}
