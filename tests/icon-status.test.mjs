import test from "node:test";
import assert from "node:assert/strict";
import { iconStatus, iconSummary } from "../src/lib/icon-status.js";

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

test("the summary leads with the total, because it frames the other two numbers", () => {
  assert.equal(iconSummary({ total: 53, resolved: 44, missing: 9 }), "共 53 个链接：44 个使用网站图标，9 个使用字母图标");
});

test("one-sided grids collapse to a single clause instead of stating a zero", () => {
  // "0 个使用字母图标" reads like a fault report for what is the best possible outcome.
  assert.equal(iconSummary({ total: 20, resolved: 20, missing: 0 }), "共 20 个链接，全部使用网站图标");
  assert.equal(iconSummary({ total: 20, resolved: 0, missing: 20 }), "共 20 个链接，全部使用字母图标");
});

test("an empty grid says nothing at all", () => {
  assert.equal(iconSummary({ total: 0, resolved: 0, missing: 0 }), "");
});
