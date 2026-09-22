import { createId, normalizeUrl } from "./icons.js";
import { isSection, SECTION } from "./sections.js";

// Every value iconMode may hold. Something outside this list is not rejected — it is read as
// "auto", because a file written by a newer version must still import into an older one.
const ICON_MODES = ["auto", "generated", "custom"];
import { normalizeSectionAccent, normalizeSectionIcon } from "./section-icons.js";

// Reading and writing the export file. Pulled out of useShortcuts because none of it is stateful
// and all of it is exactly the sort of thing that should be assertable without a React tree — the
// import path is the one place a malformed file can reach live data.
// Accepts a plain array of items exported by this extension, rejecting anything whose shape we
// cannot render. Import replaces or merges live data, so a malformed file must fail loudly here
// rather than half-apply and leave the grid in a state the user cannot undo.
export function validateShortcutPayload(payload) {
  const items = Array.isArray(payload) ? payload : payload?.shortcuts;
  if (!Array.isArray(items)) throw new Error("文件格式不正确：应为快捷方式数组");

  const clean = (list, depth = 0) => list.map((item) => {
    if (!item || typeof item !== "object") throw new Error("文件中包含无法识别的条目");
    const name = String(item.name ?? "").trim();
    // A section is the one thing allowed to have no name: an unnamed heading is a plain break in
    // the grid, and refusing it here would silently drop every divider on import.
    if (!name && item.type !== SECTION) throw new Error("文件中有条目缺少名称");
    if (item.type === "folder") {
      if (depth > 0) throw new Error("不支持嵌套文件夹");
      const children = Array.isArray(item.children) ? item.children : [];
      return { id: createId(), type: "folder", name, children: clean(children, depth + 1) };
    }
    // A heading divides the top-level grid and means nothing inside a folder, so one that turns
    // up there is a malformed file rather than something to quietly drop.
    if (item.type === SECTION) {
      if (depth > 0) throw new Error("文件夹内不能再分组");
      return {
        id: createId("section"),
        type: SECTION,
        name,
        glyph: normalizeSectionIcon(item.glyph),
        accentColor: normalizeSectionAccent(item.accentColor),
      };
    }
    return {
      id: createId(),
      type: "link",
      name,
      url: normalizeUrl(String(item.url ?? "")),
      // "custom" travels with the file even though the picture itself cannot — those bytes live
      // in Cache Storage, which an export does not carry. Re-imported on the same machine the
      // cache is still there and the icon comes straight back; on another machine there is
      // nothing under that key, so the link is simply one of the missing ones and resolves from
      // the site like any other. Rewriting it to "auto" on the way in would throw the choice
      // away in the one case where it still works.
      iconMode: ICON_MODES.includes(item.iconMode) ? item.iconMode : "auto",
    };
  });

  const result = clean(items);
  if (!result.length) throw new Error("文件中没有任何快捷方式");
  return result;
}

// The mirror of the importer, and deliberately next to it: the two have to agree about which
// types exist, and the way that goes wrong is one of them learning about a new one alone.
// Underscore-prefixed runtime fields (resolved icon blobs and the like) are stripped, so the
// file holds only what an import actually reads back.
export function cleanForExport(items = []) {
  return items.map((item) => {
    if (item.type === "folder") {
      return { type: "folder", name: item.name, children: cleanForExport(item.children ?? []) };
    }
    // Section headings travel with the file but carry no id: import mints fresh ids for
    // everything, so writing one would only put a stale number in the export.
    if (isSection(item)) {
      return { type: SECTION, name: item.name, glyph: item.glyph ?? null, accentColor: item.accentColor ?? null };
    }
    return { type: "link", name: item.name, url: item.url, iconMode: item.iconMode };
  });
}
