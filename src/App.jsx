import { useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { AddLinkDialog } from "./components/AddLinkDialog";
import { FolderPanel } from "./components/FolderPanel";
import { ItemContextMenu } from "./components/ItemContextMenu";
import { PageContextMenu } from "./components/PageContextMenu";
import { SearchBar } from "./components/SearchBar";
import { AddTile, ShortcutGhost, ShortcutTile } from "./components/ShortcutTile";
import { useBingWallpaper } from "./hooks/useBingWallpaper";
import { useNotice } from "./hooks/useNotice";
import { useShortcuts } from "./hooks/useShortcuts";
import { findItem } from "./lib/shortcuts-tree";

export function App() {
  const [notice, notify] = useNotice();
  const { wallpaper, backgroundMeta, changeBackground } = useBingWallpaper(notify);
  const shortcutsApi = useShortcuts(notify);
  const { shortcuts, ready, ids, sensors, activeId, mergeReadyId } = shortcutsApi;

  const [addDialog, setAddDialog] = useState(false);
  const [editor, setEditor] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [pageMenu, setPageMenu] = useState(null);
  const [openFolderId, setOpenFolderId] = useState(null);

  const activeItem = shortcuts.find((item) => item.id === activeId) ?? null;
  const openFolder = shortcuts.find((item) => item.id === openFolderId && item.type === "folder") ?? null;
  const editorItem = findItem(shortcuts, editor);
  const menuItem = findItem(shortcuts, contextMenu);

  function activate(item) {
    if (activeId) return;
    if (item.type === "folder") setOpenFolderId(item.id);
    else window.location.assign(item.url);
  }

  function dragStart(event) {
    setContextMenu(null);
    shortcutsApi.dragStart(event);
  }

  function addLink(values) {
    shortcutsApi.addLink(values);
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

  async function cycleBackground() {
    setPageMenu(null);
    await changeBackground();
  }

  async function reloadIcons() {
    setPageMenu(null);
    await shortcutsApi.reloadIcons();
  }

  function startEditing() {
    if (!contextMenu) return;
    setEditor({ itemId: contextMenu.itemId, folderId: contextMenu.folderId });
    setContextMenu(null);
  }

  function saveEditedItem(values) {
    shortcutsApi.saveEditedItem(editor, editorItem, values);
    setEditor(null);
  }

  function deleteMenuItem() {
    if (!contextMenu) return;
    shortcutsApi.deleteItem(contextMenu);
    setContextMenu(null);
  }

  function moveMenuItemOut() {
    if (!contextMenu?.folderId || !menuItem) return;
    shortcutsApi.moveItemOut(contextMenu, menuItem);
    setContextMenu(null);
  }

  function dissolveMenuFolder() {
    if (!contextMenu || menuItem?.type !== "folder") return;
    shortcutsApi.dissolveFolder(contextMenu);
    setContextMenu(null);
    setOpenFolderId(null);
  }

  return (
    <main className="newtab" onContextMenu={openPageMenu}>
      <div className="wallpaper" style={{ backgroundImage: `url("${wallpaper}")` }} /><div className="wallpaper-overlay" />
      <div className="newtab__content">
        <SearchBar />
        <DndContext sensors={sensors} onDragStart={dragStart} onDragOver={shortcutsApi.dragOver} onDragEnd={shortcutsApi.dragEnd} onDragCancel={shortcutsApi.resetDragState}>
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
        onCycleBackground={cycleBackground}
        onRefreshIcons={reloadIcons}
      />
      <div className={`toast ${notice ? "toast--visible" : ""}`} role="status">{notice}</div>
    </main>
  );
}
