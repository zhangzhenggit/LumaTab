import { useEffect, useMemo, useRef, useState } from "react";
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { createId, normalizeUrl } from "../lib/icons";
import { loadShortcuts, saveShortcuts } from "../lib/storage";
import { prepareSiteIcons, refreshSiteIcons } from "../lib/site-icon-cache";

const MERGE_HOLD_MS = 650;
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

function countMissingIcons(items) {
  return items.reduce((total, item) => item.type === "folder"
    ? total + countMissingIcons(item.children ?? [])
    : total + (item.iconMode !== "generated" && item._iconSource !== "cache" ? 1 : 0), 0);
}

export function useShortcuts(notify) {
  const [shortcuts, setShortcuts] = useState([]);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [mergeReadyId, setMergeReadyId] = useState(null);
  const mergeTimerRef = useRef(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    let disposed = false;
    void loadDefaultShortcuts().then(loadShortcuts).then(prepareSiteIcons).then((stored) => {
      if (!disposed) { setShortcuts(stored); setReady(true); }
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timeout = setTimeout(() => void saveShortcuts(shortcuts), 120);
    return () => clearTimeout(timeout);
  }, [ready, shortcuts]);

  const ids = useMemo(() => shortcuts.map((item) => item.id), [shortcuts]);

  function clearMergeTimer() {
    if (mergeTimerRef.current) clearTimeout(mergeTimerRef.current);
    mergeTimerRef.current = null;
  }

  function resetDragState() {
    clearMergeTimer();
    setActiveId(null);
    setOverId(null);
    setMergeReadyId(null);
  }

  function dragStart(event) {
    setActiveId(String(event.active.id));
  }

  function dragOver(event) {
    const nextOverId = event.over ? String(event.over.id) : null;
    if (nextOverId === overId) return;
    clearMergeTimer();
    setOverId(nextOverId);
    setMergeReadyId(null);
    if (nextOverId && nextOverId !== activeId) {
      const source = shortcuts.find((item) => item.id === String(event.active.id));
      const target = shortcuts.find((item) => item.id === nextOverId);
      if (source?.type === "link" && target?.type === "folder") {
        setMergeReadyId(nextOverId);
        return;
      }
      if (source?.type === "link" && target?.type === "link") {
        mergeTimerRef.current = setTimeout(() => setMergeReadyId(nextOverId), MERGE_HOLD_MS);
      }
    }
  }

  function dragEnd(event) {
    const sourceId = String(event.active.id);
    const targetId = event.over ? String(event.over.id) : null;
    if (!targetId || sourceId === targetId) { resetDragState(); return; }
    setShortcuts((current) => {
      const sourceIndex = current.findIndex((item) => item.id === sourceId);
      const targetIndex = current.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const source = current[sourceIndex];
      const target = current[targetIndex];
      const shouldMerge = source.type === "link" && (target.type === "folder" || targetId === mergeReadyId);

      if (shouldMerge && source.type === "link") {
        const next = current.filter((item) => item.id !== sourceId);
        const refreshedTargetIndex = next.findIndex((item) => item.id === targetId);
        if (target.type === "folder") {
          next[refreshedTargetIndex] = { ...target, children: [...target.children, source] };
        } else if (target.type === "link") {
          next[refreshedTargetIndex] = { id: createId("folder"), type: "folder", name: target.name, children: [target, source] };
        }
        notify("已加入分组");
        return next;
      }

      notify("顺序已调整");
      return arrayMove(current, sourceIndex, targetIndex);
    });
    resetDragState();
  }

  function addLink(values) {
    if (!values.name) throw new Error("请输入名称");
    const link = { id: createId("link"), type: "link", name: values.name, url: normalizeUrl(values.url), iconMode: values.iconMode };
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
    setShortcuts((current) => ref.folderId
      ? current.map((item) => item.id === ref.folderId ? { ...item, children: item.children.filter((child) => child.id !== ref.itemId) } : item)
      : current.filter((item) => item.id !== ref.itemId));
    notify("快捷链接已删除");
  }

  function moveItemOut(ref, item) {
    setShortcuts((current) => {
      const next = current.map((entry) => entry.id === ref.folderId
        ? { ...entry, children: entry.children.filter((child) => child.id !== ref.itemId) }
        : entry);
      return [...next, item];
    });
    notify("已移出分组");
  }

  function dissolveFolder(ref) {
    setShortcuts((current) => {
      const folderIndex = current.findIndex((item) => item.id === ref.itemId);
      if (folderIndex < 0) return current;
      return [...current.slice(0, folderIndex), ...current[folderIndex].children, ...current.slice(folderIndex + 1)];
    });
    notify("分组已解散");
  }

  async function reloadIcons() {
    const missingBefore = countMissingIcons(shortcuts);
    if (!missingBefore) {
      notify("当前网站图标均已获取");
      return;
    }
    notify(`正在查找 ${missingBefore} 个高清图标…`);
    const refreshed = await refreshSiteIcons(shortcuts);
    setShortcuts(refreshed);
    const recovered = missingBefore - countMissingIcons(refreshed);
    notify(recovered ? `已升级 ${recovered} 个高清图标` : "暂未找到更高清的图标");
  }

  return {
    shortcuts, ready, ids, sensors,
    activeId, mergeReadyId,
    dragStart, dragOver, dragEnd, resetDragState,
    addLink, saveEditedItem, deleteItem, moveItemOut, dissolveFolder, reloadIcons,
  };
}
