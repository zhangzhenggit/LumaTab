import test from "node:test";
import assert from "node:assert/strict";

// Drives the real service worker with the optional host permission withheld, then granted, and
// records every URL it tries to fetch. The point is the one thing the Chrome Web Store listing
// promises: with site access denied, the extension must not reach out to the sites in the grid.
const fetched = [];
let siteAccessGranted = false;
let onIconsUpdated = () => {};

globalThis.chrome = {
  runtime: {
    getURL: (path) => `chrome-extension://test${path}`,
    onInstalled: { addListener() {} },
    onMessage: { addListener: (fn) => listeners.push(fn) },
    getPlatformInfo: async () => ({}),
    sendMessage: async (message) => {
      if (message?.type === "LUMATAB_ICONS_UPDATED" && message.diagnostics?.complete) {
        onIconsUpdated(message.diagnostics);
      }
    },
  },
  storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
  permissions: {
    contains: async () => siteAccessGranted,
    onAdded: { addListener() {} },
  },
};
const listeners = [];
globalThis.caches = {
  open: async () => ({ match: async () => null, put: async () => {}, keys: async () => [] }),
  keys: async () => [],
};
// Every request fails: what is asserted here is which URLs are *attempted*, not what comes back.
globalThis.fetch = async (input) => {
  fetched.push(String(input?.url ?? input));
  return new Response(null, { status: 404 });
};

await import("../src/background/service-worker.js");

function resolveIcons(url) {
  return new Promise((resolve) => {
    onIconsUpdated = resolve;
    for (const fn of listeners) {
      fn({ type: "LUMATAB_RESOLVE_SITE_ICONS", sites: [{ id: "a", url }], devicePixelRatio: 1 }, {}, () => {});
    }
  });
}

test("with site access withheld, no request ever reaches the site", async () => {
  fetched.length = 0;
  siteAccessGranted = false;
  const summary = await resolveIcons("https://example.test/");

  assert.equal(summary.siteAccess, false);
  const offExtension = fetched.filter((url) => !url.startsWith("chrome-extension://"));
  assert.deepEqual(offExtension, [], `expected no site requests, got: ${offExtension.join(", ")}`);
  // Chrome's own favicon store is an extension URL and needs no host permission, so the fallback
  // is still consulted — otherwise "denied" would mean "no icons at all" rather than "small ones".
  assert.ok(fetched.some((url) => url.includes("/_favicon/")), "the favicon fallback must still run");
});

test("once granted, the site's own icon paths are probed", async () => {
  fetched.length = 0;
  siteAccessGranted = true;
  const summary = await resolveIcons("https://granted.test/");

  assert.equal(summary.siteAccess, true);
  const siteHits = fetched.filter((url) => url.startsWith("https://granted.test/"));
  assert.ok(siteHits.length > 0, "expected the site to be probed once access is granted");
  assert.ok(siteHits.some((url) => /favicon/.test(url)), `expected a favicon probe, got: ${siteHits.join(", ")}`);
});
