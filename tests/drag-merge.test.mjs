import test from "node:test";
import assert from "node:assert/strict";
import { canMerge, hasSettled, MERGE_HOLD_MS, MOVE_TOLERANCE_PX, overlapRatio } from "../src/lib/drag-merge.js";

const tile = (left, top) => ({ left, top, width: 60, height: 60 });

test("overlap is measured against the target's own area", () => {
  assert.equal(overlapRatio(tile(0, 0), tile(0, 0)), 1);
  assert.equal(overlapRatio(tile(30, 0), tile(0, 0)), 0.5);
  assert.equal(overlapRatio(tile(60, 0), tile(0, 0)), 0);
  assert.equal(overlapRatio(null, tile(0, 0)), 0);
});

test("overlap only gates which pairs may merge, never decides that they do", () => {
  const target = tile(0, 0);
  const base = { sourceType: "link", targetType: "link", overRect: target };
  // Hovering the gap between tiles cannot arm a merge...
  assert.equal(canMerge({ ...base, activeRect: tile(45, 0) }), false);
  // ...but sitting on one only makes it *eligible*. Stillness is what actually merges, because
  // taking a neighbour's slot in a sortable grid also covers it almost completely — overlap
  // cannot tell "reorder here" and "merge with this" apart.
  assert.equal(canMerge({ ...base, activeRect: tile(10, 0) }), true);
});

test("a merge needs the pointer to come to rest", () => {
  assert.equal(hasSettled({ x: 100, y: 40 }, { x: 101, y: 41 }), true);
  assert.equal(hasSettled({ x: 100, y: 40 }, { x: 130, y: 40 }), false);
  // No previous sample means the drag just started; nothing has settled yet.
  assert.equal(hasSettled(null, { x: 0, y: 0 }), false);
  assert.ok(MOVE_TOLERANCE_PX > 0 && MERGE_HOLD_MS >= 400);
});

test("folders reorder like anything else and never swallow a passing tile", () => {
  const target = tile(0, 0);
  // Previously any drop whose nearest target was a folder merged unconditionally, so a folder
  // could not be moved past.
  assert.equal(canMerge({ sourceType: "link", targetType: "folder", activeRect: tile(45, 0), overRect: target }), false);
  assert.equal(canMerge({ sourceType: "link", targetType: "folder", activeRect: tile(5, 0), overRect: target }), true);
  // Dragging a folder is always a reorder; folders do not nest.
  assert.equal(canMerge({ sourceType: "folder", targetType: "link", activeRect: tile(0, 0), overRect: target }), false);
  assert.equal(canMerge({ sourceType: "folder", targetType: "folder", activeRect: tile(0, 0), overRect: target }), false);
});
