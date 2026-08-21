import test from "node:test";
import assert from "node:assert/strict";
import { iconStatus } from "../src/lib/icon-status.js";

const link = (id, extra) => ({ id, type: "link", name: id, url: `https://${id}.test/`, iconMode: "auto", ...extra });

test("counts links that ended up on a letter tile as missing", () => {
  const status = iconStatus([
    link("a", { _iconUrl: "blob:1" }),
    link("b", { _iconUrl: null }),
    link("c"),
  ]);
  assert.deepEqual(status, { total: 3, resolved: 1, missing: 2 });
});

test("a link set to a letter tile on purpose is not a missing icon", () => {
  // Otherwise the reading would never reach 100% for anyone who customised a tile, and a real
  // outage would be indistinguishable from a preference.
  const status = iconStatus([link("a", { _iconUrl: "blob:1" }), link("b", { iconMode: "generated" })]);
  assert.deepEqual(status, { total: 1, resolved: 1, missing: 0 });
});

test("links inside folders are counted too", () => {
  const status = iconStatus([
    link("a", { _iconUrl: "blob:1" }),
    { id: "f", type: "folder", name: "设计", children: [link("b"), link("c", { _iconUrl: "blob:2" })] },
  ]);
  assert.deepEqual(status, { total: 3, resolved: 2, missing: 1 });
});

test("an empty grid reports nothing rather than dividing by zero", () => {
  assert.deepEqual(iconStatus([]), { total: 0, resolved: 0, missing: 0 });
  assert.deepEqual(iconStatus([{ id: "f", type: "folder", name: "空", children: [] }]), { total: 0, resolved: 0, missing: 0 });
});
