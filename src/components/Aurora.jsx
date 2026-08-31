import { auroraBlobs, gradientCss } from "../lib/background-cache-keys";
import { useAuroraDrift } from "../hooks/useWallpaperDrift";

// The rendered form of a solid background, used at both sizes it exists in: full-bleed behind the
// grid, and 40px inside a settings swatch. Deliberately one component rather than two, because a
// swatch that only approximates the wallpaper is a swatch that will eventually be wrong — the
// picker's whole job is to show you the thing you are choosing.
//
// Two things differ between the two sizes, and both have to. The blur radius comes in as
// --aurora-blur from the stylesheet, because a 90px blur inside a 40px square would wash the
// whole swatch to one colour. And `still` stops the blobs drifting: twelve swatches would
// otherwise open twelve animation loops to move something 40px wide by a millimetre.
export function Aurora({ colors, still = false }) {
  const ref = useAuroraDrift(!still);
  return (
    <span ref={ref} className="aurora" style={{ backgroundImage: gradientCss(colors) }} aria-hidden="true">
      {auroraBlobs(colors).map((color, index) => (
        <b key={index} style={{ background: color }} />
      ))}
    </span>
  );
}
