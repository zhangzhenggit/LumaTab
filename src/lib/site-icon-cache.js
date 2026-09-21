import { ICON_CACHE_NAME } from "./icon-cache-keys.js";
import { analyzeIconBlob } from "./image-visibility.js";
import { isLink } from "./sections.js";

// Explicitly `isLink`, not "anything that is not a folder". The grid also carries section
// markers, which have no URL, and treating one as a link sends an undefined through the whole
// icon pipeline.
function visitLinks(items, callback) {
  for (const item of items) {
    if (item.type === "folder") visitLinks(item.children ?? [], callback);
    else if (isLink(item)) callback(item);
  }
}

// One shape for a tile's icon fields, so the "found it" and "leave it alone" branches cannot
// drift apart as fields are added — which is how a new field silently reaches only half the tiles.
function iconFields(found, existing) {
  return {
    _iconUrl: found?.url ?? existing._iconUrl ?? null,
    _iconSource: found?.source ?? existing._iconSource ?? null,
    _iconAccent: found?.accent ?? existing._iconAccent ?? null,
    _iconNativeSize: found?.nativeSize ?? existing._iconNativeSize ?? 0,
    _iconFullBleed: found?.fullBleed ?? existing._iconFullBleed ?? false,
    _iconCustom: found?.custom ?? existing._iconCustom ?? false,
  };
}

// Icons only ever get added, never revoked: a tile that already drew artwork keeps it, so the
// grid never flickers back to a letter because one later lookup came up empty.
function applyIconUrls(items, icons) {
  return items.map((item) => {
    if (item.type === "folder") return { ...item, children: applyIconUrls(item.children ?? [], icons) };
    return isLink(item) ? { ...item, ...iconFields(icons.get(item.id), item) } : item;
  });
}

async function urlHash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function iconCacheRequest(pageUrl) {
  const normalized = new URL(pageUrl).toString();
  return new Request(`https://cache.lumatab.invalid/site-icons/${await urlHash(normalized)}`);
}

// Icons are decoration; the grid is the product. Cache Storage can fail outright — a corrupt
// profile answers `caches.open` with "Unexpected internal error", and a disk-full or evicted
// profile can do the same — and when it did, the rejection propagated out of prepareSiteIcons
// and through the load chain in useShortcuts, so `setShortcuts` never ran and the user's entire
// grid rendered empty. Losing the icons is survivable; losing the links is not.
async function readCachedIcons(sites) {
  const urls = new Map();
  let cache;
  try {
    cache = await caches.open(ICON_CACHE_NAME);
  } catch (error) {
    console.warn("LumaTab: icon cache unavailable, showing letter tiles", error);
    return urls;
  }
  await Promise.all(sites.map(async (site) => {
    try {
      const response = await cache.match(await iconCacheRequest(site.url));
      if (!response) return;
      const blob = await response.blob();
      if (!blob.size) return;
      urls.set(site.id, {
        url: URL.createObjectURL(blob),
        source: "cache",
        accent: response.headers.get("x-lumatab-accent"),
        nativeSize: Number(response.headers.get("x-lumatab-native-size")) || 0,
        fullBleed: response.headers.get("x-lumatab-full-bleed") === "1",
        custom: response.headers.get("x-lumatab-custom") === "1",
      });
    } catch {
      // One unreadable entry must not cost the other tiles their icons.
    }
  }));
  return urls;
}

// --- custom icons -------------------------------------------------------------------------------
//
// A picture the user chose, written into the same cache under the same key as a resolved one, so
// nothing downstream has to know the difference: the grid, the folder preview, the drag ghost and
// the edit dialog all read it exactly as they read a favicon.
//
// It exists because resolution cannot win every time and the failures are not random — four links
// to different views of one Jira instance all resolve to the same 16px mark, and no amount of
// work in the worker can turn that into four distinguishable tiles. This is the only way out of
// that, and it is why it was the first icon change made.
//
// Uploads are **re-encoded, never stored as picked**. Whatever the file was, what lands in the
// cache is a PNG this page rendered at no more than 256px. That caps what a big photo costs in
// Cache Storage, gives `nativeSize` a meaning consistent with a fetched icon, and means the bytes
// the tile loads are bytes we produced rather than an arbitrary file from disk.
const CUSTOM_ICON_MAX_BYTES = 4 * 1024 * 1024;
// Four times the 60px tile: enough for a 2x display with room to spare, small enough that a
// hundred of them are a rounding error on disk.
const CUSTOM_ICON_MAX_PX = 256;
// SVG is deliberately not accepted. A vector would have to be sanitised before it could be put
// in an <img> — an unsanitised one can reference external URLs, and the new-tab document is not
// allowed to make network requests at all — and that sanitiser lives in the worker. Raster only
// keeps the whole feature inside the page with nothing to get wrong.
export const CUSTOM_ICON_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"];

async function reencodeIcon(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, CUSTOM_ICON_MAX_PX / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: false });
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    // PNG, always: the source may have an alpha channel and a bare mark on transparency is the
    // case the inset presentation exists for. Re-encoding to JPEG would fill it with black.
    return { blob: await canvas.convertToBlob({ type: "image/png" }), width, height };
  } finally {
    bitmap.close();
  }
}

// Stores `file` as the icon for `pageUrl` and returns it in the same shape a cached icon comes
// back in, so the caller can show it immediately. Throws with a message meant for the user.
export async function storeCustomIcon(pageUrl, file) {
  if (!CUSTOM_ICON_TYPES.includes(file.type)) throw new Error("只支持 PNG、JPG、WebP、GIF 图片");
  if (file.size > CUSTOM_ICON_MAX_BYTES) throw new Error("图片太大了，请换一张 4MB 以内的");

  let encoded;
  try {
    encoded = await reencodeIcon(file);
  } catch {
    throw new Error("这张图片无法读取，请换一张");
  }

  const { fullBleed, accentColor } = await analyzeIconBlob(encoded.blob)
    .catch(() => ({ fullBleed: false, accentColor: null }));

  const headers = {
    "content-type": "image/png",
    "cache-control": "no-store",
    "x-lumatab-fetched-at": String(Date.now()),
    // Recorded on the entry itself rather than in a list somewhere else, for the same reason the
    // wallpaper records its variant as a header: two places to look is two places to fall out of
    // step. It is what stops a later refresh overwriting a picture the user chose.
    "x-lumatab-custom": "1",
    "x-lumatab-native-size": String(Math.min(encoded.width, encoded.height)),
  };
  if (fullBleed) headers["x-lumatab-full-bleed"] = "1";
  if (accentColor) headers["x-lumatab-accent"] = accentColor;

  const cache = await caches.open(ICON_CACHE_NAME);
  await cache.put(await iconCacheRequest(pageUrl), new Response(encoded.blob, { headers }));

  return {
    url: URL.createObjectURL(encoded.blob),
    source: "custom",
    accent: accentColor,
    nativeSize: Math.min(encoded.width, encoded.height),
    fullBleed,
    custom: true,
  };
}

export async function prepareSiteIcons(items) {
  if (!globalThis.chrome?.runtime?.sendMessage) return items;
  const sites = [];
  visitLinks(items, (item) => {
    if (item.iconMode !== "generated") sites.push({ id: item.id, url: item.url });
  });
  if (!sites.length) return items;

  const cachedUrls = await readCachedIcons(sites);
  const missing = sites.filter((site) => !cachedUrls.has(site.id));

  // The service worker has no viewport of its own, so it can't know how many real device
  // pixels a 50 CSS px icon needs on this screen — a HiDPI display (125%/150%/200% Windows
  // scaling) needs a much larger source than a 1x display to look sharp. Send the actual
  // ratio along so the resolution floor is computed for this device instead of guessed.
  const devicePixelRatio = globalThis.devicePixelRatio || 1;

  // Paint the verified cache and nothing else. An earlier revision also painted Chrome's
  // low-resolution favicon as a stand-in for sites still being resolved, which meant a freshly
  // seeded grid visibly swapped every tile from blurry to sharp a second later. Chrome's store
  // is still consulted — but inside the worker, as the last step of resolution, so whatever
  // reaches the cache is already final.
  void chrome.runtime.sendMessage({ type: "LUMATAB_RESOLVE_SITE_ICONS", sites: missing, devicePixelRatio })
    .catch((error) => console.warn("LumaTab: background icon resolution failed", error));
  return applyIconUrls(items, cachedUrls);
}

// Re-resolves everything, ignoring what is already cached. Used after the user grants site
// access: the tiles resolved before the grant hold Chrome's small stand-ins, and those are cached,
// so the normal "only fetch what is missing" path would leave every one of them as it was.
export async function refreshSiteIcons(items) {
  if (!globalThis.chrome?.runtime?.sendMessage) return;
  const sites = [];
  visitLinks(items, (item) => {
    // A custom icon is exempt from the one operation that ignores the cache. Everywhere else the
    // worker is only ever asked for icons that are *missing*, and a custom one never is; this is
    // the single path that would otherwise fetch over the top of a picture the user chose.
    if (item.iconMode !== "generated" && item.iconMode !== "custom") sites.push({ id: item.id, url: item.url });
  });
  if (!sites.length) return;
  await chrome.runtime.sendMessage({
    type: "LUMATAB_RESOLVE_SITE_ICONS",
    sites,
    refresh: true,
    devicePixelRatio: globalThis.devicePixelRatio || 1,
  }).catch((error) => console.warn("LumaTab: icon refresh failed", error));
}

// Resolves one URL on demand and waits for the answer, for the add/edit dialog's "fetch icon"
// button. Everywhere else resolution is fire-and-forget, but here the user explicitly asked and
// is watching a preview, so the wait is the point — and doing it before the link is saved means
// the icon is already in the cache by the time the tile first renders.
export async function resolveIconPreview(url) {
  if (!globalThis.chrome?.runtime?.sendMessage) return null;
  const probe = { id: "icon-preview", url };
  const [cached] = [...(await readCachedIcons([probe])).values()];
  if (cached) return cached;

  const settled = new Promise((resolve) => {
    const finish = (value) => {
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(listener);
      resolve(value);
    };
    const listener = (message) => {
      if (message?.type === "LUMATAB_ICONS_UPDATED") finish(true);
    };
    const timer = setTimeout(() => finish(false), ICON_PREVIEW_TIMEOUT_MS);
    chrome.runtime.onMessage.addListener(listener);
  });

  void chrome.runtime.sendMessage({
    type: "LUMATAB_RESOLVE_SITE_ICONS",
    sites: [probe],
    devicePixelRatio: globalThis.devicePixelRatio || 1,
  }).catch(() => {});

  if (!(await settled)) return null;
  const [resolved] = [...(await readCachedIcons([probe])).values()];
  return resolved ?? null;
}

const ICON_PREVIEW_TIMEOUT_MS = 15_000;

// Lets an already-open new tab pick up icons the worker resolved after first paint, instead
// of showing whatever placeholder it had until the user opens another tab.
export function subscribeToIconUpdates(onUpdated) {
  if (!globalThis.chrome?.runtime?.onMessage) return () => {};
  const listener = (message) => {
    if (message?.type === "LUMATAB_ICONS_UPDATED") onUpdated(message.diagnostics ?? {});
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

// Re-reads only what the worker has already verified into the cache; never issues network
// work of its own, so it is safe to call whenever an update broadcast arrives.
//
// Only tiles that have nothing yet are filled in. Once a tile has drawn an icon it keeps it for
// the life of the page: re-reading the cache would hand back an identical image under a fresh
// blob URL, and swapping the src makes every already-correct tile flash for no visible gain.
// `force` exists for one case: the user has just granted site access, so tiles already showing
// Chrome's small stand-in have to be replaced by the real artwork. The flash is the point there.
export async function applyCachedSiteIcons(items, { force = false } = {}) {
  if (!globalThis.caches) return items;
  const sites = [];
  visitLinks(items, (item) => {
    if (item.iconMode !== "generated" && (force || !item._iconUrl)) sites.push({ id: item.id, url: item.url });
  });
  if (!sites.length) return items;
  const cachedUrls = await readCachedIcons(sites);
  return cachedUrls.size ? applyIconUrls(items, cachedUrls) : items;
}

