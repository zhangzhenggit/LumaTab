import { useLayoutEffect, useRef } from "react";

// The one frame the drag system deliberately left unanimated.
//
// The grid does not move while a drag is in flight — that is load-bearing, and drag-plan.js
// explains at length why. But it left the commit itself instantaneous: the array reorders, React
// repaints, and every affected tile is simply somewhere else. What was missing is not a preview
// during the drag, it is a transition *after* it.
//
// FLIP gives exactly that and nothing more. The layout happens normally and instantly; then each
// tile is measured, pulled back to where it used to be with a transform, and released. Nothing
// about the geometry the drop was decided from is touched, because all of this runs after the
// decision has already been applied.
const DURATION = 260;
const EASING = "cubic-bezier(.2, .8, .2, 1)";
// Below this a tile has not really moved — a sub-pixel reflow, a scrollbar appearing — and
// animating it only adds a flicker.
const MIN_TRAVEL_PX = 0.5;

function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// `releaseRef` carries the dragged tile's rect at the instant the pointer let go, handed over by
// useShortcuts. It matters because that tile is the one exception to "animate from your old
// cell": its old cell is not where the user last saw it. The ghost was under the cursor, so the
// tile flies home from there and the hand-off is invisible. Everything else starts from the cell
// it was sitting in.
export function useTileFlip(items, releaseRef) {
  const previous = useRef(new Map());

  useLayoutEffect(() => {
    const nodes = document.querySelectorAll(".shortcut-grid [data-tile-id]");
    const current = new Map();
    const released = releaseRef.current;
    releaseRef.current = null;
    const still = prefersReducedMotion();

    nodes.forEach((node) => {
      const id = node.dataset.tileId;
      const last = node.getBoundingClientRect();
      current.set(id, last);
      if (still) return;

      const first = released?.id === id ? released.rect : previous.current.get(id);
      if (!first) return;
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (Math.abs(dx) < MIN_TRAVEL_PX && Math.abs(dy) < MIN_TRAVEL_PX) return;

      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: DURATION, easing: EASING },
      );
    });

    previous.current = current;
  }, [items, releaseRef]);
}
