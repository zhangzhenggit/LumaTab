import test from "node:test";
import assert from "node:assert/strict";

// A corrupt or evicted browser profile answers `caches.open` with "Unexpected internal error".
// When that rejection escaped, it took the whole grid with it: prepareSiteIcons rejected, the
// load chain in useShortcuts never called setShortcuts, and the user saw an empty new tab with
// every shortcut still safely in storage. Icons are decoration; the links are the product.
test("an unusable icon cache costs the icons, never the links", async () => {
  globalThis.chrome = { runtime: { sendMessage: async () => {} } };
  globalThis.caches = {
    open: async () => { throw new DOMException("Unexpected internal error.", "UnknownError"); },
  };
  const { prepareSiteIcons } = await import("../src/lib/site-icon-cache.js");

  const items = [
    { id: "a", type: "link", name: "GitHub", url: "https://github.com/", iconMode: "auto" },
    { id: "f", type: "folder", name: "设计", children: [{ id: "b", type: "link", name: "Figma", url: "https://figma.com/", iconMode: "auto" }] },
  ];

  const prepared = await prepareSiteIcons(items);
  assert.equal(prepared.length, 2, "every top-level item survives");
  assert.equal(prepared[0].name, "GitHub");
  assert.equal(prepared[1].children.length, 1, "folder contents survive too");
  // No artwork resolved, which is the acceptable half of the failure.
  assert.equal(prepared[0]._iconUrl, null);
});

test("one unreadable entry does not cost the other tiles their icons", async () => {
  const blob = { size: 3, type: "image/png" };
  let call = 0;
  globalThis.chrome = { runtime: { sendMessage: async () => {} } };
  globalThis.caches = {
    open: async () => ({
      match: async () => {
        call += 1;
        if (call === 1) throw new Error("entry is corrupt");
        return { blob: async () => blob, headers: { get: () => null } };
      },
    }),
  };
  globalThis.URL.createObjectURL = () => "blob:fake";
  const { prepareSiteIcons } = await import("../src/lib/site-icon-cache.js?entry-failure");

  const items = [
    { id: "a", type: "link", name: "A", url: "https://a.test/", iconMode: "auto" },
    { id: "b", type: "link", name: "B", url: "https://b.test/", iconMode: "auto" },
  ];
  const prepared = await prepareSiteIcons(items);
  assert.equal(prepared.length, 2);
  assert.ok(prepared.some((item) => item._iconUrl === "blob:fake"), "the readable entry still resolves");
});
