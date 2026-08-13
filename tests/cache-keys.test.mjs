import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";

test("icon and Bing cache keys use Cache Storage-compatible HTTPS URLs", async () => {
  const iconSource = await fs.readFile(new URL("../src/lib/site-icon-cache.js", import.meta.url), "utf8");
  const backgroundSource = await fs.readFile(new URL("../src/background/service-worker.js", import.meta.url), "utf8");
  assert.match(iconSource, /https:\/\/cache\.lumatab\.invalid\/site-icons\//);
  assert.match(backgroundSource, /https:\/\/cache\.lumatab\.invalid\//);
  assert.doesNotMatch(iconSource, /new Request\(chrome\.runtime\.getURL/);
  assert.doesNotMatch(backgroundSource, /new Request\(chrome\.runtime\.getURL/);
});

test("missing icon and manifest URLs are rejected instead of becoming /undefined", async () => {
  const source = await fs.readFile(new URL("../src/lib/icon-discovery.js", import.meta.url), "utf8");
  assert.match(source, /typeof value !== "string" \|\| !value\.trim\(\)/);
});
