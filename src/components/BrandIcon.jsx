import { useEffect, useState } from "react";
import { monogramFor } from "../lib/icons";
import { iconAppearance, PREVIEW_CSS_PX, TILE_CSS_PX } from "../lib/tile-appearance.js";
import { isPainted } from "../lib/painted-check";

export { iconAppearance, PREVIEW_CSS_PX };

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
  // The fit is decided here and nowhere else, because it is written as an inline style and an
  // inline style beats any stylesheet rule — an override in styles.css was written once, read
  // correctly in the source, and silently did nothing.
  //
  // The rule is the same at both sizes: artwork that paints its own background fills its tile,
  // a bare mark is contained. A folder-preview child spent one round forced to `contain` so that
  // four children on one shared white bed would not clash; each child has a tile of its own now
  // (see .folder-preview__cell), so its background is its own object again, as on a home screen.
  const fit = item._iconFullBleed ? "cover" : "contain";
  return (
    <img
      className={`brand-icon ${inset ? "brand-icon--inset" : ""}`}
      data-source={item._iconSource ?? "cache"}
      data-fit={fit}
      style={{
        ...(inset ? { "--inset-size": `${appearance.insetSize}px` } : null),
        objectFit: fit,
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
