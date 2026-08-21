import test from "node:test";
import assert from "node:assert/strict";
import { surfaceForMark } from "../src/lib/tile-surface.js";

// Builds an RGBA buffer: `colors` are painted over a transparent field, which is what a bare
// logo mark on transparency actually looks like to getImageData.
function mark(colors, { transparentPixels = 40 } = {}) {
  const out = [];
  for (const [r, g, b, count = 20] of colors) {
    for (let i = 0; i < count; i += 1) out.push(r, g, b, 255);
  }
  for (let i = 0; i < transparentPixels; i += 1) out.push(0, 0, 0, 0);
  return new Uint8ClampedArray(out);
}

const parse = (css) => {
  const m = /^hsl\((\d+) (\d+)% (\d+)%\)$/.exec(css);
  assert.ok(m, `expected an hsl() colour, got ${css}`);
  return { hue: Number(m[1]), saturation: Number(m[2]), lightness: Number(m[3]) };
};

test("a dark coloured mark gets a pale bed of its own hue", () => {
  // Spotify green, dark enough to sit on a light surface.
  const surface = parse(surfaceForMark(mark([[29, 185, 84]])));
  assert.ok(surface.hue > 100 && surface.hue < 160, `expected a green hue, got ${surface.hue}`);
  assert.equal(surface.lightness, 94);
});

test("a pale mark gets a saturated bed of its hue, not a pale one", () => {
  // A near-white logo with a faint tint — the case that makes "just use a light card" fail.
  // The answer is the commonest app icon there is: a pale glyph on brand colour.
  const surface = parse(surfaceForMark(mark([[236, 244, 255], [210, 228, 255]])));
  assert.equal(surface.lightness, 44, "a pale mark must not be dropped onto a pale surface");
  assert.ok(surface.saturation > 40, `expected a vivid bed, got ${surface.saturation}%`);
});

test("a plain white mark still gets a bed even with no hue to derive one from", () => {
  // The failure this exists to stop: a white wordmark on transparency, no chroma anywhere, would
  // otherwise fall through to the neutral card and render white on white.
  const surface = surfaceForMark(mark([[255, 255, 255], [248, 248, 248]]));
  assert.ok(surface, "a white mark was left with no surface at all");
  assert.ok(parse(surface).lightness < 50, `expected a dark bed, got ${surface}`);
});

test("a dark grey mark keeps the neutral surface rather than being given an invented hue", () => {
  // GitHub's octocat, Medium's wordmark: black on transparency, no brand hue to borrow — and no
  // legibility problem either, so the neutral card is correct.
  assert.equal(surfaceForMark(mark([[24, 23, 23], [0, 0, 0]])), null);
  assert.equal(surfaceForMark(mark([[128, 128, 128]])), null);
});

test("nothing opaque means nothing to derive", () => {
  assert.equal(surfaceForMark(new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 0])), null);
  assert.equal(surfaceForMark(new Uint8ClampedArray([])), null);
});

test("a multi-coloured logo keeps the neutral surface instead of being blended", () => {
  // Red + cyan in equal measure. Averaging hues on a circle would answer magenta, a colour in the
  // logo nowhere; the dominant-band test correctly answers "there is no one brand hue here".
  assert.equal(surfaceForMark(mark([[255, 0, 0, 20], [0, 255, 255, 20]])), null);
  // Google's four: no single hue clears the bar either.
  assert.equal(surfaceForMark(mark([[66, 133, 244, 20], [219, 68, 55, 20], [244, 180, 0, 20], [15, 157, 88, 20]])), null);
});

test("a vivid accent outvotes a large washed-out area of the same family", () => {
  // A big pale-orange field with a small vivid orange mark: chroma weighting keeps the vivid hue
  // rather than letting the washed-out majority drag it toward grey.
  const surface = parse(surfaceForMark(mark([[235, 215, 200, 200], [230, 110, 20, 40]])));
  assert.ok(surface.hue > 10 && surface.hue < 45, `expected an orange hue, got ${surface.hue}`);
});

test("saturation stays muted so a full grid reads as one set", () => {
  const surface = parse(surfaceForMark(mark([[255, 0, 0]])));
  assert.ok(surface.saturation <= 30, `too saturated: ${surface.saturation}`);
  assert.ok(surface.saturation >= 12, `too washed out: ${surface.saturation}`);
});
