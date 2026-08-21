// Picks the bed a bare logo mark sits on. There are exactly two, and neither has a hue.
//
// An earlier revision derived a brand-tinted bed from the mark's own pixels. It worked on
// well-drawn public logos and looked bad on everything else, which on a real grid is most tiles.
// It was also the wrong target: macOS app icons are drawn by hand, so no algorithm reaches them
// from a favicon, and Apple's own answer for a *website* is much plainer — Safari puts site icons
// on a light neutral card. That is what this does.
//
// The one thing a single light card cannot survive is a mark that disappears into it, so there is
// a second, darker neutral for exactly that case — and deciding when to use it is the whole job.

// The white card, as relative luminance. Contrast is measured against this.
const CARD_LUMINANCE = 1;
// Below this contrast ratio a mark is not reliably separable from the card. Deliberately far
// below any WCAG text threshold: a large solid shape needs nothing like the 4.5:1 body text asks
// for, and every step up sends ordinary coloured icons to the dark bed — the failure that started
// this. Calibrated against real artwork at the two ends: a saturated yellow (1.54) stays on the
// card, a near-white wordmark (1.12) does not. The cost of being too eager here is visible on
// every tile; the cost of being too lax is one icon that is merely low-contrast.
const MIN_CARD_CONTRAST = 1.5;
// Not pure grey: a hint of blue keeps it in the same family as the rest of the surface palette.
const DARK_NEUTRAL = "hsl(220 6% 34%)";
const MIN_ALPHA = 24;

function toLinear(value) {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

// `pixels` is RGBA as returned by getImageData. Returns a CSS colour for a mark that needs the
// darker bed, or null to keep the default light card.
//
// Luminance, not HSL lightness. Lightness treats "pale" and "saturated but bright" as the same
// thing, and they are not: a salmon-and-green icon scores 0.8 lightness and reads perfectly on
// white, while a near-white wordmark scores about the same and vanishes. Contrast against the
// card is the question actually being asked, so it is the one measured.
export function surfaceForMark(pixels, { minAlpha = MIN_ALPHA } = {}) {
  let opaque = 0;
  let luminanceTotal = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] <= minAlpha) continue;
    opaque += 1;
    luminanceTotal += 0.2126 * toLinear(pixels[i])
      + 0.7152 * toLinear(pixels[i + 1])
      + 0.0722 * toLinear(pixels[i + 2]);
  }

  if (!opaque) return null;
  const contrast = (CARD_LUMINANCE + 0.05) / (luminanceTotal / opaque + 0.05);
  return contrast < MIN_CARD_CONTRAST ? DARK_NEUTRAL : null;
}
