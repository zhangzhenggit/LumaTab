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

const LIGHT_CARD = null;
const DARK_BED = "hsl(220 6% 34%)";

test("dark artwork keeps the light card, whatever colour it is", () => {
  // Deliberately loud: an earlier revision derived a bed from these and the grid became a
  // patchwork. Hue must not influence this decision at all.
  assert.equal(surfaceForMark(mark([[29, 185, 84]])), LIGHT_CARD, "Spotify green");
  assert.equal(surfaceForMark(mark([[220, 20, 20]])), LIGHT_CARD, "a vivid red");
  assert.equal(surfaceForMark(mark([[24, 23, 23]])), LIGHT_CARD, "near-black");
});

// The case this test exists for: an icon of pale-but-saturated shapes — salmon over mint — that
// reads perfectly on white. Judging by HSL lightness called it "pale" (0.8) and dropped it onto
// the dark bed, turning a row of ordinary tiles slate grey. Luminance contrast keeps it on white.
test("bright saturated colour is not the same as pale, and keeps the card", () => {
  assert.equal(surfaceForMark(mark([[247, 168, 168], [122, 214, 120]])), LIGHT_CARD);
  assert.equal(surfaceForMark(mark([[255, 200, 60]])), LIGHT_CARD, "a yellow that is bright but vivid");
  assert.equal(surfaceForMark(mark([[120, 200, 255]])), LIGHT_CARD, "a light sky blue");
});

test("a mark that would vanish into the card gets the darker bed", () => {
  assert.equal(surfaceForMark(mark([[255, 255, 255]])), DARK_BED, "a white wordmark");
  assert.equal(surfaceForMark(mark([[242, 242, 242], [250, 250, 250]])), DARK_BED, "near-white");
  assert.equal(surfaceForMark(mark([[236, 244, 255]])), DARK_BED, "white with the faintest tint");
});

test("transparency is ignored when judging separability", () => {
  // A small white glyph on a large transparent field still needs the dark bed; counting empty
  // pixels as black would drag the average down and leave it on white.
  assert.equal(surfaceForMark(mark([[250, 250, 250, 6]], { transparentPixels: 400 })), DARK_BED);
});

test("nothing opaque means nothing to decide", () => {
  assert.equal(surfaceForMark(new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 0])), LIGHT_CARD);
  assert.equal(surfaceForMark(new Uint8ClampedArray([])), LIGHT_CARD);
});
