import { useEffect, useState } from "react";
import { accentFor, monogramFor } from "../lib/icons";
import { isPainted } from "../lib/painted-check";

const TILE_CSS_PX = 60;
// The 2x2 cells inside a folder tile (see .folder-preview). A source that is far too soft for a
// 60px tile is still perfectly sharp at 20px, so the thresholds are ratios of whatever surface
// the icon is actually being drawn on rather than one absolute pixel count.
export const PREVIEW_CSS_PX = 20;

// Scaling art up by a quarter is invisible, so anything from 80% of the target can be the tile.
const ARTWORK_RATIO = 0.8;
// A resolved icon is always worth showing. An earlier revision discarded anything under ~57% of
// the tile and fell back to a letter, which threw away the 16/32px favicons that most intranet
// sites serve — the tiles that used to show real artwork regressed to monograms. A letter is the
// fallback for having *nothing*, never for having something small.
const INSET_SCALE = 0.62;

function sharpCssSize(item) {
  // A vector has no native size and stays crisp at any scale.
  if (!item._iconNativeSize) return Infinity;
  return Math.round(item._iconNativeSize / (globalThis.devicePixelRatio || 1));
}

// Three presentations, in the order the tile prefers them:
//   artwork — the icon is the tile, edge to edge, exactly as WeTab renders every shortcut. A
//             mark on transparency therefore sits straight on the wallpaper with no card.
//   inset   — too soft to be stretched over the whole tile, so it sits on a light surface at a
//             fixed share of the tile. Sizing it by its own pixel count instead would leave a
//             16px favicon as a lonely dot in the middle of a 60px card; a constant inset keeps
//             every fallback tile looking like the same deliberate component.
//   letter  — nothing resolved at all: a flat accent fill with one or two white glyphs.
export function iconAppearance(item, targetPx = TILE_CSS_PX) {
  if (item.type === "folder") return { kind: "folder", accent: null };
  if (item.iconMode !== "generated" && item._iconUrl) {
    const sharpAt = sharpCssSize(item);
    if (sharpAt >= targetPx * ARTWORK_RATIO) return { kind: "artwork", accent: null };
    return { kind: "inset", accent: null, insetSize: Math.round(targetPx * INSET_SCALE) };
  }
  return { kind: "letter", accent: accentFor(item.name, item.url, item.accentColor) };
}

function LetterIcon({ item }) {
  const letters = monogramFor(item.name, item.monogram);
  return (
    <span className="letter-icon" data-length={[...letters].length} aria-hidden="true">{letters}</span>
  );
}

export function BrandIcon({ item, compact = false }) {
  const [iconFailed, setIconFailed] = useState(false);

  useEffect(() => {
    setIconFailed(false);
  }, [item._iconUrl]);

  const appearance = iconAppearance(item, compact ? PREVIEW_CSS_PX : TILE_CSS_PX);
  if (iconFailed || appearance.kind === "letter") return <LetterIcon item={item} />;

  // Artwork that carries its own background covers the tile; a bare mark is contained so the
  // logo is never cropped by the tile's rounded corners. A folder-preview cell never insets:
  // at 20px there is no blur to avoid, and drawing a mark at 62% of an already tiny cell left
  // the folder tile looking like four specks instead of four icons.
  const inset = !compact && appearance.kind === "inset";
  return (
    <img
      className={`brand-icon ${inset ? "brand-icon--inset" : ""}`}
      data-source={item._iconSource ?? "cache"}
      data-fit={item._iconFullBleed ? "cover" : "contain"}
      style={{
        ...(inset ? { "--inset-size": `${appearance.insetSize}px` } : null),
        objectFit: item._iconFullBleed ? "cover" : "contain",
      }}
      src={item._iconUrl}
      alt=""
      draggable="false"
      // An icon that loads but paints nothing never fires onError, so the tile would sit empty
      // forever. Checking the rendered result is the only way to catch that, and a letter is
      // always better than a blank square.
      onLoad={(event) => {
        if (!isPainted(event.currentTarget, item._iconUrl)) setIconFailed(true);
      }}
      onError={() => setIconFailed(true)}
    />
  );
}
