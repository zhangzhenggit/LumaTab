// Which of the archive's photographs is actually usable as a backdrop.
//
// Bing picks its daily image to be interesting, which is not the same thing as being good to put
// behind a grid of icons. Most days the two agree. Some days they do not: an architectural detail
// shot of a tiled ceiling, a redwood canopy — frames that are edge-to-edge high-frequency
// pattern. Behind icons those read as noise, and the page's own bottom-edge blur makes it worse,
// because crossfading a blurred copy of a repeating pattern over the sharp one is precisely where
// that technique shows its seams.
//
// Two numbers separate them, and both were calibrated against a real week of the archive:
//
//   detail — mean luminance gradient; busy-ness, essentially. Measured across one week: a mosaic
//            ceiling at 115, a redwood canopy at 99, and everything else between 36 and 54.
//   colour — Hasler & Susstrunk colourfulness. Catches the frames that are calm but garish,
//            which detail on its own scores as unremarkable.
//
// Both are judged against the archive's own median rather than a fixed threshold, so the rule is
// "unlike its neighbours" rather than "above a number someone picked". That matters in the case
// where it would otherwise do harm: a week of genuinely busy photographs still has to end with
// something on screen, and comparing against the median guarantees it does.
//
// Nothing here is a setting. The archive is eight days deep and the extension already downloads
// all of it, so choosing well among what is already on disk costs one small preview per image and
// asks the user nothing.

// The sample size is part of the calibration, not a performance knob. Detail is a high-frequency
// measurement and downsampling destroys the thing being measured. Reusing wallpaper-tone.js's
// 64x40 luminance grid would have been free and is not good enough: there the mosaic ceiling
// scores 1.66x its archive's median — barely over the line below, and second behind a photograph
// that is merely leafy. At 192x108 the same frame is 2.86x and correctly first. Changing these
// invalidates BUSY_RATIO.
export const SCORE_W = 192;
export const SCORE_H = 108;

// How far past the archive's median a frame must sit to be passed over. 1.6 leaves a
// busy-but-perfectly-good photograph in — a bridge at 54 against a median of 40 is 1.35x — while
// excluding the two that are pattern rather than subject, at 2.86x and 2.45x. The gap between
// 1.35 and 2.45 is wide enough that the exact number here is not load-bearing.
const BUSY_RATIO = 1.6;

// Below this there is no meaningful "typical" to compare against, so nothing is second-guessed.
const MIN_SAMPLE = 3;

// `data` is RGBA as getImageData returns it. Luma is computed in gamma space on purpose: this is
// a texture measurement, not a photometric one, and the calibration numbers above were taken
// this way. (wallpaper-tone.js linearises, because it is answering a contrast question.)
export function scoreFromPixels(data, width, height) {
  const luma = new Float32Array(width * height);
  let rgSum = 0;
  let ybSum = 0;
  let rgSquares = 0;
  let ybSquares = 0;

  for (let pixel = 0, i = 0; pixel < luma.length; pixel++, i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    luma[pixel] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    // Hasler & Susstrunk's opponent axes: red-green, and yellow-blue.
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    rgSum += rg;
    ybSum += yb;
    rgSquares += rg * rg;
    ybSquares += yb * yb;
  }

  const count = luma.length || 1;
  const rgMean = rgSum / count;
  const ybMean = ybSum / count;
  const rgDeviation = Math.sqrt(Math.max(0, rgSquares / count - rgMean * rgMean));
  const ybDeviation = Math.sqrt(Math.max(0, ybSquares / count - ybMean * ybMean));

  // Forward differences, and not by default. A Sobel smooths, which is the opposite of useful
  // when fine texture is the signal. Central differences look like the neutral choice and are
  // worse than either: they compare x-1 against x+1 and so are exactly blind at the Nyquist
  // frequency — a one-pixel checkerboard, the busiest image that can exist at this sample size,
  // scores zero. Real photographs are low-passed by the resampler on the way in and never sit
  // exactly there, so the flaw stays hidden in every measurement taken from one; a synthetic
  // test found it immediately. Forward differences peak where central differences vanish, and
  // they separate the real archive better too (2.86x against 2.49x for the same frame).
  let gradient = 0;
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x;
      gradient += Math.hypot(luma[i + 1] - luma[i], luma[i + width] - luma[i]);
    }
  }
  const interior = Math.max(1, (width - 1) * (height - 1));

  return {
    // Scaled by 1000 so the figures quoted above are the figures this returns.
    detail: (gradient / interior) * 1000,
    colour: Math.hypot(rgDeviation, ybDeviation) + 0.3 * Math.hypot(rgMean, ybMean),
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Index of the picture to show. `scores` runs parallel to the archive, newest first; a null entry
// is one that could not be measured.
export function pickBackdrop(scores) {
  const measured = scores.filter(Boolean);
  if (measured.length < MIN_SAMPLE) return 0;

  const detailLimit = median(measured.map((score) => score.detail)) * BUSY_RATIO;
  const colourLimit = median(measured.map((score) => score.colour)) * BUSY_RATIO;
  // Newest first, so this reads as "today's picture, unless today's is the odd one out, in which
  // case the most recent day that is not". An image that could not be measured counts as
  // acceptable: there is no evidence against it, and skipping it would mean a dropped request
  // quietly changed the wallpaper.
  const choice = scores.findIndex((score) => (
    !score || (score.detail <= detailLimit && score.colour <= colourLimit)
  ));
  // Reachable only if the frame sitting at the detail median is itself a colour outlier. Bing's
  // own choice is the right thing to fall back to.
  return choice === -1 ? 0 : choice;
}
