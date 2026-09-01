import test from "node:test";
import assert from "node:assert/strict";
import {
  appendSection, countLinks, eachLink, firstMovableSeam, isCollapsed, isNamed, isSection,
  moveSection, NEW_SECTION_NAME, removeSection, renameSection, sectionsOf, toggleCollapse,
} from "../src/lib/sections.js";
import { applyPlan, DROP_MERGE, DROP_REORDER, planDrop } from "../src/lib/drag-plan.js";
import { validateShortcutPayload } from "../src/lib/shortcuts-file.js";

const link = (id) => ({ id, type: "link", name: id, url: `https://${id}.test/` });
const folder = (id, children) => ({ id, type: "folder", name: id, children });
const heading = (id, name = id) => ({ id, type: "section", name });

// The real grid geometry, same as drag-plan.test.mjs: 120px cells holding a 60px icon inset
// 30px across and 15px down.
const tile = (id, type, column, row = 0) => {
  const cell = { left: column * 120, top: row * 120, width: 120, height: 120 };
  return { id, type, cell, icon: { left: cell.left + 30, top: cell.top + 15, width: 60, height: 60 } };
};

// This is the compatibility guarantee, and it is structural rather than a special case: a grid
// with no markers in it produces exactly one block with no heading, which is the grid as it has
// always looked. Nothing migrates, and the storage key does not move — every install that
// upgrades into this feature is already holding valid data for it.
test("a grid that was never divided is one untitled section", () => {
  const items = [link("a"), folder("f", [link("b"), link("c")]), link("d")];
  const blocks = sectionsOf(items);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].marker, null);
  assert.deepEqual(blocks[0].tiles.map((t) => t.item.id), ["a", "f", "d"]);
  assert.deepEqual(sectionsOf([]), [{ marker: null, markerIndex: -1, tiles: [] }]);
});

test("a heading opens a block, and an empty one above it is not invented", () => {
  const leading = sectionsOf([heading("s1"), link("a"), heading("s2"), link("b")]);
  assert.deepEqual(leading.map((b) => b.marker?.id ?? null), ["s1", "s2"]);
  assert.deepEqual(leading.map((b) => b.tiles.map((t) => t.item.id)), [["a"], ["b"]]);

  const trailing = sectionsOf([link("a"), heading("s1"), link("b")]);
  assert.deepEqual(trailing.map((b) => b.marker?.id ?? null), [null, "s1"]);

  // A heading with nothing under it is a real block: it is what "新建分区" produces, and it has
  // to render so there is somewhere to drop the first link.
  const empty = sectionsOf([link("a"), heading("s1")]);
  assert.deepEqual(empty.map((b) => b.tiles.length), [1, 0]);
  assert.equal(empty[1].marker.id, "s1");
});

// The entrance stagger delays each tile by its index. If indices restarted under every heading,
// a grid of three sections would play the same short sweep three times at once instead of one
// sweep across the page.
test("tile indices keep counting across a heading", () => {
  const blocks = sectionsOf([link("a"), link("b"), heading("s"), link("c")]);
  assert.deepEqual(blocks.flatMap((b) => b.tiles.map((t) => t.index)), [0, 1, 3]);
  assert.equal(blocks[1].markerIndex, 2);
});

test("markers are not links, however the grid is counted", () => {
  const items = [link("a"), heading("s"), folder("f", [link("b"), link("c")])];
  assert.equal(countLinks(items), 3);
  const seen = [];
  eachLink(items, (l) => seen.push(l.id));
  assert.deepEqual(seen, ["a", "b", "c"]);
  assert.ok(isSection(heading("s")) && !isSection(link("a")));
});

// The whole reason a marker lives in the same flat array as the tiles: the boundary between two
// sections is a position in that array, so putting a link on either side of it is the ordinary
// reorder that already existed. There is no cross-section move to implement.
test("dropping either side of a heading picks the section the eye picked", () => {
  const items = [link("a"), heading("s"), link("b")];
  const after = applyPlan(items, { kind: DROP_REORDER, targetId: "a", side: "after" }, { sourceId: "b" });
  assert.deepEqual(after.map((i) => i.id), ["a", "b", "s"], "landed below the heading it was dropped above");

  const before = applyPlan(items, { kind: DROP_REORDER, targetId: "b", side: "before" }, { sourceId: "a" });
  assert.deepEqual(before.map((i) => i.id), ["s", "a", "b"], "landed above the heading it was dropped below");
});

// An empty section is aimed at through a placeholder carrying the marker's own id.
test("an empty section can be dropped into, and only inwards", () => {
  const cells = [tile("a", "link", 0), tile("s", "section", 0, 1)];

  // Dead centre of the placeholder. A tile there would be a merge; a marker can absorb nothing.
  const centre = planDrop({ x: 60, y: 165 }, cells, { sourceId: "a", sourceType: "link" });
  assert.deepEqual(centre, { kind: DROP_REORDER, targetId: "s", side: "after" });

  // The left half of a tile means "before it". On a marker that would mean the section *above*
  // the one being hovered, which is the opposite of what the placeholder says it does.
  const left = planDrop({ x: 5, y: 165 }, cells, { sourceId: "a", sourceType: "link" });
  assert.equal(left.side, "after");
  assert.notEqual(left.kind, DROP_MERGE);

  const items = [link("a"), heading("s")];
  const dropped = applyPlan(items, centre, { sourceId: "a" });
  assert.deepEqual(dropped.map((i) => i.id), ["s", "a"], "the link did not land inside the section");
});

// This is what lets the feature ship without a single confirmation dialog: there is no gesture
// in it that can lose a link.
test("deleting a section deletes the heading and nothing else", () => {
  const items = [link("a"), heading("s"), link("b"), folder("f", [link("c"), link("d")])];
  const next = removeSection(items, "s");
  assert.deepEqual(next.map((i) => i.id), ["a", "b", "f"]);
  assert.equal(countLinks(next), countLinks(items));
  // Nothing to delete is not an error, and an id belonging to a link is not a section.
  assert.deepEqual(removeSection(items, "a"), items);
});

// Clearing the name is a real answer, not a rejected one: the break stays and the caption goes,
// which is the only way to divide a grid without also labelling it. An unnamed heading is then
// laid out at zero height, so it costs the page nothing — see .section-heading--unnamed.
test("a heading can be left with no name at all, and the break survives it", () => {
  const items = [link("a"), heading("s", "旧名"), link("b")];
  assert.equal(renameSection(items, "s", "  工作  ")[1].name, "工作");

  const cleared = renameSection(items, "s", "   ");
  assert.equal(cleared[1].name, "");
  assert.ok(!isNamed(cleared[1]));
  // The section itself is untouched: two blocks before, two blocks after.
  assert.deepEqual(sectionsOf(cleared).map((b) => b.tiles.map((t) => t.item.id)), [["a"], ["b"]]);
  assert.equal(countLinks(cleared), 2);

  // Naming it again is an ordinary rename.
  assert.equal(renameSection(cleared, "s", "工作")[1].name, "工作");
  // Nothing changed is still nothing changed, so an opened-and-closed editor writes no storage.
  assert.equal(renameSection(cleared, "s", ""), cleared);
  assert.equal(appendSection([link("a")], "s2")[1].name, NEW_SECTION_NAME);
});

test("headings survive a round trip through a file, and old files still open", () => {
  const exported = [
    { type: "section", name: "工作" },
    { type: "link", name: "A", url: "https://a.test/", iconMode: "auto" },
    { type: "folder", name: "F", children: [{ type: "link", name: "B", url: "https://b.test/" }] },
  ];
  const imported = validateShortcutPayload({ shortcuts: exported });
  assert.deepEqual(imported.map((i) => i.type), ["section", "link", "folder"]);
  assert.equal(imported[0].name, "工作");
  assert.equal(countLinks(imported), 2);

  // A file written before sections existed is already a valid file with one untitled section.
  const old = validateShortcutPayload([{ type: "link", name: "A", url: "https://a.test/" }]);
  assert.equal(sectionsOf(old).length, 1);
  assert.equal(sectionsOf(old)[0].marker, null);

  // A heading inside a folder is not something to quietly drop: it means the file is malformed.
  assert.throws(() => validateShortcutPayload([
    { type: "folder", name: "F", children: [{ type: "section", name: "X" }] },
  ]), /分区/);
});

// The exporter and the importer are a matched pair, and the way that pair breaks is one of them
// learning about a type the other has never heard of.
test("export and import agree about what a heading is", async () => {
  const { cleanForExport } = await import("../src/lib/shortcuts-file.js");
  const live = [
    heading("s0", ""),
    heading("s1", "工作"),
    { ...link("a"), _iconUrl: "blob:whatever", _iconAccent: "#fff" },
    heading("s2", "娱乐"),
    folder("f", [link("b"), link("c")]),
  ];
  const round = validateShortcutPayload({ shortcuts: cleanForExport(live) });
  assert.deepEqual(round.map((i) => i.type), ["section", "section", "link", "section", "folder"]);
  assert.deepEqual(round.map((i) => i.name), ["", "工作", "a", "娱乐", "f"],
    "an unnamed break did not survive the round trip");
  assert.deepEqual(sectionsOf(round).map((b) => b.tiles.length), [0, 1, 1]);
  // Runtime icon fields never reach the file.
  assert.ok(!JSON.stringify(cleanForExport(live)).includes("blob:"));
});

// The grid stays one grid. Splitting it into a grid per section is the obvious implementation
// and it breaks two things at once: drag geometry is measured as one flat list of cells across
// the whole grid, and auto-fill resolves its column count per grid — so a section holding three
// tiles would place column 1 somewhere the section above it does not.
test("sections are rows in the one grid, not grids of their own", async () => {
  const css = await (await import("node:fs/promises"))
    .readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  // Anchored to the start of a line, or ".section-heading {" also matches the tail of the
  // entrance rule it shares with the tiles.
  const rule = (selector) => {
    const start = css.indexOf(String.fromCharCode(10) + selector);
    assert.ok(start >= 0, `${selector} is gone`);
    return css.slice(start, css.indexOf("}", start));
  };

  for (const selector of [".section-heading {", ".section-add {"]) {
    assert.match(rule(selector), /grid-column:\s*1\s*\/\s*-1/,
      `${selector} left the grid, so it can no longer line up with a rail that moves with the window`);
  }

  // A heading is a row in the same grid as the tiles and is nothing like 120px tall, so the
  // track has to size itself. Tiles carry that height on their own.
  assert.doesNotMatch(rule(".shortcut-grid {"), /grid-auto-rows:\s*var\(--cell-size\)/,
    "a fixed row height makes every heading occupy a whole empty tile row");
  assert.match(rule(".shortcut {"), /height:\s*var\(--cell-size\)/,
    "tiles stopped setting their own height, so auto-sized rows will collapse them");

  // Aligned to the icon's left edge, not the cell's — the cell carries 30px of padding, so a
  // heading flush with the track hangs 30px left of everything it names.
  assert.match(rule(".section-heading {"), /padding:\s*30px var\(--cell-pad-x\) 0/);
});

// Dragging a heading moves the block under it, so the only landing places are the seams between
// blocks. Seam k means "immediately above block k", and one seam past the end means "at the
// bottom" — which is why the search is one-dimensional and does not go through planDrop at all.
test("a section drag lands on seams between blocks, not gaps between tiles", async () => {
  const { DROP_SECTION, planSectionMove } = await import("../src/lib/drag-plan.js");
  const seams = [{ block: 0, y: 100 }, { block: 1, y: 400 }, { block: 2, y: 700 }];

  assert.deepEqual(planSectionMove({ x: 0, y: 380 }, seams), { kind: DROP_SECTION, atSeam: 1 });
  assert.deepEqual(planSectionMove({ x: 0, y: 690 }, seams), { kind: DROP_SECTION, atSeam: 2 });
  // Past the bottom of everything still resolves, the same way a tile released in empty space does.
  assert.equal(planSectionMove({ x: 0, y: 9000 }, seams).atSeam, 2);
  // Seam 0 is not always reachable; when it is not, the nearest one above it is 1.
  assert.equal(planSectionMove({ x: 0, y: 0 }, seams, { firstSeam: 1 }).atSeam, 1);
  assert.equal(planSectionMove(null, seams), null);
  assert.equal(planSectionMove({ x: 0, y: 0 }, []), null);
});

// The leading block usually has no marker of its own — it is whatever sits above the first
// heading. Dropping a section above it would put those tiles *under* the moved section's
// heading, quietly re-filing links the drag never touched.
test("a section cannot be dropped above an unmarked leading block", () => {
  const items = [link("a"), heading("s1"), link("b"), link("c"), heading("s2"), link("d")];
  assert.equal(firstMovableSeam(sectionsOf(items)), 1);
  assert.equal(moveSection(items, "s1", 0), items, "the lead block's tiles were about to be re-filed");

  // With a heading at the very top, seam 0 is real.
  const titledFirst = [heading("s1"), link("a"), heading("s2"), link("b")];
  assert.equal(firstMovableSeam(sectionsOf(titledFirst)), 0);
  assert.deepEqual(moveSection(titledFirst, "s2", 0).map((i) => i.id), ["s2", "b", "s1", "a"]);
});

test("moving a section carries every tile under it, and nothing else", () => {
  const items = [link("a"), heading("s1"), link("b"), link("c"), heading("s2"), link("d")];

  assert.deepEqual(moveSection(items, "s2", 1).map((i) => i.id), ["a", "s2", "d", "s1", "b", "c"]);
  // Seam 3 is past the end.
  assert.deepEqual(moveSection(items, "s1", 3).map((i) => i.id), ["a", "s2", "d", "s1", "b", "c"]);
  // Either of its own seams is where it already is, and the original array comes back so the
  // gesture does not count as an edit.
  assert.equal(moveSection(items, "s1", 1), items);
  assert.equal(moveSection(items, "s1", 2), items);
  assert.equal(moveSection(items, "nope", 1), items);

  for (const seam of [0, 1, 2, 3]) {
    assert.equal(countLinks(moveSection(items, "s2", seam)), 4, `seam ${seam} lost a link`);
  }
});

test("collapsing rides on the marker, so it survives a reload", () => {
  const items = [heading("s", "工作"), link("a")];
  assert.ok(!isCollapsed(items[0]));
  const closed = toggleCollapse(items, "s");
  assert.ok(isCollapsed(closed[0]));
  assert.equal(closed[0].name, "工作", "collapsing rewrote something else about the section");
  assert.ok(!isCollapsed(toggleCollapse(closed, "s")[0]));
  // A link is not a section and cannot be collapsed.
  assert.deepEqual(toggleCollapse(items, "a")[1], link("a"));
});

// Two of the section rules borrow `.shortcut__icon` so that measureGrid can find them: the
// collapsed heading's drop target, and the empty section's placeholder cell. Both then have to
// undo most of what that class does. One class beats nothing, so between two single-class rules
// the later one wins — and written before the tile rules, every one of those overrides silently
// lost. The visible result was a collapsed heading whose title sat 60px to the right of every
// other heading, wearing a tile bevel around nothing.
test("the rules that override a tile's icon are written after it", async () => {
  const css = await (await import("node:fs/promises"))
    .readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  const at = (selector) => {
    const index = css.indexOf(String.fromCharCode(10) + selector);
    assert.ok(index >= 0, `${selector} is gone`);
    return index;
  };

  const icon = at(".shortcut__icon {");
  for (const borrower of [".section-heading__target {", ".section-drop__icon {"]) {
    assert.ok(at(borrower) > icon,
      `${borrower} is written before .shortcut__icon, so its overrides lose on equal specificity`);
  }

  // The seam is what tells you where a dragged section will land, and it must never be in the
  // flow: the grid does not move while a drag is in flight, and that is the invariant every
  // other part of the drag system is built on.
  const seam = css.slice(at(".section-seam {"));
  assert.match(seam.slice(0, seam.indexOf("}")), /position:\s*absolute/,
    "the drop seam takes up layout, so arming it would move the grid mid-drag");
});
