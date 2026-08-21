import test from "node:test";
import assert from "node:assert/strict";
import { findGradient, gradientCss, GRADIENTS, selectedImage, wallpaperFilterStyle } from "../src/lib/background-cache-keys.js";

test("every gradient swatch resolves back to renderable CSS", () => {
  for (const gradient of GRADIENTS) {
    const found = findGradient(gradient.key);
    assert.ok(found, `findGradient lost ${gradient.key}`);
    assert.match(gradientCss(found.colors), /^linear-gradient\(25deg, #[0-9a-fA-F]{6}, #[0-9a-fA-F]{6}\)$/);
  }
});

test("a gradient suppresses the photo selection", () => {
  const images = [{ startDate: "20260814" }];
  assert.equal(selectedImage({ gradientKey: "grad-sunset", images, selectedIndex: 0 }), null);
  assert.ok(selectedImage({ images, selectedIndex: 0 }));
});

test("brightness scales the picture instead of veiling it", () => {
  // A translucent overlay flattens contrast and mutes colour, which is why the veil version of
  // this control felt useless in both directions. These must stay CSS filters.
  // Blur is pinned off rather than left to its default: this test is about the brightness term,
  // and letting a non-zero default leak into the filter string made it fail for the wrong reason.
  const dark = wallpaperFilterStyle({ brightness: 0, blur: 0 });
  const neutral = wallpaperFilterStyle({ brightness: 50, blur: 0 });
  const bright = wallpaperFilterStyle({ brightness: 100, blur: 0 });
  assert.equal(neutral.filter, "brightness(1.000)");
  assert.equal(Number(dark.filter.match(/brightness\(([\d.]+)\)/)[1]) < 0.5, true);
  assert.equal(Number(bright.filter.match(/brightness\(([\d.]+)\)/)[1]) > 1.5, true);
  for (const style of [dark, neutral, bright]) assert.doesNotMatch(style.filter, /rgba/);
});

test("blur scales the layer so its soft edges fall outside the viewport", () => {
  assert.equal(wallpaperFilterStyle({ blur: 0 }).transform, "none");
  const blurred = wallpaperFilterStyle({ blur: 100 });
  assert.match(blurred.filter, /blur\(20px\)/);
  assert.equal(Number(blurred.transform.match(/scale\(([\d.]+)\)/)[1]) > 1, true);
});

test("gradient stops stay analogous so the backdrop recedes", () => {
  const hue = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return ((h * 60) + 360) % 360;
  };
  for (const { key, colors } of GRADIENTS) {
    const delta = Math.abs(hue(colors[0]) - hue(colors[1])) % 360;
    assert.ok(Math.min(delta, 360 - delta) <= 60, `${key} clashes across the colour wheel`);
  }
});

test("every gradient clears the mid-tone band the icon tiles occupy", async () => {
  const { GRADIENTS, gradientLuminance } = await import("../src/lib/background-cache-keys.js");
  // What makes an icon read as the foreground is a gap in lightness, not an absence of colour.
  // Draining saturation instead produced muddy greys that were dull AND still competing, so the
  // rule is about value: a backdrop must be clearly darker or clearly lighter, never level with
  // the tiles sitting on it.
  for (const { key, colors } of GRADIENTS) {
    const luma = gradientLuminance(colors);
    assert.ok(luma < 0.25 || luma > 0.45, `${key} sits in the same value band as the tiles (${luma.toFixed(2)})`);
  }
  const lumas = GRADIENTS.map((g) => gradientLuminance(g.colors));
  assert.ok(Math.min(...lumas) < 0.2, "no dark gradients offered");
  assert.ok(Math.max(...lumas) > 0.5, "no light gradients offered");
});
test("label ink follows the background, not just the slider", async () => {
  const { GRADIENTS, needsDarkInk, DEFAULT_BRIGHTNESS } = await import("../src/lib/background-cache-keys.js");
  const dark = GRADIENTS.find((g) => g.key === "grad-ocean").colors;
  const light = GRADIENTS.find((g) => g.key === "grad-mint").colors;
  // A pale gradient at default brightness must flip to dark ink, or every caption disappears.
  assert.equal(needsDarkInk({ brightness: DEFAULT_BRIGHTNESS, gradientColors: light }), true);
  assert.equal(needsDarkInk({ brightness: DEFAULT_BRIGHTNESS, gradientColors: dark }), false);
  // Photos have no known luminance, so there the slider stays the only signal.
  assert.equal(needsDarkInk({ brightness: DEFAULT_BRIGHTNESS }), false);
  assert.equal(needsDarkInk({ brightness: 90 }), true);
});

test("photo tone matching targets the same value band as the gradients", async () => {
  const { autoBrightnessFor } = await import("../src/lib/wallpaper-tone.js");
  const { DEFAULT_BRIGHTNESS, brightnessFactor, needsDarkInk } = await import("../src/lib/background-cache-keys.js");

  // An already-dark photo is left alone: it is where we want it.
  assert.equal(autoBrightnessFor(0.12), DEFAULT_BRIGHTNESS);
  assert.equal(autoBrightnessFor(null), DEFAULT_BRIGHTNESS);

  // A bright photo is brought down, and the resulting factor really lands near the target.
  // A mid-bright photo is brought right onto the target.
  const mid = autoBrightnessFor(0.30);
  assert.ok(mid < DEFAULT_BRIGHTNESS, "a bright photo was not toned down");
  assert.ok(Math.abs(0.30 * brightnessFactor(mid) - 0.22) < 0.02, "toned photo missed the target band");

  // A very bright photo stops at the floor rather than being crushed to black — so it stays a
  // photograph, and the ink decision (which sees the measured luminance) takes over from there.
  const glaring = autoBrightnessFor(0.95);
  assert.ok(brightnessFactor(glaring) >= 0.5, "photo was crushed below the floor");
  assert.equal(needsDarkInk({ brightness: glaring, luminance: 0.95 }), true,
    "a still-bright photo must flip captions to dark ink");
});
