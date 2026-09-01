import { createId, normalizeUrl } from "./icons.js";
import { isSection, SECTION } from "./sections.js";
import { normalizeSectionIcon } from "./section-icons.js";

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
      if (depth > 0) throw new Error("不支持嵌套分组");
      const children = Array.isArray(item.children) ? item.children : [];
      return { id: createId(), type: "folder", name, children: clean(children, depth + 1) };
    }
    // A heading divides the top-level grid and means nothing inside a folder, so one that turns
    // up there is a malformed file rather than something to quietly drop.
    if (item.type === SECTION) {
      if (depth > 0) throw new Error("分组内不能再分区");
      return { id: createId("section"), type: SECTION, name, glyph: normalizeSectionIcon(item.glyph) };
    }
    return {
      id: createId(),
      type: "link",
      name,
      url: normalizeUrl(String(item.url ?? "")),
      iconMode: item.iconMode === "generated" ? "generated" : "auto",
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
    if (isSection(item)) return { type: SECTION, name: item.name, glyph: item.glyph ?? null };
    return { type: "link", name: item.name, url: item.url, iconMode: item.iconMode };
  });
}
