import { Fragment, useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { AddLinkDialog } from "./components/AddLinkDialog";
import { FolderPanel } from "./components/FolderPanel";
import { GearSix, Plus } from "@phosphor-icons/react";
import { ItemContextMenu } from "./components/ItemContextMenu";
import { SearchBar } from "./components/SearchBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { SiteAccessPrompt } from "./components/SiteAccessPrompt";
import { AddTile, ShortcutGhost, ShortcutTile } from "./components/ShortcutTile";
import { useBingWallpaper } from "./hooks/useBingWallpaper";
import { useNotice } from "./hooks/useNotice";
import { useShortcuts } from "./hooks/useShortcuts";
import { useSiteAccess } from "./hooks/useSiteAccess";
import { useWallpaperDrift } from "./hooks/useWallpaperDrift";
import { Aurora } from "./components/Aurora";
import { needsDarkInk, wallpaperFilterStyle } from "./lib/background-cache-keys";
import { findItem } from "./lib/shortcuts-tree";
import { isCollapsed, isSection, sectionsOf } from "./lib/sections";
import { SectionDropCell, SectionHeading } from "./components/SectionHeading";

export function App({ initialWallpaper = null }) {
  const [notice, notify] = useNotice();
  const wallpaperApi = useBingWallpaper(notify, initialWallpaper);
  const { wallpaper, backgroundMeta, tuning, photoLuminance } = wallpaperApi;
  const shortcutsApi = useShortcuts(notify);
  const { shortcuts, ready, sensors, activeId, landedId, mergeReadyId, dropIndicator, sectionPlan, selection, band, carried } = shortcutsApi;
  const siteAccess = useSiteAccess(shortcuts, ready);
  // Drives `scale` and `translate` on the wallpaper layer from its own clamped clock, so a tab
  // coming back from hidden resumes instead of jumping. The seed identifies the picture, not the
  // visit: it decides which direction this wallpaper drifts, and it has to stay the same across
  // every tab showing the same wallpaper. See useWallpaperDrift.
  const driftRef = useWallpaperDrift(
    wallpaperApi.backgroundMeta?.startDate ?? wallpaperApi.wallpaper.gradientColors?.join("") ?? "",
  );

  const [addDialog, setAddDialog] = useState(false);
  const [editor, setEditor] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [openFolder, setOpenFolder] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The heading currently being renamed in place, by marker id.
  const [editingSection, setEditingSection] = useState(null);

  const active = shortcuts.find((item) => item.id === activeId) ?? null;
  // A section has no artwork and no URL, so handing it to ShortcutGhost drew a monogram tile for
  // it — a purple square captioned with the section's name, which is a link that does not exist.
  const activeItem = isSection(active) ? null : active;
  const activeSection = isSection(active) ? active : null;
  // The panel remembers where it was opened from so it can grow out of that tile; the folder
  // itself is re-read from state each render so edits inside it stay live.
  const folderItem = openFolder
    ? shortcuts.find((item) => item.id === openFolder.id && item.type === "folder") ?? null
    : null;
  const editorItem = findItem(shortcuts, editor);
  // One flat array in, render blocks out. The grid stays a single grid — see .section-heading
  // in styles.css for why splitting it into one grid per section would break the drag.
  const blocks = sectionsOf(shortcuts);
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

  function toggleMenuCollapse() {
    if (!contextMenu || !isSection(menuItem)) return;
    shortcutsApi.toggleSectionCollapse(contextMenu.itemId);
    setContextMenu(null);
  }

  function startEditing() {
    if (!contextMenu) return;
    // A heading has exactly one editable field and it is already on screen, so renaming one goes
    // back to the heading itself rather than opening the link dialog with everything hidden.
    if (isSection(menuItem)) {
      setEditingSection(contextMenu.itemId);
      setContextMenu(null);
      return;
    }
    setEditor({ itemId: contextMenu.itemId, folderId: contextMenu.folderId });
    setContextMenu(null);
  }

  function createSection() {
    setEditingSection(shortcutsApi.addSection());
  }

  function saveEditedItem(values) {
    shortcutsApi.saveEditedItem(editor, editorItem, values);
    setEditor(null);
  }

  function deleteMenuItem() {
    if (!contextMenu) return;
    if (isSection(menuItem)) shortcutsApi.deleteSection(contextMenu.itemId);
    else shortcutsApi.deleteItem(contextMenu);
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
          instead of laying a veil over them — see wallpaperFilterStyle. A solid background
          paints itself through <Aurora> rather than through this element's background-image,
          because it is three moving elements over a ramp rather than one flat gradient. */}
      <div
        ref={driftRef}
        className="wallpaper"
        style={{
          ...(wallpaper.gradient ? null : { backgroundImage: `url("${wallpaper.url}")` }),
          ...wallpaperFilterStyle(tuning),
        }}
      >
        {wallpaper.gradient && <Aurora colors={wallpaper.gradientColors} />}
      </div>
      {/* Two tint ramps. They are empty on purpose: three attempts at a progressive backdrop blur
          in these bands all shipped and all came back as bug reports, because a masked
          backdrop-filter crossfades a blurred copy over the sharp one rather than blurring it,
          and on a patterned photograph that crossfade is a double exposure. See .edge in
          styles.css for the full autopsy — and do not put layers back in here. */}
      <div className="edge edge--top" aria-hidden="true" />
      <div className="edge edge--bottom" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      {siteAccess.showPrompt && (
        <SiteAccessPrompt onGrant={siteAccess.grant} onDismiss={siteAccess.dismiss} />
      )}
      {/* The rubber band starts on the parts of the page that mean nothing — wallpaper, margins,
          the gaps between rows — and useSelection refuses anything that already means something
          when pressed. Nothing had to give up a gesture for this. */}
      <div className="newtab__content" onPointerDown={shortcutsApi.onBandPointerDown}>
        <SearchBar />
        {/* No SortableContext: the grid is a static target for the whole drag, and every drop is
            resolved from the snapshot taken when it started. dropAnimation is off for the same
            reason — the tile has already moved to its new cell by the time the ghost lands, so
            flying the ghost back to where the drag began would animate to the wrong place. */}
        <DndContext sensors={sensors} onDragStart={dragStart} onDragMove={shortcutsApi.dragMove} onDragEnd={shortcutsApi.dragEnd} onDragCancel={shortcutsApi.resetDragState}>
          <section className={`shortcut-grid ${ready ? "shortcut-grid--ready" : ""} ${activeId ? "shortcut-grid--editing" : ""}`} aria-label="快捷链接">
            {blocks.map((block, blockIndex) => (
              <Fragment key={block.marker?.id ?? "lead"}>
                {block.marker && (
                  <SectionHeading
                    section={block.marker}
                    index={block.markerIndex}
                    blockIndex={blockIndex}
                    count={block.tiles.length}
                    editing={editingSection === block.marker.id}
                    seamArmed={sectionPlan?.atSeam === blockIndex}
                    dropArmed={dropIndicator?.targetId === block.marker.id && isCollapsed(block.marker)}
                    onStartEdit={() => setEditingSection(block.marker.id)}
                    onCommit={(name) => {
                      shortcutsApi.renameSectionTo(block.marker.id, name);
                      setEditingSection(null);
                    }}
                    onCancel={() => setEditingSection(null)}
                    onContextMenu={(event) => openItemMenu(event, block.marker)}
                    onToggleCollapse={() => shortcutsApi.toggleSectionCollapse(block.marker.id)}
                  />
                )}
                {!isCollapsed(block.marker) && block.tiles.map(({ item, index }) => (
                  <ShortcutTile
                    key={item.id}
                    item={item}
                    index={index}
                    // Dimmed for two different reasons that mean the same thing: this tile is being
                    // carried. Either its section's heading is the thing being dragged, or it is one
                    // of the band the cursor picked up — and the passengers have to read as picked up
                    // too, or a three-tile drag looks like the other two stayed behind.
                    muted={activeId === block.marker?.id || (Boolean(activeId) && carried.includes(item.id))}
                    selected={selection.has(item.id)}
                    onActivate={activate}
                    onContextMenu={openItemMenu}
                    onToggleSelect={shortcutsApi.toggleSelected}
                    dropMode={mergeReadyId === item.id ? (item.type === "folder" ? "folder" : "merge") : null}
                    dropEdge={dropIndicator?.targetId === item.id ? dropIndicator.side : null}
                    landed={landedId === item.id}
                  />
                ))}
                {block.marker && !isCollapsed(block.marker) && block.tiles.length === 0 && (
                  <SectionDropCell section={block.marker} index={block.markerIndex + 1} armed={dropIndicator?.targetId === block.marker.id} />
                )}
                {/* One "+", at the very end of the grid, so a new link joins whichever section is
                    last — the same direction "新建分区" grows the page in. */}
                {blockIndex === blocks.length - 1 && (
                  <AddTile index={shortcuts.length} onClick={() => setAddDialog(true)} />
                )}
                {/* A full-width row inside the grid rather than a control under it. auto-fill
                    keeps its empty tracks, so the tiles hug the left of a track set that is
                    itself centred — meaning the grid's left rail moves with the window and
                    nothing outside the grid can line up with it. In here it always does.
                    Nearly transparent until pointed at: most people never divide the grid and
                    should not be paying a lit control for a feature they will not use, but it
                    still has to be findable, which a gesture-only entry point would not be. */}
                {blockIndex === blocks.length - 1 && (
                  <button className="section-add" type="button" onClick={createSection}>
                    {/* Also the anchor for the last seam - a section dropped past everything
                        lands here, and this row is the only thing always at the bottom. */}
                    <span className="section-seam" aria-hidden="true" data-armed={sectionPlan?.atSeam === blocks.length ? "" : undefined} />
                    <Plus size={13} weight="bold" aria-hidden="true" /><span>新建分区</span>
                  </button>
                )}
              </Fragment>
            ))}
          </section>
          <DragOverlay dropAnimation={null}>
            {activeItem && <ShortcutGhost item={activeItem} count={carried.length} />}
            {activeSection && (
              <span className="section-ghost">{activeSection.name || "未命名分区"}</span>
            )}
          </DragOverlay>
        </DndContext>
      </div>
      {band && (
        <div
          className="marquee"
          aria-hidden="true"
          style={{ left: band.left, top: band.top, width: band.width, height: band.height }}
        />
      )}
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
        onToggleCollapse={toggleMenuCollapse}
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
