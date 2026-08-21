import test from "node:test";
import assert from "node:assert/strict";
import { surfaceForMark } from "../src/lib/tile-surface.js";

// Builds an RGBA buffer: `colors` painted over a transparent field, which is what a bare logo
// mark on transparency actually looks like to getImageData.
function mark(colors, { transparentPixels = 40 } = {}) {
  const out = [];
  for (const [r, g, b, count = 20] of colors) {
    for (let i = 0; i < count; i += 1) out.push(r, g, b, 255);
  }
  for (let i = 0; i < transparentPixels; i += 1) out.push(0, 0, 0, 0);
  return new Uint8ClampedArray(out);
}

test("dark artwork keeps the light card, whatever colour it is", () => {
  // The colours here are deliberately loud: an earlier revision derived a bed from them and the
  // grid turned into a patchwork. Hue must not influence this decision at all.
  assert.equal(surfaceForMark(mark([[29, 185, 84]])), null, "Spotify green");
  assert.equal(surfaceForMark(mark([[220, 20, 20]])), null, "a vivid red");
  assert.equal(surfaceForMark(mark([[24, 23, 23]])), null, "near-black");
  assert.equal(surfaceForMark(mark([[66, 133, 244], [219, 68, 55], [244, 180, 0]])), null, "multi-colour");
});

test("a pale mark gets the darker bed instead of vanishing", () => {
  // The one case a single card cannot survive: white-on-white.
  assert.equal(surfaceForMark(mark([[255, 255, 255]])), "hsl(220 6% 34%)");
  assert.equal(surfaceForMark(mark([[236, 244, 255], [210, 228, 255]])), "hsl(220 6% 34%)");
});

test("transparency is ignored when judging how pale the mark is", () => {
  // A small white glyph on a large transparent field is still a pale mark; counting the empty
  // pixels as black would drag the average down and drop it onto the light card.
  const glyph = mark([[250, 250, 250, 6]], { transparentPixels: 400 });
  assert.equal(surfaceForMark(glyph), "hsl(220 6% 34%)");
});

test("nothing opaque means nothing to decide", () => {
  assert.equal(surfaceForMark(new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 0])), null);
  assert.equal(surfaceForMark(new Uint8ClampedArray([])), null);
});
