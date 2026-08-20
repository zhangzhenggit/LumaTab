import {
  BACKGROUND_CACHE_NAME,
  BACKGROUND_META_KEY,
  backgroundCacheRequest,
  brightnessFrom,
  DEFAULT_BLUR,
  findGradient,
  gradientCss,
  selectedImage,
  WALLPAPER_MODE_PINNED,
} from "./background-cache-keys.js";

export const FALLBACK_WALLPAPER = "/assets/wallpapers/fallback-alpine.webp";

// Reads the wallpaper straight out of Cache Storage, deriving the key from stored state without
// involving the service worker. This is the whole fix for the startup flash: asking the worker
// meant waiting for an idle MV3 worker to boot and reply, and the bundled fallback was on screen
// for that entire window. Both reads here are local and typically resolve in a few milliseconds,
// so the first painted frame is already the right image.
export async function readCachedWallpaper() {
  if (!globalThis.caches || !globalThis.chrome?.storage?.local) return null;
  try {
    const stored = await chrome.storage.local.get(BACKGROUND_META_KEY);
    const state = stored[BACKGROUND_META_KEY];
    const tuning = { brightness: brightnessFrom(state), blur: state?.blur ?? DEFAULT_BLUR, brightnessAuto: state?.brightnessAuto !== false };
    // A gradient is pure CSS: nothing to read, nothing to decode, so it is always ready on the
    // very first frame.
    const gradient = findGradient(state?.gradientKey);
    if (gradient) return { url: null, gradient: gradientCss(gradient.colors), gradientColors: gradient.colors, meta: tuning };
    const image = selectedImage(state);
    if (!image) return null;
    const cache = await caches.open(BACKGROUND_CACHE_NAME);
    const response = await cache.match(backgroundCacheRequest(image));
    if (!response) return null;
    return {
      url: URL.createObjectURL(await response.blob()),
      gradient: null,
      meta: {
        title: image.title,
        copyright: image.copyright,
        copyrightLink: image.copyrightLink,
        startDate: image.startDate,
        mode: state.mode,
        ...tuning,
      },
    };
  } catch (error) {
    console.warn("LumaTab: could not read cached wallpaper", error);
    return null;
  }
}

async function resultToBackground(result) {
  const gradient = findGradient(result?.meta?.gradientKey);
  if (gradient) return { url: null, gradient: gradientCss(gradient.colors), gradientColors: gradient.colors, meta: result.meta };
  if (!result?.cacheUrl?.startsWith("https://cache.lumatab.invalid/background/")) {
    return { url: FALLBACK_WALLPAPER, gradient: null, meta: null };
  }
  const cache = await caches.open(BACKGROUND_CACHE_NAME);
  const response = await cache.match(result.cacheUrl);
  if (!response) return { url: FALLBACK_WALLPAPER, gradient: null, meta: null };
  return { url: URL.createObjectURL(await response.blob()), gradient: null, meta: result.meta ?? null };
}

async function send(message) {
  if (!globalThis.chrome?.runtime?.sendMessage) return null;
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    console.warn("LumaTab: background request failed", message.type, error);
    return null;
  }
}

// Asks the worker to refresh. Only used to catch up *after* first paint, never on the critical
// path, so a slow or sleeping worker can no longer delay the wallpaper appearing.
export async function loadBingBackground() {
  const result = await send({ type: "LUMATAB_GET_BING_BACKGROUND" });
  return result ? await resultToBackground(result) : { url: FALLBACK_WALLPAPER, meta: null };
}

export function loadWallpaperLibrary() {
  return send({ type: "LUMATAB_GET_WALLPAPER_LIBRARY" });
}

export function chooseWallpaper(key) {
  return send({ type: "LUMATAB_SET_WALLPAPER", mode: WALLPAPER_MODE_PINNED, key });
}

export function followLatestWallpaper() {
  return send({ type: "LUMATAB_SET_WALLPAPER", mode: "auto", key: null });
}

export function chooseGradient(gradientKey) {
  return send({ type: "LUMATAB_SET_WALLPAPER", gradientKey });
}

export function tuneWallpaper({ brightness, blur }) {
  return send({ type: "LUMATAB_SET_WALLPAPER", brightness, blur });
}

// Records a brightness the page worked out from the photo itself, without ending auto mode.
export function storeAutoBrightness(brightness) {
  return send({ type: "LUMATAB_SET_WALLPAPER", brightness, auto: true });
}

// Turns a cache URL from the library into something an <img> can display.
export async function wallpaperThumbnail(cacheUrl) {
  try {
    const cache = await caches.open(BACKGROUND_CACHE_NAME);
    const response = await cache.match(cacheUrl);
    return response ? URL.createObjectURL(await response.blob()) : null;
  } catch {
    return null;
  }
}
