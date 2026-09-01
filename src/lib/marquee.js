// Rubber-band selection over the grid.
//
// The geometry here is the same deal the rest of the drag system makes: cells are measured once,
// when the band starts, and nothing about the layout is allowed to change while it is being
// dragged. So this file is pure — two points in, a set of ids out — and the whole behaviour can
// be asserted without a pointer or a DOM.
//
// A band has to travel before it is a band at all. Without that, every click on the wallpaper
// would open and close a zero-pixel rectangle, and a click that lands on nothing has a real job
// already: it clears the selection.
export const BAND_THRESHOLD_PX = 6;

export function bandRect(origin, point) {
  if (!origin || !point) return null;
  return {
    left: Math.min(origin.x, point.x),
    top: Math.min(origin.y, point.y),
    width: Math.abs(point.x - origin.x),
    height: Math.abs(point.y - origin.y),
  };
}

export function bandStarted(origin, point) {
  const rect = bandRect(origin, point);
  return Boolean(rect) && Math.max(rect.width, rect.height) >= BAND_THRESHOLD_PX;
}

function overlaps(box, rect) {
  return box.left < rect.left + rect.width && box.left + box.width > rect.left
    && box.top < rect.top + rect.height && box.top + box.height > rect.top;
}

// What the band is allowed to touch is the artwork and the caption under it, not the whole cell.
// A cell is 120px wide holding a 60px icon, and the 30px of padding on each side belongs to the
// gutter — catching it would mean a band drawn cleanly between two columns selects both of them.
// Vertically the opposite is true: the caption is part of the tile as far as anyone looking at
// it is concerned, so the box runs from the top of the icon to the bottom of the cell.
export function tileBox(cell) {
  const icon = cell.icon ?? cell.cell;
  return {
    left: icon.left,
    top: icon.top,
    width: icon.width,
    height: Math.max(icon.height, cell.cell.top + cell.cell.height - icon.top),
  };
}

export function tilesInBand(cells = [], rect) {
  if (!rect) return [];
  return cells
    .filter((cell) => cell.type !== "section" && overlaps(tileBox(cell), rect))
    .map((cell) => cell.id);
}

// Selections survive edits only as far as the ids do. Anything deleted, folded into a folder or
// imported over is simply gone, and a stale id in the set would quietly widen the next drag.
export function pruneSelection(selection, items = []) {
  if (!selection?.size) return selection;
  const live = new Set(items.map((item) => item.id));
  const next = new Set([...selection].filter((id) => live.has(id)));
  return next.size === selection.size ? selection : next;
}
