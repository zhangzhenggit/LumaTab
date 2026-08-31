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

const hue = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
};
const hueGap = (a, b) => {
  const delta = Math.abs(hue(a) - hue(b)) % 360;
  return Math.min(delta, 360 - delta);
};

test("gradient stops stay analogous so the backdrop recedes", () => {
  for (const { key, colors } of GRADIENTS) {
    assert.ok(hueGap(colors[0], colors[1]) <= 60, `${key} clashes across the colour wheel`);
  }
});

// The aurora blobs are derived, not authored, precisely so the two rules that keep a backdrop
// recessive cannot be broken by hand-picking thirty-six new colours. This is the test that makes
// "by construction" mean something.
test("aurora blobs stay inside the gradient's own hue family", async () => {
  const { auroraBlobs } = await import("../src/lib/background-cache-keys.js");
  for (const { key, colors } of GRADIENTS) {
    const blobs = auroraBlobs(colors);
    assert.equal(blobs.length, 3, `${key} did not produce three blobs`);
    for (const blob of blobs) {
      assert.match(blob, /^#[0-9a-f]{6}$/, `${key} produced an unrenderable blob colour`);
      // Measured against the nearer stop: the recipes rotate ±22° off one stop or the other, and
      // the stops themselves are already within 60° of each other.
      const gap = Math.min(hueGap(blob, colors[0]), hueGap(blob, colors[1]));
      assert.ok(gap <= 60, `${key} threw a blob ${gap.toFixed(0)}° out of its own family`);
    }
  }
});

// Blobs are lighter than the ramp on purpose — that is what gives the surface volume — but a
// solid background exists to sit clear of the tiles, and three pale blobs could quietly drag it
// back into the band the tiles occupy. This is what forced the amber ramp deeper.
test("aurora blobs lighten the surface without pushing it into the tiles' band", async () => {
  const { auroraBlobs, gradientLuminance } = await import("../src/lib/background-cache-keys.js");
  for (const { key, colors } of GRADIENTS) {
    const base = gradientLuminance(colors);
    // The blobs sit at 50% opacity, so the worst case a viewer sees is roughly this.
    const lit = base + (gradientLuminance(auroraBlobs(colors)) - base) * 0.5;
    assert.ok(lit > base, `${key} blobs darken the ramp instead of lifting it`);
    assert.ok(lit < 0.25 || lit > 0.45, `${key} drifts into the tiles' value band once lit (${lit.toFixed(2)})`);
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

// White captions are destroyed by highlights, not by averages, and only by the highlights in the
// rows they actually occupy. Both halves of that sentence are load-bearing, and each is pinned by
// one of the two wallpapers below — reconstructed from real Bing images that the mean got wrong.
test("caption legibility is judged where the captions are, not across the whole photo", async () => {
  const { toneFromPixels } = await import("../src/lib/wallpaper-tone.js");
  const { brightnessFactor, needsDarkInk, DEFAULT_BRIGHTNESS } = await import("../src/lib/background-cache-keys.js");

  const W = 64, H = 40;
  // rows() paints each scanline the grey its callback returns.
  const rows = (grey) => {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = grey(y / H);
        data[i + 3] = 255;
      }
    }
    return data;
  };
  const inBand = (t) => t >= 0.35 && t <= 0.80;

  // Palmanova: dark almost everywhere, bright across the middle where the tiles sit. Its mean was
  // 0.209 — solidly "dark" — so the page kept white ink over a background measuring 0.427 there.
  const brightMiddle = toneFromPixels(rows((t) => (inBand(t) ? 180 : 40)), W, H);
  assert.ok(brightMiddle.mean < 0.30, "the frame really is dark on average");
  assert.ok(brightMiddle.captionBand > 0.42, "the caption rows really are bright");
  assert.equal(needsDarkInk({ brightness: DEFAULT_BRIGHTNESS, luminance: brightMiddle.mean }), false,
    "this is the old behaviour the fix exists to replace");
  assert.equal(needsDarkInk({ brightness: DEFAULT_BRIGHTNESS, luminance: brightMiddle.captionBand }), true,
    "captions over a bright band must flip to dark ink");

  // Jiangyin: a blazing sky above a dark grid. A whole-image 85th percentile would have flipped
  // this one to dark ink and made every caption vanish — which is why the percentile is taken
  // inside the band rather than over the frame.
  const brightSky = toneFromPixels(rows((t) => (t < 0.35 ? 230 : 40)), W, H);
  assert.ok(brightSky.captionBand < 0.10, "the grid rows are dark, whatever the sky is doing");
  assert.equal(needsDarkInk({ brightness: DEFAULT_BRIGHTNESS, luminance: brightSky.captionBand }), false,
    "a bright sky must not drag the captions to dark ink");

  // Exposure is a separate question and still answered by the whole frame, so the two wallpapers
  // above — very different where the captions are — are treated alike by auto-brightness.
  assert.ok(Math.abs(brightMiddle.mean - brightSky.mean) < 0.09, "means are comparable");
  assert.ok(brightnessFactor(DEFAULT_BRIGHTNESS) > 1, "the default still lifts, not dims");
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

// --- backdrop scoring ---------------------------------------------------------------------
//
// The measurement itself, checked against shapes whose answer is known by construction, and the
// selection rule, checked against the archive that prompted it — the week of 2026-08-23 to 08-30,
// whose newest image was a tiled mosaic ceiling. Those figures are real: they came from scoring
// the eight previews Bing was serving that day at the sample size wallpaper-score.js pins.

function field(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return data;
}

test("busy-ness is measured as texture, not as contrast", async () => {
  const { scoreFromPixels, SCORE_W, SCORE_H } = await import("../src/lib/wallpaper-score.js");
  const score = (paint) => scoreFromPixels(field(SCORE_W, SCORE_H, paint), SCORE_W, SCORE_H);

  // A one-pixel checkerboard is the busiest image that fits in this sample, and it sits exactly
  // at Nyquist — which is where a central-difference operator scores it at zero, because the two
  // pixels it compares are always the same one. That is not hypothetical; it is what the first
  // version of this did, and only a synthetic shape could have caught it, because a resampled
  // photograph never has energy exactly there.
  const checker = score((x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0]));
  // The ramp spans exactly as much luminance as the checkerboard, so it separates the two things
  // that get confused here: this metric must measure texture, not contrast, and every good
  // photograph has plenty of the latter.
  const ramp = score((x) => { const v = (x / SCORE_W) * 255; return [v, v, v]; });
  assert.ok(checker.detail > ramp.detail * 50,
    `pattern ${checker.detail.toFixed(1)} did not separate from ramp ${ramp.detail.toFixed(1)}`);

  // Colour is judged independently of texture: two flat fields, no gradient anywhere in either.
  const grey = score(() => [128, 128, 128]);
  const garish = score((x) => (x % 32 < 16 ? [255, 40, 0] : [0, 60, 255]));
  assert.ok(grey.colour < 2, `flat grey scored ${grey.colour.toFixed(1)} for colourfulness`);
  assert.ok(garish.colour > 60, `saturated field scored only ${garish.colour.toFixed(1)}`);
});

test("the archive picks around a wall of pattern instead of showing it", async () => {
  const { pickBackdrop } = await import("../src/lib/wallpaper-score.js");
  // Newest first. 0 is the Samarkand mosaic ceiling, 1 a very saturated shark, 6 a redwood
  // canopy; everything else is an ordinary landscape.
  const week = [
    { detail: 115.4, colour: 77.0 },
    { detail: 35.7, colour: 117.7 },
    { detail: 38.0, colour: 63.7 },
    { detail: 37.4, colour: 47.6 },
    { detail: 42.7, colour: 61.9 },
    { detail: 35.5, colour: 52.4 },
    { detail: 98.7, colour: 43.2 },
    { detail: 54.3, colour: 48.7 },
  ];
  assert.equal(pickBackdrop(week), 2,
    "the ceiling (too busy) and the shark (too saturated) should both have been passed over");

  // The bridge at 54.3 is 1.35x the median — busy for a photograph and perfectly fine as one.
  // Rejecting it would mean the rule is a taste filter rather than an outlier filter.
  const ordinary = week.slice(2);
  assert.equal(pickBackdrop(ordinary), 0, "an ordinary week must keep Bing's own newest image");

  // A dropped preview must not silently move the wallpaper: with no measurement there is no
  // evidence against the image, so it stays selected.
  assert.equal(pickBackdrop([null, ...week.slice(1)]), 0, "an unmeasured image was skipped");
  // And too few measurements to know what typical looks like means nothing is second-guessed.
  assert.equal(pickBackdrop([{ detail: 115.4, colour: 77 }, null, null]), 0,
    "a sample too small to have a median must not reject anything");
});

test("the drift's turn has no velocity step, and its middle is not dead", async () => {
  const { feather } = await import("../src/hooks/useWallpaperDrift.js");
  assert.equal(feather(0), 0);
  assert.ok(Math.abs(feather(1) - 1) < 1e-9, "a traverse must cover exactly one unit of travel");

  const step = 0.002;
  let previous = 0;
  const speeds = [];
  for (let t = step; t <= 1 + 1e-9; t += step) {
    const value = feather(t);
    assert.ok(value >= previous - 1e-9, `feather went backwards at ${t.toFixed(3)}`);
    speeds.push((value - previous) / step);
    previous = value;
  }
  // The whole point of the profile: the reversal at each end happens at a standstill, so there is
  // no direction change to see, and yet the middle still moves faster than a plain linear pan.
  assert.ok(speeds[0] < 0.1, `the traverse starts at speed ${speeds[0].toFixed(2)} — that is the jolt`);
  assert.ok(speeds[speeds.length - 1] < 0.1, "the traverse ends at speed, so it reverses abruptly");
  assert.ok(speeds[Math.floor(speeds.length / 2)] > 1,
    "an eased traverse that never exceeds the linear rate is just a slower pan");
});
