import test from "node:test";
import assert from "node:assert/strict";
import { collapseThinFolders } from "../src/lib/shortcuts-tree.js";

const link = (id) => ({ id, type: "link", name: id, url: `https://${id}.test/` });
const folder = (id, children) => ({ id, type: "folder", name: id, children });

test("a folder down to its last link becomes that link again", () => {
  const next = collapseThinFolders([link("a"), folder("f", [link("b")]), link("c")]);
  assert.deepEqual(next.map((i) => i.id), ["a", "b", "c"]);
  // The surviving link is the child itself, not a renamed folder.
  assert.equal(next[1].type, "link");
});

test("an emptied folder disappears entirely", () => {
  assert.deepEqual(collapseThinFolders([link("a"), folder("f", [])]).map((i) => i.id), ["a"]);
  assert.deepEqual(collapseThinFolders([folder("f", undefined)]), []);
});

test("folders with two or more links are left alone, and order is preserved", () => {
  const items = [link("a"), folder("f", [link("b"), link("c")]), link("d")];
  assert.deepEqual(collapseThinFolders(items).map((i) => i.id), ["a", "f", "d"]);
});

// A custom icon's bytes live in Cache Storage, which an export file cannot carry — but the
// *choice* is part of the link and has to survive the round trip, or re-importing a backup on the
// same machine silently reverts every picture the user picked.
test("a custom icon mode survives export and import", async () => {
  const { cleanForExport, validateShortcutPayload } = await import("../src/lib/shortcuts-file.js");
  const exported = cleanForExport([
    { id: "1", type: "link", name: "AppNew", url: "http://10.0.0.1:8080/", iconMode: "custom" },
    { id: "2", type: "link", name: "Code", url: "http://10.0.0.2:8080/", iconMode: "auto" },
    { id: "3", type: "link", name: "Wiki", url: "http://10.0.0.3:8080/", iconMode: "generated" },
  ]);
  assert.deepEqual(exported.map((item) => item.iconMode), ["custom", "auto", "generated"]);
  const imported = validateShortcutPayload(exported);
  assert.deepEqual(imported.map((item) => item.iconMode), ["custom", "auto", "generated"]);
});

// A file written by a newer version must still import into an older one, so an unknown mode is
// read as "auto" rather than refused — the link matters, the icon does not.
test("an unknown icon mode imports as auto instead of failing", async () => {
  const { validateShortcutPayload } = await import("../src/lib/shortcuts-file.js");
  const [item] = validateShortcutPayload([{ type: "link", name: "X", url: "https://x.test/", iconMode: "hologram" }]);
  assert.equal(item.iconMode, "auto");
});

// The single path that ignores the cache and refetches everything. It runs after the user grants
// site access, and without this exemption it would fetch straight over the top of every picture
// they had chosen — the one way a custom icon can be lost without anyone asking for it.
test("a forced icon refresh leaves custom icons alone", async () => {
  const calls = [];
  globalThis.chrome = {
    runtime: { sendMessage: async (message) => { calls.push(message); } },
  };
  try {
    const { refreshSiteIcons } = await import("../src/lib/site-icon-cache.js");
    await refreshSiteIcons([
      { id: "1", type: "link", name: "A", url: "https://a.test/", iconMode: "auto" },
      { id: "2", type: "link", name: "B", url: "https://b.test/", iconMode: "custom" },
      { id: "3", type: "link", name: "C", url: "https://c.test/", iconMode: "generated" },
    ]);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].sites.map((site) => site.id), ["1"], "only the auto link may be refetched");
  } finally {
    delete globalThis.chrome;
  }
});
