// A section is a marker sitting in the same flat array as the tiles, not a container holding
// them. That one choice is why this feature is small: the grid still measures one flat list of
// cells, planDrop still answers from icon centres, applyPlan still splices an array, storage
// still stores an array, and a file exported before sections existed is already a valid file
// with sections in it. Nothing migrates, and the storage key does not move.
//
// The leading section carries no marker at all. A grid that has never been divided is therefore
// byte for byte what it always was, and "this section has no heading" is not a special case
// bolted on afterwards — it is what the absence of a marker already means.
export const SECTION = "section";

export function isSection(item) {
  return item?.type === SECTION;
}

export function isLink(item) {
  return item?.type === "link";
}

// The flat array as render blocks. Each tile keeps the index it has in that array, because the
// entrance stagger counts by index and has to keep counting across a heading rather than
// restarting under every one — a grid of three sections would otherwise play the same short
// sweep three times over.
export function sectionsOf(items = []) {
  const blocks = [];
  let block = { marker: null, markerIndex: -1, tiles: [] };
  items.forEach((item, index) => {
    if (!isSection(item)) {
      block.tiles.push({ item, index });
      return;
    }
    // An unnamed block only exists if something is actually in it. Without this, a grid whose
    // very first entry is a marker would open with an empty headingless block above it.
    if (block.marker || block.tiles.length) blocks.push(block);
    block = { marker: item, markerIndex: index, tiles: [] };
  });
  blocks.push(block);
  return blocks;
}

// Folders hold links, sections hold nothing — they only mark where one run of tiles ends. So a
// count of links has to skip the markers rather than treat every non-folder as one link, which
// is how the import toast would otherwise start claiming more links than the file contains.
export function countLinks(items = []) {
  return items.reduce((total, item) => {
    if (item.type === "folder") return total + (item.children?.length ?? 0);
    return isLink(item) ? total + 1 : total;
  }, 0);
}

export function eachLink(items = [], visit) {
  for (const item of items) {
    if (item.type === "folder") eachLink(item.children ?? [], visit);
    else if (isLink(item)) visit(item);
  }
}

export const NEW_SECTION_NAME = "新分区";

export function appendSection(items = [], id, name = NEW_SECTION_NAME) {
  return [...items, { id, type: SECTION, name }];
}

// An empty name is a real answer, not a rejected one. Clearing a heading leaves the break itself
// — the tiles below it still start a new row — and takes the label away, which is the only way to
// divide a grid without also captioning it. An unnamed heading occupies no vertical space at all;
// see .section-heading--unnamed.
export function isNamed(section) {
  return Boolean(String(section?.name ?? "").trim());
}

export function renameSection(items = [], id, name) {
  const clean = String(name ?? "").trim();
  // Returning the original array when nothing changed keeps opening a heading for editing and
  // closing it again from counting as an edit and rewriting storage for nothing — the same guard
  // applyPlan makes for a drag that lands where it started.
  const current = items.find((item) => isSection(item) && item.id === id);
  if (!current || current.name === clean) return items;
  return items.map((item) => (item === current ? { ...item, name: clean } : item));
}

// Deleting a section deletes the line, never the links: everything under it joins the section
// above. That is what lets the whole feature ship with no confirmation dialog anywhere — there
// is no gesture in it that can lose a link.
export function removeSection(items = [], id) {
  return items.filter((item) => !(isSection(item) && item.id === id));
}

export function isCollapsed(section) {
  return isSection(section) && section.collapsed === true;
}

export function toggleCollapse(items = [], id) {
  return items.map((item) => (isSection(item) && item.id === id
    ? { ...item, collapsed: !item.collapsed }
    : item));
}

// A seam is the line between two blocks, numbered by the block that starts there — so seam k
// means "immediately above block k", and one extra seam past the end means "at the bottom".
//
// Seam 0 is only real when block 0 has a marker of its own. The leading block usually does not:
// it is whatever sits above the first heading, and dropping a section above it would put those
// tiles *under* the moved section's heading, quietly re-filing links the drag never touched.
export function firstMovableSeam(blocks = []) {
  return blocks[0]?.marker ? 0 : 1;
}

export function moveSection(items = [], id, atSeam) {
  const blocks = sectionsOf(items);
  const from = blocks.findIndex((block) => block.marker?.id === id);
  if (from < 0 || atSeam < firstMovableSeam(blocks)) return items;
  // Either seam of its own block is where it already is.
  if (atSeam === from || atSeam === from + 1) return items;

  const flat = blocks.map((block) => (block.marker
    ? [block.marker, ...block.tiles.map((tile) => tile.item)]
    : block.tiles.map((tile) => tile.item)));
  const [moved] = flat.splice(from, 1);
  flat.splice(atSeam > from ? atSeam - 1 : atSeam, 0, moved);
  return flat.flat();
}
