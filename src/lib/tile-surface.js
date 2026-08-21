// Derives the surface a bare logo mark should sit on, so a grid of transparent marks reads like
// a home screen of coloured app icons instead of a sheet of identical white cards.
//
// The tempting shortcut is to take the mark's dominant colour and use it as the background. Every
// dominant-colour library (MMCQ in color-thief, the swatch buckets in node-vibrant) reports what
// is *in* the image, not what goes *with* it — so GitHub's black octocat yields black and the
// mark disappears into its own background. The colour here is used for its **hue only**;
// lightness and saturation are re-derived to land far from the mark, which is what keeps the mark
// visible on artwork nobody has looked at.
//
// Hue is taken as the dominant *band* of a chroma-weighted histogram, not as an average. Averaging
// hues on a circle still blends distant ones — red and cyan average to magenta, which is in the
// logo nowhere. A histogram instead asks "is there one clear brand hue here?", and a multi-colour
// logo (Google, Slack, Figma) correctly fails that question and keeps the neutral card.

// 0-255. Below this a pixel is effectively grey and carries no usable hue.
const MIN_CHROMA = 28;
// A logo that is almost entirely grey (GitHub, Medium, most wordmarks) has no brand hue to
// borrow. Inventing one is worse than the neutral surface.
const MIN_HUED_SHARE = 0.08;
// 15° per bucket: fine enough to separate brand hues, coarse enough that anti-aliasing along a
// logo's edges does not smear one hue across several buckets.
const HUE_BUCKETS = 24;
// The winning bucket plus its two neighbours must hold this much of the chroma weight before the
// hue counts as "the" brand hue. Below it the artwork is multi-coloured and gets the neutral card.
const DOMINANT_SHARE = 0.55;
// Where the mark's own lightness stops counting as "dark artwork needing a light bed".
const PALE_MARK_CUTOFF = 0.62;
// A dark mark gets a pale bed of its own hue: muted enough that a wall of them still reads as one
// set rather than as a paint chart.
const LIGHT_SURFACE = { saturation: 30, lightness: 94 };
// A pale mark gets the opposite treatment — a saturated mid-tone of its hue, which is the most
// common app icon there is (a white glyph on brand colour: Netflix, Trello, YouTube). An almost
// black bed would also be legible but reads as "broken artwork" rather than as an icon.
const VIVID_SURFACE = { saturation: 62, lightness: 44 };
// A pale mark with no hue at all — a plain white wordmark — still cannot sit on a white card.
// This is the one case where a surface must be invented rather than derived.
const NEUTRAL_DARK = "hsl(220 8% 32%)";

function hueSat(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const lightness = (max + min) / 2 / 255;
  if (!chroma) return { hue: 0, saturation: 0, lightness, chroma };
  const saturation = chroma / 255 / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === r) hue = ((g - b) / chroma) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  hue *= 60;
  return { hue: hue < 0 ? hue + 360 : hue, saturation: Math.min(1, saturation) * 100, lightness, chroma };
}

// `pixels` is RGBA as returned by getImageData. Returns a CSS colour, or null when the artwork
// offers no single hue worth using — callers must treat null as "keep the neutral surface".
export function surfaceForMark(pixels, { minAlpha = 24 } = {}) {
  const buckets = new Array(HUE_BUCKETS).fill(0);
  const hueSum = new Array(HUE_BUCKETS).fill(0);
  const satSum = new Array(HUE_BUCKETS).fill(0);
  let opaque = 0;
  let hued = 0;
  let lightnessTotal = 0;
  let chromaTotal = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] <= minAlpha) continue;
    const { hue, saturation, lightness, chroma } = hueSat(pixels[i], pixels[i + 1], pixels[i + 2]);
    opaque += 1;
    lightnessTotal += lightness;
    if (chroma < MIN_CHROMA) continue;
    hued += 1;
    // Weighting by chroma is what lets a small vivid accent outvote a large washed-out field.
    chromaTotal += chroma;
    const bucket = Math.min(HUE_BUCKETS - 1, Math.floor((hue / 360) * HUE_BUCKETS));
    buckets[bucket] += chroma;
    hueSum[bucket] += hue * chroma;
    satSum[bucket] += saturation * chroma;
  }

  if (!opaque) return null;
  const markLightness = lightnessTotal / opaque;
  // A pale mark can never keep the neutral card — it would be white on white. Every branch below
  // that answers null has to be overridden for one, which is why this is computed first.
  const pale = markLightness > PALE_MARK_CUTOFF;
  const neutral = () => (pale ? NEUTRAL_DARK : null);

  if (!chromaTotal || hued / opaque < MIN_HUED_SHARE) return neutral();

  let winner = 0;
  for (let i = 1; i < HUE_BUCKETS; i += 1) if (buckets[i] > buckets[winner]) winner = i;

  // Neighbours are folded in because a single hue lands either side of a bucket edge as often as
  // it lands in the middle of one.
  const band = [(winner - 1 + HUE_BUCKETS) % HUE_BUCKETS, winner, (winner + 1) % HUE_BUCKETS];
  const bandWeight = band.reduce((sum, b) => sum + buckets[b], 0);
  if (bandWeight / chromaTotal < DOMINANT_SHARE) return neutral();

  const hue = Math.round(band.reduce((sum, b) => sum + hueSum[b], 0) / bandWeight) % 360;
  const markSaturation = band.reduce((sum, b) => sum + satSum[b], 0) / bandWeight;

  const target = pale ? VIVID_SURFACE : LIGHT_SURFACE;
  const saturation = Math.round(Math.min(target.saturation, Math.max(12, markSaturation * (pale ? 1.1 : 0.55))));
  return `hsl(${hue} ${saturation}% ${target.lightness}%)`;
}
