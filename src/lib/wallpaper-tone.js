import { DEFAULT_BRIGHTNESS } from "./background-cache-keys.js";

// Photographs get the same treatment gradients do: pushed clear of the value band the icon tiles
// occupy, so the tiles read as the foreground instead of competing with the picture behind them.
// A gradient's luminance is known from its stops; a photo's has to be measured, which the page
// can do locally because the wallpaper is already a blob in Cache Storage.
//
// Two different questions are asked of one photo, and they need two different numbers:
//
//   * "Is this picture overexposed for a backdrop?" — about the whole frame, answered by the mean.
//   * "Will white captions survive on it?" — about the few rows the captions occupy, and about
//     the bright parts of those rows, because white text is destroyed by highlights rather than
//     by averages.
//
// Feeding the mean to the second question is what made captions wash out. Measured across eight
// real Bing wallpapers, two were misjudged: one had a mean of 0.209 — comfortably "dark" — while
// the caption rows hit 0.427. The average was dominated by dark regions elsewhere in the frame.
const SAMPLE_W = 64;
// Enough vertical resolution to isolate the caption rows from the sky above them; the old 24x24
// grid could not tell those apart.
const SAMPLE_H = 40;
// Where the shortcut grid and its captions sit, as a fraction of the page height. Below the
// search box, above the photo credit, wide enough to cover two to four rows of tiles.
const BAND_TOP = 0.35;
const BAND_BOTTOM = 0.80;
// A high percentile rather than the maximum: one stray specular highlight should not flip every
// caption on the page, but the bright fifth of the band should. Taking the global percentile
// instead of the band's would over-correct — a bright sky above a dark grid measured 0.666
// globally and 0.365 in the band, and flipping that one to dark ink would have been wrong.
const BAND_QUANTILE = 0.85;
// Roughly where the deep gradients land. Photos are not crushed all the way there — they still
// have to look like photographs — but they are brought close.
const TARGET_LUMINANCE = 0.22;
// Never brighten automatically: a lighter wallpaper reduces icon contrast, which is the opposite
// of the point, and blowing out someone's photo is a bigger insult than leaving it dim.
const MIN_FACTOR = 0.5;

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function quantile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

// Pure half of the measurement, so the statistics can be tested without a canvas. `data` is RGBA
// as getImageData returns it; rows are top to bottom.
export function toneFromPixels(data, width, height) {
  const all = [];
  const band = [];
  for (let y = 0; y < height; y++) {
    const inBand = y / height >= BAND_TOP && y / height <= BAND_BOTTOM;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 16) continue;
      const luminance = 0.2126 * channel(data[i]) + 0.7152 * channel(data[i + 1]) + 0.0722 * channel(data[i + 2]);
      all.push(luminance);
      if (inBand) band.push(luminance);
    }
  }
  if (!all.length) return null;
  return {
    mean: all.reduce((total, value) => total + value, 0) / all.length,
    // Falls back to the mean only if the band came out empty, which needs a degenerate image.
    captionBand: quantile(band, BAND_QUANTILE) ?? all.reduce((total, value) => total + value, 0) / all.length,
  };
}

// Tone of a wallpaper, or null when it cannot be read. Callers must treat null as "leave the
// photo alone" rather than guessing.
export async function measureWallpaperTone(url) {
  if (!url || typeof document === "undefined") return null;
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, SAMPLE_W, SAMPLE_H);
    return toneFromPixels(context.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data, SAMPLE_W, SAMPLE_H);
  } catch {
    return null;
  }
}

// Turns a measured luminance into a value for the brightness slider, so the automatic result and
// a hand-set one are the same kind of thing and the slider keeps showing the truth. This one is
// deliberately fed the mean: it is about the photo's exposure, not about the captions.
export function autoBrightnessFor(luminance) {
  if (luminance === null || luminance === undefined || luminance <= TARGET_LUMINANCE) return DEFAULT_BRIGHTNESS;
  const factor = Math.max(MIN_FACTOR, TARGET_LUMINANCE / luminance);
  // Inverse of brightnessFactor() below 50: factor = 1 - ((50 - level) / 50) * 0.55.
  return Math.round(50 - ((1 - factor) / 0.55) * 50);
}
