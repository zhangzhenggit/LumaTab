// What a drag will do when it is released, decided purely from geometry against a grid that does
// not move while the drag is in flight.
//
// Two earlier designs failed, and both failed for the same reason: the thing being aimed at kept
// moving. dnd-kit's sortable animates every tile into a preview of the new order on each pointer
// move, so approaching a folder shoved that folder aside. Suppressing the preview while the
// pointer sat on an icon was worse: reporting no collision makes `over` null, and a null `over`
// collapses the whole preview back to the original layout in one frame. The entire grid jumped,
// a different tile landed under the cursor, the preview switched straight back on, and the two
// states flip-flopped. That feedback loop is what "乱跳" was, and no amount of tuning removes it
// while the layout reacts to the pointer.
//
// So the grid previews nothing. Tiles are measured once, at drag start, and stay exactly where
// they are until the drop is committed. Every frame then answers one question from fixed numbers:
//
//     ┌──────────────┐   pointer on the icon    → drop into it       (merge: ring on the target)
//     │  ┌────────┐  │   pointer anywhere else  → slot in beside it  (reorder: caret in the gap)
//     │  │  icon  │  │
//     │  └────────┘  │   Nothing can slide out from under the cursor, because nothing slides.
//     └──────────────┘
export const DROP_MERGE = "merge";
export const DROP_REORDER = "reorder";

// The artwork is 60px inside a 120px cell. Growing the merge zone by 10px on every side makes it
// 80px — comfortably bigger than the pointer's own wobble — and still leaves a 40px-wide channel
// between neighbouring icons that belongs entirely to reordering, plus the whole label band below.
export const MERGE_PADDING = 10;

// dnd-kit reports the pointer once, at drag start, then a running delta.
export function pointerAt(activatorEvent, delta) {
  const x = activatorEvent?.clientX;
  const y = activatorEvent?.clientY;
  if (typeof x !== "number" || typeof y !== "number") return null;
  return { x: x + (delta?.x ?? 0), y: y + (delta?.y ?? 0) };
}

export function isInside(point, rect, pad = 0) {
  if (!point || !rect) return false;
  return point.x >= rect.left - pad && point.x <= rect.left + rect.width + pad
    && point.y >= rect.top - pad && point.y <= rect.top + rect.height + pad;
}

function centreGap(point, rect) {
  const dx = point.x - (rect.left + rect.width / 2);
  const dy = point.y - (rect.top + rect.height / 2);
  return dx * dx + dy * dy;
}

// `cells` is the drag-start snapshot: one entry per tile, each with the cell box and the artwork
// box inside it. The source tile is skipped — a tile is never its own target.
//
// The pointer is resolved to a cell even when it is nowhere near one (below the last row, out in
// the margin, over the "+" tile), by falling back to the closest cell centre. A drag released in
// empty space then still lands somewhere predictable instead of being silently thrown away.
export function planDrop(point, cells, { sourceId, sourceType }) {
  if (!point || !cells?.length) return null;
  const targets = cells.filter((cell) => cell.id !== sourceId);
  if (!targets.length) return null;

  const hit = targets.find((cell) => isInside(point, cell.cell))
    ?? targets.reduce((best, cell) => (centreGap(point, cell.cell) < centreGap(point, best.cell) ? cell : best));

  // Only a link can be merged, and folders never nest, so dragging a folder is always a reorder.
  const mergeable = sourceType === "link" && (hit.type === "link" || hit.type === "folder");
  if (mergeable && isInside(point, hit.icon, MERGE_PADDING)) {
    return { kind: DROP_MERGE, targetId: hit.id, side: null };
  }

  const middle = hit.cell.left + hit.cell.width / 2;
  return { kind: DROP_REORDER, targetId: hit.id, side: point.x < middle ? "before" : "after" };
}

export function samePlan(a, b) {
  if (a === b) return true;
  return Boolean(a && b) && a.kind === b.kind && a.targetId === b.targetId && a.side === b.side;
}

// Applies a completed drag. Kept out of the component so the outcome of every gesture can be
// asserted directly, without a DOM or a pointer.
export function applyPlan(items, plan, { sourceId, makeFolderId }) {
  if (!plan) return items;
  const source = items.find((item) => item.id === sourceId);
  const target = items.find((item) => item.id === plan.targetId);
  if (!source || !target || source === target) return items;

  const rest = items.filter((item) => item !== source);
  const at = rest.indexOf(target);

  if (plan.kind === DROP_MERGE && source.type === "link") {
    rest[at] = target.type === "folder"
      ? { ...target, children: [...(target.children ?? []), source] }
      : { id: makeFolderId(), type: "folder", name: target.name, children: [target, source] };
    return rest;
  }

  rest.splice(plan.side === "before" ? at : at + 1, 0, source);
  // Dropping into the gap the tile already occupies is a no-op; returning the original array
  // keeps it from counting as an edit and rewriting storage for nothing.
  return rest.every((item, index) => item === items[index]) ? items : rest;
}
