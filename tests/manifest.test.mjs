import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"));

// The store rejects a version it has already seen, so a forgotten bump is not a cosmetic slip —
// it is an upload that fails at the last step, after the review queue has already been joined.
// The two files are bumped by hand and sit far apart, which is exactly how they drift.
test("the manifest and package versions are the same, and look like a version", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.version, pkg.version, "manifest.json and package.json disagree on the version");
  // Chrome accepts one to four dot-separated integers, each 0–65535, with no leading zeros.
  assert.match(manifest.version, /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/);
});

// The install prompt is the first thing a store visitor sees. Asking for every site up front on a
// new tab page is the scariest prompt Chrome shows, and it lengthens review; broad access is
// therefore optional and requested from Settings when the user actually wants sharp icons.
test("only bing.com is required at install; site access stays optional", () => {
  assert.deepEqual(manifest.host_permissions, ["https://www.bing.com/*"]);
  assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
  assert.deepEqual(manifest.permissions, ["storage", "favicon"]);
});

// Chrome matches permissions.request() against optional_host_permissions literally. A mismatch
// does not throw — the prompt simply never appears — so the two lists are pinned to each other.
test("the origins the code requests are the ones the manifest declares optional", async () => {
  const source = await readFile(new URL("../src/lib/site-access.js", import.meta.url), "utf8");
  for (const origin of manifest.optional_host_permissions) {
    assert.ok(source.includes(`"${origin}"`), `site-access.js must request ${origin}`);
  }
});

// Icons must keep working with the optional permission withheld, which is what `favicon` is for.
test("the favicon permission is present so a denied grant still shows icons", () => {
  assert.ok(manifest.permissions.includes("favicon"));
});

test("nothing bundles shortcut data any more", async () => {
  await assert.rejects(access(new URL("../public/data", import.meta.url)), "public/data must not come back");
  const hook = await readFile(new URL("../src/hooks/useShortcuts.js", import.meta.url), "utf8");
  assert.doesNotMatch(hook, /imported-shortcuts|loadDefaultShortcuts/);
  const storage = await readFile(new URL("../src/lib/storage.js", import.meta.url), "utf8");
  assert.doesNotMatch(storage, /fallback/);
});
