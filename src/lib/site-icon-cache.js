function visitLinks(items, callback) {
  for (const item of items) {
    if (item.type === "folder") visitLinks(item.children ?? [], callback);
    else callback(item);
  }
}

function applyIconUrls(items, icons) {
  return items.map((item) => item.type === "folder"
    ? { ...item, children: applyIconUrls(item.children ?? [], icons) }
    : icons.has(item.id)
      ? { ...item, _iconUrl: icons.get(item.id).url, _iconSource: icons.get(item.id).source }
      : { ...item, _iconUrl: item._iconUrl ?? null, _iconSource: item._iconSource ?? null });
}

const ICON_CACHE_NAME = "lumatab-site-icons-v8";

function chromeFaviconUrl(pageUrl) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "64");
  return url.toString();
}

async function visibleImageBlob(blob) {
  if (!blob?.size) return false;
  try {
    const bitmap = await createImageBitmap(blob);
    const size = 32;
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, size, size);
    context.drawImage(bitmap, 0, 0, size, size);
    bitmap.close();
    const pixels = context.getImageData(0, 0, size, size).data;
    let visible = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 24) visible += 1;
    }
    return visible >= 12;
  } catch {
    return false;
  }
}

async function blobFingerprint(blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

let genericFaviconFingerprintPromise;
function genericFaviconFingerprint() {
  genericFaviconFingerprintPromise ??= fetch(chromeFaviconUrl("https://lumatab-no-favicon.invalid/"))
    .then(async (response) => response.ok ? blobFingerprint(await response.blob()) : null)
    .catch(() => null);
  return genericFaviconFingerprintPromise;
}

async function readChromeFavicons(sites) {
  const urls = new Map();
  const genericFingerprint = await genericFaviconFingerprint();
  await Promise.all(sites.map(async (site) => {
    try {
      const response = await fetch(chromeFaviconUrl(site.url));
      if (!response.ok) return;
      const blob = await response.blob();
      if (!await visibleImageBlob(blob)) return;
      if (genericFingerprint && await blobFingerprint(blob) === genericFingerprint) return;
      urls.set(site.id, { url: URL.createObjectURL(blob), source: "chrome" });
    } catch { /* Chrome may not know this site's favicon yet. */ }
  }));
  return urls;
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
    urls.set(site.id, { url: URL.createObjectURL(blob), source: "cache" });
  }));
  return urls;
}

export async function prepareSiteIcons(items, { retryMissing = false, waitForNetwork = false } = {}) {
  if (!globalThis.chrome?.runtime?.sendMessage) return items;
  const sites = [];
  visitLinks(items, (item) => {
    if (item.iconMode !== "generated" && (!retryMissing || item._iconSource !== "cache")) {
      sites.push({ id: item.id, url: item.url });
    }
  });
  if (!sites.length) return items;

  const cachedUrls = await readCachedIcons(sites);
  const missingFromCache = sites.filter((site) => !cachedUrls.has(site.id));
  const chromeUrls = await readChromeFavicons(missingFromCache);
  const availableUrls = new Map([...chromeUrls, ...cachedUrls]);
  const cachedItems = applyIconUrls(items, availableUrls);
  const missing = missingFromCache;

  const resolution = chrome.runtime.sendMessage({
    type: "LUMATAB_RESOLVE_SITE_ICONS",
    sites: missing,
    force: retryMissing,
  });
  if (!waitForNetwork) {
    void resolution.catch((error) => console.warn("LumaTab: background icon resolution failed", error));
    return cachedItems;
  }

  await resolution;
  const resolvedUrls = await readCachedIcons(missing);
  return applyIconUrls(cachedItems, resolvedUrls);
}

export function refreshSiteIcons(items) {
  return prepareSiteIcons(items, { retryMissing: true, waitForNetwork: true });
}
