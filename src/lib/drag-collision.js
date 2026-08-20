import { closestCenter } from "@dnd-kit/core";

// Collision strategy for the shortcut grid.
//
// Reordering uses closestCenter, which is what dnd-kit documents for sortable lists. pointerWithin
// was tried first and is wrong here: it resolves against dnd-kit's measured rects, and those rects
// move while the sortable animates tiles into their new slots. The pointer then falls inside a
// different tile, `over` flips, the grid animates again — a feedback loop that kept the row
// shuffling even with the pointer held perfectly still. closestCenter compares distances between
// centres, which changes smoothly and settles.
//
// Merging is not decided here at all. It is answered against the live DOM (see mergeTargetAt),
// because the only thing that matters is which icon is under the cursor on screen.
export function createCollisionStrategy(lastOverId, isOverMergeTarget) {
  return (args) => {
    // Reporting no collision freezes SortableContext: with no `over`, nothing shifts. While the
    // pointer rests on a tile's artwork the grid holds still and the ring is the only thing that
    // changes, so the target stays put long enough to actually hit it. Without this the reorder
    // preview slid the target out from under the cursor as it approached.
    if (isOverMergeTarget?.(args.pointerCoordinates)) {
      lastOverId.current = null;
      return [];
    }
    const collisions = closestCenter(args);
    if (collisions.length > 0) {
      lastOverId.current = collisions[0].id;
      return collisions;
    }
    // Holding the last target means releasing over a gutter still lands somewhere sensible rather
    // than silently cancelling the drag.
    return lastOverId.current ? [{ id: lastOverId.current }] : [];
  };
}
