// One measurement of the grid, shared by the two things that aim at it: the drag, and the
// rubber band. They were separate copies of the same six lines for about an hour, which is
// exactly long enough for the two to start disagreeing about what counts as a cell.
//
// `types` maps id -> item type, and doubles as the filter: a node whose id is not in the current
// list is a tile React has not finished removing, and measuring it would put a target in the
// snapshot that no longer exists.
export function measureTiles(types) {
  const grid = document.querySelector(".shortcut-grid");
  return Array.from(grid?.querySelectorAll("[data-tile-id]") ?? [])
    .filter((node) => types.has(node.dataset.tileId))
    .map((node) => ({
      id: node.dataset.tileId,
      type: types.get(node.dataset.tileId),
      cell: node.getBoundingClientRect(),
      icon: node.querySelector(".shortcut__icon")?.getBoundingClientRect() ?? null,
    }));
}

export function typeMap(items = []) {
  return new Map(items.map((item) => [item.id, item.type]));
}
