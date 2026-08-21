import { surfaceForMark } from "./tile-surface.js";

const SAMPLE_SIZE = 32;
const MIN_ALPHA = 24;
const MIN_VISIBLE_PIXELS = 12;
const EDGE_OPAQUE_ALPHA = 200;
const EDGE_BLOCK = 3;
// Deep enough that a typical ~22% corner radius no longer leaves the corner probes sitting in
// the transparent cut-out, shallow enough to stay off the logo artwork in the middle.
const EDGE_INSET = 4;
const EDGE_AGREEMENT_TOLERANCE = 60;
// The four edge midpoints alone are a valid read for a rounded or circular mark, so requiring
// five would make every rounded icon fail and fall back to a white tile.
const EDGE_MIN_SAMPLES = 4;

function sampleBlock(pixels, size, startX, startY) {
  let r = 0, g = 0, b = 0, count = 0;
  for (let y = startY; y < startY + EDGE_BLOCK; y++) {
    for (let x = startX; x < startX + EDGE_BLOCK; x++) {
      const index = (y * size + x) * 4;
      if (pixels[index + 3] < EDGE_OPAQUE_ALPHA) continue;
      r += pixels[index];
      g += pixels[index + 1];
      b += pixels[index + 2];
      count += 1;
    }
  }
  return count ? [r / count, g / count, b / count] : null;
}

// Detects an icon that paints its own background out to its edges (a colored app-style tile)
// versus a bare logo mark on transparency. A full-bleed icon can simply *become* the tile —
// drawn edge to edge — which is the only way to avoid the seam that painting a sampled color
// behind the artwork inevitably leaves when the two shades differ even slightly.
// Corners are probed at an inset so a typical ~22% corner radius doesn't read as transparent,
// and edge midpoints stay valid even for a circular mark.
function edgeProfile(pixels, size) {
  const near = EDGE_INSET;
  const far = size - EDGE_BLOCK - EDGE_INSET;
  const mid = Math.round((size - EDGE_BLOCK) / 2);
  const samples = [
    sampleBlock(pixels, size, near, near), sampleBlock(pixels, size, far, near),
    sampleBlock(pixels, size, near, far), sampleBlock(pixels, size, far, far),
    sampleBlock(pixels, size, mid, near), sampleBlock(pixels, size, mid, far),
    sampleBlock(pixels, size, near, mid), sampleBlock(pixels, size, far, mid),
  ].filter(Boolean);
  if (samples.length < EDGE_MIN_SAMPLES) return { fullBleed: false, accentColor: null };
  const [avgR, avgG, avgB] = samples.reduce(
    (sum, [r, g, b]) => [sum[0] + r / samples.length, sum[1] + g / samples.length, sum[2] + b / samples.length],
    [0, 0, 0],
  );
  const agreeing = samples.filter(([r, g, b]) => Math.abs(r - avgR) + Math.abs(g - avgG) + Math.abs(b - avgB) <= EDGE_AGREEMENT_TOLERANCE);
  if (agreeing.length < EDGE_MIN_SAMPLES) return { fullBleed: false, accentColor: null };
  const [finalR, finalG, finalB] = agreeing.reduce(
    (sum, [r, g, b]) => [sum[0] + r / agreeing.length, sum[1] + g / agreeing.length, sum[2] + b / agreeing.length],
    [0, 0, 0],
  );
  return { fullBleed: true, accentColor: `rgb(${Math.round(finalR)}, ${Math.round(finalG)}, ${Math.round(finalB)})` };
}

// Decodes once and reports the bitmap's native size, whether it has visible content, and how
// the tile should present it, so callers can size and theme the tile without a second
// createImageBitmap pass over the same blob.
export async function analyzeIconBlob(blob) {
  if (!blob?.size) return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    const canvas = new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    context.drawImage(bitmap, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    bitmap.close();
    const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    let visible = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > MIN_ALPHA) visible += 1;
    }
    const { fullBleed, accentColor } = edgeProfile(pixels, SAMPLE_SIZE);
    // Only a bare mark needs a bed derived for it; full-bleed artwork already is one.
    const surfaceColor = fullBleed ? null : surfaceForMark(pixels, { minAlpha: MIN_ALPHA });
    return { width, height, visible: visible >= MIN_VISIBLE_PIXELS, fullBleed, accentColor, surfaceColor };
  } catch {
    return null;
  }
}
