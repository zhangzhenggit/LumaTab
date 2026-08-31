import { useEffect, useRef, useState } from "react";
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { createId, normalizeUrl } from "../lib/icons";
import { collapseThinFolders } from "../lib/shortcuts-tree";
import { applyPlan, DROP_MERGE, DROP_REORDER, planDrop, pointerAt, samePlan } from "../lib/drag-plan";
import { loadShortcuts, saveShortcuts } from "../lib/storage";
import { applyCachedSiteIcons, prepareSiteIcons, subscribeToIconUpdates } from "../lib/site-icon-cache";
import { useTileFlip } from "./useTileFlip";

function countLinks(items) {
  return items.reduce((total, item) => item.type === "folder"
    ? total + (item.children?.length ?? 0)
    : total + 1, 0);
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
  const [dropPlan, setDropPlan] = useState(null);
  // The tile that just absorbed a merge, for the length of one landing animation.
  const [landedId, setLandedId] = useState(null);
  // Handed to useTileFlip, which reads it once per commit and clears it.
  const releaseRef = useRef(null);
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;
  // The grid exactly as it looked when the drag began. It is deliberately never re-read: tiles do
  // not move during a drag, and re-measuring would hand the decision back a rect that the
  // decision itself had changed — the merge ring scales its target up by 18%.
  const gridRef = useRef([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function measureGrid() {
    const types = new Map(shortcutsRef.current.map((item) => [item.id, item.type]));
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

  function planFor(event) {
    const sourceId = String(event.active.id);
    return planDrop(pointerAt(event.activatorEvent, event.delta), gridRef.current, {
      sourceId,
      sourceType: shortcutsRef.current.find((item) => item.id === sourceId)?.type ?? "link",
    });
  }


  useEffect(() => {
    let disposed = false;
    // Icon preparation is best-effort decoration on top of the links. If anything in that stage
    // rejects, fall back to the stored links untouched — a grid with letter tiles beats a blank
    // page, and `ready` must be set either way or the grid never fades in at all.
    void loadShortcuts()
      .then((stored) => prepareSiteIcons(stored).catch((error) => {
        console.warn("LumaTab: icon preparation failed, showing links without icons", error);
        return stored;
      }))
      .then((stored) => {
        if (!disposed) { setShortcuts(stored); setReady(true); }
      });
    return () => { disposed = true; };
  }, []);

  // First paint shows whatever is already cached; the worker keeps resolving afterwards, so
  // adopt its results as soon as it reports completion rather than making the user open a new
  // tab to see sharp icons.
  //
  // The broadcast is the fast path, deliberately not the only one. It can be missed in several
  // ordinary ways — the worker can finish before this listener is registered, MV3 can recycle the
  // worker mid-batch, a message can land while the page is still loading — and when it was missed
  // the page never looked at the cache again. The icons were sitting there the whole time; the
  // grid just kept showing letters until something else happened to make the user reload.
  //
  // So the page also re-reads the cache a few times on its own, backing off as it goes, and again
  // whenever the tab becomes visible. Re-reading is cheap and issues no network work of its own,
  // which is what makes polling an acceptable safety net here rather than a smell.
  useEffect(() => {
    let disposed = false;
    const adopt = (options) => {
      void applyCachedSiteIcons(shortcutsRef.current, options).then((next) => {
        if (!disposed && next !== shortcutsRef.current) setShortcuts(next);
      });
    };

    const unsubscribe = subscribeToIconUpdates((diagnostics) => {
      adopt({ force: Boolean(diagnostics?.refresh) });
    });
    const timers = [800, 2500, 6000, 14000].map((delay) => setTimeout(() => adopt(), delay));
    const onVisible = () => { if (document.visibilityState === "visible") adopt(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      unsubscribe();
      timers.forEach(clearTimeout);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timeout = setTimeout(() => void saveShortcuts(shortcuts), 120);
    return () => clearTimeout(timeout);
  }, [ready, shortcuts]);

  function resetDragState() {
    setActiveId(null);
    setDropPlan(null);
  }

  // Measured before React paints anything, so the snapshot catches the tiles at rest: no jiggle
  // rotation inflating a bounding box, no merge ring, no hover lift on anything but the tile
  // being picked up — and that one is excluded from the targets anyway.
  function dragStart(event) {
    gridRef.current = measureGrid();
    // The sensor only fires this after 6px of travel, so there is already a real pointer position
    // to answer from. Waiting for the next onDragMove instead left the first frame of every drag
    // with no ring and no caret, which reads as the grid ignoring you.
    setDropPlan(planFor(event));
    setActiveId(String(event.active.id));
  }

  // Every move re-answers one question against that snapshot: is the pointer on an icon, or in
  // the gap beside one? No timers and no memory of previous frames, so the answer is immediate
  // and reversible — slide onto the icon and the ring appears, slide off and it goes.
  function dragMove(event) {
    const next = planFor(event);
    setDropPlan((current) => (samePlan(current, next) ? current : next));
  }

  function dragEnd(event) {
    const plan = planFor(event);
    const sourceId = String(event.active.id);
    // Where the tile actually was when the pointer let go, so useTileFlip can fly it home from
    // there instead of from the cell it had been sitting in all along. dnd-kit already tracks
    // this: `translated` is the draggable's rect with the drag delta applied.
    releaseRef.current = { id: sourceId, rect: event.active.rect.current?.translated ?? null };
    // Settled before the updater rather than inside it, because the landing animation needs to
    // know the id and a merge onto a plain link mints a brand new folder. React also invokes
    // updaters twice under StrictMode, and an id that differs between the two runs is a bug
    // waiting to happen.
    const folderId = createId("folder");
    setShortcuts((current) => applyPlan(current, plan, { sourceId, makeFolderId: () => folderId }));
    if (plan?.kind === DROP_MERGE) {
      // The dragged tile is gone — swallowed by the target — so the feedback has to come from
      // whatever swallowed it. Merging onto a folder lands on that folder; merging onto a link
      // lands on the folder the two of them just became.
      const target = shortcutsRef.current.find((item) => item.id === plan.targetId);
      setLandedId(target?.type === "folder" ? plan.targetId : folderId);
    }
    resetDragState();
  }

  // One shot, then forgotten: leaving the class on would re-run the animation the next time this
  // tile re-renders for an unrelated reason.
  useEffect(() => {
    if (!landedId) return undefined;
    const timer = setTimeout(() => setLandedId(null), 400);
    return () => clearTimeout(timer);
  }, [landedId]);


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


  useTileFlip(shortcuts, releaseRef);

  return {
    shortcuts, ready, sensors,
    activeId, landedId,
    mergeReadyId: dropPlan?.kind === DROP_MERGE ? dropPlan.targetId : null,
    dropIndicator: dropPlan?.kind === DROP_REORDER ? dropPlan : null,
    dragStart, dragMove, dragEnd, resetDragState,
    addLink, saveEditedItem, deleteItem, moveItemOut, dissolveFolder,
    replaceAll, mergeIn,
  };
}
