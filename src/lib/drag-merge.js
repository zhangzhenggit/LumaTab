// Decides whether a drag is a reorder or a merge.
//
// Overlap alone cannot tell these apart: in a sortable grid, taking a neighbour's slot means
// covering that neighbour almost completely, which is exactly what dropping onto it to merge
// looks like too. The discriminator has to be intent, and intent reads as *stillness* — the
// gesture iOS uses. So: sweep across tiles and they shift out of the way (reorder); stop dead on
// one and it opens up (merge).
//
// The original code had the hold timer but never reset it on movement, and armed it only when the
// target changed. Every deliberate drop pauses over its destination for longer than the hold, so
// the merge armed itself on the final target nearly every time and reordering became impossible.
export const MERGE_HOLD_MS = 600;
// Below this the pointer counts as parked; a real drag moves far more than this between events.
export const MOVE_TOLERANCE_PX = 4;
// Guards against arming while hovering the gap between two tiles rather than a tile itself.
const MERGE_OVERLAP = 0.5;

export function overlapRatio(activeRect, overRect) {
  if (!activeRect || !overRect) return 0;
  const width = Math.min(activeRect.left + activeRect.width, overRect.left + overRect.width)
    - Math.max(activeRect.left, overRect.left);
  const height = Math.min(activeRect.top + activeRect.height, overRect.top + overRect.height)
    - Math.max(activeRect.top, overRect.top);
  if (width <= 0 || height <= 0) return 0;
  const area = overRect.width * overRect.height;
  return area > 0 ? (width * height) / area : 0;
}

// Whether this pair may merge at all, before the hold is considered. Only links merge: dragging a
// folder is always a reorder, since folders do not nest.
export function canMerge({ sourceType, targetType, activeRect, overRect }) {
  if (sourceType !== "link") return false;
  if (targetType !== "link" && targetType !== "folder") return false;
  return overlapRatio(activeRect, overRect) >= MERGE_OVERLAP;
}

export function hasSettled(previous, next) {
  if (!previous) return false;
  return Math.abs(next.x - previous.x) + Math.abs(next.y - previous.y) <= MOVE_TOLERANCE_PX;
}
