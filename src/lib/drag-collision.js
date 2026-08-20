import { closestCenter, pointerWithin, rectIntersection } from "@dnd-kit/core";

// Collision strategy, following dnd-kit's own MultipleContainers recipe.
//
// The default (rectIntersection) reports *every* droppable the dragged rect touches, and in a tight
// grid a 60px tile touches several at once. The winner then flips on sub-pixel movement, and since
// SortableContext reflows on every change of `over`, the whole grid twitched — which is what
// "一拖其他图标就乱跑" was.
//
// pointerWithin reports only what the pointer is actually inside, so there is exactly one answer
// and it changes only when the cursor crosses a real boundary. rectIntersection is the fallback for
// the moment the pointer leaves every tile (over a gutter), and the last known target is held
// rather than dropped, so letting go in a gap does not silently cancel the drag.
export function createCollisionStrategy(lastOverId) {
  return (args) => {
    const byPointer = pointerWithin(args);
    const collisions = byPointer.length > 0 ? byPointer : rectIntersection(args);
    if (collisions.length > 0) {
      // More than one only happens where droppables genuinely overlap (a tile inside the folder
      // panel over the panel's own exit zone); the nearest centre is the honest tie-break.
      const winner = collisions.length === 1
        ? collisions[0]
        : closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(
          (container) => collisions.some((collision) => collision.id === container.id),
        ) })[0] ?? collisions[0];
      lastOverId.current = winner.id;
      return [winner];
    }
    return lastOverId.current ? [{ id: lastOverId.current }] : [];
  };
}
