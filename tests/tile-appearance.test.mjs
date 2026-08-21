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
  assert.equal(iconAppearance(bareTiny).kind, "inset");
  // ...and both sit at exactly the same size, which is what makes the row look deliberate.
  assert.equal(iconAppearance(bare4k).insetSize, iconAppearance(bareTiny).insetSize);
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
