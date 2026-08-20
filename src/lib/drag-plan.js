// What a drag will do when released, decided purely from geometry.
//
// The previous implementation inferred intent from *time* — hover a tile long enough and it armed
// a merge. That never worked: every deliberate drop pauses over its destination, so the merge kept
// firing on drops meant as reorders, and once the timer was made stricter, hand tremor stopped it
// arming at all. Time is the wrong signal because it is invisible; the user cannot see a timer.
//
// Position is visible. A tile is 60px of artwork sitting in a 120px cell, so the cell already has
// two obvious regions, and they map exactly onto the two intentions:
//
//     ┌──────────────┐   pointer in the gutter  → slot in beside it   (reorder)
//     │  ┌────────┐  │   pointer on the icon    → drop into it        (merge)
//     │  │  icon  │  │
//     │  └────────┘  │   This is the same drop-on / drop-between split that file managers and
//     └──────────────┘   bookmark bars use, and it needs no delay: aim, see the ring, release.
export const DROP_REORDER = "reorder";
export const DROP_MERGE = "merge";
export const DROP_EXTRACT = "extract";

// dnd-kit reports the pointer only at drag start, then a running delta.
export function pointerAt(activatorEvent, delta) {
  const x = activatorEvent?.clientX;
  const y = activatorEvent?.clientY;
  if (typeof x !== "number" || typeof y !== "number") return null;
  return { x: x + (delta?.x ?? 0), y: y + (delta?.y ?? 0) };
}

export function isInside(point, rect) {
  if (!point || !rect) return false;
  return point.x >= rect.left && point.x <= rect.left + rect.width
    && point.y >= rect.top && point.y <= rect.top + rect.height;
}

// Which tile the pointer is *visually* over, and whether it is over that tile's artwork.
//
// This deliberately does not use dnd-kit's `over`. A sortable resolves `over` against the original
// slot layout, not the shifted positions on screen — that is how sorting works — so while tiles are
// displaced the two disagree by a whole cell. Aiming at a folder therefore reported the neighbour,
// and the merge ring lit on the wrong tile or not at all. Hit-testing the live DOM answers the
// question the user is actually asking: what is under my cursor right now.
//
// `resolveStack` is injected so the decision stays testable without a document.
export function mergeTargetAt(point, { sourceId, resolveStack }) {
  if (!point) return null;
  for (const entry of resolveStack(point) ?? []) {
    if (!entry || entry.id === sourceId) continue;
    return isInside(point, entry.iconRect) ? entry.id : null;
  }
  return null;
}

// Only a link can be merged: dragging a folder is always a reorder, because folders do not nest.
export function planDrop({ point, sourceType, targetType, targetIconRect }) {
  if (sourceType !== "link") return DROP_REORDER;
  if (targetType !== "link" && targetType !== "folder") return DROP_REORDER;
  return isInside(point, targetIconRect) ? DROP_MERGE : DROP_REORDER;
}

// Applies a completed drag to the grid. Kept out of the component so the outcome of every gesture
// can be asserted directly, without a DOM or a pointer.
export function applyDrop(items, { plan, sourceId, targetId, makeFolderId }) {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceId === targetId) return items;

  const source = items[sourceIndex];
  const target = items[targetIndex];
  if (plan !== DROP_MERGE || source.type !== "link") {
    const next = [...items];
    next.splice(sourceIndex, 1);
    next.splice(next.findIndex((item) => item.id === targetId) + (targetIndex > sourceIndex ? 1 : 0), 0, source);
    return next;
  }

  const next = items.filter((item) => item.id !== sourceId);
  const at = next.findIndex((item) => item.id === targetId);
  next[at] = target.type === "folder"
    ? { ...target, children: [...(target.children ?? []), source] }
    : { id: makeFolderId(), type: "folder", name: target.name, children: [target, source] };
  return next;
}
