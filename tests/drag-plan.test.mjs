import test from "node:test";
import assert from "node:assert/strict";
import { applyDrop, DROP_MERGE, DROP_REORDER, isInside, planDrop, pointerAt } from "../src/lib/drag-plan.js";

// A 120px cell with its 60px icon centred horizontally, 15px down — the real grid geometry.
const icon = (cellLeft, cellTop = 0) => ({ left: cellLeft + 30, top: cellTop + 15, width: 60, height: 60 });
const link = (id) => ({ id, type: "link", name: id, url: `https://${id}.test/` });
const folder = (id, children) => ({ id, type: "folder", name: id, children });

test("pointer position is the activator plus the running delta", () => {
  assert.deepEqual(pointerAt({ clientX: 100, clientY: 50 }, { x: 30, y: -10 }), { x: 130, y: 40 });
  assert.equal(pointerAt(undefined, { x: 1, y: 1 }), null);
});

test("the icon decides a merge; the gutter beside it decides a reorder", () => {
  const target = icon(0);
  const base = { sourceType: "link", targetType: "link", targetIconRect: target };
  // Dead centre of the artwork — unambiguously "into this one".
  assert.equal(planDrop({ ...base, point: { x: 60, y: 45 } }), DROP_MERGE);
  // In the cell but left of the icon: the gap that means "slot in beside it". This is the case
  // the old hold-timer got wrong, because pausing here still armed a merge.
  assert.equal(planDrop({ ...base, point: { x: 10, y: 45 } }), DROP_REORDER);
  // Below the icon, where the label sits.
  assert.equal(planDrop({ ...base, point: { x: 60, y: 100 } }), DROP_REORDER);
});

test("only links merge, and folders never nest", () => {
  const target = icon(0);
  const onIcon = { x: 60, y: 45 };
  assert.equal(planDrop({ point: onIcon, sourceType: "link", targetType: "folder", targetIconRect: target }), DROP_MERGE);
  assert.equal(planDrop({ point: onIcon, sourceType: "folder", targetType: "folder", targetIconRect: target }), DROP_REORDER);
  assert.equal(planDrop({ point: onIcon, sourceType: "folder", targetType: "link", targetIconRect: target }), DROP_REORDER);
});

test("a missing rect never merges by accident", () => {
  assert.equal(planDrop({ point: { x: 0, y: 0 }, sourceType: "link", targetType: "link", targetIconRect: null }), DROP_REORDER);
  assert.equal(isInside(null, icon(0)), false);
});

test("reorder moves the tile to the target's place, in either direction", () => {
  const items = [link("a"), link("b"), link("c"), link("d")];
  const opts = { plan: DROP_REORDER, makeFolderId: () => "new" };
  assert.deepEqual(
    applyDrop(items, { ...opts, sourceId: "a", targetId: "c" }).map((i) => i.id),
    ["b", "c", "a", "d"],
  );
  assert.deepEqual(
    applyDrop(items, { ...opts, sourceId: "d", targetId: "b" }).map((i) => i.id),
    ["a", "d", "b", "c"],
  );
});

test("merging a link onto a link makes a folder; onto a folder it joins", () => {
  const items = [link("a"), link("b"), folder("f", [link("x")])];
  const made = applyDrop(items, { plan: DROP_MERGE, sourceId: "a", targetId: "b", makeFolderId: () => "new" });
  assert.deepEqual(made.map((i) => i.id), ["new", "f"]);
  assert.deepEqual(made[0].children.map((i) => i.id), ["b", "a"]);

  const joined = applyDrop(items, { plan: DROP_MERGE, sourceId: "a", targetId: "f", makeFolderId: () => "new" });
  assert.deepEqual(joined.map((i) => i.id), ["b", "f"]);
  assert.deepEqual(joined[1].children.map((i) => i.id), ["x", "a"]);
});

test("dropping a tile on itself changes nothing", () => {
  const items = [link("a"), link("b")];
  assert.equal(applyDrop(items, { plan: DROP_MERGE, sourceId: "a", targetId: "a", makeFolderId: () => "new" }), items);
});
