// Picks the bed a bare logo mark sits on. There are exactly two, and neither has a hue.
//
// An earlier revision derived a brand-tinted bed from the mark's own pixels — dominant hue via a
// chroma-weighted histogram, lightness and saturation re-derived so the mark could not vanish
// into it. It worked on well-drawn public logos and looked bad on everything else, which on a
// real grid is most tiles: a wall of intranet tools with hurried icons came out as a patchwork of
// clashing greens, reds and blues that read worse than the plain cards it replaced.
//
// It also turned out to be the wrong target. macOS app icons are drawn by hand, not generated,
// so there is no algorithm that reaches them from a favicon. Apple's own answer for a *website*
// is much plainer: Safari puts site icons on a light neutral card. That is what this does.
//
// The one thing a single card cannot survive is a pale mark — a white wordmark on transparency
// would be white on white — so there is a second, darker neutral for exactly that case.

// Mean lightness above which a mark can no longer sit on the light card.
const PALE_MARK_CUTOFF = 0.62;
// Not pure grey: a hint of blue keeps it in the same family as the rest of the surface palette.
const DARK_NEUTRAL = "hsl(220 6% 34%)";
const MIN_ALPHA = 24;

// `pixels` is RGBA as returned by getImageData. Returns a CSS colour for a mark that needs the
// darker bed, or null to keep the default light card.
export function surfaceForMark(pixels, { minAlpha = MIN_ALPHA } = {}) {
  let opaque = 0;
  let lightnessTotal = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] <= minAlpha) continue;
    const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    const min = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
    opaque += 1;
    lightnessTotal += (max + min) / 2 / 255;
  }

  if (!opaque) return null;
  return lightnessTotal / opaque > PALE_MARK_CUTOFF ? DARK_NEUTRAL : null;
}
