import test from "node:test";
import assert from "node:assert/strict";

// Drives the real service-worker module against a stubbed chrome API, so the wallpaper
// message contract is verified end to end instead of by reading the code.
function installChromeStub() {
  const store = {};
  const listeners = [];
  globalThis.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test${path}`,
      onInstalled: { addListener() {} },
      onMessage: { addListener: (fn) => listeners.push(fn) },
      sendMessage: async () => {},
      getPlatformInfo: async () => ({}),
    },
    storage: {
      local: {
        get: async (key) => (key in store ? { [key]: store[key] } : {}),
        set: async (obj) => Object.assign(store, obj),
        remove: async () => {},
      },
    },
    // Site access is an optional permission; the worker asks about it before probing any site
    // and listens for it being granted. Denied here, which is the state a fresh install is in.
    permissions: {
      contains: async () => false,
      onAdded: { addListener() {} },
    },
  };
  globalThis.caches = {
    open: async () => ({ match: async () => null, put: async () => {}, keys: async () => [] }),
    keys: async () => [],
  };
  return {
    store,
    send: (message) => new Promise((resolve) => {
      for (const fn of listeners) if (fn(message, {}, resolve)) return;
      resolve(null);
    }),
  };
}

const chromeStub = installChromeStub();
const { BACKGROUND_META_KEY, GRADIENTS } = await import("../src/lib/background-cache-keys.js");
await import("../src/background/service-worker.js");

test("choosing a gradient stores it and reports it back", async () => {
  chromeStub.store[BACKGROUND_META_KEY] = {
    images: [{ startDate: "20260818", urlbase: "/a", imageUrl: "https://www.bing.com/th?id=a" }],
    selectedIndex: 0,
    fetchedAt: Date.now(),
  };
  const key = GRADIENTS[0].key;

  const library = await chromeStub.send({ type: "LUMATAB_SET_WALLPAPER", gradientKey: key });
  assert.equal(library?.gradientKey, key, "settings panel never sees the gradient as selected");
  assert.equal(chromeStub.store[BACKGROUND_META_KEY].gradientKey, key, "gradient was not persisted");

  const background = await chromeStub.send({ type: "LUMATAB_GET_BING_BACKGROUND" });
  assert.equal(background?.meta?.gradientKey, key, "the page is never told to paint the gradient");
});

test("choosing a photo clears an active gradient", async () => {
  const library = await chromeStub.send({ type: "LUMATAB_SET_WALLPAPER", mode: "auto", key: null });
  assert.equal(library?.gradientKey, null);
});

test("the page turns the worker's gradient reply into paintable CSS", async () => {
  const key = GRADIENTS[2].key;
  // Stand in for the worker: reply exactly as it does for an active gradient.
  globalThis.chrome.runtime.sendMessage = async (message) => (
    message.type === "LUMATAB_GET_BING_BACKGROUND"
      ? { status: "gradient", cacheUrl: null, meta: { gradientKey: key, mask: 10, blur: 0 } }
      : null
  );
  const { loadBingBackground } = await import("../src/lib/background.js");
  const result = await loadBingBackground();
  assert.match(result.gradient ?? "", /^linear-gradient/, "gradient never reaches the wallpaper element");
  assert.equal(result.url, null);
});

test("icon resolution reports progress while it runs, not only at the end", async () => {
  const source = await (await import("node:fs/promises"))
    .readFile(new URL("../src/background/service-worker.js", import.meta.url), "utf8");
  // A 50-site batch takes long enough that MV3 can recycle the worker before it finishes.
  // Announcing only on completion meant the page showed nothing for the whole run and often
  // never heard anything at all, so the user had to reload the tab to see cached icons.
  assert.match(source, /progress\.report\(\)/, "resolved icons are never announced mid-batch");
  assert.match(source, /partial: true/, "progress broadcasts carry no partial marker");
});

test("the settings launcher keeps its styles", async () => {
  const css = await (await import("node:fs/promises"))
    .readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  // Right-click is the browser's again, so this button is the only way into settings; it was
  // once deleted along with a neighbouring block and left invisible but still in the DOM.
  assert.match(css, /\.settings-launcher\s*\{/);
  assert.match(css, /\.settings-launcher:hover/);
});

test("switching to auto keeps the current picture and only follows Bing from the next rotation", async () => {
  const images = [
    { startDate: "20260818", urlbase: "/a", imageUrl: "https://www.bing.com/th?id=a" },
    { startDate: "20260814", urlbase: "/b", imageUrl: "https://www.bing.com/th?id=b" },
  ];
  chromeStub.store[BACKGROUND_META_KEY] = { images, selectedIndex: 0, fetchedAt: Date.now() };

  await chromeStub.send({ type: "LUMATAB_SET_WALLPAPER", mode: "pinned", key: "20260814" });
  const back = await chromeStub.send({ type: "LUMATAB_SET_WALLPAPER", mode: "auto", key: null });
  // The chosen photo must survive the switch; "update daily" is a statement about future
  // updates, not a command to change the wallpaper this instant.
  assert.equal(back?.activeKey, "20260814", "auto mode yanked the wallpaper the user had chosen");
  assert.equal(back?.mode, "auto");
});
