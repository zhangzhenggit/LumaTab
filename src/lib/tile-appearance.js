import { accentFor, accentInk } from "./icons.js";

export const TILE_CSS_PX = 60;
// The 2x2 cells inside a folder tile (see .folder-preview). A source that is far too soft for a
// 60px tile is still perfectly sharp at 20px, so thresholds are ratios of whatever surface the
// icon is actually being drawn on rather than one absolute pixel count.
export const PREVIEW_CSS_PX = 21;

// A resolved icon is always worth showing. An earlier revision discarded anything under ~57% of
// the tile and fell back to a letter, which threw away the 16/32px favicons that most intranet
// sites serve — tiles that used to show real artwork regressed to monograms. A letter is the
// fallback for having *nothing*, never for having something small.
//
// The share of the tile a bare mark fills. It was one constant — 62% for everything — and the
// reasoning was that a constant is what makes a grid of wildly different source artwork read as
// one set of app icons rather than as a scrapbook. That is still true of the *ceiling*, which is
// why every source good enough lands on exactly one number.
//
// What the constant could not answer is the 16px favicon most intranet sites serve. Drawn at 62%
// of a 60px tile it is magnified 2.3x, and on a 1.5x display 3.5x, which is mush — four such
// tiles in one row were the worst thing in the screenshot this came from. So the rule is a cap on
// *magnification* rather than a fixed size: a small source is drawn smaller, up to the point
// where it would become a lonely dot in a big white card.
//
// Note what this does NOT do, because an earlier revision did it and was wrong: it does not size
// the mark by its pixel count. That leaves a 16px favicon at 16px, which is the dot. The floor is
// a share of the surface, so the result is still recognisably one grid.
const INSET_MAX = 0.66;
const INSET_MIN = 0.5;
// How far a raster source may be blown up before softness costs more than size buys.
const MAX_MAGNIFICATION = 2;

// `nativeSize` is the shorter side of the source art, 0 for vectors — which scale to anything, so
// they always get the ceiling.
export function insetSizeFor(targetPx, nativeSize = 0) {
  const ceiling = targetPx * INSET_MAX;
  if (!nativeSize) return Math.round(ceiling);
  return Math.round(Math.min(ceiling, Math.max(targetPx * INSET_MIN, nativeSize * MAX_MAGNIFICATION)));
}

// Every tile is a filled rounded square, the way a phone home screen is. Which of the three
// presentations it uses is decided by ONE question: does the source artwork paint its own
// background out to its edges?
//
//   artwork — it does, so the artwork simply *is* the tile, edge to edge. Painting anything
//             behind it would only add a seam where the two shades disagree.
//   inset   — it does not: a bare mark on transparency. It gets a surface of its own and sits
//             centred at a constant share of the tile.
//   letter  — nothing resolved at all: the same white bed carrying one or two coloured glyphs.
//
// This used to branch on *resolution* — art sharp enough to fill 60px went edge-to-edge, anything
// softer got a card. Resolution has nothing to do with whether a mark needs a background, so a
// high-resolution transparent logo (GitHub, OpenAI, Claude) was dropped straight onto the
// wallpaper while a 16px favicon beside it sat on a white card. One grid, two unrelated looks,
// decided by a property nobody was thinking about.
export function iconAppearance(item, targetPx = TILE_CSS_PX) {
  if (item.type === "folder") return { kind: "folder", accent: null };
  if (item.iconMode !== "generated" && item._iconUrl) {
    if (item._iconFullBleed) return { kind: "artwork", accent: null };
    return { kind: "inset", accent: null, insetSize: insetSizeFor(targetPx, item._iconNativeSize) };
  }
  // The accent reaches a letter tile as ink on the white bed, not as a fill behind white glyphs,
  // so it is the derived ink variant rather than the palette entry itself. The palette entry is
  // still what the picker offers and what a section heading's chip fills itself with — one
  // stored value, two presentations, and the second derived from the first.
  return { kind: "letter", accent: accentInk(accentFor(item.name, item.url, item.accentColor)) };
}
