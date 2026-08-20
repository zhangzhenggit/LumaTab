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
