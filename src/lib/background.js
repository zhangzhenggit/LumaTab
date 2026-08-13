const CACHE_NAME = "lumatab-background-v2";
const FALLBACK_URL = "/assets/wallpapers/fallback-alpine.webp";

async function resultToBackground(result) {
  if (!result?.cacheUrl?.startsWith("https://cache.lumatab.invalid/background/")) {
    return { url: FALLBACK_URL, meta: null };
  }
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(result.cacheUrl);
  if (!response) return { url: FALLBACK_URL, meta: null };
  return { url: URL.createObjectURL(await response.blob()), meta: result.meta ?? null };
}

async function requestBackground(type, force = false) {
  if (!globalThis.chrome?.runtime?.sendMessage) return { url: FALLBACK_URL, meta: null };
  try {
    const result = await chrome.runtime.sendMessage({ type, force });
    return await resultToBackground(result);
  } catch (error) {
    console.warn("LumaTab: using fallback wallpaper", error);
    return { url: FALLBACK_URL, meta: null };
  }
}

export function loadBingBackground() {
  return requestBackground("LUMATAB_GET_BING_BACKGROUND");
}

export function cycleBingBackground() {
  return requestBackground("LUMATAB_CYCLE_BING_BACKGROUND");
}
