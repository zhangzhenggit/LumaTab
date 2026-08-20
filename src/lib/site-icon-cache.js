import { ICON_CACHE_NAME } from "./icon-cache-keys.js";

function visitLinks(items, callback) {
  for (const item of items) {
    if (item.type === "folder") visitLinks(item.children ?? [], callback);
    else callback(item);
  }
}

// Icons only ever get added, never revoked: a tile that already drew artwork keeps it, so the
// grid never flickers back to a letter because one later lookup came up empty.
function applyIconUrls(items, icons) {
  return items.map((item) => item.type === "folder"
    ? { ...item, children: applyIconUrls(item.children ?? [], icons) }
    : icons.has(item.id)
      ? { ...item, _iconUrl: icons.get(item.id).url, _iconSource: icons.get(item.id).source, _iconAccent: icons.get(item.id).accent ?? null, _iconNativeSize: icons.get(item.id).nativeSize ?? 0, _iconFullBleed: icons.get(item.id).fullBleed ?? false }
      : { ...item, _iconUrl: item._iconUrl ?? null, _iconSource: item._iconSource ?? null, _iconAccent: item._iconAccent ?? null, _iconNativeSize: item._iconNativeSize ?? 0, _iconFullBleed: item._iconFullBleed ?? false });
}

async function urlHash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function iconCacheRequest(pageUrl) {
  const normalized = new URL(pageUrl).toString();
  return new Request(`https://cache.lumatab.invalid/site-icons/${await urlHash(normalized)}`);
}

async function readCachedIcons(sites) {
  const cache = await caches.open(ICON_CACHE_NAME);
  const urls = new Map();
  await Promise.all(sites.map(async (site) => {
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
    });
  }));
  return urls;
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
    if (message?.type === "LUMATAB_ICONS_UPDATED") onUpdated();
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
export async function applyCachedSiteIcons(items) {
  if (!globalThis.caches) return items;
  const sites = [];
  visitLinks(items, (item) => {
    if (item.iconMode !== "generated" && !item._iconUrl) sites.push({ id: item.id, url: item.url });
  });
  if (!sites.length) return items;
  const cachedUrls = await readCachedIcons(sites);
  return cachedUrls.size ? applyIconUrls(items, cachedUrls) : items;
}

