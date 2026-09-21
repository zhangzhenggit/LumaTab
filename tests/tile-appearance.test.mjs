import test from "node:test";
import assert from "node:assert/strict";
import { iconAppearance, PREVIEW_CSS_PX, TILE_CSS_PX } from "../src/lib/tile-appearance.js";

const link = (extra) => ({ id: "a", type: "link", name: "GitHub", url: "https://github.com/", iconMode: "auto", ...extra });

// The whole point of the grid reading as one set of app icons: whether a tile gets a surface is
// decided by the artwork, never by how many pixels the artwork happens to have. Branching on
// resolution is what left high-resolution transparent logos bare on the wallpaper while 16px
// favicons beside them sat on white cards.
test("a surface is decided by the artwork's own background, not by its resolution", () => {
  const bare4k = link({ _iconUrl: "blob:x", _iconFullBleed: false, _iconNativeSize: 512 });
  const bareTiny = link({ _iconUrl: "blob:x", _iconFullBleed: false, _iconNativeSize: 16 });
  assert.equal(iconAppearance(bare4k).kind, "inset", "a big transparent mark still needs a surface");
  assert.equal(iconAppearance(bareTiny).kind, "inset", "a small one is still shown, never dropped for a letter");
});

// The size, unlike the surface, does follow the source — and it did not used to. One constant
// 62% share drew the 16px favicon most intranet sites serve at 2.3x, and on a 1.5x display 3.5x,
// which is mush; four such tiles in one row were the worst thing on the page.
test("a small source is drawn smaller rather than blown up", () => {
  const at = (nativeSize) => iconAppearance(link({ _iconUrl: "blob:x", _iconFullBleed: false, _iconNativeSize: nativeSize })).insetSize;
  const ceiling = at(512);
  assert.ok(at(16) < ceiling, "a 16px favicon must not be drawn at the same size as 512px art");
  assert.ok(at(16) <= 16 * 2, "nothing is magnified past 2x");
  // A vector has no native size and scales to anything, so it always gets the ceiling.
  assert.equal(at(0), ceiling);
  assert.equal(at(96), ceiling, "a source big enough for the tile lands on the one constant size");
});

// The other half of the rule, and the reason it is a floor on the *surface* and not on the
// source's own pixel count: sizing by pixel count leaves a 16px favicon as a lonely dot in a
// 60px card, which is a different way of looking broken.
test("a tiny source still fills enough of the tile to read as an icon", () => {
  const tiny = iconAppearance(link({ _iconUrl: "blob:x", _iconFullBleed: false, _iconNativeSize: 8 })).insetSize;
  assert.ok(tiny >= TILE_CSS_PX * 0.49, `an 8px source shrank to ${tiny}px, which is a dot`);
});

test("artwork that paints its own background becomes the tile", () => {
  const filled = link({ _iconUrl: "blob:x", _iconFullBleed: true, _iconNativeSize: 64 });
  assert.equal(iconAppearance(filled).kind, "artwork");
  // Painting a sampled colour behind it would only leave a seam where the shades disagree.
  assert.equal(iconAppearance(filled).accent, null);
});

test("the inset share scales with the surface it is drawn on", () => {
  const bare = link({ _iconUrl: "blob:x", _iconFullBleed: false });
  const onTile = iconAppearance(bare, TILE_CSS_PX).insetSize;
  const inFolder = iconAppearance(bare, PREVIEW_CSS_PX).insetSize;
  assert.ok(onTile > inFolder, "a folder-preview cell is a smaller surface");
  // The same share of each, give or take the rounding to whole pixels (37/60 vs 12/20).
  assert.ok(Math.abs(onTile / TILE_CSS_PX - inFolder / PREVIEW_CSS_PX) < 0.03, "the same share of each");
});

test("folders and unresolved links keep their own presentations", () => {
  assert.equal(iconAppearance({ type: "folder", name: "设计", children: [] }).kind, "folder");
  assert.equal(iconAppearance(link({ _iconUrl: null })).kind, "letter");
  // An explicit letter tile is never overridden by artwork that happens to be cached.
  assert.equal(iconAppearance(link({ iconMode: "generated", _iconUrl: "blob:x", _iconFullBleed: true })).kind, "letter");
});

test("a letter tile carries an accent colour to fill itself with", () => {
  const { kind, accent } = iconAppearance(link({ _iconUrl: null }));
  assert.equal(kind, "letter");
  assert.match(accent, /^#|^rgb/, "an accent must be renderable CSS");
});

// A letter tile is the same white bed as every other tile, with the accent in the glyphs instead
// of behind them. It shipped the other way round, and in a real grid that made the fallback the
// loudest thing on the page: a monogram carries the least information of any tile and was
// outshouting every brand mark beside it, in a colour keyed on the host, so a column of
// unresolved intranet tools came out as a row of unrelated flat fills.
test("a letter tile's accent is ink, and every ink colour can be read on white", async () => {
  const { ACCENTS, accentInk } = await import("../src/lib/icons.js");
  const channel = (value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const accent of ACCENTS) {
    const ink = accentInk(accent);
    assert.match(ink, /^#[0-9a-f]{6}$/, `${accent} produced an unrenderable ink`);
    const contrast = 1.05 / (luminance(ink) + 0.05);
    // WCAG's threshold for body text. Clamping HSL lightness instead of solving for this left
    // five of the eleven under it — #23cfa8 landed at 2.7:1 — because HSL lightness is not
    // perceptual and a green at a given L is far brighter than a blue at the same L.
    assert.ok(contrast >= 4.5, `${accent} inks to ${ink}, only ${contrast.toFixed(2)}:1 on white`);
  }
});

// Ink is derived from the palette, not a second palette beside it. The stored value is still a
// palette entry — it has to be, because the same field fills a section heading's chip, where a
// saturated colour is exactly right.
test("ink keeps the accent's own hue and leaves dark accents alone", async () => {
  const { ACCENTS, accentInk } = await import("../src/lib/icons.js");
  const hue = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return ((h * 60) + 360) % 360;
  };
  for (const accent of ACCENTS) {
    const ink = accentInk(accent);
    const gap = Math.abs(hue(ink) - hue(accent)) % 360;
    assert.ok(Math.min(gap, 360 - gap) <= 8, `${accent} changed hue on its way to ${ink}`);
  }
  // Already dark enough to read on white, so it must come back untouched rather than be darkened
  // toward black for no reason.
  assert.equal(accentInk("#29446c"), "#29446c");
});
