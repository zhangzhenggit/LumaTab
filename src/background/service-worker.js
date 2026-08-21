import {
  BACKGROUND_CACHE_NAME,
  BACKGROUND_META_KEY,
  backgroundCacheRequest,
  brightnessFrom,
  DEFAULT_BLUR,
  imageKey,
  selectedImage,
  WALLPAPER_MODE_AUTO,
  WALLPAPER_MODE_PINNED,
} from "../lib/background-cache-keys.js";
import { ICON_CACHE_NAME, ICON_FAILURE_KEY } from "../lib/icon-cache-keys.js";
import { pageDeclaredCandidates, safeWebUrl, sanitizeSvg } from "../lib/icon-discovery.js";
import { analyzeIconBlob } from "../lib/image-visibility.js";
import { hasSiteAccess } from "../lib/site-access.js";

const BING_ENDPOINT =
  "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=7&mkt=zh-CN";
const CACHE_NAME = BACKGROUND_CACHE_NAME;
const META_KEY = BACKGROUND_META_KEY;
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
// A real site icon always beats a generated letter, so the bar here is only "is this a usable
// image at all" — blur is prevented by rendering small icons smaller (see brandIconSize in
// BrandIcon.jsx) rather than by rejecting them and falling back to a monogram.
const MIN_ICON_PX = 16;
// Matches .brand-icon's width in styles.css: the CSS box a full-size icon renders into.
const DISPLAY_ICON_PX = 50;
const ICON_FAILURE_TTL_MS = 10 * 60 * 1000;
const ICON_REQUEST_TIMEOUT_MS = 3_500;
const KEEP_ALIVE_INTERVAL_MS = 20_000;
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MAX_HTML_BYTES = 768 * 1024;
const ICON_CONCURRENCY = 12;
const ICON_PROGRESS_INTERVAL_MS = 700;

async function getStoredState() {
  const result = await chrome.storage.local.get(META_KEY);
  return result[META_KEY] ?? null;
}

async function storeState(state) {
  await chrome.storage.local.set({ [META_KEY]: state });
}

function adjustments(state) {
  return {
    brightness: brightnessFrom(state),
    blur: state?.blur ?? DEFAULT_BLUR,
    // Until the slider is touched, the page is free to pick a brightness that keeps the icons
    // legible on whatever photo Bing sends. Once it is touched the choice is the user's.
    brightnessAuto: state?.brightnessAuto !== false,
  };
}

function publicState(state, status) {
  // A gradient needs no download and no cache entry, so it short-circuits the whole image path.
  if (state?.gradientKey) {
    return { status: "gradient", cacheUrl: null, meta: { gradientKey: state.gradientKey, ...adjustments(state) } };
  }
  const image = selectedImage(state);
  if (!image) return { status: "fallback", meta: null, cacheUrl: null };
  return {
    status,
    cacheUrl: backgroundCacheRequest(image).url,
    meta: {
      title: image.title,
      copyright: image.copyright,
      copyrightLink: image.copyrightLink,
      startDate: image.startDate,
      selectedIndex: state.selectedIndex ?? 0,
      imageCount: state.images.length,
      fetchedAt: state.fetchedAt,
      mode: state.mode ?? WALLPAPER_MODE_AUTO,
      activeKey: imageKey(image),
      ...adjustments(state),
    },
  };
}

// The whole archive, for the settings panel's wallpaper picker. Cache URLs are included so the
// panel can render real thumbnails of images already on disk instead of re-downloading them.
function wallpaperLibrary(state) {
  const base = { ...adjustments(state), gradientKey: state?.gradientKey ?? null };
  if (!state?.images?.length) return { ...base, mode: WALLPAPER_MODE_AUTO, activeKey: null, images: [] };
  const active = selectedImage(state);
  return {
    ...base,
    mode: state.mode ?? WALLPAPER_MODE_AUTO,
    activeKey: active ? imageKey(active) : null,
    images: state.images.map((image) => ({
      key: imageKey(image),
      title: image.title,
      copyright: image.copyright,
      startDate: image.startDate,
      cacheUrl: backgroundCacheRequest(image).url,
    })),
  };
}

// Caches every image in the archive so the picker can show all seven as real thumbnails, and
// so switching between them is instant and works offline.
async function cacheWholeArchive(state) {
  if (!state?.images?.length) return;
  for (const image of state.images) {
    try {
      await ensureImageCached(image);
    } catch (error) {
      console.info("LumaTab: could not pre-cache wallpaper", image.startDate, error?.name || error);
    }
  }
}

async function selectWallpaper({ mode, key, gradientKey, brightness, blur, auto = false }) {
  const state = (await getStoredState()) ?? {};

  // Mask/blur are independent of which wallpaper is showing, so they are applied on their own
  // and leave the current selection untouched.
  if (gradientKey === undefined && mode === undefined && (brightness !== undefined || blur !== undefined)) {
    const tuned = {
      ...state,
      brightness: brightness ?? brightnessFrom(state),
      blur: blur ?? state.blur ?? DEFAULT_BLUR,
      // An explicit brightness ends automatic tone matching for good; a value the page derived
      // from the photo itself is not a choice, so it leaves auto mode intact.
      brightnessAuto: brightness === undefined || auto ? state.brightnessAuto !== false : false,
    };
    await storeState(tuned);
    return wallpaperLibrary(tuned);
  }

  if (gradientKey) {
    const next = { ...state, gradientKey };
    await storeState(next);
    return wallpaperLibrary(next);
  }

  if (!state?.images?.length) return wallpaperLibrary(state);
  // Choosing any photo clears a gradient: the two are mutually exclusive backgrounds.
  //
  // Switching back to auto keeps whatever is on screen right now and only starts following Bing
  // from the next rotation. Jumping straight to the newest image would throw away the picture the
  // user had deliberately chosen, which is the opposite of what "auto-update" asks for — it is a
  // statement about future updates, not a command to change the wallpaper this instant.
  const next = mode === WALLPAPER_MODE_PINNED && key
    ? { ...state, gradientKey: null, mode: WALLPAPER_MODE_PINNED, pinnedKey: key }
    : { ...state, gradientKey: null, mode: WALLPAPER_MODE_AUTO, pinnedKey: imageKey(selectedImage(state)) };
  await storeState(next);
  try {
    await ensureImageCached(selectedImage(next));
  } catch (error) {
    console.warn("LumaTab: failed to cache chosen wallpaper", error);
  }
  return wallpaperLibrary(next);
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
  if (hasRasterSignature(head)) {
    const analysis = await analyzeIconBlob(blob);
    if (!analysis?.visible || Math.min(analysis.width, analysis.height) < MIN_ICON_PX) return null;
    return {
      blob,
      accentColor: analysis.accentColor,
      fullBleed: analysis.fullBleed,
      nativeSize: Math.min(analysis.width, analysis.height),
    };
  }
  const type = (response.headers.get("content-type") ?? blob.type).toLowerCase();
  if (!type.includes("svg") && !type.includes("xml")) return null;
  const svg = sanitizeSvg(await blob.text());
  if (!svg) return null;
  // SVG is verified structurally, not by sampling pixels. `createImageBitmap` cannot decode SVG
  // in Chrome at all, and a service worker has no DOM to rasterise one with — so running vectors
  // through analyzeIconBlob silently rejected every single SVG icon, which is a large share of
  // modern favicons. sanitizeSvg already guarantees a well-formed root with at least one drawable
  // element, and if the markup somehow still fails to paint, the tile's onError falls back to a
  // letter. Vector art scales to any size, so nativeSize stays 0.
  return { blob: svg, accentColor: null, fullBleed: false, nativeSize: 0 };
}

async function fetchIconCandidate(url) {
  try {
    const response = await fetchSiteWithTimeout(url, "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.4");
    return await verifiedIconBlob(response);
  } catch (error) {
    console.info(`LumaTab icon: candidate failed ${url} (${error?.name || error})`);
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

// Favicon tier tries the site's own declared/conventional favicon first (highest
// recognizability); apple-touch-icon and manifest art are a fallback tier for when the
// favicon is missing or too small, since those are sometimes a different, less-familiar mark.
async function discoverIconCandidates(pageUrl) {
  const page = safeWebUrl(pageUrl);
  if (!page) return [];
  const conventionalFavicon = ["/favicon.svg", "/favicon.png", "/favicon.ico"]
    .map((path) => new URL(path, page.origin).toString());
  const conventionalAppleTouch = new URL("/apple-touch-icon.png", page.origin).toString();
  try {
    const response = await fetchSiteWithTimeout(page.toString(), "text/html,application/xhtml+xml");
    const length = Number(response.headers.get("content-length") ?? 0);
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || length > MAX_HTML_BYTES || (type && !type.includes("html"))) {
      return [...conventionalFavicon, conventionalAppleTouch];
    }
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    const declared = pageDeclaredCandidates(html, response.url || page.toString());
    const manifestIcons = await manifestCandidates(declared.manifestUrl);
    const manifestVector = manifestIcons.filter((icon) => icon.vector).map((icon) => icon.url);
    const manifestRaster = manifestIcons.filter((icon) => !icon.vector).map((icon) => icon.url);
    const faviconTier = [...declared.faviconIcons, ...conventionalFavicon, ...manifestVector];
    const alternateTier = [...declared.appleTouchIcons, conventionalAppleTouch, ...manifestRaster];
    const candidates = [...new Set([...faviconTier, ...alternateTier])];
    console.info(`LumaTab icon: ${candidates.length} candidate(s) for ${pageUrl}`, candidates);
    return candidates;
  } catch (error) {
    console.info(`LumaTab icon: page fetch failed for ${pageUrl}, using conventional paths only (${error?.name || error})`);
    return [...conventionalFavicon, conventionalAppleTouch];
  }
}

// Candidates are already ordered by preference (the site's own favicon first). Stop at the
// first good-sized hit; when only a small one turns up, probe a couple more for something
// bigger and then settle. Exhaustively fetching every candidate for every site made whole
// batches time out, which cost more icons than the extra probing ever recovered.
const EXTRA_PROBES_AFTER_SMALL_HIT = 2;

// `siteAccess` is the optional host permission. Without it every fetch below is blocked before
// it leaves the browser, so probing would only produce a wall of console errors on the way to the
// same answer — go straight to the fallback instead.
async function resolveSiteIcon(pageUrl, idealSize, siteAccess) {
  if (!siteAccess) return await chromeFaviconCandidate(pageUrl);
  let best = null;
  let probesLeft = EXTRA_PROBES_AFTER_SMALL_HIT;
  for (const candidate of await discoverIconCandidates(pageUrl)) {
    const result = await fetchIconCandidate(candidate);
    if (!result) continue;
    if (!result.nativeSize || result.nativeSize >= idealSize) return result;
    if (!best || result.nativeSize > best.nativeSize) best = result;
    if (probesLeft-- <= 0) break;
  }
  if (best) {
    console.info(`LumaTab icon: best available for ${pageUrl} is ${best.nativeSize}px (ideal ${idealSize}px)`);
    return best;
  }
  // Nothing reachable over the network. Sites behind a login wall and intranet hosts that
  // refuse anonymous requests land here, and Chrome usually already has their icon from a
  // previous visit.
  return await chromeFaviconCandidate(pageUrl);
}

// Chrome's own favicon store, which already holds an icon for every site the user has visited —
// including login-gated and intranet hosts whose artwork a cold fetch can never reach. It is the
// last resort *inside* resolution rather than a placeholder the page paints on its own, so
// whatever wins here is written to the cache once and never re-litigated on a later render.
function chromeFaviconUrl(pageUrl) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "64");
  return url.toString();
}

async function blobFingerprint(blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Chrome answers with a generic globe for sites it has never seen. That placeholder is worse
// than our own letter tile, so it is fingerprinted once and filtered out by content.
let genericFaviconFingerprintPromise;
function genericFaviconFingerprint() {
  genericFaviconFingerprintPromise ??= fetch(chromeFaviconUrl("https://lumatab-no-favicon.invalid/"))
    .then(async (response) => (response.ok ? blobFingerprint(await response.blob()) : null))
    .catch(() => null);
  return genericFaviconFingerprintPromise;
}

async function chromeFaviconCandidate(pageUrl) {
  try {
    const response = await fetch(chromeFaviconUrl(pageUrl));
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.size) return null;
    const generic = await genericFaviconFingerprint();
    if (generic && (await blobFingerprint(blob)) === generic) return null;
    const analysis = await analyzeIconBlob(blob);
    if (!analysis?.visible) return null;
    return {
      blob,
      accentColor: analysis.accentColor,
      fullBleed: analysis.fullBleed,
      nativeSize: Math.min(analysis.width, analysis.height),
    };
  } catch {
    return null;
  }
}

async function loadIconFailures() {
  const result = await chrome.storage.local.get(ICON_FAILURE_KEY);
  return result[ICON_FAILURE_KEY] ?? {};
}

// MV3 terminates an idle service worker after ~30s, and plain fetches do NOT reset that
// timer — only extension API calls do. A 50-site batch easily outlives that, so without a
// heartbeat the worker is killed mid-run and its icons never land in the cache.
function startKeepAlive() {
  const timer = setInterval(() => void chrome.runtime.getPlatformInfo(), KEEP_ALIVE_INTERVAL_MS);
  return () => clearInterval(timer);
}

function broadcastIconsUpdated(diagnostics) {
  // Fire-and-forget: no new-tab page may be open to receive this, which is not an error.
  void chrome.runtime.sendMessage({ type: "LUMATAB_ICONS_UPDATED", diagnostics }).catch(() => {});
}

// Announces icons while the batch is still running, throttled so a large grid does not turn
// into one message per site. Reporting only on completion meant a 50-site batch showed nothing
// for its whole duration — and if MV3 recycled the worker before it finished, the page never
// heard anything at all and the user had to reload the tab to see the icons already cached.
function progressReporter() {
  let last = 0;
  let timer = null;
  const flush = () => {
    timer = null;
    last = Date.now();
    broadcastIconsUpdated({ partial: true });
  };
  return {
    report() {
      if (timer) return;
      const wait = Math.max(0, ICON_PROGRESS_INTERVAL_MS - (Date.now() - last));
      timer = setTimeout(flush, wait);
    },
    stop() {
      if (timer) clearTimeout(timer);
    },
  };
}

async function resolveSiteIcons(sites, devicePixelRatio = 1, refresh = false) {
  const cache = await caches.open(ICON_CACHE_NAME);
  const failures = await loadIconFailures();
  // The size a full-width icon needs on the requesting screen; anything smaller still gets
  // used, just rendered proportionally smaller so it stays sharp.
  const idealSize = Math.ceil(DISPLAY_ICON_PX * Math.min(4, Math.max(1, Number(devicePixelRatio) || 1)));
  const siteAccess = await hasSiteAccess();
  const diagnostics = { total: sites.length, resolved: 0, failed: 0, negativeCache: 0, idealSize, siteAccess, refresh };
  const stopKeepAlive = startKeepAlive();
  const progress = progressReporter();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(ICON_CONCURRENCY, sites.length) }, async () => {
    while (cursor < sites.length) {
      const site = sites[cursor++];
      const page = safeWebUrl(site?.url);
      if (!page) { diagnostics.failed += 1; continue; }
      const pageUrl = page.toString();
      const checkedAt = Number(failures[pageUrl]?.checkedAt ?? failures[site.url]?.checkedAt ?? 0);
      if (checkedAt && Date.now() - checkedAt < ICON_FAILURE_TTL_MS) {
        diagnostics.negativeCache += 1;
        continue;
      }
      const result = await resolveSiteIcon(pageUrl, idealSize, siteAccess);
      if (!result) {
        failures[pageUrl] = { checkedAt: Date.now() };
        diagnostics.failed += 1;
        continue;
      }
      delete failures[pageUrl];
      delete failures[site.url];
      const headers = {
        "content-type": result.blob.type || "image/x-icon",
        "x-lumatab-fetched-at": String(Date.now()),
      };
      if (result.accentColor) headers["x-lumatab-accent"] = result.accentColor;
      if (result.nativeSize) headers["x-lumatab-native-size"] = String(result.nativeSize);
      if (result.fullBleed) headers["x-lumatab-full-bleed"] = "1";
      await cache.put(await iconCacheRequest(pageUrl), new Response(result.blob, { headers }));
      diagnostics.resolved += 1;
      progress.report();
    }
  });

  try {
    await Promise.all(workers);
    await chrome.storage.local.set({ [ICON_FAILURE_KEY]: failures });
    console.info("LumaTab: background icon resolution", diagnostics);
  } finally {
    stopKeepAlive();
    progress.stop();
  }
  const summary = { ...diagnostics, complete: true };
  broadcastIconsUpdated(summary);
  return summary;
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
  // A pin survives the archive rotating underneath it; auto mode always snaps back to index 0,
  // which is Bing's newest image. Preserving the index in auto mode would silently turn "follow
  // the daily image" into "stay on whatever was newest the day you installed".
  const mode = previousState?.mode === WALLPAPER_MODE_PINNED ? WALLPAPER_MODE_PINNED : WALLPAPER_MODE_AUTO;
  // This is the moment auto mode actually acts: the archive has rotated, so it moves to Bing's
  // newest image. Pinned keeps its picture as long as the archive still carries it.
  const pinnedStillPresent = previousState?.pinnedKey
    && images.some((image) => imageKey(image) === previousState.pinnedKey);
  return {
    images,
    mode,
    pinnedKey: mode === WALLPAPER_MODE_PINNED && pinnedStillPresent ? previousState.pinnedKey : null,
    selectedIndex: mode === WALLPAPER_MODE_PINNED && preservedIndex >= 0 ? preservedIndex : 0,
    fetchedAt: Date.now(),
  };
}

async function ensureImageCached(image) {
  const cache = await caches.open(CACHE_NAME);
  const request = backgroundCacheRequest(image);
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

// Fetches and stores a fresh archive, returning the new state (or the old one on failure).
async function refreshArchiveState() {
  const previous = await getStoredState();
  try {
    const state = await fetchArchive(previous);
    await storeState(state);
    void cacheWholeArchive(state);
    return state;
  } catch (error) {
    console.warn("LumaTab: failed to refresh Bing archive", error);
    return previous;
  }
}

async function resolveBackground({ forceArchive = false } = {}) {
  let state = await getStoredState();
  if (state?.gradientKey) return publicState(state, "gradient");
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

  try {
    await ensureImageCached(selectedImage(state));
    // Warm the rest of the archive after the visible one is safely cached, so the settings
    // picker has thumbnails ready without ever delaying first paint.
    void cacheWholeArchive(state);
    return publicState(state, archiveFresh ? "cached" : "updated");
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

// Granting site access has to invalidate the negative cache. Every site that could not be
// reached while access was withheld is recorded there for ICON_FAILURE_TTL_MS, so without this
// the grant would appear to do nothing at all for the rest of that window.
chrome.permissions.onAdded.addListener((granted) => {
  if (!granted?.origins?.length) return;
  void chrome.storage.local.remove(ICON_FAILURE_KEY);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "LUMATAB_GET_BING_BACKGROUND") {
    resolveBackground({ forceArchive: Boolean(message.force) }).then(sendResponse).catch(() => sendResponse(null));
    return true;
  }
  if (message?.type === "LUMATAB_GET_WALLPAPER_LIBRARY") {
    getStoredState()
      .then(async (state) => {
        if (!state?.images?.length) return wallpaperLibrary(await refreshArchiveState());
        void cacheWholeArchive(state);
        return wallpaperLibrary(state);
      })
      .then(sendResponse)
      .catch(() => sendResponse(null));
    return true;
  }
  if (message?.type === "LUMATAB_SET_WALLPAPER") {
    selectWallpaper(message).then(sendResponse).catch(() => sendResponse(null));
    return true;
  }
  if (message?.type === "LUMATAB_RESOLVE_SITE_ICONS") {
    const sites = Array.isArray(message.sites) ? message.sites.slice(0, 200) : [];
    // Acknowledge synchronously and let the batch run detached. Holding the channel open for
    // the whole batch used to fail with "message channel closed before a response was
    // received" once the run outlived the port, losing every icon it had already found.
    // Completion reaches the page through the LUMATAB_ICONS_UPDATED broadcast instead.
    void resolveSiteIcons(sites, message.devicePixelRatio, Boolean(message.refresh))
      .catch((error) => console.warn("LumaTab: site icon resolution failed", error));
    sendResponse({ started: true, total: sites.length });
    return false;
  }
  return false;
});
