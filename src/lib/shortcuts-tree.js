export function findItem(shortcuts, ref) {
  if (!ref) return null;
  if (ref.folderId) {
    return shortcuts.find((item) => item.id === ref.folderId)?.children?.find((item) => item.id === ref.itemId) ?? null;
  }
  return shortcuts.find((item) => item.id === ref.itemId) ?? null;
}

// A folder holding one link is just that link wearing a costume: it costs an extra click, shows
// a 2x2 preview with three empty cells, and there is nothing left to group. Collapsing it back
// keeps the grid honest after a removal, and an empty folder disappears entirely.
export function collapseThinFolders(items) {
  return items.flatMap((item) => {
    if (item.type !== "folder") return [item];
    const children = item.children ?? [];
    if (children.length === 0) return [];
    if (children.length === 1) return [children[0]];
    return [item];
  });
}
