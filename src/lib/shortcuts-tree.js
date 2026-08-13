export function findItem(shortcuts, ref) {
  if (!ref) return null;
  if (ref.folderId) {
    return shortcuts.find((item) => item.id === ref.folderId)?.children?.find((item) => item.id === ref.itemId) ?? null;
  }
  return shortcuts.find((item) => item.id === ref.itemId) ?? null;
}
