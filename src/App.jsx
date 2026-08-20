import { useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { AddLinkDialog } from "./components/AddLinkDialog";
import { FolderPanel } from "./components/FolderPanel";
import { GearSix } from "@phosphor-icons/react";
import { ItemContextMenu } from "./components/ItemContextMenu";
import { SearchBar } from "./components/SearchBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { SiteAccessPrompt } from "./components/SiteAccessPrompt";
import { AddTile, ShortcutGhost, ShortcutTile } from "./components/ShortcutTile";
import { useBingWallpaper } from "./hooks/useBingWallpaper";
import { useNotice } from "./hooks/useNotice";
import { useShortcuts } from "./hooks/useShortcuts";
import { useSiteAccess } from "./hooks/useSiteAccess";
import { needsDarkInk, wallpaperFilterStyle } from "./lib/background-cache-keys";
import { findItem } from "./lib/shortcuts-tree";

export function App({ initialWallpaper = null }) {
  const [notice, notify] = useNotice();
  const wallpaperApi = useBingWallpaper(notify, initialWallpaper);
  const { wallpaper, backgroundMeta, tuning, photoLuminance } = wallpaperApi;
  const shortcutsApi = useShortcuts(notify);
  const { shortcuts, ready, sensors, activeId, mergeReadyId, dropIndicator } = shortcutsApi;
  const siteAccess = useSiteAccess(shortcuts, ready, notify);

  const [addDialog, setAddDialog] = useState(false);
  const [editor, setEditor] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [openFolder, setOpenFolder] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeItem = shortcuts.find((item) => item.id === activeId) ?? null;
  // The panel remembers where it was opened from so it can grow out of that tile; the folder
  // itself is re-read from state each render so edits inside it stay live.
  const folderItem = openFolder
    ? shortcuts.find((item) => item.id === openFolder.id && item.type === "folder") ?? null
    : null;
  const editorItem = findItem(shortcuts, editor);
  const menuItem = findItem(shortcuts, contextMenu);

  function activate(item, event) {
    if (activeId) return;
    if (item.type !== "folder") {
      window.location.assign(item.url);
      return;
    }
    // The tile's full rect, not just its centre: the panel is placed beneath the tile, so it
    // needs the bottom edge as well as the horizontal middle.
    const icon = event?.currentTarget?.querySelector(".shortcut__icon");
    const rect = icon?.getBoundingClientRect();
    setOpenFolder({
      id: item.id,
      tile: rect ? { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width } : null,
    });
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
    setOpenFolder(null);
  }

  // White labels stop being readable once the adjustment layer has lightened the wallpaper past
  // roughly this point, so the page flips to dark ink instead. Without this, turning brightness
  // up — the whole reason the control is bidirectional — would erase every caption.
  const lightBackground = needsDarkInk({ brightness: tuning.brightness, gradientColors: wallpaper.gradientColors, luminance: photoLuminance });

  return (
    <main className={`newtab ${lightBackground ? "newtab--light" : ""}`}>
      {/* Brightness and blur are filters on this element, so they scale the actual pixels
          instead of laying a veil over them — see wallpaperFilterStyle. */}
      <div
        className="wallpaper"
        style={{
          ...(wallpaper.gradient
            ? { backgroundImage: wallpaper.gradient }
            : { backgroundImage: `url("${wallpaper.url}")` }),
          ...wallpaperFilterStyle(tuning),
        }}
      />
      <div className="scrim scrim--top" /><div className="scrim scrim--bottom" />
      <div className="newtab__content">
        <SearchBar />
        {/* No SortableContext: the grid is a static target for the whole drag, and every drop is
            resolved from the snapshot taken when it started. dropAnimation is off for the same
            reason — the tile has already moved to its new cell by the time the ghost lands, so
            flying the ghost back to where the drag began would animate to the wrong place. */}
        <DndContext sensors={sensors} onDragStart={dragStart} onDragMove={shortcutsApi.dragMove} onDragEnd={shortcutsApi.dragEnd} onDragCancel={shortcutsApi.resetDragState}>
          <section className={`shortcut-grid ${ready ? "shortcut-grid--ready" : ""} ${activeId ? "shortcut-grid--editing" : ""}`} aria-label="快捷链接">
            {shortcuts.map((item) => (
              <ShortcutTile
                key={item.id}
                item={item}
                onActivate={activate}
                onContextMenu={openItemMenu}
                dropMode={mergeReadyId === item.id ? (item.type === "folder" ? "folder" : "merge") : null}
                dropEdge={dropIndicator?.targetId === item.id ? dropIndicator.side : null}
              />
            ))}
            <AddTile onClick={() => setAddDialog(true)} />
          </section>
          <DragOverlay dropAnimation={null}>{activeItem ? <ShortcutGhost item={activeItem} /> : null}</DragOverlay>
        </DndContext>
        {siteAccess.showPrompt && (
          <SiteAccessPrompt onGrant={siteAccess.grant} onDismiss={siteAccess.dismiss} />
        )}
      </div>
      {backgroundMeta?.copyright && <a className="photo-credit" href={backgroundMeta.copyrightLink} title={backgroundMeta.copyright}>{backgroundMeta.title || "Bing 每日图"}</a>}
      <AddLinkDialog open={addDialog} onClose={() => setAddDialog(false)} onSubmit={addLink} />
      <AddLinkDialog open={Boolean(editorItem)} item={editorItem} onClose={() => setEditor(null)} onSubmit={saveEditedItem} />
      <FolderPanel
        folder={folderItem}
        tile={openFolder?.tile ?? null}
        onClose={() => setOpenFolder(null)}
        onItemContextMenu={openItemMenu}
        onExtract={(folderId, item) => shortcutsApi.moveItemOut({ folderId, itemId: item.id }, item)}
        onOpenItem={(item) => window.location.assign(item.url)}
      />
      <ItemContextMenu
        menu={contextMenu}
        item={menuItem}
        onClose={() => setContextMenu(null)}
        onEdit={startEditing}
        onMoveOut={moveMenuItemOut}
        onDissolve={dissolveMenuFolder}
        onDelete={deleteMenuItem}
      />
      <button className="settings-launcher" type="button" onClick={() => setSettingsOpen(true)} aria-label="设置">
        <GearSix size={20} weight="fill" />
      </button>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        wallpaperApi={wallpaperApi}
        shortcuts={shortcuts}
        siteAccess={siteAccess}
        onReplace={shortcutsApi.replaceAll}
        onMerge={shortcutsApi.mergeIn}
        notify={notify}
      />
      <div className={`toast ${notice ? "toast--visible" : ""}`} role="status">{notice}</div>
    </main>
  );
}
