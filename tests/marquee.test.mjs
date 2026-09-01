import test from "node:test";
import assert from "node:assert/strict";
import { bandRect, bandStarted, BAND_THRESHOLD_PX, pruneSelection, tileBox, tilesInBand } from "../src/lib/marquee.js";
import { applyPlan, DROP_MERGE, DROP_REORDER, planDrop } from "../src/lib/drag-plan.js";

// The real grid: 120px cells in a row, each holding a 60px icon inset 30px across and 15px down.
const cellAt = (column, row) => ({ left: column * 120, top: row * 120, width: 120, height: 120 });
const tile = (id, column, row = 0, type = "link") => {
  const cell = cellAt(column, row);
  return { id, type, cell, icon: { left: cell.left + 30, top: cell.top + 15, width: 60, height: 60 } };
};
const grid = [tile("a", 0), tile("b", 1), tile("c", 2), tile("d", 0, 1)];
const drag = (origin, point) => bandRect(origin, point);

const link = (id) => ({ id, type: "link", name: id, url: `https://${id}.test/` });
const folder = (id, children) => ({ id, type: "folder", name: id, children });

test("a band has to travel before it is a band", () => {
  const origin = { x: 100, y: 100 };
  assert.equal(bandStarted(origin, { x: 104, y: 104 }), false);
  assert.equal(bandStarted(origin, { x: 100 + BAND_THRESHOLD_PX, y: 100 }), true);
  assert.equal(bandStarted(null, { x: 999, y: 999 }), false);
  // Without the threshold, every click on the wallpaper would open and close a zero-pixel
  // rectangle — and a click that lands on nothing already has a job: it clears the selection.
  assert.deepEqual(bandRect(origin, origin), { left: 100, top: 100, width: 0, height: 0 });
});

test("the band normalises whichever way it was dragged", () => {
  const expected = { left: 20, top: 30, width: 80, height: 60 };
  assert.deepEqual(bandRect({ x: 20, y: 30 }, { x: 100, y: 90 }), expected);
  assert.deepEqual(bandRect({ x: 100, y: 90 }, { x: 20, y: 30 }), expected);
  assert.deepEqual(bandRect({ x: 20, y: 90 }, { x: 100, y: 30 }), expected);
  assert.deepEqual(bandRect({ x: 100, y: 30 }, { x: 20, y: 90 }), expected);
});

// What the band may touch is the artwork and the caption under it, never the whole cell. A cell
// is 120px wide around a 60px icon, and those 30px of padding on each side are gutter: catching
// them would mean a band drawn cleanly between two columns selects both of them.
test("a band drawn down the gutter selects nothing", () => {
  // Icon "a" ends at x=90, icon "b" begins at x=150. This band lives entirely between them.
  assert.deepEqual(tilesInBand(grid, drag({ x: 95, y: 10 }, { x: 145, y: 110 })), []);
  // One pixel into the artwork is a hit, so the gutter rule costs nothing in reach.
  assert.deepEqual(tilesInBand(grid, drag({ x: 89, y: 40 }, { x: 145, y: 60 })), ["a"]);
  // Icon "c" starts at x=270, so a band stopping at 260 is still in the gutter before it.
  assert.deepEqual(tilesInBand(grid, drag({ x: 10, y: 40 }, { x: 260, y: 60 })), ["a", "b"]);
  assert.deepEqual(tilesInBand(grid, drag({ x: 10, y: 40 }, { x: 280, y: 60 })), ["a", "b", "c"]);
});

test("the caption belongs to its tile, and the row below does not", () => {
  const box = tileBox(grid[0]);
  // Top of the artwork down to the bottom of the cell: 15 -> 120.
  assert.deepEqual([box.top, box.top + box.height], [15, 120]);
  // A band across the captions of row 0 catches row 0 and leaves row 1 alone.
  assert.deepEqual(tilesInBand(grid, drag({ x: 10, y: 100 }, { x: 400, y: 118 })), ["a", "b", "c"]);
  assert.deepEqual(tilesInBand(grid, drag({ x: 10, y: 130 }, { x: 400, y: 200 })), ["d"]);
});

test("a section heading is never swept up by a band", () => {
  const withHeading = [...grid, { ...tile("s", 3), type: "section" }];
  assert.deepEqual(tilesInBand(withHeading, drag({ x: 0, y: 0 }, { x: 900, y: 900 })), ["a", "b", "c", "d"]);
});

// Ids only mean anything while the items behind them exist. A link that was deleted, swallowed by
// a folder or replaced by an import leaves a stale id in the set, and a stale id would quietly
// widen the next drag to include something that is not there.
test("a selection cannot outlive the tiles in it", () => {
  const items = [link("a"), folder("f", [link("b")])];
  assert.deepEqual([...pruneSelection(new Set(["a", "b", "gone"]), items)], ["a"]);
  // Unchanged selections come back by reference, so this can run on every save without
  // re-rendering the entire grid.
  const intact = new Set(["a"]);
  assert.equal(pruneSelection(intact, items), intact);
  assert.equal(pruneSelection(new Set(), items).size, 0);
});

test("a drag never offers a tile it is already carrying as a target", () => {
  const carrying = { sourceId: "a", sourceIds: ["a", "b"], sourceType: "link" };
  // Dead centre of b's icon. Alone it would be a merge target; as a passenger it is not a target
  // at all, and the plan falls through to the next nearest tile.
  const plan = planDrop({ x: 180, y: 45 }, grid, carrying);
  assert.notEqual(plan.targetId, "a");
  assert.notEqual(plan.targetId, "b");
});

test("a band of tiles moves as one, in the order the grid had them", () => {
  const items = [link("a"), link("b"), link("c"), link("d")];
  // Selected c and a, dropped after d. They arrive as a, c — grid order, not click order.
  const moved = applyPlan(items, { kind: DROP_REORDER, targetId: "d", side: "after" },
    { sourceId: "c", sourceIds: ["c", "a"] });
  assert.deepEqual(moved.map((i) => i.id), ["b", "d", "a", "c"]);

  // Dropping onto a member of the band is not a move, it is a paradox.
  assert.equal(applyPlan(items, { kind: DROP_REORDER, targetId: "a", side: "after" },
    { sourceId: "c", sourceIds: ["c", "a"] }), items);
});

test("a band merged onto a tile takes all of them into the folder", () => {
  const items = [link("a"), link("b"), link("c"), folder("f", [link("x")])];

  const born = applyPlan(items, { kind: DROP_MERGE, targetId: "c", side: null },
    { sourceId: "a", sourceIds: ["a", "b"], makeFolderId: () => "new" });
  assert.deepEqual(born.map((i) => i.id), ["new", "f"]);
  assert.deepEqual(born[0].children.map((i) => i.id), ["c", "a", "b"]);

  const grown = applyPlan(items, { kind: DROP_MERGE, targetId: "f", side: null },
    { sourceId: "a", sourceIds: ["a", "b"] });
  assert.deepEqual(grown.find((i) => i.id === "f").children.map((i) => i.id), ["x", "a", "b"]);

  // A folder cannot go inside a folder, so one unmergeable passenger makes the whole gesture a
  // reorder rather than half a merge.
  const mixed = applyPlan(items, { kind: DROP_MERGE, targetId: "c", side: null },
    { sourceId: "a", sourceIds: ["a", "f"], makeFolderId: () => "new" });
  assert.deepEqual(mixed.map((i) => i.id), ["b", "c", "a", "f"]);
});
