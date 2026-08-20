import { DEFAULT_BRIGHTNESS } from "./background-cache-keys.js";

// Photographs get the same treatment gradients do: pushed clear of the value band the icon tiles
// occupy, so the tiles read as the foreground instead of competing with the picture behind them.
// A gradient's luminance is known from its stops; a photo's has to be measured, which the page
// can do locally because the wallpaper is already a blob in Cache Storage.
const SAMPLE = 24;
// Roughly where the deep gradients land. Photos are not crushed all the way there — they still
// have to look like photographs — but they are brought close.
const TARGET_LUMINANCE = 0.22;
// Never brighten automatically: a lighter wallpaper reduces icon contrast, which is the opposite
// of the point, and blowing out someone's photo is a bigger insult than leaving it dim.
const MIN_FACTOR = 0.5;

function relativeLuminance(data) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  let total = 0;
  let counted = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    total += 0.2126 * channel(data[i]) + 0.7152 * channel(data[i + 1]) + 0.0722 * channel(data[i + 2]);
    counted += 1;
  }
  return counted ? total / counted : null;
}

// Mean luminance of a wallpaper, or null when it cannot be read. Callers must treat null as
// "leave the photo alone" rather than guessing.
export async function measureWallpaperLuminance(url) {
  if (!url || typeof document === "undefined") return null;
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
    return relativeLuminance(context.getImageData(0, 0, SAMPLE, SAMPLE).data);
  } catch {
    return null;
  }
}

// Turns a measured luminance into a value for the brightness slider, so the automatic result and
// a hand-set one are the same kind of thing and the slider keeps showing the truth.
export function autoBrightnessFor(luminance) {
  if (luminance === null || luminance <= TARGET_LUMINANCE) return DEFAULT_BRIGHTNESS;
  const factor = Math.max(MIN_FACTOR, TARGET_LUMINANCE / luminance);
  // Inverse of brightnessFactor() below 50: factor = 1 - ((50 - level) / 50) * 0.55.
  return Math.round(50 - ((1 - factor) / 0.55) * 50);
}
