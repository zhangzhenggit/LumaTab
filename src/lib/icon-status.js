// How many of the grid's links are actually showing site artwork.
//
// This exists because the failure it reports was invisible. When the icon cache and its failure
// list drifted apart, every tile silently fell back to a letter: no error, no console entry the
// user would ever see, nothing on the page. The only way to notice was to remember what the grid
// used to look like, and the only way to recover was to uninstall the extension. The worker was
// already counting all of this — it just had no way to reach anyone.
//
// Counted from what is on screen rather than from the worker's last run, so it stays true after a
// reload, when no run happens at all because everything is already cached.
export function iconStatus(items) {
  let total = 0;
  let resolved = 0;
  const visit = (list) => {
    for (const item of list) {
      if (item.type === "folder") { visit(item.children ?? []); continue; }
      // A link set to a letter tile on purpose is not a missing icon.
      if (item.iconMode === "generated") continue;
      total += 1;
      if (item._iconUrl) resolved += 1;
    }
  };
  visit(items);
  return { total, resolved, missing: total - resolved };
}
