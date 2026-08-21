import { accentFor } from "./icons.js";

export const TILE_CSS_PX = 60;
// The 2x2 cells inside a folder tile (see .folder-preview). A source that is far too soft for a
// 60px tile is still perfectly sharp at 20px, so thresholds are ratios of whatever surface the
// icon is actually being drawn on rather than one absolute pixel count.
export const PREVIEW_CSS_PX = 20;

// A resolved icon is always worth showing. An earlier revision discarded anything under ~57% of
// the tile and fell back to a letter, which threw away the 16/32px favicons that most intranet
// sites serve — tiles that used to show real artwork regressed to monograms. A letter is the
// fallback for having *nothing*, never for having something small.
//
// One constant share for every mark, deliberately: it is what makes a grid of wildly different
// source artwork read as one set of app icons rather than as a scrapbook.
const INSET_SCALE = 0.62;

// Every tile is a filled rounded square, the way a phone home screen is. Which of the three
// presentations it uses is decided by ONE question: does the source artwork paint its own
// background out to its edges?
//
//   artwork — it does, so the artwork simply *is* the tile, edge to edge. Painting anything
//             behind it would only add a seam where the two shades disagree.
//   inset   — it does not: a bare mark on transparency. It gets a surface of its own and sits
//             centred at a constant share of the tile.
//   letter  — nothing resolved at all: a flat accent fill with one or two white glyphs.
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
    return { kind: "inset", accent: null, insetSize: Math.round(targetPx * INSET_SCALE) };
  }
  return { kind: "letter", accent: accentFor(item.name, item.url, item.accentColor) };
}
