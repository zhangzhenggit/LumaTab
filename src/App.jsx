import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { AddLinkDialog } from "./components/AddLinkDialog";
import { FolderPanel } from "./components/FolderPanel";
import { ItemContextMenu } from "./components/ItemContextMenu";
import { PageContextMenu } from "./components/PageContextMenu";
import { SearchBar } from "./components/SearchBar";
import { AddTile, ShortcutGhost, ShortcutTile } from "./components/ShortcutTile";
import { DEFAULT_SHORTCUTS } from "./data/defaults";
import { cycleBingBackground, loadBingBackground } from "./lib/background";
import { createId, normalizeUrl } from "./lib/icons";
import { loadShortcuts, saveShortcuts } from "./lib/storage";
import { prepareSiteIcons, refreshSiteIcons } from "./lib/site-icon-cache";

const FALLBACK_WALLPAPER = "/assets/wallpapers/fallback-alpine.webp";
const MERGE_HOLD_MS = 650;

function cloneDefaults() { return structuredClone(DEFAULT_SHORTCUTS); }

function countMissingIcons(items) {
  return items.reduce((total, item) => item.type === "folder"
    ? total + countMissingIcons(item.children ?? [])
    : total + (item.iconMode !== "generated" && item._iconSource !== "cache" ? 1 : 0), 0);
}

export function App() {
  const [shortcuts, setShortcuts] = useState(cloneDefaults);
  const [ready, setReady] = useState(false);
  const [wallpaper, setWallpaper] = useState(FALLBACK_WALLPAPER);
  const [backgroundMeta, setBackgroundMeta] = useState(null);
  const [addDialog, setAddDialog] = useState(false);
  const [editor, setEditor] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [pageMenu, setPageMenu] = useState(null);
  const [openFolderId, setOpenFolderId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [mergeReadyId, setMergeReadyId] = useState(null);
  const [notice, setNotice] = useState("");
  const mergeTimerRef = useRef(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    let disposed = false;
    void loadShortcuts(cloneDefaults()).then(prepareSiteIcons).then((stored) => { if (!disposed) { setShortcuts(stored); setReady(true); } });
    void loadBingBackground().then((result) => { if (!disposed) { setWallpaper(result.url); setBackgroundMeta(result.meta); } });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timeout = setTimeout(() => void saveShortcuts(shortcuts), 120);
    return () => clearTimeout(timeout);
  }, [ready, shortcuts]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 2200);
    return () => clearTimeout(timeout);
  }, [notice]);

  const activeItem = shortcuts.find((item) => item.id === activeId) ?? null;
  const openFolder = shortcuts.find((item) => item.id === openFolderId && item.type === "folder") ?? null;
  const editorItem = editor
    ? editor.folderId
      ? shortcuts.find((item) => item.id === editor.folderId)?.children?.find((item) => item.id === editor.itemId) ?? null
      : shortcuts.find((item) => item.id === editor.itemId) ?? null
    : null;
  const menuItem = contextMenu
    ? contextMenu.folderId
      ? shortcuts.find((item) => item.id === contextMenu.folderId)?.children?.find((item) => item.id === contextMenu.itemId) ?? null
      : shortcuts.find((item) => item.id === contextMenu.itemId) ?? null
    : null;
  const ids = useMemo(() => shortcuts.map((item) => item.id), [shortcuts]);
  function activate(item) {
    if (activeId) return;
    if (item.type === "folder") setOpenFolderId(item.id);
    else window.location.assign(item.url);
  }

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
    setContextMenu(null);
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
        setNotice("已加入分组");
        return next;
      }

      setNotice("顺序已调整");
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
    setNotice("链接已添加");
    setAddDialog(false);
  }

  function openItemMenu(event, item, folderId = null) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, itemId: item.id, folderId });
    setPageMenu(null);
  }

  function openPageMenu(event) {
    event.preventDefault();
    setContextMenu(null);
    setPageMenu({ x: event.clientX, y: event.clientY });
  }

  async function changeBackground() {
    setPageMenu(null);
    setNotice("正在更换 Bing 背景…");
    const result = await cycleBingBackground();
    setWallpaper((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current);
      return result.url;
    });
    setBackgroundMeta(result.meta);
    setNotice(result.meta ? `已切换至近 7 日图片 ${result.meta.selectedIndex + 1}/${result.meta.imageCount}` : "暂时无法获取 Bing 背景");
  }

  async function reloadIcons() {
    setPageMenu(null);
    const missingBefore = countMissingIcons(shortcuts);
    if (!missingBefore) {
      setNotice("当前网站图标均已获取");
      return;
    }
    setNotice(`正在查找 ${missingBefore} 个高清图标…`);
    const refreshed = await refreshSiteIcons(shortcuts);
    setShortcuts(refreshed);
    const recovered = missingBefore - countMissingIcons(refreshed);
    setNotice(recovered ? `已升级 ${recovered} 个高清图标` : "暂未找到更高清的图标");
  }

  function startEditing() {
    if (!contextMenu) return;
    setEditor({ itemId: contextMenu.itemId, folderId: contextMenu.folderId });
    setContextMenu(null);
  }

  function saveEditedItem(values) {
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
          children: item.children.map((child) => child.id === editor.itemId
            ? editLink(child)
            : child),
        };
      }
      if (item.id !== editor.itemId) return item;
      if (item.type === "folder") return { ...item, name: values.name };
      return editLink(item);
    }));
    setEditor(null);
    setNotice("修改已保存");
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

  function deleteMenuItem() {
    if (!contextMenu) return;
    setShortcuts((current) => contextMenu.folderId
      ? current.map((item) => item.id === contextMenu.folderId ? { ...item, children: item.children.filter((child) => child.id !== contextMenu.itemId) } : item)
      : current.filter((item) => item.id !== contextMenu.itemId));
    setContextMenu(null);
    setNotice("快捷链接已删除");
  }

  function moveMenuItemOut() {
    if (!contextMenu?.folderId || !menuItem) return;
    setShortcuts((current) => {
      const next = current.map((item) => item.id === contextMenu.folderId
        ? { ...item, children: item.children.filter((child) => child.id !== contextMenu.itemId) }
        : item);
      return [...next, menuItem];
    });
    setContextMenu(null);
    setNotice("已移出分组");
  }

  function dissolveMenuFolder() {
    if (!contextMenu || menuItem?.type !== "folder") return;
    setShortcuts((current) => {
      const folderIndex = current.findIndex((item) => item.id === contextMenu.itemId);
      if (folderIndex < 0) return current;
      return [...current.slice(0, folderIndex), ...current[folderIndex].children, ...current.slice(folderIndex + 1)];
    });
    setContextMenu(null);
    setOpenFolderId(null);
    setNotice("分组已解散");
  }

  return (
    <main className="newtab" onContextMenu={openPageMenu}>
      <div className="wallpaper" style={{ backgroundImage: `url("${wallpaper}")` }} /><div className="wallpaper-overlay" />
      <div className="newtab__content">
        <SearchBar />
        <DndContext sensors={sensors} onDragStart={dragStart} onDragOver={dragOver} onDragEnd={dragEnd} onDragCancel={resetDragState}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <section className={`shortcut-grid ${ready ? "shortcut-grid--ready" : ""}`} aria-label="快捷链接">
              {shortcuts.map((item) => <ShortcutTile key={item.id} item={item} onActivate={activate} onContextMenu={openItemMenu} dropMode={mergeReadyId === item.id ? (item.type === "folder" ? "folder" : "merge") : null} />)}
              <AddTile onClick={() => setAddDialog(true)} />
            </section>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }}>{activeItem ? <ShortcutGhost item={activeItem} /> : null}</DragOverlay>
        </DndContext>
      </div>
      {backgroundMeta?.copyright && <a className="photo-credit" href={backgroundMeta.copyrightLink} title={backgroundMeta.copyright}>{backgroundMeta.title || "Bing 每日图"}</a>}
      <AddLinkDialog open={addDialog} onClose={() => setAddDialog(false)} onSubmit={addLink} />
      <AddLinkDialog open={Boolean(editorItem)} item={editorItem} onClose={() => setEditor(null)} onSubmit={saveEditedItem} />
      <FolderPanel folder={openFolder} onClose={() => setOpenFolderId(null)} onItemContextMenu={openItemMenu} />
      <ItemContextMenu
        menu={contextMenu}
        item={menuItem}
        onClose={() => setContextMenu(null)}
        onEdit={startEditing}
        onMoveOut={moveMenuItemOut}
        onDissolve={dissolveMenuFolder}
        onDelete={deleteMenuItem}
      />
      <PageContextMenu
        menu={pageMenu}
        onClose={() => setPageMenu(null)}
        onCycleBackground={changeBackground}
        onRefreshIcons={reloadIcons}
      />
      <div className={`toast ${notice ? "toast--visible" : ""}`} role="status">{notice}</div>
    </main>
  );
}
