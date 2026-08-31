import test from "node:test";
import assert from "node:assert/strict";
import { applyPlan, DROP_MERGE, DROP_REORDER, isInside, planDrop, pointerAt, samePlan } from "../src/lib/drag-plan.js";

// The real grid geometry: 120px cells in a row, each holding a 60px icon inset 30px across and
// 15px down. Every coordinate below is a real screen position in that layout.
const cellAt = (column, row = 0) => ({ left: column * 120, top: row * 120, width: 120, height: 120 });
const tile = (id, type, column, row = 0) => {
  const cell = cellAt(column, row);
  return { id, type, cell, icon: { left: cell.left + 30, top: cell.top + 15, width: 60, height: 60 } };
};
const link = (id) => ({ id, type: "link", name: id, url: `https://${id}.test/` });
const folder = (id, children) => ({ id, type: "folder", name: id, children });

const grid = [tile("a", "link", 0), tile("b", "folder", 1), tile("c", "link", 2)];
const dragging = (id) => ({ sourceId: id, sourceType: id === "b" ? "folder" : "link" });

test("pointer position is the activator plus the running delta", () => {
  assert.deepEqual(pointerAt({ clientX: 100, clientY: 50 }, { x: 30, y: -10 }), { x: 130, y: 40 });
  assert.equal(pointerAt(undefined, { x: 1, y: 1 }), null);
  assert.equal(planDrop(null, grid, dragging("a")), null);
  assert.equal(planDrop({ x: 0, y: 0 }, [], dragging("a")), null);
});

test("the icon decides a merge; everywhere else in the cell decides a reorder", () => {
  // Dead centre of the middle icon — unambiguously "into this one".
  assert.deepEqual(planDrop({ x: 180, y: 45 }, grid, dragging("a")), { kind: DROP_MERGE, targetId: "b", side: null });
  // Left of that icon, in the channel between two tiles.
  assert.deepEqual(planDrop({ x: 130, y: 45 }, grid, dragging("a")), { kind: DROP_REORDER, targetId: "b", side: "before" });
  // Below it, where the label sits.
  assert.deepEqual(planDrop({ x: 200, y: 100 }, grid, dragging("a")), { kind: DROP_REORDER, targetId: "b", side: "after" });
});

test("the merge zone is the icon plus a 10px margin, and no more", () => {
  // 5px outside the artwork still counts: hands shake, and a 60px target is small.
  assert.equal(planDrop({ x: 145, y: 45 }, grid, dragging("a")).kind, DROP_MERGE);
  // 15px outside does not, so the channel between icons stays reorder-only.
  assert.equal(planDrop({ x: 135, y: 45 }, grid, dragging("a")).kind, DROP_REORDER);
});

test("a tile is never its own target, and a folder never merges", () => {
  // Pointer on a's own icon: a is skipped, so the nearest other cell answers instead.
  assert.deepEqual(planDrop({ x: 60, y: 45 }, grid, dragging("a")), { kind: DROP_REORDER, targetId: "b", side: "before" });
  // Dragging the folder onto a link is a reorder: folders do not nest.
  assert.deepEqual(planDrop({ x: 290, y: 45 }, grid, dragging("b")), { kind: DROP_REORDER, targetId: "c", side: "before" });
});

test("rows split halfway between the artwork, not at the cell boundary", () => {
  // Two rows. Icon centres sit at y=45 and y=165, so the eye puts the split at y=105 — while the
  // cell boxes butt together at y=120, a full 45px below the top row's artwork. Dragging down off
  // a row used to still count as that row, and the caret drew one row too high.
  const rows = [tile("a", "link", 0, 0), tile("b", "link", 1, 0), tile("c", "link", 0, 1), tile("d", "link", 1, 1)];
  const held = { sourceId: "b", sourceType: "link" };
  assert.equal(planDrop({ x: 50, y: 100 }, rows, held).targetId, "a");
  assert.equal(planDrop({ x: 50, y: 112 }, rows, held).targetId, "c");
});

test("a drop in empty space falls back to the nearest cell instead of vanishing", () => {
  assert.deepEqual(planDrop({ x: 900, y: 400 }, grid, dragging("a")), { kind: DROP_REORDER, targetId: "c", side: "after" });
});

test("identical plans compare equal so the grid does not re-render every frame", () => {
  const point = { x: 180, y: 45 };
  assert.equal(samePlan(planDrop(point, grid, dragging("a")), planDrop(point, grid, dragging("a"))), true);
  assert.equal(samePlan(planDrop(point, grid, dragging("a")), null), false);
  assert.equal(samePlan(null, null), true);
  assert.equal(isInside(null, grid[0].icon), false);
});

test("reorder inserts on the side the pointer was on, in either direction", () => {
  const items = [link("a"), link("b"), link("c"), link("d")];
  const opts = { sourceId: "a", makeFolderId: () => "new" };
  assert.deepEqual(
    applyPlan(items, { kind: DROP_REORDER, targetId: "c", side: "after" }, opts).map((i) => i.id),
    ["b", "c", "a", "d"],
  );
  assert.deepEqual(
    applyPlan(items, { kind: DROP_REORDER, targetId: "b", side: "before" }, { ...opts, sourceId: "d" }).map((i) => i.id),
    ["a", "d", "b", "c"],
  );
});

test("dropping back into the gap it already occupies changes nothing", () => {
  const items = [link("a"), link("b"), link("c")];
  const opts = { sourceId: "a", makeFolderId: () => "new" };
  // Same array back, not a copy: an accidental nudge must not count as an edit.
  assert.equal(applyPlan(items, { kind: DROP_REORDER, targetId: "b", side: "before" }, opts), items);
  assert.equal(applyPlan(items, { kind: DROP_MERGE, targetId: "a", side: null }, opts), items);
  assert.equal(applyPlan(items, null, opts), items);
});

test("merging a link onto a link makes a folder; onto a folder it joins", () => {
  const items = [link("a"), link("b"), folder("f", [link("x")])];
  const made = applyPlan(items, { kind: DROP_MERGE, targetId: "b" }, { sourceId: "a", makeFolderId: () => "new" });
  assert.deepEqual(made.map((i) => i.id), ["new", "f"]);
  assert.deepEqual(made[0].children.map((i) => i.id), ["b", "a"]);

  const joined = applyPlan(items, { kind: DROP_MERGE, targetId: "f" }, { sourceId: "a", makeFolderId: () => "new" });
  assert.deepEqual(joined.map((i) => i.id), ["b", "f"]);
  assert.deepEqual(joined[1].children.map((i) => i.id), ["x", "a"]);
});

// The drop animation is a two-part hand-off and neither half is visible from the other's file, so
// this pins both ends of it.
//
// The grid still must not reflow during a drag — that is the whole architecture above — and the
// DragOverlay still must vanish instantly rather than flying the ghost back to where the drag
// began. What was added is the frame *after* the commit: useTileFlip animates every tile from
// where it was to where it now is, and the dragged tile is the one exception, starting from the
// rect dnd-kit reports at the moment the pointer let go. Lose that rect and the tile appears to
// teleport back to its old cell before sliding home, which is worse than no animation at all.
test("the drop hand-off keeps both of its halves", async () => {
  const read = async (name) => (await import("node:fs/promises"))
    .readFile(new URL(`../src/${name}`, import.meta.url), "utf8");

  const app = await read("App.jsx");
  assert.match(app, /dropAnimation=\{null\}/, "the ghost flies home again, over a grid that has already moved");

  const shortcuts = await read("hooks/useShortcuts.js");
  assert.match(shortcuts, /releaseRef\.current = \{[^}]*rect: event\.active\.rect\.current\?\.translated/,
    "the release rect is no longer recorded, so the dragged tile teleports before it slides");

  const flip = await read("hooks/useTileFlip.js");
  assert.match(flip, /useLayoutEffect/, "FLIP must measure before the browser paints");
  assert.match(flip, /prefers-reduced-motion/, "the drop animation ignores the reduced-motion setting");

  // A sorted preview would put back exactly the flip-flop that drag-plan.js exists to prevent.
  // Matched on the import rather than the identifier: both files name SortableContext and
  // useSortable in comments explaining why they are not used.
  const tile = await read("components/ShortcutTile.jsx");
  for (const [name, source] of [["App.jsx", app], ["ShortcutTile.jsx", tile]]) {
    assert.doesNotMatch(source, /from "@dnd-kit\/sortable"/, `${name} pulled the sortable preview back in`);
  }
});
