import { silkRamp } from "../lib/background-cache-keys";
import { silkThumbnail } from "../lib/silk";
import { useSilkSurface } from "../hooks/useWallpaperDrift";

// The rendered form of a solid background: folded silk, drawn by the shader in lib/silk.js.
//
// It replaces <Aurora>, which was three blurred discs over a two-stop ramp. That version was
// reported as "像基础 Demo" and the reason is structural rather than a matter of tuning: every
// edge in it was a gaussian falloff, and a picture with no hard edge anywhere cannot read as
// finished. Silk has ridges.
//
// The CSS ramp underneath is not a placeholder to be swapped out — it stays, permanently, as the
// element's own background. It is what the first frame shows before the shader's first draw, what
// remains on a machine with no WebGL, and what paints if the context is lost while the page is
// open. Painting it as a background rather than as a sibling element means none of those three
// cases needs any code to handle it.
//
// Both sizes this exists in run the same shader, because a picker that only approximates the
// wallpaper is a picker that will eventually be wrong — that was true of <Aurora> and it is more
// true of a field with structure in it. What differs is how the pixels get there. The full-bleed
// one owns a live context and is redrawn every frame; a swatch is rendered once, through one
// shared offscreen context, and kept as a data URL. It has to be: a browser allows on the order
// of sixteen live WebGL contexts per page, and twelve 40px squares that never move would spend
// most of that budget to animate nothing.
export function Silk({ colors, still = false }) {
  const ref = useSilkSurface(colors, { skip: still });
  const ramp = silkRamp(colors);
  if (still) {
    const thumbnail = silkThumbnail(colors);
    return (
      <span
        className="silk silk--still"
        style={{ backgroundImage: thumbnail ? `url("${thumbnail}")` : ramp }}
        aria-hidden="true"
      />
    );
  }
  return (
    <span className="silk" style={{ backgroundImage: ramp }} aria-hidden="true">
      <canvas ref={ref} className="silk__canvas" />
    </span>
  );
}
