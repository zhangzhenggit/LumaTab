import { pageDeclaredCandidates, safeWebUrl, sanitizeSvg } from "../lib/icon-discovery.js";
import { hasVisiblePixels } from "../lib/image-visibility.js";

const BING_ENDPOINT =
  "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=7&mkt=zh-CN";
const CACHE_NAME = "lumatab-background-v2";
const CACHE_ORIGIN = "https://cache.lumatab.invalid/background/";
const META_KEY = "lumatab.bing-background.v2";
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ICON_CACHE_NAME = "lumatab-site-icons-v8";
const ICON_FAILURE_KEY = "lumatab.site-icon-failures.v8";
const ICON_FAILURE_TTL_MS = 10 * 60 * 1000;
const ICON_REQUEST_TIMEOUT_MS = 4_500;
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MAX_HTML_BYTES = 768 * 1024;
const ICON_CONCURRENCY = 12;

function cacheRequest(image) {
  const key = image?.startDate || image?.urlbase || "current";
  return new Request(`${CACHE_ORIGIN}${encodeURIComponent(key)}`);
}

async function getStoredState() {
  const result = await chrome.storage.local.get(META_KEY);
  return result[META_KEY] ?? null;
}

async function storeState(state) {
  await chrome.storage.local.set({ [META_KEY]: state });
}

function selectedImage(state) {
  if (!state?.images?.length) return null;
  const index = Math.max(0, Math.min(state.selectedIndex ?? 0, state.images.length - 1));
  return state.images[index];
}

function publicState(state, status) {
  const image = selectedImage(state);
  if (!image) return { status: "fallback", meta: null, cacheUrl: null };
  return {
    status,
    cacheUrl: cacheRequest(image).url,
    meta: {
      title: image.title,
      copyright: image.copyright,
      copyrightLink: image.copyrightLink,
      startDate: image.startDate,
      selectedIndex: state.selectedIndex ?? 0,
      imageCount: state.images.length,
      fetchedAt: state.fetchedAt,
    },
  };
}

function validateImageUrl(path) {
  const imageUrl = new URL(path, "https://www.bing.com");
  if (imageUrl.protocol !== "https:" || imageUrl.hostname !== "www.bing.com" || imageUrl.pathname !== "/th") {
    throw new Error("Unexpected Bing image URL");
  }
  return imageUrl.toString();
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { cache: "no-store", credentials: "omit", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSiteWithTimeout(url, accept) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ICON_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      cache: "no-cache",
      credentials: "include",
      headers: { accept },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function urlHash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function iconCacheRequest(pageUrl) {
  return new Request(`https://cache.lumatab.invalid/site-icons/${await urlHash(new URL(pageUrl).toString())}`);
}

function hasRasterSignature(bytes) {
  const ascii = (...values) => values.every((value, index) => bytes[index] === value);
  return ascii(0x89, 0x50, 0x4e, 0x47)
    || ascii(0xff, 0xd8, 0xff)
    || ascii(0x47, 0x49, 0x46, 0x38)
    || ascii(0x00, 0x00, 0x01, 0x00)
    || (ascii(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
    || (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70);
}

async function verifiedIconBlob(response) {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (!response.ok || length > MAX_ICON_BYTES) return null;
  const blob = await response.blob();
  if (!blob.size || blob.size > MAX_ICON_BYTES) return null;
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (hasRasterSignature(head)) return await hasVisiblePixels(blob) ? blob : null;
  const type = (response.headers.get("content-type") ?? blob.type).toLowerCase();
  if (!type.includes("svg") && !type.includes("xml")) return null;
  const svg = sanitizeSvg(await blob.text());
  return svg && await hasVisiblePixels(svg) ? svg : null;
}

async function fetchIconCandidate(url) {
  try {
    const response = await fetchSiteWithTimeout(url, "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.4");
    return await verifiedIconBlob(response);
  } catch {
    return null;
  }
}

async function manifestCandidates(manifestUrl) {
  if (!manifestUrl) return [];
  try {
    const response = await fetchSiteWithTimeout(manifestUrl, "application/manifest+json,application/json");
    if (!response.ok) return [];
    const manifest = await response.json();
    return (Array.isArray(manifest.icons) ? manifest.icons : [])
      .map((icon) => ({
        url: safeWebUrl(icon?.src, response.url || manifestUrl)?.toString(),
        size: Math.max(0, ...String(icon?.sizes ?? "").split(/\s+/).map((size) => Number(size.split("x")[0]) || 0)),
        vector: String(icon?.type ?? "").includes("svg"),
      }))
      .filter((icon) => icon.url)
      .sort((left, right) => Number(right.vector) - Number(left.vector) || right.size - left.size)
      .slice(0, 4);
  } catch {
    return [];
  }
}

async function discoverIconCandidates(pageUrl) {
  const page = safeWebUrl(pageUrl);
  if (!page) return [];
  const conventional = ["/apple-touch-icon.png", "/favicon.svg", "/favicon.png", "/favicon.ico"]
    .map((path) => new URL(path, page.origin).toString());
  try {
    const response = await fetchSiteWithTimeout(page.toString(), "text/html,application/xhtml+xml");
    const length = Number(response.headers.get("content-length") ?? 0);
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || length > MAX_HTML_BYTES || (type && !type.includes("html"))) return conventional;
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    const declared = pageDeclaredCandidates(html, response.url || page.toString());
    const manifestIcons = (await manifestCandidates(declared.manifestUrl)).map((icon) => icon.url);
    return [...new Set([...manifestIcons, ...declared.icons, ...conventional])];
  } catch {
    return conventional;
  }
}

async function resolveSiteIcon(pageUrl) {
  for (const candidate of await discoverIconCandidates(pageUrl)) {
    const blob = await fetchIconCandidate(candidate);
    if (blob) return blob;
  }
  return null;
}

async function loadIconFailures() {
  const result = await chrome.storage.local.get(ICON_FAILURE_KEY);
  return result[ICON_FAILURE_KEY] ?? {};
}

async function resolveSiteIcons(sites, force = false) {
  const cache = await caches.open(ICON_CACHE_NAME);
  const failures = await loadIconFailures();
  const diagnostics = { total: sites.length, resolved: 0, failed: 0, negativeCache: 0 };
  let cursor = 0;
  const workers = Array.from({ length: Math.min(ICON_CONCURRENCY, sites.length) }, async () => {
    while (cursor < sites.length) {
      const site = sites[cursor++];
      const page = safeWebUrl(site?.url);
      if (!page) { diagnostics.failed += 1; continue; }
      const pageUrl = page.toString();
      const checkedAt = Number(failures[pageUrl]?.checkedAt ?? failures[site.url]?.checkedAt ?? 0);
      if (!force && checkedAt && Date.now() - checkedAt < ICON_FAILURE_TTL_MS) {
        diagnostics.negativeCache += 1;
        continue;
      }
      const blob = await resolveSiteIcon(pageUrl);
      if (!blob) {
        failures[pageUrl] = { checkedAt: Date.now() };
        diagnostics.failed += 1;
        continue;
      }
      delete failures[pageUrl];
      delete failures[site.url];
      await cache.put(await iconCacheRequest(pageUrl), new Response(blob, { headers: {
        "content-type": blob.type || "image/x-icon",
        "x-lumatab-fetched-at": String(Date.now()),
      } }));
      diagnostics.resolved += 1;
    }
  });
  await Promise.all(workers);
  await chrome.storage.local.set({ [ICON_FAILURE_KEY]: failures });
  console.info("LumaTab: background icon resolution", diagnostics);
  return diagnostics;
}

async function fetchArchive(previousState) {
  const response = await fetchWithTimeout(BING_ENDPOINT);
  if (!response.ok) throw new Error(`Bing archive request failed: ${response.status}`);
  const archive = await response.json();
  const images = (archive?.images ?? []).map((image) => ({
    title: image.title || "Bing 每日图",
    copyright: image.copyright || "Bing",
    copyrightLink: image.copyrightlink || "https://www.bing.com/",
    startDate: image.startdate || "",
    urlbase: image.urlbase || "",
    imageUrl: validateImageUrl(image.url),
  }));
  if (!images.length) throw new Error("Bing archive returned no images");

  const previousDate = selectedImage(previousState)?.startDate;
  const preservedIndex = images.findIndex((image) => image.startDate === previousDate);
  return {
    images,
    selectedIndex: preservedIndex >= 0 ? preservedIndex : 0,
    fetchedAt: Date.now(),
  };
}

async function ensureImageCached(image) {
  const cache = await caches.open(CACHE_NAME);
  const request = cacheRequest(image);
  if (await cache.match(request)) return request.url;

  const response = await fetchWithTimeout(image.imageUrl);
  if (!response.ok) throw new Error(`Bing image request failed: ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (!contentType.startsWith("image/") || contentLength > MAX_IMAGE_BYTES) {
    throw new Error("Invalid Bing image response");
  }
  await cache.put(request, response.clone());
  return request.url;
}

async function resolveBackground({ forceArchive = false, advance = false } = {}) {
  let state = await getStoredState();
  const archiveFresh = state?.images?.length && Date.now() - state.fetchedAt < REFRESH_AFTER_MS;

  if (forceArchive || !archiveFresh) {
    try {
      state = await fetchArchive(state);
      await storeState(state);
    } catch (error) {
      console.warn("LumaTab: failed to refresh Bing archive", error);
      if (!state?.images?.length) return publicState(null, "fallback");
    }
  }

  if (advance && state.images.length > 1) {
    state = { ...state, selectedIndex: ((state.selectedIndex ?? 0) + 1) % state.images.length };
    await storeState(state);
  }

  try {
    await ensureImageCached(selectedImage(state));
    return publicState(state, advance ? "cycled" : archiveFresh ? "cached" : "updated");
  } catch (error) {
    console.warn("LumaTab: failed to cache selected Bing image", error);
    return publicState(null, "fallback");
  }
}

async function pruneStaleCaches(currentNames) {
  const names = await caches.keys();
  await Promise.all(names
    .filter((name) => name.startsWith("lumatab-") && !currentNames.includes(name))
    .map((name) => caches.delete(name)));
}

async function pruneStaleStorageKeys(prefix, currentKey) {
  const stored = await chrome.storage.local.get(null);
  const staleKeys = Object.keys(stored).filter((key) => key.startsWith(prefix) && key !== currentKey);
  if (staleKeys.length) await chrome.storage.local.remove(staleKeys);
}

chrome.runtime.onInstalled.addListener(() => {
  void pruneStaleCaches([CACHE_NAME, ICON_CACHE_NAME]);
  void pruneStaleStorageKeys("lumatab.site-icon-failures.", ICON_FAILURE_KEY);
  void resolveBackground({ forceArchive: true });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "LUMATAB_GET_BING_BACKGROUND") {
    resolveBackground({ forceArchive: Boolean(message.force) }).then(sendResponse).catch(() => sendResponse(null));
    return true;
  }
  if (message?.type === "LUMATAB_CYCLE_BING_BACKGROUND") {
    resolveBackground({ advance: true }).then(sendResponse).catch(() => sendResponse(null));
    return true;
  }
  if (message?.type === "LUMATAB_RESOLVE_SITE_ICONS") {
    const sites = Array.isArray(message.sites) ? message.sites.slice(0, 200) : [];
    resolveSiteIcons(sites, Boolean(message.force)).then(sendResponse).catch((error) => {
      console.warn("LumaTab: site icon resolution failed", error);
      sendResponse({ total: sites.length, resolved: 0, failed: sites.length });
    });
    return true;
  }
  return false;
});
