// Single source of truth for the wallpaper cache identity, shared by the service worker (which
// writes) and the new-tab page (which reads). The page reads this cache DIRECTLY on first paint
// rather than asking the worker for the key: waking an idle MV3 worker and waiting for its reply
// costs hundreds of milliseconds, and that gap is exactly the window in which the bundled
// fallback image was visible before snapping to the real wallpaper.
//
// Because the page now derives the key itself, the two sides must agree byte for byte — keep
// CACHE_NAME, META_KEY and backgroundCacheRequest in lockstep whenever either side changes.
export const BACKGROUND_CACHE_NAME = "lumatab-background-v2";
export const BACKGROUND_META_KEY = "lumatab.bing-background.v2";
const CACHE_ORIGIN = "https://cache.lumatab.invalid/background/";

export function backgroundCacheRequest(image) {
  const key = image?.startDate || image?.urlbase || "current";
  return new Request(`${CACHE_ORIGIN}${encodeURIComponent(key)}`);
}

// "auto" follows Bing's newest image as it rotates; "pinned" holds whatever the user chose in
// settings. Stored on the state so the worker's daily refresh knows whether it may move the
// selection out from under a deliberate choice.
export const WALLPAPER_MODE_AUTO = "auto";
export const WALLPAPER_MODE_PINNED = "pinned";

// The image the state currently points at, honouring a pin and clamping a stale index. A
// gradient wallpaper has no image at all, so callers must check `state.gradientKey` first.
// `pinnedKey` is simply "the image on screen right now", honoured in both modes. The mode only
// decides what happens on the NEXT archive refresh: auto moves to Bing's newest, pinned stays
// put. Reading it only in pinned mode meant switching back to auto instantly replaced the
// picture the user had chosen, which is not what "update daily" asks for.
export function selectedImage(state) {
  if (state?.gradientKey) return null;
  if (!state?.images?.length) return null;
  if (state.pinnedKey) {
    const shown = state.images.find((image) => imageKey(image) === state.pinnedKey);
    if (shown) return shown;
  }
  const index = Math.max(0, Math.min(state.selectedIndex ?? 0, state.images.length - 1));
  return state.images[index];
}

export function imageKey(image) {
  return image?.startDate || image?.urlbase || "current";
}

// Gradient wallpapers, matching WeTab's model exactly: a two-stop linear-gradient at 25°, with
// the adjustment layer on top expressed as `rgba(0,0,0,mask/100)` over `backdrop-filter:
// blur(blur/5)px`. Blurring through a backdrop rather than filtering the layer itself is what
// avoids the shrunken, pale edges a plain `filter: blur()` leaves around a full-bleed element.
// Colors are a hue-diverse selection from WeTab's own 646-preset palette.
const GRADIENT_DEG = 25;
// Analogous pairs — the two stops sit close on the colour wheel with a clear step in lightness.
// An earlier revision picked for hue *diversity* and produced clashing two-colour bands (blue
// into red, green into magenta) that read as a test pattern rather than as a backdrop. A
// wallpaper has to recede behind the icons, so the gradient travels in tone, not in hue.
export const GRADIENTS = [
  // Rich and saturated, but deep. What lets an icon read as the foreground is a gap in
  // *lightness*, not a lack of colour — draining the saturation instead only produced muddy
  // grey-greens and grey-purples that were both dull and still competing.
  { key: "grad-crimson", colors: ["#821C2A", "#AF3142"] },
  { key: "grad-ember", colors: ["#98381B", "#C9512C"] },
  { key: "grad-amber", colors: ["#8D581B", "#C27D2E"] },
  { key: "grad-emerald", colors: ["#1A664A", "#2B916C"] },
  { key: "grad-teal", colors: ["#175E69", "#288695"] },
  { key: "grad-ocean", colors: ["#1B4F83", "#2D70B4"] },
  { key: "grad-indigo", colors: ["#272B8B", "#3E43BB"] },
  { key: "grad-violet", colors: ["#542782", "#783EB1"] },
  { key: "grad-plum", colors: ["#782664", "#A43D8A"] },
  { key: "grad-graphite", colors: ["#323D4E", "#4D5C6F"] },
  // Two clear, light options for anyone who wants a bright page; the label ink flips for these.
  { key: "grad-sky", colors: ["#ABD1ED", "#84B7DC"] },
  { key: "grad-mint", colors: ["#B1E7D5", "#8CD4BC"] },
];

// Relative luminance of a gradient, used both to decide label ink and to keep every option out
// of the mid-tone band where it would sit at the same value as the icon tiles.
export function gradientLuminance(colors) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luma = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  return colors.reduce((total, hex) => total + luma(hex), 0) / colors.length;
}

export function gradientCss(colors) {
  return `linear-gradient(${GRADIENT_DEG}deg, ${colors.join(", ")})`;
}

export function findGradient(key) {
  return GRADIENTS.find((gradient) => gradient.key === key) ?? null;
}

// WeTab exposes blur as a 0–100 slider and divides by five, so its maximum is 20px. Kept as-is.
export const DEFAULT_BLUR = 0;

// Brightness is bidirectional where WeTab's "mask" only ever darkened: 50 is the untouched
// photo, below it lays down black and above it lays down white. A darken-only control cannot
// rescue a dim wallpaper, which is the case that actually needs help. The ceiling is 0.92 rather
// than 1.0 so the extremes still read as a treated photo instead of a blank rectangle.
export const DEFAULT_BRIGHTNESS = 45;

function clamp(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
}

// Older installs stored `mask` (0 = untouched, 100 = black). Map it onto the new scale so an
// upgrade keeps the look the user already chose instead of jumping to neutral.
export function brightnessFrom(state) {
  if (state?.brightness !== undefined) return clamp(state.brightness, DEFAULT_BRIGHTNESS);
  if (state?.mask !== undefined) return clamp(50 - clamp(state.mask, 10) / 2, DEFAULT_BRIGHTNESS);
  return DEFAULT_BRIGHTNESS;
}

// Brightness and blur are applied as CSS filters on the wallpaper element itself, not as a
// translucent veil over it. A veil is what made the old control feel useless: laying grey or
// white over a photo flattens contrast and mutes every colour, so "brighter" looked washed out
// and "darker" looked muddy. `filter: brightness()` scales the pixels instead, keeping contrast
// and saturation intact, which is what people actually mean by brightness.
//
// Blur is the one thing a filter handles badly on a full-bleed element — it samples past the
// edges and leaves a pale border — so the layer is scaled up just enough to push those edges
// outside the viewport.
// 50 maps to 1.0; the ends reach 0.45 and 1.55, a range wide enough to rescue a very dark or
// very bright photo without clipping it to black or white.
export function brightnessFactor(brightness = DEFAULT_BRIGHTNESS) {
  const level = clamp(brightness, DEFAULT_BRIGHTNESS);
  return level >= 50
    ? 1 + ((level - 50) / 50) * 0.55
    : 1 - ((50 - level) / 50) * 0.55;
}

export function wallpaperFilterStyle({ brightness = DEFAULT_BRIGHTNESS, blur = DEFAULT_BLUR } = {}) {
  const radius = clamp(blur, DEFAULT_BLUR) / 5;
  const factor = brightnessFactor(brightness);
  const filters = [`brightness(${factor.toFixed(3)})`];
  if (radius > 0) filters.push(`blur(${radius}px)`);
  return {
    filter: filters.join(" "),
    transform: radius > 0 ? `scale(${(1 + radius / 90).toFixed(4)})` : "none",
  };
}

// True once the wallpaper is bright enough that white captions stop being legible. A photo has
// no luminance we can know without sampling it, so there the slider is the only signal; a
// gradient's luminance is known exactly, and combining it with the brightness factor is what
// makes a pale ground usable at all.
const LIGHT_INK_THRESHOLD = 68;

export function needsDarkInk({ brightness, gradientColors = null, luminance = null } = {}) {
  const base = gradientColors ? gradientLuminance(gradientColors) : luminance;
  // Once the wallpaper's luminance is known — measured for a photo, exact for a gradient — the
  // composited result decides the ink. The slider alone is only a fallback for the moment before
  // a photo has been measured, and it gets this wrong for a bright photo that the tone matcher
  // has darkened as far as it is allowed to: the slider reads "very dark", the picture does not.
  if (base !== null && base !== undefined) return base * brightnessFactor(brightness) > 0.42;
  return brightness > LIGHT_INK_THRESHOLD;
}
