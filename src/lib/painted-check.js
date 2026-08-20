// Verifies that an icon actually puts pixels on screen.
//
// A blank tile is worse than a letter tile, and `onError` does not catch this case: an SVG that
// parses fine but paints nothing loads "successfully", so the image element reports no failure
// and the tile is simply empty. The service worker cannot check this itself — Chrome's
// createImageBitmap refuses SVG and a worker has no DOM to rasterise one with — but the page can,
// so the last word on visibility happens here, at the point of display.
const MIN_PAINTED_RATIO = 0.004; // ~1 pixel of a 16x16 sample
const SAMPLE = 16;

// Keyed by blob URL so a grid of tiles that share a source pays for one rasterisation, and a
// re-render never repeats the work.
const verdicts = new Map();

function measure(image) {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return true;
  context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
  let painted = 0;
  const { data } = context.getImageData(0, 0, SAMPLE, SAMPLE);
  for (let i = 3; i < data.length; i += 4) if (data[i] > 16) painted += 1;
  return painted / (SAMPLE * SAMPLE) > MIN_PAINTED_RATIO;
}

// Returns true when the loaded image paints something. Errs on the side of showing the icon:
// a canvas that cannot be read (tainted, or unavailable) is treated as fine, since discarding a
// real icon is the worse mistake.
export function isPainted(image, key) {
  if (!key) return true;
  if (verdicts.has(key)) return verdicts.get(key);
  let verdict = true;
  try {
    verdict = measure(image);
  } catch {
    verdict = true;
  }
  verdicts.set(key, verdict);
  return verdict;
}
