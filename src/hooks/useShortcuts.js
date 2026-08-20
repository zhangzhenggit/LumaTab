import { useEffect, useMemo, useRef, useState } from "react";
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { createId, normalizeUrl } from "../lib/icons";
import { collapseThinFolders } from "../lib/shortcuts-tree";
import { createCollisionStrategy } from "../lib/drag-collision";
import { applyDrop, DROP_MERGE, planDrop, pointerAt } from "../lib/drag-plan";
import { loadShortcuts, saveShortcuts } from "../lib/storage";
import { applyCachedSiteIcons, prepareSiteIcons, subscribeToIconUpdates } from "../lib/site-icon-cache";

function countLinks(items) {
  return items.reduce((total, item) => item.type === "folder"
    ? total + (item.children?.length ?? 0)
    : total + 1, 0);
}

const DEFAULT_SHORTCUTS_URL = "/data/imported-shortcuts.json";

// Personal shortcut data (see convert:wetab) is a gitignored public/ asset, not a build-time
// import, so a machine without the file still builds fine and just gets an empty grid.
async function loadDefaultShortcuts() {
  try {
    const response = await fetch(DEFAULT_SHORTCUTS_URL);
    return response.ok ? await response.json() : [];
  } catch {
    return [];
  }
}

// Accepts a plain array of items exported by this extension, rejecting anything whose shape we
// cannot render. Import replaces or merges live data, so a malformed file must fail loudly here
// rather than half-apply and leave the grid in a state the user cannot undo.
export function validateShortcutPayload(payload) {
  const items = Array.isArray(payload) ? payload : payload?.shortcuts;
  if (!Array.isArray(items)) throw new Error("文件格式不正确：应为快捷方式数组");

  const clean = (list, depth = 0) => list.map((item) => {
    if (!item || typeof item !== "object") throw new Error("文件中包含无法识别的条目");
    const name = String(item.name ?? "").trim();
    if (!name) throw new Error("文件中有条目缺少名称");
    if (item.type === "folder") {
      if (depth > 0) throw new Error("不支持嵌套分组");
      const children = Array.isArray(item.children) ? item.children : [];
      return { id: createId(), type: "folder", name, children: clean(children, depth + 1) };
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

export function useShortcuts(notify) {
  const [shortcuts, setShortcuts] = useState([]);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [mergeReadyId, setMergeReadyId] = useState(null);
  const lastOverRef = useRef(null);
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const collisionDetection = useMemo(() => createCollisionStrategy(lastOverRef), []);

  // The icon is the merge target, not the whole cell — the cell includes the gutter that means
  // "put it beside this one". Read from the DOM so the two never drift apart when the CSS changes.
  function iconRectOf(tileId) {
    const node = document.querySelector(`[data-tile-id="${CSS.escape(String(tileId))}"] .shortcut__icon`);
    return node ? node.getBoundingClientRect() : null;
  }

  function planFor(event) {
    const targetId = event.over ? String(event.over.id) : null;
    const sourceId = String(event.active.id);
    if (!targetId || targetId === sourceId) return { targetId: null, plan: null };
    const source = shortcutsRef.current.find((item) => item.id === sourceId);
    const target = shortcutsRef.current.find((item) => item.id === targetId);
    const plan = planDrop({
      point: pointerAt(event.activatorEvent, event.delta),
      sourceType: source?.type,
      targetType: target?.type,
      targetIconRect: iconRectOf(targetId),
    });
    return { targetId, plan };
  }

  useEffect(() => {
    let disposed = false;
    void loadDefaultShortcuts().then(loadShortcuts).then(prepareSiteIcons).then((stored) => {
      if (!disposed) { setShortcuts(stored); setReady(true); }
    });
    return () => { disposed = true; };
  }, []);

  // First paint shows whatever is already cached; the worker keeps resolving afterwards, so
  // adopt its results as soon as it reports completion rather than making the user open a new
  // tab to see sharp icons.
  useEffect(() => {
    let disposed = false;
    const unsubscribe = subscribeToIconUpdates(() => {
      void applyCachedSiteIcons(shortcutsRef.current).then((next) => {
        if (!disposed && next !== shortcutsRef.current) setShortcuts(next);
      });
    });
    return () => { disposed = true; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timeout = setTimeout(() => void saveShortcuts(shortcuts), 120);
    return () => clearTimeout(timeout);
  }, [ready, shortcuts]);

  const ids = useMemo(() => shortcuts.map((item) => item.id), [shortcuts]);

  function resetDragState() {
    lastOverRef.current = null;
    setActiveId(null);
    setOverId(null);
    setMergeReadyId(null);
  }

  function dragStart(event) {
    lastOverRef.current = null;
    setActiveId(String(event.active.id));
  }

  // Every move re-answers one question from the pointer's current position: is it on a tile, or in
  // the gutter beside one? No timers, so the answer is immediate and reversible — slide onto the
  // icon and the ring appears, slide off and it goes.
  function dragMove(event) {
    const { targetId, plan } = planFor(event);
    if (targetId !== overId) setOverId(targetId);
    const nextMerge = plan === DROP_MERGE ? targetId : null;
    if (nextMerge !== mergeReadyId) setMergeReadyId(nextMerge);
  }

  function dragEnd(event) {
    const { targetId, plan } = planFor(event);
    const sourceId = String(event.active.id);
    if (targetId && plan) {
      setShortcuts((current) => applyDrop(current, {
        plan,
        sourceId,
        targetId,
        makeFolderId: () => createId("folder"),
      }));
    }
    resetDragState();
  }


  function addLink(values) {
    if (!values.name) throw new Error("请输入名称");
    const link = { id: createId("link"), type: "link", name: values.name, url: normalizeUrl(values.url), iconMode: values.iconMode, accentColor: values.accentColor ?? null, monogram: values.monogram ?? null };
    setShortcuts((current) => [...current, link]);
    if (link.iconMode === "auto") {
      void prepareSiteIcons([link]).then(([prepared]) => {
        setShortcuts((current) => current.map((item) => item.id === link.id ? prepared : item));
      });
    }
    notify("链接已添加");
  }

  function saveEditedItem(editor, editorItem, values) {
    if (!editor || !editorItem || !values.name) throw new Error("请输入名称");
    const editLink = (link) => {
      const nextUrl = normalizeUrl(values.url);
      const { icon: _legacyPresetIcon, ...cleanLink } = link;
      return {
        ...cleanLink,
        name: values.name,
        url: nextUrl,
        iconMode: values.iconMode,
        accentColor: values.accentColor ?? null,
        monogram: values.monogram ?? null,
        _iconUrl: nextUrl === link.url ? link._iconUrl : undefined,
      };
    };
    setShortcuts((current) => current.map((item) => {
      if (editor.folderId && item.id === editor.folderId) {
        return {
          ...item,
          children: item.children.map((child) => child.id === editor.itemId ? editLink(child) : child),
        };
      }
      if (item.id !== editor.itemId) return item;
      if (item.type === "folder") return { ...item, name: values.name };
      return editLink(item);
    }));
    notify("修改已保存");
    if (editorItem.type === "link" && values.iconMode === "auto") {
      const candidate = editLink(editorItem);
      void prepareSiteIcons([candidate]).then(([prepared]) => {
        setShortcuts((current) => current.map((item) => {
          if (editor.folderId && item.id === editor.folderId) {
            return { ...item, children: item.children.map((child) => child.id === editor.itemId ? prepared : child) };
          }
          return item.id === editor.itemId ? prepared : item;
        }));
      });
    }
  }

  function deleteItem(ref) {
    setShortcuts((current) => collapseThinFolders(ref.folderId
      ? current.map((item) => item.id === ref.folderId ? { ...item, children: item.children.filter((child) => child.id !== ref.itemId) } : item)
      : current.filter((item) => item.id !== ref.itemId)));
    notify("快捷链接已删除");
  }

  function moveItemOut(ref, item) {
    setShortcuts((current) => {
      const next = current.map((entry) => entry.id === ref.folderId
        ? { ...entry, children: entry.children.filter((child) => child.id !== ref.itemId) }
        : entry);
      // The link that just left may have been the second-to-last, leaving a one-item folder.
      return collapseThinFolders([...next, item]);
    });
    notify("已移出分组");
  }

  // Import lands through one of these two. Icons are resolved for whatever arrives so imported
  // links do not sit on letter tiles until the next page load.
  function adoptImported(next, message) {
    setShortcuts(next);
    void prepareSiteIcons(next).then((prepared) => setShortcuts(prepared));
    notify(message);
  }

  function replaceAll(items) {
    adoptImported(items, `已导入 ${countLinks(items)} 个链接`);
  }

  function mergeIn(items) {
    const existing = new Set();
    const collect = (list) => list.forEach((item) => item.type === "folder"
      ? collect(item.children ?? [])
      : existing.add(item.url));
    collect(shortcutsRef.current);
    const fresh = items.filter((item) => item.type === "folder" || !existing.has(item.url));
    if (!fresh.length) {
      notify("没有新的链接需要导入");
      return;
    }
    adoptImported([...shortcutsRef.current, ...fresh], `已合并 ${countLinks(fresh)} 个链接`);
  }

  function dissolveFolder(ref) {
    setShortcuts((current) => {
      const folderIndex = current.findIndex((item) => item.id === ref.itemId);
      if (folderIndex < 0) return current;
      return [...current.slice(0, folderIndex), ...current[folderIndex].children, ...current.slice(folderIndex + 1)];
    });
    notify("分组已解散");
  }


  return {
    shortcuts, ready, ids, sensors, collisionDetection,
    activeId, mergeReadyId,
    dragStart, dragMove, dragEnd, resetDragState,
    addLink, saveEditedItem, deleteItem, moveItemOut, dissolveFolder,
    replaceAll, mergeIn,
  };
}
